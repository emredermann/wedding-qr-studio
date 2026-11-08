import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { trashBestEffort } from "@/lib/drive";
import { driveForEvent } from "@/lib/drive-accounts";
import { readGuestSession } from "@/lib/guest-session";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";
import type { EventRow, MediaItemRow } from "@/types/domain";

export const runtime = "nodejs";

/** DELETE /api/media/:mediaId — a guest removes one of their own uploads. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ mediaId: string }> }) {
  try {
    const { mediaId } = await context.params;
    const guest = readGuestSession(request);
    if (!guest) return jsonError(401, "NO_GUEST_SESSION", "Oturum bulunamadı.");
    const limited = await rateLimit(request, "media-delete", 60, 60, guest.sessionId);
    if (limited) return limited;
    if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");

    const db = getAdminDb();
    const { data, error } = await db.from("media_items").select("id, drive_file_id, guest_session_id, events!inner(owner_id, drive_account)").eq("id", mediaId).maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as
      | (Pick<MediaItemRow, "id" | "drive_file_id" | "guest_session_id"> & { events: Pick<EventRow, "owner_id" | "drive_account"> })
      | null;
    if (!row || row.guest_session_id !== guest.sessionId) return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");

    const del = await db.from("media_items").delete().eq("id", row.id);
    if (del.error) throw new Error(del.error.message);
    const drive = await driveForEvent(row.events).catch(() => null);
    if (drive) await trashBestEffort(drive, row.drive_file_id, "media:delete");
    return jsonOk({ deleted: true });
  } catch (error) {
    return handleRouteError("media:delete", error);
  }
}
