"use client";

import { parseCsv, readXlsx, rowsToGuests, textItemsToRows, type ImportResult, type Rows, type TextItem } from "@/lib/seating/import";

/** Max file size accepted for a guest list (a few thousand rows fit easily). */
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** UTF-8 first; Excel on Turkish Windows saves CSV as Windows-1254, so fall back when UTF-8 looks broken. */
function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("windows-1254").decode(bytes);
  } catch {
    return utf8;
  }
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

async function readPdf(bytes: Uint8Array): Promise<Rows> {
  // Loaded only when a PDF is picked. The worker module runs on the main
  // thread (pdf.js "fake worker"), which avoids bundling a separate worker URL;
  // guest lists are small.
  const pdfjs = await import("pdfjs-dist");
  const g = globalThis as typeof globalThis & { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs");
  // pdf.js 6 never evaluates code from the PDF (no isEvalSupported option any more).
  const task = pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: false, enableXfa: false });
  const doc = await task.promise;
  const rows: Rows = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 50); n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: TextItem[] = (content.items as unknown[])
        .filter((i): i is PdfTextItem => typeof (i as PdfTextItem).str === "string")
        .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width, height: Math.abs(i.height) || Math.abs(i.transform[3]) || 10 }));
      rows.push(...textItemsToRows(items));
    }
  } finally {
    await task.destroy();
  }
  return rows;
}

export type ImportKind = "csv" | "xlsx" | "pdf";

export function importKind(file: File): ImportKind | "xls" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return "xlsx";
  if (name.endsWith(".xls")) return "xls";
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) return "csv";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  return null;
}

/** Reads a guest list file (Excel .xlsx, CSV/TXT or a PDF with a table). Error messages are Turkish keys. */
export async function readGuestFile(file: File): Promise<ImportResult & { kind: ImportKind }> {
  const kind = importKind(file);
  if (kind === "xls") throw new Error("Eski .xls biçimi desteklenmiyor. Dosyayı Excel'de .xlsx veya CSV olarak kaydedip tekrar deneyin.");
  if (!kind) throw new Error("Bu dosya türü desteklenmiyor. Excel (.xlsx), CSV veya PDF seçin.");
  if (file.size > MAX_IMPORT_BYTES) throw new Error("Dosya çok büyük (en fazla 15 MB).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let rows: string[][];
  try {
    rows = kind === "xlsx" ? await readXlsx(bytes, inflateRaw) : kind === "pdf" ? await readPdf(bytes) : parseCsv(decodeText(bytes));
  } catch (error) {
    // Our own messages pass through; library errors (corrupt zip, encrypted PDF…) get a readable one.
    if (error instanceof Error && /^(Dosya|Excel)/.test(error.message)) throw error;
    throw new Error(kind === "pdf" ? "PDF okunamadı. Dosya şifreli ya da bozuk olabilir." : "Dosya okunamadı. Geçerli bir Excel (.xlsx) dosyası seçin.");
  }
  const result = rowsToGuests(rows);
  if (result.guests.length === 0) {
    throw new Error(
      kind === "pdf"
        ? "PDF'te misafir listesi bulunamadı. Taranmış (fotoğraf) PDF'ler okunamaz; listeyi Excel veya CSV olarak yüklemeyi deneyin."
        : "Dosyada misafir bulunamadı. İlk sütunda ya da “Ad Soyad” başlıklı sütunda isimler olmalı.",
    );
  }
  return { ...result, kind };
}
