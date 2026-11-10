/**
 * Validates a `?next=` redirect target. Only same-origin relative paths are
 * allowed; anything else falls back. Valid paths are returned unchanged.
 *
 * Beyond "starts with / but not //", this rejects backslashes and control
 * characters: browsers treat `/\evil.com` and `/<TAB>/evil.com` as
 * `//evil.com`, which would be an open redirect.
 *
 * Dependency-free: used by the proxy, route handlers and the login form.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const base = "http://localhost";
    if (new URL(raw, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return raw;
}
