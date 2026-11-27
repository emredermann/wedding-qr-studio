import type { Metadata } from "next";
import { Suspense } from "react";

import { EventsDashboard } from "@/components/host/EventsDashboard";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t("Etkinliklerim") };
}

export default function DashboardPage() {
  // EventsDashboard reads ?drive=… (OAuth result) via useSearchParams.
  return (
    <Suspense>
      <EventsDashboard />
    </Suspense>
  );
}
