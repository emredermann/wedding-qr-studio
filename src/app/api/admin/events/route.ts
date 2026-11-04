import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedActor } from "@/lib/auth";
import { DEMO_ALBUM_ID, getDemoAdminMetrics } from "@/lib/demo-data";
import { computePostWeddingExpiration } from "@/lib/payments";
import { deleteR2Object } from "@/lib/r2";
import { getSupabasePrivilegedClient } from "@/lib/supabase/server";
import {
  type AdminEventMetric,
  type Album,
  PLAN_TIERS,
} from "@/types/database";
import {
  DEFAULT_FLOW_CONFIG,
  DEFAULT_THEME_CONFIG,
  normalizeFlowConfig,
  normalizeThemeConfig,
} from "@/types/flow";

const overridePaymentSchema = z.object({
  albumId: z.uuid(),
  isPaid: z.boolean(),
  planTier: z.enum(PLAN_TIERS),
});

const deleteEventSchema = z.object({
  albumId: z.uuid(),
});

const cloneEventFlowSchema = z.object({
  sourceAlbumId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/),
  eventDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v ?? null),
});

function hydrateAlbum(row: Album): Album {
  return {
    ...row,
    theme_config: normalizeThemeConfig(row.theme_config),
    flow_config: normalizeFlowConfig(row.flow_config),
  };
}

/**
 * GET /api/admin/events
 *
 * Returns platform-wide metrics for the Master Super-Admin Dashboard:
 * active events, R2 storage consumption per event, media counts, faces indexed,
 * and guest registrations.
 */
export async function GET() {
  const actor = await getAuthenticatedActor();
  if (!actor) {
    return jsonError(401, "UNAUTHORIZED", "Please sign in as an administrator.");
  }
  if (actor.isDemoFallback) {
    return jsonOk({ events: getDemoAdminMetrics(), isDemo: true });
  }

  try {
    const supabase = await getSupabasePrivilegedClient();

    let albumsQuery = supabase.from("albums").select("*").order("created_at", { ascending: false });
    if (!actor.isSuperAdmin) {
      albumsQuery = albumsQuery.eq("owner_id", actor.userId);
    }

    const { data: albums, error: albumsError } = await albumsQuery;
    if (albumsError) {
      console.error("[admin:events] albums query failed", albumsError);
      return jsonError(500, "INTERNAL_ERROR", "Could not load platform events.");
    }

    const albumList = (albums ?? []).map(hydrateAlbum);
    if (albumList.length === 0) {
      return jsonOk({ events: getDemoAdminMetrics(), isDemo: true });
    }

    const albumIds = albumList.map((a) => a.id);

    const [mediaRes, facesRes, regsRes] = await Promise.all([
      supabase
        .from("media")
        .select("album_id, media_type, size_bytes")
        .in("album_id", albumIds),
      supabase.from("media_faces").select("album_id").in("album_id", albumIds),
      supabase.from("guest_registrations").select("album_id").in("album_id", albumIds),
    ]);

    const mediaByAlbum = new Map<
      string,
      { total: number; photo: number; video: number; audio: number; bytes: number }
    >();
    for (const m of mediaRes.data ?? []) {
      const current = mediaByAlbum.get(m.album_id) ?? {
        total: 0,
        photo: 0,
        video: 0,
        audio: 0,
        bytes: 0,
      };
      current.total += 1;
      if (m.media_type === "photo") current.photo += 1;
      else if (m.media_type === "video") current.video += 1;
      else if (m.media_type === "audio") current.audio += 1;
      current.bytes += m.size_bytes || 0;
      mediaByAlbum.set(m.album_id, current);
    }

    const facesByAlbum = new Map<string, number>();
    for (const f of facesRes.data ?? []) {
      facesByAlbum.set(f.album_id, (facesByAlbum.get(f.album_id) ?? 0) + 1);
    }

    const regsByAlbum = new Map<string, number>();
    for (const r of regsRes.data ?? []) {
      regsByAlbum.set(r.album_id, (regsByAlbum.get(r.album_id) ?? 0) + 1);
    }

    const metrics: AdminEventMetric[] = albumList.map((album) => {
      const stats = mediaByAlbum.get(album.id) ?? {
        total: 0,
        photo: 0,
        video: 0,
        audio: 0,
        bytes: 0,
      };
      return {
        album,
        mediaCount: stats.total,
        photoCount: stats.photo,
        videoCount: stats.video,
        audioCount: stats.audio,
        facesIndexedCount: facesByAlbum.get(album.id) ?? 0,
        storageBytes: stats.bytes,
        guestRegistrationCount: regsByAlbum.get(album.id) ?? 0,
      };
    });

    return jsonOk({ events: metrics, isDemo: false });
  } catch (error) {
    console.error("[admin:events] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to load admin metrics.");
  }
}

/**
 * PATCH /api/admin/events
 *
 * Manual VIP / B2B Payment Override: updates `is_paid`, `plan_tier`, and
 * extends `expires_at` by 24 months.
 */
export async function PATCH(request: NextRequest) {
  const parsed = await parseJsonBody(request, overridePaymentSchema, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const { albumId, isPaid, planTier } = parsed.data;

  const actor = await getAuthenticatedActor();
  if (albumId === DEMO_ALBUM_ID || actor?.isDemoFallback) {
    return jsonOk({
      albumId,
      isPaid,
      planTier,
      expiresAt: computePostWeddingExpiration("2026-06-20"),
    });
  }

  if (!actor) {
    return jsonError(401, "UNAUTHORIZED", "Please sign in as an administrator.");
  }

  try {
    const supabase = await getSupabasePrivilegedClient();
    const { data: album, error: lookupErr } = await supabase
      .from("albums")
      .select("id, owner_id, event_date")
      .eq("id", albumId)
      .maybeSingle();

    if (lookupErr || !album) {
      return jsonError(404, "ALBUM_NOT_FOUND", "Event not found.");
    }

    if (!actor.isSuperAdmin) {
      return jsonError(403, "FORBIDDEN", "Super-admin privileges required for payment override.");
    }

    const expiresAt = computePostWeddingExpiration(album.event_date);

    const { data: updated, error: updateErr } = await supabase
      .from("albums")
      .update({
        is_paid: isPaid,
        plan_tier: planTier,
        expires_at: expiresAt,
      })
      .eq("id", albumId)
      .select("*")
      .single();

    if (updateErr) {
      console.error("[admin:override] update failed", updateErr);
      return jsonError(500, "INTERNAL_ERROR", "Could not override payment status.");
    }

    return jsonOk({
      album: hydrateAlbum(updated),
      albumId,
      isPaid,
      planTier,
      expiresAt,
    });
  } catch (error) {
    console.error("[admin:override] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to override payment status.");
  }
}

/**
 * POST /api/admin/events
 *
 * "Clone Event Flow": duplicates a successful event's `theme_config`,
 * `flow_config`, and `privacy_mode` for a new client event.
 */
export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, cloneEventFlowSchema, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const { sourceAlbumId, title, slug, eventDate } = parsed.data;

  const actor = await getAuthenticatedActor();
  if (!actor) {
    return jsonError(401, "UNAUTHORIZED", "Please sign in to clone an event flow.");
  }
  const demoMetrics = getDemoAdminMetrics();
  const demoSource = demoMetrics.find((m) => m.album.id === sourceAlbumId)?.album;

  if (actor.isDemoFallback || demoSource) {
    const template = demoSource ?? demoMetrics[0].album;
    const clonedAlbum: Album = {
      ...template,
      id: crypto.randomUUID(),
      title,
      slug,
      event_date: eventDate,
      created_at: new Date().toISOString(),
    };
    const metric: AdminEventMetric = {
      album: clonedAlbum,
      mediaCount: 0,
      photoCount: 0,
      videoCount: 0,
      audioCount: 0,
      facesIndexedCount: 0,
      storageBytes: 0,
      guestRegistrationCount: 0,
    };
    return jsonOk({ createdMetric: metric }, 201);
  }

  try {
    const supabase = await getSupabasePrivilegedClient();
    const { data: source } = await supabase
      .from("albums")
      .select("privacy_mode, theme_config, flow_config")
      .eq("id", sourceAlbumId)
      .maybeSingle();

    const themeConfig = source ? normalizeThemeConfig(source.theme_config) : DEFAULT_THEME_CONFIG;
    const flowConfig = source ? normalizeFlowConfig(source.flow_config) : DEFAULT_FLOW_CONFIG;

    const { data: inserted, error: insertErr } = await supabase
      .from("albums")
      .insert({
        owner_id: actor.userId,
        title,
        slug,
        event_date: eventDate,
        privacy_mode: source?.privacy_mode ?? "public",
        theme_config: themeConfig,
        flow_config: flowConfig,
        is_paid: true,
        plan_tier: "unlimited",
      })
      .select("*")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        return jsonError(409, "SLUG_TAKEN", `The slug "${slug}" is already in use.`);
      }
      console.error("[admin:clone] insert failed", insertErr);
      return jsonError(500, "INTERNAL_ERROR", "Could not clone event flow.");
    }

    const metric: AdminEventMetric = {
      album: hydrateAlbum(inserted),
      mediaCount: 0,
      photoCount: 0,
      videoCount: 0,
      audioCount: 0,
      facesIndexedCount: 0,
      storageBytes: 0,
      guestRegistrationCount: 0,
    };

    return jsonOk({ createdMetric: metric }, 201);
  } catch (error) {
    console.error("[admin:clone] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to clone event flow.");
  }
}

/**
 * DELETE /api/admin/events
 *
 * Permanently deletes an event/album and cleans up:
 *  1. Cloudflare R2 storage files for all associated media
 *  2. Database album row (cascading to media, media_faces, guest_registrations, co_hosts)
 */
export async function DELETE(request: NextRequest) {
  const parsed = await parseJsonBody(request, deleteEventSchema, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const { albumId } = parsed.data;

  const actor = await getAuthenticatedActor();
  if (actor?.isDemoFallback) {
    return jsonOk({ deletedAlbumId: albumId });
  }

  if (!actor) {
    return jsonError(401, "UNAUTHORIZED", "Please sign in as an administrator.");
  }

  if (!actor.isSuperAdmin) {
    return jsonError(403, "FORBIDDEN", "Super-admin privileges required to delete events.");
  }

  try {
    const supabase = await getSupabasePrivilegedClient();

    // 1. Fetch file keys of all media in this album to delete them from Cloudflare R2
    const { data: mediaItems } = await supabase
      .from("media")
      .select("file_key")
      .eq("album_id", albumId);

    if (mediaItems && mediaItems.length > 0) {
      await Promise.allSettled(
        mediaItems
          .filter((m) => Boolean(m.file_key))
          .map((m) => deleteR2Object(m.file_key)),
      );
    }

    // 2. Delete album row from DB (PostgreSQL CASCADE removes media, media_faces, etc.)
    const { error: delErr } = await supabase
      .from("albums")
      .delete()
      .eq("id", albumId);

    if (delErr) {
      console.error("[admin:delete] delete album failed", delErr);
      return jsonError(500, "INTERNAL_ERROR", "Could not delete event.");
    }

    return jsonOk({ deletedAlbumId: albumId });
  } catch (error) {
    console.error("[admin:delete] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to delete event.");
  }
}
