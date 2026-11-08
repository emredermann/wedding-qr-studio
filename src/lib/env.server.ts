import "server-only";

import { z } from "zod";

/**
 * Server environment, validated once per process. Nothing here is ever
 * hard-coded: every secret comes from `process.env`.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("must be a valid URL (https://<ref>.supabase.co)"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "missing or too short"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "missing (Supabase → Project Settings → API → service_role / secret key)"),
  GOOGLE_CLIENT_ID: z
    .string()
    .regex(/^[\w.-]+\.apps\.googleusercontent\.com$/, "missing (Google Cloud → Credentials → OAuth client ID, ends with .apps.googleusercontent.com)"),
  GOOGLE_CLIENT_SECRET: z.string().min(10, "missing (shown next to the OAuth client ID)"),
  GOOGLE_REFRESH_TOKEN: z.string().min(10, "missing — run `npm run drive:token`"),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().regex(/^[A-Za-z0-9_-]{10,128}$/, "missing — created by `npm run drive:token -- --write`"),
  APP_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -hex 32)"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const REQUIRED_SERVER_ENV_KEYS = Object.keys(serverEnvSchema.shape) as ReadonlyArray<keyof ServerEnv>;

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
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN?.trim(),
    GOOGLE_DRIVE_ROOT_FOLDER_ID: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim(),
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
