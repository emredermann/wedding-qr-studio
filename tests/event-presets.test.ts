import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVENT_PRESETS,
  EVENT_TYPES,
  QR_TEMPLATE_IDS,
  THEME_IDS,
  THEMES,
  normaliseEventType,
  normaliseThemeId,
  orderedQrTemplates,
  presetFor,
  readModules,
  themeCssVars,
  themeFor,
} from "../src/lib/event-presets.ts";
import { EN } from "../src/lib/i18n/en.ts";
import { createEventSchema, eventSettingsPatchSchema, PRESET_SETTING_COLUMNS, settingsPatchToColumns } from "../src/lib/validation.ts";

describe("legacy events (no preset columns / NULL values)", () => {
  it("fall back to the general preset and the original Mira look", () => {
    assert.equal(presetFor(null).type, "event");
    assert.equal(presetFor(undefined).type, "event");
    assert.equal(themeFor(null).id, "minimal");
    assert.equal(normaliseEventType("birthday"), null);
    assert.equal(normaliseThemeId(42), null);
  });

  it("keep the exact ivory-to-ink palette of globals.css", () => {
    const vars = themeCssVars(themeFor(null), "#1f1d1a");
    assert.equal(vars["--color-stone-50"], "#f7f5f0");
    assert.equal(vars["--color-stone-900"], "#1c1b18");
    assert.equal(vars["--color-surface"], "#ffffff");
    assert.equal(vars["--accent"], "#1f1d1a");
  });

  it("keep the original guest copy and schedule-first order", () => {
    const legacy = presetFor(null);
    assert.equal(legacy.guestOrder[0], "schedule");
    assert.equal(legacy.scheduleLabel, "Program");
    assert.equal(legacy.welcome, "Bu özel günde çektiğiniz fotoğrafları, videoları ve dileklerinizi bizimle paylaşın.");
  });

  it("show every module that has content when no switches are saved", () => {
    assert.deepEqual(readModules(undefined), { schedule: true, challenges: true });
    assert.deepEqual(readModules(null), { schedule: true, challenges: true });
    assert.deepEqual(readModules("garbage"), { schedule: true, challenges: true });
    assert.deepEqual(readModules({ schedule: false }), { schedule: false, challenges: true });
  });
});

describe("presets", () => {
  it("cover every type with a known theme and translated copy", () => {
    for (const type of EVENT_TYPES) {
      const preset = EVENT_PRESETS[type];
      assert.equal(preset.type, type);
      assert.ok((THEME_IDS as readonly string[]).includes(preset.defaultTheme));
      for (const key of [preset.label, preset.blurb, preset.welcome, preset.guestbookPrompt, preset.scheduleLabel, preset.qrHeading, ...preset.defaultChallenges]) {
        assert.ok(key in EN, `missing English for ${key}`);
      }
      assert.ok(preset.categories.tr.length > 0 && preset.categories.tr.length === preset.categories.en.length);
    }
  });

  it("put wedding timeline first and lead general events with challenges", () => {
    assert.equal(EVENT_PRESETS.wedding.guestOrder[0], "schedule");
    assert.equal(EVENT_PRESETS.wedding.modules.schedule, true);
    assert.equal(EVENT_PRESETS.event.guestOrder[0], "challenges");
    assert.equal(EVENT_PRESETS.event.modules.schedule, false);
  });

  it("order QR templates by preset and never drop one", () => {
    for (const type of [...EVENT_TYPES, null]) {
      const order = orderedQrTemplates(type);
      assert.equal(order.length, QR_TEMPLATE_IDS.length);
      assert.deepEqual([...order].sort(), [...QR_TEMPLATE_IDS].sort());
    }
    assert.equal(orderedQrTemplates("wedding")[0], "ornek");
    assert.equal(orderedQrTemplates("event")[0], "modern");
  });

  it("use accents that keep white button text readable", () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const theme of Object.values(THEMES)) {
      const contrast = 1.05 / (luminance(theme.accent) + 0.05);
      assert.ok(contrast >= 4.5, `${theme.id} accent contrast ${contrast.toFixed(2)}`);
    }
  });
});

describe("validation", () => {
  it("maps preset settings to their columns", () => {
    const patch = eventSettingsPatchSchema.parse({ eventType: "wedding", themeId: "elegant", modules: { schedule: true, challenges: false } });
    const columns = settingsPatchToColumns(patch);
    assert.deepEqual(columns, { event_type: "wedding", theme_id: "elegant", modules: { schedule: true, challenges: false } });
    assert.deepEqual(Object.keys(columns).sort(), [...PRESET_SETTING_COLUMNS].sort());
  });

  it("rejects unknown types and themes, and keeps old create bodies valid", () => {
    assert.equal(eventSettingsPatchSchema.safeParse({ eventType: "funeral" }).success, false);
    assert.equal(eventSettingsPatchSchema.safeParse({ themeId: "neon" }).success, false);
    const legacy = createEventSchema.parse({ title: "Ayşe & Mehmet" });
    assert.equal(legacy.eventType, undefined);
    assert.equal(legacy.themeId, undefined);
  });
});
