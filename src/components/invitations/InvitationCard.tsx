"use client";

import { CalendarPlus, Download, MapPin, Shirt } from "lucide-react";

import { INVITE_FAMILY } from "@/lib/invite-fonts";
import { useLang, useT } from "@/lib/i18n/provider";
import { daysUntil, googleCalendarUrl, icsText } from "@/lib/invitations/calendar";
import type { InvitationEventDto, InviteDesign, InviteFont, InviteTemplate } from "@/lib/invitations/model";

/** Palette, typeface and decoration of each template. */
export interface TemplateLook {
  /** Page background around the card. */
  page: string;
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  font: Exclude<InviteFont, "auto">;
  align: "center" | "left";
  frame: "double" | "single" | "none";
  ornament: "flourish" | "leaves" | "stars" | "none";
  shape: "rect" | "arch";
  /** Names sit on an accent band (modern). */
  band: boolean;
  upper: boolean;
}

export const TEMPLATE_LOOK: Record<InviteTemplate, TemplateLook> = {
  klasik: { page: "#ece6da", paper: "#fbf8f1", ink: "#2b2620", muted: "#6f665a", accent: "#a08452", font: "serif", align: "center", frame: "double", ornament: "flourish", shape: "rect", band: false, upper: false },
  botanik: { page: "#e4eae1", paper: "#fdfdfb", ink: "#26302a", muted: "#5f6b62", accent: "#6f8a6a", font: "script", align: "center", frame: "none", ornament: "leaves", shape: "rect", band: false, upper: false },
  kemer: { page: "#ead3c6", paper: "#fffaf6", ink: "#3a2a24", muted: "#7a625a", accent: "#b5654a", font: "display", align: "center", frame: "single", ornament: "none", shape: "arch", band: false, upper: false },
  gece: { page: "#0b1324", paper: "#14213d", ink: "#f4ede1", muted: "#c9c2b4", accent: "#c9a45c", font: "serif", align: "center", frame: "single", ornament: "stars", shape: "rect", band: false, upper: true },
  modern: { page: "#e7e5e1", paper: "#ffffff", ink: "#1c1b19", muted: "#6b6863", accent: "#1f3a5f", font: "sans", align: "left", frame: "none", ornament: "none", shape: "rect", band: true, upper: false },
  minimal: { page: "#f2f1ee", paper: "#ffffff", ink: "#1c1b19", muted: "#7a776f", accent: "#1c1b19", font: "sans", align: "center", frame: "none", ornament: "none", shape: "rect", band: false, upper: true },
};

export function lookFor(design: Pick<InviteDesign, "template" | "accent">): TemplateLook {
  const look = TEMPLATE_LOOK[design.template] ?? TEMPLATE_LOOK.klasik;
  return design.accent ? { ...look, accent: design.accent } : look;
}

// ---------------------------------------------------------------- ornaments

function Flourish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 200 24" className="mx-auto h-5 w-40" aria-hidden>
      <g fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round">
        <path d="M8 12 H78 M122 12 H192" />
        <path d="M78 12 C84 4 92 4 94 10 C96 16 90 18 88 14" />
        <path d="M122 12 C116 4 108 4 106 10 C104 16 110 18 112 14" />
      </g>
      <path d="M100 6 L105 12 L100 18 L95 12 Z" fill={color} />
    </svg>
  );
}

/** A eucalyptus-like branch; mirrored for the opposite corner. */
function Branch({ color, className, flip }: { color: string; className: string; flip?: boolean }) {
  const leaves = [
    [18, 22, -30],
    [32, 40, 40],
    [44, 52, -20],
    [60, 66, 50],
    [74, 76, -10],
    [92, 88, 55],
    [104, 96, -5],
  ];
  return (
    <svg viewBox="0 0 140 120" className={className} style={flip ? { transform: "scale(-1,-1)" } : undefined} aria-hidden>
      <path d="M4 8 C40 30 80 70 130 110" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      {leaves.map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="11" ry="5.5" transform={`rotate(${r} ${x} ${y})`} fill={color} opacity={0.55 + (i % 3) * 0.15} />
      ))}
    </svg>
  );
}

function Stars({ color }: { color: string }) {
  const dots = [
    [8, 10, 1.4],
    [22, 30, 0.9],
    [86, 8, 1.2],
    [92, 26, 0.8],
    [14, 78, 1],
    [90, 70, 1.3],
    [50, 4, 0.7],
    [70, 92, 0.9],
    [30, 94, 1.1],
  ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {dots.map(([x, y, r], i) => (
        <span key={i} className="absolute rounded-full" style={{ left: `${x}%`, top: `${y}%`, width: r * 3, height: r * 3, background: color, opacity: 0.75, boxShadow: `0 0 6px ${color}` }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- card

function formatDate(design: InviteDesign, eventDate: string | null, locale: string): { main: string; sub: string | null } | null {
  if (design.dateText) return { main: design.dateText, sub: null };
  if (!eventDate) return null;
  const d = new Date(`${eventDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (design.dateStyle === "numeric") {
    return {
      main: `${String(d.getDate()).padStart(2, "0")} · ${String(d.getMonth() + 1).padStart(2, "0")} · ${d.getFullYear()}`,
      sub: d.toLocaleDateString(locale, { weekday: "long" }),
    };
  }
  return { main: d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }), sub: d.toLocaleDateString(locale, { weekday: "long" }) };
}

/**
 * The invitation as guests see it; also the editor preview and the template
 * thumbnails (`compact`: no calendar buttons). `greeting` personalises the
 * first line ("Sevgili Ayşe Yılmaz,").
 */
export function InvitationCard({
  design,
  event,
  greeting,
  compact = false,
}: {
  design: InviteDesign;
  event: InvitationEventDto;
  greeting: string | null;
  compact?: boolean;
}) {
  const t = useT();
  const { locale } = useLang();
  const look = lookFor(design);
  const fontKey = design.font === "auto" ? look.font : design.font;
  const namesFont = INVITE_FAMILY[fontKey];
  const bodyFont = look.font === "serif" ? INVITE_FAMILY.serif : INVITE_FAMILY.sans;
  const names = design.names || event.coupleNames || event.title;
  const date = formatDate(design, event.eventDate, locale);
  const left = look.align === "left";
  const days = design.showCountdown ? daysUntil(event.eventDate) : null;
  const calendar =
    !compact && design.showCalendar && event.eventDate
      ? {
          title: names,
          date: event.eventDate,
          time: design.time,
          location: [design.venue, design.address].filter(Boolean).join(", "),
          details: design.headline || "",
        }
      : null;
  const googleUrl = calendar ? googleCalendarUrl(calendar) : null;

  const downloadIcs = () => {
    if (!calendar) return;
    const text = icsText(calendar, `${event.eventDate}-${names}`.replace(/[^a-z0-9-]/gi, ""));
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "davetiye.ics";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const namesSize =
    fontKey === "script"
      ? "text-[2.9rem] leading-[1.1]"
      : fontKey === "sans"
        ? design.template === "minimal"
          ? "text-[1.9rem] leading-tight font-light"
          : "text-[2.1rem] leading-tight font-semibold tracking-tight"
        : "text-[2.5rem] leading-[1.05]";
  const label = `text-[10px] font-semibold tracking-[0.32em] uppercase`;
  const radius = look.shape === "arch" ? "999px 999px 28px 28px" : look.frame === "none" && look.band ? "6px" : "22px";

  return (
    <article
      className={`relative mx-auto w-full max-w-[26rem] overflow-hidden shadow-[0_20px_50px_-24px_rgba(0,0,0,0.35)] ${left ? "text-left" : "text-center"}`}
      style={{ background: look.paper, color: look.ink, borderRadius: radius, fontFamily: bodyFont }}
    >
      {look.ornament === "stars" && <Stars color={look.accent} />}
      {look.ornament === "leaves" && (
        <>
          <Branch color={look.accent} className="pointer-events-none absolute -top-2 -left-3 h-28 w-32" />
          <Branch color={look.accent} className="pointer-events-none absolute -right-3 -bottom-2 h-28 w-32" flip />
        </>
      )}
      {look.frame !== "none" && (
        <div
          className="pointer-events-none absolute inset-3 border"
          style={{ borderColor: `${look.accent}99`, borderRadius: look.shape === "arch" ? "999px 999px 18px 18px" : "14px" }}
        />
      )}
      {look.frame === "double" && <div className="pointer-events-none absolute inset-[18px] rounded-[10px] border" style={{ borderColor: `${look.accent}55` }} />}

      {look.band && (
        <div className="px-8 pt-10 pb-8" style={{ background: look.accent, color: "#ffffff" }}>
          {greeting && <p className="mb-5 text-sm opacity-85">{t("Sevgili {name},", { name: greeting })}</p>}
          {design.headline && <p className={`${label} opacity-80`}>{design.headline}</p>}
          <h1 className={`mt-3 ${namesSize}`} style={{ fontFamily: namesFont }}>
            {names}
          </h1>
        </div>
      )}

      <div className={`relative ${look.shape === "arch" ? "px-10 pt-24 pb-14" : look.band ? "px-8 pt-8 pb-10" : "px-9 pt-14 pb-12"}`}>
        {!look.band && (
          <>
            {greeting && (
              <p className="mb-6 text-[15px] italic" style={{ color: look.muted }}>
                {t("Sevgili {name},", { name: greeting })}
              </p>
            )}
            {design.headline && (
              <p className={label} style={{ color: look.accent }}>
                {design.headline}
              </p>
            )}
            <h1 className={`mt-4 ${namesSize} ${look.upper && fontKey !== "script" ? "tracking-[0.12em] uppercase" : ""}`} style={{ fontFamily: namesFont }}>
              {names}
            </h1>
            {look.ornament === "flourish" ? (
              <div className="my-6">
                <Flourish color={look.accent} />
              </div>
            ) : (
              <div className={`my-6 h-px w-14 ${left ? "" : "mx-auto"}`} style={{ background: look.accent }} />
            )}
          </>
        )}

        {design.message && (
          <p className="text-[15px] leading-relaxed whitespace-pre-line" style={{ color: look.muted }}>
            {design.message}
          </p>
        )}

        {(date || design.time) && (
          <div className="mt-8">
            {date && design.dateStyle === "numeric" && !design.dateText ? (
              <>
                <p className="text-[1.9rem] leading-none font-light tabular-nums" style={{ fontFamily: namesFont === INVITE_FAMILY.script ? bodyFont : namesFont }}>
                  {date.main}
                </p>
                <p className={`${label} mt-3`} style={{ color: look.accent }}>
                  {[date.sub, design.time].filter(Boolean).join(" · ")}
                </p>
              </>
            ) : (
              <>
                {date && <p className="text-lg font-semibold">{date.main}</p>}
                <p className="mt-1 text-sm" style={{ color: look.muted }}>
                  {[date?.sub, design.time].filter(Boolean).join(" · ")}
                </p>
              </>
            )}
          </div>
        )}

        {(design.venue || design.address) && (
          <div className="mt-6">
            {design.venue && <p className="text-[15px] font-medium">{design.venue}</p>}
            {design.address && (
              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: look.muted }}>
                {design.address}
              </p>
            )}
          </div>
        )}

        {design.program.length > 0 && (
          <div className="mt-8">
            <p className={label} style={{ color: look.accent }}>
              {t("Program")}
            </p>
            <ul className={`mt-3 space-y-1.5 text-sm ${left ? "" : "mx-auto max-w-64"}`}>
              {design.program.map((line, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className="w-12 shrink-0 text-right tabular-nums" style={{ color: look.accent }}>
                    {line.time}
                  </span>
                  <span className="h-px flex-1 translate-y-[-3px]" style={{ background: `${look.muted}40` }} />
                  <span className="text-left">{line.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(design.dressCode || design.note) && (
          <div className="mt-8 space-y-2 text-sm" style={{ color: look.muted }}>
            {design.dressCode && (
              <p className={`flex items-center gap-1.5 ${left ? "" : "justify-center"}`}>
                <Shirt className="h-4 w-4" style={{ color: look.accent }} /> {t("Kıyafet: {text}", { text: design.dressCode })}
              </p>
            )}
            {design.note && <p className="leading-relaxed whitespace-pre-line">{design.note}</p>}
          </div>
        )}

        {design.closing && (
          <p className="mt-8 text-[15px] whitespace-pre-line italic" style={{ color: look.muted }}>
            {design.closing}
          </p>
        )}

        {days !== null && (
          <p className="mt-8 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium" style={{ background: `${look.accent}1f`, color: look.accent }}>
            {days === 0 ? t("Bugün büyük gün!") : t("Büyük güne {n} gün", { n: days })}
          </p>
        )}

        {!compact && (design.mapUrl || googleUrl) && (
          <div className={`mt-6 flex flex-wrap gap-2 ${left ? "" : "justify-center"}`}>
            {design.mapUrl && (
              <a href={design.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium" style={{ borderColor: look.accent, color: look.accent }}>
                <MapPin className="h-3.5 w-3.5" /> {t("Yol tarifi")}
              </a>
            )}
            {googleUrl && (
              <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium" style={{ borderColor: look.accent, color: look.accent }}>
                <CalendarPlus className="h-3.5 w-3.5" /> {t("Google Takvim")}
              </a>
            )}
            {googleUrl && (
              <button type="button" onClick={downloadIcs} className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium" style={{ borderColor: look.accent, color: look.accent }}>
                <Download className="h-3.5 w-3.5" /> {t("Takvime ekle (.ics)")}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
