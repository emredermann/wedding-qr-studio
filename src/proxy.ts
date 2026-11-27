import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Optional second domain for the invitations product (e.g. davetiye.example.com):
 * its home page shows /davetiye. Everything else (login, dashboard, /d/…) is
 * sent to the main domain (NEXT_PUBLIC_APP_URL), so sign-in cookies and the
 * Google Drive connection live on one domain.
 */
const INVITE_HOST = process.env.INVITE_HOST?.trim().toLowerCase() || null;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || null;

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase().split(":")[0];
  if (INVITE_HOST && host === INVITE_HOST) {
    const { pathname, search } = request.nextUrl;
    if (pathname === "/") return NextResponse.rewrite(new URL("/davetiye", request.url));
    if (pathname !== "/davetiye" && APP_URL && new URL(APP_URL).hostname !== INVITE_HOST) {
      return NextResponse.redirect(`${APP_URL}${pathname}${search}`, 308);
    }
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on pages and host APIs only. Skip:
     *  - Next.js internals and static assets (incl. face-api models in /models)
     *  - Guest APIs (/api/events/*, /api/drive/*, /api/media/*, /api/invite/*): anonymous, high volume
     */
    "/((?!_next/static|_next/image|favicon.ico|models/|api/events/|api/drive/|api/media/|api/invite/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|bin|json)$).*)",
  ],
};
