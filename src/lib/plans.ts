/**
 * Packages. A host account is on "free" unless the admin put it on "pro"
 * (`npm run user -- plan <kullanici-adi> pro [YYYY-MM-DD]`), which writes
 * `app_metadata.plan` (+ optional `plan_until`) in Supabase Auth. There is no
 * online payment yet. Co-hosts act under the event owner's package.
 *
 * Dependency-free so `node --test` can load it directly.
 */
export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

/** Features that need the Pro package. Everything else is free. */
export const PRO_FEATURES = ["brandKit", "photobook", "customFrame"] as const;
export type ProFeature = (typeof PRO_FEATURES)[number];

const FEATURES: Record<Plan, ReadonlySet<ProFeature>> = {
  free: new Set(),
  pro: new Set(PRO_FEATURES),
};

export function hasFeature(plan: Plan, feature: ProFeature): boolean {
  return FEATURES[plan].has(feature);
}

/**
 * Reads the package from Supabase `app_metadata` (only the service role can
 * write it). An expired `plan_until` (end of that day, UTC) falls back to free.
 */
export function planFromMetadata(metadata: unknown, now: Date = new Date()): Plan {
  const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  if (meta.plan !== "pro") return "free";
  if (typeof meta.plan_until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(meta.plan_until)) {
    const until = new Date(`${meta.plan_until}T23:59:59.999Z`);
    if (!Number.isNaN(until.getTime()) && until < now) return "free";
  }
  return "pro";
}
