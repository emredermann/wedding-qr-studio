"use client";

import { BookOpen, Loader2 } from "lucide-react";
import { useState } from "react";

import { ProBadge, ProLock } from "@/components/host/ProGate";
import { ui } from "@/components/ui/styles";
import { trackEvent } from "@/lib/client/analytics";
import { saveBlob } from "@/lib/client/download";
import { drawImageInRect, loadOptionalImage, loadPhoto } from "@/lib/client/frame";
import { buildPdf, canvasToJpegBytes, PAGE_SIZES_PT, type PdfPage } from "@/lib/client/pdf";
import { mediaImageSrc } from "@/lib/media-urls";
import { useLang, useT } from "@/lib/i18n/provider";
import type { HostEventDto, MediaDto } from "@/types/domain";

type BookFormat = "A4" | "square";
type PerPage = 1 | 2 | 4;

/** Pages render at 200 DPI: sharp in print, light enough for phones. */
const PAGE_PX: Record<BookFormat, { w: number; h: number; pt: { width: number; height: number } }> = {
  A4: { w: 1654, h: 2339, pt: PAGE_SIZES_PT.A4 },
  square: { w: 1654, h: 1654, pt: { width: 595.28, height: 595.28 } },
};

/**
 * Photobook (Pro): a print-ready PDF from chosen photos — cover, photo pages
 * (1, 2 or 4 per page) and a closing page. Any print shop can print it.
 */
export function PhotobookPanel({ event, photos }: { event: HostEventDto; photos: MediaDto[] }) {
  const t = useT();
  const { locale } = useLang();
  const pro = event.plan === "pro";
  const [selected, setSelected] = useState<Set<string>>(() => new Set(photos.slice(0, 24).map((p) => p.id)));
  const [format, setFormat] = useState<BookFormat>("A4");
  const [perPage, setPerPage] = useState<PerPage>(2);
  const [captions, setCaptions] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = photos.filter((p) => selected.has(p.id));
  const title = event.coupleNames || event.title;
  const dateText = event.eventDate ? new Date(`${event.eventDate}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "";

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const build = async () => {
    setError(null);
    setProgress(0);
    try {
      const size = PAGE_PX[format];
      const { w, h } = size;
      const margin = Math.round(w * 0.07);
      const gap = Math.round(w * 0.025);
      const logo = await loadOptionalImage(event.brand?.logoUrl);
      const pages: PdfPage[] = [];
      const pushPage = async (canvas: HTMLCanvasElement) =>
        pages.push({ jpeg: await canvasToJpegBytes(canvas, 0.9), pixelWidth: w, pixelHeight: h, pageWidthPt: size.pt.width, pageHeightPt: size.pt.height });
      const newPage = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas desteklenmiyor.");
        ctx.fillStyle = "#fbfaf7";
        ctx.fillRect(0, 0, w, h);
        return { canvas, ctx };
      };
      const total = chosen.length + 2;
      let done = 0;

      // Cover: the first chosen photo, title, date and logo.
      {
        const { canvas, ctx } = newPage();
        const cover = chosen[0] ? await loadPhoto(chosen[0].fileId, 2400).catch(() => null) : null;
        const photoH = Math.round(h * (format === "A4" ? 0.62 : 0.55));
        if (cover) drawImageInRect(ctx, cover, margin, margin, w - margin * 2, photoH, "cover");
        ctx.fillStyle = "#1c1b18";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const textY = margin + photoH + (h - margin - photoH - margin) * 0.38;
        ctx.font = `400 ${Math.round(w * 0.075)}px Georgia, serif`;
        ctx.fillText(title, w / 2, textY, w - margin * 2);
        ctx.fillStyle = "#78736a";
        ctx.font = `400 ${Math.round(w * 0.028)}px system-ui, sans-serif`;
        if (dateText) ctx.fillText(dateText, w / 2, textY + w * 0.07, w - margin * 2);
        if (logo) {
          const lh = w * 0.06;
          const lw = Math.min((logo.width / logo.height) * lh, w * 0.4);
          ctx.drawImage(logo, w / 2 - lw / 2, h - margin - lh, lw, lh);
        }
        await pushPage(canvas);
        setProgress(++done / total);
      }

      // Photo pages.
      const slots = (count: number): Array<[number, number, number, number]> => {
        const iw = w - margin * 2;
        const ih = h - margin * 2 - (captions ? w * 0.03 : 0);
        if (count === 1) return [[margin, margin, iw, ih]];
        if (count === 2) {
          const half = (ih - gap) / 2;
          return [
            [margin, margin, iw, half],
            [margin, margin + half + gap, iw, half],
          ];
        }
        const cw = (iw - gap) / 2;
        const ch = (ih - gap) / 2;
        return [
          [margin, margin, cw, ch],
          [margin + cw + gap, margin, cw, ch],
          [margin, margin + ch + gap, cw, ch],
          [margin + cw + gap, margin + ch + gap, cw, ch],
        ];
      };
      for (let i = 0; i < chosen.length; i += perPage) {
        const group = chosen.slice(i, i + perPage);
        const { canvas, ctx } = newPage();
        const rects = slots(perPage);
        const images = await Promise.all(group.map((p) => loadPhoto(p.fileId, perPage === 1 ? 2400 : 1600).catch(() => null)));
        images.forEach((img, j) => {
          const [x, y, rw, rh] = rects[j];
          if (img) drawImageInRect(ctx, img, x, y, rw, rh, perPage === 1 ? "contain" : "cover");
          if (captions && group[j].guestName) {
            ctx.fillStyle = "#78736a";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.font = `400 ${Math.round(w * 0.016)}px system-ui, sans-serif`;
            ctx.fillText(group[j].guestName ?? "", x, y + rh + w * 0.006, rw);
          }
        });
        ctx.fillStyle = "#a19c92";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.font = `400 ${Math.round(w * 0.015)}px system-ui, sans-serif`;
        ctx.fillText(String(pages.length + 1), w / 2, h - margin * 0.4);
        await pushPage(canvas);
        done += group.length;
        setProgress(done / total);
      }

      // Closing page.
      {
        const { canvas, ctx } = newPage();
        ctx.fillStyle = "#1c1b18";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `400 ${Math.round(w * 0.05)}px Georgia, serif`;
        ctx.fillText(t("Hepsi için teşekkürler"), w / 2, h / 2, w - margin * 2);
        ctx.fillStyle = "#78736a";
        ctx.font = `400 ${Math.round(w * 0.022)}px system-ui, sans-serif`;
        ctx.fillText(`${title}${dateText ? ` · ${dateText}` : ""}`, w / 2, h / 2 + w * 0.06, w - margin * 2);
        await pushPage(canvas);
      }

      saveBlob(buildPdf(pages), `fotokitap-${event.slug}.pdf`);
      trackEvent("photobook_exported", { pages: pages.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <section className={`space-y-4 ${ui.card}`}>
      <div>
        <h3 className={`flex items-center gap-2 ${ui.sectionTitle}`}>
          <BookOpen className="h-4 w-4" /> {t("Fotokitap")} <ProBadge />
        </h3>
        <p className={`mt-1 ${ui.hint}`}>{t("Seçtiğiniz karelerden kapaklı, baskıya hazır bir PDF albüm. Dilediğiniz matbaada bastırabilirsiniz.")}</p>
      </div>
      {!pro ? (
        <ProLock text={t("Etkinliğin en güzel karelerini baskıya hazır bir fotokitaba dönüştürün.")} />
      ) : photos.length === 0 ? (
        <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-500">{t("Henüz onaylı fotoğraf yok.")}</p>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
            {photos.map((p) => {
              const on = selected.has(p.id);
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on} className={`aspect-square overflow-hidden rounded-lg ${on ? "ring-2 ring-stone-900" : "opacity-40"}`}>
                  <img src={mediaImageSrc(p, 300)} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              );
            })}
          </div>
          <p className={ui.hint}>{t("{n} fotoğraf seçili · ilk seçilen kapakta yer alır.", { n: chosen.length })}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select value={format} onChange={(e) => setFormat(e.target.value as BookFormat)} className="rounded-full border border-stone-300 bg-white px-3 py-2">
              <option value="A4">{t("A4 dikey")}</option>
              <option value="square">{t("Kare (21×21 cm)")}</option>
            </select>
            <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value) as PerPage)} className="rounded-full border border-stone-300 bg-white px-3 py-2">
              <option value={1}>{t("Sayfa başına 1 fotoğraf")}</option>
              <option value={2}>{t("Sayfa başına 2 fotoğraf")}</option>
              <option value={4}>{t("Sayfa başına 4 fotoğraf")}</option>
            </select>
            <label className="inline-flex items-center gap-2 text-stone-700">
              <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} className={ui.checkbox} /> {t("Çekenin adını yaz")}
            </label>
          </div>
          <button type="button" disabled={chosen.length === 0 || progress !== null} onClick={build} className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {progress !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
            {progress !== null ? t("Hazırlanıyor… %{n}", { n: Math.round(progress * 100) }) : t("Fotokitap PDF’ini indir")}
          </button>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        </>
      )}
    </section>
  );
}
