import { redirect } from "next/navigation";

/** The seating plan moved into the Invitations module; old links keep working. */
export default async function OldSeatingPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/dashboard/${encodeURIComponent(eventId)}/davetiye/oturma`);
}
