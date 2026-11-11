"use client";

import { ChevronDown, Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { scheduleStatus, type ScheduleItem } from "@/lib/event-extras";

/** Re-renders once a minute so "now" / "next" follow the clock on the event day. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** Collapsible program card on the guest page; hidden when the host set no schedule. */
export function ScheduleCard({ schedule, eventDate }: { schedule: ScheduleItem[]; eventDate: string | null }) {
  const now = useMinuteClock();
  const [open, setOpen] = useState(false);
  if (schedule.length === 0) return null;

  const status = scheduleStatus(schedule, eventDate, now);
  const current = schedule.find((item) => item.id === status.currentId) ?? null;
  const next = schedule.find((item) => item.id === status.nextId) ?? null;

  let summary: string;
  if (status.today && current) summary = `Şimdi: ${current.title}${next ? ` · Sıradaki ${next.time} ${next.title}` : ""}`;
  else if (status.today && next) summary = `Sıradaki: ${next.time} ${next.title}`;
  else summary = `${schedule[0].time} ${schedule[0].title}${schedule.length > 1 ? ` ve ${schedule.length - 1} madde daha` : ""}`;

  return (
    <section className="mb-5 rounded-3xl border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Clock className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-stone-500">Program</span>
          <span className="block truncate text-sm text-stone-900">{summary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ol className="border-t border-stone-100 px-4 py-2">
          {schedule.map((item, index) => {
            const isCurrent = item.id === status.currentId;
            const currentIndex = schedule.findIndex((x) => x.id === status.currentId);
            const isPast = status.today && currentIndex >= 0 && index < currentIndex;
            return (
              <li key={item.id} className={`flex items-baseline gap-4 py-2 text-sm ${isPast ? "text-stone-400" : "text-stone-800"}`}>
                <span className="w-12 shrink-0 tabular-nums text-stone-500">{item.time}</span>
                <span className={isCurrent ? "font-semibold" : undefined} style={isCurrent ? { color: "var(--accent)" } : undefined}>
                  {item.title}
                  {isCurrent && <span className="ml-2 text-xs font-normal text-stone-500">şimdi</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
