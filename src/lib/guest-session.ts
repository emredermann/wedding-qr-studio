import "server-only";

import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { signToken, verifyToken } from "@/lib/signing";

/**
 * Anonymous guest identity: no account, no app. A random ID in a signed,
 * HttpOnly cookie lets guests see and manage their own uploads.
 */
export const GUEST_COOKIE = "wqr_guest";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

interface GuestPayload {
  sid: string;
}

export interface GuestSession {
  sessionId: string;
  token: string;
  isNew: boolean;
}

export function readGuestSession(request: NextRequest): GuestSession | null {
  const token = request.cookies.get(GUEST_COOKIE)?.value;
  const payload = verifyToken<GuestPayload>("guest", token);
  if (!payload || typeof payload.sid !== "string" || !/^[0-9a-f-]{36}$/.test(payload.sid) || !token) {
    return null;
  }
  return { sessionId: payload.sid, token, isNew: false };
}

export function resolveGuestSession(request: NextRequest): GuestSession {
  const existing = readGuestSession(request);
  if (existing) return existing;
  const sessionId = randomUUID();
  return { sessionId, token: signToken<GuestPayload>("guest", { sid: sessionId }), isNew: true };
}

export function withGuestCookie<T>(response: NextResponse<T>, session: GuestSession): NextResponse<T> {
  if (session.isNew) {
    response.cookies.set(GUEST_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  }
  return response;
}
