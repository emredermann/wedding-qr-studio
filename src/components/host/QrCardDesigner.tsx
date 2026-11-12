"use client";

import { Download, FileDown, ImageUp, Loader2, Printer } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { trackEvent } from "@/lib/client/analytics";
import { saveBlob } from "@/lib/client/download";
import { loadScriptFonts, SCRIPT_FAMILY, SCRIPT_WEIGHT, type ScriptFont } from "@/lib/card-fonts";
import { buildPdf, canvasToJpegBytes, PAGE_SIZES_PT, type PdfPage } from "@/lib/client/pdf";
import { useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";
import { ui } from "@/components/ui/styles";

type TemplateId = "cizim" | "cicek" | "kalpler" | "klasik" | "modern" | "botanik" | "gece";
type CardArt = "camera" | "flowers" | "hearts";
type FrameStyle = "yok" | "ince" | "cift" | "kose";
type CenterMode = "harfler" | "kalp" | "foto" | "yok";
type PaperSize = "A6" | "A5" | "A4x4";
type BoardPaper = "A4" | "A3" | "P50x70";
type DesignKind = "tables" | "board";

/**
 * Entrance board sizes. A4 at 300 DPI; the larger ones are capped near
 * 12 MP (≈250 DPI for A3, ≈150 DPI for 50×70 cm, plenty at viewing distance)
 * so phones can still render them (iOS limits canvases to ~16.7 MP).
 */
const BOARD_PX: Record<BoardPaper, { width: number; height: number }> = {
  A4: { width: 2480, height: 3508 },
  A3: { width: 2924, height: 4134 },
  P50x70: { width: 2953, height: 4134 },
};

/** Entrance board link. With table numbers on it tells the guest page to forget a remembered table. */
export function boardUrl(url: string, perTable: boolean): string {
  return perTable ? `${url}${url.includes("?") ? "&" : "?"}entry=1` : url;
}

/** Guest link for one table card (`?table=N`), or the plain link. */
export function tableUrl(url: string, table: string | null, perTable: boolean): string {
  if (!perTable || !table) return url;
  return `${url}${url.includes("?") ? "&" : "?"}table=${encodeURIComponent(table)}`;
}

/**
 * Renders a QR code for `value` off-screen and returns a copy of its canvas.
 * Used when every table card needs its own code (qrcode.react paints in an
 * effect, so we give it a tick before copying).
 */
async function renderQrCanvas(value: string, fgColor: string, bgColor: string): Promise<HTMLCanvasElement> {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<QRCodeCanvas value={value} size={1024} level="H" fgColor={fgColor} bgColor={bgColor} marginSize={0} />));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const source = host.querySelector("canvas");
    if (!source) throw new Error("Canvas desteklenmiyor.");
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext("2d")?.drawImage(source, 0, 0);
    return copy;
  } finally {
    root.unmount();
  }
}

interface Palette {
  background: string;
  text: string;
  accent: string;
  qr: string;
}

interface TemplateDef {
  name: MsgKey;
  palette: Palette;
  frame: FrameStyle;
  serifNames: boolean;
  leaves: boolean;
  /** Hand-drawn layout: line illustration, curved handwritten heading, QR printed straight on paper. */
  script?: { art: CardArt; font: ScriptFont };
  /** Swatch glyph in the template picker. */
  glyph?: string;
}

const TEMPLATES: Record<TemplateId, TemplateDef> = {
  cizim: {
    name: "El çizimi",
    palette: { background: "#F6F3F7", text: "#1F2A5A", accent: "#B7A6D3", qr: "#1F2A5A" },
    frame: "ince",
    serifNames: false,
    leaves: false,
    script: { art: "camera", font: "caveat" },
    glyph: "📷",
  },
  cicek: {
    name: "Çiçek dalı",
    palette: { background: "#F8F5EE", text: "#3B4636", accent: "#9DB08A", qr: "#2F3B2C" },
    frame: "ince",
    serifNames: false,
    leaves: false,
    script: { art: "flowers", font: "vibes" },
    glyph: "🌿",
  },
  kalpler: {
    name: "Kalpler",
    palette: { background: "#FBF6F2", text: "#5A2E36", accent: "#D7A39E", qr: "#5A2E36" },
    frame: "ince",
    serifNames: false,
    leaves: false,
    script: { art: "hearts", font: "caveat" },
    glyph: "♡",
  },
  klasik: { name: "Klasik", palette: { background: "#FFFDF8", text: "#1C1917", accent: "#B45309", qr: "#1C1917" }, frame: "cift", serifNames: true, leaves: false },
  modern: { name: "Modern", palette: { background: "#FFFFFF", text: "#111827", accent: "#111827", qr: "#111827" }, frame: "ince", serifNames: false, leaves: false },
  botanik: { name: "Botanik", palette: { background: "#F7F5EE", text: "#1F2A1F", accent: "#4D6B48", qr: "#1F2A1F" }, frame: "kose", serifNames: true, leaves: true },
  gece: { name: "Gece & Altın", palette: { background: "#14120F", text: "#F5EBDD", accent: "#D4A84B", qr: "#14120F" }, frame: "cift", serifNames: true, leaves: false },
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** 300 DPI pixel sizes. */
const CARD_PX = {
  A6: { width: 1240, height: 1748 },
  A5: { width: 1748, height: 2480 },
} as const;

interface CardOptions {
  /** Set for hand-drawn templates. */
  script: { art: CardArt; family: string; weight: string } | null;
  palette: Palette;
  frame: FrameStyle;
  serifNames: boolean;
  leaves: boolean;
  center: CenterMode;
  initials: string;
  topText: string;
  names: string;
  dateText: string;
  description: string;
  tableLabel: string;
  showUrl: boolean;
  url: string;
}

function setSpacing(ctx: CanvasRenderingContext2D, value: string) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = value;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, weight: string, maxSize: number, maxWidth: number): number {
  let size = maxSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 10 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length + (line ? line.split(/\s+/).length : 0);
  if (line) lines.push(consumed < words.length ? `${line}…` : line);
  return lines.slice(0, maxLines);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.75);
  ctx.bezierCurveTo(cx - s * 1.3, cy - s * 0.1, cx - s * 0.6, cy - s * 1.05, cx, cy - s * 0.45);
  ctx.bezierCurveTo(cx + s * 0.6, cy - s * 1.05, cx + s * 1.3, cy - s * 0.1, cx, cy + s * 0.75);
  ctx.closePath();
  ctx.fill();
}

function drawLeafSprig(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3 * scale;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(60 * scale, 40 * scale, 150 * scale, 50 * scale);
  ctx.stroke();
  for (let i = 1; i <= 5; i += 1) {
    const t = i / 6;
    const px = 150 * scale * t;
    const py = 50 * scale * t * t + 20 * scale * t;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(side * 0.9 + 0.3);
      ctx.beginPath();
      ctx.ellipse(14 * scale, 0, 16 * scale, 6 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, style: FrameStyle, color: string) {
  const m = w * 0.045;
  ctx.strokeStyle = color;
  if (style === "ince") {
    ctx.lineWidth = w * 0.003;
    ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  } else if (style === "cift") {
    ctx.lineWidth = w * 0.004;
    ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
    ctx.lineWidth = w * 0.0015;
    const m2 = m + w * 0.014;
    ctx.strokeRect(m2, m2, w - 2 * m2, h - 2 * m2);
  } else if (style === "kose") {
    ctx.lineWidth = w * 0.004;
    const len = w * 0.13;
    const corners: Array<[number, number, number, number]> = [
      [m, m, 1, 1],
      [w - m, m, -1, 1],
      [m, h - m, 1, -1],
      [w - m, h - m, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x, y + dy * len);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * len, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + dx * w * 0.022, y + dy * w * 0.022, w * 0.006, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}

/**
 * Centre badge on the QR: initials, heart or photo. The QR uses error
 * correction level H, so ~20% of its area may be covered safely.
 */
function drawCenterBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  o: CardOptions,
  photo: HTMLImageElement | null,
  ringColor: string,
) {
  if (o.center === "yok") return;
  ctx.fillStyle = ringColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
  ctx.fill();
  if (o.center === "foto" && photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const side = Math.min(photo.naturalWidth, photo.naturalHeight);
    ctx.drawImage(photo, (photo.naturalWidth - side) / 2, (photo.naturalHeight - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    return;
  }
  ctx.fillStyle = o.palette.accent === "#FFFFFF" ? "#111111" : o.palette.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  if (o.center === "kalp" || o.center === "foto") {
    drawHeart(ctx, cx, cy + r * 0.05, r * 1.1);
  } else {
    const text = o.initials.slice(0, 5) || "♥";
    ctx.textBaseline = "middle";
    fitFont(ctx, text, o.script ? o.script.family : SERIF, o.script ? o.script.weight : "400", r * (o.script ? 1.15 : 0.95), r * 1.6);
    ctx.fillText(text, cx, cy + r * 0.04);
    ctx.textBaseline = "alphabetic";
  }
}

/** Small deterministic pseudo-random sequence (same texture on every render). */
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

/** Soft paper: a faint vignette and a few marbled veins. Kept light so the QR still scans. */
function drawPaper(ctx: CanvasRenderingContext2D, w: number, h: number, base: string) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.42, w * 0.1, w * 0.5, h * 0.5, h * 0.75);
  glow.addColorStop(0, "rgba(255,255,255,0.55)");
  glow.addColorStop(1, "rgba(120,110,130,0.05)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const rnd = seeded(7);
  ctx.lineCap = "round";
  for (let i = 0; i < 9; i += 1) {
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.3})`;
    ctx.lineWidth = w * (0.0015 + rnd() * 0.003);
    ctx.beginPath();
    const y0 = h * rnd();
    ctx.moveTo(-w * 0.1, y0);
    ctx.bezierCurveTo(w * 0.3, y0 + h * (rnd() - 0.5) * 0.4, w * 0.6, y0 + h * (rnd() - 0.5) * 0.4, w * 1.1, y0 + h * (rnd() - 0.5) * 0.3);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i += 1) {
    ctx.strokeStyle = "rgba(90,80,100,0.05)";
    ctx.lineWidth = w * 0.0012;
    ctx.beginPath();
    const x0 = w * rnd();
    ctx.moveTo(x0, -h * 0.05);
    ctx.bezierCurveTo(x0 + w * (rnd() - 0.5) * 0.6, h * 0.35, x0 + w * (rnd() - 0.5) * 0.6, h * 0.65, x0 + w * (rnd() - 0.5) * 0.4, h * 1.05);
    ctx.stroke();
  }
}

/** Line-art camera with flash sparks and a dotted strap. */
function drawCameraArt(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ink: string, lensFill: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  ctx.strokeStyle = ink;
  ctx.lineWidth = s * 0.018;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const bw = s;
  const bh = s * 0.62;
  // body + top hump
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, s * 0.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-bw * 0.22, -bh / 2);
  ctx.lineTo(-bw * 0.16, -bh / 2 - s * 0.12);
  ctx.lineTo(bw * 0.12, -bh / 2 - s * 0.12);
  ctx.lineTo(bw * 0.18, -bh / 2);
  ctx.stroke();
  // shutter button and viewfinder
  roundRect(ctx, bw * 0.26, -bh / 2 - s * 0.07, s * 0.14, s * 0.07, s * 0.02);
  ctx.stroke();
  roundRect(ctx, -bw * 0.42, -bh * 0.36, s * 0.16, s * 0.1, s * 0.02);
  ctx.stroke();
  // grip line
  ctx.beginPath();
  ctx.moveTo(-bw / 2, bh * 0.18);
  ctx.lineTo(bw / 2, bh * 0.18);
  ctx.stroke();
  // lens
  ctx.beginPath();
  ctx.arc(0, s * 0.02, s * 0.27, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, s * 0.02, s * 0.19, 0, Math.PI * 2);
  ctx.fillStyle = lensFill;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-s * 0.06, -s * 0.05, s * 0.045, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  // dotted strap below
  ctx.fillStyle = ink;
  for (let i = 0; i < 14; i += 1) {
    ctx.beginPath();
    ctx.arc(-bw * 0.45 + (i * bw * 0.9) / 13, bh / 2 + s * 0.09, s * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  // flash sparks
  ctx.lineWidth = s * 0.016;
  for (const [a, len] of [[-1.15, 0.13], [-0.75, 0.17], [-0.35, 0.13]] as const) {
    const r0 = s * 0.2;
    const ox = bw * 0.33;
    const oy = -bh / 2 - s * 0.14;
    ctx.beginPath();
    ctx.moveTo(ox + Math.cos(a) * r0, oy + Math.sin(a) * r0);
    ctx.lineTo(ox + Math.cos(a) * (r0 + s * len), oy + Math.sin(a) * (r0 + s * len));
    ctx.stroke();
  }
  ctx.restore();
}

/** One outline flower (five round petals) for the sprig. */
function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, r * 0.32, a, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

/** Two crossing line-art sprigs with leaves and small flowers. */
function drawFlowerArt(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ink: string, accent: string) {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = accent;
  ctx.lineCap = "round";
  ctx.lineWidth = s * 0.014;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(cx, cy + s * 0.25);
    ctx.scale(dir, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(s * 0.15, -s * 0.2, s * 0.35, -s * 0.35, s * 0.62, -s * 0.42);
    ctx.stroke();
    for (const [t, side] of [[0.25, 1], [0.42, -1], [0.58, 1], [0.74, -1]] as const) {
      const px = s * 0.62 * t;
      const py = -s * 0.42 * t - s * 0.06 * Math.sin(t * Math.PI);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.6 + side * 0.9);
      ctx.beginPath();
      ctx.ellipse(s * 0.06, 0, s * 0.07, s * 0.028, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawFlower(ctx, s * 0.64, -s * 0.43, s * 0.09);
    drawFlower(ctx, s * 0.33, -s * 0.33, s * 0.06);
    ctx.restore();
  }
  ctx.restore();
}

/** Three outline hearts with a few sparkles. */
function drawHeartsArt(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ink: string, accent: string) {
  const outline = (x: number, y: number, size: number, rot: number, fill: string | null) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    const t = size / 2;
    ctx.moveTo(0, t * 0.75);
    ctx.bezierCurveTo(-t * 1.15, -t * 0.05, -t * 0.55, -t * 0.95, 0, -t * 0.35);
    ctx.bezierCurveTo(t * 0.55, -t * 0.95, t * 1.15, -t * 0.05, 0, t * 0.75);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
  };
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = s * 0.016;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  outline(cx - s * 0.32, cy + s * 0.06, s * 0.32, -0.25, null);
  outline(cx, cy - s * 0.05, s * 0.48, 0.05, accent);
  outline(cx + s * 0.34, cy + s * 0.1, s * 0.26, 0.3, null);
  for (const [x, y, r] of [[-0.55, -0.2, 0.05], [0.55, -0.22, 0.06], [0.2, -0.38, 0.04]] as const) {
    const px = cx + s * x;
    const py = cy + s * y;
    ctx.beginPath();
    ctx.moveTo(px - s * r, py);
    ctx.lineTo(px + s * r, py);
    ctx.moveTo(px, py - s * r);
    ctx.lineTo(px, py + s * r);
    ctx.stroke();
  }
  ctx.restore();
}

/** Text along a gentle upward arc (each glyph rotated to the curve). */
function drawArcText(ctx: CanvasRenderingContext2D, text: string, cx: number, baselineY: number, radius: number) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const span = total / radius;
  let angle = -Math.PI / 2 - span / 2;
  const ox = cx;
  const oy = baselineY + radius;
  ctx.save();
  ctx.textAlign = "center";
  chars.forEach((c, i) => {
    const half = widths[i] / 2 / radius;
    angle += half;
    ctx.save();
    ctx.translate(ox + Math.cos(angle) * radius, oy + Math.sin(angle) * radius);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(c, 0, 0);
    ctx.restore();
    angle += half;
  });
  ctx.restore();
}

/** Hand-drawn layout: illustration, curved handwritten heading, QR straight on the paper, signature line. */
function drawScriptCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: CardOptions,
  qr: HTMLCanvasElement | null,
  photo: HTMLImageElement | null,
  tableNumber: string | null,
) {
  const script = o.script!;
  const font = (size: number) => `${script.weight} ${size}px ${script.family}`;
  ctx.save();
  drawPaper(ctx, w, h, o.palette.background);
  drawFrame(ctx, w, h, o.frame, o.palette.accent);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const maxText = w * 0.8;

  // Illustration
  if (script.art === "camera") drawCameraArt(ctx, w * 0.55, h * 0.185, w * 0.25, o.palette.text, o.palette.qr);
  else if (script.art === "flowers") drawFlowerArt(ctx, w * 0.5, h * 0.14, w * 0.42, o.palette.text, o.palette.accent);
  else drawHeartsArt(ctx, w * 0.5, h * 0.17, w * 0.4, o.palette.text, o.palette.accent);

  // Curved handwritten heading
  if (o.topText) {
    ctx.fillStyle = o.palette.text;
    let size = w * 0.085;
    ctx.font = font(size);
    while (ctx.measureText(o.topText).width > w * 0.78 && size > w * 0.035) {
      size *= 0.94;
      ctx.font = font(size);
    }
    drawArcText(ctx, o.topText, w / 2, h * 0.345, w * 0.95);
  }

  // QR printed straight on the paper (transparent background, no box)
  const qrSize = w * 0.46;
  const qrX = (w - qrSize) / 2;
  const qrY = h * 0.375;
  if (qr) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
    ctx.imageSmoothingEnabled = true;
  }
  drawCenterBadge(ctx, qrX + qrSize / 2, qrY + qrSize / 2, qrSize * 0.11, o, photo, o.palette.background);

  let y = qrY + qrSize + w * 0.075;
  if (o.description) {
    ctx.fillStyle = o.palette.text;
    ctx.globalAlpha = 0.72;
    ctx.font = `400 ${w * 0.026}px ${SANS}`;
    for (const line of wrapLines(ctx, o.description, w * 0.74, 3)) {
      ctx.fillText(line, w / 2, y);
      y += w * 0.038;
    }
    ctx.globalAlpha = 1;
  }

  if (tableNumber) {
    ctx.fillStyle = o.palette.text;
    const label = `${o.tableLabel} ${tableNumber}`.trim();
    fitFont(ctx, label, script.family, script.weight, w * 0.08, maxText);
    ctx.fillText(label, w / 2, h * 0.84);
  }

  // Signature line: names and date in handwriting
  const signature = [o.names, o.dateText].filter(Boolean).join("   ");
  if (signature) {
    ctx.fillStyle = o.palette.text;
    fitFont(ctx, signature, script.family, script.weight, w * 0.065, maxText);
    ctx.fillText(signature, w / 2, h * (tableNumber ? 0.905 : 0.895));
  }

  if (o.showUrl && o.url) {
    ctx.fillStyle = o.palette.text;
    ctx.globalAlpha = 0.5;
    const shortUrl = o.url.replace(/^https?:\/\//, "");
    fitFont(ctx, shortUrl, SANS, "400", w * 0.02, maxText);
    ctx.fillText(shortUrl, w / 2, h * 0.945);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: CardOptions,
  qr: HTMLCanvasElement | null,
  photo: HTMLImageElement | null,
  tableNumber: string | null,
) {
  if (o.script) {
    drawScriptCard(ctx, w, h, o, qr, photo, tableNumber);
    return;
  }
  ctx.save();
  ctx.fillStyle = o.palette.background;
  ctx.fillRect(0, 0, w, h);
  drawFrame(ctx, w, h, o.frame, o.palette.accent);
  if (o.leaves) {
    drawLeafSprig(ctx, w * 0.08, h * 0.07, w / 1240, 0.15, o.palette.accent);
    drawLeafSprig(ctx, w * 0.92, h * 0.93, w / 1240, Math.PI + 0.15, o.palette.accent);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const maxText = w * 0.8;

  if (o.topText) {
    ctx.fillStyle = o.palette.accent;
    setSpacing(ctx, `${Math.round(w * 0.006)}px`);
    fitFont(ctx, o.topText.toLocaleUpperCase("tr-TR"), SANS, "600", w * 0.032, maxText);
    ctx.fillText(o.topText.toLocaleUpperCase("tr-TR"), w / 2, h * 0.115);
    setSpacing(ctx, "0px");
  }

  if (o.names) {
    ctx.fillStyle = o.palette.text;
    const family = o.serifNames ? SERIF : SANS;
    fitFont(ctx, o.names, family, o.serifNames ? "400" : "700", w * 0.09, maxText);
    ctx.fillText(o.names, w / 2, h * 0.205);
  }

  if (o.dateText) {
    ctx.fillStyle = o.palette.text;
    ctx.globalAlpha = 0.75;
    fitFont(ctx, o.dateText, SANS, "400", w * 0.033, maxText);
    ctx.fillText(o.dateText, w / 2, h * 0.255);
    ctx.globalAlpha = 1;
  }

  // QR block
  const qrSize = w * 0.5;
  const pad = w * 0.035;
  const boxX = (w - qrSize) / 2 - pad;
  const boxY = h * 0.29;
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = w * 0.02;
  roundRect(ctx, boxX, boxY, qrSize + pad * 2, qrSize + pad * 2, w * 0.03);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  const qrX = boxX + pad;
  const qrY = boxY + pad;
  if (qr) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
    ctx.imageSmoothingEnabled = true;
  }

  drawCenterBadge(ctx, qrX + qrSize / 2, qrY + qrSize / 2, qrSize * 0.12, o, photo, "#FFFFFF");

  const afterQr = boxY + qrSize + pad * 2;
  if (o.description) {
    ctx.fillStyle = o.palette.text;
    ctx.font = `400 ${w * 0.032}px ${SANS}`;
    const lines = wrapLines(ctx, o.description, maxText, 3);
    lines.forEach((line, i) => ctx.fillText(line, w / 2, afterQr + w * 0.075 + i * w * 0.045));
  }

  if (tableNumber) {
    ctx.fillStyle = o.palette.accent;
    const label = `${o.tableLabel} ${tableNumber}`.trim();
    fitFont(ctx, label, SERIF, "400", w * 0.075, maxText);
    ctx.fillText(label, w / 2, h * 0.9);
  }

  if (o.showUrl && o.url) {
    ctx.fillStyle = o.palette.text;
    ctx.globalAlpha = 0.6;
    const shortUrl = o.url.replace(/^https?:\/\//, "");
    fitFont(ctx, shortUrl, SANS, "400", w * 0.022, maxText);
    ctx.fillText(shortUrl, w / 2, h * 0.945);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function initialsFrom(names: string): string {
  const parts = names.split(/\s*(?:&|ve|\+|,)\s*/i).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}&${parts[1][0] ?? ""}`.toLocaleUpperCase("tr-TR");
  return (names.trim()[0] ?? "♥").toLocaleUpperCase("tr-TR");
}

export function QrCardDesigner({
  url,
  coupleNames,
  dateText,
  themeColor,
  slug,
  tableNumbers,
}: {
  url: string;
  coupleNames: string;
  dateText: string;
  themeColor: string;
  slug: string;
  /** Event setting: each table card gets its own QR (?table=N). */
  tableNumbers: boolean;
}) {
  const t = useT();
  const [template, setTemplate] = useState<TemplateId>("cizim");
  const [palette, setPalette] = useState<Palette>({ ...TEMPLATES.cizim.palette });
  const [frame, setFrame] = useState<FrameStyle>(TEMPLATES.cizim.frame);
  // Handwritten faces must be loaded before the canvas can use them.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadScriptFonts().then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [center, setCenter] = useState<CenterMode>("harfler");
  const [initials, setInitials] = useState(() => initialsFrom(coupleNames));
  const [topText, setTopText] = useState(() => t("Anılarımızı paylaşın"));
  const [names, setNames] = useState(coupleNames);
  const [date, setDate] = useState(dateText);
  const [description, setDescription] = useState(() => t("Telefon kameranızla okutun; fotoğraf, video ve dileklerinizi uygulama indirmeden yükleyin."));
  const [tableLabel, setTableLabel] = useState(() => t("Masa"));
  const [tableFrom, setTableFrom] = useState("");
  const [tableTo, setTableTo] = useState("");
  const [showUrl, setShowUrl] = useState(true);
  const [paper, setPaper] = useState<PaperSize>("A6");
  const [kind, setKind] = useState<DesignKind>("tables");
  const [boardPaper, setBoardPaper] = useState<BoardPaper>("A3");
  const [boardTop, setBoardTop] = useState(() => t("Hoş geldiniz"));
  const [boardDescription, setBoardDescription] = useState(() =>
    t("Bu günün fotoğraflarını, videolarını ve dileklerinizi QR kodu okutarak bizimle paylaşın."),
  );
  const isBoard = kind === "board";
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const tpl = TEMPLATES[template];
  // Hand-drawn templates print the QR straight on the paper (no white box).
  const qrBackground = tpl.script ? "rgba(0,0,0,0)" : "#FFFFFF";
  const options: CardOptions = useMemo(
    () => ({
      script: tpl.script ? { art: tpl.script.art, family: SCRIPT_FAMILY[tpl.script.font], weight: SCRIPT_WEIGHT[tpl.script.font] } : null,
      palette,
      frame,
      serifNames: tpl.serifNames,
      leaves: tpl.leaves,
      center,
      initials,
      topText: isBoard ? boardTop : topText,
      names,
      dateText: date,
      description: isBoard ? boardDescription : description,
      tableLabel,
      showUrl,
      url,
    }),
    [tpl.script, palette, frame, tpl.serifNames, tpl.leaves, center, initials, isBoard, boardTop, topText, names, date, boardDescription, description, tableLabel, showUrl, url],
  );

  const tables = useMemo(() => {
    const from = Number.parseInt(tableFrom, 10);
    const to = Number.parseInt(tableTo || tableFrom, 10);
    if (!Number.isFinite(from) || from < 0) return [] as string[];
    const end = Number.isFinite(to) && to >= from ? Math.min(to, from + 199) : from;
    return Array.from({ length: end - from + 1 }, (_, i) => String(from + i));
  }, [tableFrom, tableTo]);

  useEffect(() => {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = isBoard ? BOARD_PX[boardPaper] : paper === "A5" ? CARD_PX.A5 : CARD_PX.A6;
    canvas.width = size.width;
    canvas.height = size.height;
    drawCard(ctx, size.width, size.height, options, qrRef.current, photo, isBoard ? null : (tables[0] ?? null));
    // fontsReady: redraw once the handwritten faces have loaded.
  }, [options, photo, tables, paper, isBoard, boardPaper, fontsReady]);

  const applyTemplate = (id: TemplateId) => {
    setTemplate(id);
    setPalette({ ...TEMPLATES[id].palette, accent: id === "klasik" ? themeColor : TEMPLATES[id].palette.accent });
    setFrame(TEMPLATES[id].frame);
  };

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    // Once decoded, the <img> keeps its pixels for canvas drawing, so the blob URL
    // can be released immediately (on success or failure) instead of leaking.
    const release = () => {
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(objectUrl);
    };
    img.onload = () => {
      release();
      setPhoto(img);
      setCenter("foto");
    };
    img.onerror = () => {
      release();
    };
    img.src = objectUrl;
  };

  const renderCardCanvas = async (tableNumber: string | null, size: { width: number; height: number }) => {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas desteklenmiyor.");
    // With table numbers on, every card carries its own code; otherwise one shared code.
    await loadScriptFonts();
    const qr = tableNumbers && tableNumber ? await renderQrCanvas(tableUrl(url, tableNumber, true), palette.qr, qrBackground) : qrRef.current;
    drawCard(ctx, size.width, size.height, options, qr, photo, tableNumber);
    return canvas;
  };

  /** Entrance board: one page, one shared QR (no table number). */
  const exportBoard = async (format: "png" | "pdf") => {
    setExporting(format);
    try {
      const px = BOARD_PX[boardPaper];
      const canvas = await renderCardCanvas(null, px);
      if (format === "png") {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (blob) saveBlob(blob, `giris-panosu-${slug}.png`);
      } else {
        const pt = PAGE_SIZES_PT[boardPaper];
        saveBlob(
          buildPdf([{ jpeg: await canvasToJpegBytes(canvas), pixelWidth: px.width, pixelHeight: px.height, pageWidthPt: pt.width, pageHeightPt: pt.height }]),
          `giris-panosu-${slug}.pdf`,
        );
      }
      trackEvent("qr_card_exported", { format, cards: 1 });
    } finally {
      setExporting(null);
    }
  };

  const exportPng = async () => {
    if (isBoard) return exportBoard("png");
    setExporting("png");
    try {
      const canvas = await renderCardCanvas(tables[0] ?? null, paper === "A5" ? CARD_PX.A5 : CARD_PX.A6);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) {
        saveBlob(blob, `masa-karti-${slug}${tables[0] ? `-${tables[0]}` : ""}.png`);
        trackEvent("qr_card_exported", { format: "png", cards: 1 });
      }
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (isBoard) return exportBoard("pdf");
    setExporting("pdf");
    try {
      const list: Array<string | null> = tables.length > 0 ? tables : [null];
      const pages: PdfPage[] = [];
      if (paper === "A4x4") {
        const sheet = { width: 2480, height: 3508 };
        for (let i = 0; i < list.length; i += 4) {
          const canvas = document.createElement("canvas");
          canvas.width = sheet.width;
          canvas.height = sheet.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas desteklenmiyor.");
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, sheet.width, sheet.height);
          const group = list.slice(i, i + 4);
          for (let j = 0; j < group.length; j += 1) {
            const card = await renderCardCanvas(group[j], CARD_PX.A6);
            ctx.drawImage(card, (j % 2) * CARD_PX.A6.width, Math.floor(j / 2) * CARD_PX.A6.height);
          }
          // Cut guides
          ctx.strokeStyle = "#BBBBBB";
          ctx.lineWidth = 2;
          ctx.setLineDash([16, 12]);
          ctx.beginPath();
          ctx.moveTo(CARD_PX.A6.width, 0);
          ctx.lineTo(CARD_PX.A6.width, sheet.height);
          ctx.moveTo(0, CARD_PX.A6.height);
          ctx.lineTo(sheet.width, CARD_PX.A6.height);
          ctx.stroke();
          pages.push({
            jpeg: await canvasToJpegBytes(canvas),
            pixelWidth: sheet.width,
            pixelHeight: sheet.height,
            pageWidthPt: PAGE_SIZES_PT.A4.width,
            pageHeightPt: PAGE_SIZES_PT.A4.height,
          });
        }
      } else {
        const px = paper === "A5" ? CARD_PX.A5 : CARD_PX.A6;
        const pt = PAGE_SIZES_PT[paper];
        for (const table of list) {
          const canvas = await renderCardCanvas(table, px);
          pages.push({ jpeg: await canvasToJpegBytes(canvas), pixelWidth: px.width, pixelHeight: px.height, pageWidthPt: pt.width, pageHeightPt: pt.height });
        }
      }
      saveBlob(buildPdf(pages), `masa-kartlari-${slug}.pdf`);
      trackEvent("qr_card_exported", { format: "pdf", cards: list.length });
    } finally {
      setExporting(null);
    }
  };

  const field = ui.inputCompact;
  const label = ui.label;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="hidden">
        <QRCodeCanvas ref={qrRef} value={isBoard ? boardUrl(url, tableNumbers) : tableUrl(url, tables[0] ?? null, tableNumbers)} size={1024} level="H" fgColor={palette.qr} bgColor={qrBackground} marginSize={0} />
      </div>

      <div className="order-2 space-y-5 lg:order-1">
        <section>
          <div className="flex rounded-full border border-stone-200 bg-white p-1 text-sm font-medium" role="tablist">
            {([
              ["tables", t("Masa kartları")],
              ["board", t("Giriş panosu")],
            ] as Array<[DesignKind, string]>).map(([id, text]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={kind === id}
                onClick={() => setKind(id)}
                className={`flex-1 rounded-full px-3 py-2 transition ${kind === id ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"}`}
              >
                {text}
              </button>
            ))}
          </div>
          {isBoard && <p className={`mt-2 ${ui.hint}`}>🚪 {t("Kapıya konacak tek bir QR. Okutan misafirin yüklemeleri ana albüme gider (masa numarası olmadan).")}</p>}
        </section>

        <section>
          <p className={label}>{t("Şablon")}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => applyTemplate(id)}
                className={`rounded-xl border p-2 text-left text-xs font-medium ${template === id ? "border-stone-900 ring-2 ring-stone-900" : "border-stone-300"}`}
              >
                <span className="mb-1.5 flex h-8 items-center justify-center rounded-lg" style={{ backgroundColor: TEMPLATES[id].palette.background, color: TEMPLATES[id].palette.accent, border: `1px solid ${TEMPLATES[id].palette.accent}` }}>
                  {TEMPLATES[id].glyph ?? "♥"}
                </span>
                {t(TEMPLATES[id].name)}
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["background", "text", "accent", "qr"] as const).map((key) => (
            <label key={key} className="block">
              <span className={label}>{t(({ background: "Arka plan", text: "Yazı", accent: "Vurgu", qr: "QR rengi" } as const)[key])}</span>
              <input type="color" value={palette[key]} onChange={(e) => setPalette((p) => ({ ...p, [key]: e.target.value }))} className="h-10 w-full cursor-pointer rounded-xl border border-stone-300 bg-white p-1" />
            </label>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>{t("Çerçeve")}</span>
            <select value={frame} onChange={(e) => setFrame(e.target.value as FrameStyle)} className={field}>
              <option value="yok">{t("Yok")}</option>
              <option value="ince">{t("İnce çizgi")}</option>
              <option value="cift">{t("Çift çizgi")}</option>
              <option value="kose">{t("Köşe süsü")}</option>
            </select>
          </label>
          <label className="block">
            <span className={label}>{t("QR ortası")}</span>
            <select value={center} onChange={(e) => setCenter(e.target.value as CenterMode)} className={field}>
              <option value="harfler">{t("Baş harfler")}</option>
              <option value="kalp">{t("Kalp")}</option>
              <option value="foto">{t("Fotoğraf")}</option>
              <option value="yok">{t("Boş")}</option>
            </select>
          </label>
          {center === "harfler" && (
            <label className="block">
              <span className={label}>{t("Baş harfler")}</span>
              <input value={initials} maxLength={5} onChange={(e) => setInitials(e.target.value)} className={field} />
            </label>
          )}
          {center === "foto" && (
            <label className="block">
              <span className={label}>{t("Fotoğraf")}</span>
              <span className={`${field} flex cursor-pointer items-center gap-2`}>
                <ImageUp className="h-4 w-4" /> {photo ? t("Değiştir") : t("Fotoğraf seç")}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
              </span>
            </label>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>{t("Üst başlık")}</span>
            <input value={isBoard ? boardTop : topText} maxLength={40} onChange={(e) => (isBoard ? setBoardTop : setTopText)(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("İsimler")}</span>
            <input value={names} maxLength={60} onChange={(e) => setNames(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("Tarih")}</span>
            <input value={date} maxLength={40} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="flex cursor-pointer items-end gap-2 pb-2.5 text-sm text-stone-700">
            <input type="checkbox" checked={showUrl} onChange={(e) => setShowUrl(e.target.checked)} className={ui.checkbox} /> {t("Bağlantıyı kartta göster")}
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>{t("Açıklama")}</span>
            <textarea value={isBoard ? boardDescription : description} maxLength={160} rows={2} onChange={(e) => (isBoard ? setBoardDescription : setDescription)(e.target.value)} className={field} />
          </label>
        </section>

        <section className={isBoard ? "hidden" : "grid grid-cols-3 gap-3"}>
          {!isBoard && (<>
          <p className="col-span-full rounded-xl bg-stone-100 px-3 py-2 text-[11px] text-stone-600">
            🪑 {tableNumbers ? t("Masa numaraları açık: her kartın QR kodu kendi masasını taşır. Masa no aralığını girin.") : t("Tüm kartlarda aynı QR kodu kullanılır. Masaya özel QR için Ayarlar’da “Masa numaraları”nı açın.")}
          </p>
          <label className="block">
            <span className={label}>{t("Masa etiketi")}</span>
            <input value={tableLabel} maxLength={16} onChange={(e) => setTableLabel(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("Masa no (başlangıç)")}</span>
            <input value={tableFrom} inputMode="numeric" placeholder={t("ör. 1")} onChange={(e) => setTableFrom(e.target.value.replace(/\D/g, "").slice(0, 3))} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("Bitiş (isteğe bağlı)")}</span>
            <input value={tableTo} inputMode="numeric" placeholder={t("ör. 20")} onChange={(e) => setTableTo(e.target.value.replace(/\D/g, "").slice(0, 3))} className={field} />
          </label>
          </>)}
        </section>

        <section>
          <p className={label}>{t("Kâğıt boyutu")}</p>
          {isBoard ? (
          <div className="flex flex-wrap gap-2">
            {([
              ["A4", t("A4 (21×29,7 cm)")],
              ["A3", t("A3 (29,7×42 cm)")],
              ["P50x70", t("Poster (50×70 cm)")],
            ] as Array<[BoardPaper, string]>).map(([id, text]) => (
              <button key={id} type="button" onClick={() => setBoardPaper(id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${boardPaper === id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"}`}>
                {text}
              </button>
            ))}
          </div>
          ) : (
          <div className="flex flex-wrap gap-2">
            {([
              ["A6", t("A6 (10,5×14,8 cm)")],
              ["A5", t("A5 (14,8×21 cm)")],
              ["A4x4", t("A4'e 4 kart")],
            ] as Array<[PaperSize, string]>).map(([id, text]) => (
              <button key={id} type="button" onClick={() => setPaper(id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${paper === id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"}`}>
                {text}
              </button>
            ))}
          </div>
          )}
        </section>
      </div>

      <div className="order-1 lg:order-2">
        <div className="sticky top-4 space-y-3">
          <canvas ref={previewRef} className="mx-auto block w-full max-w-sm rounded-lg shadow-xl ring-1 ring-stone-200" aria-label={isBoard ? t("Giriş panosu önizlemesi") : t("Masa kartı önizlemesi")} />
          {!isBoard && tables.length > 1 && <p className="text-center text-xs text-stone-500">{t("{n} masa kartı oluşturulacak (önizleme: {label} {first})", { n: tables.length, label: tableLabel, first: tables[0] })}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={exportPng} disabled={exporting !== null} className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800">
              {exporting === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PNG
            </button>
            <button type="button" onClick={exportPdf} disabled={exporting !== null} className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">
              {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} {t("PDF (baskı)")}
            </button>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-stone-500">
            <Printer className="mt-px h-3.5 w-3.5 shrink-0" />{" "}
            {isBoard
              ? t("Büyük boy baskıya hazır PDF. Matbaada “Gerçek boyut” ile basın; QR kodu bastıktan sonra telefonla test edin.")
              : t("300 DPI baskıya hazır. Yazdırırken “Gerçek boyut / %100” seçin. QR kodu yazdırdıktan sonra telefonla test edin.")}
          </p>
        </div>
      </div>
    </div>
  );
}
