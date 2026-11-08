import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveClientIp } from "../src/lib/client-ip.ts";
import { mapSettledLimit } from "../src/lib/concurrency.ts";
import { encodeMediaCursor, mediaCursorFilter, parseMediaCursor } from "../src/lib/pagination.ts";
import { slugify } from "../src/lib/slug.ts";
import { bulkMediaSchema, eventSettingsPatchSchema, settingsPatchToColumns } from "../src/lib/validation.ts";

const headers = (init: Record<string, string>) => new Headers(init);

describe("resolveClientIp", () => {
  it("ignores the spoofable leftmost X-Forwarded-For entry", () => {
    assert.equal(resolveClientIp(headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), {}), "203.0.113.7");
  });

  it("prefers Vercel's own header on Vercel", () => {
    const h = headers({ "x-forwarded-for": "6.6.6.6", "x-vercel-forwarded-for": "198.51.100.2" });
    assert.equal(resolveClientIp(h, { VERCEL: "1" }), "198.51.100.2");
  });

  it("honours TRUSTED_IP_HEADER", () => {
    const h = headers({ "cf-connecting-ip": "192.0.2.9", "x-forwarded-for": "6.6.6.6" });
    assert.equal(resolveClientIp(h, { TRUSTED_IP_HEADER: "CF-Connecting-IP" }), "192.0.2.9");
  });

  it("falls back to unknown", () => {
    assert.equal(resolveClientIp(headers({}), {}), "unknown");
  });
});

describe("media cursor", () => {
  const row = { created_at: "2026-11-08T13:14:15.123456+00:00", id: "0F8FAD5B-D9CB-469F-A165-70867728950E" };

  it("round-trips the composite cursor", () => {
    const parsed = parseMediaCursor(encodeMediaCursor(row));
    assert.deepEqual(parsed, { createdAt: row.created_at, id: row.id.toLowerCase() });
  });

  it("accepts a legacy bare timestamp", () => {
    assert.deepEqual(parseMediaCursor("2026-11-08T13:14:15.000Z"), { createdAt: "2026-11-08T13:14:15.000Z", id: null });
  });

  it("rejects filter-injection attempts", () => {
    assert.equal(parseMediaCursor("x,id.gt.0"), null);
    const parsed = parseMediaCursor(`${row.created_at}~1,status.eq.hidden`);
    assert.equal(parsed?.id, null);
  });

  it("builds a tie-breaking keyset filter", () => {
    assert.equal(
      mediaCursorFilter({ createdAt: row.created_at, id: "abc" }),
      `created_at.lt."${row.created_at}",and(created_at.eq."${row.created_at}",id.lt.abc)`,
    );
  });
});

describe("slugify", () => {
  it("transliterates Turkish characters", () => {
    assert.equal(slugify("Ayşe & Çağrı"), "ayse-cagri");
    assert.equal(slugify("İstanbul Düğünü 2026"), "istanbul-dugunu-2026");
  });

  it("limits length without trailing dashes", () => {
    const slug = slugify(`${"uzun ".repeat(30)}son`);
    assert.ok(slug.length <= 48);
    assert.ok(!slug.endsWith("-"));
  });
});

describe("mapSettledLimit", () => {
  it("keeps order, bounds concurrency and captures failures", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapSettledLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5 * (8 - n)));
      inFlight -= 1;
      if (n === 4) throw new Error("boom");
      return n * 10;
    });
    assert.ok(peak <= 3);
    assert.deepEqual(
      results.map((r) => (r.status === "fulfilled" ? r.value : "x")),
      [10, 20, 30, "x", 50, 60, 70],
    );
  });
});

describe("event settings patch", () => {
  it("writes only the keys that were sent", () => {
    const parsed = eventSettingsPatchSchema.parse({ uploadsEnabled: false });
    assert.deepEqual(settingsPatchToColumns(parsed), { uploads_enabled: false });
  });

  it("rejects an empty patch", () => {
    assert.equal(eventSettingsPatchSchema.safeParse({}).success, false);
  });

  it("validates bulk requests", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    assert.deepEqual(bulkMediaSchema.parse({ ids: [id, id], action: "approve" }).ids, [id]);
    assert.equal(bulkMediaSchema.safeParse({ ids: ["nope"], action: "approve" }).success, false);
    assert.equal(bulkMediaSchema.safeParse({ ids: [id], action: "drop" }).success, false);
  });
});
