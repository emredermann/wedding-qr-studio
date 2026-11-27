import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { trashBestEffort } from "@/lib/drive";
import { driveForEvent } from "@/lib/drive-accounts";
import { toMediaDto } from "@/lib/events";
import { loadOwnedChild } from "@/lib/host-ownership";
import { getAdminDb } from "@/lib/supabase/server";
import { MEDIA_STATUSES, type MediaDto, type MediaItemRow } from "@/types/domain";
import { mediaColumns } from "@/lib/schema-features";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ mediaId: string }> };

const patchSchema = z
  .object({
    status: z.enum(MEDIA_STATUSES).optional(),
    category: z.string().trim().max(40).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.category !== undefined, "Değişiklik yok");

/**
 * PATCH /api/host/media/:mediaId — approve / hide / re-categorise.
 * Hiding removes the Drive "anyone with the link" permission, so the image CDN
 * link stops working too; approving restores it.
 */
export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const columns = await mediaColumns();
    const { mediaId } = await context.params;
    const owned = await loadOwnedChild<MediaItemRow>("media_items", mediaId);
    if (owned === "unauthenticated") return jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.");
    if (!owned) return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");

    const body = await parseJsonBody(request, patchSchema, 4 * 1024);
    if (!body.ok) return body.response;
    const { status, category } = body.data;
    const row = owned.row;

    if (status && status !== row.status) {
      const drive = await driveForEvent(owned.event);
      if (status === "approved") await drive.makePublic(row.drive_file_id);
      else if (row.status === "approved") await drive.makePrivate(row.drive_file_id);
    }

    const update: Partial<Pick<MediaItemRow, "status" | "category" | "published_at">> = {};
    if (status) update.status = status;
    if (status === "approved" && row.status !== "approved") update.published_at = new Date().toISOString();
    if (category !== undefined) update.category = category || null;

    const { data, error } = await getAdminDb()
      .from("media_items")
      .update(update)
      .eq("id", row.id)
      .select(columns)
      .single();
    if (error) throw new Error(error.message);
    return jsonOk<{ media: MediaDto }>({ media: toMediaDto(data as MediaItemRow) });
  } catch (error) {
    return handleRouteError("host:media:update", error);
  }
}

/** DELETE /api/host/media/:mediaId — moves the file to the Drive trash and removes it from the album. */
export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const { mediaId } = await context.params;
    const owned = await loadOwnedChild<MediaItemRow>("media_items", mediaId);
    if (owned === "unauthenticated") return jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.");
    if (!owned) return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");

    const { error } = await getAdminDb().from("media_items").delete().eq("id", owned.row.id);
    if (error) throw new Error(error.message);
    const drive = await driveForEvent(owned.event).catch(() => null);
    if (drive) await trashBestEffort(drive, owned.row.drive_file_id, "host:media:delete");
    return jsonOk({ deleted: true });
  } catch (error) {
    return handleRouteError("host:media:delete", error);
  }
}
