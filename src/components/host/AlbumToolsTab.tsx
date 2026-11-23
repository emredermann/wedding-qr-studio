"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { HighlightsPanel } from "@/components/host/HighlightsPanel";
import { PhotobookPanel } from "@/components/host/PhotobookPanel";
import { ReportPanel } from "@/components/host/ReportPanel";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { HostEventDto, MediaDto, MediaPage } from "@/types/domain";

/** "Öne Çıkanlar & Rapor": highlights video, photobook (Pro) and attendance report. */
export function AlbumToolsTab({ event }: { event: HostEventDto }) {
  const [photos, setPhotos] = useState<MediaDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Most-hearted approved photos first (up to 60).
    apiFetch<MediaPage>(`/api/host/events/${event.id}/media?sort=popular&status=approved&kind=photo`)
      .then((res) => {
        if (!cancelled) setPhotos(res.items.filter((m) => !m.isGuestbook));
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  return (
    <div className="space-y-6">
      {error && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {!photos && !error ? (
        <div className="flex justify-center py-16 text-stone-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        photos && (
          <>
            <HighlightsPanel event={event} photos={photos} />
            <PhotobookPanel event={event} photos={photos} />
          </>
        )
      )}
      <ReportPanel event={event} />
    </div>
  );
}
