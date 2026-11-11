"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  itemEmoji,
  MAX_CHALLENGES,
  MAX_SCHEDULE_ITEMS,
  newExtraId,
  SCHEDULE_EMOJI_CHOICES,
  scheduleEmoji,
  type Challenge,
  type ScheduleItem,
} from "@/lib/event-extras";
import { useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";

const input = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";

/** Emoji button that opens a small picker; "Otomatik" goes back to the title-based emoji. */
function EmojiPicker({ item, onPick }: { item: ScheduleItem; onPick: (emoji: string | null) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (emoji: string | null) => {
    onPick(emoji);
    setOpen(false);
  };
  const auto = item.title.trim() ? scheduleEmoji(item.title) : "✨";
  const current = item.title.trim() || item.emoji ? itemEmoji(item) : "·";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("Simge: {emoji}. Değiştirmek için tıklayın", { emoji: current })}
        title={t("Simgeyi değiştir")}
        className={`flex h-9 w-full items-center justify-center rounded-xl border text-lg transition hover:bg-stone-100 ${open ? "border-stone-400 bg-stone-100" : "border-stone-200 bg-stone-50"}`}
      >
        {current}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-64 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
          <button
            type="button"
            onClick={() => pick(null)}
            className={`mb-1.5 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs hover:bg-stone-100 ${!item.emoji ? "bg-stone-100 font-semibold text-stone-900" : "text-stone-600"}`}
          >
            <span className="text-base">{auto}</span> {t("Otomatik (başlıktan)")}
          </button>
          <div className="grid grid-cols-7 gap-0.5">
            {SCHEDULE_EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => pick(emoji)}
                aria-label={t("Simge {emoji}", { emoji })}
                aria-pressed={item.emoji === emoji}
                className={`flex h-8 items-center justify-center rounded-lg text-lg hover:bg-stone-100 ${item.emoji === emoji ? "bg-stone-200 ring-1 ring-stone-400" : ""}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Editable list of program items: time + title (+ optional album category). */
export function ScheduleEditor({
  value,
  onChange,
  categories,
}: {
  value: ScheduleItem[];
  onChange: (next: ScheduleItem[]) => void;
  categories: readonly string[];
}) {
  const t = useT();
  const update = (id: string, patch: Partial<ScheduleItem>) => onChange(value.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const add = () => {
    if (value.length >= MAX_SCHEDULE_ITEMS) return;
    const last = value[value.length - 1];
    onChange([...value, { id: newExtraId(), time: last ? last.time : "19:00", title: "", category: null }]);
  };

  return (
    <div className="@container space-y-2">
      {value.length === 0 && <p className="text-xs text-stone-500">{t("Henüz program yok. Örnek: 19:00 Nikah, 20:30 Yemek, 21:30 İlk dans.")}</p>}
      {value.length > 0 && (
        <div aria-hidden className="grid grid-cols-[2.25rem_6.5rem_1fr_auto] gap-2 px-1 text-[11px] font-semibold text-stone-500 @md:grid-cols-[2.25rem_6.5rem_1fr_12.5rem_auto]">
          <span className="text-center">{t("Simge")}</span>
          <span>{t("Saat")}</span>
          <span>{t("Başlık")}</span>
          <span className="hidden @md:block">{t("Albüm kategorisi")}</span>
        </div>
      )}
      {value.map((item) => (
        <div key={item.id} className="grid grid-cols-[2.25rem_6.5rem_1fr_auto] items-center gap-2 @md:grid-cols-[2.25rem_6.5rem_1fr_12.5rem_auto]">
          <EmojiPicker item={item} onPick={(emoji) => update(item.id, { emoji })} />
          <input
            type="time"
            required
            value={item.time}
            onChange={(e) => update(item.id, { time: e.target.value })}
            className={input}
            aria-label={t("Saat")}
          />
          <input
            required
            maxLength={60}
            value={item.title}
            onChange={(e) => update(item.id, { title: e.target.value })}
            placeholder={t("ör. İlk dans")}
            className={input}
            aria-label={t("Başlık")}
          />
          <select
            value={item.category ?? ""}
            onChange={(e) => update(item.id, { category: e.target.value || null })}
            className={`${input} col-span-2 col-start-2 @md:col-span-1 @md:col-start-4 @md:row-start-1`}
            aria-label={t("Albüm kategorisi")}
          >
            <option value="">{t("Albüm kategorisi yok")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x.id !== item.id))}
            className="col-start-4 row-start-1 self-stretch rounded-xl px-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 @md:col-start-5"
            aria-label={t("{name} kaldır", { name: item.title || t("Madde") })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {value.length < MAX_SCHEDULE_ITEMS && (
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:border-stone-500">
          <Plus className="h-3.5 w-3.5" /> {t("Madde ekle")}
        </button>
      )}
      <p className="text-[11px] text-stone-500">{t("Simge başlıktan otomatik seçilir (ör. “Pasta” 🎂, “İlk dans” 💃); değiştirmek için simgeye tıklayın. Kategori seçerseniz, o saatte yükleme yapan misafirlerde bu kategori önceden seçili gelir.")}</p>
    </div>
  );
}

const CHALLENGE_SUGGESTIONS: MsgKey[] = [
  "Gelinle bir selfie",
  "Damatla bir selfie",
  "Dans pistinden bir kare",
  "Masandaki herkes tek karede",
  "Günün en komik anı",
  "En şık misafir",
];

/** Editable list of photo challenges guests can join while uploading. */
export function ChallengesEditor({ value, onChange }: { value: Challenge[]; onChange: (next: Challenge[]) => void }) {
  const t = useT();
  const add = (title = "") => {
    if (value.length >= MAX_CHALLENGES) return;
    onChange([...value, { id: newExtraId(), title }]);
  };
  const used = new Set(value.map((c) => c.title.trim().toLocaleLowerCase("tr-TR")));
  const suggestions = CHALLENGE_SUGGESTIONS.map((key) => t(key)).filter((s) => !used.has(s.toLocaleLowerCase("tr-TR")));

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-xs text-stone-500">{t("Misafirler yüklerken bir göreve katılabilir; galeri görevlere göre filtrelenir.")}</p>}
      {value.map((item) => (
        <div key={item.id} className="flex gap-2">
          <input
            required
            maxLength={80}
            value={item.title}
            onChange={(e) => onChange(value.map((c) => (c.id === item.id ? { ...c, title: e.target.value } : c)))}
            placeholder={t("ör. Dans pistinden bir kare")}
            className={input}
            aria-label={t("Görev")}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((c) => c.id !== item.id))}
            className="rounded-xl px-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label={t("{name} kaldır", { name: item.title || t("Görev") })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {value.length < MAX_CHALLENGES && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => add()} className="inline-flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:border-stone-500">
            <Plus className="h-3.5 w-3.5" /> {t("Görev ekle")}
          </button>
          {suggestions.slice(0, 4).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-xl bg-stone-100 px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-200">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
