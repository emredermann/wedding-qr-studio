"use client";

import { track } from "@vercel/analytics";

import type { MediaKind } from "@/types/domain";

/**
 * Every custom event the app sends to Vercel Web Analytics, with its exact
 * properties. Keeping the catalogue typed guarantees we never send personal
 * data (guest names, notes, e-mails, slugs) — only coarse, anonymous facts.
 *
 * Note: Vercel shows custom events on Pro/Enterprise plans; on Hobby the calls
 * are harmless no-ops. Page views and Speed Insights work on every plan.
 */
export interface AnalyticsEvents {
  // Guest
  guest_joined: Record<string, never>;
  upload_completed: { kind: MediaKind };
  upload_failed: { kind: MediaKind };
  upload_deleted: { kind: MediaKind };
  face_search: { found: boolean };
  guestbook_note_sent: Record<string, never>;
  guestbook_recording_sent: { kind: "audio" | "video" };
  original_downloaded: { kind: MediaKind };
  zip_downloaded: { scope: "host"; files: number };
  // Host
  host_signed_in: Record<string, never>;
  drive_connect_started: Record<string, never>;
  drive_connected: Record<string, never>;
  event_created: { drive: "app" | "host" };
  guest_link_shared: { method: "copy" | "whatsapp" };
  qr_card_exported: { format: "png" | "pdf" | "svg"; cards: number };
  moderation_bulk: { action: "approve" | "hide" | "delete"; items: number };
  settings_saved: Record<string, never>;
  live_wall_opened: Record<string, never>;
}

export type AnalyticsEventName = keyof AnalyticsEvents;

export function trackEvent<K extends AnalyticsEventName>(
  name: K,
  ...props: AnalyticsEvents[K] extends Record<string, never> ? [] : [AnalyticsEvents[K]]
): void {
  try {
    track(name, props[0]);
  } catch {
    // Analytics must never break the app (blocked by an ad blocker, offline, …).
  }
}
