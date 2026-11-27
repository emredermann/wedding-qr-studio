"use client";

import { MapPin } from "lucide-react";

import { SCRIPT_FAMILY } from "@/lib/card-fonts";
import { useLang, useT } from "@/lib/i18n/provider";
import type { InvitationEventDto, InviteDesign } from "@/lib/invitations/model";

/**
 * The invitation itself, as guests see it. Also the live preview in the host
 * editor. `greeting` personalises the first line ("Sevgili Ayşe Yılmaz,").
 */
export function InvitationCard({ design, event, greeting }: { design: InviteDesign; event: InvitationEventDto; greeting: string | null }) {
  const t = useT();
  const { locale } = useLang();
  const accent = design.accent || event.themeColor || "#7f6d51";
  const names = design.names || event.coupleNames || event.title;
  const dateText =
    design.dateText ||
    (event.eventDate
      ? new Date(`${event.eventDate}T12:00:00`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "");
  const script = design.style === "script";
  const modern = design.style === "modern";

  return (
    <article
      className={`relative mx-auto w-full max-w-md overflow-hidden bg-white text-center text-stone-800 shadow-sm ${modern ? "rounded-none border-t-8" : "rounded-[2rem] border border-stone-200"}`}
      style={modern ? { borderTopColor: accent } : undefined}
    >
      {!modern && <div className="pointer-events-none absolute inset-3 rounded-[1.6rem] border" style={{ borderColor: `${accent}55` }} />}
      <div className="relative px-8 py-12 sm:px-10">
        {greeting && <p className="mb-6 text-sm text-stone-600">{t("Sevgili {name},", { name: greeting })}</p>}
        {design.headline && (
          <p className={`text-[11px] font-semibold tracking-[0.3em] uppercase ${modern ? "text-left" : ""}`} style={{ color: accent }}>
            {design.headline}
          </p>
        )}
        <h1
          className={`mt-4 leading-tight text-stone-900 ${script ? "text-5xl" : modern ? "text-left text-4xl font-semibold tracking-tight" : "font-brand text-5xl"}`}
          style={script ? { fontFamily: SCRIPT_FAMILY.vibes } : undefined}
        >
          {names}
        </h1>
        {!modern && <div className="mx-auto my-6 h-px w-16" style={{ backgroundColor: accent }} />}
        {design.message && <p className={`text-sm leading-relaxed whitespace-pre-line text-stone-600 ${modern ? "mt-6 text-left" : ""}`}>{design.message}</p>}

        {(dateText || design.time || design.venue) && (
          <div className={`mt-8 space-y-1 ${modern ? "text-left" : ""}`}>
            {dateText && <p className="text-base font-semibold text-stone-900">{dateText}</p>}
            {design.time && <p className="text-sm text-stone-600">{design.time}</p>}
            {design.venue && <p className="pt-2 text-sm font-medium text-stone-800">{design.venue}</p>}
            {design.address && <p className="text-xs leading-relaxed text-stone-500">{design.address}</p>}
          </div>
        )}
        {design.mapUrl && (
          <a
            href={design.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium"
            style={{ borderColor: accent, color: accent }}
          >
            <MapPin className="h-3.5 w-3.5" /> {t("Yol tarifi")}
          </a>
        )}
        {design.closing && <p className={`mt-8 text-sm whitespace-pre-line text-stone-600 ${modern ? "text-left" : "italic"}`}>{design.closing}</p>}
      </div>
    </article>
  );
}
