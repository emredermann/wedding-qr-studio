import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

import { DriveError, DriveNotConnectedError } from "@/lib/drive";
import { ServerMisconfiguredError } from "@/lib/env.server";
import type { ApiErrorBody } from "@/types/domain";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function jsonOk<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function jsonError(
  status: number,
  code: string,
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

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse<ApiErrorBody> };

/** Reads and validates a JSON body with a hard byte cap. */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = 64 * 1024,
): Promise<ParseResult<z.infer<S>>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, response: jsonError(415, "BAD_REQUEST", "Content-Type application/json olmalı.") };
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: jsonError(413, "BAD_REQUEST", "İstek gövdesi çok büyük.") };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: jsonError(400, "BAD_REQUEST", "İstek gövdesi okunamadı.") };
  }
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, response: jsonError(413, "BAD_REQUEST", "İstek gövdesi çok büyük.") };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, response: jsonError(400, "BAD_REQUEST", "Geçersiz JSON.") };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(422, "VALIDATION_FAILED", "Gönderilen bilgiler geçersiz.", zodIssuesToDetails(parsed.error.issues)),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Maps unexpected errors to a safe JSON response and logs the details. */
export function handleRouteError(scope: string, error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ServerMisconfiguredError) {
    console.error(`[${scope}] ${error.message}`);
    return jsonError(503, "SERVER_MISCONFIGURED", "Sunucu yapılandırması eksik. Yönetici .env değişkenlerini kontrol etmeli.", {
      env: error.problems,
    });
  }
  if (error instanceof DriveNotConnectedError) {
    console.warn(`[${scope}] ${error.message}`);
    return jsonError(409, "DRIVE_NOT_CONNECTED", error.message);
  }
  if (error instanceof DriveError) {
    console.error(`[${scope}] Google Drive error`, { status: error.status, reason: error.reason, message: error.message });
    if (error.reason === "invalid_grant") {
      return error.account === "host"
        ? jsonError(503, "DRIVE_AUTH_FAILED", "Etkinlik sahibinin Google Drive bağlantısı geçersiz. Etkinlik sahibi panelden Google Drive'ı yeniden bağlamalı.")
        : jsonError(503, "DRIVE_AUTH_FAILED", "Google Drive yetkisi geçersiz. Yönetici `npm run drive:token` ile yeni token üretmeli.");
    }
    return jsonError(502, "DRIVE_ERROR", "Google Drive şu anda yanıt vermiyor. Lütfen tekrar deneyin.");
  }
  const detail = error instanceof Error ? error.message : String(error);
  if (SCHEMA_ERROR_PATTERN.test(detail)) {
    console.error(`[${scope}] database schema is missing or outdated: ${detail}`);
    return jsonError(
      503,
      "DB_SCHEMA_OUTDATED",
      "Veritabanı şeması eksik veya eski. Supabase SQL Editor'da supabase/migrations/0001_wedding_qr_drive.sql dosyasını çalıştırın.",
      process.env.NODE_ENV === "production" ? undefined : { debug: [detail] },
    );
  }
  console.error(`[${scope}] unexpected error`, error);
  // In development, show the real cause on screen to speed up debugging; never in production.
  return jsonError(
    500,
    "INTERNAL_ERROR",
    process.env.NODE_ENV === "production"
      ? "Beklenmeyen bir sunucu hatası oluştu."
      : `Beklenmeyen bir sunucu hatası oluştu. (${scope}: ${detail})`,
  );
}

/** PostgREST / Postgres messages that mean "run the migration". */
const SCHEMA_ERROR_PATTERN =
  /relation "[^"]+" does not exist|column [^ ]+ does not exist|Could not find the (table|function|.*column)|schema cache|PGRST20[25]|42P01|42703|42883/i;

/** Throws if a Supabase query returned an error. */
export function assertDb<T>(result: { data: T; error: { message: string; code?: string } | null }, scope: string): T {
  if (result.error) {
    throw new Error(`[db:${scope}] ${result.error.code ?? ""} ${result.error.message}`);
  }
  return result.data;
}
