import type { Metadata } from "next";

import { HostEventApp } from "@/components/host/HostEventApp";

export const metadata: Metadata = { title: "Etkinlik Yönetimi" };

export default async function HostEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <HostEventApp eventId={eventId} />;
}
