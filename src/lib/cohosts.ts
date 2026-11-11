import "server-only";

import { isValidUsername, loginEmailToUsername, normaliseUsername, usernameToLoginEmail } from "@/lib/login-identity";
import { getAdminDb } from "@/lib/supabase/server";

export const MAX_COHOSTS = 5;

export interface CohostDto {
  userId: string;
  username: string;
}

export type AddCohostResult = { ok: true } | { ok: false; reason: "not_found" | "self" | "limit" };

/** Maps a Mira username to its account id, or null (same answer for "invalid" and "unknown"). */
async function findUserIdByUsername(username: string): Promise<string | null> {
  const name = normaliseUsername(username);
  if (!isValidUsername(name)) return null;
  const { data, error } = await getAdminDb().rpc("find_user_id_by_email", { p_email: usernameToLoginEmail(name) });
  if (error) throw new Error(`[cohosts] ${error.message}`);
  return typeof data === "string" && data ? data : null;
}

export async function countCohosts(eventId: string): Promise<number> {
  const { count, error } = await getAdminDb()
    .from("event_cohosts")
    .select("user_id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) throw new Error(`[cohosts] ${error.message}`);
  return count ?? 0;
}

/** Adds an existing Mira account as co-host of an event (idempotent). */
export async function addCohost(eventId: string, ownerId: string, username: string): Promise<AddCohostResult> {
  const userId = await findUserIdByUsername(username);
  if (!userId) return { ok: false, reason: "not_found" };
  if (userId === ownerId) return { ok: false, reason: "self" };
  const db = getAdminDb();
  const existing = await db.from("event_cohosts").select("user_id").eq("event_id", eventId).eq("user_id", userId).maybeSingle();
  if (existing.error) throw new Error(`[cohosts] ${existing.error.message}`);
  if (existing.data) return { ok: true };
  if ((await countCohosts(eventId)) >= MAX_COHOSTS) return { ok: false, reason: "limit" };
  const { error } = await db
    .from("event_cohosts")
    .upsert({ event_id: eventId, user_id: userId, added_by: ownerId }, { onConflict: "event_id,user_id", ignoreDuplicates: true });
  if (error) throw new Error(`[cohosts] ${error.message}`);
  return { ok: true };
}

/** Co-hosts of an event with their usernames (at most MAX_COHOSTS lookups). */
export async function listCohosts(eventId: string): Promise<CohostDto[]> {
  const db = getAdminDb();
  const { data, error } = await db
    .from("event_cohosts")
    .select("user_id, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[cohosts] ${error.message}`);
  const rows = (data ?? []) as Array<{ user_id: string }>;
  return Promise.all(
    rows.map(async ({ user_id }) => {
      const { data: user } = await db.auth.admin.getUserById(user_id);
      return { userId: user_id, username: loginEmailToUsername(user?.user?.email) ?? "Bilinmeyen hesap" };
    }),
  );
}

export async function removeCohost(eventId: string, userId: string): Promise<void> {
  const { error } = await getAdminDb().from("event_cohosts").delete().eq("event_id", eventId).eq("user_id", userId);
  if (error) throw new Error(`[cohosts] ${error.message}`);
}

/**
 * Event ids the user co-hosts. Used for the dashboard list only, so a missing
 * table (0002 migration not run yet) degrades to "none" instead of breaking it.
 */
export async function cohostEventIds(userId: string): Promise<string[]> {
  const { data, error } = await getAdminDb().from("event_cohosts").select("event_id").eq("user_id", userId);
  if (error) {
    console.warn("[cohosts] co-host lookup unavailable", error.message);
    return [];
  }
  return ((data ?? []) as Array<{ event_id: string }>).map((row) => row.event_id);
}

export const COHOST_ERRORS: Record<Exclude<AddCohostResult, { ok: true }>["reason"], string> = {
  not_found: "Bu kullanıcı adıyla eklenebilecek bir hesap bulunamadı.",
  self: "Kendinizi ortak yönetici olarak ekleyemezsiniz.",
  limit: `En fazla ${MAX_COHOSTS} ortak yönetici ekleyebilirsiniz.`,
};
