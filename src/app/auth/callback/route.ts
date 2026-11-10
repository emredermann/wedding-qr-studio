import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/safe-redirect";
import { createAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const OTP_TYPES: ReadonlySet<string> = new Set(["signup", "email", "magiclink", "recovery", "invite", "email_change"]);

function loginWithError(request: NextRequest, reason: string): NextResponse {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

/**
 * GET /auth/callback — completes Supabase e-mail confirmation / magic links.
 *
 * Supports both link styles:
 *  - `?token_hash=…&type=signup` (works when the link is opened on ANY device
 *    or browser; enable it via the e-mail template, see DEPLOYMENT.md), and
 *  - `?code=…` (PKCE; only works in the browser that started the sign-up).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));

  // Supabase forwards verification failures (e.g. expired link) as query params.
  const supabaseError = params.get("error_code") ?? params.get("error");
  if (supabaseError) return loginWithError(request, supabaseError === "otp_expired" ? "expired" : "callback");

  try {
    const supabase = await createAuthClient();

    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    if (tokenHash && type && OTP_TYPES.has(type)) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
      if (!error) return NextResponse.redirect(new URL(next, request.url));
      console.error("[auth:callback] verifyOtp failed", error.message);
      return loginWithError(request, /expired/i.test(error.message) ? "expired" : "callback");
    }

    const code = params.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, request.url));
      console.error("[auth:callback] exchangeCodeForSession failed", error.message);
      // Typical cause: the link was opened in another browser/device than the sign-up.
      return loginWithError(request, "other_device");
    }
  } catch (error) {
    console.error("[auth:callback] unexpected error", error);
  }
  return loginWithError(request, "callback");
}
