import type { NextRequest } from "next/server";

import { handleRouteError, jsonOk } from "@/lib/api/http";
import { EXTRA_ID_PATTERN } from "@/lib/event-extras";
import { encodeMediaCursor, mediaCursorFilter, parseMediaCursor, toMediaDto } from "@/lib/events";
import { POPULAR_LIMIT } from "@/lib/hearts";
import { requireEventAccess } from "@/lib/host-auth";
import { getAdminDb } from "@/lib/supabase/server";
import { MEDIA_KINDS, MEDIA_STATUSES, type MediaItemRow, type MediaKind, type MediaPage, type MediaStatus } from "@/types/domain";
import { hasTableNoColumn, mediaColumns } from "@/lib/schema-features";

export const runtime = "nodejs";

/** GET /api/host/events/:eventId/media?status=&kind=&category=&guestbook=&cursor= — all media incl. pending/hidden. */
export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const columns = await mediaColumns();
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;

    const params = request.nextUrl.searchParams;
    const status = params.get("status");
    const kind = params.get("kind");
    const category = params.get("category")?.slice(0, 40);
    const challenge = params.get("challenge");
    const guestbook = params.get("guestbook");
    const cursor = parseMediaCursor(params.get("cursor"));
    const limit = Math.min(Math.max(Number(params.get("limit")) || 60, 1), 100);
    const popular = params.get("sort") === "popular";
    const tableParam = params.get("table");
    const table = tableParam && /^\d{1,4}$/.test(tableParam) && (await hasTableNoColumn()) ? Number(tableParam) : null;

    let query = getAdminDb().from("media_items").select(columns).eq("event_id", owned.event.id);
    if (MEDIA_STATUSES.includes(status as MediaStatus)) query = query.eq("status", status as MediaStatus);
    if (MEDIA_KINDS.includes(kind as MediaKind)) query = query.eq("kind", kind as MediaKind);
    if (category) query = query.eq("category", category);
    if (challenge && EXTRA_ID_PATTERN.test(challenge)) query = query.eq("challenge_id", challenge);
    if (table !== null) query = query.eq("table_no", table);
    if (guestbook === "1" || guestbook === "0") query = query.eq("is_guestbook", guestbook === "1");
    if (popular) {
      const { data, error } = await query
        .order("heart_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(POPULAR_LIMIT);
      if (error) throw new Error(error.message);
      return jsonOk<MediaPage>({ items: ((data ?? []) as MediaItemRow[]).map((row) => toMediaDto(row)), nextCursor: null });
    }
    if (cursor) {
      query = cursor.id ? query.or(mediaCursorFilter({ ...cursor, id: cursor.id })) : query.lt("created_at", cursor.createdAt);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as MediaItemRow[];
    return jsonOk<MediaPage>({
      items: rows.map((row) => toMediaDto(row)),
      nextCursor: rows.length === limit ? encodeMediaCursor(rows[rows.length - 1]) : null,
    });
  } catch (error) {
    return handleRouteError("host:media:list", error);
  }
}
