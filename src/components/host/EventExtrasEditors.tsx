"use client";

import { Plus, X } from "lucide-react";

import { MAX_SCHEDULE_ITEMS, newExtraId, type ScheduleItem } from "@/lib/event-extras";

const input = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";

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
  const update = (id: string, patch: Partial<ScheduleItem>) => onChange(value.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const add = () => {
    if (value.length >= MAX_SCHEDULE_ITEMS) return;
    const last = value[value.length - 1];
    onChange([...value, { id: newExtraId(), time: last ? last.time : "19:00", title: "", category: null }]);
  };

  return (
    <div className="@container space-y-2">
      {value.length === 0 && <p className="text-xs text-stone-500">Henüz program yok. Örnek: 19:00 Nikah, 20:30 Yemek, 21:30 İlk dans.</p>}
      {value.map((item) => (
        <div key={item.id} className="grid grid-cols-[6.5rem_1fr_auto] gap-2 @md:grid-cols-[6.5rem_1fr_9rem_auto]">
          <input
            type="time"
            required
            value={item.time}
            onChange={(e) => update(item.id, { time: e.target.value })}
            className={input}
            aria-label="Saat"
          />
          <input
            required
            maxLength={60}
            value={item.title}
            onChange={(e) => update(item.id, { title: e.target.value })}
            placeholder="ör. İlk dans"
            className={input}
            aria-label="Başlık"
          />
          <select
            value={item.category ?? ""}
            onChange={(e) => update(item.id, { category: e.target.value || null })}
            className={`${input} col-span-2 @md:col-span-1 @md:col-start-3 @md:row-start-1`}
            aria-label="Albüm kategorisi"
          >
            <option value="">Kategori yok</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x.id !== item.id))}
            className="row-start-1 rounded-xl px-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 @md:col-start-4"
            aria-label={`${item.title || "Madde"} kaldır`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {value.length < MAX_SCHEDULE_ITEMS && (
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:border-stone-500">
          <Plus className="h-3.5 w-3.5" /> Madde ekle
        </button>
      )}
      <p className="text-[11px] text-stone-500">Kategori seçerseniz, o saatte yükleme yapan misafirlerde bu kategori önceden seçili gelir.</p>
    </div>
  );
}
