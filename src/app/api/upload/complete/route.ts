import { after, type NextRequest } from "next/server";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  attachGuestSessionCookie,
  getVerifiedGuestSession,
  resolveOrMintGuestSession,
} from "@/lib/guest-session";
import {
  classifyMimeType,
  detectMimeFromMagicBytes,
  getMaxFileSizeForTier,
  normaliseMimeType,
} from "@/lib/media-config";
import { getPaymentSigningSecret, signWebhookPayload } from "@/lib/payments";
import {
  deleteR2Object,
  getPublicUrl,
  headR2Object,
  isFileKeyForAlbum,
  readR2ObjectMagicBytes,
} from "@/lib/r2";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { completeUploadRequestSchema } from "@/lib/validation/upload";
import type { CompleteUploadResponse, Media } from "@/types/database";
import { normalizeFlowConfig } from "@/types/flow";

const MEDIA_COLUMNS =
  "id, album_id, file_key, file_url, media_type, mime_type, size_bytes, guest_name, guest_session_id, category, phash, is_hidden, created_at" as const;

async function discardObject(fileKey: string): Promise<void> {
  try {
    await deleteR2Object(fileKey);
  } catch (error) {
    console.error("[upload:complete] failed to delete rejected object", { fileKey, error });
  }
}

/**
 * POST /api/upload/complete
 *
 * Called by the browser after its direct PUT to R2 succeeds. Registers the
 * object as a `media` row after verifying:
 *  1. Rate limit (`upload:complete`, 60 req/60s) & signed guest session cookie.
 *  2. `fileKey` belongs to `albumId` with zero path traversal tokens.
 *  3. R2 HEAD object size & MIME type match the album tier's limits.
 *  4. R2 Range-Read (`bytes=0-63`) magic-byte inspection confirms the binary
 *     payload is a genuine image/video/audio container matching `mediaType`.
 */
export async function POST(request: NextRequest) {
  const existingSession = getVerifiedGuestSession(request);
  const guestSession = existingSession ?? resolveOrMintGuestSession(request);

  const rateLimit = checkRateLimit(request, {
    namespace: "upload:complete",
    limit: 60,
    windowSeconds: 60,
    subject: guestSession.sessionId,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const body = await parseJsonBody(request, completeUploadRequestSchema, 8 * 1024);
  if (!body.ok) return body.response;
  const { albumId, fileKey, guestName, guestSessionId, category, phash } = body.data;

  // Prevent guest_session_id spoofing: if the client holds a verified session cookie
  // and passes a different session ID in the body, reject the forged identifier.
  if (existingSession && guestSessionId && guestSessionId !== existingSession.sessionId) {
    return jsonError(403, "FORBIDDEN", "Guest session token mismatch.");
  }
  const canonicalSessionId = guestSession.sessionId;

  if (!isFileKeyForAlbum(fileKey, albumId)) {
    return jsonError(422, "VALIDATION_FAILED", "fileKey does not belong to this album.");
  }

  try {
    const supabase = getSupabaseAdminClient();

    const { data: existing, error: existingError } = await supabase
      .from("media")
      .select(MEDIA_COLUMNS)
      .eq("file_key", fileKey)
      .maybeSingle();
    if (existingError) {
      console.error("[upload:complete] media lookup failed", existingError);
      return jsonError(500, "INTERNAL_ERROR", "Could not register upload.");
    }
    if (existing) {
      if (existing.guest_session_id && existing.guest_session_id !== canonicalSessionId) {
        return jsonError(403, "FORBIDDEN", "This upload belongs to another guest session.");
      }
      const response: CompleteUploadResponse = { media: existing, created: false };
      return attachGuestSessionCookie(jsonOk(response), guestSession);
    }

    const { data: album, error: albumError } = await supabase
      .from("albums")
      .select("id, plan_tier, expires_at, flow_config")
      .eq("id", albumId)
      .maybeSingle();
    if (albumError) {
      console.error("[upload:complete] album lookup failed", albumError);
      return jsonError(500, "INTERNAL_ERROR", "Could not load album.");
    }
    if (!album) {
      await discardObject(fileKey);
      return jsonError(404, "ALBUM_NOT_FOUND", "Album not found.");
    }
    if (Date.parse(album.expires_at) <= Date.now()) {
      await discardObject(fileKey);
      return jsonError(410, "ALBUM_EXPIRED", "This album is no longer accepting uploads.");
    }

    const head = await headR2Object(fileKey);
    if (!head) {
      return jsonError(409, "UPLOAD_NOT_FOUND", "File has not been received by storage yet.");
    }

    const flow = normalizeFlowConfig(album.flow_config);
    const mimeType = head.contentType ? normaliseMimeType(head.contentType) : null;
    const mediaType = mimeType ? classifyMimeType(mimeType) : null;
    const maxBytes = mediaType
      ? getMaxFileSizeForTier(album.plan_tier, mediaType, flow.features.maxUploadSizeMb)
      : 0;

    if (!mimeType || !mediaType || head.contentLength <= 0 || head.contentLength > maxBytes) {
      console.warn("[upload:complete] rejected stored object metadata", { fileKey, head });
      await discardObject(fileKey);
      return jsonError(422, "UPLOAD_MISMATCH", "Stored file failed validation and was removed.");
    }

    // Verify stored binary magic bytes in R2 to defeat extension/MIME spoofing
    const magicBytes = await readR2ObjectMagicBytes(fileKey, 64);
    const detectedMagic = magicBytes ? detectMimeFromMagicBytes(magicBytes, mimeType) : null;
    if (!detectedMagic || detectedMagic.mediaType !== mediaType) {
      console.warn("[upload:complete] rejected stored object magic bytes", {
        fileKey,
        mimeType,
        detectedMagic,
      });
      await discardObject(fileKey);
      return jsonError(
        422,
        "UPLOAD_MISMATCH",
        "Stored file binary signature (magic bytes) did not match the declared media type and was removed.",
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("media")
      .insert({
        album_id: album.id,
        file_key: fileKey,
        file_url: getPublicUrl(fileKey),
        media_type: mediaType,
        mime_type: detectedMagic.mimeType,
        size_bytes: head.contentLength,
        guest_name: guestName,
        guest_session_id: canonicalSessionId,
        category,
        phash,
        is_hidden: flow.features.requireModerationBeforePublic,
      })
      .select(MEDIA_COLUMNS)
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: raced, error: racedError } = await supabase
          .from("media")
          .select(MEDIA_COLUMNS)
          .eq("file_key", fileKey)
          .single();
        if (!racedError && raced) {
          const response: CompleteUploadResponse = { media: raced, created: false };
          return attachGuestSessionCookie(jsonOk(response), guestSession);
        }
        console.error("[upload:complete] re-read after conflict failed", racedError);
      } else {
        console.error("[upload:complete] insert failed", insertError);
      }
      return jsonError(500, "INTERNAL_ERROR", "Could not register upload.");
    }

    const media: Media = inserted;

    if (media.media_type === "photo") {
      const origin = request.nextUrl.origin;
      after(async () => {
        try {
          const payload = JSON.stringify({
            mediaId: media.id,
            albumId: media.album_id,
            fileUrl: media.file_url,
            clientPhash: media.phash,
          });
          const timestamp = Math.floor(Date.now() / 1000);
          const signature = signWebhookPayload(payload, timestamp, getPaymentSigningSecret());

          await fetch(`${origin}/api/webhooks/process-media`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Webhook-Signature": signature,
            },
            body: payload,
          });
        } catch (err) {
          console.warn("[upload:complete] background AI processing trigger warning", err);
        }
      });
    }

    const response: CompleteUploadResponse = { media, created: true };
    return attachGuestSessionCookie(jsonOk(response, 201), guestSession);
  } catch (error) {
    console.error("[upload:complete] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Unexpected server error.");
  }
}
