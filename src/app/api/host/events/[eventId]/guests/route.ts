import type { NextRequest } from "next/server";

import { handleRouteError, jsonOk } from "@/lib/api/http";
import { fetchAllRows } from "@/lib/events";
import { buildGuestList, type GuestHeartRow, type GuestMediaRow, type GuestNoteRow } from "@/lib/guest-list";
import { requireEventAccess } from "@/lib/host-auth";
import { hasTableNoColumn } from "@/lib/schema-features";
import { getAdminDb } from "@/lib/supabase/server";
import type { GuestListDto } from "@/types/domain";

export const runtime = "nodejs";

/**
 * GET /api/host/events/:eventId/guests — who took part: uploads, notes and
 * (when the event shows heart names) hearts per guest. Host and co-hosts
 * only; guests never get here (requireEventAccess answers 401/404).
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;
    const db = getAdminDb();
    const event = owned.event;
    const heartsNamed = event.hearts_named === true;
    const tableNumbers = event.table_numbers === true;
    const withTable = tableNumbers && (await hasTableNoColumn());

    const [media, notes, hearts] = await Promise.all([
      fetchAllRows<GuestMediaRow>((from, to) =>
        db
          .from("media_items")
          .select(`guest_session_id, guest_name, kind, is_guestbook, size_bytes, created_at${withTable ? ", table_no" : ""}`)
          .eq("event_id", event.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<GuestNoteRow>((from, to) =>
        db
          .from("guestbook_messages")
          .select("guest_session_id, guest_name, created_at")
          .eq("event_id", event.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      heartsNamed
        ? fetchAllRows<GuestHeartRow>((from, to) =>
            db
              .from("media_hearts")
              .select("guest_session_id, guest_name, name_visible, created_at, media_items!inner(event_id)")
              .eq("media_items.event_id", event.id)
              .order("created_at", { ascending: true })
              .range(from, to),
          ).catch((error: unknown) => {
            // 0003 not run yet: no names were recorded, so there is nothing to show.
            console.warn("[host:guests] hearts unavailable", error instanceof Error ? error.message : error);
            return [] as GuestHeartRow[];
          })
        : Promise.resolve([] as GuestHeartRow[]),
    ]);

    return jsonOk<GuestListDto>(buildGuestList(media, notes, hearts, { heartsNamed, tableNumbers }));
  } catch (error) {
    return handleRouteError("host:guests", error);
  }
}
