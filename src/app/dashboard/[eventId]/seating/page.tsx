import type { Metadata } from "next";

import { SeatingPlannerApp } from "@/components/seating/SeatingPlannerApp";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t("Oturma Planı") };
}

export default async function SeatingPlannerPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <SeatingPlannerApp eventId={eventId} />;
}
