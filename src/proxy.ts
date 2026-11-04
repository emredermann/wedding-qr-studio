import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on everything except:
     *  - Next.js internals and static assets
     *  - Guest API routes (anonymous, high-volume; no session needed)
     *  - Common image/media file extensions served from /public
     */
    "/((?!_next/static|_next/image|favicon.ico|api/events/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
