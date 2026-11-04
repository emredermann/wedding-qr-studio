import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env.public";
import { getSupabaseServerEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Per-request SSR client for Server Components, Server Actions and Route
 * Handlers. Acts as the signed-in user — every query is subject to RLS.
 * Never cache it across requests: it is bound to this request's cookies.
 */
export async function createSupabaseServerClient(): Promise<TypedSupabaseClient> {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
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
          // Server Components cannot write cookies; `src/proxy.ts` refreshes
          // the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}

let adminClient: TypedSupabaseClient | null = null;

/**
 * Service-role client that BYPASSES RLS when `SUPABASE_SERVICE_ROLE_KEY` is
 * configured. If `SUPABASE_SERVICE_ROLE_KEY` has not been added to `.env.local`
 * yet, falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` so public/RLS-permitted
 * queries continue working without crashing.
 */
export function getSupabaseAdminClient(): TypedSupabaseClient {
  if (adminClient) return adminClient;
  const env = getSupabaseServerEnv();
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY.length >= 20
      ? env.SUPABASE_SERVICE_ROLE_KEY
      : env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  adminClient = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        "x-wqr-server-key": env.SUPABASE_SERVER_RPC_SECRET,
      },
    },
  });
  return adminClient;
}

/**
 * Returns `getSupabaseAdminClient()` when `SUPABASE_SERVICE_ROLE_KEY` is set,
 * or the cookie-authenticated `createSupabaseServerClient()` so signed-in
 * couples and super-admins operate under their own JWT session via RLS.
 */
export async function getSupabasePrivilegedClient(): Promise<TypedSupabaseClient> {
  const env = getSupabaseServerEnv();
  if (env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY.length >= 20) {
    return getSupabaseAdminClient();
  }
  return createSupabaseServerClient();
}
