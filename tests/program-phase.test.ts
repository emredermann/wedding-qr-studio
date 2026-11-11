import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMinutes, programPhase, readSchedule, scheduleEmoji } from "../src/lib/event-extras.ts";

const schedule = readSchedule([
  { id: "aaaa1111", time: "19:00", title: "Nikah" },
  { id: "bbbb2222", time: "20:30", title: "Yemek" },
  { id: "cccc3333", time: "21:30", title: "İlk dans" },
]);
const at = (day: number, hh: number, mm: number) => new Date(2026, 5, day, hh, mm);

describe("scheduleEmoji", () => {
  it("picks an emoji from Turkish keywords, case-insensitively", () => {
    assert.equal(scheduleEmoji("NİKAH"), "💍");
    assert.equal(scheduleEmoji("İlk dans"), "💃");
    assert.equal(scheduleEmoji("Pasta kesimi"), "🎂");
    assert.equal(scheduleEmoji("Gelin & damat girişi"), "👰");
    assert.equal(scheduleEmoji("Akşam yemeği"), "🍽️");
    assert.equal(scheduleEmoji("Bilinmeyen şey"), "✨");
  });
});

describe("formatMinutes", () => {
  it("formats short and long spans", () => {
    assert.equal(formatMinutes(0), "az sonra");
    assert.equal(formatMinutes(12), "12 dk");
    assert.equal(formatMinutes(65), "1 sa 5 dk");
    assert.equal(formatMinutes(120), "2 sa");
  });
});

describe("programPhase", () => {
  it("counts down days before the event", () => {
    assert.deepEqual(programPhase(schedule, "2026-06-20", at(17, 23, 0)), { kind: "countdown", days: 3 });
    assert.deepEqual(programPhase(schedule, "2026-06-20", at(19, 0, 5)), { kind: "countdown", days: 1 });
  });

  it("warms up before the first item, then goes live with progress", () => {
    assert.deepEqual(programPhase(schedule, "2026-06-20", at(20, 18, 40)), { kind: "warmup", nextId: "aaaa1111", minutesToNext: 20 });
    assert.deepEqual(programPhase(schedule, "2026-06-20", at(20, 19, 45)), {
      kind: "live",
      currentId: "aaaa1111",
      nextId: "bbbb2222",
      minutesToNext: 45,
      progress: 0.5,
    });
  });

  it("reaches the finale and is static afterwards or without a date", () => {
    assert.deepEqual(programPhase(schedule, "2026-06-20", at(20, 23, 0)), { kind: "finale", currentId: "cccc3333" });
    assert.deepEqual(programPhase(schedule, "2026-06-20", at(21, 10, 0)), { kind: "static" });
    assert.deepEqual(programPhase(schedule, null, at(20, 20, 0)), { kind: "static" });
    assert.deepEqual(programPhase([], "2026-06-20", at(20, 20, 0)), { kind: "static" });
  });
});
