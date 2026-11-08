import "server-only";

import type { NextRequest } from "next/server";

import { readGuestSession } from "@/lib/guest-session";
import { getHostUser } from "@/lib/host-auth";
import { getAdminDb } from "@/lib/supabase/server";
import type { EventRow, MediaItemRow } from "@/types/domain";

/** The owning event fields needed to authorise access and pick its Drive. */
export type MediaEventRef = Pick<EventRow, "owner_id" | "drive_account">;

export interface AccessibleMedia {
  event: MediaEventRef;
  media: MediaItemRow;
  isPublic: boolean;
}

/**
 * Authorises access to a Drive file through our proxy routes. A file is
 * reachable only if it is a known media item AND one of:
 *  - it is approved (already "anyone with the link" on Drive),
 *  - the requester uploaded it (signed guest cookie),
 *  - the requester owns the event (Supabase session).
 * Arbitrary Drive IDs are never proxied.
 */
export async function authorizeMediaAccess(request: NextRequest, fileId: string): Promise<AccessibleMedia | null> {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(fileId)) return null;
  const { data, error } = await getAdminDb()
    .from("media_items")
    .select("*, events!inner(owner_id, drive_account)")
    .eq("drive_file_id", fileId)
    .maybeSingle();
  if (error) throw new Error(`[media-access] ${error.message}`);
  if (!data) return null;

  const row = data as MediaItemRow & { events: MediaEventRef };
  const { events: event, ...media } = row;
  if (media.status === "approved") return { media, event, isPublic: true };

  const guest = readGuestSession(request);
  if (guest && media.guest_session_id === guest.sessionId) return { media, event, isPublic: false };

  const host = await getHostUser().catch(() => null);
  if (host && host.id === event.owner_id) return { media, event, isPublic: false };
  return null;
}
