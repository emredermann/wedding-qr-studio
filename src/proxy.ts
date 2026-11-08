import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on pages and host APIs only. Skip:
     *  - Next.js internals and static assets (incl. face-api models in /models)
     *  - Guest APIs (/api/events/*, /api/drive/*, /api/media/*): anonymous, high volume
     */
    "/((?!_next/static|_next/image|favicon.ico|models/|api/events/|api/drive/|api/media/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|bin|json)$).*)",
  ],
};
