import "server-only";

import { jsonError } from "@/lib/api/http";
import { hasFeature, planFromMetadata, type Plan, type ProFeature } from "@/lib/plans";
import { getAdminDb } from "@/lib/supabase/server";

/**
 * Package of a host account, read from Supabase Auth `app_metadata`. Guest
 * pages ask for the event owner's package on every load, so answers are
 * cached per instance for a minute; a lookup failure counts as free (never
 * blocks the page).
 */
const TTL_MS = 60_000;
const cache = new Map<string, { plan: Plan; at: number }>();

export async function planForUser(userId: string): Promise<Plan> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.plan;
  let plan: Plan = "free";
  try {
    const { data, error } = await getAdminDb().auth.admin.getUserById(userId);
    if (!error) plan = planFromMetadata(data.user?.app_metadata);
  } catch (error) {
    console.warn("[host-plan] lookup failed, treating as free", error);
  }
  if (cache.size > 5000) cache.clear();
  cache.set(userId, { plan, at: Date.now() });
  return plan;
}

const PRO_REQUIRED: Record<ProFeature, string> = {
  createEvent: "Yeni etkinlik oluşturmak için Pro paket gerekir.",
  editSettings: "Etkinlik ayarlarını değiştirmek için Pro paket gerekir.",
  invitations: "Davetiye modülü Pro pakete dahildir.",
};

/**
 * 403 response when `userId` (the event owner, or the creator) is not on a
 * package with `feature`; null when allowed. Co-hosts act under the owner's package.
 */
export async function proRequired(userId: string, feature: ProFeature) {
  if (hasFeature(await planForUser(userId), feature)) return null;
  return jsonError(403, "PRO_REQUIRED", PRO_REQUIRED[feature]);
}
