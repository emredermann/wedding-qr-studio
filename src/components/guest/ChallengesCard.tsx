"use client";

import { Camera, Check, ChevronDown, Target } from "lucide-react";
import { useState } from "react";

import type { Challenge } from "@/lib/event-extras";
import { useT } from "@/lib/i18n/provider";

/**
 * Guest "Görevler" card: the event's photo challenges as a checklist. Picking
 * one opens the upload screen with that challenge preselected. Challenges the
 * guest has already shot (this visit) are ticked off.
 *
 * `prominent` (presets that lead with tasks) shows the list open with a short
 * pitch; otherwise it starts collapsed under the schedule.
 */
export function ChallengesCard({
  challenges,
  doneIds,
  prominent,
  onPick,
}: {
  challenges: Challenge[];
  doneIds: ReadonlySet<string>;
  prominent: boolean;
  onPick: (challengeId: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(prominent);
  if (challenges.length === 0) return null;
  const done = challenges.filter((c) => doneIds.has(c.id)).length;
  const allDone = done === challenges.length;

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-stone-200 bg-surface">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: "var(--accent)" }} aria-hidden>
          <Target className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{t("Görevler")}</span>
          <span className="block truncate text-sm font-medium text-stone-900">
            {allDone ? t("Hepsini tamamladınız! 🎉") : prominent ? t("Bir görev seçin, anı yakalayın") : t("{n} fotoğraf görevi", { n: challenges.length })}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium tabular-nums text-stone-700">
          {done}/{challenges.length}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      <div className="h-1 bg-stone-100" role="progressbar" aria-label={t("Tamamlanan görevler")} aria-valuenow={done} aria-valuemin={0} aria-valuemax={challenges.length}>
        <div className="h-full transition-[width] duration-500" style={{ width: `${(done / challenges.length) * 100}%`, backgroundColor: "var(--accent)" }} />
      </div>

      {open && (
        <ul className="divide-y divide-stone-100 border-t border-stone-100">
          {challenges.map((c) => {
            const isDone = doneIds.has(c.id);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => onPick(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${isDone ? "border-transparent text-white" : "border-stone-300 text-stone-400"}`}
                    style={isDone ? { backgroundColor: "var(--accent)" } : undefined}
                    aria-hidden
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Camera className="h-3.5 w-3.5" />}
                  </span>
                  <span className={`min-w-0 flex-1 text-sm ${isDone ? "text-stone-500" : "text-stone-800"}`}>{c.title}</span>
                  <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--accent)" }}>
                    {isDone ? t("Bir tane daha") : t("Katıl")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
