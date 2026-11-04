import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const GUEST_SESSION_COOKIE_NAME = "wqr_guest_session";
export const GUEST_SESSION_HEADER_NAME = "x-guest-session-token";
const GUEST_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days
const SESSION_ID_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

function getSessionSigningSecret(): string {
  return (
    process.env.GUEST_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.R2_SECRET_ACCESS_KEY?.trim() ||
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    "wedding-qr-studio-guest-session-hmac-secret-2026"
  );
}

function computeSessionHmac(sessionId: string): string {
  return createHmac("sha256", getSessionSigningSecret())
    .update(`wqr-session:${sessionId}`, "utf8")
    .digest("hex");
}

export function signGuestSessionToken(sessionId: string): string {
  return `${sessionId}.${computeSessionHmac(sessionId)}`;
}

export function verifyGuestSessionToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === token.length - 1) return null;

  const sessionId = token.slice(0, dotIdx);
  const providedHex = token.slice(dotIdx + 1);
  if (!SESSION_ID_REGEX.test(sessionId) || !/^[0-9a-f]{64}$/i.test(providedHex)) {
    return null;
  }

  const expectedHex = computeSessionHmac(sessionId);
  const bufA = Buffer.from(providedHex, "hex");
  const bufB = Buffer.from(expectedHex, "hex");
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
    return null;
  }
  return sessionId;
}

export interface VerifiedGuestSession {
  sessionId: string;
  signedToken: string;
  isNew: boolean;
}

/**
 * Extracts and cryptographically verifies the guest session from the signed
 * `wqr_guest_session` HttpOnly cookie (or `x-guest-session-token` header).
 * Never trusts an unsigned `guestSessionId` from query params or JSON body.
 */
export function getVerifiedGuestSession(request: NextRequest): VerifiedGuestSession | null {
  const cookieToken = request.cookies.get(GUEST_SESSION_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(GUEST_SESSION_HEADER_NAME);
  const rawToken = cookieToken || headerToken;
  const verifiedId = verifyGuestSessionToken(rawToken);
  if (!verifiedId || !rawToken) return null;
  return {
    sessionId: verifiedId,
    signedToken: rawToken,
    isNew: false,
  };
}

/**
 * Returns the verified guest session if present, or mints a fresh cryptographically
 * signed guest session ID.
 */
export function resolveOrMintGuestSession(request: NextRequest): VerifiedGuestSession {
  const existing = getVerifiedGuestSession(request);
  if (existing) return existing;

  const sessionId = randomUUID();
  const signedToken = signGuestSessionToken(sessionId);
  return {
    sessionId,
    signedToken,
    isNew: true,
  };
}

/**
 * Attaches the signed HttpOnly guest session cookie to a `NextResponse`.
 */
export function attachGuestSessionCookie<T>(
  response: NextResponse<T>,
  session: VerifiedGuestSession,
): NextResponse<T> {
  response.cookies.set(GUEST_SESSION_COOKIE_NAME, session.signedToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
