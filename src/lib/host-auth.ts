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

export type OwnedEventResult =
  | { ok: true; host: HostUser; event: EventRow }
  | { ok: false; response: ReturnType<typeof jsonError> };

/** Authenticates the host and loads an event they own (404 otherwise). */
export async function requireOwnedEvent(eventId: string): Promise<OwnedEventResult> {
  const host = await getHostUser();
  if (!host) return { ok: false, response: jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.") };
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
    return { ok: false, response: jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.") };
  }
  const { data, error } = await getAdminDb()
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("owner_id", host.id)
    .maybeSingle();
  if (error) throw new Error(`[host-auth] ${error.message}`);
  if (!data) return { ok: false, response: jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.") };
  return { ok: true, host, event: data as EventRow };
}
