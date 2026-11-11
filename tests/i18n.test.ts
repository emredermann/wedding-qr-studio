import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normaliseLang } from "../src/lib/i18n/config.ts";
import { EN } from "../src/lib/i18n/en.ts";
import { translate, translateLoose } from "../src/lib/i18n/translate.ts";
import { formatMinutes, scheduleEmoji } from "../src/lib/event-extras.ts";

describe("translate", () => {
  it("returns Turkish by default and English when asked", () => {
    assert.equal(translate("tr", "Galeri"), "Galeri");
    assert.equal(translate("en", "Galeri"), "Gallery");
  });

  it("fills placeholders and picks English plurals", () => {
    assert.equal(translate("tr", "{n} fotoğrafta sizi bulduk", { n: 3 }), "3 fotoğrafta sizi bulduk");
    assert.equal(translate("en", "{n} fotoğrafta sizi bulduk", { n: 1 }), "We found you in 1 photo");
    assert.equal(translate("en", "{n} fotoğrafta sizi bulduk", { n: 4 }), "We found you in 4 photos");
  });

  it("has no empty English values and keeps placeholders consistent", () => {
    for (const [tr, en] of Object.entries(EN)) {
      assert.ok(en.trim().length > 0, `empty translation for ${tr}`);
      const names = (text: string) => [...text.matchAll(/\{(\w+)[}|]/g)].map((m) => m[1]).sort();
      assert.deepEqual([...new Set(names(en))], [...new Set(names(tr))], `placeholders differ for ${tr}`);
    }
  });
});

describe("translateLoose (server and thrown messages)", () => {
  it("translates known messages, patterns, and leaves unknown text alone", () => {
    assert.equal(translateLoose("Dosya bulunamadı.", "en"), "File not found.");
    assert.equal(translateLoose("Dosya bulunamadı.", "tr"), "Dosya bulunamadı.");
    assert.equal(translateLoose("Çok fazla istek. 30 sn sonra tekrar deneyin.", "en"), "Too many requests. Try again in 30 s.");
    assert.equal(translateLoose("Something else", "en"), "Something else");
  });
});

describe("language helpers", () => {
  it("defaults to Turkish", () => {
    assert.equal(normaliseLang(undefined), "tr");
    assert.equal(normaliseLang("fr"), "tr");
    assert.equal(normaliseLang("en"), "en");
  });

  it("formats minutes per language and finds emojis for English titles", () => {
    assert.equal(formatMinutes(65, "en"), "1 h 5 min");
    assert.equal(formatMinutes(0, "en"), "soon");
    assert.equal(formatMinutes(65), "1 sa 5 dk");
    assert.equal(scheduleEmoji("First dance"), "💃");
    assert.equal(scheduleEmoji("Cutting the cake"), "🎂");
  });
});
