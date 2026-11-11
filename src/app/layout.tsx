import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import { BRAND } from "@/lib/brand";
import { LanguageProvider } from "@/lib/i18n/provider";
import { getServerLang, getServerT } from "@/lib/i18n/server";

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

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  const description = t(BRAND.description);
  return {
    title: {
      // Browser tab shows only the brand name; the tagline stays in social previews.
      default: BRAND.name,
      template: `%s · ${BRAND.name}`,
    },
    applicationName: BRAND.name,
    description,
    openGraph: { siteName: BRAND.name, title: `${BRAND.name} — ${t(BRAND.tagline)}`, description },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f5f0",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The language cookie is read on every request, so pages render in the
  // visitor's language from the first byte (Turkish by default).
  const lang = await getServerLang();
  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-clip">
        <LanguageProvider initialLang={lang}>{children}</LanguageProvider>
        {/* Vercel Web Analytics (page views) + Speed Insights (Core Web Vitals).
            Both are no-ops outside Vercel and send no data in development. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
