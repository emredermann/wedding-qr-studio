import type { NextRequest } from "next/server";

import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { DriveService } from "@/lib/drive";
import { fetchAllRows, toHostEventDto } from "@/lib/events";
import { requireOwnedEvent } from "@/lib/host-auth";
import { getAdminDb } from "@/lib/supabase/server";
import { eventSettingsSchema } from "@/lib/validation";
import type { EventRow, EventStatsDto, HostEventDto, MediaItemRow } from "@/types/domain";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ eventId: string }> };

interface MediaStatsRow {
  total: number | string;
  photos: number | string;
  videos: number | string;
  audio: number | string;
  pending: number | string;
  hidden: number | string;
  total_bytes: number | string;
  guests: number | string;
}

type MediaCounters = Omit<EventStatsDto, "guestbookMessages" | "facesIndexed">;

/** Aggregates in Postgres via `event_media_stats`; null if the RPC is not installed yet. */
async function mediaStatsViaRpc(eventId: string): Promise<MediaCounters | null> {
  const { data, error } = await getAdminDb().rpc("event_media_stats", { p_event_id: eventId });
  if (error) {
    console.warn("[host:event:stats] event_media_stats rpc unavailable, falling back", error.message);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as MediaStatsRow | null;
  if (!row) return { total: 0, photos: 0, videos: 0, audio: 0, pending: 0, hidden: 0, totalBytes: 0, guests: 0 };
  return {
    total: Number(row.total),
    photos: Number(row.photos),
    videos: Number(row.videos),
    audio: Number(row.audio),
    pending: Number(row.pending),
    hidden: Number(row.hidden),
    totalBytes: Number(row.total_bytes),
    guests: Number(row.guests),
  };
}

/** Fallback for databases where the migration has not been re-run yet: single pass in JS. */
async function mediaStatsViaScan(eventId: string): Promise<MediaCounters> {
  const db = getAdminDb();
  type Row = Pick<MediaItemRow, "kind" | "status" | "size_bytes" | "guest_session_id">;
  const rows = await fetchAllRows<Row>((from, to) =>
    db
      .from("media_items")
      .select("kind, status, size_bytes, guest_session_id")
      .eq("event_id", eventId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const counters: MediaCounters = { total: rows.length, photos: 0, videos: 0, audio: 0, pending: 0, hidden: 0, totalBytes: 0, guests: 0 };
  const guests = new Set<string>();
  for (const r of rows) {
    if (r.kind === "photo") counters.photos += 1;
    else if (r.kind === "video") counters.videos += 1;
    else if (r.kind === "audio") counters.audio += 1;
    if (r.status === "pending") counters.pending += 1;
    else if (r.status === "hidden") counters.hidden += 1;
    counters.totalBytes += Number(r.size_bytes);
    if (r.guest_session_id) guests.add(r.guest_session_id);
  }
  counters.guests = guests.size;
  return counters;
}

async function computeStats(eventId: string): Promise<EventStatsDto> {
  const db = getAdminDb();
  const [media, messages, faces] = await Promise.all([
    mediaStatsViaRpc(eventId).then((viaRpc) => viaRpc ?? mediaStatsViaScan(eventId)),
    db.from("guestbook_messages").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    db.from("face_descriptors").select("id", { count: "exact", head: true }).eq("event_id", eventId),
  ]);
  return {
    ...media,
    guestbookMessages: messages.count ?? 0,
    facesIndexed: faces.count ?? 0,
  };
}

/** GET /api/host/events/:eventId — settings, Drive folder link and statistics. */
export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireOwnedEvent(eventId);
    if (!owned.ok) return owned.response;
    const stats = await computeStats(owned.event.id);
    return jsonOk<{ event: HostEventDto; stats: EventStatsDto }>({ event: toHostEventDto(owned.event), stats });
  } catch (error) {
    return handleRouteError("host:event:get", error);
  }
}

/** PATCH /api/host/events/:eventId — update settings and moderation toggles. */
export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireOwnedEvent(eventId);
    if (!owned.ok) return owned.response;

    const body = await parseJsonBody(request, eventSettingsSchema, 16 * 1024);
    if (!body.ok) return body.response;
    const s = body.data;

    const { data, error } = await getAdminDb()
      .from("events")
      .update({
        title: s.title,
        couple_names: s.coupleNames,
        event_date: s.eventDate,
        welcome_message: s.welcomeMessage,
        theme_color: s.themeColor,
        categories: s.categories,
        uploads_enabled: s.uploadsEnabled,
        require_approval: s.requireApproval,
        gallery_public: s.galleryPublic,
        face_search_enabled: s.faceSearchEnabled,
        guestbook_enabled: s.guestbookEnabled,
      })
      .eq("id", owned.event.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return jsonOk<{ event: HostEventDto }>({ event: toHostEventDto(data as EventRow) });
  } catch (error) {
    return handleRouteError("host:event:update", error);
  }
}

/** DELETE /api/host/events/:eventId — deletes the event; its Drive folder goes to the trash (30-day recovery). */
export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireOwnedEvent(eventId);
    if (!owned.ok) return owned.response;
    await DriveService.trash(owned.event.drive_folder_id);
    const { error } = await getAdminDb().from("events").delete().eq("id", owned.event.id);
    if (error) throw new Error(error.message);
    return jsonOk({ deleted: true });
  } catch (error) {
    return handleRouteError("host:event:delete", error);
  }
}
