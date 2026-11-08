import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env.server";

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS, so it is used ONLY inside API routes after
 * the route has authorised the caller (host ownership or signed guest session).
 */
export function getAdminDb(): SupabaseClient {
  if (adminClient) return adminClient;
  const env = getServerEnv();
  adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return adminClient;
}

/** Cookie-bound client used only to read the signed-in host (Supabase Auth). */
export async function createAuthClient(): Promise<SupabaseClient> {
  const env = getServerEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a context that cannot set cookies; src/proxy.ts refreshes sessions.
        }
      },
    },
  });
}
