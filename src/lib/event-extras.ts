import { z } from "zod";

/**
 * Optional per-event extras: program schedule and photo challenges.
 * Dependency-free (only zod) so it is shared by API routes, the host and guest
 * UI, and unit tests. Values read from the database are always re-validated
 * with `readSchedule` / `readChallenges`, so a missing column (migration not
 * run yet) or a malformed row simply yields an empty list.
 */

export interface ScheduleItem {
  id: string;
  /** Local wall-clock time "HH:MM". */
  time: string;
  title: string;
  /** Album category to preselect while this item is happening (must be one of the event's categories). */
  category: string | null;
}

export interface Challenge {
  id: string;
  title: string;
}

export const MAX_SCHEDULE_ITEMS = 30;
export const MAX_CHALLENGES = 20;
export const EXTRA_ID_PATTERN = /^[a-z0-9]{4,16}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Short random id for schedule items and challenges (Web Crypto: Node and browser). */
export function newExtraId(length = 8): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

/** Gives every item a valid, unique id (keeps existing ones). */
function withUniqueIds<T extends { id?: string | null }>(items: T[]): Array<T & { id: string }> {
  const seen = new Set<string>();
  return items.map((item) => {
    let id = item.id && EXTRA_ID_PATTERN.test(item.id) && !seen.has(item.id) ? item.id : newExtraId();
    while (seen.has(id)) id = newExtraId();
    seen.add(id);
    return { ...item, id };
  });
}

export function normaliseSchedule(items: Array<Omit<ScheduleItem, "id"> & { id?: string | null }>): ScheduleItem[] {
  return withUniqueIds(items)
    .map(({ id, time, title, category }) => ({ id, time, title, category: category || null }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function normaliseChallenges(items: Array<{ id?: string | null; title: string }>): Challenge[] {
  const titles = new Set<string>();
  const unique = items.filter((item) => {
    const key = item.title.toLocaleLowerCase("tr-TR");
    if (titles.has(key)) return false;
    titles.add(key);
    return true;
  });
  return withUniqueIds(unique).map(({ id, title }) => ({ id, title }));
}

const scheduleItemInput = z.object({
  id: z.string().regex(EXTRA_ID_PATTERN).nullish(),
  time: z.string().regex(TIME_PATTERN, "Saat SS:DD biçiminde olmalı"),
  title: z.string().trim().min(1, "Başlık gerekli").max(60),
  category: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? v : null)),
});

const challengeInput = z.object({
  id: z.string().regex(EXTRA_ID_PATTERN).nullish(),
  title: z.string().trim().min(1, "Görev metni gerekli").max(80),
});

/** Request-body schemas: validate, assign ids, sort / de-duplicate. */
export const scheduleSchema = z
  .array(scheduleItemInput)
  .max(MAX_SCHEDULE_ITEMS, `En fazla ${MAX_SCHEDULE_ITEMS} program maddesi`)
  .transform(normaliseSchedule);

export const challengesSchema = z
  .array(challengeInput)
  .max(MAX_CHALLENGES, `En fazla ${MAX_CHALLENGES} görev`)
  .transform(normaliseChallenges);

/** Safe read of the `events.schedule` jsonb column (unknown shape → []). */
export function readSchedule(raw: unknown): ScheduleItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ScheduleItem[] = [];
  for (const entry of raw.slice(0, MAX_SCHEDULE_ITEMS)) {
    const parsed = scheduleItemInput.safeParse(entry);
    if (parsed.success && parsed.data.id) items.push({ ...parsed.data, id: parsed.data.id });
  }
  return items.sort((a, b) => a.time.localeCompare(b.time));
}

/** Safe read of the `events.challenges` jsonb column (unknown shape → []). */
export function readChallenges(raw: unknown): Challenge[] {
  if (!Array.isArray(raw)) return [];
  const items: Challenge[] = [];
  for (const entry of raw.slice(0, MAX_CHALLENGES)) {
    const parsed = challengeInput.safeParse(entry);
    if (parsed.success && parsed.data.id) items.push({ id: parsed.data.id, title: parsed.data.title });
  }
  return items;
}

/** Drops schedule categories that are no longer among the event's categories. */
export function withKnownCategories(schedule: ScheduleItem[], categories: readonly string[]): ScheduleItem[] {
  return schedule.map((item) => (item.category && !categories.includes(item.category) ? { ...item, category: null } : item));
}

/** A challenge id sent by a guest, kept only if it belongs to the event. */
export function knownChallengeId(challenges: Challenge[], id: unknown): string | null {
  return typeof id === "string" && challenges.some((c) => c.id === id) ? id : null;
}

function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Where the program stands at `now` (device local time). Only meaningful on
 * the event day; on any other day both ids are null and `today` is false.
 */
export function scheduleStatus(
  schedule: ScheduleItem[],
  eventDate: string | null,
  now: Date,
): { today: boolean; currentId: string | null; nextId: string | null } {
  if (!eventDate || schedule.length === 0 || localDateKey(now) !== eventDate) {
    return { today: false, currentId: null, nextId: null };
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  let currentId: string | null = null;
  let nextId: string | null = null;
  for (const item of schedule) {
    if (item.time <= clock) currentId = item.id;
    else if (!nextId) nextId = item.id;
  }
  return { today: true, currentId, nextId };
}

/**
 * Keyword → emoji for program items, so the guest timeline gets a playful icon
 * without the host having to pick one. First match wins (order matters:
 * "Pasta kesimi" must not become a generic entrance, etc.).
 */
const SCHEDULE_EMOJI: Array<[RegExp, string]> = [
  [/pasta|kek/, "🎂"],
  [/havai fişek|maytap|fişek/, "🎆"],
  [/buket|çiçek/, "💐"],
  [/kına/, "🪔"],
  [/takı/, "💛"],
  [/nikah|nikâh|imza|nişan|evet/, "💍"],
  [/dans|halay|horon|zeybek|vals|tango/, "💃"],
  [/kokteyl|karşılama|kadeh|şampanya|içki/, "🥂"],
  [/yemek|ziyafet|akşam|öğle|kahvaltı|büfe|dinner/, "🍽️"],
  [/kahve|çay|tatlı/, "☕"],
  [/müzik|dj|konser|sahne|canlı|orkestra|şarkı/, "🎶"],
  [/foto|çekim|poz/, "📸"],
  [/konuşma|sunum|söz|mikrofon|anı/, "🎤"],
  [/oyun|yarışma|çekiliş|sürpriz/, "🎁"],
  [/parti|eğlence|after/, "🎉"],
  [/veda|uğurlama|çıkış|kapanış|final/, "👋"],
  [/giriş|gelin|damat|çift/, "👰"],
];

export function scheduleEmoji(title: string): string {
  const text = title.toLocaleLowerCase("tr-TR");
  for (const [pattern, emoji] of SCHEDULE_EMOJI) if (pattern.test(text)) return emoji;
  return "✨";
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "az sonra" / "12 dk" / "1 sa 5 dk" / "2 sa". */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return "az sonra";
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

export type ProgramPhase =
  /** No date set, or the event is over: plain program. */
  | { kind: "static" }
  /** Before the event day. */
  | { kind: "countdown"; days: number }
  /** Event day, first item not started yet. */
  | { kind: "warmup"; nextId: string; minutesToNext: number }
  /** Event day, an item is happening and another one follows. */
  | { kind: "live"; currentId: string; nextId: string; minutesToNext: number; progress: number }
  /** Event day, the last item has started. */
  | { kind: "finale"; currentId: string };

/** Richer view of `scheduleStatus` for the guest timeline (device local time). */
export function programPhase(schedule: ScheduleItem[], eventDate: string | null, now: Date): ProgramPhase {
  if (!eventDate || schedule.length === 0) return { kind: "static" };
  const today = localDateKey(now);
  if (today < eventDate) {
    const [y, mo, d] = eventDate.split("-").map(Number);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((new Date(y, mo - 1, d).getTime() - startOfToday.getTime()) / 86_400_000);
    return { kind: "countdown", days: Math.max(1, days) };
  }
  if (today > eventDate) return { kind: "static" };

  const { currentId, nextId } = scheduleStatus(schedule, eventDate, now);
  const clock = now.getHours() * 60 + now.getMinutes();
  const current = schedule.find((item) => item.id === currentId);
  const next = schedule.find((item) => item.id === nextId);
  if (!current && next) return { kind: "warmup", nextId: next.id, minutesToNext: minutesOf(next.time) - clock };
  if (current && next) {
    const start = minutesOf(current.time);
    const span = Math.max(1, minutesOf(next.time) - start);
    return {
      kind: "live",
      currentId: current.id,
      nextId: next.id,
      minutesToNext: minutesOf(next.time) - clock,
      progress: Math.min(1, Math.max(0, (clock - start) / span)),
    };
  }
  return current ? { kind: "finale", currentId: current.id } : { kind: "static" };
}
