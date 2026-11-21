import { jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness check for Docker HEALTHCHECK, load balancers and
 * uptime monitors. Deliberately touches no database or Google API, so a slow
 * dependency never marks a healthy container as dead.
 */
export function GET() {
  return jsonOk({ ok: true, time: new Date().toISOString() });
}
