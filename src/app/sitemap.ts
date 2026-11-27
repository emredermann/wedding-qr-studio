import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/** The public pages worth indexing. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/davetiye`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/iletisim`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
