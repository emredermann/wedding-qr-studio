import { z } from "zod";

export const eventSettingsSchema = z.object({
  title: z.string().trim().min(2, "En az 2 karakter").max(120),
  coupleNames: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((v) => (v ? v : null)),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG olmalı")
    .nullish()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  welcomeMessage: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Geçerli bir renk seçin"),
  categories: z
    .array(z.string().trim().min(1).max(40))
    .max(30)
    .transform((list) => [...new Set(list)]),
  uploadsEnabled: z.boolean(),
  requireApproval: z.boolean(),
  galleryPublic: z.boolean(),
  faceSearchEnabled: z.boolean(),
  guestbookEnabled: z.boolean(),
});

export type EventSettingsInput = z.infer<typeof eventSettingsSchema>;

export const createEventSchema = z.object({
  title: z.string().trim().min(2, "En az 2 karakter").max(120),
  coupleNames: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : null)),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/, "Sadece küçük harf, rakam ve tire (3-64 karakter)")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});
