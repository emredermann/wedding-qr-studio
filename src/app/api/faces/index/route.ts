import type { NextRequest } from "next/server";
import { z } from "zod";

import { getDatabaseErrorCode, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedActor, verifyAlbumManagerAccess } from "@/lib/auth";
import { getVerifiedGuestSession } from "@/lib/guest-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { FACE_EMBEDDING_DIMENSIONS, toVectorString } from "@/lib/vector";
import type { IndexFacesResponse, MediaFaceInsert } from "@/types/database";

const MAX_FACES_PER_PHOTO = 25;
const MAX_INDEX_WINDOW_MS = 15 * 60 * 1000; // 15 minutes from upload completion

const indexFacesSchema = z.object({
  albumId: z.uuid(),
  mediaId: z.uuid(),
  embeddings: z
    .array(z.array(z.number().finite()).length(FACE_EMBEDDING_DIMENSIONS))
    .min(1)
    .max(MAX_FACES_PER_PHOTO),
});

/**
 * POST /api/faces/index
 *
 * Stores 128-d face embeddings extracted client-side from an uploaded photo
 * into `public.media_faces`.
 *
 * Anti-Poisoning Guardrails:
 *  - Rate-limited (`faces:index`, 30 req / 60s).
 *  - Caller must either own the verified guest session that uploaded the photo
 *    (`media.guest_session_id === verifiedSession.sessionId`) within the last
 *    15 minutes, or be an authenticated manager of the album.
 *  - Each photo may only be indexed ONCE (`faces_indexed_at` / existing face count check)
 *    and is capped at 25 faces.
 */
export async function POST(request: NextRequest) {
  const verifiedSession = getVerifiedGuestSession(request);

  const rateLimit = checkRateLimit(request, {
    namespace: "faces:index",
    limit: 30,
    windowSeconds: 60,
    subject: verifiedSession?.sessionId ?? null,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody(request, indexFacesSchema, 128 * 1024);
  if (!parsed.ok) return parsed.response;
  const { albumId, mediaId, embeddings } = parsed.data;

  let rows: MediaFaceInsert[];
  try {
    rows = embeddings.map((vector) => ({
      album_id: albumId,
      media_id: mediaId,
      embedding: toVectorString(vector),
    }));
  } catch (err) {
    return jsonError(
      422,
      "VALIDATION_FAILED",
      err instanceof Error ? err.message : "Invalid face embedding vector.",
    );
  }

  try {
    const supabase = getSupabaseAdminClient();

    const { data: media, error: mediaError } = await supabase
      .from("media")
      .select("id, album_id, media_type, guest_session_id, created_at")
      .eq("id", mediaId)
      .eq("album_id", albumId)
      .maybeSingle();

    if (mediaError) {
      console.error("[faces:index] media lookup failed", mediaError);
      return jsonError(500, "INTERNAL_ERROR", "Could not verify media item.");
    }
    if (!media || media.media_type !== "photo") {
      return jsonError(404, "NOT_FOUND", "Photo not found in this album.");
    }

    // Verify caller authorization: must be the uploading guest session or an album manager
    const isUploadingGuest =
      Boolean(verifiedSession?.sessionId) &&
      Boolean(media.guest_session_id) &&
      media.guest_session_id === verifiedSession?.sessionId;

    if (!isUploadingGuest) {
      const actor = await getAuthenticatedActor();
      const access = actor ? await verifyAlbumManagerAccess(albumId, actor) : null;
      if (!access?.allowed) {
        return jsonError(
          403,
          "FORBIDDEN",
          "Only the uploading guest session or an event host may index faces for this photo.",
        );
      }
    } else {
      const createdAtMs = Date.parse(media.created_at);
      if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > MAX_INDEX_WINDOW_MS) {
        return jsonError(403, "FORBIDDEN", "Face indexing window for this upload has expired.");
      }
    }

    // Prevent duplicate/repeated face indexing on the same photo (vector table poisoning)
    const { count: existingCount, error: countError } = await supabase
      .from("media_faces")
      .select("id", { count: "exact", head: true })
      .eq("media_id", mediaId);

    if (countError) {
      console.error("[faces:index] existing faces count failed", countError);
      return jsonError(500, "INTERNAL_ERROR", "Could not verify face index state.");
    }
    if ((existingCount ?? 0) > 0) {
      return jsonError(409, "CONFLICT", "Faces have already been indexed for this photo.");
    }

    const { error: insertError } = await supabase.from("media_faces").insert(rows);
    if (insertError) {
      const dbCode = getDatabaseErrorCode(insertError);
      if (dbCode === "MEDIA_FACES_CAP_REACHED") {
        return jsonError(422, "VALIDATION_FAILED", "Maximum face count per photo reached.");
      }
      console.error("[faces:index] insert failed", insertError);
      return jsonError(500, "INTERNAL_ERROR", "Could not save face embeddings.");
    }

    const response: IndexFacesResponse = { indexedCount: rows.length };
    return jsonOk(response, 201);
  } catch (error) {
    console.error("[faces:index] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to index face embeddings.");
  }
}
