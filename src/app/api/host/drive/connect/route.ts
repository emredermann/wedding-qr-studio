import { randomBytes } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { handleRouteError } from "@/lib/api/http";
import { appOrigin, buildGoogleAuthUrl, createPkcePair, DRIVE_OAUTH_COOKIE, OAUTH_CALLBACK_PATH } from "@/lib/google-oauth";
import { getHostUser } from "@/lib/host-auth";
import { rateLimit } from "@/lib/rate-limit";
import { signToken } from "@/lib/signing";

export const runtime = "nodejs";

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * GET /api/host/drive/connect — starts "Connect Google Drive".
 * The signed `state` binds the flow to this host; the PKCE verifier and a
 * nonce live in a short-lived HttpOnly cookie that must match on callback.
 */
export async function GET(request: NextRequest) {
  try {
    const host = await getHostUser();
    if (!host) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", "/dashboard");
      return NextResponse.redirect(login);
    }
    const limited = await rateLimit(request, "drive-connect", 20, 600, host.id);
    if (limited) return limited;

    const nonce = randomBytes(16).toString("base64url");
    const { verifier, challenge } = createPkcePair();
    const expiresAt = Date.now() + STATE_TTL_MS;
    const redirectUri = `${appOrigin(request.nextUrl.origin)}${OAUTH_CALLBACK_PATH}`;

    const state = signToken("drive-oauth-state", { u: host.id, n: nonce, x: expiresAt });
    const response = NextResponse.redirect(buildGoogleAuthUrl({ redirectUri, state, challenge, loginHint: host.email }));
    response.cookies.set(DRIVE_OAUTH_COOKIE, signToken("drive-oauth-cookie", { n: nonce, v: verifier, x: expiresAt }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/host/drive",
      maxAge: STATE_TTL_MS / 1000,
    });
    return response;
  } catch (error) {
    return handleRouteError("host:drive:connect", error);
  }
}
