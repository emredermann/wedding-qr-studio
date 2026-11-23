import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { brandingMetaFrom, brandingSchema, readBranding, type BrandingInput } from "@/lib/branding";
import { toHostEventDto } from "@/lib/events";
import { requireEventAccess } from "@/lib/host-auth";
import { planForUser, proRequired } from "@/lib/host-plan";
import { hasBrandingColumns } from "@/lib/schema-features";
import { getAdminDb } from "@/lib/supabase/server";
import type { EventRow, HostEventDto } from "@/types/domain";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ eventId: string }> };

/** GET — the saved brand kit with its images (for the editor). */
export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;
    const meta = readBranding(owned.event.branding);
    const empty: BrandingInput = { logo: null, sponsors: [], sponsorsLabel: null, showOnLiveWall: true };
    if (!meta || !(await hasBrandingColumns())) return jsonOk({ branding: empty });
    const { data, error } = await getAdminDb().from("event_brand_assets").select("asset, data").eq("event_id", owned.event.id);
    if (error) throw new Error(error.message);
    const images = new Map((data as Array<{ asset: string; data: string }>).map((row) => [row.asset, row.data]));
    const branding: BrandingInput = {
      logo: meta.hasLogo ? (images.get("logo") ?? null) : null,
      sponsors: meta.sponsors.filter((s) => images.has(s.id)).map((s) => ({ ...s, logo: images.get(s.id)! })),
      sponsorsLabel: meta.sponsorsLabel,
      showOnLiveWall: meta.showOnLiveWall,
    };
    return jsonOk({ branding });
  } catch (error) {
    return handleRouteError("host:branding:get", error);
  }
}

/** PUT — replaces the brand kit (changing settings needs the owner's Pro package). */
export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;
    const locked = await proRequired(owned.event.owner_id, "editSettings");
    if (locked) return locked;
    const plan = await planForUser(owned.event.owner_id);
    if (!(await hasBrandingColumns())) {
      return jsonError(503, "MIGRATION_REQUIRED", "Marka kiti için veritabanı güncellemesi (0008) henüz çalıştırılmamış.");
    }

    const body = await parseJsonBody(request, brandingSchema, 2 * 1024 * 1024);
    if (!body.ok) return body.response;
    const previous = readBranding(owned.event.branding);
    const input = body.data;
    const db = getAdminDb();

    // Images first (upsert the new set, drop the ones no longer used), then the metadata.
    const rows = [
      ...(input.logo ? [{ event_id: owned.event.id, asset: "logo", data: input.logo }] : []),
      ...input.sponsors.map((s) => ({ event_id: owned.event.id, asset: s.id, data: s.logo })),
    ].map((row) => ({ ...row, updated_at: new Date().toISOString() }));
    if (rows.length > 0) {
      const { error: upsertError } = await db.from("event_brand_assets").upsert(rows, { onConflict: "event_id,asset" });
      if (upsertError) throw new Error(upsertError.message);
    }
    const keep = rows.map((row) => row.asset);
    let cleanup = db.from("event_brand_assets").delete().eq("event_id", owned.event.id);
    if (keep.length > 0) cleanup = cleanup.not("asset", "in", `(${keep.join(",")})`);
    const { error: deleteError } = await cleanup;
    if (deleteError) throw new Error(deleteError.message);

    const branding = brandingMetaFrom(input, (previous?.version ?? 0) + 1);
    const { data, error } = await db.from("events").update({ branding }).eq("id", owned.event.id).select("*").single();
    if (error) throw new Error(error.message);
    return jsonOk<{ event: HostEventDto }>({ event: toHostEventDto(data as EventRow, owned.role, plan) });
  } catch (error) {
    return handleRouteError("host:branding:put", error);
  }
}
