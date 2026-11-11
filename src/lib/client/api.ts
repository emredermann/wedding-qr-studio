"use client";

import { translateLoose } from "@/lib/i18n/translate";
import type { ApiErrorBody } from "@/types/domain";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** fetch wrapper: JSON in/out, same-origin cookies. Error messages are Turkish; `errorMessage` translates them for display. */
export async function apiFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      credentials: "same-origin",
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Bağlantı hatası. İnternet bağlantınızı kontrol edin.");
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `İstek başarısız (${res.status}).`);
  }
  return body as T;
}

/** User-facing text for any error, in the current language. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return translateLoose(error.message);
  return translateLoose("Beklenmeyen bir hata oluştu.");
}
