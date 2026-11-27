import "server-only";

import type { NextRequest } from "next/server";

import { appOrigin } from "@/lib/google-oauth";
import { requireEventAccess } from "@/lib/host-auth";
import { planForUser, proRequired } from "@/lib/host-plan";
import { sheetUrl } from "@/lib/drive";
import { designOf, invitationsUnavailable, listInvitees, loadSettings, viewEvent } from "@/lib/invitations/server";
import { summarise, type InvitationSettingsRow, type InvitationsDto } from "@/lib/invitations/model";
import { hasFeature } from "@/lib/plans";

/** Host or co-host access + tables present (+ Pro for writes). Returns the event or a response. */
export async function invitationAccess(eventId: string, opts: { write?: boolean } = {}) {
  const owned = await requireEventAccess(eventId);
  if (!owned.ok) return owned;
  const missing = await invitationsUnavailable();
  if (missing) return { ok: false as const, response: missing };
  if (opts.write) {
    const locked = await proRequired(owned.event.owner_id, "invitations");
    if (locked) return { ok: false as const, response: locked };
  }
  return owned;
}

export function requestOrigin(request: NextRequest): string {
  return appOrigin(request.nextUrl.origin);
}

export function settingsDto(s: InvitationSettingsRow): InvitationsDto["settings"] {
  const dirty = s.sheet_dirty_at ? new Date(s.sheet_dirty_at).getTime() : 0;
  const synced = s.sheet_synced_at ? new Date(s.sheet_synced_at).getTime() : 0;
  return {
    design: designOf(s),
    rsvpDeadline: s.rsvp_deadline,
    accepting: s.accepting,
    openEnabled: s.open_enabled,
    openToken: s.open_token,
    openMaxParty: s.open_max_party,
    sheet: { url: s.sheet_id ? sheetUrl(s.sheet_id) : null, syncedAt: s.sheet_synced_at, pending: dirty > synced, error: s.sheet_error, lang: s.sheet_lang },
  };
}

export async function invitationsDto(event: Parameters<typeof viewEvent>[0]): Promise<InvitationsDto> {
  const [settings, invitees, plan] = await Promise.all([loadSettings(event.id), listInvitees(event.id), planForUser(event.owner_id)]);
  return { settings: settingsDto(settings), invitees, summary: summarise(invitees), pro: hasFeature(plan, "invitations"), event: viewEvent(event) };
}
