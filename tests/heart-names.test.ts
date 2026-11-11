import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summariseHearts } from "../src/lib/heart-names.ts";
import { eventSettingsPatchSchema, settingsPatchToColumns } from "../src/lib/validation.ts";

const rows = [
  { guest_name: "Ayşe Teyze", name_visible: true, created_at: "2026-06-20T20:00:00Z" },
  { guest_name: "Mehmet", name_visible: false, created_at: "2026-06-20T19:00:00Z" },
  { guest_name: null, name_visible: true, created_at: "2026-06-20T18:00:00Z" },
  { guest_name: "  ", name_visible: true, created_at: "2026-06-20T17:00:00Z" },
];

describe("summariseHearts", () => {
  it("shows only names given while names were on", () => {
    assert.deepEqual(summariseHearts(rows, true), {
      named: true,
      people: [{ name: "Ayşe Teyze", at: "2026-06-20T20:00:00Z" }],
      anonymousCount: 3,
    });
  });

  it("hides every name while the event is anonymous", () => {
    assert.deepEqual(summariseHearts(rows, false), { named: false, people: [], anonymousCount: 4 });
  });
});

describe("heartsNamed setting", () => {
  it("maps to the hearts_named column only when sent", () => {
    assert.deepEqual(settingsPatchToColumns(eventSettingsPatchSchema.parse({ heartsNamed: true })), { hearts_named: true });
    assert.equal("hearts_named" in settingsPatchToColumns(eventSettingsPatchSchema.parse({ title: "Yeni" })), false);
  });
});
