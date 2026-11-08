import "server-only";

import type { NextRequest } from "next/server";

import { readGuestSession } from "@/lib/guest-session";
import { getHostUser } from "@/lib/host-auth";
import { getAdminDb } from "@/lib/supabase/server";
import type { MediaItemRow } from "@/types/domain";

export interface AccessibleMedia {
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
    .select("*, events!inner(owner_id)")
    .eq("drive_file_id", fileId)
    .maybeSingle();
  if (error) throw new Error(`[media-access] ${error.message}`);
  if (!data) return null;

  const row = data as MediaItemRow & { events: { owner_id: string } };
  const { events, ...media } = row;
  if (media.status === "approved") return { media, isPublic: true };

  const guest = readGuestSession(request);
  if (guest && media.guest_session_id === guest.sessionId) return { media, isPublic: false };

  const host = await getHostUser().catch(() => null);
  if (host && host.id === events.owner_id) return { media, isPublic: false };
  return null;
}
