import { z } from "zod";

// Relative ".ts" import: this file is also loaded directly by `node --test`.
import { challengesSchema, scheduleSchema } from "./event-extras.ts";

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
  /** Hosts may see who hearted what (0003 migration). Only sent when changed. */
  heartsNamed: z.boolean(),
  schedule: scheduleSchema,
  challenges: challengesSchema,
});

export type EventSettingsInput = z.infer<typeof eventSettingsSchema>;

/**
 * PATCH body: any subset of the settings. Only the keys that are sent are
 * written, so two open dashboard tabs cannot overwrite each other's changes.
 */
export const eventSettingsPatchSchema = eventSettingsSchema
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined), "Güncellenecek en az bir alan gönderin.");

export type EventSettingsPatch = z.infer<typeof eventSettingsPatchSchema>;

/** Maps a settings patch to `events` column updates, skipping keys that were not sent. */
export function settingsPatchToColumns(patch: EventSettingsPatch): Record<string, unknown> {
  const columns: Record<keyof EventSettingsInput, string> = {
    title: "title",
    coupleNames: "couple_names",
    eventDate: "event_date",
    welcomeMessage: "welcome_message",
    themeColor: "theme_color",
    categories: "categories",
    uploadsEnabled: "uploads_enabled",
    requireApproval: "require_approval",
    galleryPublic: "gallery_public",
    faceSearchEnabled: "face_search_enabled",
    guestbookEnabled: "guestbook_enabled",
    heartsNamed: "hearts_named",
    schedule: "schedule",
    challenges: "challenges",
  };
  const update: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns) as Array<[keyof EventSettingsInput, string]>) {
    if (patch[key] !== undefined) update[column] = patch[key];
  }
  return update;
}

export const bulkMediaSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500).transform((list) => [...new Set(list)]),
  action: z.enum(["approve", "hide", "delete"]),
});

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
  /** Optional program schedule; omitted or empty = no schedule. */
  schedule: scheduleSchema.optional(),
  /** Optional photo challenges; omitted or empty = none. */
  challenges: challengesSchema.optional(),
  /** Optional co-hosts: usernames of existing Mira accounts (at most 5). */
  coHosts: z
    .array(z.string().trim().min(1).max(64))
    .max(5, "En fazla 5 ortak yönetici")
    .optional()
    .transform((list) => (list ? [...new Set(list.map((u) => u.toLocaleLowerCase("tr-TR")))] : undefined)),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/, "Sadece küçük harf, rakam ve tire (3-64 karakter)")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});
