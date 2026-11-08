"use client";

import { Clock, EyeOff, Mic, Play } from "lucide-react";
import { useState } from "react";

import { mediaImageSrc } from "@/lib/media-urls";
import type { MediaDto } from "@/types/domain";

export function MediaThumb({ item, size = 600, className = "" }: { item: MediaDto; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (item.kind === "audio") {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-stone-800 to-stone-950 p-3 text-center text-stone-100 ${className}`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
          <Mic className="h-5 w-5" />
        </span>
        <span className="line-clamp-2 text-[11px] font-medium leading-tight">{item.guestName ?? "Sesli mesaj"}</span>
        <StatusBadge status={item.status} />
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full overflow-hidden bg-stone-200 ${className}`}>
      {!failed ? (
        <img
          src={mediaImageSrc(item, size)}
          alt={item.note ?? item.originalName}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-stone-800 text-[11px] text-stone-300">
          {item.kind === "video" ? "Video işleniyor…" : "Önizleme hazırlanıyor…"}
        </div>
      )}
      {item.kind === "video" && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          </span>
        </span>
      )}
      <span className="absolute top-1.5 left-1.5">
        <StatusBadge status={item.status} />
      </span>
    </div>
  );
}

export function StatusBadge({ status }: { status: MediaDto["status"] }) {
  if (status === "approved") return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        status === "pending" ? "bg-amber-400 text-amber-950" : "bg-stone-900/80 text-stone-100"
      }`}
    >
      {status === "pending" ? <Clock className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      {status === "pending" ? "Onay bekliyor" : "Gizli"}
    </span>
  );
}
