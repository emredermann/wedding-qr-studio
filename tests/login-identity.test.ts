import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isValidUsername, loginEmailToUsername, normaliseUsername, usernameToLoginEmail } from "../src/lib/login-identity.ts";

const DOMAIN = "kullanici.weddingqr.app";

describe("login identity", () => {
  it("maps a username to the internal login e-mail", () => {
    assert.equal(usernameToLoginEmail("Ayşe.Mehmet ", DOMAIN), "ayse.mehmet@kullanici.weddingqr.app");
  });

  it("lets legacy e-mail accounts log in unchanged", () => {
    assert.equal(usernameToLoginEmail("Eski@Ornek.com", DOMAIN), "eski@ornek.com");
  });

  it("maps the internal e-mail back to the username", () => {
    assert.equal(loginEmailToUsername("ayse@kullanici.weddingqr.app", DOMAIN), "ayse");
    assert.equal(loginEmailToUsername("eski@ornek.com", DOMAIN), "eski@ornek.com");
    assert.equal(loginEmailToUsername(null, DOMAIN), null);
  });

  it("validates usernames", () => {
    for (const ok of ["ayse", "ayse.mehmet", "dugun_2026", "a-b"]) assert.ok(isValidUsername(normaliseUsername(ok)), ok);
    for (const bad of ["ab", ".ayse", "ayse.", "ayşe mehmet", "a".repeat(33), "x@y"]) {
      assert.ok(!isValidUsername(bad), bad);
    }
  });
});
