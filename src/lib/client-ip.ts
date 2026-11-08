/**
 * Resolves the caller's IP for rate limiting and upload quotas.
 *
 * The LEFTMOST `X-Forwarded-For` entry is written by the client and can be
 * spoofed, so it is never trusted. Resolution order:
 *  1. `TRUSTED_IP_HEADER` (e.g. `cf-connecting-ip` behind Cloudflare) when configured,
 *  2. on Vercel, `x-vercel-forwarded-for` / `x-real-ip` (set by Vercel's edge),
 *  3. the RIGHTMOST `X-Forwarded-For` entry (appended by the nearest proxy, e.g. Render),
 *  4. `x-real-ip`, else "unknown".
 */
export function resolveClientIp(
  headers: Pick<Headers, "get">,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const first = (value: string | null | undefined) => value?.split(",")[0]?.trim() || null;
  const clean = (value: string) => value.slice(0, 64);

  const configured = env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (configured) {
    const value = first(headers.get(configured));
    if (value) return clean(value);
  }

  if (env.VERCEL) {
    const value = first(headers.get("x-vercel-forwarded-for")) ?? first(headers.get("x-real-ip"));
    if (value) return clean(value);
  }

  const chain = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (chain && chain.length > 0) return clean(chain[chain.length - 1]);

  return clean(first(headers.get("x-real-ip")) ?? "unknown");
}
