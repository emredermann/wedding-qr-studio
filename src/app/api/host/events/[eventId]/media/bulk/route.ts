import type { NextRequest } from "next/server";

import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { mapSettledLimit } from "@/lib/concurrency";
import { trashBestEffort } from "@/lib/drive";
import { driveForEvent } from "@/lib/drive-accounts";
import { toMediaDto } from "@/lib/events";
import { requireEventAccess } from "@/lib/host-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";
import { bulkMediaSchema } from "@/lib/validation";
import type { BulkMediaResponse, MediaItemRow, MediaStatus } from "@/types/domain";
import { mediaColumns } from "@/lib/schema-features";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Parallel Drive permission calls; stays well under Drive's per-user rate limit. */
const DRIVE_CONCURRENCY = 6;

/**
 * POST /api/host/events/:eventId/media/bulk { ids, action: approve | hide | delete }
 *
 * One request instead of one per item. Drive permission changes run with
 * bounded concurrency; the database is updated once for every item whose
 * Drive step succeeded, so a partial Drive failure never leaves the DB and
 * Drive out of sync. Deletes remove rows first, then trash files best-effort.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const columns = await mediaColumns();
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;
    const limited = await rateLimit(request, "media-bulk", 30, 60, owned.host.id);
    if (limited) return limited;

    const body = await parseJsonBody(request, bulkMediaSchema, 64 * 1024);
    if (!body.ok) return body.response;
    const { ids, action } = body.data;

    const db = getAdminDb();
    const found = await db.from("media_items").select(columns).eq("event_id", owned.event.id).in("id", ids);
    if (found.error) throw new Error(found.error.message);
    const rows = (found.data ?? []) as MediaItemRow[];
    const foundIds = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !foundIds.has(id));

    if (action === "delete") {
      if (rows.length > 0) {
        const del = await db.from("media_items").delete().eq("event_id", owned.event.id).in("id", [...foundIds]);
        if (del.error) throw new Error(del.error.message);
        const drive = await driveForEvent(owned.event).catch(() => null);
        if (drive) {
          await mapSettledLimit(rows, DRIVE_CONCURRENCY, (row) => trashBestEffort(drive, row.drive_file_id, "host:media:bulk-delete"));
        }
      }
      return jsonOk<BulkMediaResponse>({ updated: [], deletedIds: [...foundIds], failedIds: missing });
    }

    const target: MediaStatus = action === "approve" ? "approved" : "hidden";
    const toChange = rows.filter((row) => row.status !== target);
    const drive = toChange.length > 0 ? await driveForEvent(owned.event) : null;
    const results = await mapSettledLimit(toChange, DRIVE_CONCURRENCY, async (row) => {
      if (!drive) return row.id;
      if (target === "approved") await drive.makePublic(row.drive_file_id);
      else if (row.status === "approved") await drive.makePrivate(row.drive_file_id);
      return row.id;
    });

    const succeeded: string[] = [];
    const failed: string[] = [...missing];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") succeeded.push(result.value);
      else {
        failed.push(toChange[index].id);
        console.error("[host:media:bulk] Drive permission change failed", { id: toChange[index].id, reason: result.reason });
      }
    });

    let updated: MediaItemRow[] = [];
    if (succeeded.length > 0) {
      const update = await db
        .from("media_items")
        .update(target === "approved" ? { status: target, published_at: new Date().toISOString() } : { status: target })
        .eq("event_id", owned.event.id)
        .in("id", succeeded)
        .select(columns);
      if (update.error) throw new Error(update.error.message);
      updated = (update.data ?? []) as MediaItemRow[];
    }

    return jsonOk<BulkMediaResponse>({ updated: updated.map((row) => toMediaDto(row)), deletedIds: [], failedIds: failed });
  } catch (error) {
    return handleRouteError("host:media:bulk", error);
  }
}
