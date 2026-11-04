import "server-only";

import type { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
import type { ApiErrorBody } from "@/types/database";

interface MemoryWindowEntry {
  hits: number;
  resetAtMs: number;
}

const memoryBuckets = new Map<string, MemoryWindowEntry>();
const MAX_MEMORY_BUCKETS = 10_000;

function pruneExpiredMemoryBuckets(nowMs: number): void {
  if (memoryBuckets.size < MAX_MEMORY_BUCKETS) return;
  for (const [key, entry] of memoryBuckets.entries()) {
    if (entry.resetAtMs <= nowMs) {
      memoryBuckets.delete(key);
    }
  }
}

export function extractClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "127.0.0.1";
}

export interface RateLimitConfig {
  /** Logical route namespace, e.g. "upload:presign", "faces:match", "album:zip" */
  namespace: string;
  /** Maximum requests allowed within `windowSeconds` */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Optional subject key (e.g. sessionId, userId, albumId) combined with client IP */
  subject?: string | null;
}

export type RateLimitCheckResult =
  | {
      ok: true;
      remaining: number;
      limit: number;
    }
  | {
      ok: false;
      response: NextResponse<ApiErrorBody>;
    };

/**
 * Enforces fixed-window rate limiting per IP + subject to protect public and
 * compute-heavy endpoints (`/api/upload/presign`, `/api/upload/complete`,
 * `/api/faces/match`, `/api/faces/index`, `/api/albums/[albumId]/download`,
 * `/api/events/[slug]`) from storage depletion and DoS attacks.
 */
export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
): RateLimitCheckResult {
  const nowMs = Date.now();
  pruneExpiredMemoryBuckets(nowMs);

  const ip = extractClientIp(request);
  const subjectPart = config.subject ? `:${config.subject.slice(0, 64)}` : "";
  const bucketKey = `${config.namespace}:${ip}${subjectPart}`;
  const windowMs = Math.max(1000, config.windowSeconds * 1000);

  let entry = memoryBuckets.get(bucketKey);
  if (!entry || entry.resetAtMs <= nowMs) {
    entry = {
      hits: 1,
      resetAtMs: nowMs + windowMs,
    };
    memoryBuckets.set(bucketKey, entry);
  } else {
    entry.hits += 1;
  }

  const remaining = Math.max(0, config.limit - entry.hits);
  if (entry.hits > config.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAtMs - nowMs) / 1000));
    const response = jsonError(
      429,
      "RATE_LIMITED",
      `Too many requests. Please wait ${retryAfterSec}s before trying again.`,
    );
    response.headers.set("Retry-After", String(retryAfterSec));
    response.headers.set("X-RateLimit-Limit", String(config.limit));
    response.headers.set("X-RateLimit-Remaining", "0");
    return { ok: false, response };
  }

  return {
    ok: true,
    remaining,
    limit: config.limit,
  };
}
