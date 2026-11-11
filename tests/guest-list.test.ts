import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGuestList } from "../src/lib/guest-list.ts";
import { parseTableParam } from "../src/lib/client/table.ts";

const media = [
  { guest_session_id: "s1", guest_name: "Ayşe", kind: "photo" as const, is_guestbook: false, size_bytes: 100, created_at: "2026-06-20T19:00:00Z", table_no: 5 },
  { guest_session_id: "s1", guest_name: "Ayşe Teyze", kind: "video" as const, is_guestbook: false, size_bytes: 900, created_at: "2026-06-20T20:00:00Z", table_no: 5 },
  { guest_session_id: "s2", guest_name: "Can", kind: "audio" as const, is_guestbook: true, size_bytes: 50, created_at: "2026-06-20T19:30:00Z", table_no: null },
];
const notes = [{ guest_session_id: "s2", guest_name: "Can", created_at: "2026-06-20T21:00:00Z" }];
const hearts = [
  { guest_session_id: "s1", guest_name: "Ayşe Teyze", name_visible: true, created_at: "2026-06-20T20:10:00Z" },
  { guest_session_id: "s1", guest_name: "Ayşe Teyze", name_visible: false, created_at: "2026-06-20T20:11:00Z" },
  { guest_session_id: "s3", guest_name: "Zeynep", name_visible: true, created_at: "2026-06-20T20:12:00Z" },
  { guest_session_id: "s4", guest_name: null, name_visible: true, created_at: "2026-06-20T20:13:00Z" },
];

describe("buildGuestList", () => {
  it("groups by session, keeps the latest name and counts activity", () => {
    const out = buildGuestList(media, notes, hearts, { heartsNamed: true, tableNumbers: true });
    const ayse = out.guests.find((g) => g.name === "Ayşe Teyze");
    const can = out.guests.find((g) => g.name === "Can");
    assert.ok(ayse && can);
    assert.deepEqual([ayse.photos, ayse.videos, ayse.messages, ayse.hearts, ayse.tableNo, ayse.totalBytes], [1, 1, 0, 1, 5, 1000]);
    assert.deepEqual([can.messages, can.hearts], [2, 0]);
    // A heart-only guest is listed when their name is known; an unnamed one is not.
    assert.ok(out.guests.some((g) => g.name === "Zeynep" && g.hearts === 1));
    assert.equal(out.guests.length, 3);
    // Newest activity first; no session ids in the output.
    assert.equal(out.guests[0].name, "Can");
    assert.ok(!JSON.stringify(out).includes("s1"));
  });

  it("hides hearts and tables when the event keeps them off", () => {
    const out = buildGuestList(media, notes, hearts, { heartsNamed: false, tableNumbers: false });
    assert.equal(out.guests.length, 2);
    assert.ok(out.guests.every((g) => g.hearts === null && g.tableNo === null));
  });
});

describe("parseTableParam", () => {
  it("accepts 1–4 digit numbers only", () => {
    assert.equal(parseTableParam("5"), 5);
    assert.equal(parseTableParam("0012"), 12);
    assert.equal(parseTableParam("12345"), null);
    assert.equal(parseTableParam("5a"), null);
    assert.equal(parseTableParam(null), null);
  });
});
