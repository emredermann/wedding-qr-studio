import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import { BRAND } from "@/lib/brand";

import "./globals.css";

// latin-ext is required for Turkish letters (ğ, ş, İ, ı).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

const display = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    // Browser tab shows only the brand name; the tagline stays in social previews.
    default: BRAND.name,
    template: `%s · ${BRAND.name}`,
  },
  applicationName: BRAND.name,
  description: BRAND.description,
  openGraph: { siteName: BRAND.name, title: `${BRAND.name} — ${BRAND.tagline}`, description: BRAND.description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f5f0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-clip">
        {children}
        {/* Vercel Web Analytics (page views) + Speed Insights (Core Web Vitals).
            Both are no-ops outside Vercel and send no data in development. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
