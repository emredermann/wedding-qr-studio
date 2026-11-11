import type { Metadata } from "next";

import { LiveWall } from "@/components/live/LiveWall";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t("Canlı Etkinlik Ekranı"), robots: { index: false, follow: false } };
}

export default async function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LiveWall slug={slug} />;
}
