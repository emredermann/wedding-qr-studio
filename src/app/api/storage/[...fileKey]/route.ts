import { NextResponse, type NextRequest } from "next/server";

import { jsonError } from "@/lib/api/http";
import { classifyMimeType, detectMimeFromMagicBytes, normaliseMimeType } from "@/lib/media-config";
import {
  isCanonicalFileKey,
  readLocalStorageObject,
  verifyLocalStorageGetSignature,
  verifyLocalStoragePutSignature,
  writeLocalStorageObject,
} from "@/lib/r2";
import { checkRateLimit } from "@/lib/rate-limit";

function resolveKeyFromSegments(segments: string[]): string {
  return segments.map((s) => decodeURIComponent(s)).join("/");
}

/**
 * PUT /api/storage/[...fileKey]
 *
 * Built-in signed object upload endpoint when Cloudflare R2 credentials are not
 * configured. Enforces:
 *  - Canonical `albums/{albumId}/{uuid}.{ext}` key format (zero path traversal).
 *  - HMAC-SHA256 signature verification & `< 300s` expiry (`exp`, `len`, `type`, `sig`).
 *  - Exact byte length and magic-byte header verification before writing to disk.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ fileKey: string[] }> },
) {
  const rateLimit = checkRateLimit(request, {
    namespace: "storage:put",
    limit: 90,
    windowSeconds: 60,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { fileKey: segments } = await params;
  const key = resolveKeyFromSegments(segments);
  if (!isCanonicalFileKey(key)) {
    return jsonError(400, "BAD_REQUEST", "Invalid storage key.");
  }

  const search = request.nextUrl.searchParams;
  const exp = Number(search.get("exp") ?? "0");
  const expectedLength = Number(search.get("len") ?? "0");
  const signedType = normaliseMimeType(search.get("type") ?? "");
  const sig = search.get("sig") ?? "";

  if (
    !signedType ||
    !classifyMimeType(signedType) ||
    !Number.isFinite(expectedLength) ||
    expectedLength <= 0 ||
    !verifyLocalStoragePutSignature({
      key,
      contentType: signedType,
      contentLength: expectedLength,
      expiresAtUnix: exp,
      signature: sig,
    })
  ) {
    return jsonError(403, "FORBIDDEN", "Invalid or expired signed upload URL.");
  }

  try {
    const arrayBuffer = await request.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.byteLength !== expectedLength) {
      return jsonError(
        422,
        "UPLOAD_MISMATCH",
        `Uploaded byte count (${bytes.byteLength}) did not match signed length (${expectedLength}).`,
      );
    }

    const detected = detectMimeFromMagicBytes(bytes.subarray(0, 64), signedType);
    if (!detected || classifyMimeType(signedType) !== detected.mediaType) {
      return jsonError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Uploaded binary header (magic bytes) does not match a whitelisted media type.",
      );
    }

    await writeLocalStorageObject({
      key,
      bytes,
      contentType: detected.mimeType,
    });

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("[storage:put] failed to store object", error);
    return jsonError(500, "INTERNAL_ERROR", "Could not store uploaded file.");
  }
}

/**
 * GET /api/storage/[...fileKey]
 *
 * Serves a locally stored media object only when presented with a valid,
 * un-expired (`< 300s`) HMAC-SHA256 presigned GET signature.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileKey: string[] }> },
) {
  const rateLimit = checkRateLimit(request, {
    namespace: "storage:get",
    limit: 180,
    windowSeconds: 60,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { fileKey: segments } = await params;
  const key = resolveKeyFromSegments(segments);
  if (!isCanonicalFileKey(key)) {
    return jsonError(400, "BAD_REQUEST", "Invalid storage key.");
  }

  const search = request.nextUrl.searchParams;
  const exp = Number(search.get("exp") ?? "0");
  const sig = search.get("sig") ?? "";

  if (
    !verifyLocalStorageGetSignature({
      key,
      expiresAtUnix: exp,
      signature: sig,
    })
  ) {
    return jsonError(403, "FORBIDDEN", "Invalid or expired signed media URL.");
  }

  const stored = await readLocalStorageObject(key);
  if (!stored) {
    return jsonError(404, "NOT_FOUND", "Media object not found.");
  }

  return new NextResponse(new Uint8Array(stored.bytes), {
    status: 200,
    headers: {
      "Content-Type": stored.contentType,
      "Content-Length": String(stored.bytes.byteLength),
      "Cache-Control": "private, max-age=240",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
