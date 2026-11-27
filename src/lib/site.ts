/**
 * Public address of the site for canonical URLs, the sitemap and social
 * previews: NEXT_PUBLIC_APP_URL (custom domain), else Vercel's production
 * domain, else the current default.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "https://miraroll.vercel.app";
}

/**
 * Open Graph / Twitter defaults every page repeats: Next.js replaces (not
 * merges) these objects when a page sets its own, so pages spread these in.
 */
export function socialDefaults(lang: "tr" | "en") {
  // Preview images come from each segment's opengraph-image.tsx file.
  return {
    openGraph: { type: "website" as const, siteName: "Mira", locale: lang === "en" ? "en_US" : "tr_TR" },
    twitter: { card: "summary_large_image" as const },
  };
}
