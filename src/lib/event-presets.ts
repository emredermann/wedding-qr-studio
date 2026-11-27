/**
 * Event Type Presets — the single place that decides how an event looks and
 * which guest modules it puts first. Components never branch on "is this a
 * wedding?"; they ask the preset.
 *
 * Presets are smart defaults, not locks: the host can switch the theme and
 * turn every module on or off whatever the type.
 *
 * Dependency-free (only type imports) so `node --test` can load it directly.
 */
import type { MsgKey } from "./i18n/translate.ts";

/* ----------------------------------------------------------------- themes */

export const THEME_IDS = ["minimal", "elegant", "night", "corporate"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Steps of the neutral scale the guest UI is built from (Tailwind `stone-*`). */
const SCALE_STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
type Scale = Record<(typeof SCALE_STEPS)[number], string>;

export interface ThemeDef {
  id: ThemeId;
  name: MsgKey;
  /** Suggested accent (buttons, active tabs). AA contrast with white text. */
  accent: string;
  /** Neutral scale: 50 = page background … 900 = main text. Dark themes invert it. */
  scale: Scale;
  /** Card / input surface (`bg-surface`). */
  surface: string;
  /** Display face for headings (`font-serif` in the guest UI). */
  heading: "sans" | "display";
  dark: boolean;
}

/** Mira's own ivory-to-ink scale — identical to globals.css, so legacy events look exactly as before. */
const MIRA_SCALE: Scale = {
  "50": "#f7f5f0",
  "100": "#efece5",
  "200": "#e2ded5",
  "300": "#cbc6bb",
  "400": "#a19c92",
  "500": "#78736a",
  "600": "#5a564f",
  "700": "#44413b",
  "800": "#2c2a26",
  "900": "#1c1b18",
  "950": "#111110",
};

export const THEMES: Record<ThemeId, ThemeDef> = {
  minimal: { id: "minimal", name: "Minimal", accent: "#1f1d1a", scale: MIRA_SCALE, surface: "#ffffff", heading: "sans", dark: false },
  elegant: {
    id: "elegant",
    name: "Zarif",
    accent: "#8a6a3f",
    scale: {
      "50": "#faf6ef",
      "100": "#f3ece0",
      "200": "#e8dece",
      "300": "#d6c7b0",
      "400": "#b2a085",
      "500": "#8c7b62",
      "600": "#6c5d49",
      "700": "#544838",
      "800": "#3a3127",
      "900": "#251f18",
      "950": "#16120d",
    },
    surface: "#fffdf9",
    heading: "display",
    dark: false,
  },
  night: {
    id: "night",
    name: "Gece",
    accent: "#6d4aff",
    // Inverted: "50" is the darkest background, "900" the lightest text.
    scale: {
      "50": "#0f0e15",
      "100": "#17161f",
      "200": "#2a2834",
      "300": "#3b3947",
      "400": "#6a6779",
      "500": "#9592a5",
      "600": "#b4b1c2",
      "700": "#cfcddb",
      "800": "#e5e3ee",
      "900": "#f4f3f9",
      "950": "#fbfaff",
    },
    surface: "#1a1923",
    heading: "sans",
    dark: true,
  },
  corporate: {
    id: "corporate",
    name: "Kurumsal",
    accent: "#2f54d1",
    scale: {
      "50": "#f5f7fa",
      "100": "#edf0f5",
      "200": "#dde2ea",
      "300": "#c3cad6",
      "400": "#97a1b2",
      "500": "#6b7587",
      "600": "#4f5868",
      "700": "#3b4350",
      "800": "#262c36",
      "900": "#151a22",
      "950": "#0b0e13",
    },
    surface: "#ffffff",
    heading: "sans",
    dark: false,
  },
};

export const DEFAULT_THEME_ID: ThemeId = "minimal";

export function normaliseThemeId(value: unknown): ThemeId | null {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value) ? (value as ThemeId) : null;
}

/** Saved theme, or the legacy look (Mira minimal) for events created before themes existed. */
export function themeFor(id: ThemeId | null | undefined): ThemeDef {
  return THEMES[id ?? DEFAULT_THEME_ID] ?? THEMES[DEFAULT_THEME_ID];
}

/**
 * CSS custom properties that re-skin the guest UI and live wall. Tailwind v4
 * utilities read `--color-stone-*` at use time, so redefining them on the
 * guest page root re-themes every panel without touching component classes.
 * Pair with `themeDataAttrs` (heading face).
 */
export function themeCssVars(theme: ThemeDef, accent: string): Record<string, string> {
  const vars: Record<string, string> = {
    "--accent": accent,
    "--color-surface": theme.surface,
    "--event-primary": accent,
    "--event-bg": theme.scale["50"],
    "--event-text": theme.scale["900"],
    "--event-surface": theme.surface,
    colorScheme: theme.dark ? "dark" : "light",
  };
  for (const step of SCALE_STEPS) vars[`--color-stone-${step}`] = theme.scale[step];
  return vars;
}

/** Data attributes for the themed root (globals.css switches the heading face on them). */
export function themeDataAttrs(theme: ThemeDef): Record<string, string> {
  return { "data-eqr-theme": theme.id, "data-eqr-heading": theme.heading };
}

/* ---------------------------------------------------------------- presets */

export const EVENT_TYPES = ["wedding", "corporate", "party", "event"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
/** Events saved before presets existed resolve to this one. */
export const DEFAULT_EVENT_TYPE: EventType = "event";

export const QR_TEMPLATE_IDS = ["ornek", "cizim", "cicek", "kalpler", "klasik", "modern", "botanik", "gece", "kurumsal", "parti"] as const;
export type QrTemplateId = (typeof QR_TEMPLATE_IDS)[number];

export type GuestModule = "schedule" | "challenges";

/** Host switches for optional guest modules (the guestbook keeps its own column). */
export interface EventModules {
  schedule: boolean;
  challenges: boolean;
}

export interface EventPreset {
  type: EventType;
  label: MsgKey;
  blurb: MsgKey;
  icon: "rings" | "briefcase" | "party" | "sparkles";
  defaultTheme: ThemeId;
  /** QR card templates, best fit first; the first one is preselected. */
  qrTemplates: readonly QrTemplateId[];
  /** How many of `qrTemplates` carry a "Recommended" badge. */
  qrRecommended: number;
  /** Heading for templates that suggest one (handwritten "memory card"). */
  qrHeading: MsgKey;
  /**
   * Modules switched on for a new event (and guestbook). Only weddings start
   * with challenges and the programme on; other types opt in.
   */
  modules: EventModules & { guestbook: boolean };
  /** Order of the guest-page cards; the first one is the hero. */
  guestOrder: readonly GuestModule[];
  /** Guest-facing name of the schedule card. */
  scheduleLabel: MsgKey;
  scheduleExample: MsgKey;
  /** Challenges added when a new event of this type is created. */
  defaultChallenges: readonly MsgKey[];
  /** One-tap suggestions in the challenge editor. */
  challengeIdeas: readonly MsgKey[];
  /** Album categories for a new event, by host language (stored as data, not translated later). */
  categories: { tr: readonly string[]; en: readonly string[] };
  welcome: MsgKey;
  guestbookPrompt: MsgKey;
  titlePlaceholder: MsgKey;
  nameLabel: MsgKey;
  namePlaceholder: MsgKey;
}

export const EVENT_PRESETS: Record<EventType, EventPreset> = {
  wedding: {
    type: "wedding",
    label: "Düğün & Nişan",
    blurb: "Zarif temalar, gecenin akışı ve anı defteri öne çıkar.",
    icon: "rings",
    defaultTheme: "elegant",
    qrTemplates: ["ornek", "cicek", "kalpler", "klasik", "botanik", "gece", "cizim", "modern", "kurumsal", "parti"],
    qrRecommended: 5,
    qrHeading: "Düğün Anılarınız Burada",
    modules: { schedule: true, challenges: true, guestbook: true },
    guestOrder: ["schedule", "challenges"],
    scheduleLabel: "Gecenin Akışı",
    scheduleExample: "Henüz program yok. Örnek: 19:00 Nikah, 20:30 Yemek, 21:30 İlk dans.",
    defaultChallenges: ["Çiftle bir selfie", "İlk danstan bir kare", "Masandaki herkes tek karede"],
    challengeIdeas: ["Çiftle bir selfie", "İlk danstan bir kare", "Gelinle bir selfie", "Damatla bir selfie", "Dans pistinden bir kare", "Masandaki herkes tek karede", "Günün en komik anı", "En şık misafir"],
    categories: { tr: ["Hazırlık", "Nikah", "İlk Dans", "Yemek", "After Party"], en: ["Getting Ready", "Ceremony", "First Dance", "Dinner", "After Party"] },
    welcome: "Bu özel günde çektiğiniz fotoğrafları, videoları ve dileklerinizi bizimle paylaşın.",
    guestbookPrompt: "Harika bir gündü, her şey için teşekkürler…",
    titlePlaceholder: "ör. Ayşe & Mehmet Düğünü",
    nameLabel: "Çiftin isimleri (başlıkta görünür)",
    namePlaceholder: "Ayşe & Mehmet",
  },
  corporate: {
    type: "corporate",
    label: "Kurumsal & Konferans",
    blurb: "Sade kurumsal tema; görevler ve etkinlik akışı ile katılım artar.",
    icon: "briefcase",
    defaultTheme: "corporate",
    qrTemplates: ["kurumsal", "modern", "klasik", "gece", "cizim", "parti", "ornek", "botanik", "cicek", "kalpler"],
    qrRecommended: 3,
    qrHeading: "Etkinlik Anılarınız Burada",
    modules: { schedule: false, challenges: false, guestbook: true },
    guestOrder: ["challenges", "schedule"],
    scheduleLabel: "Etkinlik Akışı",
    scheduleExample: "Henüz program yok. Örnek: 09:30 Karşılama, 10:00 Açılış konuşması, 12:30 Öğle arası.",
    defaultChallenges: ["Ekiple bir grup fotoğrafı", "Konuşmacıyla bir kare", "Yeni tanıştığın biriyle selfie"],
    challengeIdeas: ["Ekiple bir grup fotoğrafı", "Konuşmacıyla bir kare", "Yeni tanıştığın biriyle selfie", "Sahneden bir kare", "Kahve molasından bir an", "Etkinliğin en ilham verici anı"],
    categories: { tr: ["Karşılama", "Sunumlar", "Panel", "Networking", "Akşam Yemeği"], en: ["Welcome", "Talks", "Panel", "Networking", "Dinner"] },
    welcome: "Etkinlikten fotoğraf, video ve izlenimlerinizi paylaşın; hepsi tek bir ortak albümde buluşsun.",
    guestbookPrompt: "Etkinlikle ilgili izleniminizi ya da bir notunuzu bırakın…",
    titlePlaceholder: "ör. Yıllık Bayi Toplantısı 2026",
    nameLabel: "Başlıkta görünecek isim (isteğe bağlı)",
    namePlaceholder: "ör. Atlas Teknoloji Zirvesi",
  },
  party: {
    type: "party",
    label: "Doğum günü & Parti",
    blurb: "Gece teması ve eğlenceli görevler misafirleri harekete geçirir.",
    icon: "party",
    defaultTheme: "night",
    qrTemplates: ["parti", "gece", "cizim", "modern", "kalpler", "kurumsal", "klasik", "ornek", "botanik", "cicek"],
    qrRecommended: 3,
    qrHeading: "Parti Anılarınız Burada",
    modules: { schedule: false, challenges: false, guestbook: true },
    guestOrder: ["challenges", "schedule"],
    scheduleLabel: "Gecenin Akışı",
    scheduleExample: "Henüz program yok. Örnek: 20:00 Karşılama, 21:30 Pasta, 22:00 Dans.",
    defaultChallenges: ["Ev sahibiyle bir selfie", "Pastanın kesildiği an", "Dans pistinden bir kare"],
    challengeIdeas: ["Ev sahibiyle bir selfie", "Pastanın kesildiği an", "Dans pistinden bir kare", "En çılgın kostüm", "Masandaki herkes tek karede", "Günün en komik anı"],
    categories: { tr: ["Karşılama", "Pasta", "Dans", "Oyunlar", "After Party"], en: ["Welcome", "Cake", "Dancing", "Games", "After Party"] },
    welcome: "Bu gecenin en güzel karelerini, videolarını ve dileklerinizi bizimle paylaşın.",
    guestbookPrompt: "Ev sahibine birkaç güzel söz bırakın…",
    titlePlaceholder: "ör. Deniz’in Doğum Günü",
    nameLabel: "Başlıkta görünecek isim (isteğe bağlı)",
    namePlaceholder: "ör. Deniz 30 yaşında",
  },
  event: {
    type: "event",
    label: "Diğer etkinlikler",
    blurb: "Mezuniyet, festival, lansman… Sade tema, görevler önde.",
    icon: "sparkles",
    defaultTheme: "minimal",
    qrTemplates: ["modern", "kurumsal", "cizim", "parti", "klasik", "gece", "ornek", "botanik", "cicek", "kalpler"],
    qrRecommended: 4,
    qrHeading: "Etkinlik Anılarınız Burada",
    modules: { schedule: false, challenges: false, guestbook: true },
    guestOrder: ["challenges", "schedule"],
    scheduleLabel: "Etkinlik Akışı",
    scheduleExample: "Henüz program yok. Örnek: 19:00 Karşılama, 20:00 Sahne, 22:00 After party.",
    defaultChallenges: ["Ekiple bir grup fotoğrafı", "Sahneden bir kare", "Günün en komik anı"],
    challengeIdeas: ["Ekiple bir grup fotoğrafı", "Sahneden bir kare", "Yeni tanıştığın biriyle selfie", "Mekândan en güzel detay", "Masandaki herkes tek karede", "Günün en komik anı"],
    categories: { tr: ["Karşılama", "Sahne", "Anlar", "Ekip", "After Party"], en: ["Welcome", "Stage", "Moments", "Crew", "After Party"] },
    welcome: "Bu etkinlikte çektiğiniz fotoğrafları, videoları ve mesajlarınızı bizimle paylaşın.",
    guestbookPrompt: "Bugünden aklınızda kalan bir an, bir not…",
    titlePlaceholder: "ör. Mezuniyet Töreni, Yaz Festivali",
    nameLabel: "Başlıkta görünecek isim (isteğe bağlı)",
    namePlaceholder: "ör. Mezuniyet 2026",
  },
};

export function normaliseEventType(value: unknown): EventType | null {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value) ? (value as EventType) : null;
}

/**
 * Events created before presets existed: host-side defaults of the general
 * preset, but the guest page keeps exactly what it showed before (original
 * welcome and guestbook copy, "Program" label, schedule card first).
 */
const LEGACY_PRESET: EventPreset = {
  ...EVENT_PRESETS[DEFAULT_EVENT_TYPE],
  guestOrder: ["schedule", "challenges"],
  scheduleLabel: "Program",
  welcome: "Bu özel günde çektiğiniz fotoğrafları, videoları ve dileklerinizi bizimle paylaşın.",
  guestbookPrompt: "Harika bir gündü, her şey için teşekkürler…",
};

/** Saved preset, or the legacy profile for events created before presets existed. */
export function presetFor(type: EventType | null | undefined): EventPreset {
  return (type && EVENT_PRESETS[type]) || LEGACY_PRESET;
}

/**
 * Reads the `modules` jsonb. Missing or malformed (legacy events, or the
 * column not migrated yet) means "show what has content", which is exactly
 * how the guest page behaved before modules existed.
 */
export function readModules(value: unknown): EventModules {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    schedule: raw.schedule !== false,
    challenges: raw.challenges !== false,
  };
}

/** QR templates with the preset's picks first; unknown ids are ignored, missing ones appended. */
export function orderedQrTemplates(type: EventType | null | undefined): QrTemplateId[] {
  const preferred = presetFor(type).qrTemplates.filter((id) => (QR_TEMPLATE_IDS as readonly string[]).includes(id));
  return [...new Set([...preferred, ...QR_TEMPLATE_IDS])];
}
