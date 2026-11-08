import type { Metadata } from "next";
import { Suspense } from "react";

import { EventsDashboard } from "@/components/host/EventsDashboard";

export const metadata: Metadata = { title: "Etkinliklerim" };

export default function DashboardPage() {
  // EventsDashboard reads ?drive=… (OAuth result) via useSearchParams.
  return (
    <Suspense>
      <EventsDashboard />
    </Suspense>
  );
}
