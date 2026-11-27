import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canReply,
  cleanReply,
  deadlinePassed,
  newToken,
  parseInviteeLines,
  readDesign,
  replySchema,
  rsvpPeople,
  sheetRows,
  summarise,
  toInviteeDto,
  TOKEN_PATTERN,
  type InviteeRow,
} from "../src/lib/invitations/model.ts";
import { addGuests, assignGuest, addTable, syncRsvpGuests } from "../src/lib/seating/ops.ts";
import { emptyPlan, readPlan } from "../src/lib/seating/schema.ts";

const row = (over: Partial<InviteeRow>): InviteeRow => ({
  id: "11111111-2222-3333-4444-555555555555",
  event_id: "e",
  token: newToken(),
  name: "Ayşe Yılmaz",
  group_name: "Gelin tarafı",
  max_party: 3,
  host_note: null,
  via_open_link: false,
  created_at: "2026-11-01T10:00:00Z",
  responded_at: null,
  attending: null,
  party: [],
  dietary: null,
  message: null,
  reply_count: 0,
  ...over,
});

describe("invitation replies", () => {
  it("makes unguessable url-safe tokens", () => {
    const a = newToken();
    assert.match(a, TOKEN_PATTERN);
    assert.notEqual(a, newToken());
  });

  it("needs one real name per person, within the party limit", () => {
    const parse = (body: unknown) => replySchema.parse(body);
    assert.deepEqual(cleanReply(parse({ attending: true, party: ["  Ayşe   Yılmaz ", "Can Yılmaz"] }), 3), {
      ok: true,
      reply: { attending: true, party: ["Ayşe Yılmaz", "Can Yılmaz"], dietary: null, message: null },
    });
    assert.deepEqual(cleanReply(parse({ attending: true, party: [] }), 3), { ok: false, problem: "party_empty" });
    assert.deepEqual(cleanReply(parse({ attending: true, party: ["A B", "C D", "E F", "G H"] }), 3), { ok: false, problem: "party_too_big" });
    assert.deepEqual(cleanReply(parse({ attending: true, party: ["Ayşe", " "] }), 3), { ok: false, problem: "party_name", index: 1 });
    // Declining drops any names sent along.
    assert.deepEqual(cleanReply(parse({ attending: false, party: ["X Y"], message: " Tebrikler " }), 3), {
      ok: true,
      reply: { attending: false, party: [], dietary: null, message: "Tebrikler" },
    });
  });

  it("closes replies after the deadline day (Turkey time) or when paused", () => {
    assert.equal(deadlinePassed("2026-12-01", new Date("2026-12-01T20:00:00Z")), false); // 23:00 in Istanbul
    assert.equal(deadlinePassed("2026-12-01", new Date("2026-12-01T21:00:01Z")), true);
    assert.equal(canReply({ accepting: true, rsvp_deadline: null }), true);
    assert.equal(canReply({ accepting: false, rsvp_deadline: null }), false);
  });

  it("counts replies and people", () => {
    const list = [
      toInviteeDto(row({ responded_at: "2026-11-02T10:00:00Z", attending: true, party: ["Ayşe Yılmaz", "Can Yılmaz"] })),
      toInviteeDto(row({ id: "21111111-2222-3333-4444-555555555555", responded_at: "2026-11-02T10:00:00Z", attending: false })),
      toInviteeDto(row({ id: "31111111-2222-3333-4444-555555555555", max_party: 2 })),
    ];
    assert.deepEqual(summarise(list), { links: 3, responded: 2, yes: 1, no: 1, pending: 1, people: 2, capacity: 5 });
    assert.equal(rsvpPeople(list).length, 2);
  });

  it("reads invitee lines with an optional group and party size in any order", () => {
    assert.deepEqual(parseInviteeLines("Ayşe Yılmaz; Gelin tarafı; 3\nCan Demir\t4\nDeniz, İş"), [
      { name: "Ayşe Yılmaz", group: "Gelin tarafı", maxParty: 3, note: null },
      { name: "Can Demir", group: null, maxParty: 4, note: null },
      { name: "Deniz", group: "İş", maxParty: 1, note: null },
    ]);
  });

  it("keeps unknown design fields out and fills defaults", () => {
    const d = readDesign({ headline: "Evleniyoruz", style: "weird", mapUrl: "javascript:alert(1)", extra: 1 });
    assert.equal(d.headline, "Evleniyoruz");
    assert.equal(d.style, "classic");
    assert.equal(d.mapUrl, "");
    assert.equal("extra" in d, false);
  });

  it("writes the sheet with a header and no formulas", () => {
    const list = [toInviteeDto(row({ name: "=HYPERLINK(1)", responded_at: "2026-11-02T10:00:00Z", attending: true, party: ["Ayşe Yılmaz"] }))];
    const rows = sheetRows(list, { lang: "tr", origin: "https://mira.test", tables: new Map([[list[0].id, ["Masa 1"]]]) });
    assert.equal(rows[0][0], "Davetli");
    assert.equal(rows[1][0], "'=HYPERLINK(1)");
    assert.equal(rows[1][3], "Katılıyor");
    assert.equal(rows[1][9], "Masa 1");
    assert.ok(rows[1][10].startsWith("https://mira.test/d/"));
  });
});

describe("seating ← replies", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const person = (i: number, name: string) => ({ link: `inv:${id}:${i}`, inviteeId: id, name, group: "Gelin", dietary: null });

  it("adds, renames and removes RSVP guests but never hand-added ones", () => {
    let plan = addGuests(emptyPlan(), [{ name: "Elle eklenen" }]);
    const first = syncRsvpGuests(plan, [person(0, "Ayşe Yılmaz"), person(1, "Can Yılmaz")]);
    assert.equal(first.added, 2);
    plan = first.plan;
    // Nothing changed → same object (no undo step, no save).
    assert.equal(syncRsvpGuests(plan, [person(0, "Ayşe Yılmaz"), person(1, "Can Yılmaz")]).plan, plan);

    const t = addTable(plan, "round", { x: 0, y: 0 }, "Masa 1");
    plan = assignGuest(t.plan, plan.guests[2].id, { tableId: t.id, seat: 0 });
    // Can is no longer coming, Ayşe fixed her name.
    const next = syncRsvpGuests(plan, [person(0, "Ayşe Yılmaz Demir")]);
    assert.deepEqual([next.added, next.updated, next.removed], [0, 1, 1]);
    assert.deepEqual(next.unseated, ["Can Yılmaz"]);
    assert.deepEqual(next.plan.guests.map((g) => g.name), ["Elle eklenen", "Ayşe Yılmaz Demir"]);
    // Survives a save/load round trip with its link.
    assert.equal(readPlan(JSON.parse(JSON.stringify(next.plan))).guests[1].link, `inv:${id}:0`);
  });
});
