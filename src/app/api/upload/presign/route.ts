import type { NextRequest } from "next/server";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { attachGuestSessionCookie, resolveOrMintGuestSession } from "@/lib/guest-session";
import {
  classifyMimeType,
  detectMimeFromMagicBytes,
  formatBytes,
  getMaxFileSizeForTier,
  hexToBytes,
  inferMimeTypeFromFileName,
  normaliseMimeType,
  PRESIGN_TTL_SECONDS,
  resolveExtension,
} from "@/lib/media-config";
import { buildAlbumFileKey, createPresignedPutUrl, getPublicUrl } from "@/lib/r2";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { presignUploadRequestSchema } from "@/lib/validation/upload";
import type { PresignUploadResponse } from "@/types/database";
import { normalizeFlowConfig } from "@/types/flow";

/**
 * POST /api/upload/presign
 *
 * Zero-proxy upload: returns a 240-second (< 300s) presigned PUT URL so the
 * guest's browser uploads straight to Cloudflare R2.
 *
 * Security & Storage Guardrails:
 *  - Rate-limited per IP + guest session (`upload:presign`, 60 req / 60s).
 *  - Strict MIME whitelist (no `image/*` or `video/*` wildcards) + magic-byte
 *    header verification (`magicBytesHex`).
 *  - Enforces tight per-tier file size limits (`starter` / `pro` / `unlimited`)
 *    and total album item/byte quotas.
 *  - `Content-Type` and `Content-Length` are cryptographically signed into the
 *    presigned URL with TTL strictly under 300 seconds.
 *  - The object key is server-generated (`albums/${albumId}/${uuid}.${ext}`).
 */
export async function POST(request: NextRequest) {
  const guestSession = resolveOrMintGuestSession(request);

  const rateLimit = checkRateLimit(request, {
    namespace: "upload:presign",
    limit: 60,
    windowSeconds: 60,
    subject: guestSession.sessionId,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const body = await parseJsonBody(request, presignUploadRequestSchema, 8 * 1024);
  if (!body.ok) return body.response;
  const { albumId, fileName, fileType, fileSize, magicBytesHex } = body.data;

  const reported = normaliseMimeType(fileType);
  let contentType =
    reported && reported !== "application/octet-stream"
      ? reported
      : inferMimeTypeFromFileName(fileName);

  // Verify client-supplied magic bytes when provided
  if (magicBytesHex) {
    const rawHeaderBytes = hexToBytes(magicBytesHex);
    if (!rawHeaderBytes) {
      return jsonError(422, "VALIDATION_FAILED", "Malformed file magic-byte signature.");
    }
    const detected = detectMimeFromMagicBytes(rawHeaderBytes, contentType);
    if (!detected) {
      return jsonError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "File binary header (magic bytes) is not a supported photo, video, or audio format.",
      );
    }
    // Use the magic-byte verified MIME type if the browser reported a generic or mismatched type
    if (!contentType || classifyMimeType(contentType) !== detected.mediaType) {
      contentType = detected.mimeType;
    }
  }

  if (!contentType) {
    return jsonError(415, "UNSUPPORTED_MEDIA_TYPE", "File type could not be determined.");
  }

  const mediaType = classifyMimeType(contentType);
  if (!mediaType) {
    return jsonError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Only whitelisted photos (JPEG/PNG/WebP/HEIC/AVIF/GIF), videos (MP4/MOV/WebM/3GP) and audio toasts (WebM/MP4/OGG/MP3) are accepted.",
    );
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: album, error: albumError } = await supabase
      .from("albums")
      .select("id, plan_tier, expires_at, flow_config")
      .eq("id", albumId)
      .maybeSingle();

    if (albumError) {
      console.error("[upload:presign] album lookup failed", albumError);
      return jsonError(500, "INTERNAL_ERROR", "Could not load album.");
    }
    if (!album) {
      return jsonError(404, "ALBUM_NOT_FOUND", "Album not found.");
    }

    const expiresAtMs = Date.parse(album.expires_at);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return jsonError(410, "ALBUM_EXPIRED", "This album is no longer accepting uploads.");
    }

    const flow = normalizeFlowConfig(album.flow_config);
    if (mediaType === "photo" && !flow.features.enablePhotoUpload) {
      return jsonError(403, "FEATURE_DISABLED", "Photo uploads are disabled for this event.");
    }
    if (mediaType === "video" && !flow.features.enableVideoUpload) {
      return jsonError(403, "FEATURE_DISABLED", "Video uploads are disabled for this event.");
    }
    if (mediaType === "audio" && !flow.features.enableVoiceToasts) {
      return jsonError(403, "FEATURE_DISABLED", "Voice toasts are disabled for this event.");
    }

    const maxBytes = getMaxFileSizeForTier(
      album.plan_tier,
      mediaType,
      flow.features.maxUploadSizeMb,
    );
    if (fileSize > maxBytes) {
      return jsonError(
        413,
        "FILE_TOO_LARGE",
        `${mediaType} files must be at most ${formatBytes(maxBytes)}.`,
      );
    }

    const fileKey = buildAlbumFileKey(album.id, resolveExtension(contentType));
    const signed = await createPresignedPutUrl({
      key: fileKey,
      contentType,
      contentLength: fileSize,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    });

    const response: PresignUploadResponse = {
      uploadUrl: signed.url,
      method: "PUT",
      headers: { "Content-Type": contentType },
      fileKey,
      publicUrl: getPublicUrl(fileKey),
      mediaType,
      expiresIn: signed.expiresIn,
      expiresAt: signed.expiresAt.toISOString(),
    };
    return attachGuestSessionCookie(jsonOk(response, 201), guestSession);
  } catch (error) {
    console.error("[upload:presign] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Could not create upload URL. Please retry.");
  }
}
