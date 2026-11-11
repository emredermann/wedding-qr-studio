"use client";

import { Download, FileDown, ImageUp, Loader2, Printer } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";

import { trackEvent } from "@/lib/client/analytics";
import { saveBlob } from "@/lib/client/download";
import { buildPdf, canvasToJpegBytes, PAGE_SIZES_PT, type PdfPage } from "@/lib/client/pdf";
import { useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";

type TemplateId = "klasik" | "modern" | "botanik" | "gece";
type FrameStyle = "yok" | "ince" | "cift" | "kose";
type CenterMode = "harfler" | "kalp" | "foto" | "yok";
type PaperSize = "A6" | "A5" | "A4x4";

interface Palette {
  background: string;
  text: string;
  accent: string;
  qr: string;
}

const TEMPLATES: Record<TemplateId, { name: MsgKey; palette: Palette; frame: FrameStyle; serifNames: boolean; leaves: boolean }> = {
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

function drawCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: CardOptions,
  qr: HTMLCanvasElement | null,
  photo: HTMLImageElement | null,
  tableNumber: string | null,
) {
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

  // Center badge (QR uses level H, so ~20% of the area may be covered safely)
  if (o.center !== "yok") {
    const cx = qrX + qrSize / 2;
    const cy = qrY + qrSize / 2;
    const r = qrSize * 0.12;
    ctx.fillStyle = "#FFFFFF";
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
    } else {
      ctx.fillStyle = o.palette.accent === "#FFFFFF" ? "#111111" : o.palette.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      if (o.center === "kalp" || (o.center === "foto" && !photo)) {
        drawHeart(ctx, cx, cy + r * 0.05, r * 1.1);
      } else {
        const text = o.initials.slice(0, 5) || "♥";
        ctx.textBaseline = "middle";
        fitFont(ctx, text, SERIF, "400", r * 0.95, r * 1.6);
        ctx.fillText(text, cx, cy + r * 0.04);
        ctx.textBaseline = "alphabetic";
      }
    }
  }

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
}: {
  url: string;
  coupleNames: string;
  dateText: string;
  themeColor: string;
  slug: string;
}) {
  const t = useT();
  const [template, setTemplate] = useState<TemplateId>("klasik");
  const [palette, setPalette] = useState<Palette>({ ...TEMPLATES.klasik.palette, accent: themeColor });
  const [frame, setFrame] = useState<FrameStyle>(TEMPLATES.klasik.frame);
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
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const tpl = TEMPLATES[template];
  const options: CardOptions = useMemo(
    () => ({
      palette,
      frame,
      serifNames: tpl.serifNames,
      leaves: tpl.leaves,
      center,
      initials,
      topText,
      names,
      dateText: date,
      description,
      tableLabel,
      showUrl,
      url,
    }),
    [palette, frame, tpl.serifNames, tpl.leaves, center, initials, topText, names, date, description, tableLabel, showUrl, url],
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
    const size = paper === "A5" ? CARD_PX.A5 : CARD_PX.A6;
    canvas.width = size.width;
    canvas.height = size.height;
    drawCard(ctx, size.width, size.height, options, qrRef.current, photo, tables[0] ?? null);
  }, [options, photo, tables, paper]);

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

  const renderCardCanvas = (tableNumber: string | null, size: { width: number; height: number }) => {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas desteklenmiyor.");
    drawCard(ctx, size.width, size.height, options, qrRef.current, photo, tableNumber);
    return canvas;
  };

  const exportPng = async () => {
    setExporting("png");
    try {
      const canvas = renderCardCanvas(tables[0] ?? null, paper === "A5" ? CARD_PX.A5 : CARD_PX.A6);
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
          list.slice(i, i + 4).forEach((table, j) => {
            const card = renderCardCanvas(table, CARD_PX.A6);
            ctx.drawImage(card, (j % 2) * CARD_PX.A6.width, Math.floor(j / 2) * CARD_PX.A6.height);
          });
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
          const canvas = renderCardCanvas(table, px);
          pages.push({ jpeg: await canvasToJpegBytes(canvas), pixelWidth: px.width, pixelHeight: px.height, pageWidthPt: pt.width, pageHeightPt: pt.height });
        }
      }
      saveBlob(buildPdf(pages), `masa-kartlari-${slug}.pdf`);
      trackEvent("qr_card_exported", { format: "pdf", cards: list.length });
    } finally {
      setExporting(null);
    }
  };

  const field = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";
  const label = "mb-1 block text-xs font-semibold text-stone-600";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="hidden">
        <QRCodeCanvas ref={qrRef} value={url} size={1024} level="H" fgColor={palette.qr} bgColor="#FFFFFF" marginSize={0} />
      </div>

      <div className="order-2 space-y-5 lg:order-1">
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
                  ♥
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
            <input value={topText} maxLength={40} onChange={(e) => setTopText(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("İsimler")}</span>
            <input value={names} maxLength={60} onChange={(e) => setNames(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("Tarih")}</span>
            <input value={date} maxLength={40} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-stone-700">
            <input type="checkbox" checked={showUrl} onChange={(e) => setShowUrl(e.target.checked)} className="h-4 w-4" /> {t("Bağlantıyı kartta göster")}
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>{t("Açıklama")}</span>
            <textarea value={description} maxLength={160} rows={2} onChange={(e) => setDescription(e.target.value)} className={field} />
          </label>
        </section>

        <section className="grid grid-cols-3 gap-3">
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
        </section>

        <section>
          <p className={label}>{t("Kâğıt boyutu")}</p>
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
        </section>
      </div>

      <div className="order-1 lg:order-2">
        <div className="sticky top-4 space-y-3">
          <canvas ref={previewRef} className="mx-auto block w-full max-w-sm rounded-lg shadow-xl ring-1 ring-stone-200" aria-label={t("Masa kartı önizlemesi")} />
          {tables.length > 1 && <p className="text-center text-xs text-stone-500">{t("{n} masa kartı oluşturulacak (önizleme: {label} {first})", { n: tables.length, label: tableLabel, first: tables[0] })}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={exportPng} disabled={exporting !== null} className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800">
              {exporting === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PNG
            </button>
            <button type="button" onClick={exportPdf} disabled={exporting !== null} className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">
              {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} {t("PDF (baskı)")}
            </button>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-stone-500">
            <Printer className="mt-px h-3.5 w-3.5 shrink-0" /> {t("300 DPI baskıya hazır. Yazdırırken “Gerçek boyut / %100” seçin. QR kodu yazdırdıktan sonra telefonla test edin.")}
          </p>
        </div>
      </div>
    </div>
  );
}
