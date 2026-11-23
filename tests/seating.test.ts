import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { angleTo, fitView, resizeFromCorner, seatPositions, tableBounds, tableSize, toWorld, zoomAt } from "../src/lib/seating/geometry.ts";
import {
  addGuests,
  addTable,
  assignGuest,
  duplicateTable,
  freeSpot,
  metrics,
  newNames,
  nextName,
  parseGuestLines,
  removeTable,
  seatGuestsAtTable,
  unassignGuest,
  updateTable,
} from "../src/lib/seating/ops.ts";
import { emptyPlan, readPlan, savePlanSchema, type SeatingPlan } from "../src/lib/seating/schema.ts";

function planWithTable(seats = 4): { plan: SeatingPlan; tableId: string; ids: string[] } {
  let plan = addGuests(emptyPlan(), [{ name: "Ayşe" }, { name: "Mehmet" }, { name: "Zeynep" }]);
  const added = addTable(plan, "round", { x: 0, y: 0 }, "Masa 1");
  plan = updateTable(added.plan, added.id, { seats });
  return { plan, tableId: added.id, ids: plan.guests.map((g) => g.id) };
}

describe("seating schema", () => {
  it("treats garbage as an empty plan", () => {
    for (const raw of [undefined, null, 42, "x", { guests: "no" }]) assert.deepEqual(readPlan(raw), emptyPlan());
  });

  it("repairs seats pointing at missing tables, out of range or taken twice", () => {
    const plan = readPlan({
      title: "  ",
      tables: [{ id: "tbl1aaaa", kind: "round", name: "Masa 1", x: 0, y: 0, rotation: 370, seats: 2 }],
      venue: [],
      guests: [
        { id: "gst1aaaa", name: "A", rsvp: "yes", seat: { tableId: "tbl1aaaa", seat: 0 } },
        { id: "gst2aaaa", name: "B", rsvp: "maybe", seat: { tableId: "tbl1aaaa", seat: 0 } },
        { id: "gst3aaaa", name: "C", seat: { tableId: "nopeaaaa", seat: 1 } },
        { id: "gst4aaaa", name: "D", seat: { tableId: "tbl1aaaa", seat: 5 } },
      ],
    });
    assert.equal(plan.title, null);
    assert.equal(plan.tables[0].rotation, 10);
    assert.deepEqual(plan.guests.map((g) => g.seat?.seat ?? null), [0, null, null, null]);
    assert.equal(plan.guests[1].rsvp, "pending");
  });

  it("clamps seat counts and coordinates on save", () => {
    const parsed = savePlanSchema.parse({
      version: 3,
      plan: { title: null, guests: [], venue: [], tables: [{ id: "tbl1aaaa", kind: "rect", name: "x", x: 1e9, y: -5, rotation: 0, seats: 99 }] },
    });
    assert.equal(parsed.plan.tables[0].seats, 40);
    assert.equal(parsed.plan.tables[0].x, 20000);
  });
});

describe("seating geometry", () => {
  it("places one seat per index, round tables growing with the seat count", () => {
    for (const kind of ["round", "rect", "head"] as const) {
      for (const seats of [1, 6, 12]) assert.equal(seatPositions({ kind, seats }).length, seats);
    }
    assert.ok(tableSize({ kind: "round", seats: 16 }).w > tableSize({ kind: "round", seats: 8 }).w);
    // head table: every seat on the same side
    assert.ok(seatPositions({ kind: "head", seats: 5 }).every((p) => p.y < 0));
    // rectangle: split across both long sides
    const rect = seatPositions({ kind: "rect", seats: 6 });
    assert.equal(rect.filter((p) => p.y < 0).length, 3);
  });

  it("keeps the opposite corner fixed while resizing a rotated block", () => {
    const item = { x: 100, y: 100, w: 200, h: 100, rotation: 30 };
    const fixedBefore = toWorld({ x: -100, y: -50 }, item);
    const next = resizeFromCorner(item, { x: 1, y: 1 }, toWorld({ x: 200, y: 120 }, item), 40, false);
    const fixedAfter = toWorld({ x: -next.w / 2, y: -next.h / 2 }, { ...next, rotation: 30 });
    assert.ok(Math.abs(fixedAfter.x - fixedBefore.x) < 1.5 && Math.abs(fixedAfter.y - fixedBefore.y) < 1.5);
    assert.ok(next.w > item.w && next.h > item.h);
  });

  it("zooms around the pointer and fits content", () => {
    const view = { zoom: 1, x: 0, y: 0 };
    const z = zoomAt(view, { x: 200, y: 100 }, 2);
    assert.deepEqual({ x: z.x + 200 / z.zoom, y: z.y + 100 / z.zoom }, { x: 200, y: 100 });
    const fit = fitView({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, { w: 1100, h: 700 });
    assert.ok(fit.zoom > 0.5 && fit.zoom <= 1.4);
    assert.equal(angleTo({ x: 0, y: 0 }, { x: 10, y: 0 }), 90);
    assert.equal(angleTo({ x: 0, y: 0 }, { x: 10, y: -1 }, 15), 90);
  });
});

describe("seating operations", () => {
  it("assigns, swaps and unassigns guests", () => {
    const { plan, tableId, ids } = planWithTable();
    let p = assignGuest(plan, ids[0], { tableId, seat: 0 });
    p = assignGuest(p, ids[1], { tableId, seat: 1 });
    // dropping guest 1 onto seat 0 swaps the two
    p = assignGuest(p, ids[1], { tableId, seat: 0 });
    assert.deepEqual([p.guests[0].seat?.seat, p.guests[1].seat?.seat], [1, 0]);
    // an unseated guest taking an occupied seat bumps the occupant out
    p = assignGuest(p, ids[2], { tableId, seat: 0 });
    assert.equal(p.guests[1].seat, null);
    p = unassignGuest(p, ids[2]);
    assert.equal(p.guests[2].seat, null);
    // invalid seat: no change
    assert.equal(assignGuest(p, ids[0], { tableId, seat: 9 }), p);
  });

  it("unseats guests beyond a reduced seat count and on table removal", () => {
    const { plan, tableId, ids } = planWithTable(4);
    let p = assignGuest(plan, ids[0], { tableId, seat: 3 });
    p = assignGuest(p, ids[1], { tableId, seat: 0 });
    p = updateTable(p, tableId, { seats: 2 });
    assert.deepEqual(p.guests.map((g) => g.seat?.seat ?? null), [null, 0, null]);
    p = removeTable(p, tableId);
    assert.ok(p.guests.every((g) => g.seat === null));
    assert.equal(p.tables.length, 0);
  });

  it("fills a table, duplicates it empty and counts metrics", () => {
    const { plan, tableId, ids } = planWithTable(2);
    const p = seatGuestsAtTable(plan, tableId, ids);
    assert.equal(p.guests.filter((g) => g.seat).length, 2);
    const dup = duplicateTable(p, tableId, "Masa 2");
    assert.equal(dup.plan.tables.length, 2);
    assert.equal(dup.plan.guests.filter((g) => g.seat?.tableId === dup.id).length, 0);
    assert.deepEqual(metrics(dup.plan), { guests: 3, assigned: 2, unassigned: 1, tables: 2, seats: 4, freeSeats: 2, attending: 0 });
    assert.equal(nextName(["Masa 1", "masa 2"], "Masa"), "Masa 3");
  });

  it("drops new tables next to existing ones, never on top", () => {
    let plan = emptyPlan();
    for (let i = 0; i < 6; i += 1) {
      const at = freeSpot(plan, { x: 0, y: 0 }, 160, 160);
      plan = addTable(plan, "round", at, `Masa ${i + 1}`).plan;
    }
    const boxes = plan.tables.map(tableBounds);
    for (let i = 0; i < boxes.length; i += 1)
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [a, b] = [boxes[i], boxes[j]];
        assert.ok(a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY, `tables ${i} and ${j} overlap`);
      }
    assert.deepEqual(plan.tables[0], { ...plan.tables[0], x: 0, y: 0 });
  });

  it("parses pasted guest lists and skips names already on the plan", () => {
    assert.deepEqual(parseGuestLines("Ayşe Yılmaz, Gelin tarafı\n\nCan\tDamat tarafı\tVegan\n  "), [
      { name: "Ayşe Yılmaz", group: "Gelin tarafı", dietary: null },
      { name: "Can", group: "Damat tarafı", dietary: "Vegan" },
    ]);
    const plan = addGuests(emptyPlan(), [{ name: "Ayşe" }]);
    assert.deepEqual(newNames(plan, ["ayşe", "Mehmet", "mehmet", " "]), ["Mehmet"]);
  });
});
