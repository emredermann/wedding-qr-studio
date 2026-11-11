"use client";

import { Camera, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { formatMinutes, programPhase, scheduleEmoji, type ProgramPhase, type ScheduleItem } from "@/lib/event-extras";

/** Re-renders once a minute so "now" / "next" follow the clock on the event day. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function headline(phase: ProgramPhase, schedule: ScheduleItem[]) {
  const find = (id: string) => schedule.find((item) => item.id === id)!;
  switch (phase.kind) {
    case "countdown":
      return {
        emoji: phase.days === 1 ? "🥳" : "⏳",
        eyebrow: "Program",
        title: phase.days === 1 ? "Büyük gün yarın!" : `Büyük güne ${phase.days} gün kaldı`,
        chip: `${schedule.length} durak`,
      };
    case "warmup": {
      const next = find(phase.nextId);
      return { emoji: "🎈", eyebrow: "Birazdan başlıyoruz", title: `${scheduleEmoji(next.title)} ${next.title}`, chip: formatMinutes(phase.minutesToNext) };
    }
    case "live": {
      const current = find(phase.currentId);
      const next = find(phase.nextId);
      return {
        emoji: scheduleEmoji(current.title),
        eyebrow: "Şimdi",
        title: current.title,
        chip: null,
        sub: `Sıradaki ${scheduleEmoji(next.title)} ${next.title} · ${formatMinutes(phase.minutesToNext)}`,
      };
    }
    case "finale": {
      const current = find(phase.currentId);
      return { emoji: scheduleEmoji(current.title), eyebrow: "Son durak", title: current.title, chip: null, sub: "Gece daha bitmedi 🎉" };
    }
    default:
      return {
        emoji: "🗓️",
        eyebrow: "Program",
        title: `${scheduleEmoji(schedule[0].title)} ${schedule[0].time} ${schedule[0].title}`,
        chip: schedule.length > 1 ? `+${schedule.length - 1}` : null,
      };
  }
}

/**
 * Guest program card: a "now playing" header (live countdown + progress to the
 * next item on the event day) that expands into an emoji timeline. Hidden when
 * the host set no schedule.
 */
export function ScheduleCard({
  schedule,
  eventDate,
  onShareMoment,
}: {
  schedule: ScheduleItem[];
  eventDate: string | null;
  /** Opens the upload screen (the current item's category is preselected there). */
  onShareMoment?: () => void;
}) {
  const now = useMinuteClock();
  const [open, setOpen] = useState(false);
  if (schedule.length === 0) return null;

  const phase = programPhase(schedule, eventDate, now);
  const head = headline(phase, schedule);
  const onAir = phase.kind === "live" || phase.kind === "finale";
  const currentId = onAir ? phase.currentId : null;
  const currentIndex = currentId ? schedule.findIndex((item) => item.id === currentId) : -1;

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-xl" aria-hidden>
          {head.emoji}
          {onAir && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping" style={{ backgroundColor: "var(--accent)" }} />
              <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white" style={{ backgroundColor: "var(--accent)" }} />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold tracking-wide text-stone-500 uppercase" style={onAir ? { color: "var(--accent)" } : undefined}>
            {head.eyebrow}
          </span>
          <span className="block truncate text-sm font-medium text-stone-900">{head.title}</span>
          {head.sub && <span className="block truncate text-xs text-stone-500">{head.sub}</span>}
        </span>
        {head.chip && <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium tabular-nums text-stone-700">{head.chip}</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {phase.kind === "live" && (
        <div className="h-1 bg-stone-100" role="progressbar" aria-label="Sıradaki etkinliğe kalan süre" aria-valuenow={Math.round(phase.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full transition-[width] duration-1000" style={{ width: `${phase.progress * 100}%`, backgroundColor: "var(--accent)" }} />
        </div>
      )}

      {open && (
        <ol className="relative border-t border-stone-100 px-4 py-3">
          {schedule.map((item, index) => {
            const isCurrent = item.id === currentId;
            const isPast = currentIndex >= 0 && index < currentIndex;
            const isNext = (phase.kind === "live" || phase.kind === "warmup") && item.id === phase.nextId;
            const last = index === schedule.length - 1;
            return (
              <li key={item.id} className="relative flex gap-3 pb-1">
                {/* Rail: emoji bubble + connector line. */}
                <span className="flex w-9 shrink-0 flex-col items-center">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-base transition ${isCurrent ? "scale-110 text-white shadow-md" : isPast ? "bg-stone-100 opacity-50 grayscale" : "bg-stone-100"}`}
                    style={isCurrent ? { backgroundColor: "var(--accent)" } : undefined}
                    aria-hidden
                  >
                    {isPast ? "✓" : scheduleEmoji(item.title)}
                  </span>
                  {!last && <span className={`my-1 w-0.5 flex-1 rounded-full ${isPast || isCurrent ? "" : "bg-stone-200"}`} style={isPast || isCurrent ? { backgroundColor: "var(--accent)", opacity: 0.4 } : undefined} />}
                </span>
                <div className={`min-w-0 flex-1 pt-1.5 ${last ? "" : "pb-3"} ${isPast ? "text-stone-400" : "text-stone-800"}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs tabular-nums text-stone-500">{item.time}</span>
                    <span className={`text-sm ${isCurrent ? "font-semibold" : ""} ${isPast ? "line-through decoration-stone-300" : ""}`}>{item.title}</span>
                    {isCurrent && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white uppercase" style={{ backgroundColor: "var(--accent)" }}>
                        şimdi
                      </span>
                    )}
                    {isNext && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">sıradaki · {formatMinutes(phase.minutesToNext)}</span>}
                  </div>
                  {isCurrent && onShareMoment && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onShareMoment();
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                      style={{ backgroundColor: "var(--accent)" }}
                    >
                      <Camera className="h-3.5 w-3.5" /> Bu anı paylaş
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
