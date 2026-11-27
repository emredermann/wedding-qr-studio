import type { Metadata } from "next";

import { HostEventApp } from "@/components/host/HostEventApp";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t("Etkinlik Yönetimi") };
}

export default async function HostEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <HostEventApp eventId={eventId} />;
}
