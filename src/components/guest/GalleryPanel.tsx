"use client";

import { Images, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Lightbox } from "@/components/media/Lightbox";
import { MediaGrid } from "@/components/media/MediaGrid";
import { ZipDownloadButton } from "@/components/media/ZipDownloadButton";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { DownloadableFile } from "@/lib/client/download";
import type { MediaDto, MediaPage, PublicEventDto } from "@/types/domain";

function buildQuery(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** One filter combination; remounted (via `key`) whenever the filter changes. */
function GalleryFeed({
  event,
  category,
  challenge,
  mineOnly,
  extraItems,
  onMessage,
}: {
  event: PublicEventDto;
  category: string | null;
  challenge: string | null;
  mineOnly: boolean;
  extraItems: MediaDto[];
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const [items, setItems] = useState<MediaDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const baseUrl = `/api/events/${encodeURIComponent(event.slug)}/media`;
  const filters = { category, challenge, mine: mineOnly ? "1" : null };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await apiFetch<MediaPage>(`${baseUrl}${buildQuery({ category, challenge, mine: mineOnly ? "1" : null })}`);
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      } catch (error) {
        if (!cancelled) onMessage(errorMessage(error), "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, category, challenge, mineOnly, onMessage]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await apiFetch<MediaPage>(`${baseUrl}${buildQuery({ ...filters, cursor })}`);
      setItems((prev) => [...prev, ...page.items.filter((p) => !prev.some((q) => q.id === p.id))]);
      setCursor(page.nextCursor);
    } catch (error) {
      onMessage(errorMessage(error), "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = [
    ...extraItems.filter(
      (x) =>
        !items.some((i) => i.id === x.id) &&
        (!category || x.category === category) &&
        (!challenge || x.challengeId === challenge) &&
        !x.isGuestbook,
    ),
    ...items,
  ];

  const loadAllForZip = async (): Promise<DownloadableFile[]> => {
    const all: MediaDto[] = [];
    let next: string | null = null;
    do {
      const page: MediaPage = await apiFetch<MediaPage>(`${baseUrl}${buildQuery({ ...filters, cursor: next, limit: "100" })}`);
      all.push(...page.items);
      next = page.nextCursor;
    } while (next);
    return all.map((m) => ({
      fileId: m.fileId,
      name: m.originalName,
      sizeBytes: m.sizeBytes,
      folder: m.category ?? undefined,
      createdAt: m.createdAt,
    }));
  };

  const handleDelete = async (item: MediaDto) => {
    try {
      await apiFetch(`/api/media/${item.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((m) => m.id !== item.id));
      setOpenIndex(null);
      onMessage("Silindi.", "success");
    } catch (error) {
      onMessage(errorMessage(error), "error");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visible.length > 0 && (
        <div className="flex justify-end">
          <ZipDownloadButton
            scope={mineOnly ? "mine" : "gallery"}
            baseName={`${event.slug}${category ? `-${category}` : ""}`}
            label={mineOnly ? "Yüklediklerimi indir" : "Tümünü indir (ZIP)"}
            loadFiles={loadAllForZip}
            onMessage={onMessage}
          />
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center text-stone-500">
          <Images className="h-8 w-8" />
          <p className="text-sm">{mineOnly ? "Henüz bir şey yüklemediniz." : "İlk anıyı siz paylaşın!"}</p>
        </div>
      ) : (
        <MediaGrid items={visible} onOpen={setOpenIndex} />
      )}

      {cursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-medium text-stone-700"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            Daha fazla göster
          </button>
        </div>
      )}

      {openIndex !== null && (
        <Lightbox
          items={visible}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onDelete={visible[openIndex]?.isMine ? handleDelete : undefined}
          challenges={event.challenges}
        />
      )}
    </div>
  );
}

export function GalleryPanel({
  event,
  recentUploads,
  onMessage,
}: {
  event: PublicEventDto;
  recentUploads: MediaDto[];
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(!event.galleryPublic);
  const [challenge, setChallenge] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {!event.galleryPublic && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Bu galeri gizli: yalnızca kendi yüklediklerinizi görebilirsiniz.
        </p>
      )}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {event.galleryPublic && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              mineOnly ? "border-transparent bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"
            }`}
          >
            Yüklediklerim
          </button>
        )}
        {[null, ...event.categories].map((cat) => (
          <button
            key={cat ?? "_all"}
            type="button"
            onClick={() => setCategory(cat)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              category === cat ? "border-transparent text-white" : "border-stone-300 bg-white text-stone-700"
            }`}
            style={category === cat ? { backgroundColor: "var(--accent)" } : undefined}
          >
            {cat ?? "Tümü"}
          </button>
        ))}
      </div>
      {event.challenges.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[null, ...event.challenges].map((c) => {
            const active = challenge === (c?.id ?? null);
            return (
              <button
                key={c?.id ?? "_all"}
                type="button"
                onClick={() => setChallenge(c?.id ?? null)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  active ? "border-stone-900 bg-stone-900 text-white" : "border-dashed border-stone-300 bg-white text-stone-700"
                }`}
              >
                {c ? c.title : "Tüm görevler"}
              </button>
            );
          })}
        </div>
      )}
      <GalleryFeed
        key={`${category ?? "_"}:${challenge ?? "_"}:${mineOnly}`}
        event={event}
        category={category}
        challenge={challenge}
        mineOnly={mineOnly}
        extraItems={recentUploads}
        onMessage={onMessage}
      />
    </div>
  );
}
