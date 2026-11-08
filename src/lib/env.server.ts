import "server-only";

import { z } from "zod";

/**
 * True for Supabase server keys: new-style `sb_secret_…` or a legacy JWT whose
 * role is `service_role`. Rejects the public anon / `sb_publishable_…` keys,
 * which would make every server query fail with "permission denied".
 */
function isServerRoleKey(key: string): boolean {
  if (key.startsWith("sb_publishable_")) return false;
  if (key.startsWith("sb_secret_")) return true;
  const payload = key.split(".")[1];
  if (!payload) return true;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: string };
    return claims.role === undefined || claims.role === "service_role";
  } catch {
    return true;
  }
}

/**
 * Server environment, validated once per process. Nothing here is ever
 * hard-coded: every secret comes from `process.env`.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("must be a valid URL (https://<ref>.supabase.co)"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "missing or too short"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, "missing (Supabase → Project Settings → API → service_role / secret key)")
    .refine(isServerRoleKey, "this is a PUBLIC (anon / sb_publishable_) key — use the service_role or sb_secret_ key"),
  GOOGLE_CLIENT_ID: z
    .string()
    .regex(/^[\w.-]+\.apps\.googleusercontent\.com$/, "missing (Google Cloud → Credentials → OAuth client ID, ends with .apps.googleusercontent.com)"),
  GOOGLE_CLIENT_SECRET: z.string().min(10, "missing (shown next to the OAuth client ID)"),
  /**
   * Optional "platform Drive": used for events whose host has not connected
   * their own Google Drive. Set both (via `npm run drive:token -- --write`)
   * or neither — without them every host must connect their own Drive.
   */
  GOOGLE_REFRESH_TOKEN: z.string().min(10, "too short — run `npm run drive:token`").optional(),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z
    .string()
    .regex(/^[A-Za-z0-9_-]{10,128}$/, "not a Drive folder ID — created by `npm run drive:token -- --write`")
    .optional(),
  APP_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -hex 32)"),
}).refine(
  (env) => Boolean(env.GOOGLE_REFRESH_TOKEN) === Boolean(env.GOOGLE_DRIVE_ROOT_FOLDER_ID),
  {
    message: "set both GOOGLE_REFRESH_TOKEN and GOOGLE_DRIVE_ROOT_FOLDER_ID (platform Drive) or leave both empty (hosts connect their own Drive)",
    path: ["GOOGLE_REFRESH_TOKEN"],
  },
);

export type ServerEnv = z.infer<typeof serverEnvSchema>;


let cached: ServerEnv | null = null;

export class ServerMisconfiguredError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Server environment is not configured: ${problems.join("; ")}`);
    this.name = "ServerMisconfiguredError";
    this.problems = problems;
  }
}

function readRaw(): Record<keyof ServerEnv, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.trim(),
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET?.trim(),
    // Empty strings (e.g. `KEY=` in .env.local) count as "not set" for the optional pair.
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN?.trim() || undefined,
    GOOGLE_DRIVE_ROOT_FOLDER_ID: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || undefined,
    APP_SECRET: process.env.APP_SECRET?.trim(),
  };
}

/** Returns a list of human-readable problems, or an empty list when valid. */
export function describeServerEnvProblems(): string[] {
  const parsed = serverEnvSchema.safeParse(readRaw());
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(readRaw());
  if (!parsed.success) {
    throw new ServerMisconfiguredError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  cached = parsed.data;
  return cached;
}
