import type { NextRequest } from "next/server";

import { handleRouteError, jsonError } from "@/lib/api/http";
import { driveForEvent } from "@/lib/drive-accounts";
import { authorizeMediaAccess } from "@/lib/media-access";
import { driveImageUrl } from "@/lib/media-urls";

export const runtime = "nodejs";

/**
 * GET /api/drive/thumb/:fileId?s=600
 *
 * Thumbnails for items that are not public on Drive yet (pending approval or
 * hidden). Approved items redirect to Google's image CDN.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await context.params;
    // `raw=1`: same-origin bytes even for approved items, so the browser can
    // draw them on a canvas (share frames, highlights video, photobook).
    const raw = request.nextUrl.searchParams.get("raw") === "1";
    const size = Math.min(Math.max(Number(request.nextUrl.searchParams.get("s")) || 600, 64), raw ? 2400 : 1600);
    const access = await authorizeMediaAccess(request, fileId);
    if (!access) return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");

    if (access.isPublic && !raw) {
      return Response.redirect(driveImageUrl(access.media.drive_file_id, size), 302);
    }

    const drive = await driveForEvent(access.event);
    const thumb = await drive.fetchThumbnail(access.media.drive_file_id, size);
    if (!thumb || !thumb.body) return jsonError(404, "NO_THUMBNAIL", "Önizleme henüz hazır değil.");
    return new Response(thumb.body, {
      status: 200,
      headers: {
        "Content-Type": thumb.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": raw && access.isPublic ? "private, max-age=3600" : "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError("drive:thumb", error);
  }
}
