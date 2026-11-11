"use client";

import { Heart } from "lucide-react";
import { useState } from "react";

import { apiFetch, errorMessage } from "@/lib/client/api";
import type { MediaDto } from "@/types/domain";

/**
 * Guest heart toggle. Optimistic: the count changes immediately and is rolled
 * back if the server refuses. `onChange` reports the confirmed state upward.
 */
export function HeartButton({
  item,
  onChange,
  onError,
  variant = "grid",
}: {
  item: MediaDto;
  onChange: (id: string, patch: Pick<MediaDto, "heartCount" | "heartedByMe">) => void;
  onError?: (message: string) => void;
  variant?: "grid" | "lightbox";
}) {
  const [busy, setBusy] = useState(false);
  const hearted = Boolean(item.heartedByMe);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const before = { heartCount: item.heartCount, heartedByMe: hearted };
    onChange(item.id, { heartCount: Math.max(0, item.heartCount + (hearted ? -1 : 1)), heartedByMe: !hearted });
    try {
      const res = await apiFetch<{ hearted: boolean; heartCount: number }>(`/api/media/${item.id}/heart`, { method: "POST" });
      onChange(item.id, { heartCount: res.heartCount, heartedByMe: res.hearted });
    } catch (error) {
      onChange(item.id, before);
      onError?.(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const label = hearted ? "Kalbi geri al" : "Kalp bırak";
  if (variant === "lightbox") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={hearted}
        aria-label={label}
        className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
      >
        <Heart className={`h-5 w-5 transition ${hearted ? "scale-110 fill-rose-500 text-rose-500" : ""}`} />
        <span className="tabular-nums">{item.heartCount}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hearted}
      aria-label={label}
      className="absolute right-1 bottom-1 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] text-white backdrop-blur-sm"
    >
      <Heart className={`h-3.5 w-3.5 ${hearted ? "fill-rose-500 text-rose-500" : ""}`} />
      {item.heartCount > 0 && <span className="tabular-nums">{item.heartCount}</span>}
    </button>
  );
}
