import type { Metadata } from "next";

import { LiveWall } from "@/components/live/LiveWall";

export const metadata: Metadata = { title: "Canlı Düğün Ekranı", robots: { index: false, follow: false } };

export default async function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LiveWall slug={slug} />;
}
