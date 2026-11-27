import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { invitationAccess, invitationsDto, requestOrigin } from "@/lib/invitations/host";
import type { InvitationsDto } from "@/lib/invitations/model";
import { markSheetDirty, syncSheet } from "@/lib/invitations/server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ eventId: string }> };

/**
 * POST — create / rewrite the Google Sheet now (and wait for it). The sheet
 * is otherwise updated automatically after each reply. Pro.
 */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const access = await invitationAccess(eventId, { write: true });
    if (!access.ok) return access.response;
    const limited = await rateLimit(request, "invite-sheet", 10, 60, access.host.id);
    if (limited) return limited;
    await markSheetDirty(access.event.id);
    const result = await syncSheet(access.event, requestOrigin(request));
    if (result.ok === false) return jsonError(502, "SHEET_SYNC_FAILED", result.error);
    return jsonOk<InvitationsDto>(await invitationsDto(access.event));
  } catch (error) {
    return handleRouteError("host:invitations:sheet", error);
  }
}
