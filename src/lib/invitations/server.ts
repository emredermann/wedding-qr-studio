import "server-only";

import { after } from "next/server";

import { driveForEvent } from "@/lib/drive-accounts";
import { DriveError, DriveNotConnectedError, sheetUrl } from "@/lib/drive";
import { fetchAllRows } from "@/lib/events";
import { jsonError } from "@/lib/api/http";
import {
  readDesign,
  sheetRows,
  toInviteeDto,
  type InvitationSettingsRow,
  type InviteDesign,
  type InviteeDto,
  type InviteeRow,
} from "@/lib/invitations/model";
import { hasInvitations } from "@/lib/schema-features";
import { readPlan } from "@/lib/seating/schema";
import { getAdminDb } from "@/lib/supabase/server";
import type { EventRow } from "@/types/domain";

export const INVITEE_COLUMNS =
  "id, event_id, token, name, group_name, max_party, host_note, via_open_link, created_at, responded_at, attending, party, dietary, message, reply_count";

/** 503 until migration 0009 has been run; null when the tables exist. */
export async function invitationsUnavailable() {
  if (await hasInvitations()) return null;
  return jsonError(
    503,
    "INVITATIONS_NOT_SET_UP",
    "Davetiye modülü henüz kurulmamış. Yönetici supabase/migrations/0009_invitations.sql dosyasını çalıştırmalı.",
  );
}

export function defaultSettings(eventId: string): InvitationSettingsRow {
  return {
    event_id: eventId,
    design: {},
    rsvp_deadline: null,
    accepting: true,
    open_token: null,
    open_enabled: false,
    open_max_party: 2,
    sheet_id: null,
    sheet_dirty_at: null,
    sheet_synced_at: null,
    sheet_lock_until: null,
    sheet_error: null,
    sheet_lang: "tr",
    updated_at: new Date(0).toISOString(),
  };
}

export async function loadSettings(eventId: string): Promise<InvitationSettingsRow> {
  const { data, error } = await getAdminDb().from("invitation_settings").select("*").eq("event_id", eventId).maybeSingle();
  if (error) throw new Error(`[invitations] settings: ${error.message}`);
  return (data as InvitationSettingsRow | null) ?? defaultSettings(eventId);
}

export async function listInvitees(eventId: string): Promise<InviteeDto[]> {
  const rows = await fetchAllRows<InviteeRow>((from, to) =>
    getAdminDb()
      .from("invitees")
      .select(INVITEE_COLUMNS)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map(toInviteeDto);
}

/** What the guest page shows above the form. */
export interface InvitationViewEvent {
  title: string;
  coupleNames: string | null;
  eventDate: string | null;
  themeColor: string;
}

export function viewEvent(event: EventRow): InvitationViewEvent {
  return { title: event.title, coupleNames: event.couple_names, eventDate: event.event_date, themeColor: event.theme_color };
}

export function designOf(settings: InvitationSettingsRow): InviteDesign {
  return readDesign(settings.design);
}

// ---------------------------------------------------------------- Google Sheet mirror

const MIN_GAP_MS = 4_000;
const LEASE_MS = 45_000;

/** Records that the sheet is behind; the actual write happens after the response. */
export async function markSheetDirty(eventId: string): Promise<void> {
  const db = getAdminDb();
  const now = new Date().toISOString();
  const { data } = await db.from("invitation_settings").update({ sheet_dirty_at: now }).eq("event_id", eventId).select("event_id");
  if (!data || data.length === 0) {
    await db.from("invitation_settings").upsert({ event_id: eventId, sheet_dirty_at: now }, { onConflict: "event_id", ignoreDuplicates: true });
  }
}

/** Marks dirty now and syncs after the response is sent (never delays the guest). */
export function scheduleSheetSync(event: EventRow, origin: string): Promise<void> {
  return markSheetDirty(event.id).then(() => {
    after(async () => {
      try {
        await syncSheet(event, origin);
      } catch (error) {
        console.error("[invitations] sheet sync failed", error);
      }
    });
  });
}

export type SheetSyncResult = { ok: true; sheetId: string; url: string } | { ok: false; error: string } | { ok: "busy" };

function sheetErrorMessage(error: unknown): string {
  if (error instanceof DriveNotConnectedError) return error.message;
  if (error instanceof DriveError) {
    if (error.status === 403 && /sheets|has not been used|disabled/i.test(error.message)) {
      return "Google Sheets API bu projede kapalı. Google Cloud Console'da Sheets API'yi etkinleştirin.";
    }
    if (error.status === 401 || error.status === 403) return "Google Drive erişimi reddedildi. Panelden Google Drive'ı yeniden bağlayın.";
    return `Google Drive hatası (${error.status}).`;
  }
  return "Tablo güncellenemedi.";
}

/** Table names per invitee from the seating plan (for the "Table" column). */
async function tablesByInvitee(eventId: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const { data, error } = await getAdminDb().from("seating_plans").select("plan").eq("event_id", eventId).maybeSingle();
  if (error || !data) return out;
  const plan = readPlan((data as { plan: unknown }).plan);
  const names = new Map(plan.tables.map((t) => [t.id, t.name]));
  for (const g of plan.guests) {
    if (!g.link || !g.seat) continue;
    const inviteeId = g.link.split(":")[1];
    out.set(inviteeId, [...(out.get(inviteeId) ?? []), names.get(g.seat.tableId) ?? ""].filter(Boolean));
  }
  return out;
}

/**
 * Rewrites the event's Google Sheet from the database (one-way). A short
 * lease (claim_invitation_sheet) keeps concurrent replies from writing at once;
 * a reply that arrives during a write is picked up by a follow-up round.
 * Creates the sheet in the event's Drive folder on first use, or again if
 * the host deleted it.
 */
export async function syncSheet(event: EventRow, origin: string): Promise<SheetSyncResult> {
  const db = getAdminDb();
  for (let round = 0; round < 3; round += 1) {
    const { data: leased, error: leaseError } = await db.rpc("claim_invitation_sheet", { p_event_id: event.id, p_lease_seconds: LEASE_MS / 1000 });
    if (leaseError) throw new Error(`[invitations] sheet lease: ${leaseError.message}`);
    const settings = (Array.isArray(leased) ? leased[0] : leased) as InvitationSettingsRow | null | undefined;
    if (!settings) return { ok: "busy" };

    // Keep a small gap between writes (Sheets quota is per minute).
    const lastSync = settings.sheet_synced_at ? new Date(settings.sheet_synced_at).getTime() : 0;
    const wait = lastSync + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    const started = new Date().toISOString();
    try {
      const drive = await driveForEvent(event);
      let sheetId = settings.sheet_id;
      if (sheetId && !(await drive.fileUsable(sheetId))) sheetId = null;
      if (!sheetId) {
        const title = settings.sheet_lang === "en" ? "Invitation replies" : "Davetiye Yanıtları";
        sheetId = await drive.createSpreadsheet(`${title} – ${event.couple_names || event.title}`, event.drive_folder_id || drive.rootFolderId);
      }
      const [invitees, tables] = await Promise.all([listInvitees(event.id), tablesByInvitee(event.id)]);
      await drive.writeSheet(sheetId, sheetRows(invitees, { lang: settings.sheet_lang, origin, tables }));
      await db
        .from("invitation_settings")
        .update({ sheet_id: sheetId, sheet_synced_at: started, sheet_error: null, sheet_lock_until: null })
        .eq("event_id", event.id);
      const dirtyAt = settings.sheet_dirty_at ? new Date(settings.sheet_dirty_at).getTime() : 0;
      // Re-read: did a reply land while we were writing?
      const { data: fresh } = await db.from("invitation_settings").select("sheet_dirty_at").eq("event_id", event.id).maybeSingle();
      const freshDirty = fresh?.sheet_dirty_at ? new Date(fresh.sheet_dirty_at as string).getTime() : dirtyAt;
      if (freshDirty <= new Date(started).getTime()) return { ok: true, sheetId, url: sheetUrl(sheetId) };
    } catch (error) {
      const message = sheetErrorMessage(error);
      console.warn("[invitations] sheet sync", error);
      await db.from("invitation_settings").update({ sheet_error: message, sheet_lock_until: null }).eq("event_id", event.id);
      return { ok: false, error: message };
    }
  }
  return { ok: "busy" };
}
