import type { Metadata } from "next";

import { InvitationsApp } from "@/components/invitations/InvitationsApp";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t("Davetiye & Oturma") };
}

export default async function InvitationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <InvitationsApp eventId={eventId} />;
}
