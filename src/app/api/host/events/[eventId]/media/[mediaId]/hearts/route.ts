import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { summariseHearts, type HeartRow } from "@/lib/heart-names";
import { requireEventAccess } from "@/lib/host-auth";
import { getAdminDb } from "@/lib/supabase/server";
import type { MediaHeartsDto } from "@/types/domain";

export const runtime = "nodejs";

/** At most this many hearts are read for one item (a list, not an export). */
const MAX_HEARTS = 1000;

/**
 * GET /api/host/events/:eventId/media/:mediaId/hearts — who hearted one item.
 * Hosts and co-hosts only. Names are returned only while the event allows it
 * and only for hearts given while it allowed it; never session IDs.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ eventId: string; mediaId: string }> }) {
  try {
    const { eventId, mediaId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;
    if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");

    const db = getAdminDb();
    const media = await db.from("media_items").select("id").eq("id", mediaId).eq("event_id", owned.event.id).maybeSingle();
    if (media.error) throw new Error(media.error.message);
    if (!media.data) return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");

    const named = owned.event.hearts_named === true;
    let rows: HeartRow[];
    const full = await db
      .from("media_hearts")
      .select("guest_name, name_visible, created_at")
      .eq("media_id", mediaId)
      .order("created_at", { ascending: false })
      .limit(MAX_HEARTS);
    if (full.error) {
      // 0003 not run yet: no names exist, every heart is anonymous.
      const legacy = await db.from("media_hearts").select("created_at").eq("media_id", mediaId).limit(MAX_HEARTS);
      if (legacy.error) throw new Error(legacy.error.message);
      rows = ((legacy.data ?? []) as Array<{ created_at: string }>).map((r) => ({ guest_name: null, name_visible: false, created_at: r.created_at }));
    } else {
      rows = (full.data ?? []) as HeartRow[];
    }
    return jsonOk<MediaHeartsDto>(summariseHearts(rows, named));
  } catch (error) {
    return handleRouteError("host:media:hearts", error);
  }
}
