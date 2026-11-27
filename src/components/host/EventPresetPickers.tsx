"use client";

import { Check } from "lucide-react";

import { PresetIcon } from "@/components/event/PresetIcon";
import { EVENT_PRESETS, EVENT_TYPES, THEME_IDS, THEMES, type EventType, type ThemeId } from "@/lib/event-presets";
import { useT } from "@/lib/i18n/provider";

/** Selectable cards for the event type (Düğün / Kurumsal / Parti / Diğer). */
export function EventTypePicker({
  value,
  onChange,
  compact = false,
}: {
  value: EventType | null;
  onChange: (type: EventType) => void;
  /** Hide the one-line descriptions (narrow sidebars). */
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("Etkinlik türü")} className="grid grid-cols-2 gap-2">
      {EVENT_TYPES.map((type) => {
        const preset = EVENT_PRESETS[type];
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(type)}
            className={`relative flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition ${
              active ? "border-stone-900 bg-stone-50 ring-1 ring-stone-900" : "border-stone-200 bg-white hover:border-stone-400"
            }`}
          >
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"}`}>
              <PresetIcon eventType={type} className="h-4 w-4" />
            </span>
            <span className="text-sm leading-tight font-medium text-stone-900">{t(preset.label)}</span>
            {!compact && <span className="text-[11px] leading-snug text-stone-500">{t(preset.blurb)}</span>}
            {active && <Check className="absolute top-2.5 right-2.5 h-4 w-4 text-stone-900" />}
          </button>
        );
      })}
    </div>
  );
}

/** One-click guest themes: palette preview + name. */
export function ThemeSwatches({ value, onChange }: { value: ThemeId; onChange: (theme: ThemeId) => void }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("Tema")} className="grid grid-cols-4 gap-2">
      {THEME_IDS.map((id) => {
        const theme = THEMES[id];
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border p-1.5 text-[11px] font-medium transition ${
              active ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200 hover:border-stone-400"
            }`}
          >
            <span className="relative flex h-10 w-full items-end justify-center overflow-hidden rounded-lg" style={{ backgroundColor: theme.scale["50"] }} aria-hidden>
              <span className="mb-1.5 h-4 w-3/4 rounded-md" style={{ backgroundColor: theme.surface, border: `1px solid ${theme.scale["200"]}` }} />
              <span className="absolute top-1.5 left-1.5 h-3 w-3 rounded-full" style={{ backgroundColor: theme.accent }} />
              <span
                className="absolute top-1 right-1.5 text-[11px] leading-none"
                style={{ color: theme.scale["900"], fontFamily: theme.heading === "display" ? "var(--font-display), Georgia, serif" : "inherit" }}
              >
                Aa
              </span>
            </span>
            <span className={active ? "text-stone-900" : "text-stone-600"}>{t(theme.name)}</span>
          </button>
        );
      })}
    </div>
  );
}
