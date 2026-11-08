import type { NextRequest } from "next/server";

import { handleRouteError, jsonOk } from "@/lib/api/http";
import { fetchAllRows } from "@/lib/events";
import { requireOwnedEvent } from "@/lib/host-auth";
import { getAdminDb } from "@/lib/supabase/server";
import type { ExportItem, MediaItemRow } from "@/types/domain";

export const runtime = "nodejs";

/** GET /api/host/events/:eventId/export — manifest for the in-browser ZIP download. */
export async function GET(_request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params;
    const owned = await requireOwnedEvent(eventId);
    if (!owned.ok) return owned.response;

    type Row = Pick<MediaItemRow, "drive_file_id" | "original_name" | "size_bytes" | "kind" | "is_guestbook" | "category" | "created_at">;
    const rows = await fetchAllRows<Row>((from, to) =>
      getAdminDb()
        .from("media_items")
        .select("drive_file_id, original_name, size_bytes, kind, is_guestbook, category, created_at")
        .eq("event_id", owned.event.id)
        .neq("status", "hidden")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    const items: ExportItem[] = rows.map((row) => ({
      fileId: row.drive_file_id,
      name: row.original_name,
      sizeBytes: Number(row.size_bytes),
      folder: row.is_guestbook
        ? "Ani_Defteri"
        : row.kind === "photo"
          ? `Fotograflar${row.category ? `/${row.category}` : ""}`
          : row.kind === "video"
            ? `Videolar${row.category ? `/${row.category}` : ""}`
            : "Ses_Kayitlari",
      createdAt: row.created_at,
    }));
    return jsonOk({ items });
  } catch (error) {
    return handleRouteError("host:export", error);
  }
}
