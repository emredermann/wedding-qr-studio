import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { invitationAccess, invitationsDto, requestOrigin } from "@/lib/invitations/host";
import { INVITE_LIMITS, inviteeInputSchema, newToken, type InvitationsDto } from "@/lib/invitations/model";
import { scheduleSheetSync } from "@/lib/invitations/server";
import { hasInviteSending } from "@/lib/schema-features";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ eventId: string }> };

const bodySchema = z.object({ invitees: z.array(inviteeInputSchema).min(1).max(500) });

/** POST — add invitees (one or a pasted / imported list). Each gets its own link. Pro. */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const access = await invitationAccess(eventId, { write: true });
    if (!access.ok) return access.response;
    const parsed = await parseJsonBody(request, bodySchema, 256 * 1024);
    if (!parsed.ok) return parsed.response;
    const db = getAdminDb();

    const { count, error: countError } = await db.from("invitees").select("id", { count: "exact", head: true }).eq("event_id", access.event.id);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) + parsed.data.invitees.length > INVITE_LIMITS.invitees) {
      return jsonError(409, "INVITEE_LIMIT", `Bir etkinlikte en fazla ${INVITE_LIMITS.invitees} davetiye bağlantısı olabilir.`);
    }
    const withPhone = await hasInviteSending();
    const base = Date.now();
    const rows = parsed.data.invitees.map((i, n) => ({
      event_id: access.event.id,
      token: newToken(),
      name: i.name,
      group_name: i.group,
      max_party: i.maxParty,
      host_note: i.note,
      ...(withPhone && i.phone ? { phone: i.phone } : {}),
      // Keep the pasted order (created_at is the list order).
      created_at: new Date(base + n).toISOString(),
    }));
    const { error } = await db.from("invitees").insert(rows);
    if (error) throw new Error(error.message);
    await scheduleSheetSync(access.event, requestOrigin(request));
    return jsonOk<InvitationsDto>(await invitationsDto(access.event), 201);
  } catch (error) {
    return handleRouteError("host:invitees:post", error);
  }
}
