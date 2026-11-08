import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { toGuestbookDto } from "@/lib/events";
import { loadOwnedChild } from "@/lib/host-ownership";
import { getAdminDb } from "@/lib/supabase/server";
import { MEDIA_STATUSES, type GuestbookMessageRow } from "@/types/domain";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ messageId: string }> };

const patchSchema = z.object({ status: z.enum(MEDIA_STATUSES) });

/** PATCH /api/host/guestbook/:messageId — approve or hide a written note. */
export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { messageId } = await context.params;
    const owned = await loadOwnedChild<GuestbookMessageRow>("guestbook_messages", messageId);
    if (owned === "unauthenticated") return jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.");
    if (!owned) return jsonError(404, "NOT_FOUND", "Mesaj bulunamadı.");

    const body = await parseJsonBody(request, patchSchema, 1024);
    if (!body.ok) return body.response;
    const { data, error } = await getAdminDb()
      .from("guestbook_messages")
      .update({
        status: body.data.status,
        ...(body.data.status === "approved" && owned.row.status !== "approved"
          ? { published_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", owned.row.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return jsonOk({ item: toGuestbookDto(data as GuestbookMessageRow) });
  } catch (error) {
    return handleRouteError("host:guestbook:update", error);
  }
}

/** DELETE /api/host/guestbook/:messageId */
export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const { messageId } = await context.params;
    const owned = await loadOwnedChild<GuestbookMessageRow>("guestbook_messages", messageId);
    if (owned === "unauthenticated") return jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.");
    if (!owned) return jsonError(404, "NOT_FOUND", "Mesaj bulunamadı.");
    const { error } = await getAdminDb().from("guestbook_messages").delete().eq("id", owned.row.id);
    if (error) throw new Error(error.message);
    return jsonOk({ deleted: true });
  } catch (error) {
    return handleRouteError("host:guestbook:delete", error);
  }
}
