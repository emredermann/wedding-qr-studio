import type { SeatingPlan, SeatingTable, VenueItem } from "./schema.ts";

/**
 * Canvas geometry in world units (≈ 1 unit = 1 cm). Pure functions shared by
 * the canvas, the exporter and tests.
 */

export const GRID = 20;
export const SEAT_RADIUS = 15;
/** Space between a table edge and its seat centres. */
const SEAT_GAP = 6;
/** Distance between neighbouring seat centres along a straight side. */
const SEAT_PITCH = 46;

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const snap = (value: number, grid = GRID) => Math.round(value / grid) * grid;

export function rotate(p: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Local (unrotated, centred) point → world. */
export function toWorld(local: Point, item: { x: number; y: number; rotation: number }): Point {
  const r = rotate(local, item.rotation);
  return { x: item.x + r.x, y: item.y + r.y };
}

/** World point → local frame of an item. */
export function toLocal(world: Point, item: { x: number; y: number; rotation: number }): Point {
  return rotate({ x: world.x - item.x, y: world.y - item.y }, -item.rotation);
}

/** Table body size: round tables use `w` as the diameter. */
export function tableSize(table: Pick<SeatingTable, "kind" | "seats">): { w: number; h: number } {
  if (table.kind === "round") {
    // Seats sit on a circle around the table; keep neighbouring seats apart.
    const ring = (table.seats * (SEAT_RADIUS * 2 + 10)) / (2 * Math.PI);
    const radius = Math.max(42, ring - SEAT_RADIUS - SEAT_GAP);
    return { w: radius * 2, h: radius * 2 };
  }
  if (table.kind === "rect") {
    const perSide = Math.max(2, Math.ceil(table.seats / 2));
    return { w: perSide * SEAT_PITCH + 16, h: 72 };
  }
  return { w: Math.max(2, table.seats) * SEAT_PITCH + 16, h: 56 };
}

/**
 * Seat centres in the table's local frame, in seat-index order.
 * Round: evenly around the circle starting at the top. Rectangle: top side
 * left→right, then bottom side left→right. Head: one side only (top), facing
 * the room.
 */
export function seatPositions(table: Pick<SeatingTable, "kind" | "seats">): Point[] {
  const { w, h } = tableSize(table);
  const n = table.seats;
  if (table.kind === "round") {
    const r = w / 2 + SEAT_GAP + SEAT_RADIUS;
    return Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
  }
  const along = (count: number, y: number) =>
    Array.from({ length: count }, (_, i) => ({ x: -((count - 1) * SEAT_PITCH) / 2 + i * SEAT_PITCH, y }));
  const off = h / 2 + SEAT_GAP + SEAT_RADIUS;
  if (table.kind === "head") return along(n, -off);
  const top = Math.ceil(n / 2);
  return [...along(top, -off), ...along(n - top, off)];
}

/** Radius that contains the table and its seats (for hit areas and bounds). */
export function tableExtent(table: Pick<SeatingTable, "kind" | "seats">): { w: number; h: number } {
  const { w, h } = tableSize(table);
  const pad = (SEAT_GAP + SEAT_RADIUS * 2) * 2;
  return table.kind === "head" ? { w, h: h + pad / 2 } : { w: w + (table.kind === "round" ? pad : 0), h: h + pad };
}

function rotatedBox(cx: number, cy: number, w: number, h: number, rotation: number): Box {
  const corners = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ].map((p) => toWorld(p, { x: cx, y: cy, rotation }));
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
}

export function tableBounds(table: SeatingTable): Box {
  const e = tableExtent(table);
  return rotatedBox(table.x, table.y, e.w, e.h, table.rotation);
}

export function venueBounds(item: VenueItem): Box {
  return rotatedBox(item.x, item.y, item.w, item.h, item.rotation);
}

/** Bounding box of everything on the plan, or null when it is empty. */
export function planBounds(plan: Pick<SeatingPlan, "tables" | "venue">): Box | null {
  const boxes = [...plan.tables.map(tableBounds), ...plan.venue.map(venueBounds)];
  if (boxes.length === 0) return null;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

export interface View {
  /** Screen px per world unit. */
  zoom: number;
  /** World point shown at the viewport's top-left. */
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const screenToWorld = (p: Point, view: View): Point => ({ x: view.x + p.x / view.zoom, y: view.y + p.y / view.zoom });
export const worldToScreen = (p: Point, view: View): Point => ({ x: (p.x - view.x) * view.zoom, y: (p.y - view.y) * view.zoom });

/** Zoom around a screen point so the world point under it stays put. */
export function zoomAt(view: View, screen: Point, nextZoom: number): View {
  const zoom = clampZoom(nextZoom);
  const world = screenToWorld(screen, view);
  return { zoom, x: world.x - screen.x / zoom, y: world.y - screen.y / zoom };
}

/** View that fits a box into a viewport with padding (screen px). */
export function fitView(box: Box | null, viewport: { w: number; h: number }, padding = 48): View {
  const b = box ?? { minX: -600, minY: -400, maxX: 600, maxY: 400 };
  const bw = Math.max(200, b.maxX - b.minX);
  const bh = Math.max(200, b.maxY - b.minY);
  const zoom = clampZoom(Math.min((viewport.w - padding * 2) / bw, (viewport.h - padding * 2) / bh, 1.4));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { zoom, x: cx - viewport.w / 2 / zoom, y: cy - viewport.h / 2 / zoom };
}

/**
 * Resize a rotated rectangle by dragging one corner while the opposite corner
 * stays fixed. `corner` is (±1, ±1) in the item's local frame.
 */
export function resizeFromCorner(
  item: Pick<VenueItem, "x" | "y" | "w" | "h" | "rotation">,
  corner: Point,
  pointer: Point,
  min: number,
  gridSnap: boolean,
): { x: number; y: number; w: number; h: number } {
  const fixed = { x: (-corner.x * item.w) / 2, y: (-corner.y * item.h) / 2 };
  const p = toLocal(pointer, item);
  let w = Math.max(min, (p.x - fixed.x) * corner.x);
  let h = Math.max(min, (p.y - fixed.y) * corner.y);
  if (gridSnap) {
    w = Math.max(min, snap(w));
    h = Math.max(min, snap(h));
  }
  const centreLocal = { x: fixed.x + (corner.x * w) / 2, y: fixed.y + (corner.y * h) / 2 };
  const c = toWorld(centreLocal, item);
  return { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(w), h: Math.round(h) };
}

/** Angle (deg) from an item's centre to a pointer, measured so "up" is 0°. */
export function angleTo(item: Point, pointer: Point, step = 0): number {
  const deg = (Math.atan2(pointer.y - item.y, pointer.x - item.x) * 180) / Math.PI + 90;
  const snapped = step > 0 ? Math.round(deg / step) * step : deg;
  return ((Math.round(snapped) % 360) + 360) % 360;
}
