import { z } from "zod";

import { normalisePhone } from "../phone.ts";

/**
 * "Contact us" form (shared by the page and the API; dependency-free apart
 * from zod so `node --test` can load it).
 */
export const CONTACT_LIMITS = { name: 80, email: 160, note: 2000 } as const;

/** Error keys are Turkish messages (translated on the client). */
export const contactSchema = z.object({
  fullName: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(2, "Adınızı ve soyadınızı yazın.").max(CONTACT_LIMITS.name)),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(CONTACT_LIMITS.email)
    .pipe(z.email("Geçerli bir e-posta adresi yazın.")),
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
    .trim()
    .max(CONTACT_LIMITS.note)
    .nullish()
    .transform((v) => (v ? v : null)),
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

/** Bots fill the hidden field or submit within a second or two. */
export function looksAutomated(input: { website?: string; shownAt?: number }, now = Date.now()): boolean {
  if (input.website && input.website.trim()) return true;
  if (typeof input.shownAt === "number" && now - input.shownAt < 2500) return true;
  return false;
}
