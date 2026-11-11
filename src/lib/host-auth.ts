import "server-only";

import { jsonError } from "@/lib/api/http";
import { createAuthClient, getAdminDb } from "@/lib/supabase/server";
import type { EventRow } from "@/types/domain";

export interface HostUser {
  id: string;
  email: string | null;
}

/**
 * Returns the signed-in host, or null. Never falls back to a demo user.
 *
 * `getClaims()` verifies the session JWT locally against the project's cached
 * JWKS (asymmetric signing keys), so moderation screens that load dozens of
 * thumbnails do not make one Supabase Auth round trip per request. Projects
 * still on the legacy shared secret transparently fall back to a server check.
 */
export async function getHostUser(): Promise<HostUser | null> {
  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string" || claims.sub.length === 0) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

export type EventRole = "owner" | "cohost";

export type OwnedEventResult =
  | { ok: true; host: HostUser; event: EventRow; role: EventRole }
  | { ok: false; response: ReturnType<typeof jsonError> };

/**
 * True when `userId` is a co-host of `eventId`. Only called for non-owners, so
 * owners never pay for (or depend on) this query.
 */
export async function isCohost(eventId: string, userId: string): Promise<boolean> {
  const { data, error } = await getAdminDb()
    .from("event_cohosts")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[host-auth] ${error.message}`);
  return Boolean(data);
}

/** The signed-in host's role on an event they can manage, or null. */
export async function eventRoleFor(event: Pick<EventRow, "id" | "owner_id">, userId: string): Promise<EventRole | null> {
  if (event.owner_id === userId) return "owner";
  return (await isCohost(event.id, userId)) ? "cohost" : null;
}

/**
 * Authenticates the host and loads an event they may manage: its owner, or a
 * co-host unless `ownerOnly` (delete event, manage co-hosts). Anything else is
 * a 404 so event IDs are never confirmed. Drive access always stays with the
 * owner (`driveForEvent` uses `event.owner_id`), whoever makes the request.
 */
export async function requireEventAccess(eventId: string, options: { ownerOnly?: boolean } = {}): Promise<OwnedEventResult> {
  const host = await getHostUser();
  if (!host) return { ok: false, response: jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.") };
  const notFound = { ok: false as const, response: jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.") };
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return notFound;
  const { data, error } = await getAdminDb().from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw new Error(`[host-auth] ${error.message}`);
  if (!data) return notFound;
  const event = data as EventRow;
  if (event.owner_id === host.id) return { ok: true, host, event, role: "owner" };
  if (options.ownerOnly) return notFound;
  if (!(await isCohost(event.id, host.id))) return notFound;
  return { ok: true, host, event, role: "cohost" };
}
