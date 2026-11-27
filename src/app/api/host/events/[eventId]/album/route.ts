import type { NextRequest } from "next/server";

import { handleRouteError, jsonOk } from "@/lib/api/http";
import { driveForNewEvent } from "@/lib/drive-accounts";
import { albumOpen, toHostEventDto } from "@/lib/events";
import { requireEventAccess } from "@/lib/host-auth";
import { planForUser, proRequired } from "@/lib/host-plan";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";
import type { EventRow, HostEventDto } from "@/types/domain";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ eventId: string }> };

/**
 * POST /api/host/events/:eventId/album — opens the photo album of an
 * invitation-only event: creates its Drive folders (in the owner's connected
 * Drive, or the platform Drive) and turns uploads on. Idempotent. Pro.
 */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;
    const locked = await proRequired(owned.event.owner_id, "editSettings");
    if (locked) return locked;
    const limited = await rateLimit(request, "open-album", 5, 300, owned.host.id);
    if (limited) return limited;

    let event = owned.event;
    if (!albumOpen(event)) {
      const { drive, account } = await driveForNewEvent(event.owner_id);
      const folders = await drive.createEventFolders(event.title, event.slug);
      const { data, error } = await getAdminDb()
        .from("events")
        .update({
          drive_folder_id: folders.rootId,
          drive_photos_folder_id: folders.photosId,
          drive_videos_folder_id: folders.videosId,
          drive_voice_folder_id: folders.voiceId,
          drive_account: account,
          uploads_enabled: true,
        })
        .eq("id", event.id)
        .eq("drive_folder_id", "")
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) event = data as EventRow;
      else {
        // Opened concurrently: keep the winner's folders, drop ours.
        await drive.trash(folders.rootId).catch(() => undefined);
        const { data: fresh } = await getAdminDb().from("events").select("*").eq("id", event.id).single();
        event = fresh as EventRow;
      }
    }
    return jsonOk<{ event: HostEventDto }>({ event: toHostEventDto(event, owned.role, await planForUser(event.owner_id)) });
  } catch (error) {
    return handleRouteError("host:event:album", error);
  }
}
