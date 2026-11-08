import { type NextRequest, NextResponse } from "next/server";

import { createDriveClient, DRIVE_FOLDER_MIME, forgetDriveAccount } from "@/lib/drive";
import { hostAccountKey, loadDriveConnection, sealRefreshToken } from "@/lib/drive-accounts";
import {
  appOrigin,
  DRIVE_FILE_SCOPE,
  DRIVE_OAUTH_COOKIE,
  exchangeAuthorizationCode,
  fetchGoogleIdentity,
  GoogleOAuthError,
  OAUTH_CALLBACK_PATH,
  revokeGoogleToken,
} from "@/lib/google-oauth";
import { getHostUser } from "@/lib/host-auth";
import { verifyToken } from "@/lib/signing";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const ROOT_FOLDER_NAME = "Wedding QR";

function finish(request: NextRequest, outcome: "connected" | "error", reason?: string): NextResponse {
  const target = new URL("/dashboard", appOrigin(request.nextUrl.origin));
  target.searchParams.set("drive", outcome);
  if (reason) target.searchParams.set("reason", reason);
  const response = NextResponse.redirect(target);
  response.cookies.set(DRIVE_OAUTH_COOKIE, "", { path: "/api/host/drive", maxAge: 0 });
  return response;
}

/**
 * GET /api/host/drive/callback — Google redirects here after consent.
 * Verifies state + nonce + PKCE, requires the drive.file scope, creates (or
 * reuses) the host's "Wedding QR" root folder and stores the encrypted
 * refresh token. Always redirects back to /dashboard with ?drive=…
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return finish(request, "error", params.get("error") === "access_denied" ? "denied" : "google");

  const host = await getHostUser().catch(() => null);
  if (!host) return finish(request, "error", "session");

  const state = verifyToken<{ u: string; n: string; x: number }>("drive-oauth-state", params.get("state"));
  const cookie = verifyToken<{ n: string; v: string; x: number }>(
    "drive-oauth-cookie",
    request.cookies.get(DRIVE_OAUTH_COOKIE)?.value,
  );
  const code = params.get("code");
  if (!state || !cookie || !code || state.u !== host.id || state.n !== cookie.n || state.x < Date.now()) {
    return finish(request, "error", "state");
  }

  let refreshTokenForCleanup: string | null = null;
  try {
    const redirectUri = `${appOrigin(request.nextUrl.origin)}${OAUTH_CALLBACK_PATH}`;
    const tokens = await exchangeAuthorizationCode({ code, redirectUri, verifier: cookie.v });
    refreshTokenForCleanup = tokens.refreshToken ?? tokens.accessToken;

    if (!tokens.scopes.includes(DRIVE_FILE_SCOPE)) {
      await revokeGoogleToken(refreshTokenForCleanup);
      return finish(request, "error", "scope");
    }
    if (!tokens.refreshToken) {
      await revokeGoogleToken(tokens.accessToken);
      return finish(request, "error", "refresh");
    }

    const identity = await fetchGoogleIdentity(tokens.accessToken);
    const existing = await loadDriveConnection(host.id);
    const db = getAdminDb();

    if (existing && existing.google_sub !== identity.sub) {
      // Existing events' folders live in the old account; switching would orphan them.
      const { count, error } = await db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", host.id)
        .eq("drive_account", "host");
      if (error) throw new Error(error.message);
      if ((count ?? 0) > 0) {
        await revokeGoogleToken(tokens.refreshToken);
        return finish(request, "error", "account_mismatch");
      }
    }

    const key = hostAccountKey(host.id);
    forgetDriveAccount(key);
    const drive = createDriveClient({ key, account: "host", refreshToken: tokens.refreshToken, rootFolderId: "" });

    // Reuse the previous root folder of the same Google account when it is still there.
    let rootFolderId: string | null = null;
    if (existing && existing.google_sub === identity.sub) {
      const folder = await drive.getFile(existing.root_folder_id).catch(() => null);
      if (folder && !folder.trashed && folder.mimeType === DRIVE_FOLDER_MIME) rootFolderId = folder.id;
    }
    rootFolderId ??= await drive.ensureFolder(ROOT_FOLDER_NAME, "root");

    const upsert = await db.from("drive_connections").upsert(
      {
        owner_id: host.id,
        google_sub: identity.sub,
        google_email: identity.email,
        refresh_token_enc: sealRefreshToken(tokens.refreshToken),
        root_folder_id: rootFolderId,
        status: "active",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    if (upsert.error) throw new Error(upsert.error.message);
    forgetDriveAccount(key);
    refreshTokenForCleanup = null;
    return finish(request, "connected");
  } catch (error) {
    console.error("[host:drive:callback] failed", error instanceof GoogleOAuthError ? error.message : error);
    if (refreshTokenForCleanup) await revokeGoogleToken(refreshTokenForCleanup);
    return finish(request, "error", error instanceof GoogleOAuthError ? error.code : "server");
  }
}
