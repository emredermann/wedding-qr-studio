/**
 * Public (browser-safe) environment. Each variable must be referenced as a
 * literal `process.env.NEXT_PUBLIC_*` expression so Next.js can inline it.
 */
export interface PublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

let cachedPublicEnv: PublicEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.",
    );
  }

  try {
    new URL(supabaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }

  cachedPublicEnv = { supabaseUrl, supabaseAnonKey };
  return cachedPublicEnv;
}
