import type { NextRequest } from "next/server";

import { BRAND } from "@/lib/brand";
import { addCohost, cohostEventIds } from "@/lib/cohosts";
import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { driveForNewEvent } from "@/lib/drive-accounts";
import { slugify, toHostEventDto } from "@/lib/events";
import { randomSlugSuffix } from "@/lib/slug";
import { getHostUser } from "@/lib/host-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";
import { createEventSchema } from "@/lib/validation";
import type { EventRow, HostEventDto, HostEventListItem } from "@/types/domain";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/host/events — events the signed-in host owns or co-hosts, with media counts. */
export async function GET() {
  try {
    const host = await getHostUser();
    if (!host) return jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.");

    const cohosted = await cohostEventIds(host.id);
    let query = getAdminDb()
      .from("events")
      .select("id, owner_id, slug, title, couple_names, event_date, theme_color, created_at, media_items(count)");
    query = cohosted.length > 0 ? query.or(`owner_id.eq.${host.id},id.in.(${cohosted.join(",")})`) : query.eq("owner_id", host.id);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const items: HostEventListItem[] = (
      (data ?? []) as Array<
        Pick<EventRow, "id" | "owner_id" | "slug" | "title" | "couple_names" | "event_date" | "theme_color" | "created_at"> & {
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
      role: row.owner_id === host.id ? "owner" : "cohost",
      createdAt: row.created_at,
    }));
    return jsonOk({ items });
  } catch (error) {
    return handleRouteError("host:events:list", error);
  }
}

/**
 * A slug the host typed is used as-is. Auto-generated slugs always get a random
 * suffix ("ayse-mehmet-k7p2xq") so event addresses cannot be guessed from names.
 */
async function pickUniqueSlug(base: string, explicit: boolean): Promise<string | null> {
  const db = getAdminDb();
  const candidates = explicit ? [base] : Array.from({ length: 5 }, () => `${base}-${randomSlugSuffix()}`);
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
 * in the host's own connected Drive, or the platform Drive when the host has
 * not connected one.
 */
export async function POST(request: NextRequest) {
  try {
    const host = await getHostUser();
    if (!host) return jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.");
    const limited = await rateLimit(request, "create-event", 10, 3600, host.id);
    if (limited) return limited;

    const body = await parseJsonBody(request, createEventSchema, 8 * 1024);
    if (!body.ok) return body.response;
    const { title, coupleNames, eventDate, schedule, challenges, coHosts } = body.data;

    let base = body.data.slug ?? slugify(coupleNames || title);
    if (base.length < 3) base = "etkinlik";
    const slug = await pickUniqueSlug(base, Boolean(body.data.slug));
    if (!slug) return jsonError(409, "SLUG_TAKEN", "Bu bağlantı adresi kullanımda. Başka bir tane deneyin.");

    const { drive, account } = await driveForNewEvent(host.id);
    const folders = await drive.createEventFolders(title, slug);

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
        drive_account: account,
        theme_color: BRAND.defaultEventColor,
        // Optional extras are only written when set, so creating a plain event
        // keeps working even before the 0002 migration has been run.
        ...(schedule && schedule.length > 0 ? { schedule } : {}),
        ...(challenges && challenges.length > 0 ? { challenges } : {}),
      })
      .select("*")
      .single();

    if (error) {
      await drive.trash(folders.rootId).catch(() => undefined);
      if (error.code === "23505") return jsonError(409, "SLUG_TAKEN", "Bu bağlantı adresi kullanımda.");
      throw new Error(error.message);
    }
    const event = data as EventRow;

    // Optional co-hosts: the event exists either way; report the names that could not be added.
    const coHostsNotAdded: string[] = [];
    for (const username of coHosts ?? []) {
      const added = await addCohost(event.id, host.id, username).catch((err) => {
        console.error("[host:events:create] co-host add failed", err);
        return { ok: false as const, reason: "not_found" as const };
      });
      if (!added.ok) coHostsNotAdded.push(username);
    }
    return jsonOk<{ event: HostEventDto; coHostsNotAdded: string[] }>({ event: toHostEventDto(event), coHostsNotAdded }, 201);
  } catch (error) {
    return handleRouteError("host:events:create", error);
  }
}
