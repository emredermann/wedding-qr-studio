import { GRID, snap, tableBounds, tableExtent, tableSize, venueBounds } from "./geometry.ts";
import {
  newId,
  normaliseAngle,
  SEATING_LIMITS,
  type Rsvp,
  type SeatingGuest,
  type SeatingPlan,
  type SeatingTable,
  type SeatRef,
  type TableKind,
  type VenueItem,
  type VenueKind,
} from "./schema.ts";

/**
 * Pure plan operations: each returns a new plan and never mutates its input,
 * which is what makes undo/redo a matter of keeping old references.
 */

export const DEFAULT_SEATS: Record<TableKind, number> = { round: 8, rect: 8, head: 6 };

/** Default venue block sizes (world units ≈ cm). */
export const VENUE_DEFAULT_SIZE: Record<VenueKind, { w: number; h: number }> = {
  dance: { w: 480, h: 480 },
  stage: { w: 600, h: 240 },
  bar: { w: 360, h: 100 },
  buffet: { w: 420, h: 100 },
  dj: { w: 200, h: 120 },
  entrance: { w: 200, h: 60 },
  photo: { w: 240, h: 200 },
};

const seatKey = (ref: SeatRef) => `${ref.tableId}:${ref.seat}`;

/** Seat key → guest currently sitting there. */
export function occupants(plan: SeatingPlan): Map<string, SeatingGuest> {
  const map = new Map<string, SeatingGuest>();
  for (const g of plan.guests) if (g.seat) map.set(seatKey(g.seat), g);
  return map;
}

export function guestAt(plan: SeatingPlan, ref: SeatRef): SeatingGuest | undefined {
  return plan.guests.find((g) => g.seat?.tableId === ref.tableId && g.seat.seat === ref.seat);
}

export interface PlanMetrics {
  guests: number;
  assigned: number;
  unassigned: number;
  tables: number;
  seats: number;
  freeSeats: number;
  attending: number;
}

export function metrics(plan: SeatingPlan): PlanMetrics {
  const assigned = plan.guests.filter((g) => g.seat).length;
  const seats = plan.tables.reduce((sum, t) => sum + t.seats, 0);
  return {
    guests: plan.guests.length,
    assigned,
    unassigned: plan.guests.length - assigned,
    tables: plan.tables.length,
    seats,
    freeSeats: seats - assigned,
    attending: plan.guests.filter((g) => g.rsvp === "yes").length,
  };
}

/** Next free "<prefix> N" name, e.g. "Masa 4". */
export function nextName(existing: string[], prefix: string): string {
  const used = new Set(existing.map((n) => n.trim().toLocaleLowerCase("tr-TR")));
  for (let i = 1; ; i += 1) {
    const name = `${prefix} ${i}`;
    if (!used.has(name.toLocaleLowerCase("tr-TR"))) return name;
  }
}

// ---------------------------------------------------------------- placement

/**
 * Where to drop a new item of size w×h: the free spot closest to `near`
 * (searched on a spiral of grid steps), so new tables never land on top of
 * existing ones. Falls back to `near` when the area is crowded.
 */
export function freeSpot(plan: Pick<SeatingPlan, "tables" | "venue">, near: { x: number; y: number }, w: number, h: number, gap = 30): { x: number; y: number } {
  const boxes = [...plan.tables.map(tableBounds), ...plan.venue.map(venueBounds)];
  const fits = (x: number, y: number) =>
    boxes.every((b) => x + w / 2 + gap <= b.minX || x - w / 2 - gap >= b.maxX || y + h / 2 + gap <= b.minY || y - h / 2 - gap >= b.maxY);
  const step = GRID * 2;
  const origin = { x: snap(near.x), y: snap(near.y) };
  for (let ring = 0; ring <= 40; ring += 1) {
    for (let i = -ring; i <= ring; i += 1) {
      for (const [dx, dy] of ring === 0 ? [[0, 0]] : [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
        const x = origin.x + dx * step;
        const y = origin.y + dy * step;
        if (fits(x, y)) return { x, y };
      }
    }
  }
  return origin;
}

// ---------------------------------------------------------------- tables

export function addTable(plan: SeatingPlan, kind: TableKind, at: { x: number; y: number }, name: string, id = newId()): { plan: SeatingPlan; id: string } {
  if (plan.tables.length >= SEATING_LIMITS.tables) return { plan, id: "" };
  const table: SeatingTable = { id, kind, name, x: snap(at.x), y: snap(at.y), rotation: 0, seats: DEFAULT_SEATS[kind] };
  return { plan: { ...plan, tables: [...plan.tables, table] }, id: table.id };
}

/** Guests in seats beyond `seats` (after a seat count reduction) become unassigned. */
function dropOverflow(guests: SeatingGuest[], tableId: string, seats: number): SeatingGuest[] {
  return guests.map((g) => (g.seat?.tableId === tableId && g.seat.seat >= seats ? { ...g, seat: null } : g));
}

export function updateTable(plan: SeatingPlan, id: string, patch: Partial<Omit<SeatingTable, "id" | "kind">>): SeatingPlan {
  let guests = plan.guests;
  const tables = plan.tables.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t, ...patch };
    if (patch.seats !== undefined) {
      next.seats = Math.min(SEATING_LIMITS.maxSeats, Math.max(SEATING_LIMITS.minSeats, Math.round(patch.seats)));
      guests = dropOverflow(guests, id, next.seats);
    }
    if (patch.rotation !== undefined) next.rotation = normaliseAngle(patch.rotation);
    if (patch.name !== undefined) next.name = patch.name.slice(0, 40);
    return next;
  });
  return { ...plan, tables, guests };
}

export function removeTable(plan: SeatingPlan, id: string): SeatingPlan {
  return {
    ...plan,
    tables: plan.tables.filter((t) => t.id !== id),
    guests: plan.guests.map((g) => (g.seat?.tableId === id ? { ...g, seat: null } : g)),
  };
}

export function duplicateTable(plan: SeatingPlan, id: string, name: string, newTableId = newId()): { plan: SeatingPlan; id: string } {
  const source = plan.tables.find((t) => t.id === id);
  if (!source || plan.tables.length >= SEATING_LIMITS.tables) return { plan, id: "" };
  const extent = tableExtent(source);
  const spot = freeSpot(plan, { x: source.x + tableSize(source).w / 2 + 80, y: source.y }, extent.w, extent.h);
  const copy: SeatingTable = { ...source, id: newTableId, name, x: spot.x, y: spot.y };
  return { plan: { ...plan, tables: [...plan.tables, copy] }, id: copy.id };
}

// ---------------------------------------------------------------- venue

export function addVenue(plan: SeatingPlan, kind: VenueKind, at: { x: number; y: number }, name: string, id = newId()): { plan: SeatingPlan; id: string } {
  if (plan.venue.length >= SEATING_LIMITS.venue) return { plan, id: "" };
  const size = VENUE_DEFAULT_SIZE[kind];
  const item: VenueItem = { id, kind, name, x: snap(at.x), y: snap(at.y), w: size.w, h: size.h, rotation: 0 };
  return { plan: { ...plan, venue: [...plan.venue, item] }, id: item.id };
}

export function updateVenue(plan: SeatingPlan, id: string, patch: Partial<Omit<VenueItem, "id" | "kind">>): SeatingPlan {
  const clampSize = (v: number) => Math.min(SEATING_LIMITS.maxVenueSize, Math.max(SEATING_LIMITS.minVenueSize, Math.round(v)));
  return {
    ...plan,
    venue: plan.venue.map((v) => {
      if (v.id !== id) return v;
      const next = { ...v, ...patch };
      if (patch.w !== undefined) next.w = clampSize(patch.w);
      if (patch.h !== undefined) next.h = clampSize(patch.h);
      if (patch.rotation !== undefined) next.rotation = normaliseAngle(patch.rotation);
      if (patch.name !== undefined) next.name = patch.name.slice(0, 40);
      return next;
    }),
  };
}

export function removeVenue(plan: SeatingPlan, id: string): SeatingPlan {
  return { ...plan, venue: plan.venue.filter((v) => v.id !== id) };
}

export function duplicateVenue(plan: SeatingPlan, id: string, newVenueId = newId()): { plan: SeatingPlan; id: string } {
  const source = plan.venue.find((v) => v.id === id);
  if (!source || plan.venue.length >= SEATING_LIMITS.venue) return { plan, id: "" };
  const spot = freeSpot(plan, { x: source.x + source.w / 2 + 60, y: source.y }, source.w, source.h);
  const copy: VenueItem = { ...source, id: newVenueId, x: spot.x, y: spot.y };
  return { plan: { ...plan, venue: [...plan.venue, copy] }, id: copy.id };
}

// ---------------------------------------------------------------- guests

export interface GuestInput {
  name: string;
  group?: string | null;
  dietary?: string | null;
  rsvp?: Rsvp;
  note?: string | null;
}

const clean = (v: string | null | undefined, max: number) => {
  const t = v?.trim().slice(0, max);
  return t ? t : null;
};

export function addGuests(plan: SeatingPlan, inputs: GuestInput[]): SeatingPlan {
  const room = SEATING_LIMITS.guests - plan.guests.length;
  const added: SeatingGuest[] = inputs
    .map((i) => ({ ...i, name: i.name.trim().slice(0, 80) }))
    .filter((i) => i.name)
    .slice(0, Math.max(0, room))
    .map((i) => ({
      id: newId(),
      name: i.name,
      group: clean(i.group, 40),
      dietary: clean(i.dietary, 80),
      rsvp: i.rsvp ?? "pending",
      note: clean(i.note, 200),
      seat: null,
    }));
  return added.length ? { ...plan, guests: [...plan.guests, ...added] } : plan;
}

export function updateGuest(plan: SeatingPlan, id: string, patch: Partial<GuestInput>): SeatingPlan {
  return {
    ...plan,
    guests: plan.guests.map((g) =>
      g.id !== id
        ? g
        : {
            ...g,
            ...(patch.name !== undefined && patch.name.trim() ? { name: patch.name.trim().slice(0, 80) } : {}),
            ...(patch.group !== undefined ? { group: clean(patch.group, 40) } : {}),
            ...(patch.dietary !== undefined ? { dietary: clean(patch.dietary, 80) } : {}),
            ...(patch.rsvp !== undefined ? { rsvp: patch.rsvp } : {}),
            ...(patch.note !== undefined ? { note: clean(patch.note, 200) } : {}),
          },
    ),
  };
}

export function removeGuests(plan: SeatingPlan, ids: string[]): SeatingPlan {
  const drop = new Set(ids);
  return { ...plan, guests: plan.guests.filter((g) => !drop.has(g.id)) };
}

/**
 * Seat a guest. If the seat is taken, the two guests swap (the other one gets
 * the mover's previous seat, or becomes unassigned).
 */
export function assignGuest(plan: SeatingPlan, guestId: string, ref: SeatRef): SeatingPlan {
  const mover = plan.guests.find((g) => g.id === guestId);
  const table = plan.tables.find((t) => t.id === ref.tableId);
  if (!mover || !table || ref.seat < 0 || ref.seat >= table.seats) return plan;
  const other = guestAt(plan, ref);
  if (other?.id === guestId) return plan;
  return {
    ...plan,
    guests: plan.guests.map((g) => {
      if (g.id === guestId) return { ...g, seat: { tableId: ref.tableId, seat: ref.seat } };
      if (other && g.id === other.id) return { ...g, seat: mover.seat };
      return g;
    }),
  };
}

export function unassignGuest(plan: SeatingPlan, guestId: string): SeatingPlan {
  return { ...plan, guests: plan.guests.map((g) => (g.id === guestId && g.seat ? { ...g, seat: null } : g)) };
}

/** Fill a table's empty seats with the given unassigned guests, in order. */
export function seatGuestsAtTable(plan: SeatingPlan, tableId: string, guestIds: string[]): SeatingPlan {
  const table = plan.tables.find((t) => t.id === tableId);
  if (!table) return plan;
  const taken = new Set(plan.guests.filter((g) => g.seat?.tableId === tableId).map((g) => g.seat!.seat));
  const free = Array.from({ length: table.seats }, (_, i) => i).filter((i) => !taken.has(i));
  let next = plan;
  guestIds.slice(0, free.length).forEach((id, i) => {
    next = assignGuest(next, id, { tableId, seat: free[i] });
  });
  return next;
}

/**
 * Bulk import: one guest per line, optionally "Name, Group" or
 * tab-separated (pasted from a spreadsheet). Blank lines are ignored.
 */
export function parseGuestLines(text: string): GuestInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/\t|,|;/).map((part) => part.trim()))
    .filter((parts) => parts[0])
    .map(([name, group, dietary]) => ({ name, group: group || null, dietary: dietary || null }));
}

/** Names from another source that are not on the plan yet (case-insensitive). */
export function newNames(plan: SeatingPlan, names: string[]): string[] {
  const have = new Set(plan.guests.map((g) => g.name.toLocaleLowerCase("tr-TR")));
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = name.toLocaleLowerCase("tr-TR");
    if (name && !have.has(key)) {
      have.add(key);
      out.push(name);
    }
  }
  return out;
}
