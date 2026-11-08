import type { Metadata } from "next";

import { GuestApp } from "@/components/guest/GuestApp";
import { findEventBySlug } from "@/lib/events";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const event = await findEventBySlug(slug);
    if (event) {
      const name = event.couple_names || event.title;
      return {
        title: name,
        description: `${name} etkinliğinden fotoğraf, video ve anılarınızı paylaşın.`,
        robots: { index: false, follow: false },
        openGraph: { title: `${name} · Anılarımızı paylaşın`, description: "Uygulama indirmeden, tek dokunuşla yükleyin." },
      };
    }
  } catch {
    // Metadata is best-effort; the page itself reports configuration errors.
  }
  return { title: "Etkinlik Albümü", robots: { index: false, follow: false } };
}

export default async function GuestPage({ params }: Props) {
  const { slug } = await params;
  return <GuestApp slug={slug} />;
}
