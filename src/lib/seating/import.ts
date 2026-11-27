import type { GuestInput } from "./ops.ts";
import { SEATING_LIMITS, type Rsvp } from "./schema.ts";

/**
 * Guest list import: spreadsheet rows (from CSV, .xlsx or a PDF table) →
 * guests. No dependencies: .xlsx is a ZIP of XML files, read here with an
 * injected raw-deflate decoder (the browser's DecompressionStream; zlib in
 * tests).
 */

export type Rows = string[][];
export type InflateRaw = (data: Uint8Array) => Promise<Uint8Array>;

// ---------------------------------------------------------------- CSV

/** RFC 4180-style CSV with auto-detected delimiter (",", ";" or tab). */
export function parseCsv(text: string): Rows {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delimiter = [";", "\t", ","].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ",");
  const rows: Rows = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

// ---------------------------------------------------------------- XLSX

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Reads the named entries of a ZIP archive (stored or deflated). */
export async function unzipEntries(zip: Uint8Array, wanted: (name: string) => boolean, inflateRaw: InflateRaw): Promise<Map<string, Uint8Array>> {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i -= 1) {
    if (u32(zip, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Dosya okunamadı. Geçerli bir Excel (.xlsx) dosyası seçin.");
  const entries = u16(zip, eocd + 10);
  let p = u32(zip, eocd + 16);
  const out = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i < entries && u32(zip, p) === 0x02014b50; i += 1) {
    const method = u16(zip, p + 10);
    const compressed = u32(zip, p + 20);
    const nameLen = u16(zip, p + 28);
    const extraLen = u16(zip, p + 30);
    const commentLen = u16(zip, p + 32);
    const local = u32(zip, p + 42);
    const name = decoder.decode(zip.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name) || u32(zip, local) !== 0x04034b50) continue;
    const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
    const data = zip.subarray(start, start + compressed);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, await inflateRaw(data));
  }
  return out;
}

const decodeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Concatenated text of every <t> run inside a fragment (rich text included). */
const runs = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join("");

const columnIndex = (ref: string) => {
  const letters = ref.replace(/[^A-Z]/gi, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** First worksheet of an .xlsx file as rows of cell text. */
export async function readXlsx(file: Uint8Array, inflateRaw: InflateRaw): Promise<Rows> {
  const files = await unzipEntries(
    file,
    (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n),
    inflateRaw,
  );
  const text = (name: string) => {
    const data = files.get(name);
    return data ? new TextDecoder().decode(data) : "";
  };
  // First sheet in workbook order → its file via the relationships.
  const firstRid = text("xl/workbook.xml").match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const target = firstRid
    ? text("xl/_rels/workbook.xml.rels").match(new RegExp(`<Relationship\\b[^>]*Id="${firstRid}"[^>]*Target="([^"]+)"`))?.[1] ??
      text("xl/_rels/workbook.xml.rels").match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstRid}"`))?.[1]
    : undefined;
  const sheetName = target
    ? `xl/${target.replace(/^\/?xl\//, "").replace(/^\.\//, "")}`
    : [...files.keys()].filter((n) => n.startsWith("xl/worksheets/")).sort()[0];
  const sheet = sheetName ? text(sheetName) : "";
  if (!sheet) throw new Error("Excel dosyasında okunabilir bir sayfa bulunamadı.");

  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]));
  const rows: Rows = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const body = cell[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s" && v !== undefined) value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = runs(body);
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) value = decodeXml(v);
      const index = ref ? columnIndex(ref) : row.length;
      row[index] = value.trim();
    }
    if (row.some(Boolean)) rows.push(Array.from(row, (c) => c ?? ""));
  }
  return rows;
}

// ---------------------------------------------------------------- rows → guests

type Field = "name" | "first" | "last" | "group" | "dietary" | "rsvp" | "note" | "party";

const norm = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const HEADERS: Record<Field, string[]> = {
  name: ["ad soyad", "adi soyadi", "ad ve soyad", "isim soyisim", "isim soyad", "misafir", "misafir adi", "davetli", "davetli adi", "name", "full name", "guest", "guest name"],
  first: ["ad", "adi", "isim", "first name", "firstname", "given name"],
  last: ["soyad", "soyadi", "soyisim", "last name", "lastname", "surname", "family name"],
  group: ["grup", "taraf", "kategori", "iliski", "yakinlik", "group", "side", "category", "relation", "relationship", "tag"],
  dietary: ["diyet", "menu", "yemek", "yemek tercihi", "beslenme", "alerji", "dietary", "diet", "meal", "allergy", "allergies"],
  rsvp: ["lcv", "katilim", "katilim durumu", "durum", "geliyor mu", "rsvp", "attending", "attendance", "status", "response"],
  note: ["not", "notlar", "aciklama", "note", "notes", "comment", "comments"],
  party: ["kisi sayisi", "kisi", "davetli sayisi", "adet", "sayi", "party", "party size", "guests", "number of guests", "count", "pax"],
};

function headerField(cell: string): Field | null {
  const n = norm(cell);
  for (const field of Object.keys(HEADERS) as Field[]) if (HEADERS[field].includes(n)) return field;
  return null;
}

const YES = new Set(["evet", "geliyor", "gelecek", "katiliyor", "katilacak", "var", "e", "yes", "y", "attending", "accepted", "confirmed", "1", "true", "x", "✓", "✔"]);
const NO = new Set(["not attending", "hayir", "gelmiyor", "gelmeyecek", "katilmiyor", "katilmayacak", "yok", "h", "no", "n", "declined", "0", "false"]);

export function parseRsvp(value: string): Rsvp {
  const n = norm(value) || value.trim();
  if (YES.has(n)) return "yes";
  if (NO.has(n)) return "no";
  return "pending";
}

export interface ImportResult {
  guests: GuestInput[];
  /** Detected columns (only those found). */
  columns: Partial<Record<Field, number>>;
  headerRow: boolean;
}

/**
 * Turns rows into guests. Looks for a header row (Turkish or English column
 * names) in the first 5 rows; without one, column 1 is the name, 2 the group,
 * 3 the dietary note.
 */
export function rowsToGuests(rows: Rows): ImportResult {
  let headerIndex = -1;
  let columns: Partial<Record<Field, number>> = {};
  for (let i = 0; i < Math.min(5, rows.length); i += 1) {
    const found: Partial<Record<Field, number>> = {};
    rows[i].forEach((cell, col) => {
      const field = headerField(cell);
      if (field && found[field] === undefined) found[field] = col;
    });
    if (found.name !== undefined || found.first !== undefined) {
      headerIndex = i;
      columns = found;
      break;
    }
  }
  if (headerIndex < 0) columns = { name: 0, group: 1, dietary: 2 };

  const cell = (row: string[], field: Field) => {
    const col = columns[field];
    return col === undefined ? "" : (row[col] ?? "").trim();
  };
  const guests: GuestInput[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const name = (cell(row, "name") || [cell(row, "first"), cell(row, "last")].filter(Boolean).join(" ")).replace(/\s+/g, " ").trim();
    if (!name || /^\d+([.,]\d+)?$/.test(name)) continue;
    guests.push({
      name,
      group: cell(row, "group") || null,
      dietary: cell(row, "dietary") || null,
      rsvp: columns.rsvp === undefined ? "pending" : parseRsvp(cell(row, "rsvp")),
      note: cell(row, "note") || null,
      ...(columns.party !== undefined && /^\d{1,2}$/.test(cell(row, "party")) ? { party: Math.min(20, Math.max(1, Number(cell(row, "party")))) } : {}),
    });
    if (guests.length >= SEATING_LIMITS.guests) break;
  }
  return { guests, columns, headerRow: headerIndex >= 0 };
}

// ---------------------------------------------------------------- PDF text → rows

export interface TextItem {
  str: string;
  x: number;
  /** Baseline, PDF units (grows upwards). */
  y: number;
  width: number;
  height: number;
}

/**
 * Rebuilds table rows from positioned text (one page): items on the same
 * baseline form a line, and a wide horizontal gap starts a new cell.
 */
export function textItemsToRows(items: TextItem[]): Rows {
  const visible = items.filter((i) => i.str.trim());
  if (visible.length === 0) return [];
  const sorted = [...visible].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(2, item.height * 0.45);
    if (line && Math.abs(line[0].y - item.y) <= tolerance) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let lastEnd = -Infinity;
    for (const item of line.sort((a, b) => a.x - b.x)) {
      const gap = item.x - lastEnd;
      const charWidth = item.str.length ? item.width / item.str.length : item.height * 0.5;
      if (current && gap > Math.max(10, charWidth * 2.2)) {
        cells.push(current.trim());
        current = "";
      } else if (current && gap > charWidth * 0.2 && !current.endsWith(" ")) current += " ";
      current += item.str;
      lastEnd = item.x + item.width;
    }
    if (current.trim()) cells.push(current.trim());
    return cells;
  });
}
