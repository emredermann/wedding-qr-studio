import "server-only";

import { eventRoleFor, getHostUser, type HostUser } from "@/lib/host-auth";
import { getAdminDb } from "@/lib/supabase/server";
import type { EventRow } from "@/types/domain";

/**
 * Loads a row from `table` by id and confirms the signed-in host manages its
 * event (owner or co-host). Returns null for "not found or not yours" (both
 * answer 404 to avoid leaking IDs). `event.owner_id` still drives Drive access.
 */
export async function loadOwnedChild<T extends { event_id: string }>(
  table: "media_items" | "guestbook_messages",
  id: string,
): Promise<{ host: HostUser; row: T; event: Pick<EventRow, "owner_id" | "drive_account"> } | "unauthenticated" | null> {
  const host = await getHostUser();
  if (!host) return "unauthenticated";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await getAdminDb()
    .from(table)
    .select("*, events!inner(owner_id, drive_account)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`[ownership] ${error.message}`);
  if (!data) return null;
  const { events: event, ...row } = data as T & { events: Pick<EventRow, "owner_id" | "drive_account"> };
  if (!(await eventRoleFor({ id: row.event_id, owner_id: event.owner_id }, host.id))) return null;
  return { host, row: row as unknown as T, event };
}
