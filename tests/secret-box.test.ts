import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
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

/** Seals the way secret-box does, but with an explicit HKDF salt. */
function sealWithSalt(plaintext: string, appSecret: string, purpose: string, salt: string): string {
  const key = Buffer.from(hkdfSync("sha256", appSecret, salt, `v1:${purpose}`, 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Opens a sealed value with an explicit HKDF salt (throws if the salt is wrong). */
function openWithSalt(sealed: string, appSecret: string, purpose: string, salt: string): string {
  const [, iv, tag, data] = sealed.split(".");
  const key = Buffer.from(hkdfSync("sha256", appSecret, salt, `v1:${purpose}`, 32));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(purpose, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

describe("secret-box HKDF salt", () => {
  it("seals new values with the event-qr salt", () => {
    const sealed = sealSecret(TOKEN, KEY, PURPOSE);
    assert.equal(openWithSalt(sealed, KEY, PURPOSE, "event-qr/secret-box"), TOKEN);
    assert.throws(() => openWithSalt(sealed, KEY, PURPOSE, "wedding-qr/secret-box"));
  });
  it("opens values sealed with the event-qr salt", () => {
    assert.equal(openSecret(sealWithSalt(TOKEN, KEY, PURPOSE, "event-qr/secret-box"), KEY, PURPOSE), TOKEN);
  });

  it("still opens refresh tokens sealed before the rename (legacy salt)", () => {
    assert.equal(openSecret(sealWithSalt(TOKEN, KEY, PURPOSE, "wedding-qr/secret-box"), KEY, PURPOSE), TOKEN);
  });

  it("rejects values sealed with an unknown salt", () => {
    assert.equal(openSecret(sealWithSalt(TOKEN, KEY, PURPOSE, "other/secret-box"), KEY, PURPOSE), null);
  });
});
