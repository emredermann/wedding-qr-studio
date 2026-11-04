"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env.public";
import type { Database } from "@/types/database";

let browserClient: SupabaseClient<Database> | null = null;

/** Singleton Supabase client for Client Components (cookie-based session). */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  browserClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  return browserClient;
}
