import { z } from "zod";

import { normalisePhone } from "../phone.ts";

/**
 * "Contact us" form (shared by the page and the API; dependency-free apart
 * from zod so `node --test` can load it).
 */
export const CONTACT_LIMITS = { name: 80, email: 160, note: 2000 } as const;

/**
 * Invisible characters that can hide or reorder text (bidi overrides,
 * zero-width marks) and control characters other than newline / tab.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

/** Letters (any language) with spaces, apostrophes, dots and hyphens between them. */
const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '’.-]+[\p{L}\p{M}]+)*\.?$/u;

/** Error keys are Turkish messages (translated on the client). */
export const contactSchema = z.object({
  fullName: z
    .string()
    .max(200, "Ad soyad en fazla 80 karakter olabilir.")
    .transform((v) => v.replace(INVISIBLE, "").replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, "Adınızı ve soyadınızı yazın.")
        .max(CONTACT_LIMITS.name, "Ad soyad en fazla 80 karakter olabilir.")
        .regex(NAME_PATTERN, "Ad soyad yalnızca harf içermeli.")
        .refine((v) => v.split(" ").filter((w) => /\p{L}{2,}/u.test(w)).length >= 2, "Adınızı ve soyadınızı birlikte yazın."),
    ),
  email: z
    .string()
    .max(300, "E-posta adresi çok uzun.")
    .transform((v) => v.replace(INVISIBLE, "").trim().toLowerCase())
    .pipe(
      z
        .string()
        .min(1, "E-posta adresinizi yazın.")
        .max(CONTACT_LIMITS.email, "E-posta adresi çok uzun.")
        .pipe(z.email("Geçerli bir e-posta adresi yazın.")),
    ),
  /** Optional; any common format, stored as digits with country code. */
  phone: z
    .string()
    .max(40)
    .nullish()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return null;
      const phone = normalisePhone(v);
      if (!phone) ctx.addIssue({ code: "custom", message: "Geçerli bir telefon numarası yazın." });
      return phone;
    }),
  note: z
    .string()
    .max(CONTACT_LIMITS.note * 2, "Not en fazla 2000 karakter olabilir.")
    .nullish()
    .transform((v) => (v ? v.replace(/\r\n?/g, "\n").replace(INVISIBLE, "").trim() : ""))
    .pipe(
      z
        .string()
        .max(CONTACT_LIMITS.note, "Not en fazla 2000 karakter olabilir.")
        .refine((v) => !CONTROL.test(v), "Not geçersiz karakterler içeriyor.")
        .transform((v) => (v ? v : null)),
    ),
  consent: z.literal(true, { message: "Devam etmek için onay kutusunu işaretleyin." }),
  /** Which page the form was on (e.g. "home", "davetiye"). */
  source: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .nullish()
    .catch(null),
  /** Honeypot: people never fill this hidden field. */
  website: z.string().max(200).optional(),
  /** When the form was shown (ms since epoch); instant submits are bots. */
  shownAt: z.number().int().optional(),
});

export type ContactInput = z.input<typeof contactSchema>;

export type ContactField = "fullName" | "email" | "phone" | "note" | "consent";
const FIELDS: readonly ContactField[] = ["fullName", "email", "phone", "note", "consent"];

/** First problem per field (Turkish message keys), for the form; empty when valid. */
export function contactFieldErrors(input: unknown): Partial<Record<ContactField, string>> {
  const res = contactSchema.safeParse(input);
  if (res.success) return {};
  const out: Partial<Record<ContactField, string>> = {};
  for (const issue of res.error.issues) {
    const key = issue.path[0] as ContactField;
    if (FIELDS.includes(key) && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Bots fill the hidden field or submit within a second or two. */
export function looksAutomated(input: { website?: string; shownAt?: number }, now = Date.now()): boolean {
  if (input.website && input.website.trim()) return true;
  if (typeof input.shownAt === "number" && now - input.shownAt < 2500) return true;
  return false;
}
