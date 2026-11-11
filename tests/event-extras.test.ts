import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  challengesSchema,
  knownChallengeId,
  readChallenges,
  readSchedule,
  scheduleSchema,
  scheduleStatus,
  withKnownCategories,
} from "../src/lib/event-extras.ts";
import { createEventSchema, eventSettingsPatchSchema, settingsPatchToColumns } from "../src/lib/validation.ts";

describe("scheduleSchema", () => {
  it("sorts by time, trims and assigns unique ids", () => {
    const out = scheduleSchema.parse([
      { time: "21:30", title: "  İlk dans " },
      { id: "abcd1234", time: "19:00", title: "Nikah", category: "Nikah" },
      { id: "abcd1234", time: "20:00", title: "Yemek", category: "" },
    ]);
    assert.deepEqual(out.map((i) => i.time), ["19:00", "20:00", "21:30"]);
    assert.equal(out[2].title, "İlk dans");
    assert.equal(out[1].category, null);
    assert.equal(new Set(out.map((i) => i.id)).size, 3);
    assert.equal(out[0].id, "abcd1234");
  });

  it("rejects bad times, empty titles and too many items", () => {
    assert.equal(scheduleSchema.safeParse([{ time: "25:00", title: "x" }]).success, false);
    assert.equal(scheduleSchema.safeParse([{ time: "9:00", title: "x" }]).success, false);
    assert.equal(scheduleSchema.safeParse([{ time: "09:00", title: "   " }]).success, false);
    assert.equal(scheduleSchema.safeParse(Array.from({ length: 31 }, () => ({ time: "10:00", title: "x" }))).success, false);
  });
});

describe("readSchedule / readChallenges", () => {
  it("treats a missing column or garbage as empty", () => {
    for (const raw of [undefined, null, "x", {}, 42]) {
      assert.deepEqual(readSchedule(raw), []);
      assert.deepEqual(readChallenges(raw), []);
    }
  });

  it("keeps valid entries and drops invalid ones", () => {
    const schedule = readSchedule([
      { id: "aaaa1111", time: "20:00", title: "Yemek", category: null },
      { id: "bad id", time: "20:00", title: "x" },
      { id: "bbbb2222", time: "19:00", title: "Nikah" },
    ]);
    assert.deepEqual(schedule.map((i) => i.id), ["bbbb2222", "aaaa1111"]);
    assert.deepEqual(readChallenges([{ id: "cccc3333", title: "Selfie" }, { title: "no id" }]), [{ id: "cccc3333", title: "Selfie" }]);
  });
});

describe("withKnownCategories", () => {
  it("clears categories the event no longer has", () => {
    const out = withKnownCategories(
      [
        { id: "aaaa1111", time: "19:00", title: "Nikah", category: "Nikah" },
        { id: "bbbb2222", time: "20:00", title: "Yemek", category: "Silindi" },
      ],
      ["Nikah"],
    );
    assert.deepEqual(out.map((i) => i.category), ["Nikah", null]);
  });
});

describe("scheduleStatus", () => {
  const schedule = readSchedule([
    { id: "aaaa1111", time: "19:00", title: "Nikah" },
    { id: "bbbb2222", time: "20:30", title: "Yemek" },
    { id: "cccc3333", time: "21:30", title: "İlk dans" },
  ]);
  const at = (hh: number, mm: number) => new Date(2026, 5, 20, hh, mm);

  it("finds the current and next item on the event day", () => {
    assert.deepEqual(scheduleStatus(schedule, "2026-06-20", at(20, 45)), { today: true, currentId: "bbbb2222", nextId: "cccc3333" });
    assert.deepEqual(scheduleStatus(schedule, "2026-06-20", at(18, 0)), { today: true, currentId: null, nextId: "aaaa1111" });
    assert.deepEqual(scheduleStatus(schedule, "2026-06-20", at(23, 0)), { today: true, currentId: "cccc3333", nextId: null });
    assert.deepEqual(scheduleStatus(schedule, "2026-06-20", at(19, 0)), { today: true, currentId: "aaaa1111", nextId: "bbbb2222" });
  });

  it("is inactive on other days or without a date", () => {
    assert.deepEqual(scheduleStatus(schedule, "2026-06-21", at(20, 45)), { today: false, currentId: null, nextId: null });
    assert.deepEqual(scheduleStatus(schedule, null, at(20, 45)), { today: false, currentId: null, nextId: null });
    assert.deepEqual(scheduleStatus([], "2026-06-20", at(20, 45)), { today: false, currentId: null, nextId: null });
  });
});

describe("challengesSchema / knownChallengeId", () => {
  it("de-duplicates titles case-insensitively and assigns ids", () => {
    const out = challengesSchema.parse([{ title: "Gelinle selfie" }, { title: "GELİNLE SELFİE" }, { title: "Dans pisti" }]);
    assert.deepEqual(out.map((c) => c.title), ["Gelinle selfie", "Dans pisti"]);
    assert.ok(out.every((c) => /^[a-z0-9]{8}$/.test(c.id)));
  });

  it("caps the list and the title length", () => {
    assert.equal(challengesSchema.safeParse(Array.from({ length: 21 }, (_, i) => ({ title: `G${i}` }))).success, false);
    assert.equal(challengesSchema.safeParse([{ title: "x".repeat(81) }]).success, false);
  });

  it("accepts only ids that belong to the event", () => {
    const list = [{ id: "cccc3333", title: "Selfie" }];
    assert.equal(knownChallengeId(list, "cccc3333"), "cccc3333");
    assert.equal(knownChallengeId(list, "zzzz9999"), null);
    assert.equal(knownChallengeId(list, undefined), null);
    assert.equal(knownChallengeId(list, 5), null);
  });
});

describe("event schemas with extras", () => {
  it("keeps schedule optional on create", () => {
    assert.equal(createEventSchema.parse({ title: "Düğün" }).schedule, undefined);
    assert.equal(createEventSchema.parse({ title: "Düğün", schedule: [{ time: "19:00", title: "Nikah" }] }).schedule?.length, 1);
  });

  it("keeps co-hosts optional, de-duplicated and capped at 5", () => {
    assert.equal(createEventSchema.parse({ title: "Düğün" }).coHosts, undefined);
    assert.deepEqual(createEventSchema.parse({ title: "Düğün", coHosts: [" Ayse ", "ayse", "mehmet"] }).coHosts, ["ayse", "mehmet"]);
    assert.equal(createEventSchema.safeParse({ title: "Düğün", coHosts: ["a1", "a2", "a3", "a4", "a5", "a6"] }).success, false);
  });

  it("writes schedule only when it is sent", () => {
    assert.deepEqual(settingsPatchToColumns(eventSettingsPatchSchema.parse({ title: "Yeni ad" })), { title: "Yeni ad" });
    const cols = settingsPatchToColumns(eventSettingsPatchSchema.parse({ schedule: [] }));
    assert.deepEqual(cols, { schedule: [] });
  });
});
