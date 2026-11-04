import { z } from "zod";

const TURKISH_CHAR_MAP: Readonly<Record<string, string>> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
  ß: "ss",
  æ: "ae",
  œ: "oe",
};

/**
 * Sanitizes a wedding event slug input in real time:
 *  - Converts Turkish and Unicode accented characters to ASCII equivalents.
 *  - Forces lowercase.
 *  - Converts spaces and invalid characters into single hyphens (`-`).
 *  - Strips leading hyphens (and trailing hyphens when `trimTrailing` is true).
 */
export function sanitizeSlugInput(raw: string, trimTrailing = false): string {
  const mapped = raw
    .split("")
    .map((ch) => TURKISH_CHAR_MAP[ch] ?? ch)
    .join("");

  const normalized = mapped
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "");

  const clipped = normalized.slice(0, 64);
  return trimTrailing ? clipped.replace(/-+$/, "") : clipped;
}

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_CHARS_REGEX = /^\+?[0-9()\s.-]{7,22}$/;

export function validateSlugField(slug: string): string | null {
  const cleaned = sanitizeSlugInput(slug, true);
  if (!cleaned) {
    return "Event URL slug is required.";
  }
  if (cleaned.length < 3) {
    return "Slug must be at least 3 characters long (e.g. clara-and-julian).";
  }
  if (cleaned.length > 64) {
    return "Slug must be 64 characters or fewer.";
  }
  if (!SLUG_REGEX.test(cleaned)) {
    return "Use lowercase letters, numbers, and single hyphens only.";
  }
  return null;
}

export function validateEventTitleField(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) {
    return "Event title is required.";
  }
  if (trimmed.length < 2) {
    return "Event title must be at least 2 characters.";
  }
  if (trimmed.length > 120) {
    return "Event title must be 120 characters or fewer.";
  }
  return null;
}

/**
 * Validates a guest contact string as either a valid email address or a valid
 * WhatsApp / mobile phone number (7–15 digits). Empty string is valid when optional.
 */
export function validateGuestContactField(
  contact: string,
  mandatory = false,
): string | null {
  const trimmed = contact.trim();
  if (!trimmed) {
    return mandatory ? "Please enter your WhatsApp phone number or email address." : null;
  }
  if (trimmed.length > 160) {
    return "Contact must be 160 characters or fewer.";
  }

  if (trimmed.includes("@")) {
    if (!EMAIL_REGEX.test(trimmed)) {
      return "Please enter a valid email address (e.g. guest@example.com).";
    }
    return null;
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (!PHONE_CHARS_REGEX.test(trimmed) || digitsOnly.length < 7 || digitsOnly.length > 15) {
    return "Enter a valid phone number (e.g. +1 555 234 5678) or email address.";
  }

  return null;
}

export function validateGuestNameField(name: string, mandatory = false): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return mandatory ? "Please enter your name so the couple knows who shared." : null;
  }
  if (trimmed.length < 2) {
    return "Name must be at least 2 characters.";
  }
  if (trimmed.length > 80) {
    return "Name must be 80 characters or fewer.";
  }
  return null;
}

export function validateTableNumberField(table: string): string | null {
  const trimmed = table.trim();
  if (!trimmed) return null;
  if (trimmed.length > 32) {
    return "Table label must be 32 characters or fewer.";
  }
  if (!/^[A-Za-z0-9\s#._-]+$/.test(trimmed)) {
    return "Table label may only contain letters, numbers, spaces, and # -.";
  }
  return null;
}

export function validateEmailField(email: string, label = "Email address"): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return `${label} is required.`;
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return `Please enter a valid ${label.toLowerCase()} (e.g. name@example.com).`;
  }
  return null;
}

export function validatePasswordField(password: string, isSignup = false): string | null {
  if (!password) {
    return "Password is required.";
  }
  if (password.length < 6) {
    return "Password must be at least 6 characters long.";
  }
  if (isSignup && password.length > 128) {
    return "Password must be 128 characters or fewer.";
  }
  return null;
}

export function validateOptionalUrlField(url: string, label = "URL"): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/storage/") || trimmed.startsWith("blob:")) {
    return null;
  }
  const parsed = z.url().safeParse(trimmed);
  if (!parsed.success || (!trimmed.startsWith("https://") && !trimmed.startsWith("http://"))) {
    return `${label} must be a valid http:// or https:// address.`;
  }
  return null;
}
