import type { NextRequest } from "next/server";

import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { invitationAccess, invitationsDto, requestOrigin } from "@/lib/invitations/host";
import { newToken, settingsInputSchema, type InvitationsDto } from "@/lib/invitations/model";
import { loadSettings, scheduleSheetSync } from "@/lib/invitations/server";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ eventId: string }> };

/** GET — settings, every invitee with their reply, and totals. Host and co-hosts (any package). */
export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const access = await invitationAccess(eventId);
    if (!access.ok) return access.response;
    return jsonOk<InvitationsDto>(await invitationsDto(access.event));
  } catch (error) {
    return handleRouteError("host:invitations:get", error);
  }
}

/** PUT — design, deadline, accepting, open link, sheet language (Pro). */
export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const access = await invitationAccess(eventId, { write: true });
    if (!access.ok) return access.response;
    const parsed = await parseJsonBody(request, settingsInputSchema, 32 * 1024);
    if (!parsed.ok) return parsed.response;
    const input = parsed.data;
    const current = await loadSettings(access.event.id);

    const patch: Record<string, unknown> = { event_id: access.event.id, updated_at: new Date().toISOString() };
    if (input.design) patch.design = input.design;
    if (input.rsvpDeadline !== undefined) patch.rsvp_deadline = input.rsvpDeadline;
    if (input.accepting !== undefined) patch.accepting = input.accepting;
    if (input.openEnabled !== undefined) patch.open_enabled = input.openEnabled;
    if (input.openMaxParty !== undefined) patch.open_max_party = input.openMaxParty;
    if (input.sheetLang !== undefined) patch.sheet_lang = input.sheetLang;
    if (input.regenerateOpenToken || ((input.openEnabled ?? current.open_enabled) && !current.open_token)) patch.open_token = newToken();

    const { error } = await getAdminDb().from("invitation_settings").upsert(patch, { onConflict: "event_id" });
    if (error) throw new Error(error.message);
    if (input.sheetLang !== undefined && input.sheetLang !== current.sheet_lang) await scheduleSheetSync(access.event, requestOrigin(request));
    return jsonOk<InvitationsDto>(await invitationsDto(access.event));
  } catch (error) {
    return handleRouteError("host:invitations:put", error);
  }
}
