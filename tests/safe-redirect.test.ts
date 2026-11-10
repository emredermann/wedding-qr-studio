import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeNextPath } from "../src/lib/safe-redirect.ts";

describe("safeNextPath", () => {
  it("keeps normal in-app paths unchanged", () => {
    for (const path of ["/dashboard", "/dashboard/3f1c2b4e-1111-4222-8333-444455556666", "/dashboard?drive=connected", "/e/ayse-ali/live", "/dashboard#x"]) {
      assert.equal(safeNextPath(path), path);
    }
  });

  it("falls back when next is missing or not a path", () => {
    assert.equal(safeNextPath(null), "/dashboard");
    assert.equal(safeNextPath(""), "/dashboard");
    assert.equal(safeNextPath("dashboard"), "/dashboard");
    assert.equal(safeNextPath("https://evil.com"), "/dashboard");
  });

  it("blocks open-redirect tricks", () => {
    for (const evil of ["//evil.com", "/\\evil.com", "/\\/evil.com", "/\t/evil.com", "/\n/evil.com", "\\\\evil.com"]) {
      assert.equal(safeNextPath(evil), "/dashboard", JSON.stringify(evil));
    }
  });
});
