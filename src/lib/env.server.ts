import "server-only";

import { z } from "zod";

const DEFAULT_SERVER_RPC_SECRET =
  "wqr_srv_9f4e2a8c1d7b6e3f5a0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c";

const supabaseServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_SERVER_RPC_SECRET: z.string().min(32).default(DEFAULT_SERVER_RPC_SECRET),
});

const r2ServerEnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/i, "must be a 32-char hex Cloudflare account id"),
  R2_ACCESS_KEY_ID: z.string().min(16),
  R2_SECRET_ACCESS_KEY: z.string().min(32),
  R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, "must be a valid bucket name"),
  R2_PUBLIC_URL: z
    .url()
    .refine((v) => v.startsWith("https://") || v.startsWith("http://localhost"), "must use https")
    .transform((v) => v.replace(/\/+$/, "")),
});

export type SupabaseServerEnv = z.infer<typeof supabaseServerEnvSchema>;
export type R2ServerEnv = z.infer<typeof r2ServerEnvSchema>;
export type ServerEnv = SupabaseServerEnv & R2ServerEnv;

let cachedSupabaseEnv: SupabaseServerEnv | null = null;
let cachedR2Env: R2ServerEnv | null = null;

export function getSupabaseServerEnv(): SupabaseServerEnv {
  if (cachedSupabaseEnv) return cachedSupabaseEnv;

  const parsed = supabaseServerEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    SUPABASE_SERVER_RPC_SECRET:
      process.env.SUPABASE_SERVER_RPC_SECRET?.trim() || DEFAULT_SERVER_RPC_SECRET,
  });

  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid Supabase environment configuration — ${fields}`);
  }

  cachedSupabaseEnv = parsed.data;
  return cachedSupabaseEnv;
}

export function isR2Configured(): boolean {
  return r2ServerEnvSchema.safeParse({
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID?.trim(),
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID?.trim(),
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY?.trim(),
    R2_BUCKET: process.env.R2_BUCKET?.trim(),
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL?.trim(),
  }).success;
}

export function getR2ServerEnv(): R2ServerEnv {
  if (cachedR2Env) return cachedR2Env;

  const parsed = r2ServerEnvSchema.safeParse({
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID?.trim(),
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID?.trim(),
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY?.trim(),
    R2_BUCKET: process.env.R2_BUCKET?.trim(),
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL?.trim(),
  });

  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid Cloudflare R2 environment configuration — ${fields}`);
  }

  cachedR2Env = parsed.data;
  return cachedR2Env;
}

export function getServerEnv(): ServerEnv {
  const supa = getSupabaseServerEnv();
  const r2 = getR2ServerEnv();
  return { ...supa, ...r2 };
}
