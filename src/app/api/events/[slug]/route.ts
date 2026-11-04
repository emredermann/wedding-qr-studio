import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { DEMO_ALBUM_SLUG, DEMO_PUBLIC_ALBUM } from "@/lib/demo-data";
import {
  attachGuestSessionCookie,
  getVerifiedGuestSession,
  resolveOrMintGuestSession,
} from "@/lib/guest-session";
import { createPresignedGetUrl, deleteR2Object } from "@/lib/r2";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { GuestEventPayload, Media, PublicAlbum } from "@/types/database";
import { normalizeFlowConfig, normalizeThemeConfig } from "@/types/flow";

const MEDIA_COLUMNS =
  "id, album_id, file_key, file_url, media_type, mime_type, size_bytes, guest_name, guest_session_id, category, phash, is_hidden, created_at" as const;

const guestRegistrationSchema = z.object({
  guestSessionId: z.string().trim().min(1).max(64).optional(),
  guestName: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => (v ? v : null)),
  contact: z
    .string()
    .trim()
    .max(160)
    .nullish()
    .transform((v) => (v ? v : null)),
  tableNumber: z
    .string()
    .trim()
    .max(32)
    .nullish()
    .transform((v) => (v ? v : null)),
  contactConsent: z.boolean().optional(),
});

const deleteGuestMediaSchema = z.object({
  mediaId: z.uuid(),
  guestSessionId: z.string().trim().min(1).max(64).optional(),
});

/**
 * GET /api/events/[slug]
 *
 * Returns the public event configuration (`theme_config`, `flow_config`,
 * `privacy_mode`, `reveal_at`), lock state, and ONLY the verified guest's own
 * session uploads (`myUploads`).
 *
 * ZERO PUBLIC GALLERY MANDATE:
 * Standard guests NEVER receive an open gallery feed of other attendees' media.
 * Guests can only discover photos containing their own face via
 * `POST /api/faces/match` (`match_guest_faces` RPC).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rateLimit = checkRateLimit(request, {
    namespace: "events:get",
    limit: 90,
    windowSeconds: 60,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { slug: rawSlug } = await params;
  const slug = rawSlug.trim().toLowerCase();
  const verifiedSession = getVerifiedGuestSession(request);
  const activeSession = verifiedSession ?? resolveOrMintGuestSession(request);

  try {
    const supabase = getSupabaseAdminClient();
    const { data: fetchedAlbum, error: albumError } = await supabase
      .from("albums")
      .select(
        "id, slug, title, event_date, privacy_mode, reveal_at, expires_at, theme_config, flow_config",
      )
      .eq("slug", slug)
      .maybeSingle();

    if (albumError) {
      console.error("[events:get] album lookup failed", albumError);
      return jsonError(500, "INTERNAL_ERROR", "Could not load event.");
    }
    const albumRow = fetchedAlbum ?? (slug === DEMO_ALBUM_SLUG ? DEMO_PUBLIC_ALBUM : null);
    if (!albumRow) {
      return jsonError(404, "ALBUM_NOT_FOUND", "Event not found.");
    }

    const now = Date.now();
    if (Date.parse(albumRow.expires_at) <= now) {
      return jsonError(410, "ALBUM_EXPIRED", "This event album has expired.");
    }

    const album: PublicAlbum = {
      id: albumRow.id,
      slug: albumRow.slug,
      title: albumRow.title,
      event_date: albumRow.event_date,
      privacy_mode: albumRow.privacy_mode,
      reveal_at: albumRow.reveal_at,
      expires_at: albumRow.expires_at,
      theme_config: normalizeThemeConfig(albumRow.theme_config),
      flow_config: normalizeFlowConfig(albumRow.flow_config),
    };

    const isUnrevealed = album.reveal_at !== null && Date.parse(album.reveal_at) > now;
    const isPrivate = album.privacy_mode === "private";
    const isGalleryLocked = isPrivate || isUnrevealed;
    const lockReason = isPrivate ? "private" : isUnrevealed ? "disposable_camera" : null;

    // Only return `myUploads` and registration for a cryptographically verified guest session cookie
    let myUploads: Media[] = [];
    let registration: GuestEventPayload["registration"] = null;

    if (verifiedSession) {
      const [{ data: ownData, error: ownError }, { data: regData }] = await Promise.all([
        supabase
          .from("media")
          .select(MEDIA_COLUMNS)
          .eq("album_id", album.id)
          .eq("guest_session_id", verifiedSession.sessionId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("guest_registrations")
          .select("guest_name, contact, table_number")
          .eq("album_id", album.id)
          .eq("guest_session_id", verifiedSession.sessionId)
          .maybeSingle(),
      ]);

      if (!ownError && ownData) {
        myUploads = await Promise.all(
          ownData.map(async (item) => ({
            ...item,
            file_url: await createPresignedGetUrl(item.file_key, item.file_url),
          })),
        );
      }

      if (regData) {
        registration = {
          guestName: regData.guest_name,
          contact: regData.contact,
          tableNumber: regData.table_number,
        };
      }
    }

    const payload: GuestEventPayload = {
      album,
      isGalleryLocked,
      lockReason,
      myUploads,
      guestSessionId: activeSession.sessionId,
      registration,
    };

    return attachGuestSessionCookie(jsonOk(payload), activeSession);
  } catch (error) {
    console.error("[events:get] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Could not load event.");
  }
}

/**
 * POST /api/events/[slug]
 *
 * Persists a guest's onboarding registration (`guest_registration` flow step).
 * Enforces GDPR/KVKK consent when optional contact data is provided and binds
 * the record to the server-verified guest session cookie.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const existingSession = getVerifiedGuestSession(request);
  const guestSession = existingSession ?? resolveOrMintGuestSession(request);

  const rateLimit = checkRateLimit(request, {
    namespace: "events:register",
    limit: 20,
    windowSeconds: 60,
    subject: guestSession.sessionId,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { slug: rawSlug } = await params;
  const slug = rawSlug.trim().toLowerCase();

  const parsed = await parseJsonBody(request, guestRegistrationSchema, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const { guestSessionId, guestName, contact, tableNumber, contactConsent } = parsed.data;

  if (existingSession && guestSessionId && guestSessionId !== existingSession.sessionId) {
    return jsonError(403, "FORBIDDEN", "Guest session token mismatch.");
  }

  // GDPR / KVKK Compliance: storing phone/email requires explicit opt-in consent
  if (contact && contactConsent !== true) {
    return jsonError(
      422,
      "VALIDATION_FAILED",
      "Explicit GDPR/KVKK consent is required before saving contact details.",
      { contactConsent: ["Please confirm consent to store your contact information."] },
    );
  }

  if (slug === DEMO_ALBUM_SLUG) {
    return attachGuestSessionCookie(
      jsonOk({ registered: true, albumId: DEMO_PUBLIC_ALBUM.id, guestSessionId: guestSession.sessionId }),
      guestSession,
    );
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: album, error: albumError } = await supabase
      .from("albums")
      .select("id, expires_at")
      .eq("slug", slug)
      .maybeSingle();

    if (albumError || !album) {
      return jsonError(404, "ALBUM_NOT_FOUND", "Event not found.");
    }
    if (Date.parse(album.expires_at) <= Date.now()) {
      return jsonError(410, "ALBUM_EXPIRED", "This event has expired.");
    }

    const { error: upsertError } = await supabase.from("guest_registrations").upsert(
      {
        album_id: album.id,
        guest_session_id: guestSession.sessionId,
        guest_name: guestName,
        contact,
        table_number: tableNumber,
        contact_consent_at: contact ? new Date().toISOString() : null,
      },
      { onConflict: "album_id,guest_session_id" },
    );

    if (upsertError) {
      console.error("[events:register] upsert failed", upsertError);
      return jsonError(500, "INTERNAL_ERROR", "Could not save guest registration.");
    }

    return attachGuestSessionCookie(
      jsonOk(
        {
          registered: true,
          albumId: album.id,
          guestSessionId: guestSession.sessionId,
        },
        201,
      ),
      guestSession,
    );
  } catch (error) {
    console.error("[events:register] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to save guest registration.");
  }
}

/**
 * DELETE /api/events/[slug]
 *
 * Allows a guest to delete their own uploaded media item ONLY when their
 * cryptographically signed `wqr_guest_session` cookie matches
 * `media.guest_session_id`. Prevents forged `guest_session_id` deletion attacks.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const verifiedSession = getVerifiedGuestSession(request);
  if (!verifiedSession) {
    return jsonError(
      401,
      "UNAUTHORIZED",
      "A verified guest session is required to delete your upload.",
    );
  }

  const rateLimit = checkRateLimit(request, {
    namespace: "events:delete",
    limit: 30,
    windowSeconds: 60,
    subject: verifiedSession.sessionId,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { slug: rawSlug } = await params;
  const slug = rawSlug.trim().toLowerCase();

  const parsed = await parseJsonBody(request, deleteGuestMediaSchema, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const { mediaId, guestSessionId } = parsed.data;

  if (guestSessionId && guestSessionId !== verifiedSession.sessionId) {
    return jsonError(403, "FORBIDDEN", "Forged guest_session_id rejected.");
  }

  if (slug === DEMO_ALBUM_SLUG) {
    return jsonOk({ deletedMediaId: mediaId });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: album, error: albumError } = await supabase
      .from("albums")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (albumError || !album) {
      return jsonError(404, "ALBUM_NOT_FOUND", "Event not found.");
    }

    const { data: media, error: mediaError } = await supabase
      .from("media")
      .select("id, file_key, guest_session_id")
      .eq("id", mediaId)
      .eq("album_id", album.id)
      .maybeSingle();

    if (mediaError || !media) {
      return jsonError(404, "NOT_FOUND", "Media item not found.");
    }

    if (!media.guest_session_id || media.guest_session_id !== verifiedSession.sessionId) {
      return jsonError(403, "FORBIDDEN", "You can only delete media uploaded from your device.");
    }

    try {
      await deleteR2Object(media.file_key);
    } catch (r2Error) {
      console.error("[events:delete] R2 delete warning", r2Error);
    }

    const { error: deleteError } = await supabase.from("media").delete().eq("id", media.id);
    if (deleteError) {
      console.error("[events:delete] DB delete failed", deleteError);
      return jsonError(500, "INTERNAL_ERROR", "Could not delete media record.");
    }

    return jsonOk({ deleted: true, mediaId });
  } catch (error) {
    console.error("[events:delete] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to delete upload.");
  }
}
