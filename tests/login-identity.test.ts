import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isValidUsername, loginEmailCandidates, loginEmailToUsername, normaliseUsername, usernameToLoginEmail } from "../src/lib/login-identity.ts";

const DOMAIN = "kullanici.eventqr.app";

describe("login identity", () => {
  it("maps a username to the internal login e-mail", () => {
    assert.equal(usernameToLoginEmail("Ayşe.Mehmet ", DOMAIN), "ayse.mehmet@kullanici.eventqr.app");
  });

  it("lets legacy e-mail accounts log in unchanged", () => {
    assert.equal(usernameToLoginEmail("Eski@Ornek.com", DOMAIN), "eski@ornek.com");
  });

  it("maps the internal e-mail back to the username", () => {
    assert.equal(loginEmailToUsername("ayse@kullanici.eventqr.app", DOMAIN), "ayse");
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

describe("loginEmailCandidates (co-host lookup)", () => {
  it("tries the current and legacy internal domains for a username", () => {
    assert.deepEqual(loginEmailCandidates(" Ayşe ", DOMAIN), ["ayse@kullanici.eventqr.app", "ayse@kullanici.weddingqr.app"]);
  });

  it("accepts the full e-mail of a legacy account as typed", () => {
    assert.deepEqual(loginEmailCandidates("Ornek.Kisi@Gmail.com", DOMAIN), ["ornek.kisi@gmail.com"]);
  });

  it("returns nothing for input that is neither", () => {
    assert.deepEqual(loginEmailCandidates("a", DOMAIN), []);
    assert.deepEqual(loginEmailCandidates("not an email@", DOMAIN), []);
    assert.deepEqual(loginEmailCandidates("Geçersiz Ad!!", DOMAIN), []);
  });
});
