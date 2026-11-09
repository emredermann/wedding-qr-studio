import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { driveForEvent } from "@/lib/drive-accounts";
import { findEventBySlug } from "@/lib/events";
import { resolveGuestSession, withGuestCookie } from "@/lib/guest-session";
import {
  classifyMimeType,
  detectMimeFromMagicBytes,
  formatBytes,
  inferMimeTypeFromFileName,
  MAX_FILE_SIZE_BYTES,
  normaliseMimeType,
} from "@/lib/media-config";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { signToken } from "@/lib/signing";
import { checkDriveSpace, reserveUploadQuota } from "@/lib/upload-quota";
import { type UploadTokenPayload } from "@/lib/upload-token";
import type { UploadSessionResponse } from "@/types/domain";

export const runtime = "nodejs";

const schema = z.object({
  eventSlug: z.string().trim().min(3).max(64),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .transform((v) => v.replace(/[\u0000-\u001f\u007f/\\]/g, "_")),
  mimeType: z.string().trim().max(255).default(""),
  sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  magicBytesHex: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{16,128}$/)
    .optional(),
  guestName: z.string().trim().max(80).optional(),
  isGuestbook: z.boolean().default(false),
});

const UPLOAD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function stripTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function firstHeaderValue(request: NextRequest, name: string): string | null {
  const raw = request.headers.get(name);
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first ? first : null;
}

/** Adds both the `www.` and the bare-host variant of an absolute URL origin. */
function addWwwVariants(allowed: Set<string>, value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    const port = url.port ? `:${url.port}` : "";
    allowed.add(`${url.protocol}//${url.hostname}${port}`);
    if (url.hostname.startsWith("www.")) {
      allowed.add(`${url.protocol}//${url.hostname.slice(4)}${port}`);
    } else {
      allowed.add(`${url.protocol}//www.${url.hostname}${port}`);
    }
  } catch {
    // Geçersiz URL biçimi — yok sayılır.
  }
}

/**
 * Resolves the browser Origin if it belongs to this app. Behind a reverse proxy
 * (Render, Railway, Cloudflare, Nginx) `request.nextUrl.origin` may be the
 * internal container address, so the public origin is rebuilt from the
 * forwarded headers as well; `NEXT_PUBLIC_APP_URL` is accepted with and
 * without the `www.` prefix.
 */
function allowedOrigin(request: NextRequest): string | null {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return null;
  const origin = stripTrailingSlash(rawOrigin);
  if (!origin) return null;

  const allowed = new Set<string>([stripTrailingSlash(request.nextUrl.origin)]);

  const host = firstHeaderValue(request, "x-forwarded-host") ?? firstHeaderValue(request, "host");
  const proto = (firstHeaderValue(request, "x-forwarded-proto") ?? request.nextUrl.protocol.replace(/:$/, "")).toLowerCase();
  if (host && (proto === "http" || proto === "https") && /^[a-z0-9.\-]+(:\d+)?$/i.test(host)) {
    allowed.add(`${proto}://${host.toLowerCase()}`);
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL ? stripTrailingSlash(process.env.NEXT_PUBLIC_APP_URL) : "";
  if (configured) {
    allowed.add(configured);
    addWwwVariants(allowed, configured);
  }

  return allowed.has(origin) || allowed.has(origin.toLowerCase()) ? origin : null;
}

function timestampPrefix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

/**
 * POST /api/drive/upload-session
 *
 * Step A of the direct-to-Drive upload. Validates the file, then opens a
 * Google Drive resumable session (with the browser's Origin, so Google answers
 * the browser's PUT with CORS headers) and returns its one-time URI. File
 * bytes never pass through this server — no 4.5 MB payload limit, no RAM cost.
 */
export async function POST(request: NextRequest) {
  try {
    const guest = resolveGuestSession(request);
    const limited = await rateLimit(request, "upload-session", 120, 60, guest.sessionId);
    if (limited) return limited;

    const origin = allowedOrigin(request);
    if (!origin) return jsonError(403, "ORIGIN_NOT_ALLOWED", "Bu istek yalnızca uygulamanın kendi sayfasından yapılabilir.");

    const body = await parseJsonBody(request, schema, 8 * 1024);
    if (!body.ok) return body.response;
    const { eventSlug, fileName, sizeBytes, magicBytesHex, guestName, isGuestbook } = body.data;

    let mimeType = normaliseMimeType(body.data.mimeType) ?? "";
    if (!mimeType || mimeType === "application/octet-stream") {
      mimeType = inferMimeTypeFromFileName(fileName) ?? "";
    }
    if (magicBytesHex) {
      const detected = detectMimeFromMagicBytes(hexToBytes(magicBytesHex), mimeType || null);
      if (!detected) {
        return jsonError(415, "UNSUPPORTED_MEDIA_TYPE", "Bu dosya türü desteklenmiyor (fotoğraf, video veya ses yükleyin).");
      }
      if (!mimeType || classifyMimeType(mimeType) !== detected.mediaType) mimeType = detected.mimeType;
    }
    const kind = mimeType ? classifyMimeType(mimeType) : null;
    if (!kind) {
      return jsonError(415, "UNSUPPORTED_MEDIA_TYPE", "Desteklenen türler: JPEG, PNG, WebP, HEIC, AVIF, GIF, MP4, MOV, WebM, 3GP, M4A, MP3, OGG.");
    }
    if (sizeBytes > MAX_FILE_SIZE_BYTES[kind]) {
      return jsonError(413, "FILE_TOO_LARGE", `Bu dosya çok büyük. En fazla ${formatBytes(MAX_FILE_SIZE_BYTES[kind])} yükleyebilirsiniz.`);
    }

    const event = await findEventBySlug(eventSlug);
    if (!event) return jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.");
    if (isGuestbook ? !event.guestbook_enabled : !event.uploads_enabled) {
      return jsonError(403, "UPLOADS_CLOSED", "Etkinlik sahibi şu anda yüklemeleri kapattı.");
    }

    const drive = await driveForEvent(event);
    const noSpace = await checkDriveSpace(drive, sizeBytes);
    if (noSpace) return withGuestCookie(noSpace, guest);
    const overQuota = await reserveUploadQuota({
      eventId: event.id,
      sessionId: guest.sessionId,
      ip: clientIp(request),
      sizeBytes,
    });
    if (overQuota) return withGuestCookie(overQuota, guest);

    const folderId =
      kind === "photo" ? event.drive_photos_folder_id : kind === "video" ? event.drive_videos_folder_id : event.drive_voice_folder_id;
    const uploadId = randomUUID();
    const safeGuest = (guestName ?? "").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 40).replace(/\s+/g, "_");
    const driveName = [timestampPrefix(), safeGuest || null, isGuestbook ? "AniDefteri" : null, fileName]
      .filter(Boolean)
      .join("_");

    const uploadUrl = await drive.createResumableSession({
      name: driveName,
      mimeType,
      sizeBytes,
      parentId: folderId,
      origin,
      appProperties: { eqrUploadId: uploadId, eqrEventId: event.id },
      description: guestName ? `Yükleyen: ${guestName}` : undefined,
    });
    drive.noteReservedBytes(sizeBytes);

    const payload: UploadTokenPayload = {
      u: uploadId,
      e: event.id,
      f: folderId,
      s: sizeBytes,
      m: mimeType,
      k: kind,
      g: guest.sessionId,
      b: isGuestbook,
      n: fileName,
      x: Date.now() + UPLOAD_TOKEN_TTL_MS,
    };

    const response: UploadSessionResponse = {
      uploadUrl,
      uploadToken: signToken("upload", payload),
      kind,
      mimeType,
    };
    return withGuestCookie(jsonOk(response, 201), guest);
  } catch (error) {
    return handleRouteError("drive:upload-session", error);
  }
}
