import type { NextRequest } from "next/server";

import { handleRouteError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { requireEventAccess } from "@/lib/host-auth";
import { rateLimit } from "@/lib/rate-limit";
import { hasSeatingPlans } from "@/lib/schema-features";
import { emptyPlan, readPlan, savePlanSchema, type SeatingPlanDto } from "@/lib/seating/schema";
import { getAdminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ eventId: string }> };

/** Generous: a large plan with 2000 guests and 300 tables is ~500 KB of JSON. */
const MAX_BODY_BYTES = 1_500_000;

interface SeatingRow {
  plan: unknown;
  version: number;
  updated_at: string;
}

const notSetUp = () =>
  jsonError(503, "SEATING_NOT_SET_UP", "Oturma planı henüz kurulmamış. Yönetici supabase/migrations/0006_seating_plans.sql dosyasını çalıştırmalı.");

/** GET /api/host/events/:eventId/seating — the event's plan (empty, version 0, if none yet). Host and co-hosts. */
export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;
    if (!(await hasSeatingPlans())) return notSetUp();

    const { data, error } = await getAdminDb()
      .from("seating_plans")
      .select("plan, version, updated_at")
      .eq("event_id", owned.event.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as SeatingRow | null;
    return jsonOk<SeatingPlanDto>(
      row
        ? { plan: readPlan(row.plan), version: row.version, updatedAt: row.updated_at }
        : { plan: emptyPlan(), version: 0, updatedAt: null },
    );
  } catch (error) {
    return handleRouteError("host:seating:get", error);
  }
}

/**
 * PUT /api/host/events/:eventId/seating — { version, plan }. Saves only if
 * `version` is still the stored one (optimistic concurrency); otherwise 409
 * and the client reloads the current plan.
 */
export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const { eventId } = await context.params;
    const owned = await requireEventAccess(eventId);
    if (!owned.ok) return owned.response;
    const limited = await rateLimit(request, "seating-save", 240, 60, owned.host.id);
    if (limited) return limited;
    if (!(await hasSeatingPlans())) return notSetUp();

    const body = await parseJsonBody(request, savePlanSchema, MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const { version, plan } = body.data;
    const db = getAdminDb();
    const now = new Date().toISOString();

    const write =
      version === 0
        ? await db
            .from("seating_plans")
            .insert({ event_id: owned.event.id, plan, version: 1, updated_by: owned.host.id, updated_at: now })
            .select("version, updated_at")
            .maybeSingle()
        : await db
            .from("seating_plans")
            .update({ plan, version: version + 1, updated_by: owned.host.id, updated_at: now })
            .eq("event_id", owned.event.id)
            .eq("version", version)
            .select("version, updated_at")
            .maybeSingle();

    // 23505: someone else created the plan first; no row: someone else saved a newer version.
    if (write.error && write.error.code !== "23505") throw new Error(write.error.message);
    // The client reloads the current plan with GET.
    if (write.error || !write.data) return jsonError(409, "SEATING_CONFLICT", "Oturma planı başka bir yerde değiştirildi.");
    const saved = write.data as { version: number; updated_at: string };
    return jsonOk({ version: saved.version, updatedAt: saved.updated_at });
  } catch (error) {
    return handleRouteError("host:seating:save", error);
  }
}
