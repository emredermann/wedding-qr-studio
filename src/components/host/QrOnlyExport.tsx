"use client";

import { Download, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { ui } from "@/components/ui/styles";
import { trackEvent } from "@/lib/client/analytics";
import { saveBlob } from "@/lib/client/download";
import { Crc32, ZipWriter } from "@/lib/client/zip";
import { useT } from "@/lib/i18n/provider";

type Format = "svg" | "png";
type Background = "white" | "transparent";

const PNG_SIZE = 2048;
/** Recommended quiet zone around a QR code, in modules. */
const QUIET_ZONE = 4;

/** Renders a component off-screen synchronously and returns its container. */
function renderOffscreen(element: React.ReactElement): { host: HTMLDivElement; unmount: () => void } {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(element));
  return { host, unmount: () => root.unmount() };
}

/** Plain QR as a standalone SVG document (vector: scales to any print size). */
export function qrSvg(value: string, fg: string, background: Background, margin: number): string {
  const { host, unmount } = renderOffscreen(
    <QRCodeSVG value={value} size={1024} level="M" fgColor={fg} bgColor={background === "white" ? "#FFFFFF" : "transparent"} marginSize={margin} />,
  );
  try {
    let svg = host.innerHTML;
    if (!svg.includes("xmlns=")) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    // "transparent" is not understood by every design tool; "none" is.
    return `<?xml version="1.0" encoding="UTF-8"?>\n${svg.replace(/fill="transparent"/g, 'fill="none"')}`;
  } finally {
    unmount();
  }
}

/** Plain QR as a PNG (2048 px). */
async function qrPng(value: string, fg: string, background: Background, margin: number): Promise<Blob> {
  const svg = qrSvg(value, fg, background, margin);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Görsel oluşturulamadı."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = PNG_SIZE;
    canvas.height = PNG_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas desteklenmiyor.");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, PNG_SIZE, PNG_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Görsel oluşturulamadı.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function zipFiles(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  const zip = new ZipWriter();
  for (const file of files) {
    const crc = new Crc32();
    crc.update(new Uint8Array(await file.blob.arrayBuffer()));
    zip.add(file.name, file.blob, crc.digest());
  }
  return zip.finish();
}

/**
 * "Sadece QR": only the code, no card, so a designer can place it in their own
 * artwork. SVG (vector) or PNG, white or transparent background. With table
 * numbers on, the general code and one per table come as a ZIP.
 */
export function QrOnlyExport({
  generalUrl,
  tableUrlFor,
  tables,
  tableNumbers,
  slug,
  tableRange,
}: {
  /** Link for the general / entrance code (main album). */
  generalUrl: string;
  tableUrlFor: (table: string) => string;
  tables: string[];
  tableNumbers: boolean;
  slug: string;
  /** Table range inputs, shared with the card designer. */
  tableRange: React.ReactNode;
}) {
  const t = useT();
  const [format, setFormat] = useState<Format>("svg");
  const [background, setBackground] = useState<Background>("white");
  const [color, setColor] = useState("#000000");
  const [margin, setMargin] = useState(true);
  const [busy, setBusy] = useState(false);

  const codes = useMemo(
    () => [
      { name: "genel", value: generalUrl },
      ...(tableNumbers ? tables.map((n) => ({ name: `masa-${n}`, value: tableUrlFor(n) })) : []),
    ],
    [generalUrl, tableNumbers, tables, tableUrlFor],
  );

  const download = async () => {
    setBusy(true);
    try {
      const quiet = margin ? QUIET_ZONE : 0;
      const files: Array<{ name: string; blob: Blob }> = [];
      for (const code of codes) {
        const blob =
          format === "svg"
            ? new Blob([qrSvg(code.value, color, background, quiet)], { type: "image/svg+xml" })
            : await qrPng(code.value, color, background, quiet);
        files.push({ name: `${code.name}.${format}`, blob });
      }
      if (files.length === 1) saveBlob(files[0].blob, `qr-${slug}.${format}`);
      else saveBlob(await zipFiles(files), `qr-kodlari-${slug}.zip`);
      trackEvent("qr_card_exported", { format: format === "svg" ? "svg" : "png", cards: files.length });
    } finally {
      setBusy(false);
    }
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium ${active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="order-2 space-y-5 lg:order-1">
        <p className={ui.hint}>
          {t("Kart olmadan yalnızca QR kodunu indirin; tasarımcınız istediği tasarıma yerleştirebilir. Ortası boş, sade bir QR üretilir.")}
        </p>
        <section>
          <p className={ui.label}>{t("Dosya biçimi")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFormat("svg")} className={chip(format === "svg")}>
              {t("SVG (vektörel, önerilen)")}
            </button>
            <button type="button" onClick={() => setFormat("png")} className={chip(format === "png")}>
              {t("PNG (2048 px)")}
            </button>
          </div>
        </section>
        <section>
          <p className={ui.label}>{t("Zemin")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setBackground("white")} className={chip(background === "white")}>
              {t("Beyaz")}
            </button>
            <button type="button" onClick={() => setBackground("transparent")} className={chip(background === "transparent")}>
              {t("Şeffaf")}
            </button>
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={ui.label}>{t("QR rengi")}</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full cursor-pointer rounded-xl border border-stone-300 bg-white p-1" />
          </label>
          <label className="flex cursor-pointer items-end gap-2 pb-2.5 text-sm text-stone-700">
            <input type="checkbox" checked={margin} onChange={(e) => setMargin(e.target.checked)} className={ui.checkbox} />
            {t("Kenar boşluğu bırak (önerilir)")}
          </label>
        </section>
        {tableNumbers && (
          <section className="space-y-3">
            <p className="rounded-xl bg-stone-100 px-3 py-2 text-[11px] text-stone-600">
              🪑 {t("Masa numaraları açık: genel QR ve girdiğiniz masaların QR'ları tek bir ZIP dosyası olarak iner.")}
            </p>
            {tableRange}
          </section>
        )}
      </div>

      <div className="order-1 lg:order-2">
        <div className="sticky top-4 space-y-3">
          <div
            className="mx-auto flex aspect-square w-full max-w-xs items-center justify-center rounded-2xl p-6 ring-1 ring-stone-200"
            style={
              background === "white"
                ? { backgroundColor: "#FFFFFF" }
                : { backgroundImage: "repeating-conic-gradient(#e7e5e4 0% 25%, #ffffff 0% 50%)", backgroundSize: "20px 20px" }
            }
          >
            <QRCodeSVG
              value={codes[0].value}
              size={240}
              level="M"
              fgColor={color}
              bgColor={background === "white" ? "#FFFFFF" : "transparent"}
              marginSize={margin ? QUIET_ZONE : 0}
              className="h-full w-full"
              aria-label={t("QR önizlemesi")}
            />
          </div>
          {codes.length > 1 && <p className="text-center text-xs text-stone-500">{t("{n} QR kodu indirilecek (genel + masalar)", { n: codes.length })}</p>}
          <button
            type="button"
            onClick={() => void download()}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {codes.length > 1 ? t("QR'ları indir (ZIP)") : t("QR'ı indir")}
          </button>
          <p className="text-[11px] leading-relaxed text-stone-500">{t("Basmadan önce QR'ı telefonla okutarak test edin. Çok açık renkler okunmayı zorlaştırır.")}</p>
        </div>
      </div>
    </div>
  );
}
