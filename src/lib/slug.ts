/** URL slug from a (Turkish) title: "Ayşe & Çağrı" → "ayse-cagri". */
export function slugify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (ch) => map[ch] ?? ch)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** Lower-case letters and digits without look-alikes (0/o, 1/l): easy to read off a printed QR card. */
const SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * Random, unguessable suffix for auto-generated event slugs ("ayse-mehmet-k7p2xq").
 * 6 chars from 32 symbols ≈ 1 billion combinations, so an event address can no
 * longer be found by trying common name pairs. Uses Web Crypto (Node and browser).
 */
export function randomSlugSuffix(length = 6): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  // 256 is a multiple of 32, so `% 32` is unbiased.
  return Array.from(bytes, (b) => SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length]).join("");
}
