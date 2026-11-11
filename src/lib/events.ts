import "server-only";

import { driveFolderUrl } from "@/lib/drive";
import { readChallenges, readSchedule, withKnownCategories } from "@/lib/event-extras";
import { getAdminDb } from "@/lib/supabase/server";
import type {
  EventRow,
  GuestbookMessageDto,
  GuestbookMessageRow,
  HostEventDto,
  MediaDto,
  MediaItemRow,
  PublicEventDto,
} from "@/types/domain";

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;

export const MEDIA_COLUMNS =
  "id, event_id, drive_file_id, kind, mime_type, size_bytes, original_name, guest_name, guest_session_id, note, category, challenge_id, is_guestbook, status, width, height, face_count, published_at, created_at";

export function toPublicEventDto(event: EventRow): PublicEventDto {
  return {
    slug: event.slug,
    title: event.title,
    coupleNames: event.couple_names,
    eventDate: event.event_date,
    welcomeMessage: event.welcome_message,
    themeColor: event.theme_color,
    categories: event.categories ?? [],
    uploadsEnabled: event.uploads_enabled,
    requireApproval: event.require_approval,
    galleryPublic: event.gallery_public,
    faceSearchEnabled: event.face_search_enabled,
    guestbookEnabled: event.guestbook_enabled,
    schedule: withKnownCategories(readSchedule(event.schedule), event.categories ?? []),
    challenges: readChallenges(event.challenges),
  };
}

export function toHostEventDto(event: EventRow): HostEventDto {
  return {
    ...toPublicEventDto(event),
    id: event.id,
    driveFolderUrl: driveFolderUrl(event.drive_folder_id),
    driveAccount: event.drive_account,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}

export function toMediaDto(row: MediaItemRow, guestSessionId?: string | null): MediaDto {
  return {
    id: row.id,
    fileId: row.drive_file_id,
    kind: row.kind,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    originalName: row.original_name,
    guestName: row.guest_name,
    note: row.note,
    category: row.category,
    challengeId: row.challenge_id ?? null,
    isGuestbook: row.is_guestbook,
    status: row.status,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    ...(guestSessionId !== undefined
      ? { isMine: Boolean(guestSessionId && row.guest_session_id === guestSessionId) }
      : {}),
  };
}

export function toGuestbookDto(row: GuestbookMessageRow): GuestbookMessageDto {
  return {
    id: row.id,
    guestName: row.guest_name,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

/**
 * PostgREST returns at most 1000 rows per request (Supabase default), so
 * large exports/statistics page through with `.range()`.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  pageSize = 1000,
  hardLimit = 50_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < hardLimit; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

/** Loads an event by its public slug (used by guest endpoints). */
export async function findEventBySlug(slug: string): Promise<EventRow | null> {
  const normalised = slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(normalised)) return null;
  const { data, error } = await getAdminDb().from("events").select("*").eq("slug", normalised).maybeSingle();
  if (error) throw new Error(`[events] lookup failed: ${error.message}`);
  return (data as EventRow | null) ?? null;
}

// Pure helpers live in dependency-free modules so they can be unit-tested;
// re-exported here to keep existing imports working.
export { encodeMediaCursor, mediaCursorFilter, parseCursor, parseMediaCursor, type MediaCursor } from "@/lib/pagination";
export { slugify } from "@/lib/slug";
