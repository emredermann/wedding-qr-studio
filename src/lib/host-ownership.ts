import "server-only";

import { getHostUser, type HostUser } from "@/lib/host-auth";
import { getAdminDb } from "@/lib/supabase/server";

/**
 * Loads a row from `table` by id and confirms the signed-in host owns its event.
 * Returns null for "not found or not yours" (both answer 404 to avoid leaking IDs).
 */
export async function loadOwnedChild<T extends { event_id: string }>(
  table: "media_items" | "guestbook_messages",
  id: string,
): Promise<{ host: HostUser; row: T } | "unauthenticated" | null> {
  const host = await getHostUser();
  if (!host) return "unauthenticated";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await getAdminDb()
    .from(table)
    .select("*, events!inner(owner_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`[ownership] ${error.message}`);
  if (!data) return null;
  const { events, ...row } = data as T & { events: { owner_id: string } };
  if (events.owner_id !== host.id) return null;
  return { host, row: row as unknown as T };
}
