import "server-only";

import type { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
import { resolveClientIp } from "@/lib/client-ip";
import { getAdminDb } from "@/lib/supabase/server";
import type { ApiErrorBody } from "@/types/domain";

export function clientIp(request: NextRequest): string {
  return resolveClientIp(request.headers);
}

/**
 * Fixed-window limiter backed by Postgres, so it works across serverless
 * instances. Fails open (allows) if the database call itself fails, because a
 * limiter outage must not take the event down.
 */
export async function rateLimit(
  request: NextRequest,
  namespace: string,
  limit: number,
  windowSeconds: number,
  subject?: string,
): Promise<NextResponse<ApiErrorBody> | null> {
  const bucket = `${namespace}:${clientIp(request)}${subject ? `:${subject.slice(0, 64)}` : ""}`;
  try {
    const { data, error } = await getAdminDb().rpc("consume_rate_limit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.warn("[rate-limit] rpc failed, allowing request", error.message);
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; retry_after_seconds: number } | null;
    if (row && !row.allowed) {
      const response = jsonError(429, "RATE_LIMITED", `Çok fazla istek. ${row.retry_after_seconds} sn sonra tekrar deneyin.`);
      response.headers.set("Retry-After", String(row.retry_after_seconds));
      return response;
    }
    return null;
  } catch (error) {
    console.warn("[rate-limit] unexpected failure, allowing request", error);
    return null;
  }
}
