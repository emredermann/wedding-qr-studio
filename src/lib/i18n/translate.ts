import { DEFAULT_LANG, currentLang, type Lang } from "./config.ts";
import { EN } from "./en.ts";

/**
 * Turkish text is the key; `EN` maps it to English. `t()` only accepts keys
 * present in `EN`, so a missing English translation is a type error.
 *
 * Placeholders: `{name}` is replaced by `vars.name`; `{n|one|many}` picks a
 * word by whether `vars.n` is 1 (only needed in English).
 */
export type MsgKey = keyof typeof EN;
export type Vars = Record<string, string | number>;

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text
    .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_, key: string, one: string, many: string) => (Number(vars[key]) === 1 ? one : many))
    .replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function translate(lang: Lang, key: MsgKey, vars?: Vars): string {
  return interpolate(lang === "en" ? EN[key] : key, vars);
}

/** Dynamic server messages: "<Turkish prefix>…" → English, with the captured tail kept. */
const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^İstek başarısız \((\d+)\)\.$/, (m) => `Request failed (${m[1]}).`],
  [/^(.+) çok büyük \(en fazla (.+)\)\.$/, (m) => `${m[1]} is too large (max ${m[2]}).`],
  [/^Lütfen (\d+) saniye sonra tekrar deneyin\.$/, (m) => `Please try again in ${m[1]} seconds.`],
  [/^Google Drive yüklemeyi reddetti \((\d+)\)\.$/, (m) => `Google Drive rejected the upload (${m[1]}).`],
  [/^Bu dosya çok büyük\. En fazla (.+) yükleyebilirsiniz\.$/, (m) => `This file is too large. You can upload up to ${m[1]}.`],
  [/^(\d+) etkinliğiniz medyasını bu Drive'da saklıyor\./, (m) => `${m[1]} of your events store their media in this Drive. Disconnecting would break them; delete those events first.`],
  [/^En fazla (\d+) görev$/, (m) => `At most ${m[1]} challenges`],
  [/^En fazla (\d+) program maddesi$/, (m) => `At most ${m[1]} programme items`],
  [/^En fazla (\d+) ortak yönetici ekleyebilirsiniz\.$/, (m) => `You can add at most ${m[1]} co-hosts.`],
  [/^Etkinlik sahibinin Google Drive alanı dolu \(boş alan: (.+)\)\./, (m) => `The host's Google Drive is full (free space: ${m[1]}). Please let the host know.`],
  [/^Bu etkinlik için kişi başı yükleme sınırına ulaştınız \((.+)\)\.$/, (m) => `You've reached the per-guest upload limit for this event (${m[1].replace("dosya", "files")}).`],
  [/^Çok fazla istek\. (\d+) sn sonra tekrar deneyin\.$/, (m) => `Too many requests. Try again in ${m[1]} s.`],
  [/^Beklenmeyen bir sunucu hatası oluştu\. \((.+)\)$/, (m) => `An unexpected server error occurred. (${m[1]})`],
];

/**
 * Best-effort translation of text that did not come from `t()` (API error
 * messages, thrown errors). Unknown text is returned unchanged.
 */
export function translateLoose(text: string, lang: Lang = currentLang()): string {
  if (lang === DEFAULT_LANG) return text;
  const exact = (EN as Record<string, string>)[text];
  if (exact) return exact;
  for (const [pattern, render] of PATTERNS) {
    const match = text.match(pattern);
    if (match) return render(match);
  }
  return text;
}

/** For non-React helpers in the browser. */
export function tClient(key: MsgKey, vars?: Vars): string {
  return translate(currentLang(), key, vars);
}
