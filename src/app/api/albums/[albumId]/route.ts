import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedActor, verifyAlbumManagerAccess } from "@/lib/auth";
import { DEMO_ALBUM_ID, DEMO_FULL_ALBUM, DEMO_MEDIA_ITEMS } from "@/lib/demo-data";
import { deleteR2Object } from "@/lib/r2";
import { getSupabasePrivilegedClient } from "@/lib/supabase/server";
import {
  type Album,
  type AlbumUpdate,
  type CoHost,
  type GuestRegistration,
  type Media,
  MEDIA_CATEGORIES,
  PRIVACY_MODES,
} from "@/types/database";
import { normalizeFlowConfig, normalizeThemeConfig } from "@/types/flow";

const patchAlbumSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/)
    .optional(),
  eventDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  privacyMode: z.enum(PRIVACY_MODES).optional(),
  revealAt: z.string().nullable().optional(),
  themeConfig: z.unknown().optional(),
  flowConfig: z.unknown().optional(),
  addCoHostEmail: z.email().trim().toLowerCase().optional(),
  removeCoHostId: z.uuid().optional(),
  hideMediaIds: z.array(z.uuid()).max(200).optional(),
  unhideMediaIds: z.array(z.uuid()).max(200).optional(),
  recategorizeMedia: z
    .object({
      mediaIds: z.array(z.uuid()).min(1).max(200),
      category: z.enum(MEDIA_CATEGORIES),
    })
    .optional(),
});

const deleteMediaBatchSchema = z.object({
  mediaIds: z.array(z.uuid()).min(1).max(200),
});

function hydrateAlbumRow(row: Album): Album {
  return {
    ...row,
    theme_config: normalizeThemeConfig(row.theme_config),
    flow_config: normalizeFlowConfig(row.flow_config),
  };
}

/**
 * GET /api/albums/[albumId]
 *
 * Returns the full album, all media items (including hidden items for moderation),
 * co-hosts, and guest registrations.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> },
) {
  const { albumId } = await params;

  if (albumId === DEMO_ALBUM_ID) {
    return jsonOk({
      album: DEMO_FULL_ALBUM,
      media: DEMO_MEDIA_ITEMS,
      coHosts: [
        {
          id: "00000000-0000-4000-8000-000000000301",
          album_id: DEMO_ALBUM_ID,
          email: "weddingplanner@villa-aurelia.it",
          created_at: "2026-05-03T09:00:00.000Z",
        },
      ] satisfies CoHost[],
      guestRegistrations: [] satisfies GuestRegistration[],
      isOwner: true,
    });
  }

  const actor = await getAuthenticatedActor();
  if (!actor) {
    return jsonError(401, "UNAUTHORIZED", "Please sign in to manage this album.");
  }

  const access = await verifyAlbumManagerAccess(albumId, actor);
  if (!access.allowed) {
    return jsonError(403, "FORBIDDEN", "You do not have access to this album.");
  }

  try {
    const supabase = await getSupabasePrivilegedClient();

    const [albumRes, mediaRes, coHostsRes, regsRes] = await Promise.all([
      supabase.from("albums").select("*").eq("id", albumId).single(),
      supabase
        .from("media")
        .select("*")
        .eq("album_id", albumId)
        .order("created_at", { ascending: false }),
      supabase
        .from("co_hosts")
        .select("*")
        .eq("album_id", albumId)
        .order("created_at", { ascending: true }),
      supabase
        .from("guest_registrations")
        .select("*")
        .eq("album_id", albumId)
        .order("created_at", { ascending: false }),
    ]);

    if (albumRes.error || !albumRes.data) {
      return jsonError(404, "ALBUM_NOT_FOUND", "Album not found.");
    }

    return jsonOk({
      album: hydrateAlbumRow(albumRes.data),
      media: (mediaRes.data ?? []) as Media[],
      coHosts: (coHostsRes.data ?? []) as CoHost[],
      guestRegistrations: (regsRes.data ?? []) as GuestRegistration[],
      isOwner: access.isOwner || access.isSuperAdmin,
    });
  } catch (error) {
    console.error("[album:detail] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Could not load album management data.");
  }
}

/**
 * PATCH /api/albums/[albumId]
 *
 * Updates album configuration, manages co-hosts, or moderates media items
 * (hide/unhide/recategorize).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> },
) {
  const { albumId } = await params;

  const parsed = await parseJsonBody(request, patchAlbumSchema, 64 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (albumId === DEMO_ALBUM_ID) {
    const updatedDemo: Album = {
      ...DEMO_FULL_ALBUM,
      title: body.title ?? DEMO_FULL_ALBUM.title,
      slug: body.slug ?? DEMO_FULL_ALBUM.slug,
      event_date: body.eventDate !== undefined ? body.eventDate : DEMO_FULL_ALBUM.event_date,
      privacy_mode: body.privacyMode ?? DEMO_FULL_ALBUM.privacy_mode,
      reveal_at: body.revealAt !== undefined ? body.revealAt : DEMO_FULL_ALBUM.reveal_at,
      theme_config:
        body.themeConfig !== undefined
          ? normalizeThemeConfig(body.themeConfig)
          : DEMO_FULL_ALBUM.theme_config,
      flow_config:
        body.flowConfig !== undefined
          ? normalizeFlowConfig(body.flowConfig)
          : DEMO_FULL_ALBUM.flow_config,
    };
    return jsonOk({ album: updatedDemo, updated: true });
  }

  const actor = await getAuthenticatedActor();
  if (!actor) {
    return jsonError(401, "UNAUTHORIZED", "Please sign in.");
  }

  const access = await verifyAlbumManagerAccess(albumId, actor);
  if (!access.allowed) {
    return jsonError(403, "FORBIDDEN", "You do not have permission to modify this album.");
  }

  try {
    const supabase = await getSupabasePrivilegedClient();

    // 1. Co-host management (owners / super-admins only)
    if (body.addCoHostEmail) {
      if (!access.isOwner && !access.isSuperAdmin) {
        return jsonError(403, "FORBIDDEN", "Only the album owner can invite co-hosts.");
      }
      const { error: coHostErr } = await supabase.from("co_hosts").upsert(
        {
          album_id: albumId,
          email: body.addCoHostEmail,
        },
        { onConflict: "album_id,email" },
      );
      if (coHostErr) {
        console.error("[album:patch] add co-host failed", coHostErr);
        return jsonError(500, "INTERNAL_ERROR", "Could not invite co-host.");
      }
    }

    if (body.removeCoHostId) {
      if (!access.isOwner && !access.isSuperAdmin) {
        return jsonError(403, "FORBIDDEN", "Only the album owner can remove co-hosts.");
      }
      await supabase
        .from("co_hosts")
        .delete()
        .eq("id", body.removeCoHostId)
        .eq("album_id", albumId);
    }

    // 2. Bulk media moderation (owners, co-hosts, and super-admins)
    if (body.hideMediaIds && body.hideMediaIds.length > 0) {
      await supabase
        .from("media")
        .update({ is_hidden: true })
        .eq("album_id", albumId)
        .in("id", body.hideMediaIds);
    }

    if (body.unhideMediaIds && body.unhideMediaIds.length > 0) {
      await supabase
        .from("media")
        .update({ is_hidden: false })
        .eq("album_id", albumId)
        .in("id", body.unhideMediaIds);
    }

    if (body.recategorizeMedia) {
      await supabase
        .from("media")
        .update({ category: body.recategorizeMedia.category })
        .eq("album_id", albumId)
        .in("id", body.recategorizeMedia.mediaIds);
    }

    // 3. Album settings update
    const albumPatch: AlbumUpdate = {};
    if (body.title !== undefined) albumPatch.title = body.title;
    if (body.slug !== undefined) albumPatch.slug = body.slug;
    if (body.eventDate !== undefined) albumPatch.event_date = body.eventDate;
    if (body.privacyMode !== undefined) albumPatch.privacy_mode = body.privacyMode;
    if (body.revealAt !== undefined) {
      albumPatch.reveal_at =
        body.revealAt && !Number.isNaN(Date.parse(body.revealAt))
          ? new Date(body.revealAt).toISOString()
          : null;
    }
    if (body.themeConfig !== undefined) {
      albumPatch.theme_config = normalizeThemeConfig(body.themeConfig);
    }
    if (body.flowConfig !== undefined) {
      albumPatch.flow_config = normalizeFlowConfig(body.flowConfig);
    }

    if (Object.keys(albumPatch).length > 0) {
      const { data: updatedAlbum, error: updateErr } = await supabase
        .from("albums")
        .update(albumPatch)
        .eq("id", albumId)
        .select("*")
        .single();

      if (updateErr) {
        if (updateErr.code === "23505") {
          return jsonError(409, "SLUG_TAKEN", "That custom slug is already in use.");
        }
        console.error("[album:patch] update failed", updateErr);
        return jsonError(500, "INTERNAL_ERROR", "Could not update album settings.");
      }

      return jsonOk({ album: hydrateAlbumRow(updatedAlbum), updated: true });
    }

    const { data: currentAlbum } = await supabase
      .from("albums")
      .select("*")
      .eq("id", albumId)
      .single();

    return jsonOk({
      album: currentAlbum ? hydrateAlbumRow(currentAlbum) : null,
      updated: true,
    });
  } catch (error) {
    console.error("[album:patch] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to update album.");
  }
}

/**
 * DELETE /api/albums/[albumId]
 *
 * Permanently deletes selected media items from both Cloudflare R2
 * (`DeleteObjectCommand`) and Supabase (`public.media`).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> },
) {
  const { albumId } = await params;

  const parsed = await parseJsonBody(request, deleteMediaBatchSchema, 32 * 1024);
  if (!parsed.ok) return parsed.response;
  const { mediaIds } = parsed.data;

  if (albumId === DEMO_ALBUM_ID) {
    return jsonOk({ deletedIds: mediaIds });
  }

  const actor = await getAuthenticatedActor();
  if (!actor) {
    return jsonError(401, "UNAUTHORIZED", "Please sign in.");
  }

  const access = await verifyAlbumManagerAccess(albumId, actor);
  if (!access.allowed) {
    return jsonError(403, "FORBIDDEN", "You do not have permission to delete media in this album.");
  }

  try {
    const supabase = await getSupabasePrivilegedClient();
    const { data: targetMedia, error: lookupErr } = await supabase
      .from("media")
      .select("id, file_key")
      .eq("album_id", albumId)
      .in("id", mediaIds);

    if (lookupErr) {
      console.error("[album:delete-media] lookup failed", lookupErr);
      return jsonError(500, "INTERNAL_ERROR", "Could not locate media to delete.");
    }

    const items = targetMedia ?? [];
    await Promise.allSettled(items.map((item) => deleteR2Object(item.file_key)));

    const idsToDelete = items.map((item) => item.id);
    if (idsToDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("media")
        .delete()
        .eq("album_id", albumId)
        .in("id", idsToDelete);

      if (delErr) {
        console.error("[album:delete-media] DB delete failed", delErr);
        return jsonError(500, "INTERNAL_ERROR", "Could not delete media rows.");
      }
    }

    return jsonOk({ deletedIds: idsToDelete });
  } catch (error) {
    console.error("[album:delete-media] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to permanently delete media.");
  }
}
