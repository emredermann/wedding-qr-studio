import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { findEventBySlug, parseCursor } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";
import type { RecentHeartsDto } from "@/types/domain";

export const runtime = "nodejs";


/**
 * GET /api/events/:slug/hearts?since=ISO — hearts for the live wall's
 * floating-heart animation. Without `since` it only returns a cursor.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const limited = await rateLimit(request, "live-hearts", 600, 60);
    if (limited) return limited;

    const event = await findEventBySlug(slug);
    if (!event) return jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.");

    const now = new Date().toISOString();
    const since = parseCursor(request.nextUrl.searchParams.get("since"));
    if (!since) return jsonOk<RecentHeartsDto>({ hearts: [], cursor: now });

    const { data, error } = await getAdminDb()
      .from("media_hearts")
      .select("media_id, created_at, media_items!inner(event_id, status)")
      .eq("media_items.event_id", event.id)
      .eq("media_items.status", "approved")
      .gt("created_at", since)
      .order("created_at", { ascending: true })
      .limit(60);
    if (error) {
      // Hearts table missing (0002 not run): no animation, no error on the wall.
      console.warn("[events:hearts]", error.message);
      return jsonOk<RecentHeartsDto>({ hearts: [], cursor: since });
    }
    const rows = (data ?? []) as Array<{ media_id: string; created_at: string }>;
    const hearts = rows.map((r) => ({ mediaId: r.media_id, at: r.created_at }));
    // created_at has microseconds but cursors are parsed to milliseconds; step 1 ms past
    // the newest heart so it is not returned again on the next poll.
    const cursor = hearts.length > 0 ? new Date(Date.parse(hearts[hearts.length - 1].at) + 1).toISOString() : since;
    return jsonOk<RecentHeartsDto>({ hearts, cursor });
  } catch (error) {
    return handleRouteError("events:hearts", error);
  }
}
