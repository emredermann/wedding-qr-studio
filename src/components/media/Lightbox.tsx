"use client";

import { ChevronLeft, ChevronRight, Download, Loader2, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { downloadOriginal } from "@/lib/client/download";
import { formatBytes } from "@/lib/media-config";
import { FULL_IMAGE_SIZE, mediaImageSrc, streamUrl } from "@/lib/media-urls";
import type { MediaDto } from "@/types/domain";

export function Lightbox({
  items,
  index,
  onClose,
  onIndexChange,
  onDelete,
  footer,
}: {
  items: MediaDto[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onDelete?: (item: MediaDto) => Promise<void> | void;
  footer?: (item: MediaDto) => React.ReactNode;
}) {
  const item = items[index];
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const touchStart = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      onIndexChange((index + delta + items.length) % items.length);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [go, onClose]);

  if (!item) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadOriginal({ fileId: item.fileId, name: item.originalName, sizeBytes: item.sizeBytes });
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm("Bu dosya silinsin mi?")) return;
    setDeleting(true);
    try {
      await onDelete(item);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Medya görüntüleyici"
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white"
      onTouchStart={(e) => (touchStart.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        const end = e.changedTouches[0]?.clientX;
        if (start !== null && end !== undefined && Math.abs(end - start) > 60) go(end < start ? 1 : -1);
        touchStart.current = null;
      }}
    >
      <div className="wqr-safe-top flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0 text-xs text-white/70">
          <p className="truncate font-medium text-white">{item.guestName ?? "Misafir"}</p>
          <p className="truncate">
            {new Date(item.createdAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}
            {item.category ? ` · ${item.category}` : ""} · {formatBytes(item.sizeBytes)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onDelete && (
            <button type="button" onClick={handleDelete} disabled={deleting} aria-label="Sil" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
              {deleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
            </button>
          )}
          <button type="button" onClick={handleDownload} disabled={downloading} aria-label="Orijinal kalitede indir" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
            {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Kapat" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {item.kind === "photo" && (
          <img
            key={item.id}
            src={mediaImageSrc(item, FULL_IMAGE_SIZE)}
            alt={item.note ?? item.originalName}
            referrerPolicy="no-referrer"
            className="max-h-full max-w-full object-contain"
          />
        )}
        {item.kind === "video" && (
          <video key={item.id} src={streamUrl(item.fileId)} controls playsInline autoPlay className="max-h-full max-w-full" />
        )}
        {item.kind === "audio" && (
          <div className="w-full max-w-md rounded-2xl bg-white/10 p-6 text-center">
            <p className="mb-4 font-serif text-lg">{item.guestName ?? "Misafir"} bir sesli mesaj bıraktı</p>
            <audio key={item.id} src={streamUrl(item.fileId)} controls autoPlay className="w-full" />
          </div>
        )}
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Önceki" className="absolute top-1/2 left-2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:flex">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Sonraki" className="absolute top-1/2 right-2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:flex">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      <div className="wqr-safe-bottom px-4 pt-2 text-center text-sm text-white/80">
        {item.note && <p className="mx-auto max-w-xl italic">“{item.note}”</p>}
        {footer?.(item)}
        <p className="mt-1 text-[11px] text-white/40">
          {index + 1} / {items.length}
        </p>
      </div>
    </div>
  );
}
