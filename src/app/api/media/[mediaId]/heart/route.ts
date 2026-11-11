import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { readGuestSession } from "@/lib/guest-session";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/media/:mediaId/heart — a guest toggles their heart on an approved item.
 * One heart per guest session per item; the count is updated atomically in
 * Postgres (toggle_media_heart). In a private gallery a guest can only heart
 * their own uploads. Anything else answers 404 so IDs are never confirmed.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ mediaId: string }> }) {
  try {
    const { mediaId } = await context.params;
    const guest = readGuestSession(request);
    if (!guest) return jsonError(401, "NO_GUEST_SESSION", "Oturum bulunamadı. Sayfayı yenileyip tekrar deneyin.");

    const limited = await rateLimit(request, "heart", 120, 60, guest.sessionId);
    if (limited) return limited;
    // A fresh guest cookie resets the per-session limit, so also cap per IP.
    // The ceiling is high on purpose: many guests share the venue Wi-Fi (one IP).
    const limitedIp = await rateLimit(request, "heart-ip", 3000, 600);
    if (limitedIp) return limitedIp;

    if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");

    const db = getAdminDb();
    const { data, error } = await db
      .from("media_items")
      .select("id, status, guest_session_id, events!inner(gallery_public)")
      .eq("id", mediaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as { id: string; status: string; guest_session_id: string | null; events: { gallery_public: boolean } } | null;
    if (!row || row.status !== "approved") return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");
    if (!row.events.gallery_public && row.guest_session_id !== guest.sessionId) {
      return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");
    }

    const toggled = await db.rpc("toggle_media_heart", { p_media_id: row.id, p_session: guest.sessionId });
    if (toggled.error) throw new Error(toggled.error.message);
    const result = (Array.isArray(toggled.data) ? toggled.data[0] : toggled.data) as { hearted: boolean; heart_count: number } | null;
    return jsonOk({ hearted: Boolean(result?.hearted), heartCount: Number(result?.heart_count ?? 0) });
  } catch (error) {
    return handleRouteError("media:heart", error);
  }
}
