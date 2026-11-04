"use client";

import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  Heart,
  Layers,
  Palette,
  Printer,
  QrCode,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EventThemeConfig } from "@/types/flow";

export type QrCardThemeId =
  | "event_custom"
  | "minimalist_modern"
  | "romantic_botanical"
  | "classic_editorial"
  | "midnight_gold";

export type QrCenterBadgeMode = "monogram" | "heart" | "none";

interface QrCardThemeSpec {
  id: QrCardThemeId;
  name: string;
  tagline: string;
  background: string;
  border: string;
  accent: string;
  textPrimary: string;
  textSecondary: string;
  qrFg: string;
  qrBg: string;
  titleFont: string;
  bodyFont: string;
}

const CARD_THEMES: ReadonlyArray<QrCardThemeSpec> = [
  {
    id: "classic_editorial",
    name: "Classic Editorial",
    tagline: "Timeless black-tie serif typography & gold hairline frame",
    background: "#FFFDF9",
    border: "#B45309",
    accent: "#92400E",
    textPrimary: "#18181B",
    textSecondary: "#713F12",
    qrFg: "#18181B",
    qrBg: "#FFFFFF",
    titleFont: "700 90px Georgia, 'Times New Roman', serif",
    bodyFont: "500 34px Georgia, 'Times New Roman', serif",
  },
  {
    id: "minimalist_modern",
    name: "Minimalist Modern",
    tagline: "Crisp architectural lines & warm gallery ivory",
    background: "#FAF8F5",
    border: "#292524",
    accent: "#78716C",
    textPrimary: "#1C1917",
    textSecondary: "#57534E",
    qrFg: "#1C1917",
    qrBg: "#FFFFFF",
    titleFont: "600 84px Georgia, 'Times New Roman', serif",
    bodyFont: "500 34px system-ui, -apple-system, sans-serif",
  },
  {
    id: "romantic_botanical",
    name: "Romantic Botanical",
    tagline: "Soft sage leaf motifs & organic botanical borders",
    background: "#F4F6F2",
    border: "#4B6043",
    accent: "#657E5B",
    textPrimary: "#243020",
    textSecondary: "#4B6043",
    qrFg: "#243020",
    qrBg: "#FFFFFF",
    titleFont: "italic 600 88px Georgia, 'Times New Roman', serif",
    bodyFont: "400 34px Georgia, 'Times New Roman', serif",
  },
  {
    id: "midnight_gold",
    name: "Midnight Luxury",
    tagline: "Deep obsidian velvet card with champagne gold foil accents",
    background: "#141210",
    border: "#D97706",
    accent: "#F59E0B",
    textPrimary: "#FAF8F5",
    textSecondary: "#D6D3D1",
    qrFg: "#18181B",
    qrBg: "#FFFFFF",
    titleFont: "700 88px Georgia, 'Times New Roman', serif",
    bodyFont: "400 33px Georgia, 'Times New Roman', serif",
  },
];

// 5 x 7 inches at 300 DPI = 1500 x 2100 pixels
const CARD_WIDTH_PX = 1500;
const CARD_HEIGHT_PX = 2100;
const QR_SOURCE_SIZE_PX = 1024;

export interface QrCardBuilderProps {
  albumSlug: string;
  defaultCoupleNames: string;
  defaultEventDate: string | null;
  eventThemeConfig?: EventThemeConfig;
}

function parseHexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length === 3) {
    const r = Number.parseInt(cleaned[0] + cleaned[0], 16) || 0;
    const g = Number.parseInt(cleaned[1] + cleaned[1], 16) || 0;
    const b = Number.parseInt(cleaned[2] + cleaned[2], 16) || 0;
    return [r, g, b];
  }
  const r = Number.parseInt(cleaned.slice(0, 2), 16) || 0;
  const g = Number.parseInt(cleaned.slice(2, 4), 16) || 0;
  const b = Number.parseInt(cleaned.slice(4, 6), 16) || 0;
  return [r, g, b];
}

function getRelativeLuminance(hex: string): number {
  const [r, g, b] = parseHexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = getRelativeLuminance(hexA);
  const l2 = getRelativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Ensures `foreground` achieves at least `minRatio` contrast against `background`.
 * Falls back to crisp obsidian (`#18181B`) on light cards or ivory (`#FAF8F5`) on dark cards.
 */
function ensurePrintContrast(foreground: string, background: string, minRatio = 4.5): string {
  if (getContrastRatio(foreground, background) >= minRatio) {
    return foreground;
  }
  const bgLuminance = getRelativeLuminance(background);
  return bgLuminance > 0.35 ? "#18181B" : "#FAF8F5";
}

function extractMonogram(names: string): string {
  const cleaned = names.trim();
  if (!cleaned) return "W&Q";
  const parts = cleaned
    .split(/\s*(?:&|\+|and|ve|-|—)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]?.toUpperCase() ?? ""}&${parts[1][0]?.toUpperCase() ?? ""}`;
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function QrCardBuilder({
  albumSlug,
  defaultCoupleNames,
  defaultEventDate,
  eventThemeConfig,
}: QrCardBuilderProps) {
  const [selectedThemeId, setSelectedThemeId] = useState<QrCardThemeId>(
    eventThemeConfig ? "event_custom" : "classic_editorial",
  );
  const [coupleNames, setCoupleNames] = useState<string>(defaultCoupleNames || "Clara & Julian");
  const [dateLabel, setDateLabel] = useState<string>(
    defaultEventDate
      ? new Date(defaultEventDate).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "September 12, 2026",
  );
  const [subtitle, setSubtitle] = useState<string>(
    "Scan with your phone camera to share your photos, videos & voice toasts — no app required.",
  );
  const [headerEyebrow, setHeaderEyebrow] = useState<string>("CAPTURE THE LOVE");
  const [tableLabel, setTableLabel] = useState<string>("");
  const [centerBadgeMode, setCenterBadgeMode] = useState<QrCenterBadgeMode>("monogram");
  const [customMonogram, setCustomMonogram] = useState<string>("");
  const [previewMode, setPreviewMode] = useState<"card" | "qr_only">("card");

  const [baseUrl, setBaseUrl] = useState<string>(() =>
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "http://localhost:3000",
  );
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [copiedImage, setCopiedImage] = useState<boolean>(false);
  const [batchStartTable, setBatchStartTable] = useState<number>(1);
  const [batchEndTable, setBatchEndTable] = useState<number>(10);
  const [batchGenerating, setBatchGenerating] = useState<boolean>(false);

  const qrSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrSvgContainerRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const normalizedBaseUrl = useMemo(() => {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    if (!trimmed) return "http://localhost:3000";
    if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
  }, [baseUrl]);

  const buildGuestUrl = useCallback(
    (tableOverride?: string) => {
      const tbl = (tableOverride !== undefined ? tableOverride : tableLabel).trim();
      const base = `${normalizedBaseUrl}/e/${encodeURIComponent(albumSlug)}`;
      if (!tbl) return base;
      return `${base}?table=${encodeURIComponent(tbl)}`;
    },
    [albumSlug, normalizedBaseUrl, tableLabel],
  );

  const guestEventUrl = useMemo(() => buildGuestUrl(), [buildGuestUrl]);

  const allThemes = useMemo<ReadonlyArray<QrCardThemeSpec>>(() => {
    if (!eventThemeConfig) return CARD_THEMES;
    const bg = eventThemeConfig.backgroundColor || "#FAF8F5";
    const primary = eventThemeConfig.primaryColor || "#B45309";
    const rawText = eventThemeConfig.textColor || "#1C1917";

    const safeTextPrimary = ensurePrintContrast(rawText, bg, 7.0);
    const safeTextSecondary = ensurePrintContrast(primary, bg, 4.5);
    const safeBorder = ensurePrintContrast(primary, bg, 3.0);
    const safeQrFg = ensurePrintContrast(rawText, "#FFFFFF", 7.0);

    const customTheme: QrCardThemeSpec = {
      id: "event_custom",
      name: "Event Bespoke Theme",
      tagline: "Synced with your wedding theme palette & contrast-verified for 300 DPI print",
      background: bg,
      border: safeBorder,
      accent: safeTextSecondary,
      textPrimary: safeTextPrimary,
      textSecondary: safeTextSecondary,
      qrFg: safeQrFg,
      qrBg: "#FFFFFF",
      titleFont:
        eventThemeConfig.fontFamily === "sans"
          ? "700 84px system-ui, -apple-system, sans-serif"
          : "700 88px Georgia, 'Times New Roman', serif",
      bodyFont:
        eventThemeConfig.fontFamily === "sans"
          ? "500 34px system-ui, -apple-system, sans-serif"
          : "400 34px Georgia, 'Times New Roman', serif",
    };
    return [customTheme, ...CARD_THEMES];
  }, [eventThemeConfig]);

  const activeTheme = useMemo(
    () => allThemes.find((t) => t.id === selectedThemeId) ?? allThemes[0],
    [allThemes, selectedThemeId],
  );

  const resolvedMonogram = useMemo(
    () => (customMonogram.trim() ? customMonogram.trim().slice(0, 4) : extractMonogram(coupleNames)),
    [coupleNames, customMonogram],
  );

  const drawBotanicalCorners = (ctx: CanvasRenderingContext2D, color: string) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 4;

    const corners: ReadonlyArray<[number, number, number, number]> = [
      [140, 140, 1, 1],
      [CARD_WIDTH_PX - 140, 140, -1, 1],
      [140, CARD_HEIGHT_PX - 140, 1, -1],
      [CARD_WIDTH_PX - 140, CARD_HEIGHT_PX - 140, -1, -1],
    ];

    for (const [cx, cy, sx, sy] of corners) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sx, sy);

      ctx.beginPath();
      ctx.moveTo(0, 160);
      ctx.quadraticCurveTo(20, 20, 160, 0);
      ctx.stroke();

      for (const offset of [45, 95, 135]) {
        ctx.beginPath();
        ctx.ellipse(offset, 170 - offset, 22, 9, -Math.PI / 4, 0, Math.PI * 2);
        ctx.globalAlpha = 0.25;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  };

  const wrapCenteredText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    startY: number,
    maxWidth: number,
    lineHeight: number,
  ): number => {
    const words = text.trim().split(/\s+/);
    let currentLine = "";
    let y = startY;

    for (let i = 0; i < words.length; i += 1) {
      const candidate = currentLine ? `${currentLine} ${words[i]}` : words[i];
      const width = ctx.measureText(candidate).width;
      if (width > maxWidth && currentLine) {
        ctx.fillText(currentLine, centerX, y);
        currentLine = words[i];
        y += lineHeight;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) {
      ctx.fillText(currentLine, centerX, y);
    }
    return y;
  };

  const drawCenterBadgeOnQr = useCallback(
    (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, badgeSize: number) => {
      if (centerBadgeMode === "none") return;

      ctx.save();
      const radius = badgeSize / 2;

      // Outer white cushion
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 10, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();

      // Inner themed badge circle (contrast-checked so monogram is always crisp)
      const badgeBg =
        getRelativeLuminance(activeTheme.background) < 0.15 ? "#18181B" : activeTheme.background;
      const badgeFg = ensurePrintContrast(activeTheme.border, badgeBg, 4.5);

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = badgeBg;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = badgeFg;
      ctx.stroke();

      if (centerBadgeMode === "monogram") {
        ctx.fillStyle = badgeFg;
        ctx.font = `700 ${Math.round(badgeSize * 0.36)}px Georgia, 'Times New Roman', serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(resolvedMonogram, centerX, centerY + 2);
      } else if (centerBadgeMode === "heart") {
        ctx.fillStyle = badgeFg;
        ctx.font = `${Math.round(badgeSize * 0.48)}px Georgia, serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("♥", centerX, centerY + 4);
      }

      ctx.restore();
    },
    [activeTheme, centerBadgeMode, resolvedMonogram],
  );

  const renderCardToCanvas = useCallback(
    (targetCanvas?: HTMLCanvasElement | null, tableOverride?: string) => {
      const canvas = targetCanvas ?? previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const activeTableText = (tableOverride !== undefined ? tableOverride : tableLabel).trim();
      const activeUrl = buildGuestUrl(activeTableText);

      canvas.width = CARD_WIDTH_PX;
      canvas.height = CARD_HEIGHT_PX;

      // 1. Card background
      ctx.fillStyle = activeTheme.background;
      ctx.fillRect(0, 0, CARD_WIDTH_PX, CARD_HEIGHT_PX);

      // 2. Theme-specific framing
      if (activeTheme.id === "minimalist_modern") {
        ctx.strokeStyle = activeTheme.border;
        ctx.lineWidth = 6;
        ctx.strokeRect(84, 84, CARD_WIDTH_PX - 168, CARD_HEIGHT_PX - 168);
      } else if (activeTheme.id === "romantic_botanical") {
        ctx.strokeStyle = activeTheme.border;
        ctx.lineWidth = 3;
        ctx.strokeRect(110, 110, CARD_WIDTH_PX - 220, CARD_HEIGHT_PX - 220);
        drawBotanicalCorners(ctx, activeTheme.accent);
      } else {
        // Classic Editorial & Midnight Luxury double hairline frame
        ctx.strokeStyle = activeTheme.border;
        ctx.lineWidth = 5;
        ctx.strokeRect(80, 80, CARD_WIDTH_PX - 160, CARD_HEIGHT_PX - 160);
        ctx.lineWidth = 2;
        ctx.strokeRect(102, 102, CARD_WIDTH_PX - 204, CARD_HEIGHT_PX - 204);
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const centerX = CARD_WIDTH_PX / 2;

      // 3. Eyebrow header
      ctx.fillStyle = activeTheme.accent;
      ctx.font = "600 28px system-ui, -apple-system, sans-serif";
      ctx.fillText((headerEyebrow || "CAPTURE THE LOVE").toUpperCase().split("").join(" "), centerX, 255);

      // 4. Couple Names
      ctx.fillStyle = activeTheme.textPrimary;
      ctx.font = activeTheme.titleFont;
      wrapCenteredText(ctx, coupleNames || "Wedding Studio", centerX, 395, 1180, 100);

      // 5. Event Date & Optional Table Pill
      ctx.fillStyle = activeTheme.textSecondary;
      ctx.font = "500 32px Georgia, 'Times New Roman', serif";
      ctx.fillText(dateLabel, centerX, 515);

      if (activeTableText) {
        const pillText = /^table|masa/i.test(activeTableText)
          ? activeTableText.toUpperCase()
          : `TABLE ${activeTableText.toUpperCase()}`;
        ctx.font = "700 26px system-ui, -apple-system, sans-serif";
        const textWidth = ctx.measureText(pillText).width;
        const pillW = Math.max(240, textWidth + 72);
        const pillH = 54;
        const pillX = centerX - pillW / 2;
        const pillY = 550;

        ctx.fillStyle = activeTheme.border;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 27);
        ctx.fill();

        ctx.fillStyle = ensurePrintContrast("#FFFFFF", activeTheme.border, 4.5);
        ctx.fillText(pillText, centerX, pillY + 36);
      } else {
        ctx.strokeStyle = activeTheme.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX - 140, 575);
        ctx.lineTo(centerX + 140, 575);
        ctx.stroke();
      }

      // 6. High-DPI QR Code (Level H)
      const qrBoxSize = 680;
      const qrX = (CARD_WIDTH_PX - qrBoxSize) / 2;
      const qrY = 665;

      // White elevated mat behind QR code
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0, 0, 0, 0.14)";
      ctx.shadowBlur = 35;
      ctx.shadowOffsetY = 12;
      ctx.fillRect(qrX - 44, qrY - 44, qrBoxSize + 88, qrBoxSize + 88);
      ctx.shadowColor = "transparent";

      ctx.strokeStyle = activeTheme.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(qrX - 44, qrY - 44, qrBoxSize + 88, qrBoxSize + 88);

      const qrSourceCanvas = qrSourceCanvasRef.current;
      if (qrSourceCanvas && qrSourceCanvas.width > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(qrSourceCanvas, qrX, qrY, qrBoxSize, qrBoxSize);
        ctx.imageSmoothingEnabled = true;
      }

      // Draw optional center monogram/heart badge over QR code (Level H supports 30% occlusion)
      drawCenterBadgeOnQr(ctx, centerX, qrY + qrBoxSize / 2, 136);

      // 7. Call-to-action subtitle
      ctx.fillStyle = activeTheme.textPrimary;
      ctx.font = activeTheme.bodyFont;
      wrapCenteredText(ctx, subtitle, centerX, 1520, 1080, 52);

      // 8. Footer URL & Zero-App Badge
      ctx.fillStyle = activeTheme.accent;
      ctx.font = "600 26px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(activeUrl.replace(/^https?:\/\//, ""), centerX, 1840);

      ctx.fillStyle = activeTheme.textSecondary;
      ctx.font = "500 22px system-ui, -apple-system, sans-serif";
      ctx.fillText("100% FULL RESOLUTION · ZERO APP DOWNLOAD · AI FACE SEARCH", centerX, 1915);
    },
    [
      activeTheme,
      buildGuestUrl,
      coupleNames,
      dateLabel,
      drawCenterBadgeOnQr,
      headerEyebrow,
      subtitle,
      tableLabel,
    ],
  );

  // Re-render card after QRCodeCanvas updates its internal canvas
  useEffect(() => {
    const raf1 = window.requestAnimationFrame(() => {
      renderCardToCanvas();
    });
    const timer = window.setTimeout(() => {
      renderCardToCanvas();
    }, 60);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.clearTimeout(timer);
    };
  }, [renderCardToCanvas, guestEventUrl, activeTheme.qrFg]);

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleDownloadHighDpiPng = useCallback(() => {
    renderCardToCanvas();
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const suffix = tableLabel.trim()
      ? `-table-${tableLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
      : "";

    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerBlobDownload(blob, `${albumSlug}${suffix}-5x7-card-300dpi.png`);
    }, "image/png");
  }, [albumSlug, renderCardToCanvas, tableLabel]);

  const handleDownloadStandaloneQrPng = useCallback(() => {
    const source = qrSourceCanvasRef.current;
    if (!source) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = QR_SOURCE_SIZE_PX;
    exportCanvas.height = QR_SOURCE_SIZE_PX;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, QR_SOURCE_SIZE_PX, QR_SOURCE_SIZE_PX);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, QR_SOURCE_SIZE_PX, QR_SOURCE_SIZE_PX);
    drawCenterBadgeOnQr(ctx, QR_SOURCE_SIZE_PX / 2, QR_SOURCE_SIZE_PX / 2, 190);

    const suffix = tableLabel.trim()
      ? `-table-${tableLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
      : "";

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      triggerBlobDownload(blob, `${albumSlug}${suffix}-qr-1024px.png`);
    }, "image/png");
  }, [albumSlug, drawCenterBadgeOnQr, tableLabel]);

  const handleDownloadStandaloneQrSvg = useCallback(() => {
    const svgEl = qrSvgContainerRef.current?.querySelector("svg");
    if (!svgEl) return;

    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "1024");
    clone.setAttribute("height", "1024");

    const serializer = new XMLSerializer();
    const svgString = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });

    const suffix = tableLabel.trim()
      ? `-table-${tableLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
      : "";
    triggerBlobDownload(blob, `${albumSlug}${suffix}-qr-vector.svg`);
  }, [albumSlug, tableLabel]);

  const handleCopyGuestUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(guestEventUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Fallback if clipboard permission denied
    }
  }, [guestEventUrl]);

  const handleCopyCardImage = useCallback(async () => {
    renderCardToCanvas();
    const canvas = previewCanvasRef.current;
    if (!canvas || typeof ClipboardItem === "undefined") return;

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopiedImage(true);
        window.setTimeout(() => setCopiedImage(false), 2000);
      } catch {
        // Fallback if clipboard write not supported
      }
    }, "image/png");
  }, [renderCardToCanvas]);

  const handlePrintCard = useCallback(() => {
    renderCardToCanvas();
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");

    const printWin = window.open("", "_blank", "width=800,height=1000");
    if (!printWin) return;

    printWin.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>${coupleNames} — 5x7 Table QR Card</title>
    <style>
      @page { size: 5in 7in; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
      img { width: 5in; height: 7in; object-fit: contain; display: block; }
    </style>
  </head>
  <body>
    <img src="${dataUrl}" alt="QR Table Card" onload="window.focus(); window.print();" />
  </body>
</html>`);
    printWin.document.close();
  }, [coupleNames, renderCardToCanvas]);

  const handleBatchDownloadTableCards = useCallback(async () => {
    const start = Math.max(1, Math.min(200, Math.floor(batchStartTable)));
    const end = Math.max(start, Math.min(start + 24, Math.floor(batchEndTable)));
    setBatchGenerating(true);

    try {
      const originalTable = tableLabel;
      for (let tbl = start; tbl <= end; tbl += 1) {
        const tblStr = String(tbl);
        setTableLabel(tblStr);
        await new Promise((r) => window.setTimeout(r, 90));
        renderCardToCanvas(previewCanvasRef.current, tblStr);
        const canvas = previewCanvasRef.current;
        if (canvas) {
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/png"),
          );
          if (blob) {
            triggerBlobDownload(blob, `${albumSlug}-table-${tblStr}-5x7-300dpi.png`);
          }
        }
        await new Promise((r) => window.setTimeout(r, 180));
      }
      setTableLabel(originalTable);
    } finally {
      setBatchGenerating(false);
    }
  }, [albumSlug, batchEndTable, batchStartTable, renderCardToCanvas, tableLabel]);

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Offscreen high-res QRCodeCanvas & QRCodeSVG sources (kept mounted & measurable) */}
      <div
        className="pointer-events-none fixed -top-[9999px] -left-[9999px] opacity-0"
        aria-hidden="true"
      >
        <QRCodeCanvas
          ref={qrSourceCanvasRef}
          value={guestEventUrl}
          size={QR_SOURCE_SIZE_PX}
          level="H"
          marginSize={2}
          fgColor={activeTheme.qrFg}
          bgColor="#FFFFFF"
        />
        <div ref={qrSvgContainerRef}>
          <QRCodeSVG
            value={guestEventUrl}
            size={QR_SOURCE_SIZE_PX}
            level="H"
            marginSize={2}
            fgColor={activeTheme.qrFg}
            bgColor="#FFFFFF"
          />
        </div>
      </div>

      {/* Left Controls */}
      <div className="space-y-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-xs lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-stone-900">
                High-DPI Print QR &amp; Table Card Studio
              </h3>
              <p className="text-xs text-stone-500">
                300 DPI print-ready 5×7&quot; table cards (1500 × 2100 px) · Level-H error correction
              </p>
            </div>
          </div>

          <a
            href={guestEventUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-stone-50 px-3.5 py-1.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
          >
            <ExternalLink className="h-3.5 w-3.5 text-amber-700" />
            Test QR Target Link
          </a>
        </div>

        {/* 1. Target QR URL & Table Number */}
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              1. QR Target Link &amp; Table Assignment
            </label>
            <span className="font-mono text-[11px] text-amber-800">{guestEventUrl}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-7">
              <label className="block text-[11px] font-medium text-stone-600">
                Base Domain / Origin URL
              </label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") setBaseUrl(window.location.origin);
                  }}
                  title="Reset to current browser origin"
                  className="rounded-xl border border-stone-300 bg-white p-2 text-stone-600 hover:bg-stone-100"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="sm:col-span-5">
              <label className="block text-[11px] font-medium text-stone-600">
                Table Number / Label (Optional)
              </label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="text"
                  value={tableLabel}
                  onChange={(e) => setTableLabel(e.target.value)}
                  placeholder="e.g., 5 or VIP"
                  maxLength={24}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyGuestUrl()}
                  className="flex shrink-0 items-center gap-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy URL
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Theme Selector */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
            <Palette className="h-3.5 w-3.5" />
            2. Select Card Design Theme
          </label>
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            {allThemes.map((theme) => {
              const selected = theme.id === selectedThemeId;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setSelectedThemeId(theme.id)}
                  className={`rounded-2xl border p-3.5 text-left transition ${
                    selected
                      ? "border-amber-700 bg-amber-50/70 ring-2 ring-amber-700/20"
                      : "border-stone-200 bg-stone-50/60 hover:border-stone-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{ backgroundColor: theme.background }}
                        className="h-4 w-4 rounded-full border border-stone-300 shadow-2xs"
                      />
                      <span
                        style={{ backgroundColor: theme.border }}
                        className="h-4 w-4 rounded-full border border-white shadow-2xs"
                      />
                    </div>
                    {selected ? <Sparkles className="h-3.5 w-3.5 text-amber-700" /> : null}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-stone-900">{theme.name}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{theme.tagline}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Typography, Center Monogram & Copy Controls */}
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-stone-700">Eyebrow Header</label>
              <input
                type="text"
                value={headerEyebrow}
                onChange={(e) => setHeaderEyebrow(e.target.value)}
                maxLength={40}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700">
                QR Center Crest (Level-H Safe)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={centerBadgeMode}
                  onChange={(e) => setCenterBadgeMode(e.target.value as QrCenterBadgeMode)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
                >
                  <option value="monogram">Couple Monogram ({resolvedMonogram})</option>
                  <option value="heart">Heart Crest (♥)</option>
                  <option value="none">Classic QR (No Center Crest)</option>
                </select>
                {centerBadgeMode === "monogram" ? (
                  <input
                    type="text"
                    value={customMonogram}
                    onChange={(e) => setCustomMonogram(e.target.value)}
                    placeholder={extractMonogram(coupleNames)}
                    maxLength={4}
                    title="Custom Monogram"
                    className="w-20 rounded-xl border border-stone-300 px-2.5 py-2 text-center font-serif text-sm font-bold text-stone-900"
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-stone-700">Couple Names</label>
              <input
                type="text"
                value={coupleNames}
                onChange={(e) => setCoupleNames(e.target.value)}
                maxLength={60}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700">Wedding Date Label</label>
              <input
                type="text"
                value={dateLabel}
                onChange={(e) => setDateLabel(e.target.value)}
                maxLength={40}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700">
              Call-to-Action Subtitle
            </label>
            <textarea
              rows={2}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              maxLength={160}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
          </div>
        </div>

        {/* 4. Export & Download Actions */}
        <div className="space-y-3 border-t border-stone-100 pt-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleDownloadHighDpiPng}
              className="flex items-center justify-center gap-2 rounded-full bg-amber-700 px-5 py-3 text-xs font-semibold text-white shadow-md transition hover:bg-amber-800"
            >
              <Download className="h-4 w-4" />
              Download 5×7&quot; Table Card (300-DPI PNG)
            </button>

            <button
              type="button"
              onClick={handlePrintCard}
              className="flex items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-stone-800"
            >
              <Printer className="h-4 w-4 text-amber-400" />
              Print 5×7&quot; Card / Save as PDF
            </button>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <button
              type="button"
              onClick={handleDownloadStandaloneQrPng}
              className="flex items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
            >
              <QrCode className="h-3.5 w-3.5 text-amber-700" />
              QR Only (PNG 1024px)
            </button>

            <button
              type="button"
              onClick={handleDownloadStandaloneQrSvg}
              className="flex items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
            >
              <FileCode className="h-3.5 w-3.5 text-amber-700" />
              Vector QR (SVG)
            </button>

            <button
              type="button"
              onClick={() => void handleCopyCardImage()}
              className="flex items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
            >
              {copiedImage ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Card Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-amber-700" />
                  Copy Card Image
                </>
              )}
            </button>
          </div>
        </div>

        {/* 5. Batch Table Number Generator */}
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber-700" />
              <div>
                <p className="text-xs font-semibold text-stone-900">
                  Batch Reception Table Generator
                </p>
                <p className="text-[11px] text-stone-500">
                  Automatically generate &amp; download numbered table cards (`?table=1..N`)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-stone-600">Tables</span>
              <input
                type="number"
                min={1}
                max={200}
                value={batchStartTable}
                onChange={(e) => setBatchStartTable(Number(e.target.value) || 1)}
                className="w-16 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-center text-xs font-semibold"
              />
              <span className="text-xs text-stone-500">to</span>
              <input
                type="number"
                min={1}
                max={200}
                value={batchEndTable}
                onChange={(e) => setBatchEndTable(Number(e.target.value) || 10)}
                className="w-16 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-center text-xs font-semibold"
              />
              <button
                type="button"
                disabled={batchGenerating}
                onClick={() => void handleBatchDownloadTableCards()}
                className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {batchGenerating
                  ? "Generating Cards…"
                  : `Download Tables ${batchStartTable}–${batchEndTable}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Live Preview Panel */}
      <div className="flex flex-col items-center justify-between rounded-3xl border border-stone-200 bg-stone-100 p-6 lg:col-span-5">
        {/* Preview Mode Toggle */}
        <div className="mb-4 flex items-center gap-1 rounded-full border border-stone-200 bg-white p-1 text-xs font-semibold shadow-2xs">
          <button
            type="button"
            onClick={() => setPreviewMode("card")}
            className={`rounded-full px-4 py-1.5 transition ${
              previewMode === "card" ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            5×7&quot; Table Card
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("qr_only")}
            className={`rounded-full px-4 py-1.5 transition ${
              previewMode === "qr_only"
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Standalone QR Code
          </button>
        </div>

        {/* Canvas / SVG Display */}
        <div className="flex w-full flex-1 items-center justify-center py-2">
          <div
            className={`w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl ring-1 ring-stone-900/10 ${
              previewMode === "card" ? "block" : "hidden"
            }`}
          >
            <canvas ref={previewCanvasRef} className="aspect-[5/7] h-auto w-full bg-white" />
          </div>

          {previewMode === "qr_only" ? (
            <div className="relative flex aspect-square w-full max-w-xs items-center justify-center rounded-3xl border border-stone-200 bg-white p-8 shadow-2xl">
              <QRCodeSVG
                value={guestEventUrl}
                size={260}
                level="H"
                marginSize={2}
                fgColor={activeTheme.qrFg}
                bgColor="#FFFFFF"
                className="h-full w-full"
              />
              {centerBadgeMode !== "none" ? (
                <div
                  style={{
                    borderColor: activeTheme.border,
                    backgroundColor:
                      activeTheme.background === "#141210" ? "#18181B" : activeTheme.background,
                    color: activeTheme.border,
                  }}
                  className="pointer-events-none absolute flex h-14 w-14 items-center justify-center rounded-full border-2 font-serif text-base font-bold shadow-md ring-4 ring-white"
                >
                  {centerBadgeMode === "monogram" ? (
                    resolvedMonogram
                  ) : (
                    <Heart className="h-6 w-6 fill-current" />
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs font-medium text-stone-600">
            Scans directly to{" "}
            <a
              href={guestEventUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono font-semibold text-amber-800 underline decoration-amber-700/40 underline-offset-2 hover:text-amber-900"
            >
              {guestEventUrl}
            </a>
          </p>
          <p className="mt-1 text-[11px] text-stone-400">
            Point your phone camera at the preview above to test the live guest flow
          </p>
        </div>
      </div>
    </div>
  );
}
