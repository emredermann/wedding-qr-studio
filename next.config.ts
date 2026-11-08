import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGithubPages
  ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "/wedding-qr-studio")
  : "";

const nextConfig: NextConfig = isGithubPages
  ? {
      output: "export",
      trailingSlash: true,
      basePath,
      images: {
        unoptimized: true,
      },
      turbopack: {
        rules: {
          "*.css": {
            loaders: ["@tailwindcss/turbopack"],
            as: "*.css",
          },
        },
      },
    }
  : {
      cacheComponents: true,
      partialPrefetching: true,
      images: {
        remotePatterns: [
          { protocol: "https", hostname: "images.unsplash.com" },
          { protocol: "https", hostname: "**.r2.dev" },
          { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
        ],
      },
      async headers() {
        return [
          {
            source: "/(.*)",
            headers: [
              { key: "X-Content-Type-Options", value: "nosniff" },
              { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
              {
                key: "Permissions-Policy",
                value: "camera=(self), microphone=(self), geolocation=()",
              },
            ],
          },
        ];
      },
      turbopack: {
        rules: {
          "*.css": {
            loaders: ["@tailwindcss/turbopack"],
            as: "*.css",
          },
        },
      },
    };

export default nextConfig;
