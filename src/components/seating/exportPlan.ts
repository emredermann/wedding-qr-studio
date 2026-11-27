"use client";

import { csvCell } from "@/lib/csv";
import { planBounds } from "@/lib/seating/geometry";
import { occupants } from "@/lib/seating/ops";
import type { SeatingPlan } from "@/lib/seating/schema";

const PAD = 60;
const FONT = "Geist, 'Helvetica Neue', Arial, sans-serif";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFileName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return base || "oturma-plani";
}

/**
 * A standalone SVG of the whole plan (not just the visible part): the live
 * canvas is cloned, editor-only layers (`data-export-ignore`: grid, selection
 * handles) are removed and the view is reset to the plan's bounds.
 */
export function buildPlanSvg(live: SVGSVGElement, plan: SeatingPlan, title: string): { svg: string; width: number; height: number } {
  const box = planBounds(plan) ?? { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  const titleSpace = title ? 56 : 0;
  const x = box.minX - PAD;
  const y = box.minY - PAD - titleSpace;
  const width = Math.ceil(box.maxX - box.minX + PAD * 2);
  const height = Math.ceil(box.maxY - box.minY + PAD * 2 + titleSpace);

  const clone = live.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-export-ignore]").forEach((el) => el.remove());
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("font-family", FONT);
  clone.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));
  clone.querySelector("[data-world]")?.removeAttribute("transform");

  const ns = "http://www.w3.org/2000/svg";
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("x", String(x));
  bg.setAttribute("y", String(y));
  bg.setAttribute("width", String(width));
  bg.setAttribute("height", String(height));
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.querySelector("[data-world]"));
  if (title) {
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(x + width / 2));
    text.setAttribute("y", String(y + PAD * 0.5 + 24));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "30");
    text.setAttribute("font-weight", "600");
    text.setAttribute("fill", "#2c2a26");
    text.textContent = title;
    clone.appendChild(text);
  }
  return { svg: new XMLSerializer().serializeToString(clone), width, height };
}

export async function exportPng(live: SVGSVGElement, plan: SeatingPlan, title: string, filename: string) {
  const { svg, width, height } = buildPlanSvg(live, plan, title);
  // Large halls: keep the bitmap under ~40 MP so mobile browsers can draw it.
  const scale = Math.max(0.5, Math.min(2, Math.sqrt(40_000_000 / (width * height))));
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Görsel oluşturulamadı."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Görsel oluşturulamadı.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Görsel oluşturulamadı.");
    downloadBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Opens a print view (the browser's "Save as PDF" makes the PDF): the plan
 * on the first page, then the guest list of every table.
 */
export function printPlan(
  live: SVGSVGElement,
  plan: SeatingPlan,
  title: string,
  labels: { tables: string; unassigned: string; seat: string; empty: string; lang: string },
): boolean {
  const { svg } = buildPlanSvg(live, plan, "");
  const seated = occupants(plan);
  const tables = plan.tables
    .map((table) => {
      const rows = Array.from({ length: table.seats }, (_, i) => seated.get(`${table.id}:${i}`))
        .map((g, i) => (g ? `<li><span>${i + 1}</span>${escapeHtml(g.name)}${g.dietary ? ` <em>· ${escapeHtml(g.dietary)}</em>` : ""}</li>` : ""))
        .join("");
      return `<section><h3>${escapeHtml(table.name)}</h3><ol>${rows || `<li class="muted">${escapeHtml(labels.empty)}</li>`}</ol></section>`;
    })
    .join("");
  const unassigned = plan.guests.filter((g) => !g.seat);
  const html = `<!doctype html><html lang="${labels.lang}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: ${FONT}; color: #2c2a26; margin: 0; }
  h1 { font-size: 22px; font-weight: 600; margin: 0 0 12px; text-align: center; }
  .plan { page-break-after: always; }
  .plan svg { width: 100%; height: auto; max-height: 250mm; display: block; }
  h2 { font-size: 16px; margin: 0 0 10px; }
  .grid { columns: 3 180px; column-gap: 18px; }
  section { break-inside: avoid; margin: 0 0 14px; }
  h3 { font-size: 13px; margin: 0 0 4px; border-bottom: 1px solid #e2ded5; padding-bottom: 3px; }
  ol { list-style: none; padding: 0; margin: 0; font-size: 12px; line-height: 1.55; }
  li span { display: inline-block; width: 22px; color: #a19c92; font-variant-numeric: tabular-nums; }
  em { color: #78736a; font-style: normal; }
  .muted { color: #a19c92; }
</style></head><body>
<div class="plan"><h1>${escapeHtml(title)}</h1>${svg}</div>
<h2>${escapeHtml(labels.tables)}</h2><div class="grid">${tables}${
    unassigned.length
      ? `<section><h3>${escapeHtml(labels.unassigned)}</h3><ol>${unassigned.map((g) => `<li>${escapeHtml(g.name)}</li>`).join("")}</ol></section>`
      : ""
  }</div>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),150));</script>
</body></html>`;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

export function exportJson(plan: SeatingPlan, filename: string) {
  const data = { format: "mira-seating-plan", version: 1, exportedAt: new Date().toISOString(), plan };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}

/** Accepts our own export or a bare plan object. */
export function planFromJson(text: string): unknown {
  const data = JSON.parse(text) as unknown;
  if (data && typeof data === "object" && "plan" in data && (data as { format?: unknown }).format === "mira-seating-plan") {
    return (data as { plan: unknown }).plan;
  }
  return data;
}


/** Guest list as CSV (semicolon-separated + BOM, so Excel in Turkish locale opens it correctly). */
export function guestsCsv(plan: SeatingPlan, header: string[], rsvpLabel: (r: SeatingPlan["guests"][number]["rsvp"]) => string): Blob {
  const tableName = new Map(plan.tables.map((x) => [x.id, x.name]));
  const lines = [header.map(csvCell).join(";")];
  for (const g of plan.guests) {
    lines.push(
      [g.name, g.group ?? "", g.dietary ?? "", rsvpLabel(g.rsvp), g.seat ? (tableName.get(g.seat.tableId) ?? "") : "", g.seat ? String(g.seat.seat + 1) : "", g.note ?? ""]
        .map(csvCell)
        .join(";"),
    );
  }
  return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}
