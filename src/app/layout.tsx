import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Wedding QR — Ücretsiz düğün fotoğraf paylaşımı",
    template: "%s · Wedding QR",
  },
  applicationName: "Wedding QR",
  description:
    "Misafirler QR kodu okutur, fotoğraf ve videolarını uygulama indirmeden orijinal kalitede çiftin Google Drive’ına yükler. Yüz tanıma, canlı ekran, anı defteri ve masa kartı tasarlayıcı — tamamen ücretsiz.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141210",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">{children}</body>
    </html>
  );
}
