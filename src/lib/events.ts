import "server-only";

import { DriveService } from "@/lib/drive";
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
  "id, event_id, drive_file_id, kind, mime_type, size_bytes, original_name, guest_name, guest_session_id, note, category, is_guestbook, status, width, height, face_count, published_at, created_at";

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
  };
}

export function toHostEventDto(event: EventRow): HostEventDto {
  return {
    ...toPublicEventDto(event),
    id: event.id,
    driveFolderUrl: DriveService.folderUrl(event.drive_folder_id),
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

/** Cursor = ISO timestamp of the last item; keyset pagination on created_at. */
export function parseCursor(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Keyset cursor for `created_at desc, id desc` pagination. */
export interface MediaCursor {
  createdAt: string;
  id: string | null;
}

const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const CURSOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_SEPARATOR = "~";

/** Encodes the last row of a page as `<created_at>~<id>` (full microsecond precision). */
export function encodeMediaCursor(row: Pick<MediaItemRow, "created_at" | "id">): string {
  return `${row.created_at}${CURSOR_SEPARATOR}${row.id}`;
}

/**
 * Parses a media cursor. Accepts the composite `<created_at>~<id>` form and,
 * for backwards compatibility, a bare timestamp (older clients).
 */
export function parseMediaCursor(value: string | null): MediaCursor | null {
  if (!value) return null;
  const [rawTs, rawId] = value.split(CURSOR_SEPARATOR);
  const createdAt = rawTs?.trim() ?? "";
  if (CURSOR_TIMESTAMP_PATTERN.test(createdAt)) {
    const id = rawId?.trim() ?? "";
    return { createdAt, id: CURSOR_ID_PATTERN.test(id) ? id.toLowerCase() : null };
  }
  const legacy = parseCursor(createdAt);
  return legacy ? { createdAt: legacy, id: null } : null;
}

/**
 * PostgREST `or` filter selecting rows strictly after the cursor in
 * `created_at desc, id desc` order, so rows sharing a timestamp are not skipped.
 */
export function mediaCursorFilter(cursor: MediaCursor & { id: string }): string {
  const ts = `"${cursor.createdAt}"`;
  return `created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${cursor.id})`;
}

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
