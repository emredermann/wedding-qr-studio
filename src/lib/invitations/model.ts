import { z } from "zod";

/**
 * Invitations & RSVP: the pure part (no server or browser APIs), shared by the
 * API routes, the host module, the guest page and `node --test`.
 *
 * One `invitee` row = one invitation link, for a person or a family, with a
 * party limit set by the host. The guest answers on that link: attending or
 * not and — when attending — one full name per person coming (the first is
 * pre-filled with the name the host wrote). Replies can be changed until the
 * deadline. An optional "open link" lets guests the host did not list answer
 * too; each such reply becomes its own invitee with its own private link.
 */

export const INVITE_LIMITS = {
  invitees: 1500,
  maxParty: 20,
  name: 80,
  group: 40,
  note: 200,
  dietary: 200,
  message: 1000,
} as const;

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,32}$/;

/** 22 url-safe characters ≈ 131 bits: unguessable links. */
export function newToken(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------- design

/**
 * Invitation templates. Each has its own palette, typeface pairing and
 * ornaments (drawn by InvitationCard); the accent colour can be changed.
 */
export const INVITE_TEMPLATES = ["klasik", "botanik", "kemer", "gece", "modern", "minimal"] as const;
export type InviteTemplate = (typeof INVITE_TEMPLATES)[number];

/** Typeface for the names line; "auto" = the template's own choice. */
export const INVITE_FONTS = ["auto", "serif", "script", "display", "sans"] as const;
export type InviteFont = (typeof INVITE_FONTS)[number];

export const DATE_STYLES = ["long", "numeric"] as const;
export type DateStyle = (typeof DATE_STYLES)[number];

export interface ProgramLine {
  time: string;
  title: string;
}

export interface InviteDesign {
  template: InviteTemplate;
  font: InviteFont;
  /** Accent colour; empty = the template's own. */
  accent: string;
  /** Small line above the names, e.g. "Evleniyoruz". */
  headline: string;
  /** Big names line; empty = the event's couple names. */
  names: string;
  message: string;
  closing: string;
  /** Free text date line; empty = the event date. */
  dateText: string;
  dateStyle: DateStyle;
  time: string;
  venue: string;
  address: string;
  mapUrl: string;
  /** Short programme, e.g. 17:00 Nikâh · 19:00 Yemek (max 6 lines). */
  program: ProgramLine[];
  dressCode: string;
  /** Extra note (parking, children, gifts…). */
  note: string;
  showCountdown: boolean;
  showCalendar: boolean;
  /** Guests first see a sealed envelope and open it. */
  envelope: boolean;
}

const str = (max: number) => z.string().trim().max(max).catch("");

export const designSchema = z.object({
  template: z.enum(INVITE_TEMPLATES).catch("klasik"),
  font: z.enum(INVITE_FONTS).catch("auto"),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .or(z.literal(""))
    .catch(""),
  headline: str(80),
  names: str(120),
  message: str(1200),
  closing: str(200),
  dateText: str(80),
  dateStyle: z.enum(DATE_STYLES).catch("long"),
  time: str(40),
  venue: str(120),
  address: str(240),
  mapUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v))
    .catch(""),
  program: z
    .array(z.object({ time: str(20), title: str(80) }))
    .max(6)
    .catch([])
    .transform((lines) => lines.filter((l) => l.time || l.title)),
  dressCode: str(120),
  note: str(400),
  showCountdown: z.boolean().catch(true),
  showCalendar: z.boolean().catch(true),
  envelope: z.boolean().catch(true),
});

export const DEFAULT_DESIGN: InviteDesign = {
  template: "klasik",
  font: "auto",
  accent: "",
  headline: "",
  names: "",
  message: "",
  closing: "",
  dateText: "",
  dateStyle: "long",
  time: "",
  venue: "",
  address: "",
  mapUrl: "",
  program: [],
  dressCode: "",
  note: "",
  showCountdown: true,
  showCalendar: true,
  envelope: true,
};

/** Designs saved before templates existed used `style`. */
const LEGACY_STYLE: Record<string, InviteTemplate> = { classic: "klasik", script: "botanik", modern: "modern" };

export function readDesign(raw: unknown): InviteDesign {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const legacy = typeof obj.style === "string" && !("template" in obj) ? { template: LEGACY_STYLE[obj.style] ?? "klasik" } : {};
  const parsed = designSchema.safeParse({ ...DEFAULT_DESIGN, ...obj, ...legacy });
  return parsed.success ? parsed.data : { ...DEFAULT_DESIGN };
}

// ---------------------------------------------------------------- replies

const personName = z
  .string()
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(2).max(INVITE_LIMITS.name));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Body of a guest's reply. `party` = everyone coming, the guest included. */
export const replySchema = z.object({
  attending: z.boolean(),
  /** Only for the open link: who is answering. */
  name: optionalText(INVITE_LIMITS.name),
  party: z.array(z.string()).max(INVITE_LIMITS.maxParty).default([]),
  dietary: optionalText(INVITE_LIMITS.dietary),
  message: optionalText(INVITE_LIMITS.message),
});
export type ReplyInput = z.infer<typeof replySchema>;

export interface CleanReply {
  attending: boolean;
  party: string[];
  dietary: string | null;
  message: string | null;
}

export type ReplyProblem = "party_empty" | "party_too_big" | "party_name";

/**
 * Checks a reply against the link's party limit. Attending needs 1…maxParty
 * names, each a real name (2–80 characters); declining stores no party.
 */
export function cleanReply(input: ReplyInput, maxParty: number): { ok: true; reply: CleanReply } | { ok: false; problem: ReplyProblem; index?: number } {
  if (!input.attending) return { ok: true, reply: { attending: false, party: [], dietary: null, message: input.message } };
  const names = input.party;
  if (names.length === 0) return { ok: false, problem: "party_empty" };
  if (names.length > maxParty) return { ok: false, problem: "party_too_big" };
  const party: string[] = [];
  for (let i = 0; i < names.length; i += 1) {
    const parsed = personName.safeParse(names[i]);
    if (!parsed.success) return { ok: false, problem: "party_name", index: i };
    party.push(parsed.data);
  }
  return { ok: true, reply: { attending: true, party, dietary: input.dietary, message: input.message } };
}

/** Deadline is a calendar day in Turkey (UTC+3, no DST): replies close at its end. */
export function deadlinePassed(deadline: string | null, now: Date = new Date()): boolean {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return false;
  return now.getTime() > new Date(`${deadline}T23:59:59.999+03:00`).getTime();
}

export function canReply(settings: { accepting: boolean; rsvp_deadline: string | null }, now: Date = new Date()): boolean {
  return settings.accepting && !deadlinePassed(settings.rsvp_deadline, now);
}

// ---------------------------------------------------------------- rows & DTOs

export interface InviteeRow {
  id: string;
  event_id: string;
  token: string;
  name: string | null;
  group_name: string | null;
  max_party: number;
  host_note: string | null;
  via_open_link: boolean;
  created_at: string;
  responded_at: string | null;
  attending: boolean | null;
  party: unknown;
  dietary: string | null;
  message: string | null;
  reply_count: number;
}

export interface InvitationSettingsRow {
  event_id: string;
  design: unknown;
  rsvp_deadline: string | null;
  accepting: boolean;
  open_token: string | null;
  open_enabled: boolean;
  open_max_party: number;
  sheet_id: string | null;
  sheet_dirty_at: string | null;
  sheet_synced_at: string | null;
  sheet_lock_until: string | null;
  sheet_error: string | null;
  sheet_lang: SheetLang;
  updated_at: string;
}

export type InviteStatus = "pending" | "yes" | "no";

export interface InviteeDto {
  id: string;
  token: string;
  name: string | null;
  group: string | null;
  maxParty: number;
  note: string | null;
  viaOpenLink: boolean;
  createdAt: string;
  status: InviteStatus;
  respondedAt: string | null;
  party: string[];
  dietary: string | null;
  message: string | null;
  replyCount: number;
}

export function readParty(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string" && v.trim() !== "").slice(0, INVITE_LIMITS.maxParty) : [];
}

export function statusOf(row: Pick<InviteeRow, "responded_at" | "attending">): InviteStatus {
  if (!row.responded_at || row.attending === null) return "pending";
  return row.attending ? "yes" : "no";
}

export function toInviteeDto(row: InviteeRow): InviteeDto {
  const status = statusOf(row);
  return {
    id: row.id,
    token: row.token,
    name: row.name,
    group: row.group_name,
    maxParty: row.max_party,
    note: row.host_note,
    viaOpenLink: row.via_open_link,
    createdAt: row.created_at,
    status,
    respondedAt: row.responded_at,
    party: status === "yes" ? readParty(row.party) : [],
    dietary: row.dietary,
    message: row.message,
    replyCount: row.reply_count,
  };
}

export interface InviteSummary {
  links: number;
  responded: number;
  yes: number;
  no: number;
  pending: number;
  /** People coming (sum of attending parties). */
  people: number;
  /** Most people that could come (sum of party limits of links not declined). */
  capacity: number;
}

export function summarise(invitees: InviteeDto[]): InviteSummary {
  const s: InviteSummary = { links: invitees.length, responded: 0, yes: 0, no: 0, pending: 0, people: 0, capacity: 0 };
  for (const i of invitees) {
    s[i.status] += 1;
    if (i.status !== "pending") s.responded += 1;
    if (i.status === "yes") s.people += i.party.length;
    if (i.status !== "no") s.capacity += i.maxParty;
  }
  return s;
}

// ---------------------------------------------------------------- host input

export const inviteeInputSchema = z.object({
  name: optionalText(INVITE_LIMITS.name),
  group: optionalText(INVITE_LIMITS.group),
  maxParty: z.number().int().min(1).max(INVITE_LIMITS.maxParty).default(1),
  note: optionalText(INVITE_LIMITS.note),
});
export type InviteeInput = z.infer<typeof inviteeInputSchema>;

/** "Ayşe Yılmaz; Gelin tarafı; 3" lines (or tab-separated from Excel). */
export function parseInviteeLines(text: string, defaultMax = 1): InviteeInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/\t|;|,/).map((p) => p.trim()))
    .filter((parts) => parts[0])
    .map(([name, second, third]) => {
      // The party size may sit in the 2nd or 3rd column.
      const num = [second, third].map((v) => (v && /^\d{1,2}$/.test(v) ? Number(v) : null)).find((v) => v !== null) ?? null;
      const group = [second, third].find((v) => v && !/^\d{1,2}$/.test(v)) ?? null;
      return {
        name: name.slice(0, INVITE_LIMITS.name),
        group: group ? group.slice(0, INVITE_LIMITS.group) : null,
        maxParty: Math.min(INVITE_LIMITS.maxParty, Math.max(1, num ?? defaultMax)),
        note: null,
      };
    });
}

// ---------------------------------------------------------------- Google Sheet mirror

export type SheetLang = "tr" | "en";

const SHEET_HEADER: Record<SheetLang, string[]> = {
  tr: ["Davetli", "Grup", "Kişi sınırı", "Yanıt", "Gelecek kişi", "Gelecekler", "Menü / diyet", "Mesaj", "Yanıt tarihi", "Masa", "Davetiye bağlantısı"],
  en: ["Invitee", "Group", "Party limit", "Reply", "Coming", "Names", "Dietary", "Message", "Replied at", "Table", "Invitation link"],
};
const SHEET_STATUS: Record<SheetLang, Record<InviteStatus, string>> = {
  tr: { pending: "Bekleniyor", yes: "Katılıyor", no: "Katılmıyor" },
  en: { pending: "Awaiting", yes: "Attending", no: "Declined" },
};

/**
 * The whole sheet as rows (header first). Rewritten in full on every sync,
 * so the sheet always equals the database. `tables` maps invitee id → table
 * names from the seating plan.
 */
export function sheetRows(
  invitees: InviteeDto[],
  opts: { lang: SheetLang; origin: string; tables?: Map<string, string[]>; timeZone?: string },
): string[][] {
  const fmt = new Intl.DateTimeFormat(opts.lang === "tr" ? "tr-TR" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: opts.timeZone ?? "Europe/Istanbul",
  });
  const rows = [SHEET_HEADER[opts.lang]];
  for (const i of invitees) {
    rows.push([
      i.name ?? (i.party[0] || "—"),
      i.group ?? "",
      String(i.maxParty),
      SHEET_STATUS[opts.lang][i.status],
      i.status === "yes" ? String(i.party.length) : i.status === "no" ? "0" : "",
      i.party.join(", "),
      i.dietary ?? "",
      i.message ?? "",
      i.respondedAt ? fmt.format(new Date(i.respondedAt)) : "",
      [...new Set(opts.tables?.get(i.id) ?? [])].join(", "),
      `${opts.origin}/d/${i.token}`,
    ]);
  }
  // A leading = + - @ would be read as a formula by Sheets: neutralise.
  return rows.map((r) => r.map((c) => (/^[=+\-@]/.test(c) ? `'${c}` : c)));
}

// ---------------------------------------------------------------- seating

/** Seating-plan guests coming from RSVPs carry `link = "inv:<inviteeId>:<index>"`. */
export const RSVP_LINK_PATTERN = /^inv:[0-9a-f-]{36}:\d{1,2}$/;

export interface RsvpPerson {
  link: string;
  inviteeId: string;
  name: string;
  group: string | null;
  dietary: string | null;
}

/** Everyone coming, one entry per seat. */
export function rsvpPeople(invitees: InviteeDto[]): RsvpPerson[] {
  const out: RsvpPerson[] = [];
  for (const i of invitees) {
    if (i.status !== "yes") continue;
    i.party.forEach((name, index) => {
      out.push({ link: `inv:${i.id}:${index}`, inviteeId: i.id, name, group: i.group, dietary: i.dietary });
    });
  }
  return out;
}

// ---------------------------------------------------------------- API payloads

export interface InvitationSettingsDto {
  design: InviteDesign;
  rsvpDeadline: string | null;
  accepting: boolean;
  openEnabled: boolean;
  openToken: string | null;
  openMaxParty: number;
  sheet: { url: string | null; syncedAt: string | null; pending: boolean; error: string | null; lang: SheetLang };
}

export interface InvitationEventDto {
  title: string;
  coupleNames: string | null;
  eventDate: string | null;
  themeColor: string;
}

/** GET /api/host/events/:id/invitations */
export interface InvitationsDto {
  settings: InvitationSettingsDto;
  invitees: InviteeDto[];
  summary: InviteSummary;
  /** The owner's package includes invitations (writes need it). */
  pro: boolean;
  event: InvitationEventDto;
}

/** GET /api/invite/:token — what the guest page shows. */
export interface InviteViewDto {
  kind: "personal" | "open";
  event: InvitationEventDto;
  design: InviteDesign;
  /** Name the host wrote (personal links); null = the guest writes it. */
  name: string | null;
  maxParty: number;
  canReply: boolean;
  deadline: string | null;
  reply: { status: InviteStatus; party: string[]; dietary: string | null; message: string | null; respondedAt: string | null } | null;
}

export const settingsInputSchema = z.object({
  design: designSchema.optional(),
  rsvpDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  accepting: z.boolean().optional(),
  openEnabled: z.boolean().optional(),
  openMaxParty: z.number().int().min(1).max(INVITE_LIMITS.maxParty).optional(),
  regenerateOpenToken: z.boolean().optional(),
  sheetLang: z.enum(["tr", "en"]).optional(),
});
export type SettingsInput = z.infer<typeof settingsInputSchema>;
