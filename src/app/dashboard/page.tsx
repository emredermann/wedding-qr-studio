import type { Metadata } from "next";

import { EventsDashboard } from "@/components/host/EventsDashboard";

export const metadata: Metadata = { title: "Etkinliklerim" };

export default function DashboardPage() {
  return <EventsDashboard />;
}
