import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env.server";

function hmac(purpose: string, payload: string): string {
  return createHmac("sha256", getServerEnv().APP_SECRET).update(`${purpose}:${payload}`, "utf8").digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Signs a JSON payload: `<base64url(json)>.<base64url(hmac)>`. */
export function signToken<T extends object>(purpose: string, payload: T): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmac(purpose, body)}`;
}

/** Verifies and decodes a token produced by `signToken`, or returns null. */
export function verifyToken<T>(purpose: string, token: string | null | undefined): T | null {
  if (!token || token.length > 4096) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, hmac(purpose, body))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
