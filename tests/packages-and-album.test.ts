import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { brandFor, brandingMetaFrom, brandingSchema, decodeDataUrl, readBranding, readShareFrame } from "../src/lib/branding.ts";
import { buildLeaderboard } from "../src/lib/leaderboard.ts";
import { hasFeature, planFromMetadata } from "../src/lib/plans.ts";
import { buildReport, type ReportMediaRow } from "../src/lib/report.ts";
import { eventSettingsPatchSchema, settingsPatchToColumns } from "../src/lib/validation.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("packages", () => {
  it("default to free and honour an expiry date", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    assert.equal(planFromMetadata(undefined, now), "free");
    assert.equal(planFromMetadata({ plan: "pro" }, now), "pro");
    assert.equal(planFromMetadata({ plan: "pro", plan_until: "2026-11-23" }, now), "pro");
    assert.equal(planFromMetadata({ plan: "pro", plan_until: "2026-11-22" }, now), "free");
    assert.equal(planFromMetadata({ plan: "enterprise" }, now), "free");
  });

  it("gate only creating events and changing settings", () => {
    for (const feature of ["createEvent", "editSettings"] as const) {
      assert.equal(hasFeature("free", feature), false);
      assert.equal(hasFeature("pro", feature), true);
    }
  });
});

describe("share frames", () => {
  it("default to a classic frame that guests cannot share (no change for existing events)", () => {
    const frame = readShareFrame(null);
    assert.equal(frame.style, "classic");
    assert.equal(frame.guestShare, false);
  });

  it("keep the saved caption and logo (same on every package, no watermark)", () => {
    const settings = { style: "band" as const, text: "Bizim gece", guestShare: true, showLogo: true };
    assert.deepEqual(readShareFrame(settings), settings);
  });

  it("is a settings column", () => {
    const patch = eventSettingsPatchSchema.parse({ shareFrame: { style: "polaroid", text: "", guestShare: true, showLogo: false } });
    assert.deepEqual(settingsPatchToColumns(patch), { share_frame: { style: "polaroid", text: null, guestShare: true, showLogo: false } });
  });
});

describe("brand kit", () => {
  const input = brandingSchema.parse({ logo: PNG, sponsors: [{ id: "abcd1234", name: "Acme", logo: PNG }], sponsorsLabel: "", showOnLiveWall: true });

  it("stores only metadata on the event", () => {
    const meta = brandingMetaFrom(input, 3);
    assert.deepEqual(readBranding(meta), meta);
    assert.equal(JSON.stringify(meta).includes("base64"), false);
    assert.equal(brandFor("demo", null), null);
    const brand = brandFor("demo", meta);
    assert.equal(brand?.logoUrl, "/api/events/demo/brand?a=logo&v=3");
    assert.equal(brand?.sponsors[0].logoUrl, "/api/events/demo/brand?a=abcd1234&v=3");
  });

  it("rejects non-image data and decodes stored images", () => {
    assert.equal(brandingSchema.safeParse({ ...input, logo: "data:text/html;base64,PGI+" }).success, false);
    assert.equal(decodeDataUrl(PNG)?.mime, "image/png");
    assert.equal(decodeDataUrl("nope"), null);
  });
});

describe("leaderboard", () => {
  const rows = [
    { guest_session_id: "a", guest_name: "Ayşe", challenge_id: "c1", created_at: "2026-12-12T19:00:00Z" },
    { guest_session_id: "a", guest_name: "Ayşe", challenge_id: "c2", created_at: "2026-12-12T19:10:00Z" },
    { guest_session_id: "b", guest_name: "Can", challenge_id: "c1", created_at: "2026-12-12T19:05:00Z" },
    { guest_session_id: "b", guest_name: "Can", challenge_id: "c1", created_at: "2026-12-12T19:06:00Z" },
    { guest_session_id: "c", guest_name: "Deniz", challenge_id: "gone", created_at: "2026-12-12T19:07:00Z" },
  ];

  it("ranks by challenges completed, then shots, ignoring removed challenges", () => {
    const board = buildLeaderboard(rows, ["c1", "c2"], { mySessionId: "b" });
    assert.deepEqual(board.top.map((e) => [e.name, e.completed, e.shots]), [["Ayşe", 2, 2], ["Can", 1, 2]]);
    assert.equal(board.me?.rank, 2);
    assert.equal(board.players, 2);
  });

  it("hides names when the gallery is private", () => {
    const board = buildLeaderboard(rows, ["c1", "c2"], { mySessionId: "a", showNames: false });
    assert.deepEqual(board.top, []);
    assert.equal(board.me?.rank, 1);
  });
});

describe("attendance report", () => {
  const row = (over: Partial<ReportMediaRow>): ReportMediaRow => ({
    kind: "photo",
    status: "approved",
    size_bytes: 100,
    guest_session_id: "a",
    guest_name: "Ayşe",
    created_at: "2026-12-12T19:15:00Z",
    heart_count: 0,
    challenge_id: null,
    category: null,
    is_guestbook: false,
    drive_file_id: "f1",
    ...over,
  });

  it("counts totals, fills empty hours and lists favourites", () => {
    const report = buildReport(
      [
        row({ heart_count: 5, drive_file_id: "top" }),
        row({ kind: "video", guest_session_id: "b", guest_name: "Can", created_at: "2026-12-12T21:40:00Z" }),
        row({ challenge_id: "c1", created_at: "2026-12-12T19:30:00Z" }),
      ],
      { challenges: [{ id: "c1", title: "Selfie" }], guestbookNotes: 4 },
    );
    assert.equal(report.totals.photos, 2);
    assert.equal(report.totals.videos, 1);
    assert.equal(report.totals.guests, 2);
    assert.equal(report.totals.hearts, 5);
    assert.deepEqual(report.hourly.map((h) => h.count), [2, 0, 1]);
    assert.equal(report.topContributors[0].name, "Ayşe");
    assert.deepEqual(report.challenges, [{ id: "c1", title: "Selfie", count: 1, players: 1 }]);
    assert.equal(report.topPhotos[0].fileId, "top");
  });
});
