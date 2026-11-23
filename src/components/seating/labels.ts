import type { MsgKey } from "@/lib/i18n/translate";
import type { Rsvp, TableKind, VenueKind } from "@/lib/seating/schema";

/** Translation keys for the planner's enums (render with `t(...)`). */
export const TABLE_LABEL: Record<TableKind, MsgKey> = {
  round: "Yuvarlak masa",
  rect: "Dikdörtgen masa",
  head: "Baş masa",
};

export const VENUE_LABEL: Record<VenueKind, MsgKey> = {
  dance: "Dans pisti",
  stage: "Sahne",
  bar: "Bar",
  buffet: "Büfe",
  dj: "DJ",
  entrance: "Giriş",
  photo: "Fotoğraf köşesi",
};

export const RSVP_LABEL: Record<Rsvp, MsgKey> = {
  pending: "Yanıt bekleniyor",
  yes: "Katılıyor",
  no: "Katılmıyor",
};

/** Venue block fills (quiet, on-brand tones). */
export const VENUE_FILL: Record<VenueKind, { fill: string; stroke: string }> = {
  dance: { fill: "#efeae0", stroke: "#b09d7d" },
  stage: { fill: "#e2ded5", stroke: "#78736a" },
  bar: { fill: "#f8f6f1", stroke: "#9a8565" },
  buffet: { fill: "#f8f6f1", stroke: "#9a8565" },
  dj: { fill: "#e2ded5", stroke: "#5a564f" },
  entrance: { fill: "#ffffff", stroke: "#a19c92" },
  photo: { fill: "#f8f6f1", stroke: "#b09d7d" },
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toLocaleUpperCase("tr-TR");
}
