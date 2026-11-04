import type { NextRequest } from "next/server";
import { z } from "zod";

import { getDatabaseErrorCode, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { attachGuestSessionCookie, resolveOrMintGuestSession } from "@/lib/guest-session";
import { createPresignedGetUrl, getPublicUrl } from "@/lib/r2";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { FACE_EMBEDDING_DIMENSIONS, toVectorString } from "@/lib/vector";
import type { GuestFaceMatch, MatchFacesResponse } from "@/types/database";
import { normalizeFlowConfig } from "@/types/flow";

const DEFAULT_FACE_MATCH_THRESHOLD = 0.82;
const MIN_FACE_MATCH_THRESHOLD = 0.78;

const matchFacesSchema = z.object({
  albumId: z.uuid(),
  embedding: z.array(z.number().finite()).length(FACE_EMBEDDING_DIMENSIONS),
  threshold: z.number().min(0.5).max(0.99).optional(),
});

/**
 * POST /api/faces/match
 *
 * Biometric Face Gate for Guests:
 *  - Rate-limited (`faces:match`, 15 req / 60s per IP + guest session).
 *  - Calls the `match_guest_faces` pgvector RPC to return ONLY the exact
 *    subset of visible photos in `albumId` containing the guest's 128-d face
 *    descriptor above the cosine similarity threshold (>= 0.78, default 0.82).
 *  - Raw selfie frames never leave the browser; only the 128-d float vector is
 *    evaluated in-memory and never persisted.
 */
export async function POST(request: NextRequest) {
  const guestSession = resolveOrMintGuestSession(request);

  const rateLimit = checkRateLimit(request, {
    namespace: "faces:match",
    limit: 15,
    windowSeconds: 60,
    subject: guestSession.sessionId,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody(request, matchFacesSchema, 32 * 1024);
  if (!parsed.ok) return parsed.response;
  const { albumId, embedding, threshold } = parsed.data;
  const effectiveThreshold = Math.min(
    0.99,
    Math.max(MIN_FACE_MATCH_THRESHOLD, threshold ?? DEFAULT_FACE_MATCH_THRESHOLD),
  );

  let vectorLiteral: string;
  try {
    vectorLiteral = toVectorString(embedding);
  } catch (err) {
    return jsonError(
      422,
      "VALIDATION_FAILED",
      err instanceof Error ? err.message : "Invalid face embedding.",
    );
  }

  try {
    const supabase = getSupabaseAdminClient();

    const { data: album, error: albumError } = await supabase
      .from("albums")
      .select("id, privacy_mode, reveal_at, expires_at, flow_config")
      .eq("id", albumId)
      .maybeSingle();

    if (albumError || !album) {
      return jsonError(404, "ALBUM_NOT_FOUND", "Album not found.");
    }

    const now = Date.now();
    if (Date.parse(album.expires_at) <= now) {
      return jsonError(410, "ALBUM_EXPIRED", "This album has expired.");
    }

    const flow = normalizeFlowConfig(album.flow_config);
    if (!flow.features.enableFaceRecognition) {
      return jsonError(
        403,
        "FEATURE_DISABLED",
        "Biometric face search is disabled for this event.",
      );
    }

    if (
      album.privacy_mode === "private" ||
      (album.reveal_at !== null && Date.parse(album.reveal_at) > now)
    ) {
      return jsonError(403, "FORBIDDEN", "This gallery is currently locked.");
    }

    const { data, error } = await supabase.rpc("match_guest_faces", {
      query_embedding: vectorLiteral,
      target_album_id: albumId,
      match_threshold: effectiveThreshold,
      match_count: 100,
    });

    if (error) {
      const code = getDatabaseErrorCode(error);
      if (code === "ALBUM_NOT_ACCESSIBLE") {
        return jsonError(403, "FORBIDDEN", "Gallery face search is not available for this album.");
      }
      console.error("[faces:match] RPC error", error);
      return jsonError(500, "INTERNAL_ERROR", "Could not run face search.");
    }

    const rawRows = data ?? [];
    const matches: GuestFaceMatch[] = await Promise.all(
      rawRows.map(async (row) => {
        const rawRow = row as GuestFaceMatch & { file_url?: string; guest_name?: string | null };
        const fallbackUrl = rawRow.file_url || getPublicUrl(row.file_key);
        const signedUrl = await createPresignedGetUrl(row.file_key, fallbackUrl);
        return {
          media_id: row.media_id,
          file_key: row.file_key,
          file_url: signedUrl,
          media_type: row.media_type,
          category: row.category,
          guest_name: null,
          created_at: row.created_at,
          similarity: row.similarity,
        };
      }),
    );

    const response: MatchFacesResponse = { matches };
    return attachGuestSessionCookie(jsonOk(response), guestSession);
  } catch (error) {
    console.error("[faces:match] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Unexpected error during face search.");
  }
}
