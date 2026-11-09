import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import type { DriveClient } from "@/lib/drive";
import { driveForEvent } from "@/lib/drive-accounts";
import { MEDIA_COLUMNS, toMediaDto } from "@/lib/events";
import { readGuestSession } from "@/lib/guest-session";
import { detectMimeFromMagicBytes } from "@/lib/media-config";
import { rateLimit } from "@/lib/rate-limit";
import { verifyToken } from "@/lib/signing";
import { getAdminDb } from "@/lib/supabase/server";
import type { UploadTokenPayload } from "@/lib/upload-token";
import type { EventRow, MediaDto, MediaItemRow } from "@/types/domain";

export const runtime = "nodejs";

const descriptorSchema = z
  .array(z.number().min(-2).max(2))
  .length(128);

const schema = z.object({
  uploadToken: z.string().min(20).max(4096),
  fileId: z.string().regex(/^[A-Za-z0-9_-]{10,128}$/),
  guestName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v ? v : null)),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
  category: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : null)),
  faces: z.array(descriptorSchema).max(30).default([]),
  width: z.number().int().positive().max(100_000).optional(),
  height: z.number().int().positive().max(100_000).optional(),
});

const MAKE_PUBLIC_ATTEMPTS = 2;

async function makePublicWithRetry(drive: DriveClient, fileId: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAKE_PUBLIC_ATTEMPTS; attempt += 1) {
    try {
      await drive.makePublic(fileId);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < MAKE_PUBLIC_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Dosya paylaşıma açılamadı.");
}

/**
 * POST /api/media/confirm
 *
 * Step C of the upload. After the browser's PUT to Drive finished, verifies
 * that the file really is the one this guest was authorised to upload
 * (signed token + Drive appProperties + parent folder + size + magic bytes),
 * shares it as "anyone with the link: reader", and stores its metadata and
 * face descriptors.
 */
export async function POST(request: NextRequest) {
  try {
    const guest = readGuestSession(request);
    if (!guest) return jsonError(401, "NO_GUEST_SESSION", "Oturum bulunamadı. Sayfayı yenileyip tekrar deneyin.");

    const limited = await rateLimit(request, "media-confirm", 120, 60, guest.sessionId);
    if (limited) return limited;

    const body = await parseJsonBody(request, schema, 192 * 1024);
    if (!body.ok) return body.response;
    const { uploadToken, fileId, guestName, note, category, faces, width, height } = body.data;

    const token = verifyToken<UploadTokenPayload>("upload", uploadToken);
    if (!token || token.x < Date.now()) {
      return jsonError(403, "INVALID_UPLOAD_TOKEN", "Yükleme izni geçersiz veya süresi dolmuş.");
    }
    if (token.g !== guest.sessionId) {
      return jsonError(403, "INVALID_UPLOAD_TOKEN", "Bu yükleme başka bir oturuma ait.");
    }

    const db = getAdminDb();

    // Idempotency: a retried confirm returns the existing row.
    const existing = await db.from("media_items").select(MEDIA_COLUMNS).eq("drive_file_id", fileId).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      const row = existing.data as MediaItemRow;
      if (row.guest_session_id !== guest.sessionId) return jsonError(403, "FORBIDDEN", "Bu dosya size ait değil.");
      return jsonOk<{ media: MediaDto }>({ media: toMediaDto(row, guest.sessionId) });
    }

    const eventRes = await db.from("events").select("*").eq("id", token.e).maybeSingle();
    if (eventRes.error) throw new Error(eventRes.error.message);
    const event = eventRes.data as EventRow | null;
    if (!event) return jsonError(404, "EVENT_NOT_FOUND", "Etkinlik bulunamadı.");

    const drive = await driveForEvent(event);
    const file = await drive.getFile(fileId);
    const authentic =
      file !== null &&
      !file.trashed &&
      (file.appProperties?.eqrUploadId ?? file.appProperties?.wqrUploadId) === token.u &&
      (file.appProperties?.eqrEventId ?? file.appProperties?.wqrEventId) === token.e &&
      (file.parents ?? []).includes(token.f);
    if (!file || !authentic) {
      return jsonError(422, "UPLOAD_NOT_VERIFIED", "Yüklenen dosya doğrulanamadı.");
    }
    const actualSize = Number(file.size ?? "0");
    if (actualSize !== token.s) {
      await drive.trash(fileId);
      return jsonError(422, "UPLOAD_INCOMPLETE", "Dosya eksik yüklendi. Lütfen tekrar deneyin.");
    }

    const head = await drive.readHeadBytes(fileId, 64);
    const detected = detectMimeFromMagicBytes(head, token.m);
    if (!detected || detected.mediaType !== token.k) {
      await drive.trash(fileId);
      return jsonError(415, "UNSUPPORTED_MEDIA_TYPE", "Dosya içeriği bir fotoğraf, video veya ses kaydı değil.");
    }

    const safeCategory = category && event.categories.includes(category) ? category : null;
    const status = event.require_approval ? "pending" : "approved";

    const facesToStore = token.k === "photo" ? faces : [];
    const insert = await db
      .from("media_items")
      .insert({
        event_id: event.id,
        drive_file_id: fileId,
        kind: token.k,
        mime_type: detected.mimeType,
        size_bytes: actualSize,
        original_name: token.n,
        guest_name: guestName,
        guest_session_id: guest.sessionId,
        note,
        category: safeCategory,
        is_guestbook: token.b,
        status,
        width: width ?? file.imageMediaMetadata?.width ?? file.videoMediaMetadata?.width ?? null,
        height: height ?? file.imageMediaMetadata?.height ?? file.videoMediaMetadata?.height ?? null,
        face_count: facesToStore.length,
        published_at: status === "approved" ? new Date().toISOString() : null,
      })
      .select(MEDIA_COLUMNS)
      .single();

    if (insert.error) {
      if (insert.error.code === "23505") {
        const raced = await db.from("media_items").select(MEDIA_COLUMNS).eq("drive_file_id", fileId).single();
        if (!raced.error && raced.data) {
          return jsonOk<{ media: MediaDto }>({ media: toMediaDto(raced.data as MediaItemRow, guest.sessionId) });
        }
      }
      throw new Error(insert.error.message);
    }
    let row = insert.data as MediaItemRow;

    // Share only after the row exists. If sharing fails, roll the row back so a
    // retried confirm does not treat a still-private file as approved.
    if (status === "approved") {
      try {
        await makePublicWithRetry(drive, fileId);
      } catch (shareError) {
        const rollback = await db.from("media_items").delete().eq("id", row.id);
        if (rollback.error) {
          console.error("[media:confirm] rollback after makePublic failure failed", rollback.error.message);
        }
        throw shareError;
      }
    }

    if (facesToStore.length > 0) {
      const faceInsert = await db.from("face_descriptors").insert(
        facesToStore.map((descriptor) => ({
          event_id: event.id,
          media_id: row.id,
          descriptor: `[${descriptor.join(",")}]`,
        })),
      );
      if (faceInsert.error) {
        console.error("[media:confirm] face descriptor insert failed", faceInsert.error.message);
        const fix = await db
          .from("media_items")
          .update({ face_count: 0 })
          .eq("id", row.id)
          .select(MEDIA_COLUMNS)
          .single();
        if (fix.error) {
          console.error("[media:confirm] face_count reset failed", fix.error.message);
        } else if (fix.data) {
          row = fix.data as MediaItemRow;
        }
      }
    }

    return jsonOk<{ media: MediaDto }>({ media: toMediaDto(row, guest.sessionId) }, 201);
  } catch (error) {
    return handleRouteError("media:confirm", error);
  }
}
