"use client";

import {
  Camera,
  Circle,
  Crown,
  Disc3,
  DoorOpen,
  Maximize2,
  Mic,
  Music,
  RectangleHorizontal,
  UtensilsCrossed,
  Wine,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { initials, TABLE_LABEL, VENUE_FILL, VENUE_LABEL } from "@/components/seating/labels";
import { SelectionToolbar } from "@/components/seating/SelectionToolbar";
import type { SeatingStore } from "@/components/seating/useSeatingStore";
import { useLang, useT } from "@/lib/i18n/provider";
import {
  angleTo,
  fitView,
  GRID,
  planBounds,
  resizeFromCorner,
  screenToWorld,
  SEAT_RADIUS,
  seatPositions,
  snap,
  tableBounds,
  tableExtent,
  tableSize,
  venueBounds,
  worldToScreen,
  zoomAt,
  type Box,
  type Point,
  type View,
} from "@/lib/seating/geometry";
import {
  addTable,
  addVenue,
  DEFAULT_SEATS,
  duplicateTable,
  freeSpot,
  duplicateVenue,
  nextName,
  occupants,
  removeTable,
  removeVenue,
  seatGuestsAtTable,
  updateTable,
  updateVenue,
  VENUE_DEFAULT_SIZE,
} from "@/lib/seating/ops";
import { newId, SEATING_LIMITS, type SeatingGuest, type SeatingPlan, type SeatRef, type TableKind, type VenueKind } from "@/lib/seating/schema";

export type Selection = { type: "table" | "venue"; id: string };

type Gesture =
  | { kind: "pan"; pointerId: number; start: Point; view: View; moved: boolean }
  | { kind: "pinch"; distance: number; view: View; mid: Point }
  | { kind: "move"; pointerId: number; type: "table" | "venue"; id: string; start: Point; origin: Point }
  | { kind: "rotate"; pointerId: number; type: "table" | "venue"; id: string }
  | { kind: "resize"; pointerId: number; id: string; corner: Point }
  | { kind: "seat"; pointerId: number; ref: SeatRef; guestId: string | null; start: Point };

const TABLE_ICONS: Record<TableKind, typeof Circle> = { round: Circle, rect: RectangleHorizontal, head: Crown };
const VENUE_ICONS: Record<VenueKind, typeof Circle> = {
  dance: Music,
  stage: Mic,
  bar: Wine,
  buffet: UtensilsCrossed,
  dj: Disc3,
  entrance: DoorOpen,
  photo: Camera,
};
const DRAG_THRESHOLD = 5;

/**
 * The 2D seating canvas: SVG in world units under a pan/zoom transform.
 * Tables and venue blocks move, rotate and (venue) resize with pointer
 * gestures that become one undo step each. Seats are drop targets for guest
 * drags (`data-seat`), handled by the planner.
 */
export function SeatingCanvas({
  plan,
  store,
  selected,
  onSelect,
  pickedGuestId,
  guestDragActive,
  onSeatClick,
  onSeatDragStart,
  svgRef,
  fitSignal,
}: {
  plan: SeatingPlan;
  store: Pick<SeatingStore, "apply" | "live" | "begin" | "end">;
  selected: Selection | null;
  onSelect: (sel: Selection | null) => void;
  pickedGuestId: string | null;
  guestDragActive: boolean;
  onSeatClick: (ref: SeatRef, occupant: SeatingGuest | undefined) => void;
  /** A seated guest is being dragged out of their seat. */
  onSeatDragStart: (guestId: string, point: Point) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** Increment to fit the plan into view (after import / reload). */
  fitSignal: number;
}) {
  const t = useT();
  const { locale } = useLang();
  const boxRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ zoom: 1, x: -400, y: -300 });
  const viewRef = useRef(view);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const fitted = useRef(-1);
  const [hover, setHover] = useState<{ guest: SeatingGuest; x: number; y: number } | null>(null);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Track the viewport size.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);


  /** Fits the plan into the part of the canvas below the add palette (it wraps to two rows on phones). */
  const fitPlan = useCallback((): View => {
    const el = boxRef.current;
    const inset = Math.min(size.h / 3, el && paletteRef.current ? paletteRef.current.getBoundingClientRect().bottom - el.getBoundingClientRect().top : 0);
    const v = fitView(planBounds(plan), { w: size.w, h: Math.max(1, size.h - inset) });
    return { ...v, y: v.y - inset / v.zoom };
  }, [plan, size]);

  // Fit the plan into view on first render and when asked to.
  useEffect(() => {
    if (size.w === 0 || fitted.current === fitSignal) return;
    fitted.current = fitSignal;
    setView(fitPlan());
  }, [size, fitSignal, fitPlan]);

  const local = useCallback((clientX: number, clientY: number): Point => {
    const r = boxRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }, []);
  const toWorldPoint = useCallback((clientX: number, clientY: number) => screenToWorld(local(clientX, clientY), viewRef.current), [local]);

  // Wheel: pan by default (trackpads scroll naturally); Ctrl/⌘ + wheel or a pinch gesture zooms.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        setView(zoomAt(v, local(e.clientX, e.clientY), v.zoom * Math.exp(-e.deltaY * 0.01)));
      } else {
        const scale = e.deltaMode === 1 ? 16 : 1;
        setView({ ...v, x: v.x + (e.deltaX * scale) / v.zoom, y: v.y + (e.deltaY * scale) / v.zoom });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [local]);

  const occupied = useMemo(() => occupants(plan), [plan]);
  const pickedSeat = useMemo(() => plan.guests.find((g) => g.id === pickedGuestId)?.seat ?? null, [plan.guests, pickedGuestId]);

  // ----------------------------------------------------------- pointer handling

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointers.current.set(e.pointerId, local(e.clientX, e.clientY));
    const target = e.target as Element;

    // Second finger on the background: pinch zoom.
    if (pointers.current.size === 2 && (!gesture.current || gesture.current.kind === "pan")) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y), view: viewRef.current, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (gesture.current) return;

    const seatEl = target.closest<SVGElement>("[data-seat]");
    if (seatEl) {
      const ref = { tableId: seatEl.dataset.table!, seat: Number(seatEl.dataset.seat) };
      gesture.current = { kind: "seat", pointerId: e.pointerId, ref, guestId: occupied.get(`${ref.tableId}:${ref.seat}`)?.id ?? null, start: local(e.clientX, e.clientY) };
      return;
    }

    const handle = target.closest<SVGElement>("[data-handle]");
    if (handle && selected) {
      e.currentTarget.setPointerCapture(e.pointerId);
      store.begin();
      if (handle.dataset.handle === "rotate") gesture.current = { kind: "rotate", pointerId: e.pointerId, type: selected.type, id: selected.id };
      else {
        const [cx, cy] = (handle.dataset.corner ?? "1,1").split(",").map(Number);
        gesture.current = { kind: "resize", pointerId: e.pointerId, id: selected.id, corner: { x: cx, y: cy } };
      }
      return;
    }

    const itemEl = target.closest<SVGElement>("[data-item]");
    if (itemEl) {
      const type = itemEl.dataset.item as "table" | "venue";
      const id = itemEl.dataset.id!;
      const item = type === "table" ? plan.tables.find((x) => x.id === id) : plan.venue.find((x) => x.id === id);
      if (!item) return;
      onSelect({ type, id });
      e.currentTarget.setPointerCapture(e.pointerId);
      store.begin();
      gesture.current = { kind: "move", pointerId: e.pointerId, type, id, start: toWorldPoint(e.clientX, e.clientY), origin: { x: item.x, y: item.y } };
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind: "pan", pointerId: e.pointerId, start: local(e.clientX, e.clientY), view: viewRef.current, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, local(e.clientX, e.clientY));
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(g.view, g.mid, g.view.zoom * (distance / Math.max(1, g.distance)));
      setView({ ...zoomed, x: zoomed.x - (mid.x - g.mid.x) / zoomed.zoom, y: zoomed.y - (mid.y - g.mid.y) / zoomed.zoom });
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    const p = local(e.clientX, e.clientY);
    if (g.kind === "pan") {
      if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < DRAG_THRESHOLD) return;
      g.moved = true;
      setView({ ...g.view, x: g.view.x - (p.x - g.start.x) / g.view.zoom, y: g.view.y - (p.y - g.start.y) / g.view.zoom });
      return;
    }
    if (g.kind === "seat") {
      // Dragging a seated guest out of their seat: the planner takes over.
      if (g.guestId && Math.hypot(p.x - g.start.x, p.y - g.start.y) >= DRAG_THRESHOLD) {
        gesture.current = null;
        setHover(null);
        onSeatDragStart(g.guestId, { x: e.clientX, y: e.clientY });
      }
      return;
    }
    const w = toWorldPoint(e.clientX, e.clientY);
    if (g.kind === "move") {
      const step = e.altKey ? 1 : GRID / 2;
      const x = snap(g.origin.x + (w.x - g.start.x), step);
      const y = snap(g.origin.y + (w.y - g.start.y), step);
      store.live((pl) => (g.type === "table" ? updateTable(pl, g.id, { x, y }) : updateVenue(pl, g.id, { x, y })));
    } else if (g.kind === "rotate") {
      store.live((pl) => {
        const item = g.type === "table" ? pl.tables.find((x) => x.id === g.id) : pl.venue.find((x) => x.id === g.id);
        if (!item) return pl;
        const rotation = angleTo(item, w, e.shiftKey ? 0 : 15);
        return g.type === "table" ? updateTable(pl, g.id, { rotation }) : updateVenue(pl, g.id, { rotation });
      });
    } else if (g.kind === "resize") {
      store.live((pl) => {
        const item = pl.venue.find((x) => x.id === g.id);
        if (!item) return pl;
        return updateVenue(pl, g.id, resizeFromCorner(item, g.corner, w, SEATING_LIMITS.minVenueSize, !e.altKey));
      });
    }
  };

  const finish = (e: React.PointerEvent<SVGSVGElement>, cancelled: boolean) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) gesture.current = null;
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (g.kind === "pan" && !g.moved && !cancelled) onSelect(null);
    else if (g.kind === "seat" && !cancelled) onSeatClick(g.ref, g.guestId ? occupied.get(`${g.ref.tableId}:${g.ref.seat}`) : undefined);
    else if (g.kind === "move" || g.kind === "rotate" || g.kind === "resize") store.end();
  };

  // ----------------------------------------------------------- add / edit

  /** The free spot nearest the middle of the screen. */
  const spawnPoint = (w: number, h: number): Point => freeSpot(plan, screenToWorld({ x: size.w / 2, y: size.h / 2 }, view), w, h);

  // Ids are made here, not inside the reducer: React may run a reducer twice.
  const addTableOfKind = (kind: TableKind) => {
    const id = newId();
    const extent = tableExtent({ kind, seats: DEFAULT_SEATS[kind] });
    const at = spawnPoint(extent.w, extent.h);
    store.apply((pl) => addTable(pl, kind, at, kind === "head" ? t("Baş masa") : nextName(pl.tables.map((x) => x.name), t("Masa")), id).plan);
    onSelect({ type: "table", id });
  };

  const addVenueOfKind = (kind: VenueKind) => {
    const id = newId();
    const at = spawnPoint(VENUE_DEFAULT_SIZE[kind].w, VENUE_DEFAULT_SIZE[kind].h);
    store.apply((pl) => addVenue(pl, kind, at, t(VENUE_LABEL[kind]), id).plan);
    onSelect({ type: "venue", id });
  };

  const selectedTable = selected?.type === "table" ? plan.tables.find((x) => x.id === selected.id) : undefined;
  const selectedVenue = selected?.type === "venue" ? plan.venue.find((x) => x.id === selected.id) : undefined;
  const selectedBox: Box | null = selectedTable ? tableBounds(selectedTable) : selectedVenue ? venueBounds(selectedVenue) : null;
  const unassignedIds = useMemo(() => plan.guests.filter((g) => !g.seat).map((g) => g.id), [plan.guests]);

  const toolbar = (() => {
    if (!selected || !selectedBox || size.w === 0) return null;
    const bottom = worldToScreen({ x: (selectedBox.minX + selectedBox.maxX) / 2, y: selectedBox.maxY }, view);
    const top = worldToScreen({ x: 0, y: selectedBox.minY }, view);
    const below = bottom.y + 64 < size.h;
    return { x: Math.min(size.w - 16, Math.max(16, bottom.x)), y: below ? bottom.y + 14 : Math.max(8, top.y - 58) };
  })();

  // ----------------------------------------------------------- render

  const px = 1 / view.zoom;
  const gridMinor = view.zoom >= 0.5;
  const worldW = size.w / view.zoom;
  const worldH = size.h / view.zoom;
  const isEmpty = plan.tables.length === 0 && plan.venue.length === 0;

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden bg-stone-100 select-none">
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onLostPointerCapture={(e) => {
          if (gesture.current && "pointerId" in gesture.current && gesture.current.pointerId === e.pointerId) finish(e, true);
        }}
      >
        <defs>
          <pattern id="seating-grid-minor" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e2ded5" strokeWidth={px} />
          </pattern>
          <pattern id="seating-grid-major" width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
            {gridMinor && <rect width={GRID * 5} height={GRID * 5} fill="url(#seating-grid-minor)" />}
            <path d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`} fill="none" stroke="#cbc6bb" strokeWidth={px} />
          </pattern>
          <pattern id="seating-dance" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="#f8f6f1" />
            <rect width="20" height="20" fill="#efeae0" />
            <rect x="20" y="20" width="20" height="20" fill="#efeae0" />
          </pattern>
        </defs>
        <g data-world transform={`matrix(${view.zoom} 0 0 ${view.zoom} ${-view.x * view.zoom} ${-view.y * view.zoom})`}>
          <rect data-export-ignore x={view.x} y={view.y} width={worldW} height={worldH} fill="url(#seating-grid-major)" />

          {plan.venue.map((v) => (
            <g key={v.id} data-item="venue" data-id={v.id} transform={`translate(${v.x} ${v.y}) rotate(${v.rotation})`} style={{ cursor: "move" }}>
              <rect
                x={-v.w / 2}
                y={-v.h / 2}
                width={v.w}
                height={v.h}
                rx={v.kind === "dance" ? 4 : 10}
                fill={v.kind === "dance" ? "url(#seating-dance)" : VENUE_FILL[v.kind].fill}
                stroke={VENUE_FILL[v.kind].stroke}
                strokeWidth={2}
              />
              <text
                transform={`rotate(${-v.rotation})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(28, Math.max(14, Math.min(v.w, v.h) / 6))}
                fontWeight={600}
                letterSpacing="0.08em"
                fill="#5a564f"
                style={{ pointerEvents: "none" }}
              >
                {/* Upper-cased here (not with CSS) so exports keep the Turkish İ. */}
                {(v.name || t(VENUE_LABEL[v.kind])).toLocaleUpperCase(locale)}
              </text>
            </g>
          ))}

          {plan.tables.map((table) => {
            const { w, h } = tableSize(table);
            const seats = seatPositions(table);
            const seated = seats.filter((_, i) => occupied.has(`${table.id}:${i}`)).length;
            return (
              <g key={table.id} transform={`translate(${table.x} ${table.y}) rotate(${table.rotation})`}>
                <g data-item="table" data-id={table.id} style={{ cursor: "move" }}>
                  {table.kind === "round" ? (
                    <circle r={w / 2} fill="#ffffff" stroke="#a19c92" strokeWidth={2} />
                  ) : (
                    <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={8} fill="#ffffff" stroke="#a19c92" strokeWidth={2} />
                  )}
                  <g transform={`rotate(${-table.rotation})`} style={{ pointerEvents: "none" }}>
                    <text textAnchor="middle" y={-2} fontSize={15} fontWeight={600} fill="#2c2a26">
                      {table.name || t(TABLE_LABEL[table.kind])}
                    </text>
                    <text textAnchor="middle" y={15} fontSize={11} fill="#78736a">
                      {seated}/{table.seats}
                    </text>
                  </g>
                </g>
                {seats.map((pos, i) => {
                  const guest = occupied.get(`${table.id}:${i}`);
                  const picked = pickedSeat?.tableId === table.id && pickedSeat.seat === i;
                  return (
                    <g
                      key={i}
                      data-seat={i}
                      data-table={table.id}
                      className="group"
                      transform={`translate(${pos.x} ${pos.y})`}
                      style={{ cursor: guest ? "grab" : "pointer" }}
                      onPointerEnter={(e) => {
                        if (!guest || guestDragActive) return;
                        const p = local(e.clientX, e.clientY);
                        setHover({ guest, x: p.x, y: p.y });
                      }}
                      onPointerLeave={() => setHover(null)}
                    >
                      <circle r={SEAT_RADIUS + 6} fill="transparent" />
                      <circle
                        r={SEAT_RADIUS}
                        fill={guest ? "#2c2a26" : "#ffffff"}
                        stroke={picked ? "#9a8565" : guest ? "#2c2a26" : "#a19c92"}
                        strokeWidth={picked ? 4 : 1.5}
                        strokeDasharray={guest ? undefined : "3 3"}
                        className={guestDragActive ? "group-hover:fill-amber-100 group-hover:stroke-amber-600" : "group-hover:stroke-stone-900"}
                      />
                      {guest && (
                        <text transform={`rotate(${-table.rotation})`} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill="#ffffff" style={{ pointerEvents: "none" }}>
                          {initials(guest.name)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Selection: outline, rotate handle, resize handles (not exported) */}
          {selectedTable && (
            <g data-export-ignore transform={`translate(${selectedTable.x} ${selectedTable.y}) rotate(${selectedTable.rotation})`}>
              {(() => {
                const e = tableExtent(selectedTable);
                const top = selectedTable.kind === "head" ? -e.h / 2 - 10 : -e.h / 2 - 6;
                return (
                  <>
                    <rect x={-e.w / 2 - 6} y={-e.h / 2 - 6} width={e.w + 12} height={e.h + 12} rx={12} fill="none" stroke="#7f6d51" strokeWidth={2 * px} strokeDasharray={`${6 * px} ${4 * px}`} style={{ pointerEvents: "none" }} />
                    <line x1={0} y1={top} x2={0} y2={top - 28 * px} stroke="#7f6d51" strokeWidth={1.5 * px} />
                    <circle data-handle="rotate" cx={0} cy={top - 28 * px} r={8 * px} fill="#ffffff" stroke="#7f6d51" strokeWidth={2 * px} style={{ cursor: "grab" }} />
                  </>
                );
              })()}
            </g>
          )}
          {selectedVenue && (
            <g data-export-ignore transform={`translate(${selectedVenue.x} ${selectedVenue.y}) rotate(${selectedVenue.rotation})`}>
              <rect x={-selectedVenue.w / 2} y={-selectedVenue.h / 2} width={selectedVenue.w} height={selectedVenue.h} fill="none" stroke="#7f6d51" strokeWidth={2 * px} strokeDasharray={`${6 * px} ${4 * px}`} style={{ pointerEvents: "none" }} />
              <line x1={0} y1={-selectedVenue.h / 2} x2={0} y2={-selectedVenue.h / 2 - 28 * px} stroke="#7f6d51" strokeWidth={1.5 * px} />
              <circle data-handle="rotate" cx={0} cy={-selectedVenue.h / 2 - 28 * px} r={8 * px} fill="#ffffff" stroke="#7f6d51" strokeWidth={2 * px} style={{ cursor: "grab" }} />
              {[
                [-1, -1],
                [1, -1],
                [1, 1],
                [-1, 1],
              ].map(([cx, cy]) => (
                <rect
                  key={`${cx},${cy}`}
                  data-handle="resize"
                  data-corner={`${cx},${cy}`}
                  x={(cx * selectedVenue.w) / 2 - 7 * px}
                  y={(cy * selectedVenue.h) / 2 - 7 * px}
                  width={14 * px}
                  height={14 * px}
                  rx={3 * px}
                  fill="#ffffff"
                  stroke="#7f6d51"
                  strokeWidth={2 * px}
                  style={{ cursor: cx * cy > 0 ? "nwse-resize" : "nesw-resize" }}
                />
              ))}
            </g>
          )}
        </g>
      </svg>

      {/* Add palette */}
      <div ref={paletteRef} className="absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
        <div className="flex items-center gap-1 rounded-2xl border border-stone-200 bg-white/95 p-1 shadow-sm backdrop-blur">
          <span className="px-2 text-[11px] font-semibold text-stone-500">{t("Masa ekle")}</span>
          {(Object.keys(TABLE_LABEL) as TableKind[]).map((kind) => {
            const Icon = TABLE_ICONS[kind];
            return (
              <button key={kind} type="button" onClick={() => addTableOfKind(kind)} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100">
                <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{t(TABLE_LABEL[kind])}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 rounded-2xl border border-stone-200 bg-white/95 p-1 shadow-sm backdrop-blur">
          <span className="px-2 text-[11px] font-semibold text-stone-500">{t("Salonu kur")}</span>
          {(Object.keys(VENUE_LABEL) as VenueKind[]).map((kind) => {
            const Icon = VENUE_ICONS[kind];
            return (
              <button key={kind} type="button" onClick={() => addVenueOfKind(kind)} title={t(VENUE_LABEL[kind])} aria-label={t(VENUE_LABEL[kind])} className="rounded-xl p-1.5 text-stone-700 hover:bg-stone-100">
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-2xl border border-stone-200 bg-white/95 p-1 shadow-sm backdrop-blur">
        <button type="button" onClick={() => setView(zoomAt(view, { x: size.w / 2, y: size.h / 2 }, view.zoom / 1.25))} aria-label={t("Uzaklaştır")} className="rounded-xl p-1.5 text-stone-700 hover:bg-stone-100">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="w-12 text-center text-xs text-stone-600 tabular-nums">{Math.round(view.zoom * 100)}%</span>
        <button type="button" onClick={() => setView(zoomAt(view, { x: size.w / 2, y: size.h / 2 }, view.zoom * 1.25))} aria-label={t("Yakınlaştır")} className="rounded-xl p-1.5 text-stone-700 hover:bg-stone-100">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setView(fitPlan())} aria-label={t("Görünümü sığdır")} title={t("Görünümü sığdır")} className="rounded-xl p-1.5 text-stone-700 hover:bg-stone-100">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 hidden text-[11px] text-stone-500 md:block">
        {t("Sürükleyerek kaydırın · Ctrl/⌘ + tekerlek ile yakınlaştırın")}
      </p>

      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-3xl border border-dashed border-stone-300 bg-white/85 p-6 text-center backdrop-blur">
            <p className="text-sm font-semibold text-stone-900">{t("Salonunuzu kurmaya başlayın")}</p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              {t("Üstteki menüden masa ve dans pisti ekleyin, sonra misafirleri soldaki listeden sandalyelere sürükleyin.")}
            </p>
          </div>
        </div>
      )}

      {hover && (
        <div className="pointer-events-none absolute z-20 max-w-56 -translate-x-1/2 rounded-xl bg-stone-900 px-3 py-2 text-xs text-white shadow-lg" style={{ left: hover.x, top: hover.y + 22 }}>
          <p className="font-semibold">{hover.guest.name}</p>
          {(hover.guest.group || hover.guest.dietary) && (
            <p className="mt-0.5 text-white/70">{[hover.guest.group, hover.guest.dietary].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      )}

      {toolbar && selected && (
        <SelectionToolbar
          key={selected.id}
          x={toolbar.x}
          y={toolbar.y}
          name={selectedTable?.name ?? selectedVenue?.name ?? ""}
          seats={selectedTable?.seats ?? null}
          canFill={Boolean(selectedTable && unassignedIds.length > 0)}
          onRename={(name) =>
            store.apply((pl) => (selected.type === "table" ? updateTable(pl, selected.id, { name }) : updateVenue(pl, selected.id, { name })))
          }
          onRotate={(delta) =>
            store.apply((pl) => {
              const item = selected.type === "table" ? pl.tables.find((x) => x.id === selected.id) : pl.venue.find((x) => x.id === selected.id);
              if (!item) return pl;
              return selected.type === "table" ? updateTable(pl, selected.id, { rotation: item.rotation + delta }) : updateVenue(pl, selected.id, { rotation: item.rotation + delta });
            })
          }
          onSeats={(delta) =>
            store.apply((pl) => {
              const table = pl.tables.find((x) => x.id === selected.id);
              return table ? updateTable(pl, selected.id, { seats: table.seats + delta }) : pl;
            })
          }
          onFill={() => store.apply((pl) => seatGuestsAtTable(pl, selected.id, pl.guests.filter((g) => !g.seat).map((g) => g.id)))}
          onDuplicate={() => {
            const id = newId();
            store.apply((pl) =>
              selected.type === "table"
                ? duplicateTable(pl, selected.id, nextName(pl.tables.map((x) => x.name), t("Masa")), id).plan
                : duplicateVenue(pl, selected.id, id).plan,
            );
            onSelect({ type: selected.type, id });
          }}
          onDelete={() => {
            store.apply((pl) => (selected.type === "table" ? removeTable(pl, selected.id) : removeVenue(pl, selected.id)));
            onSelect(null);
          }}
        />
      )}
    </div>
  );
}
