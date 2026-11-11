"use client";

import { Plus, X } from "lucide-react";

import { MAX_CHALLENGES, MAX_SCHEDULE_ITEMS, newExtraId, scheduleEmoji, type Challenge, type ScheduleItem } from "@/lib/event-extras";

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
        <div key={item.id} className="grid grid-cols-[1.75rem_6.5rem_1fr_auto] items-center gap-2 @md:grid-cols-[1.75rem_6.5rem_1fr_9rem_auto]">
          <span className="text-center text-lg" title="Misafirlerin göreceği simge (başlıktan seçilir)" aria-hidden>
            {item.title.trim() ? scheduleEmoji(item.title) : "·"}
          </span>
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
            className={`${input} col-span-2 col-start-2 @md:col-span-1 @md:col-start-4 @md:row-start-1`}
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
            className="col-start-4 row-start-1 self-stretch rounded-xl px-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 @md:col-start-5"
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
      <p className="text-[11px] text-stone-500">Simge başlıktan otomatik seçilir (ör. “Pasta” 🎂, “İlk dans” 💃). Kategori seçerseniz, o saatte yükleme yapan misafirlerde bu kategori önceden seçili gelir.</p>
    </div>
  );
}

const CHALLENGE_SUGGESTIONS = [
  "Gelinle bir selfie",
  "Damatla bir selfie",
  "Dans pistinden bir kare",
  "Masandaki herkes tek karede",
  "Günün en komik anı",
  "En şık misafir",
];

/** Editable list of photo challenges guests can join while uploading. */
export function ChallengesEditor({ value, onChange }: { value: Challenge[]; onChange: (next: Challenge[]) => void }) {
  const add = (title = "") => {
    if (value.length >= MAX_CHALLENGES) return;
    onChange([...value, { id: newExtraId(), title }]);
  };
  const used = new Set(value.map((c) => c.title.trim().toLocaleLowerCase("tr-TR")));
  const suggestions = CHALLENGE_SUGGESTIONS.filter((s) => !used.has(s.toLocaleLowerCase("tr-TR")));

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-xs text-stone-500">Misafirler yüklerken bir göreve katılabilir; galeri görevlere göre filtrelenir.</p>}
      {value.map((item) => (
        <div key={item.id} className="flex gap-2">
          <input
            required
            maxLength={80}
            value={item.title}
            onChange={(e) => onChange(value.map((c) => (c.id === item.id ? { ...c, title: e.target.value } : c)))}
            placeholder="ör. Dans pistinden bir kare"
            className={input}
            aria-label="Görev"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((c) => c.id !== item.id))}
            className="rounded-xl px-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label={`${item.title || "Görev"} kaldır`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {value.length < MAX_CHALLENGES && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => add()} className="inline-flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:border-stone-500">
            <Plus className="h-3.5 w-3.5" /> Görev ekle
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
