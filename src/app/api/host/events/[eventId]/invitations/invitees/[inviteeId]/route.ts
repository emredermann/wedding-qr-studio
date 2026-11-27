import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { invitationAccess, invitationsDto, requestOrigin } from "@/lib/invitations/host";
import { INVITE_LIMITS, newToken, normalisePhone, type InvitationsDto } from "@/lib/invitations/model";
import { scheduleSheetSync } from "@/lib/invitations/server";
import { hasInviteSending } from "@/lib/schema-features";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ eventId: string; inviteeId: string }> };

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

const patchSchema = z.object({
  name: text(INVITE_LIMITS.name).optional(),
  group: text(INVITE_LIMITS.group).optional(),
  maxParty: z.number().int().min(1).max(INVITE_LIMITS.maxParty).optional(),
  note: text(INVITE_LIMITS.note).optional(),
  /** New link; the old one stops working (e.g. it was forwarded by mistake). */
  newLink: z.boolean().optional(),
  /** Forget the reply (back to "awaiting"). */
  clearReply: z.boolean().optional(),
  phone: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : normalisePhone(v))),
  /** Mark as sent (now) or not sent. */
  sent: z.boolean().optional(),
});

const notFound = () => jsonError(404, "INVITEE_NOT_FOUND", "Davetli bulunamadı.");
const UUID = /^[0-9a-f-]{36}$/i;

/** PATCH — edit an invitee (name, group, party limit, note, new link, clear reply). Pro. */
export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { eventId, inviteeId } = await context.params;
    const access = await invitationAccess(eventId, { write: true });
    if (!access.ok) return access.response;
    if (!UUID.test(inviteeId)) return notFound();
    const parsed = await parseJsonBody(request, patchSchema, 8 * 1024);
    if (!parsed.ok) return parsed.response;
    const p = parsed.data;
    const patch: Record<string, unknown> = {};
    if (p.name !== undefined) patch.name = p.name;
    if (p.group !== undefined) patch.group_name = p.group;
    if (p.maxParty !== undefined) patch.max_party = p.maxParty;
    if (p.note !== undefined) patch.host_note = p.note;
    if (p.newLink) patch.token = newToken();
    if (p.clearReply) Object.assign(patch, { responded_at: null, attending: null, party: [], dietary: null, message: null });
    if ((p.phone !== undefined || p.sent !== undefined) && (await hasInviteSending())) {
      if (p.phone !== undefined) patch.phone = p.phone;
      if (p.sent !== undefined) patch.sent_at = p.sent ? new Date().toISOString() : null;
    }
    if (Object.keys(patch).length === 0) return jsonOk<InvitationsDto>(await invitationsDto(access.event));

    const { data, error } = await getAdminDb()
      .from("invitees")
      .update(patch)
      .eq("id", inviteeId)
      .eq("event_id", access.event.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return notFound();
    await scheduleSheetSync(access.event, requestOrigin(request));
    return jsonOk<InvitationsDto>(await invitationsDto(access.event));
  } catch (error) {
    return handleRouteError("host:invitee:patch", error);
  }
}

/** DELETE — remove an invitee; their link stops working. Pro. */
export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    const { eventId, inviteeId } = await context.params;
    const access = await invitationAccess(eventId, { write: true });
    if (!access.ok) return access.response;
    if (!UUID.test(inviteeId)) return notFound();
    const { data, error } = await getAdminDb().from("invitees").delete().eq("id", inviteeId).eq("event_id", access.event.id).select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return notFound();
    await scheduleSheetSync(access.event, requestOrigin(request));
    return jsonOk<InvitationsDto>(await invitationsDto(access.event));
  } catch (error) {
    return handleRouteError("host:invitee:delete", error);
  }
}
