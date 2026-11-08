import type { NextRequest } from "next/server";

import { handleRouteError, jsonError } from "@/lib/api/http";
import { DriveService } from "@/lib/drive";
import { authorizeMediaAccess } from "@/lib/media-access";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Open-ended ranges are capped so one serverless invocation stays short. */
const MAX_CHUNK_BYTES = 16 * 1024 * 1024;

function parseRange(header: string | null, total: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? total - 1 : Math.min(Number(match[2]), total - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) return "invalid";
  end = Math.min(end, start + MAX_CHUNK_BYTES - 1);
  return { start, end };
}

function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * GET /api/drive/stream/:fileId
 *
 * Range-aware proxy for video/audio playback and original-quality downloads.
 * Bytes are piped from Drive to the client without buffering.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await context.params;
    const access = await authorizeMediaAccess(request, fileId);
    if (!access) return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");
    const { media, isPublic } = access;

    const total = Number(media.size_bytes);
    const range = parseRange(request.headers.get("range"), total);
    if (range === "invalid") {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }

    const upstream = await DriveService.openStream(
      media.drive_file_id,
      range ? `bytes=${range.start}-${range.end}` : null,
    );
    if (upstream.status === 416) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }

    const download = request.nextUrl.searchParams.get("download") === "1";
    const headers = new Headers({
      "Content-Type": media.mime_type,
      "Accept-Ranges": "bytes",
      "Cache-Control": isPublic ? "public, max-age=3600" : "private, no-store",
      "Content-Disposition": contentDisposition(download ? "attachment" : "inline", media.original_name),
      "X-Content-Type-Options": "nosniff",
    });

    if (range && upstream.status === 206) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(upstream.body, { status: 206, headers });
    }
    headers.set("Content-Length", upstream.headers.get("content-length") ?? String(total));
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    return handleRouteError("drive:stream", error);
  }
}
