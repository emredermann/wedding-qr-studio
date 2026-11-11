import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { readGuestSession } from "@/lib/guest-session";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Optional `{ name }` body: the name the guest typed on the welcome screen. */
async function readGuestName(request: NextRequest): Promise<string | null> {
  try {
    const body = (await request.json()) as { name?: unknown };
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
    return name || null;
  } catch {
    return null;
  }
}

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
      .select("id, status, guest_session_id, events!inner(*)")
      .eq("id", mediaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as
      | { id: string; status: string; guest_session_id: string | null; events: { gallery_public: boolean; hearts_named?: boolean } }
      | null;
    if (!row || row.status !== "approved") return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");
    if (!row.events.gallery_public && row.guest_session_id !== guest.sessionId) {
      return jsonError(404, "NOT_FOUND", "Dosya bulunamadı.");
    }

    // The guest's name is always recorded; whether the host may see it is
    // snapshotted from the event setting (0003 migration).
    const name = await readGuestName(request);
    let toggled = await db.rpc("toggle_media_heart", {
      p_media_id: row.id,
      p_session: guest.sessionId,
      p_name: name,
      p_name_visible: row.events.hearts_named === true,
    });
    if (toggled.error) {
      // 0003 not run yet: fall back to the anonymous 2-argument version.
      console.warn("[media:heart] named toggle unavailable, falling back", toggled.error.message);
      toggled = await db.rpc("toggle_media_heart", { p_media_id: row.id, p_session: guest.sessionId });
    }
    if (toggled.error) throw new Error(toggled.error.message);
    const result = (Array.isArray(toggled.data) ? toggled.data[0] : toggled.data) as { hearted: boolean; heart_count: number } | null;
    return jsonOk({ hearted: Boolean(result?.hearted), heartCount: Number(result?.heart_count ?? 0) });
  } catch (error) {
    return handleRouteError("media:heart", error);
  }
}
