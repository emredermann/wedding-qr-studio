import { randomBytes } from "node:crypto";

import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { DriveService } from "@/lib/drive";
import { slugify, toHostEventDto } from "@/lib/events";
import { getHostUser } from "@/lib/host-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";
import { createEventSchema } from "@/lib/validation";
import type { EventRow, HostEventDto, HostEventListItem } from "@/types/domain";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/host/events — the signed-in host's events with media counts. */
export async function GET() {
  try {
    const host = await getHostUser();
    if (!host) return jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.");

    const { data, error } = await getAdminDb()
      .from("events")
      .select("id, slug, title, couple_names, event_date, theme_color, created_at, media_items(count)")
      .eq("owner_id", host.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const items: HostEventListItem[] = (
      (data ?? []) as Array<
        Pick<EventRow, "id" | "slug" | "title" | "couple_names" | "event_date" | "theme_color" | "created_at"> & {
          media_items: Array<{ count: number }>;
        }
      >
    ).map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      coupleNames: row.couple_names,
      eventDate: row.event_date,
      themeColor: row.theme_color,
      mediaCount: row.media_items?.[0]?.count ?? 0,
      createdAt: row.created_at,
    }));
    return jsonOk({ items });
  } catch (error) {
    return handleRouteError("host:events:list", error);
  }
}

async function pickUniqueSlug(base: string, explicit: boolean): Promise<string | null> {
  const db = getAdminDb();
  const candidates = explicit
    ? [base]
    : [base, ...Array.from({ length: 4 }, () => `${base}-${randomBytes(2).toString("hex")}`)];
  for (const candidate of candidates) {
    const { data, error } = await db.from("events").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
  }
  return null;
}

/**
 * POST /api/host/events — creates an event and its Drive folder hierarchy:
 *   <ROOT>/<Event_Title>_<slug>/{Photos,Videos,VoiceNotes}
 */
export async function POST(request: NextRequest) {
  try {
    const host = await getHostUser();
    if (!host) return jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.");
    const limited = await rateLimit(request, "create-event", 10, 3600, host.id);
    if (limited) return limited;

    const body = await parseJsonBody(request, createEventSchema, 8 * 1024);
    if (!body.ok) return body.response;
    const { title, coupleNames, eventDate } = body.data;

    let base = body.data.slug ?? slugify(coupleNames || title);
    if (base.length < 3) base = `dugun-${randomBytes(3).toString("hex")}`;
    const slug = await pickUniqueSlug(base, Boolean(body.data.slug));
    if (!slug) return jsonError(409, "SLUG_TAKEN", "Bu bağlantı adresi kullanımda. Başka bir tane deneyin.");

    const folders = await DriveService.createEventFolders(title, slug);

    const { data, error } = await getAdminDb()
      .from("events")
      .insert({
        owner_id: host.id,
        slug,
        title,
        couple_names: coupleNames,
        event_date: eventDate,
        drive_folder_id: folders.rootId,
        drive_photos_folder_id: folders.photosId,
        drive_videos_folder_id: folders.videosId,
        drive_voice_folder_id: folders.voiceId,
      })
      .select("*")
      .single();

    if (error) {
      await DriveService.trash(folders.rootId).catch(() => undefined);
      if (error.code === "23505") return jsonError(409, "SLUG_TAKEN", "Bu bağlantı adresi kullanımda.");
      throw new Error(error.message);
    }
    return jsonOk<{ event: HostEventDto }>({ event: toHostEventDto(data as EventRow) }, 201);
  } catch (error) {
    return handleRouteError("host:events:create", error);
  }
}
