/**
 * Username-based login on top of Supabase Auth (which requires an e-mail).
 *
 * Hosts never see or type an e-mail: the username "ayse" is mapped to the
 * internal identity "ayse@<LOGIN_EMAIL_DOMAIN>". Accounts are created by the
 * administrator (`npm run user -- create <username> <password>`) with the
 * e-mail pre-confirmed, so no mail is ever sent to these addresses.
 *
 * Shared by the browser (login form) and the admin script — keep it
 * dependency-free.
 */
export const DEFAULT_LOGIN_EMAIL_DOMAIN = "kullanici.eventqr.app";
export const LEGACY_LOGIN_EMAIL_DOMAINS = ["kullanici.weddingqr.app"] as const;

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;

export function loginEmailDomain(): string {
  return process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN?.trim().toLowerCase() || DEFAULT_LOGIN_EMAIL_DOMAIN;
}

/** Lower-cases and trims a username; Turkish letters are transliterated. */
export function normaliseUsername(raw: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  return raw
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (ch) => map[ch] ?? ch);
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/** "ayse" → "ayse@kullanici.eventqr.app". Full e-mails (legacy accounts) pass through unchanged. */
export function usernameToLoginEmail(input: string, domain: string = loginEmailDomain()): string {
  const value = normaliseUsername(input);
  return value.includes("@") ? value : `${value}@${domain}`;
}

/** Display name for a signed-in host: the username part of internal identities, else the e-mail. */
export function loginEmailToUsername(email: string | null | undefined, domain: string = loginEmailDomain()): string | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  for (const d of [domain, ...LEGACY_LOGIN_EMAIL_DOMAINS]) {
    const suffix = `@${d}`;
    if (lower.endsWith(suffix)) return email.slice(0, -suffix.length);
  }
  return email;
}

const SIMPLE_EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/**
 * Every login e-mail an account entered as `input` may have, in lookup order:
 * a full e-mail (legacy accounts) as typed, or a username under the current
 * and the legacy internal domains. Empty when the input is neither.
 */
export function loginEmailCandidates(input: string, domain: string = loginEmailDomain()): string[] {
  const value = normaliseUsername(input);
  if (value.includes("@")) return SIMPLE_EMAIL_PATTERN.test(value) ? [value] : [];
  if (!isValidUsername(value)) return [];
  return [...new Set([domain, ...LEGACY_LOGIN_EMAIL_DOMAINS])].map((d) => `${value}@${d}`);
}
