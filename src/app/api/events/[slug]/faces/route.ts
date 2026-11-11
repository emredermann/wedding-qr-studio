import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { findEventBySlug, toMediaDto } from "@/lib/events";
import { readGuestSession } from "@/lib/guest-session";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";
import type { MediaDto, MediaItemRow } from "@/types/domain";
import { mediaColumns } from "@/lib/schema-features";

export const runtime = "nodejs";

const schema = z.object({
  descriptor: z.array(z.number().min(-2).max(2)).length(128),
  /** Euclidean distance threshold; face-api.js uses ~0.6, 0.5 is stricter. */
  maxDistance: z.number().min(0.35).max(0.65).default(0.5),
});

/**
 * POST /api/events/:slug/faces — "Find My Photos".
 * The selfie never leaves the guest's browser: only its 128-d descriptor is
 * sent, compared with Euclidean distance in Postgres (pgvector `<->`).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const columns = await mediaColumns();
    const { slug } = await context.params;
    const guest = readGuestSession(request);
    const limited = await rateLimit(request, "face-match", 20, 60, guest?.sessionId);
    if (limited) return limited;

    const body = await parseJsonBody(request, schema, 16 * 1024);
    if (!body.ok) return body.response;

    const event = await findEventBySlug(slug);
    if (!event) return jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.");
    if (!event.face_search_enabled) return jsonError(403, "FACE_SEARCH_DISABLED", "Yüz arama bu etkinlikte kapalı.");
    // Private gallery: "Beni Bul" is off. Faces are still indexed on upload, so it
    // works for every photo again if the host makes the gallery public later.
    if (!event.gallery_public) return jsonError(403, "FACE_SEARCH_DISABLED", "Yüz arama bu etkinlikte kapalı.");

    const db = getAdminDb();
    const match = await db.rpc("match_event_faces", {
      p_event_id: event.id,
      p_descriptor: `[${body.data.descriptor.join(",")}]`,
      // The app never sends maxDistance (default 0.5). Capping it here keeps the app
      // identical while stopping hand-crafted requests from loosening the match.
      p_max_distance: Math.min(body.data.maxDistance, 0.5),
      p_limit: 200,
    });
    if (match.error) throw new Error(match.error.message);
    const matches = (match.data ?? []) as Array<{ media_id: string; distance: number }>;
    if (matches.length === 0) return jsonOk<{ items: MediaDto[] }>({ items: [] });

    const distanceById = new Map(matches.map((m) => [m.media_id, m.distance]));
    const { data, error } = await db
      .from("media_items")
      .select(columns)
      .in("id", [...distanceById.keys()])
      .eq("status", "approved");
    if (error) throw new Error(error.message);

    const items = ((data ?? []) as MediaItemRow[])
      .sort((a, b) => (distanceById.get(a.id) ?? 1) - (distanceById.get(b.id) ?? 1))
      .map((row) => toMediaDto(row, guest?.sessionId ?? null));
    return jsonOk<{ items: MediaDto[] }>({ items });
  } catch (error) {
    return handleRouteError("faces:match", error);
  }
}
