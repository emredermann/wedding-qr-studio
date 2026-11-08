import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { findEventBySlug, toPublicEventDto } from "@/lib/events";
import { resolveGuestSession, withGuestCookie } from "@/lib/guest-session";
import { rateLimit } from "@/lib/rate-limit";
import type { PublicEventDto } from "@/types/domain";

export const runtime = "nodejs";

/** GET /api/events/:slug — public event info for the guest page and live wall. */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const limited = await rateLimit(request, "event", 240, 60);
    if (limited) return limited;

    const event = await findEventBySlug(slug);
    if (!event) return jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.");
    const guest = resolveGuestSession(request);
    return withGuestCookie(jsonOk<{ event: PublicEventDto }>({ event: toPublicEventDto(event) }), guest);
  } catch (error) {
    return handleRouteError("events:get", error);
  }
}
