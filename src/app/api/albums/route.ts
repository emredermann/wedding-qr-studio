import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedActor, verifyAlbumManagerAccess } from "@/lib/auth";
import { DEMO_FULL_ALBUM } from "@/lib/demo-data";
import { getSupabasePrivilegedClient } from "@/lib/supabase/server";
import { type Album, PRIVACY_MODES } from "@/types/database";
import {
  DEFAULT_FLOW_CONFIG,
  DEFAULT_THEME_CONFIG,
  normalizeFlowConfig,
  normalizeThemeConfig,
} from "@/types/flow";

const MAX_ALBUMS_PER_ACCOUNT = 5;

const createAlbumSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/,
      "Slug must be 3–64 lowercase letters, numbers, or hyphens.",
    ),
  eventDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Event date must be YYYY-MM-DD.")
    .nullish()
    .transform((v) => v ?? null),
  privacyMode: z.enum(PRIVACY_MODES).default("public"),
  revealAt: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null)),
  cloneFromAlbumId: z.uuid().nullish(),
});

function hydrateAlbumRow(row: Album): Album {
  return {
    ...row,
    theme_config: normalizeThemeConfig(row.theme_config),
    flow_config: normalizeFlowConfig(row.flow_config),
  };
}

/**
 * GET /api/albums
 *
 * Lists all albums owned by the authenticated couple or shared with them as a co-host.
 */
export async function GET() {
  const actor = await getAuthenticatedActor();
  if (!actor) {
    return jsonError(401, "UNAUTHORIZED", "Please sign in to view your wedding albums.");
  }

  if (actor.isDemoFallback) {
    return jsonOk({
      albums: [DEMO_FULL_ALBUM],
      maxAlbumsPerAccount: MAX_ALBUMS_PER_ACCOUNT,
      actorEmail: actor.email,
      isSuperAdmin: actor.isSuperAdmin,
    });
  }

  try {
    const supabase = await getSupabasePrivilegedClient();

    const { data: owned, error: ownedError } = await supabase
      .from("albums")
      .select("*")
      .eq("owner_id", actor.userId)
      .order("created_at", { ascending: false });

    if (ownedError) {
      console.error("[albums:list] owned query failed", ownedError);
      return jsonError(500, "INTERNAL_ERROR", "Could not load your albums.");
    }

    let coHostedAlbums: Album[] = [];
    if (actor.email) {
      const { data: coHostRows } = await supabase
        .from("co_hosts")
        .select("album_id")
        .eq("email", actor.email);

      const albumIds = (coHostRows ?? []).map((r) => r.album_id);
      if (albumIds.length > 0) {
        const { data: shared } = await supabase
          .from("albums")
          .select("*")
          .in("id", albumIds)
          .order("created_at", { ascending: false });
        coHostedAlbums = shared ?? [];
      }
    }

    const byId = new Map<string, Album>();
    for (const a of [...(owned ?? []), ...coHostedAlbums]) {
      byId.set(a.id, hydrateAlbumRow(a));
    }

    return jsonOk({
      albums: Array.from(byId.values()),
      maxAlbumsPerAccount: MAX_ALBUMS_PER_ACCOUNT,
      actorEmail: actor.email,
      isSuperAdmin: actor.isSuperAdmin,
    });
  } catch (error) {
    console.error("[albums:list] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to load albums.");
  }
}

/**
 * POST /api/albums
 *
 * Creates a new wedding album (up to 5 per couple account). Supports cloning
 * `theme_config` and `flow_config` from an existing event (`cloneFromAlbumId`).
 */
export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedActor();
  if (!actor) {
    return jsonError(401, "UNAUTHORIZED", "Please sign in to create an album.");
  }

  const parsed = await parseJsonBody(request, createAlbumSchema, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const { title, slug, eventDate, privacyMode, revealAt, cloneFromAlbumId } = parsed.data;

  if (actor.isDemoFallback) {
    const simulated: Album = {
      ...DEMO_FULL_ALBUM,
      id: crypto.randomUUID(),
      title,
      slug,
      event_date: eventDate,
      privacy_mode: privacyMode,
      reveal_at: revealAt,
      created_at: new Date().toISOString(),
    };
    return jsonOk({ album: simulated }, 201);
  }

  try {
    const supabase = await getSupabasePrivilegedClient();

    // Enforce max 5 albums per account (super-admins can create unlimited client events)
    if (!actor.isSuperAdmin) {
      const { count, error: countError } = await supabase
        .from("albums")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", actor.userId);

      if (countError) {
        console.error("[albums:create] count failed", countError);
        return jsonError(500, "INTERNAL_ERROR", "Could not verify account album limit.");
      }

      if ((count ?? 0) >= MAX_ALBUMS_PER_ACCOUNT) {
        return jsonError(
          403,
          "ALBUM_LIMIT_REACHED",
          `Each account can create up to ${MAX_ALBUMS_PER_ACCOUNT} event albums (e.g., Engagement, Welcome Party, Ceremony, Reception, Brunch).`,
        );
      }
    }

    let themeConfig = DEFAULT_THEME_CONFIG;
    let flowConfig = DEFAULT_FLOW_CONFIG;

    if (cloneFromAlbumId) {
      const sourceAccess = await verifyAlbumManagerAccess(cloneFromAlbumId, actor);
      if (!sourceAccess.allowed) {
        return jsonError(403, "FORBIDDEN", "You do not have access to the source album.");
      }
      const { data: sourceAlbum } = await supabase
        .from("albums")
        .select("theme_config, flow_config")
        .eq("id", cloneFromAlbumId)
        .maybeSingle();

      if (sourceAlbum) {
        themeConfig = normalizeThemeConfig(sourceAlbum.theme_config);
        flowConfig = normalizeFlowConfig(sourceAlbum.flow_config);
      }
    }

    const { data: created, error: insertError } = await supabase
      .from("albums")
      .insert({
        owner_id: actor.userId,
        title,
        slug,
        event_date: eventDate,
        privacy_mode: privacyMode,
        reveal_at: revealAt,
        theme_config: themeConfig,
        flow_config: flowConfig,
        is_paid: true,
        plan_tier: "unlimited",
      })
      .select("*")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return jsonError(409, "SLUG_TAKEN", `The URL slug "${slug}" is already taken.`);
      }
      console.error("[albums:create] insert failed", insertError);
      return jsonError(
        500,
        "INTERNAL_ERROR",
        insertError.message ? `Could not create album: ${insertError.message}` : "Could not create album.",
      );
    }

    return jsonOk({ album: hydrateAlbumRow(created) }, 201);
  } catch (error) {
    console.error("[albums:create] unexpected error", error);
    return jsonError(
      500,
      "INTERNAL_ERROR",
      error instanceof Error ? `Failed to create album: ${error.message}` : "Failed to create album.",
    );
  }
}
