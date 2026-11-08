import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contentDisposition, MAX_CHUNK_BYTES, parseRange } from "../src/lib/http-range.ts";

describe("parseRange", () => {
  const total = 100 * 1024 * 1024;

  it("returns null without a Range header", () => {
    assert.equal(parseRange(null, total), null);
  });

  it("caps open-ended ranges to one chunk", () => {
    assert.deepEqual(parseRange("bytes=0-", total), { start: 0, end: MAX_CHUNK_BYTES - 1 });
  });

  it("keeps an explicit range inside the file", () => {
    assert.deepEqual(parseRange("bytes=10-19", total), { start: 10, end: 19 });
    assert.deepEqual(parseRange("bytes=90-999", 100), { start: 90, end: 99 });
  });

  it("supports suffix ranges", () => {
    assert.deepEqual(parseRange("bytes=-500", 1000), { start: 500, end: 999 });
  });

  it("rejects malformed or unsatisfiable ranges", () => {
    for (const header of ["bytes=-", "items=0-5", "bytes=5-1", "bytes=abc-", "bytes=0-1,4-5"]) {
      assert.equal(parseRange(header, 1000), "invalid", header);
    }
    assert.equal(parseRange("bytes=1000-", 1000), "invalid");
  });
});

describe("contentDisposition", () => {
  it("adds an ASCII fallback and an RFC 5987 UTF-8 name", () => {
    const value = contentDisposition("attachment", 'Düğün "ilk dans".mp4');
    assert.match(value, /^attachment; filename="D___n _ilk dans_.mp4"; /);
    assert.ok(value.endsWith(`filename*=UTF-8''${encodeURIComponent('Düğün "ilk dans".mp4')}`));
  });
});
