import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { readChallenges } from "@/lib/event-extras";
import { readModules } from "@/lib/event-presets";
import { fetchAllRows, findEventBySlug } from "@/lib/events";
import { readGuestSession } from "@/lib/guest-session";
import { buildLeaderboard, type ChallengeEntryRow, type LeaderboardDto } from "@/lib/leaderboard";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/events/:slug/leaderboard — photo-challenge leaders (approved
 * uploads only). Names are only listed while the gallery is public; with a
 * private gallery a guest sees just their own standing.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const limited = await rateLimit(request, "leaderboard", 1500, 60);
    if (limited) return limited;
    const event = await findEventBySlug(slug);
    if (!event) return jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.");

    const challenges = readModules(event.modules).challenges ? readChallenges(event.challenges) : [];
    if (challenges.length === 0) {
      return jsonOk<LeaderboardDto>({ totalChallenges: 0, top: [], me: null, players: 0 });
    }

    const db = getAdminDb();
    const rows = await fetchAllRows<ChallengeEntryRow>(
      (from, to) =>
        db
          .from("media_items")
          .select("guest_session_id, guest_name, challenge_id, created_at")
          .eq("event_id", event.id)
          .eq("status", "approved")
          .not("challenge_id", "is", null)
          .order("id", { ascending: true })
          .range(from, to),
      1000,
      20_000,
    );
    const board = buildLeaderboard(
      rows,
      challenges.map((c) => c.id),
      { mySessionId: readGuestSession(request)?.sessionId ?? null, limit: 10, showNames: event.gallery_public },
    );
    return jsonOk<LeaderboardDto>(board, 200);
  } catch (error) {
    return handleRouteError("events:leaderboard", error);
  }
}
