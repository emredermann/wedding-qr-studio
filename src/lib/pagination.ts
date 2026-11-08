import type { MediaItemRow } from "@/types/domain";

/** Cursor = ISO timestamp of the last item; keyset pagination on created_at. */
export function parseCursor(value: string | null): string | null {
  // Only ISO 8601 timestamps: V8's lenient Date.parse would otherwise turn
  // junk such as "x,id.gt.0" into a real date and silently accept it.
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
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
