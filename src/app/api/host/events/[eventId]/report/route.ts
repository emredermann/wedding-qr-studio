import type { NextRequest } from "next/server";

import { handleRouteError, jsonOk } from "@/lib/api/http";
import { readChallenges } from "@/lib/event-extras";
import { fetchAllRows } from "@/lib/events";
import { requireEventAccess } from "@/lib/host-auth";
import { buildReport, type ReportDto, type ReportMediaRow } from "@/lib/report";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/host/events/:eventId/report — attendance report numbers (free on every package). */
export async function GET(_request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;
    const db = getAdminDb();
    const [rows, notes] = await Promise.all([
      fetchAllRows<ReportMediaRow>((from, to) =>
        db
          .from("media_items")
          .select("kind, status, size_bytes, guest_session_id, guest_name, created_at, heart_count, challenge_id, category, is_guestbook, drive_file_id")
          .eq("event_id", owned.event.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      db.from("guestbook_messages").select("id", { count: "exact", head: true }).eq("event_id", owned.event.id),
    ]);
    return jsonOk<ReportDto>(buildReport(rows, { challenges: readChallenges(owned.event.challenges), guestbookNotes: notes.count ?? 0 }));
  } catch (error) {
    return handleRouteError("host:event:report", error);
  }
}
