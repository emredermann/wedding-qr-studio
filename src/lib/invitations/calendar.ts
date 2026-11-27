/**
 * "Add to calendar" and countdown helpers for invitations (pure; Turkey time).
 * Events without a time become all-day entries.
 */

export interface CalendarInput {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** Free text; the first HH:MM in it is used. */
  time: string;
  location: string;
  details: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function parseTime(text: string): { h: number; m: number } | null {
  const match = /(\d{1,2})[:.](\d{2})/.exec(text);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? { h, m } : null;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Start/end in local wall-clock form (YYYYMMDD or YYYYMMDDTHHMMSS); 4 hours long. */
function span(input: CalendarInput): { start: string; end: string; allDay: boolean } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return null;
  const day = input.date.replace(/-/g, "");
  const t = parseTime(input.time);
  if (!t) return { start: day, end: nextDay(input.date).replace(/-/g, ""), allDay: true };
  const endH = t.h + 4;
  const endDate = endH >= 24 ? nextDay(input.date).replace(/-/g, "") : day;
  return { start: `${day}T${pad(t.h)}${pad(t.m)}00`, end: `${endDate}T${pad(endH % 24)}${pad(t.m)}00`, allDay: false };
}

export function googleCalendarUrl(input: CalendarInput): string | null {
  const s = span(input);
  if (!s) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${s.start}/${s.end}`,
    location: input.location,
    details: input.details,
  });
  if (!s.allDay) params.set("ctz", "Europe/Istanbul");
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const icsEscape = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** An .ics file (Apple / Outlook calendars). */
export function icsText(input: CalendarInput, uid: string, now: Date = new Date()): string | null {
  const s = span(input);
  if (!s) return null;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const when = s.allDay
    ? [`DTSTART;VALUE=DATE:${s.start}`, `DTEND;VALUE=DATE:${s.end}`]
    : [`DTSTART;TZID=Europe/Istanbul:${s.start}`, `DTEND;TZID=Europe/Istanbul:${s.end}`];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mira//Invitation//TR",
    "BEGIN:VEVENT",
    `UID:${uid}@mira`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${icsEscape(input.title)}`,
    ...(input.location ? [`LOCATION:${icsEscape(input.location)}`] : []),
    ...(input.details ? [`DESCRIPTION:${icsEscape(input.details)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Whole days from today (Turkey) to the date; null when unknown or past. */
export function daysUntil(date: string | null, now: Date = new Date()): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const today = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return diff >= 0 ? diff : null;
}
