import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { invitationAccess, invitationsDto, requestOrigin } from "@/lib/invitations/host";
import type { InvitationsDto } from "@/lib/invitations/model";
import { scheduleSheetSync } from "@/lib/invitations/server";
import { hasInviteSending } from "@/lib/schema-features";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ eventId: string }> };

const bodySchema = z.object({
  ids: z.array(z.string().regex(/^[0-9a-f-]{36}$/i)).min(1).max(500),
  sent: z.boolean(),
});

/** POST — mark many invitations as sent (now) or not sent. Pro. */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const access = await invitationAccess(eventId, { write: true });
    if (!access.ok) return access.response;
    if (!(await hasInviteSending())) {
      return jsonError(503, "INVITE_SENDING_NOT_SET_UP", "Toplu gönderim henüz kurulmamış. Yönetici supabase/migrations/0010_invite_sending.sql dosyasını çalıştırmalı.");
    }
    const parsed = await parseJsonBody(request, bodySchema, 64 * 1024);
    if (!parsed.ok) return parsed.response;
    const { error } = await getAdminDb()
      .from("invitees")
      .update({ sent_at: parsed.data.sent ? new Date().toISOString() : null })
      .eq("event_id", access.event.id)
      .in("id", parsed.data.ids);
    if (error) throw new Error(error.message);
    await scheduleSheetSync(access.event, requestOrigin(request));
    return jsonOk<InvitationsDto>(await invitationsDto(access.event));
  } catch (error) {
    return handleRouteError("host:invitations:sent", error);
  }
}
