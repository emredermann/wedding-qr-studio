import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { readGuestSession } from "@/lib/guest-session";
import { rateLimit } from "@/lib/rate-limit";
import { hasGuestDeleteColumn } from "@/lib/schema-features";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100).transform((list) => [...new Set(list)]),
});

/**
 * POST /api/media/lock — the guest moved on from the upload screen: their
 * listed uploads can no longer be deleted by them. Also sent with
 * navigator.sendBeacon when the page is closed. Only the caller's own rows
 * are touched; locking is one-way.
 */
export async function POST(request: NextRequest) {
  try {
    const guest = readGuestSession(request);
    if (!guest) return jsonError(401, "NO_GUEST_SESSION", "Oturum bulunamadı.");
    const limited = await rateLimit(request, "media-lock", 120, 60, guest.sessionId);
    if (limited) return limited;
    const body = await parseJsonBody(request, bodySchema, 8 * 1024);
    if (!body.ok) return body.response;
    if (!(await hasGuestDeleteColumn())) return jsonOk({ locked: 0 });

    const { data, error } = await getAdminDb()
      .from("media_items")
      .update({ guest_can_delete: false })
      .in("id", body.data.ids)
      .eq("guest_session_id", guest.sessionId)
      .select("id");
    if (error) throw new Error(error.message);
    return jsonOk({ locked: (data ?? []).length });
  } catch (error) {
    return handleRouteError("media:lock", error);
  }
}
