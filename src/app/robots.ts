import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/** Public marketing pages are crawlable; dashboards, APIs and private guest / invitation links are not. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api/", "/login", "/auth/", "/e/", "/d/", "/zz-preview"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
