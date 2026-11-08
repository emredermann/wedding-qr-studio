import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openSecret, sealSecret } from "../src/lib/secret-box.ts";

const KEY = "a".repeat(64);
const PURPOSE = "google-drive-refresh-token";
const TOKEN = "1//0gExampleRefreshToken-ğüş";

describe("secret-box (AES-256-GCM)", () => {
  it("round-trips a refresh token", () => {
    const sealed = sealSecret(TOKEN, KEY, PURPOSE);
    assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.ok(!sealed.includes(TOKEN));
    assert.equal(openSecret(sealed, KEY, PURPOSE), TOKEN);
  });

  it("uses a fresh IV for every seal", () => {
    assert.notEqual(sealSecret(TOKEN, KEY, PURPOSE), sealSecret(TOKEN, KEY, PURPOSE));
  });

  it("fails closed with another APP_SECRET or purpose", () => {
    const sealed = sealSecret(TOKEN, KEY, PURPOSE);
    assert.equal(openSecret(sealed, "b".repeat(64), PURPOSE), null);
    assert.equal(openSecret(sealed, KEY, "other-purpose"), null);
  });

  it("detects tampering", () => {
    const [v, iv, tag, data] = sealSecret(TOKEN, KEY, PURPOSE).split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 0x01;
    assert.equal(openSecret([v, iv, tag, flipped.toString("base64url")].join("."), KEY, PURPOSE), null);
    assert.equal(openSecret("v2.x.y.z", KEY, PURPOSE), null);
    assert.equal(openSecret("garbage", KEY, PURPOSE), null);
  });
});
