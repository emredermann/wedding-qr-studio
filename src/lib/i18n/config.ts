/**
 * Language settings shared by server and client code (no React, no Node APIs).
 * The chosen language lives in a cookie so server-rendered pages, client
 * components and plain helpers all agree on it from the first paint.
 */
export const LANGS = ["tr", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "tr";
export const LANG_COOKIE = "mira_lang";
/** One year. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** BCP 47 locale used for dates and numbers. */
export const LOCALE: Record<Lang, string> = { tr: "tr-TR", en: "en-GB" };

export function normaliseLang(value: unknown): Lang {
  return value === "en" ? "en" : DEFAULT_LANG;
}

/** Current language in the browser (for non-React helpers); the default on the server. */
export function currentLang(): Lang {
  if (typeof document === "undefined") return DEFAULT_LANG;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]+)`));
  return normaliseLang(match?.[1]);
}

export function currentLocale(): string {
  return LOCALE[currentLang()];
}
