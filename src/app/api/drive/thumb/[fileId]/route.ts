import type { NextRequest } from "next/server";

import { handleRouteError, jsonError } from "@/lib/api/http";
import { DriveService } from "@/lib/drive";
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
    const size = Math.min(Math.max(Number(request.nextUrl.searchParams.get("s")) || 600, 64), 1600);
    const access = await authorizeMediaAccess(request, fileId);
    if (!access) return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");

    if (access.isPublic) {
      return Response.redirect(driveImageUrl(access.media.drive_file_id, size), 302);
    }

    const thumb = await DriveService.fetchThumbnail(access.media.drive_file_id, size);
    if (!thumb || !thumb.body) return jsonError(404, "NO_THUMBNAIL", "Önizleme henüz hazır değil.");
    return new Response(thumb.body, {
      status: 200,
      headers: {
        "Content-Type": thumb.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError("drive:thumb", error);
  }
}
