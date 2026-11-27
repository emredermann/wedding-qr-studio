import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { contactSchema, looksAutomated } from "@/lib/contact/schema";
import { getServerLang } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/contact — saves a "contact us" request (name, email, optional
 * phone and note, consent). Public; rate limited per IP; no IP is stored.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, "contact", 5, 3600);
    if (limited) return limited;
    const parsed = await parseJsonBody(request, contactSchema, 16 * 1024);
    if (!parsed.ok) return parsed.response;
    const input = parsed.data;
    // Pretend success to bots so they do not retry with variations.
    if (looksAutomated(input)) return jsonOk({ ok: true });

    const { error } = await getAdminDb()
      .from("contact_requests")
      .insert({
        full_name: input.fullName,
        email: input.email,
        phone: input.phone,
        note: input.note,
        lang: await getServerLang(),
        source: input.source ?? null,
        consent_at: new Date().toISOString(),
      });
    if (error) {
      if (error.code === "42P01" || /contact_requests/.test(error.message)) {
        return jsonError(503, "CONTACT_NOT_SET_UP", "İletişim formu henüz kurulmamış. Lütfen daha sonra tekrar deneyin.");
      }
      throw new Error(error.message);
    }
    return jsonOk({ ok: true }, 201);
  } catch (error) {
    return handleRouteError("contact:post", error);
  }
}
