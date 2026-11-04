import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

import type { ApiErrorBody, ApiErrorCode, DatabaseErrorCode } from "@/types/database";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function jsonOk<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string[]>,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function zodIssuesToDetails(issues: readonly z.core.$ZodIssue[]): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_root";
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse<ApiErrorBody> };

/**
 * Reads and validates a JSON body with a hard byte cap, so a malicious client
 * cannot make the server buffer an arbitrarily large payload.
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = 64 * 1024,
): Promise<ParseResult<z.infer<S>>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, response: jsonError(415, "BAD_REQUEST", "Content-Type must be application/json.") };
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, response: jsonError(413, "BAD_REQUEST", "Request body is too large.") };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: jsonError(400, "BAD_REQUEST", "Unable to read request body.") };
  }

  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, response: jsonError(413, "BAD_REQUEST", "Request body is too large.") };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, response: jsonError(400, "BAD_REQUEST", "Request body is not valid JSON.") };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(422, "VALIDATION_FAILED", "Request validation failed.", zodIssuesToDetails(parsed.error.issues)),
    };
  }
  return { ok: true, data: parsed.data };
}

const DATABASE_ERROR_CODES: readonly DatabaseErrorCode[] = [
  "INVALID_ARGUMENTS",
  "ALBUM_NOT_ACCESSIBLE",
  "MEDIA_FACES_CAP_REACHED",
];

/** Extracts our custom PL/pgSQL exception code from a PostgREST error. */
export function getDatabaseErrorCode(error: { code?: string; message?: string } | null): DatabaseErrorCode | null {
  if (!error || error.code !== "P0001" || !error.message) return null;
  const match = DATABASE_ERROR_CODES.find((code) => code === error.message);
  return match ?? null;
}
