/**
 * Table number from the guest's QR card (`/e/<slug>?table=5`). Remembered per
 * event in localStorage, so it survives reloads and the guest opening the
 * plain link later. Returns null when unknown.
 */
const storageKey = (slug: string) => `eqr:table:${slug}`;

export function parseTableParam(value: string | null | undefined): number | null {
  return value && /^\d{1,4}$/.test(value) ? Number(value) : null;
}

export function resolveGuestTable(slug: string): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = parseTableParam(params.get("table") ?? params.get("masa"));
  try {
    if (fromUrl !== null) {
      window.localStorage.setItem(storageKey(slug), String(fromUrl));
      return fromUrl;
    }
    return parseTableParam(window.localStorage.getItem(storageKey(slug)));
  } catch {
    return fromUrl;
  }
}
