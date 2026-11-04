import { z } from "zod";

import { MEDIA_CATEGORIES } from "@/types/database";

/** Strips control characters and path separators from a user-supplied file name. */
function sanitiseFileName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim();
}

export const presignUploadRequestSchema = z.object({
  albumId: z.uuid(),
  fileName: z.string().min(1).max(255).transform(sanitiseFileName).pipe(z.string().min(1)),
  fileType: z.string().min(3).max(255),
  fileSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  magicBytesHex: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{8,128}$/, "magicBytesHex must be 8–128 hex characters.")
    .optional(),
});

export const completeUploadRequestSchema = z.object({
  albumId: z.uuid(),
  fileKey: z.string().min(1).max(1024),
  guestName: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => (v ? v : null)),
  guestSessionId: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/, "guestSessionId may only contain letters, digits, '_' and '-'.")
    .nullish()
    .transform((v) => (v ? v : null)),
  category: z.enum(MEDIA_CATEGORIES).default("general"),
  phash: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{16}$/, "phash must be 16 hex characters.")
    .nullish()
    .transform((v) => v ?? null),
});

export type PresignUploadRequestInput = z.infer<typeof presignUploadRequestSchema>;
export type CompleteUploadRequestInput = z.infer<typeof completeUploadRequestSchema>;
