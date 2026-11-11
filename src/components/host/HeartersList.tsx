"use client";

import { ChevronDown, Heart, Loader2 } from "lucide-react";
import { useState } from "react";

import { apiFetch, errorMessage } from "@/lib/client/api";
import type { MediaDto, MediaHeartsDto } from "@/types/domain";

/** Lightbox footer: "❤️ 12 · Beğenenler" → names (or an anonymous count). */
export function HeartersList({ eventId, item }: { eventId: string; item: MediaDto }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MediaHeartsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (item.heartCount <= 0) return null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || data || loading) return;
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<MediaHeartsDto>(`/api/host/events/${eventId}/media/${item.id}/hearts`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col items-center">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
      >
        <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
        <span className="tabular-nums">{item.heartCount}</span> · Beğenenler
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 max-h-48 w-full max-w-sm overflow-y-auto rounded-2xl bg-black/50 p-3 text-left text-xs text-white/90 backdrop-blur">
          {loading && <Loader2 className="mx-auto h-4 w-4 animate-spin" />}
          {error && <p className="text-rose-300">{error}</p>}
          {data && (
            <>
              {!data.named && (
                <p className="text-white/70">Beğeniler anonim. Adları görmek için Ayarlar’da “Beğenenlerin adını göster”i açın.</p>
              )}
              {data.people.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {data.people.map((p, i) => (
                    <li key={`${p.name}-${i}`} className="rounded-full bg-white/15 px-2.5 py-1">
                      {p.name}
                    </li>
                  ))}
                </ul>
              )}
              {data.named && data.anonymousCount > 0 && (
                <p className={`text-white/60 ${data.people.length ? "mt-2" : ""}`}>+ {data.anonymousCount} anonim misafir</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
