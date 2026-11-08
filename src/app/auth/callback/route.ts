import { type NextRequest, NextResponse } from "next/server";

import { createAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /auth/callback — completes Supabase email-confirmation / magic-link sign-in. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const rawNext = request.nextUrl.searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  if (code) {
    try {
      const supabase = await createAuthClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    } catch (error) {
      console.error("[auth:callback] exchange failed", error);
    }
  }
  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}
