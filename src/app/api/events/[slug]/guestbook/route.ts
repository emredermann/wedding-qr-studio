import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { findEventBySlug, parseCursor, toGuestbookDto } from "@/lib/events";
import { resolveGuestSession, withGuestCookie } from "@/lib/guest-session";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";
import type { GuestbookMessageDto, GuestbookMessageRow } from "@/types/domain";

export const runtime = "nodejs";

const postSchema = z.object({
  guestName: z.string().trim().min(1, "İsim gerekli").max(80),
  message: z.string().trim().min(1, "Mesaj boş olamaz").max(1000),
});

/** GET /api/events/:slug/guestbook?since=ISO — approved written notes (+ your own); `since` filters on publish time. */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const limited = await rateLimit(request, "guestbook-read", 240, 60);
    if (limited) return limited;

    const event = await findEventBySlug(slug);
    if (!event) return jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.");
    if (!event.guestbook_enabled) return jsonOk<{ items: GuestbookMessageDto[] }>({ items: [] });

    const guest = resolveGuestSession(request);
    const since = parseCursor(request.nextUrl.searchParams.get("since"));

    let query = getAdminDb().from("guestbook_messages").select("*").eq("event_id", event.id);
    query = since
      ? // Live wall: newly visible notes, including ones the host approved later.
        query.eq("status", "approved").gt("published_at", since).order("published_at", { ascending: true }).limit(100)
      : query
          .or(`status.eq.approved,and(guest_session_id.eq.${guest.sessionId},status.neq.hidden)`)
          .order("created_at", { ascending: false })
          .limit(200);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const items = ((data ?? []) as GuestbookMessageRow[]).map(toGuestbookDto);
    return withGuestCookie(jsonOk({ items }), guest);
  } catch (error) {
    return handleRouteError("guestbook:list", error);
  }
}

/** POST /api/events/:slug/guestbook — leave a written congratulation note. */
export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const guest = resolveGuestSession(request);
    const limited = await rateLimit(request, "guestbook-write", 10, 300, guest.sessionId);
    if (limited) return limited;

    const body = await parseJsonBody(request, postSchema, 8 * 1024);
    if (!body.ok) return body.response;

    const event = await findEventBySlug(slug);
    if (!event) return jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.");
    if (!event.guestbook_enabled) return jsonError(403, "GUESTBOOK_CLOSED", "Anı defteri kapalı.");

    const { data, error } = await getAdminDb()
      .from("guestbook_messages")
      .insert({
        event_id: event.id,
        guest_name: body.data.guestName,
        guest_session_id: guest.sessionId,
        message: body.data.message,
        status: event.require_approval ? "pending" : "approved",
        published_at: event.require_approval ? null : new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return withGuestCookie(jsonOk({ item: toGuestbookDto(data as GuestbookMessageRow) }, 201), guest);
  } catch (error) {
    return handleRouteError("guestbook:create", error);
  }
}
