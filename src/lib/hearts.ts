import "server-only";

import { getAdminDb } from "@/lib/supabase/server";
import type { MediaDto } from "@/types/domain";

/**
 * Marks which items the current guest has hearted, with one query per page
 * (never N+1). Only the caller's own hearts are read; who else hearted an
 * item is never exposed.
 */
export async function withHeartedByMe(items: MediaDto[], sessionId: string | null): Promise<MediaDto[]> {
  if (items.length === 0) return items;
  if (!sessionId) return items.map((item) => ({ ...item, heartedByMe: false }));
  const ids = items.filter((item) => item.status === "approved").map((item) => item.id);
  if (ids.length === 0) return items.map((item) => ({ ...item, heartedByMe: false }));
  const { data, error } = await getAdminDb()
    .from("media_hearts")
    .select("media_id")
    .eq("guest_session_id", sessionId)
    .in("media_id", ids);
  if (error) throw new Error(`[hearts] ${error.message}`);
  const mine = new Set(((data ?? []) as Array<{ media_id: string }>).map((row) => row.media_id));
  return items.map((item) => ({ ...item, heartedByMe: mine.has(item.id) }));
}

/** How many items "En sevilenler" shows (no pagination). */
export const POPULAR_LIMIT = 60;
