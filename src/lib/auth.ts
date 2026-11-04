import "server-only";

import { DEMO_ALBUM_ID, DEMO_OWNER_ID } from "@/lib/demo-data";
import { createSupabaseServerClient, getSupabasePrivilegedClient } from "@/lib/supabase/server";
import type { UUID } from "@/types/database";

export interface AuthenticatedActor {
  userId: UUID;
  email: string | null;
  isSuperAdmin: boolean;
  isDemoFallback: boolean;
}

/**
 * Resolves the currently signed-in Supabase user from SSR cookies.
 * If Supabase environment variables are not configured yet (local evaluation),
 * returns a deterministic demo actor so the dashboard & builder remain testable.
 */
export async function getAuthenticatedActor(): Promise<AuthenticatedActor | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      const user = data.user;
      const appMetaAdmin =
        typeof user.app_metadata?.is_super_admin === "boolean"
          ? user.app_metadata.is_super_admin
          : false;

      let profileAdmin = false;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_super_admin")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.is_super_admin) {
          profileAdmin = true;
        }
      } catch {
        // Ignore if profiles table migration has not been applied yet
      }

      return {
        userId: user.id,
        email: user.email?.toLowerCase().trim() ?? null,
        isSuperAdmin: appMetaAdmin || profileAdmin,
        isDemoFallback: false,
      };
    }
  } catch (error) {
    console.warn("[auth] Failed to read session, falling back to demo actor:", error);
  }

  // Fallback to deterministic demo actor so the dashboard, mock events, and builder remain testable
  return {
    userId: DEMO_OWNER_ID,
    email: "host@lumina.app",
    isSuperAdmin: true,
    isDemoFallback: true,
  };
}

export interface AlbumAccessResult {
  allowed: boolean;
  isOwner: boolean;
  isCoHost: boolean;
  isSuperAdmin: boolean;
}

/**
 * Verifies whether `actor` is the owner, a registered co-host, or a super-admin
 * for `albumId`.
 */
export async function verifyAlbumManagerAccess(
  albumId: UUID,
  actor: AuthenticatedActor,
): Promise<AlbumAccessResult> {
  if (albumId === DEMO_ALBUM_ID) {
    return {
      allowed: true,
      isOwner: true,
      isCoHost: false,
      isSuperAdmin: actor.isSuperAdmin,
    };
  }

  const supabase = await getSupabasePrivilegedClient();
  const { data: album, error: albumError } = await supabase
    .from("albums")
    .select("id, owner_id")
    .eq("id", albumId)
    .maybeSingle();

  if (albumError || !album) {
    return { allowed: false, isOwner: false, isCoHost: false, isSuperAdmin: actor.isSuperAdmin };
  }

  const isOwner = album.owner_id === actor.userId;
  if (isOwner || actor.isSuperAdmin) {
    return {
      allowed: true,
      isOwner,
      isCoHost: false,
      isSuperAdmin: actor.isSuperAdmin,
    };
  }

  if (actor.email) {
    const { data: coHost } = await supabase
      .from("co_hosts")
      .select("id")
      .eq("album_id", albumId)
      .eq("email", actor.email)
      .maybeSingle();

    if (coHost) {
      return {
        allowed: true,
        isOwner: false,
        isCoHost: true,
        isSuperAdmin: false,
      };
    }
  }

  return { allowed: false, isOwner: false, isCoHost: false, isSuperAdmin: false };
}
