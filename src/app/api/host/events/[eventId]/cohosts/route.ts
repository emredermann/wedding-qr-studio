import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { addCohost, COHOST_ERRORS, listCohosts, removeCohost, type CohostDto } from "@/lib/cohosts";
import { requireEventAccess } from "@/lib/host-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ eventId: string }> };

const addSchema = z.object({ username: z.string().trim().min(1).max(64) });

/** GET /api/host/events/:eventId/cohosts — owner only. */
export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId, { ownerOnly: true });
    if (!owned.ok) return owned.response;
    return jsonOk<{ items: CohostDto[] }>({ items: await listCohosts(owned.event.id) });
  } catch (error) {
    return handleRouteError("host:cohosts:list", error);
  }
}

/** POST /api/host/events/:eventId/cohosts { username } — owner only; adds an existing Mira account. */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId, { ownerOnly: true });
    if (!owned.ok) return owned.response;
    // Bounds username probing (the error never says whether an account exists).
    const limited = await rateLimit(request, "cohost-add", 20, 600, owned.host.id);
    if (limited) return limited;

    const body = await parseJsonBody(request, addSchema, 2 * 1024);
    if (!body.ok) return body.response;

    const result = await addCohost(owned.event.id, owned.host.id, body.data.username);
    if (!result.ok) return jsonError(result.reason === "limit" ? 409 : 422, "COHOST_NOT_ADDED", COHOST_ERRORS[result.reason]);
    return jsonOk<{ items: CohostDto[] }>({ items: await listCohosts(owned.event.id) }, 201);
  } catch (error) {
    return handleRouteError("host:cohosts:add", error);
  }
}

/** DELETE /api/host/events/:eventId/cohosts?userId=… — owner only. */
export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId, { ownerOnly: true });
    if (!owned.ok) return owned.response;
    const userId = request.nextUrl.searchParams.get("userId") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return jsonError(404, "NOT_FOUND", "Ortak yönetici bulunamadı.");
    await removeCohost(owned.event.id, userId);
    return jsonOk<{ items: CohostDto[] }>({ items: await listCohosts(owned.event.id) });
  } catch (error) {
    return handleRouteError("host:cohosts:remove", error);
  }
}
