import type { NextRequest } from "next/server";

import { handleRouteError, jsonOk } from "@/lib/api/http";
import { toGuestbookDto } from "@/lib/events";
import { requireEventAccess } from "@/lib/host-auth";
import { getAdminDb } from "@/lib/supabase/server";
import type { GuestbookMessageRow } from "@/types/domain";

export const runtime = "nodejs";

/** GET /api/host/events/:eventId/guestbook — every written note, incl. pending/hidden. */
export async function GET(_request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;
    const { data, error } = await getAdminDb()
      .from("guestbook_messages")
      .select("*")
      .eq("event_id", owned.event.id)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return jsonOk({ items: ((data ?? []) as GuestbookMessageRow[]).map(toGuestbookDto) });
  } catch (error) {
    return handleRouteError("host:guestbook:list", error);
  }
}
