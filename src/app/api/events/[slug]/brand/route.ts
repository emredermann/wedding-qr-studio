import type { NextRequest } from "next/server";

import { handleRouteError, jsonError } from "@/lib/api/http";
import { decodeDataUrl } from "@/lib/branding";
import { findEventBySlug } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/events/:slug/brand?a=logo|<sponsorId>&v=<version>
 * Brand kit images. URLs carry the branding version, so responses can be
 * cached for a long time; a new upload changes the URL.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const limited = await rateLimit(request, "brand", 3000, 60);
    if (limited) return limited;
    const asset = request.nextUrl.searchParams.get("a") ?? "";
    if (!/^(logo|[a-z0-9]{4,16})$/.test(asset)) return jsonError(404, "NOT_FOUND", "Görsel bulunamadı.");

    const event = await findEventBySlug(slug);
    if (!event) return jsonError(404, "NOT_FOUND", "Görsel bulunamadı.");
    const { data, error } = await getAdminDb()
      .from("event_brand_assets")
      .select("data")
      .eq("event_id", event.id)
      .eq("asset", asset)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const image = decodeDataUrl((data as { data: string } | null)?.data);
    if (!image) return jsonError(404, "NOT_FOUND", "Görsel bulunamadı.");

    return new Response(Buffer.from(image.bytes), {
      status: 200,
      headers: {
        "Content-Type": image.mime,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError("events:brand", error);
  }
}
