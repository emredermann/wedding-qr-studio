import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { requestOrigin } from "@/lib/invitations/host";
import {
  canReply,
  cleanReply,
  INVITE_LIMITS,
  newToken,
  readParty,
  replySchema,
  statusOf,
  TOKEN_PATTERN,
  type InvitationSettingsRow,
  type InviteeRow,
  type InviteViewDto,
} from "@/lib/invitations/model";
import { defaultSettings, designOf, INVITEE_COLUMNS, invitationsUnavailable, scheduleSheetSync, viewEvent } from "@/lib/invitations/server";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";
import type { EventRow } from "@/types/domain";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ token: string }> };

type Resolved =
  | { kind: "personal"; invitee: InviteeRow; settings: InvitationSettingsRow; event: EventRow }
  | { kind: "open"; settings: InvitationSettingsRow; event: EventRow };

const notFound = () => jsonError(404, "INVITE_NOT_FOUND", "Bu davetiye bağlantısı geçersiz ya da artık kullanılmıyor.");

/** A personal link (invitee token) or the event's open link. */
async function resolve(token: string): Promise<Resolved | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const db = getAdminDb();
  const { data: invitee, error } = await db.from("invitees").select(INVITEE_COLUMNS).eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  if (invitee) {
    const row = invitee as InviteeRow;
    const [{ data: settings }, { data: event }] = await Promise.all([
      db.from("invitation_settings").select("*").eq("event_id", row.event_id).maybeSingle(),
      db.from("events").select("*").eq("id", row.event_id).maybeSingle(),
    ]);
    if (!event) return null;
    return { kind: "personal", invitee: row, settings: (settings as InvitationSettingsRow | null) ?? defaultSettings(row.event_id), event: event as EventRow };
  }
  const { data: settings } = await db.from("invitation_settings").select("*").eq("open_token", token).eq("open_enabled", true).maybeSingle();
  if (!settings) return null;
  const s = settings as InvitationSettingsRow;
  const { data: event } = await db.from("events").select("*").eq("id", s.event_id).maybeSingle();
  return event ? { kind: "open", settings: s, event: event as EventRow } : null;
}

function view(r: Resolved): InviteViewDto {
  const base = {
    event: viewEvent(r.event),
    design: designOf(r.settings),
    canReply: canReply(r.settings),
    deadline: r.settings.rsvp_deadline,
  };
  if (r.kind === "open") return { ...base, kind: "open", name: null, maxParty: r.settings.open_max_party, reply: null };
  const i = r.invitee;
  const status = statusOf(i);
  return {
    ...base,
    kind: "personal",
    name: i.name,
    maxParty: i.max_party,
    reply: status === "pending" ? null : { status, party: status === "yes" ? readParty(i.party) : [], dietary: i.dietary, message: i.message, respondedAt: i.responded_at },
  };
}

/** GET /api/invite/:token — the invitation and the current reply. Public. */
export async function GET(request: NextRequest, context: Ctx) {
  try {
    const missing = await invitationsUnavailable();
    if (missing) return missing;
    const limited = await rateLimit(request, "invite-view", 120, 60);
    if (limited) return limited;
    const { token } = await context.params;
    const resolved = await resolve(token);
    if (!resolved) return notFound();
    return jsonOk<InviteViewDto>(view(resolved));
  } catch (error) {
    return handleRouteError("invite:get", error);
  }
}

const PROBLEM_MESSAGES = {
  party_empty: "Katılacak kişilerin adını yazın.",
  party_too_big: "Bu davetiye için kişi sınırını aştınız.",
  party_name: "Her kişi için ad ve soyad yazın.",
} as const;

/**
 * POST /api/invite/:token — save (or change) the reply. On the open link the
 * guest also writes their name; that creates their own personal link, which
 * is returned so they can change the reply later.
 */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const missing = await invitationsUnavailable();
    if (missing) return missing;
    const { token } = await context.params;
    const limited = await rateLimit(request, "invite-reply", 20, 600, token);
    if (limited) return limited;
    const parsed = await parseJsonBody(request, replySchema, 16 * 1024);
    if (!parsed.ok) return parsed.response;

    const resolved = await resolve(token);
    if (!resolved) return notFound();
    if (!canReply(resolved.settings)) return jsonError(409, "RSVP_CLOSED", "Yanıt süresi doldu. Değişiklik için etkinlik sahibiyle iletişime geçin.");

    const maxParty = resolved.kind === "personal" ? resolved.invitee.max_party : resolved.settings.open_max_party;
    const checked = cleanReply(parsed.data, maxParty);
    if (!checked.ok) {
      return jsonError(422, "VALIDATION_FAILED", PROBLEM_MESSAGES[checked.problem], {
        [checked.index !== undefined ? `party.${checked.index}` : "party"]: [PROBLEM_MESSAGES[checked.problem]],
      });
    }
    const reply = checked.reply;
    const db = getAdminDb();
    const now = new Date().toISOString();
    const fields = { responded_at: now, attending: reply.attending, party: reply.party, dietary: reply.dietary, message: reply.message };

    let inviteeToken = token;
    if (resolved.kind === "open") {
      const name = parsed.data.name ?? reply.party[0] ?? null;
      if (!name || name.length < 2) return jsonError(422, "VALIDATION_FAILED", "Adınızı ve soyadınızı yazın.", { name: ["Adınızı ve soyadınızı yazın."] });
      const openLimited = await rateLimit(request, "invite-open", 10, 3600, resolved.event.id);
      if (openLimited) return openLimited;
      const { count } = await db.from("invitees").select("id", { count: "exact", head: true }).eq("event_id", resolved.event.id);
      if ((count ?? 0) >= INVITE_LIMITS.invitees) return jsonError(409, "INVITEE_LIMIT", "Bu davetiye artık yanıt kabul etmiyor.");
      inviteeToken = newToken();
      const { error } = await db.from("invitees").insert({
        event_id: resolved.event.id,
        token: inviteeToken,
        name: name.slice(0, INVITE_LIMITS.name),
        max_party: maxParty,
        via_open_link: true,
        reply_count: 1,
        ...fields,
      });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db
        .from("invitees")
        .update({ ...fields, reply_count: resolved.invitee.reply_count + 1 })
        .eq("id", resolved.invitee.id);
      if (error) throw new Error(error.message);
    }

    await scheduleSheetSync(resolved.event, requestOrigin(request));
    const fresh = await resolve(inviteeToken);
    if (!fresh) return notFound();
    return jsonOk<InviteViewDto & { token: string }>({ ...view(fresh), token: inviteeToken });
  } catch (error) {
    return handleRouteError("invite:post", error);
  }
}
