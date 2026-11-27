import { z } from "zod";

/**
 * Seating plan document: one per event, stored as jsonb (seating_plans.plan).
 * Dependency-free apart from zod so the API route, the planner UI and unit
 * tests share it. Everything read from the database or a JSON backup goes
 * through `readPlan`, which validates, clamps and repairs it.
 */

export const TABLE_KINDS = ["round", "rect", "head"] as const;
export type TableKind = (typeof TABLE_KINDS)[number];

export const VENUE_KINDS = ["dance", "stage", "bar", "buffet", "dj", "entrance", "photo"] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

export const RSVP_STATES = ["pending", "yes", "no"] as const;
export type Rsvp = (typeof RSVP_STATES)[number];

export const SEATING_LIMITS = {
  guests: 2000,
  tables: 300,
  venue: 100,
  minSeats: 1,
  maxSeats: 40,
  /** World coordinates are clamped to ±this (≈ a 200 m hall at 1 unit = 1 cm). */
  extent: 20000,
  minVenueSize: 40,
  maxVenueSize: 6000,
} as const;

export interface SeatRef {
  tableId: string;
  /** 0-based seat index on the table. */
  seat: number;
}

export interface SeatingGuest {
  id: string;
  name: string;
  group: string | null;
  dietary: string | null;
  rsvp: Rsvp;
  note: string | null;
  seat: SeatRef | null;
  /** Set for guests that come from an invitation reply: "inv:<inviteeId>:<index>". */
  link?: string | null;
}

export interface SeatingTable {
  id: string;
  kind: TableKind;
  name: string;
  /** Centre, world units. */
  x: number;
  y: number;
  /** Degrees, 0–359. */
  rotation: number;
  seats: number;
}

export interface VenueItem {
  id: string;
  kind: VenueKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export interface SeatingPlan {
  /** Optional title shown in the planner/export; falls back to the event name. */
  title: string | null;
  guests: SeatingGuest[];
  tables: SeatingTable[];
  venue: VenueItem[];
}

export const ID_PATTERN = /^[a-z0-9]{4,24}$/;
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Short random id (Web Crypto: Node and browser). */
export function newId(length = 10): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

export function emptyPlan(): SeatingPlan {
  return { title: null, guests: [], tables: [], venue: [] };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const normaliseAngle = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const coord = z.number().finite().transform((v) => clamp(Math.round(v * 10) / 10, -SEATING_LIMITS.extent, SEATING_LIMITS.extent));
const angle = z.number().finite().transform(normaliseAngle);
const id = z.string().regex(ID_PATTERN);

const guestSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  group: text(40),
  dietary: text(80),
  rsvp: z.enum(RSVP_STATES).catch("pending"),
  note: text(200),
  seat: z
    .object({ tableId: id, seat: z.number().int().min(0).max(SEATING_LIMITS.maxSeats - 1) })
    .nullish()
    .transform((v) => v ?? null),
  link: z
    .string()
    .regex(/^inv:[0-9a-f-]{36}:\d{1,2}$/)
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
});

const tableSchema = z.object({
  id,
  kind: z.enum(TABLE_KINDS),
  name: z.string().trim().max(40).catch(""),
  x: coord,
  y: coord,
  rotation: angle.catch(0),
  seats: z.number().int().transform((v) => clamp(v, SEATING_LIMITS.minSeats, SEATING_LIMITS.maxSeats)),
});

const size = z.number().finite().transform((v) => clamp(Math.round(v), SEATING_LIMITS.minVenueSize, SEATING_LIMITS.maxVenueSize));
const venueSchema = z.object({
  id,
  kind: z.enum(VENUE_KINDS),
  name: z.string().trim().max(40).catch(""),
  x: coord,
  y: coord,
  w: size,
  h: size,
  rotation: angle.catch(0),
});

export const planSchema = z.object({
  title: text(120),
  guests: z.array(guestSchema).max(SEATING_LIMITS.guests),
  tables: z.array(tableSchema).max(SEATING_LIMITS.tables),
  venue: z.array(venueSchema).max(SEATING_LIMITS.venue),
});

/**
 * Repairs a structurally valid plan: unique ids, no seat references to
 * missing tables or out-of-range seats, at most one guest per seat (the
 * first one keeps it).
 */
export function normalisePlan(plan: SeatingPlan): SeatingPlan {
  const seen = new Set<string>();
  const unique = <T extends { id: string }>(items: T[]) =>
    items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  const tables = unique(plan.tables);
  const venue = unique(plan.venue);
  const seatsOf = new Map(tables.map((t) => [t.id, t.seats]));
  const taken = new Set<string>();
  const guests = unique(plan.guests).map((g) => {
    if (!g.seat) return g;
    const seats = seatsOf.get(g.seat.tableId);
    const key = `${g.seat.tableId}:${g.seat.seat}`;
    if (seats === undefined || g.seat.seat >= seats || taken.has(key)) return { ...g, seat: null };
    taken.add(key);
    return g;
  });
  return { title: plan.title, guests, tables, venue };
}

/** Safe read of stored/imported data: anything invalid yields an empty plan, never an exception. */
export function readPlan(raw: unknown): SeatingPlan {
  const parsed = planSchema.safeParse(raw);
  return parsed.success ? normalisePlan(parsed.data) : emptyPlan();
}

/** Request body for saving: the client's last known version + the full plan. */
export const savePlanSchema = z.object({
  version: z.number().int().min(0),
  plan: planSchema.transform(normalisePlan),
});

/** API payload. `version` 0 = nothing saved yet. */
export interface SeatingPlanDto {
  plan: SeatingPlan;
  version: number;
  updatedAt: string | null;
}
