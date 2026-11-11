import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { EXTRA_ID_PATTERN } from "@/lib/event-extras";
import {
  encodeMediaCursor,
  findEventBySlug,
  MEDIA_COLUMNS,
  mediaCursorFilter,
  parseCursor,
  parseMediaCursor,
  toMediaDto,
} from "@/lib/events";
import { readGuestSession } from "@/lib/guest-session";
import { POPULAR_LIMIT, withHeartedByMe } from "@/lib/hearts";
import { getHostUser } from "@/lib/host-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";
import { MEDIA_KINDS, type MediaItemRow, type MediaKind, type MediaPage } from "@/types/domain";

export const runtime = "nodejs";

const PAGE_SIZE = 60;

/**
 * GET /api/events/:slug/media
 *
 * Query: cursor (`<created_at>~<id>`, older-than) | since (ISO published_at, newer-than — live wall),
 *        category, kind, mine=1, guestbook=1, limit.
 * Guests see approved items when the gallery is public, plus their own uploads
 * (any status). If the gallery is private they see only their own uploads.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    // Per-IP: all guests on one venue Wi-Fi share an IP; sized for ~500 guests (load-tested).
    const limited = await rateLimit(request, "gallery", 2000, 60);
    if (limited) return limited;

    const event = await findEventBySlug(slug);
    if (!event) return jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.");

    const params = request.nextUrl.searchParams;
    const guest = readGuestSession(request);
    const sessionId = guest?.sessionId ?? null;
    const mineOnly = params.get("mine") === "1";
    const guestbook = params.get("guestbook") === "1";
    const category = params.get("category")?.slice(0, 40) || null;
    const challengeParam = params.get("challenge");
    const challenge = challengeParam && EXTRA_ID_PATTERN.test(challengeParam) ? challengeParam : null;
    const kindParam = params.get("kind");
    const kind = MEDIA_KINDS.includes(kindParam as MediaKind) ? (kindParam as MediaKind) : null;
    const cursor = parseMediaCursor(params.get("cursor"));
    const since = parseCursor(params.get("since"));
    const limit = Math.min(Math.max(Number(params.get("limit")) || PAGE_SIZE, 1), 100);
    const popular = params.get("sort") === "popular";

    let canSeeAll = event.gallery_public;
    if (!canSeeAll && !mineOnly) {
      const host = await getHostUser().catch(() => null);
      canSeeAll = host?.id === event.owner_id;
    }

    let query = getAdminDb()
      .from("media_items")
      .select(MEDIA_COLUMNS)
      .eq("event_id", event.id)
      .eq("is_guestbook", guestbook);

    if (since) {
      // Live wall: items that became visible after `since` (includes late approvals).
      if (!canSeeAll) return jsonOk<MediaPage>({ items: [], nextCursor: null });
      let live = getAdminDb()
        .from("media_items")
        .select(MEDIA_COLUMNS)
        .eq("event_id", event.id)
        .eq("is_guestbook", guestbook)
        .eq("status", "approved")
        .gt("published_at", since);
      if (kind) live = live.eq("kind", kind);
      const { data, error } = await live.order("published_at", { ascending: true }).limit(limit);
      if (error) throw new Error(error.message);
      return jsonOk<MediaPage>({ items: ((data ?? []) as MediaItemRow[]).map((row) => toMediaDto(row, sessionId)), nextCursor: null });
    }

    if (popular) {
      // "En sevilenler": the most-hearted approved items (own items only in a private gallery). No pagination.
      let top = query.eq("status", "approved");
      if (mineOnly || !canSeeAll) {
        if (!sessionId) return jsonOk<MediaPage>({ items: [], nextCursor: null });
        top = top.eq("guest_session_id", sessionId);
      }
      if (category) top = top.eq("category", category);
      if (challenge) top = top.eq("challenge_id", challenge);
      if (kind) top = top.eq("kind", kind);
      const { data, error } = await top
        .order("heart_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(POPULAR_LIMIT);
      if (error) throw new Error(error.message);
      const items = ((data ?? []) as MediaItemRow[]).map((row) => toMediaDto(row, sessionId));
      return jsonOk<MediaPage>({ items: await withHeartedByMe(items, sessionId), nextCursor: null });
    }

    if (mineOnly || !canSeeAll) {
      if (!sessionId) return jsonOk<MediaPage>({ items: [], nextCursor: null });
      query = query.eq("guest_session_id", sessionId).neq("status", "hidden");
    } else if (sessionId) {
      query = query.or(`status.eq.approved,and(guest_session_id.eq.${sessionId},status.neq.hidden)`);
    } else {
      query = query.eq("status", "approved");
    }
    if (category) query = query.eq("category", category);
    if (challenge) query = query.eq("challenge_id", challenge);
    if (kind) query = query.eq("kind", kind);

    if (cursor) {
      query = cursor.id ? query.or(mediaCursorFilter({ ...cursor, id: cursor.id })) : query.lt("created_at", cursor.createdAt);
    }
    query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as MediaItemRow[];
    const items = await withHeartedByMe(
      rows.map((row) => toMediaDto(row, sessionId)),
      sessionId,
    );
    const nextCursor = rows.length === limit ? encodeMediaCursor(rows[rows.length - 1]) : null;
    return jsonOk<MediaPage>({ items, nextCursor });
  } catch (error) {
    return handleRouteError("events:media", error);
  }
}
