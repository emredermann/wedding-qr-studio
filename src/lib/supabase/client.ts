"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env.public";

let browserClient: SupabaseClient | null = null;

/** Browser Supabase client — used ONLY for host authentication (sign in / out). */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
}
