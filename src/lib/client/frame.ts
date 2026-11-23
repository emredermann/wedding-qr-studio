"use client";

import type { ShareFrameDto } from "@/lib/branding";
import { saveBlob } from "@/lib/client/download";
import { BRAND } from "@/lib/brand";

/**
 * Canvas helpers for everything Mira draws from guest photos in the browser:
 * framed share copies, the highlights video, the photobook and the report.
 * Pixels come from the same-origin thumbnail proxy (`raw=1`), so the canvas
 * is never tainted. Originals in Google Drive are never modified.
 */

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi."));
    img.src = src;
  });
}

/** A guest photo as a drawable image (longest side ≈ `size` px). */
export function loadPhoto(fileId: string, size = 1600): Promise<HTMLImageElement> {
  return loadImage(`/api/drive/thumb/${encodeURIComponent(fileId)}?s=${size}&raw=1`);
}

/** Loads an optional image (brand logo); failures simply mean "no logo". */
export async function loadOptionalImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return null;
  return loadImage(src).catch(() => null);
}

/** Draws `img` covering (crop) or fitting (letterbox) the rectangle. */
export function drawImageInRect(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
  mode: "cover" | "contain" = "cover",
) {
  const scale = mode === "cover" ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, maxSize: number, maxWidth: number): number {
  let size = maxSize;
  ctx.font = font(size);
  while (size > 8 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = font(size);
  }
  return size;
}

/** Small "Mira ile" mark (free package). `dark` = drawn on a dark area. */
export function drawWatermark(ctx: CanvasRenderingContext2D, right: number, bottom: number, unit: number, dark: boolean) {
  const text = `${BRAND.name}`;
  ctx.save();
  ctx.font = `500 ${Math.round(unit * 1.25)}px ${SERIF}`;
  const tw = ctx.measureText(text).width;
  const padX = unit * 0.9;
  const h = unit * 2.2;
  const w = tw + padX * 2;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(28,27,24,0.08)";
  ctx.beginPath();
  ctx.roundRect(right - w, bottom - h, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = dark ? "#ffffff" : "#1c1b18";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, right - w / 2, bottom - h / 2 + unit * 0.05);
  ctx.restore();
}

export interface FrameContent {
  /** Caption when the host set none: "<event name> · <date>". */
  title: string;
  dateText: string | null;
  logo: HTMLImageElement | null;
}

/**
 * Draws `photo` inside the event's share frame and returns the canvas.
 * Output keeps the photo's aspect ratio; the frame adds borders/caption.
 */
export function drawFramedPhoto(photo: HTMLImageElement | HTMLCanvasElement, frame: ShareFrameDto, content: FrameContent): HTMLCanvasElement {
  const pw = (photo instanceof HTMLImageElement && photo.naturalWidth) || photo.width;
  const ph = (photo instanceof HTMLImageElement && photo.naturalHeight) || photo.height;
  const unit = Math.max(pw, ph) / 100;
  const caption = frame.text || [content.title, content.dateText].filter(Boolean).join(" · ");
  const logo = frame.showLogo ? content.logo : null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas desteklenmiyor.");

  if (frame.style === "none" || frame.style === "band") {
    canvas.width = pw;
    canvas.height = ph;
    ctx.drawImage(photo, 0, 0, pw, ph);
    if (frame.style === "band") {
      const bandH = unit * 12;
      const gradient = ctx.createLinearGradient(0, ph - bandH * 1.6, 0, ph);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,0.72)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, ph - bandH * 1.6, pw, bandH * 1.6);
      const left = unit * 4;
      let textLeft = left;
      if (logo) {
        const lh = unit * 6;
        const lw = (logo.width / logo.height) * lh;
        ctx.drawImage(logo, left, ph - unit * 4 - lh, lw, lh);
        textLeft = left + lw + unit * 2;
      }
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      fitText(ctx, caption, (s) => `600 ${s}px ${SANS}`, Math.round(unit * 3.2), pw - textLeft - unit * 18);
      ctx.fillText(caption, textLeft, ph - unit * 5);
      if (frame.watermark) drawWatermark(ctx, pw - unit * 3, ph - unit * 3, unit, true);
    } else if (frame.watermark) {
      drawWatermark(ctx, pw - unit * 3, ph - unit * 3, unit, true);
    }
    return canvas;
  }

  // classic / polaroid: paper border with a caption strip below the photo.
  const border = frame.style === "polaroid" ? unit * 5 : unit * 3;
  const strip = frame.style === "polaroid" ? unit * 20 : unit * 11;
  canvas.width = Math.round(pw + border * 2);
  canvas.height = Math.round(ph + border + strip);
  ctx.fillStyle = frame.style === "polaroid" ? "#fbfaf7" : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo, border, border, pw, ph);

  const stripTop = border + ph;
  const centerY = stripTop + strip / 2;
  const cw = canvas.width;
  ctx.fillStyle = "#1c1b18";
  ctx.textBaseline = "middle";
  if (logo) {
    const lh = strip * 0.42;
    const lw = Math.min((logo.width / logo.height) * lh, cw * 0.25);
    ctx.drawImage(logo, border, centerY - lh / 2, lw, lh);
  }
  ctx.textAlign = "center";
  const family = frame.style === "polaroid" ? SERIF : SANS;
  const weight = frame.style === "polaroid" ? "400" : "500";
  fitText(ctx, caption, (s) => `${weight} ${s}px ${family}`, Math.round(frame.style === "polaroid" ? unit * 4.2 : unit * 3), cw - border * 2 - (logo ? cw * 0.5 : unit * 20));
  ctx.fillText(caption, cw / 2, centerY);
  if (frame.watermark) drawWatermark(ctx, cw - border, stripTop + strip - border * 0.6, unit, false);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Görsel oluşturulamadı."))), type, quality),
  );
}

/** Native share sheet when the device supports sharing files, otherwise a download. */
export async function shareOrDownload(blob: Blob, fileName: string, title?: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (error) {
      // The user closed the sheet: nothing to do.
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  saveBlob(blob, fileName);
  return "downloaded";
}

/**
 * Logo upload: decodes the file, scales it to fit `maxSize` px and returns a
 * data URL under `maxChars` (PNG keeps transparency; WebP/JPEG if PNG is too big).
 */
export async function imageFileToDataUrl(file: File, maxSize = 512, maxChars = 280_000): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    // SVGs without intrinsic size report 0×0: draw them at the maximum size.
    const iw = img.width || maxSize;
    const ih = img.height || maxSize;
    const scale = Math.min(1, maxSize / Math.max(iw, ih));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(iw * scale));
    canvas.height = Math.max(1, Math.round(ih * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const [type, quality] of [["image/png", undefined], ["image/webp", 0.9], ["image/jpeg", 0.85], ["image/jpeg", 0.7]] as const) {
      const data = canvas.toDataURL(type, quality);
      if (data.startsWith(`data:${type}`) && data.length <= maxChars) return data;
    }
    throw new Error("Logo çok büyük.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A neutral placeholder "photo" for frame previews. */
export function samplePhoto(width = 1200, height = 900): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, "#d9cbb4");
    g.addColorStop(0.55, "#a89c8a");
    g.addColorStop(1, "#5c5448");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(width * 0.72, height * 0.3, height * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(40,36,30,0.35)";
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width * 0.35, height * 0.5);
    ctx.lineTo(width * 0.6, height * 0.75);
    ctx.lineTo(width * 0.8, height * 0.55);
    ctx.lineTo(width, height);
    ctx.fill();
  }
  return canvas;
}
