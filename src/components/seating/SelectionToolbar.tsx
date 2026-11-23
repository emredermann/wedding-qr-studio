"use client";

import { Copy, Minus, Plus, RotateCcw, RotateCw, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";

import { useT } from "@/lib/i18n/provider";
import { SEATING_LIMITS } from "@/lib/seating/schema";

const btn = "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent";

/** Floating toolbar for the selected table or venue block. */
export function SelectionToolbar({
  x,
  y,
  name,
  seats,
  canFill,
  onRename,
  onRotate,
  onSeats,
  onFill,
  onDuplicate,
  onDelete,
}: {
  x: number;
  y: number;
  name: string;
  /** Null for venue blocks (no seats). */
  seats: number | null;
  canFill: boolean;
  onRename: (name: string) => void;
  onRotate: (delta: number) => void;
  onSeats: (delta: number) => void;
  onFill: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  // The parent keys this component by item id, so the draft resets per selection.
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const value = draft.trim().slice(0, 60);
    if (value !== name) onRename(value);
  };

  return (
    <div
      data-export-ignore
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-stone-200 bg-white p-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        maxLength={60}
        aria-label={t("Ad")}
        placeholder={t("Ad")}
        className="h-8 w-28 rounded-lg border border-stone-200 px-2 text-xs outline-none focus:border-stone-500 sm:w-36"
      />
      <span className="mx-0.5 h-5 w-px bg-stone-200" />
      <button type="button" className={btn} onClick={() => onRotate(-15)} title={t("Sola döndür")} aria-label={t("Sola döndür")}>
        <RotateCcw className="h-4 w-4" />
      </button>
      <button type="button" className={btn} onClick={() => onRotate(15)} title={t("Sağa döndür")} aria-label={t("Sağa döndür")}>
        <RotateCw className="h-4 w-4" />
      </button>
      {seats !== null && (
        <>
          <span className="mx-0.5 h-5 w-px bg-stone-200" />
          <button type="button" className={btn} onClick={() => onSeats(-1)} disabled={seats <= SEATING_LIMITS.minSeats} title={t("Sandalye çıkar")} aria-label={t("Sandalye çıkar")}>
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-14 text-center text-xs text-stone-700 tabular-nums" title={t("Sandalye sayısı")}>
            {t("{n} kişi", { n: seats })}
          </span>
          <button type="button" className={btn} onClick={() => onSeats(1)} disabled={seats >= SEATING_LIMITS.maxSeats} title={t("Sandalye ekle")} aria-label={t("Sandalye ekle")}>
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" className={btn} onClick={onFill} disabled={!canFill} title={t("Boş sandalyeleri yerleşmemiş misafirlerle doldur")} aria-label={t("Boş sandalyeleri yerleşmemiş misafirlerle doldur")}>
            <Wand2 className="h-4 w-4" />
          </button>
        </>
      )}
      <span className="mx-0.5 h-5 w-px bg-stone-200" />
      <button type="button" className={btn} onClick={onDuplicate} title={t("Kopyala")} aria-label={t("Kopyala")}>
        <Copy className="h-4 w-4" />
      </button>
      <button type="button" className={`${btn} text-red-600 hover:bg-red-50`} onClick={onDelete} title={t("Sil")} aria-label={t("Sil")}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
