import type { Metadata } from "next";

import { InviteGuestApp } from "@/components/invitations/InviteGuestApp";
import { getServerT } from "@/lib/i18n/server";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  // Personal links: never indexed, and no names in link previews.
  return { title: t("Davetiye"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  return <InviteGuestApp token={token} />;
}
