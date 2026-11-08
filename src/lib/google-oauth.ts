import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getServerEnv } from "@/lib/env.server";

/** Scopes for "Connect Google Drive": identity + access to files this app creates only. */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SCOPES = ["openid", "email", DRIVE_FILE_SCOPE];

export const OAUTH_CALLBACK_PATH = "/api/host/drive/callback";
/** HttpOnly cookie carrying the PKCE verifier + nonce between connect and callback. */
export const DRIVE_OAUTH_COOKIE = "wqr_drive_oauth";

/** Public origin of the app; must match the redirect URI registered in Google Cloud. */
export function appOrigin(requestOrigin: string): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || requestOrigin;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildGoogleAuthUrl(params: { redirectUri: string; state: string; challenge: string; loginHint?: string | null }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: getServerEnv().GOOGLE_CLIENT_ID,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // Always ask for consent so Google returns a refresh token every time.
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state: params.state,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    ...(params.loginHint ? { login_hint: params.loginHint } : {}),
  }).toString();
  return url.toString();
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
}

export class GoogleOAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleOAuthError";
    this.code = code;
  }
}

export async function exchangeAuthorizationCode(params: { code: string; redirectUri: string; verifier: string }): Promise<GoogleTokens> {
  const env = getServerEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
      code_verifier: params.verifier,
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new GoogleOAuthError("token_exchange", `${json.error ?? res.status}: ${json.error_description ?? ""}`.trim());
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    scopes: (json.scope ?? "").split(/\s+/).filter(Boolean),
  };
}

export async function fetchGoogleIdentity(accessToken: string): Promise<{ sub: string; email: string | null }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { sub?: string; email?: string };
  if (!res.ok || !json.sub) throw new GoogleOAuthError("userinfo", `userinfo failed (${res.status})`);
  return { sub: json.sub, email: json.email ?? null };
}

/** Revokes a refresh/access token at Google. Best-effort: failures are logged. */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      cache: "no-store",
    });
    if (!res.ok && res.status !== 400) console.warn("[google-oauth] revoke failed", res.status);
  } catch (error) {
    console.warn("[google-oauth] revoke failed", error);
  }
}
