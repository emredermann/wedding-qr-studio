"use client";

import { Heart, Images, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { HeartButton } from "@/components/media/HeartButton";
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
  popular,
  mineOnly,
  extraItems,
  guestName,
  onMessage,
}: {
  event: PublicEventDto;
  guestName: string;
  category: string | null;
  challenge: string | null;
  popular: boolean;
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
  const [heartPatches, setHeartPatches] = useState<Record<string, Pick<MediaDto, "heartCount" | "heartedByMe">>>({});
  const onHeart = (id: string, patch: Pick<MediaDto, "heartCount" | "heartedByMe">) =>
    setHeartPatches((prev) => ({ ...prev, [id]: patch }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await apiFetch<MediaPage>(
          `${baseUrl}${buildQuery({ category, challenge, mine: mineOnly ? "1" : null, sort: popular ? "popular" : null })}`,
        );
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
  }, [baseUrl, category, challenge, mineOnly, popular, onMessage]);

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

  const merged = [
    ...(popular ? [] : extraItems).filter(
      (x) =>
        !items.some((i) => i.id === x.id) &&
        (!category || x.category === category) &&
        (!challenge || x.challengeId === challenge) &&
        !x.isGuestbook,
    ),
    ...items,
  ];
  // Heart changes are kept as patches so they survive "load more" and the lightbox.
  const visible = merged.map((m) => (heartPatches[m.id] ? { ...m, ...heartPatches[m.id] } : m));
  const canHeart = (m: MediaDto) => m.status === "approved" && m.kind !== "audio";

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
        <MediaGrid
          items={visible}
          onOpen={setOpenIndex}
          renderOverlay={(m) => (canHeart(m) ? <HeartButton item={m} guestName={guestName} onChange={onHeart} onError={(t) => onMessage(t, "error")} /> : null)}
        />
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
          footer={(m) =>
            canHeart(m) ? (
              <div className="mb-1 flex justify-center">
                <HeartButton item={m} guestName={guestName} variant="lightbox" onChange={onHeart} onError={(t) => onMessage(t, "error")} />
              </div>
            ) : null
          }
        />
      )}
    </div>
  );
}

export function GalleryPanel({
  event,
  recentUploads,
  guestName,
  onMessage,
}: {
  event: PublicEventDto;
  recentUploads: MediaDto[];
  guestName: string;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(!event.galleryPublic);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [popular, setPopular] = useState(false);

  return (
    <div className="space-y-4">
      {!event.galleryPublic && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Bu galeri gizli: yalnızca kendi yüklediklerinizi görebilirsiniz.
        </p>
      )}
      <div className="flex rounded-full border border-stone-200 bg-white p-1 text-xs font-medium" role="group" aria-label="Sıralama">
        {([
          [false, "En yeniler"],
          [true, "En sevilenler"],
        ] as const).map(([value, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={popular === value}
            onClick={() => setPopular(value)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 transition ${
              popular === value ? "bg-stone-900 text-white" : "text-stone-600"
            }`}
          >
            {value && <Heart className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>
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
        guestName={guestName}
        key={`${category ?? "_"}:${challenge ?? "_"}:${mineOnly}:${popular}`}
        event={event}
        category={category}
        challenge={challenge}
        popular={popular}
        mineOnly={mineOnly}
        extraItems={recentUploads}
        onMessage={onMessage}
      />
    </div>
  );
}
