"use client";

import { FileBarChart, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ui } from "@/components/ui/styles";
import { trackEvent } from "@/lib/client/analytics";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { saveBlob } from "@/lib/client/download";
import { drawImageInRect, drawWatermark, loadOptionalImage, loadPhoto } from "@/lib/client/frame";
import { buildPdf, canvasToJpegBytes, PAGE_SIZES_PT } from "@/lib/client/pdf";
import { formatBytes } from "@/lib/media-config";
import type { ReportDto } from "@/lib/report";
import { useLang, useT } from "@/lib/i18n/provider";
import type { HostEventDto } from "@/types/domain";

/** Attendance report (every package): key numbers on screen and as a one-page PDF. */
export function ReportPanel({ event }: { event: HostEventDto }) {
  const t = useT();
  const { locale } = useLang();
  const [report, setReport] = useState<ReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ReportDto>(`/api/host/events/${event.id}/report`)
      .then((res) => !cancelled && setReport(res))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  const title = event.coupleNames || event.title;
  const hourLabel = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const peak = report?.hourly.reduce((max, h) => (h.count > max.count ? h : max), { hour: "", count: 0 });

  const kpis = report
    ? [
        [t("Misafir"), report.totals.guests],
        [t("Fotoğraf"), report.totals.photos],
        [t("Video"), report.totals.videos],
        [t("Mesaj"), report.totals.guestbookNotes + report.totals.guestbookRecordings],
        [t("Kalp"), report.totals.hearts],
        [t("Toplam boyut"), formatBytes(report.totals.bytes)],
      ]
    : [];

  const exportPdf = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const w = 1240;
      const h = 1754;
      const m = 90;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas desteklenmiyor.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      const logo = await loadOptionalImage(event.brand?.logoUrl);
      let y = m;
      if (logo) {
        const lh = 60;
        const lw = Math.min((logo.width / logo.height) * lh, 260);
        ctx.drawImage(logo, w - m - lw, y - 10, lw, lh);
      }
      ctx.fillStyle = "#78736a";
      ctx.font = "500 20px system-ui, sans-serif";
      ctx.fillText(t("KATILIM RAPORU"), m, y);
      y += 52;
      ctx.fillStyle = "#1c1b18";
      ctx.font = "400 52px Georgia, serif";
      ctx.fillText(title, m, y, w - m * 2 - 280);
      y += 36;
      ctx.fillStyle = "#78736a";
      ctx.font = "400 20px system-ui, sans-serif";
      const range = report.firstUpload && report.lastUpload ? `${new Date(report.firstUpload).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })} – ${hourLabel(report.lastUpload)}` : "";
      ctx.fillText(range, m, y);

      // KPI grid (3 × 2)
      y += 50;
      const cw = (w - m * 2 - 40) / 3;
      kpis.forEach(([label, value], i) => {
        const x = m + (i % 3) * (cw + 20);
        const top = y + Math.floor(i / 3) * 130;
        ctx.fillStyle = "#f7f5f0";
        ctx.beginPath();
        ctx.roundRect(x, top, cw, 110, 18);
        ctx.fill();
        ctx.fillStyle = "#1c1b18";
        ctx.font = "600 44px system-ui, sans-serif";
        ctx.fillText(String(value), x + 24, top + 58);
        ctx.fillStyle = "#78736a";
        ctx.font = "400 19px system-ui, sans-serif";
        ctx.fillText(String(label), x + 24, top + 90);
      });
      y += 290;

      // Hourly chart
      ctx.fillStyle = "#1c1b18";
      ctx.font = "600 24px system-ui, sans-serif";
      ctx.fillText(t("Saatlere göre yüklemeler"), m, y);
      y += 24;
      const chartH = 260;
      const bars = report.hourly.slice(-24);
      const max = Math.max(1, ...bars.map((b) => b.count));
      const bw = (w - m * 2) / Math.max(1, bars.length);
      bars.forEach((b, i) => {
        const bh = (b.count / max) * (chartH - 40);
        ctx.fillStyle = b.hour === peak?.hour ? "#1c1b18" : "#cbc6bb";
        ctx.fillRect(m + i * bw + 3, y + chartH - 30 - bh, Math.max(2, bw - 6), bh);
        if (bars.length <= 12 || i % 2 === 0) {
          ctx.fillStyle = "#78736a";
          ctx.font = "400 14px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(hourLabel(b.hour), m + i * bw + bw / 2, y + chartH - 8);
          ctx.textAlign = "left";
        }
      });
      y += chartH + 40;

      // Two columns: contributors | challenges
      const colW = (w - m * 2 - 40) / 2;
      const list = (x: number, heading: string, rows: Array<[string, string]>) => {
        let ly = y;
        ctx.fillStyle = "#1c1b18";
        ctx.font = "600 24px system-ui, sans-serif";
        ctx.fillText(heading, x, ly);
        ly += 40;
        ctx.font = "400 20px system-ui, sans-serif";
        for (const [left, right] of rows.slice(0, 6)) {
          ctx.fillStyle = "#44413b";
          ctx.fillText(left, x, ly, colW - 90);
          ctx.fillStyle = "#78736a";
          ctx.textAlign = "right";
          ctx.fillText(right, x + colW, ly);
          ctx.textAlign = "left";
          ly += 34;
        }
        if (rows.length === 0) {
          ctx.fillStyle = "#a19c92";
          ctx.fillText("—", x, ly);
        }
      };
      list(m, t("En aktif misafirler"), report.topContributors.map((c) => [c.name || t("Misafir"), String(c.count)]));
      list(m + colW + 40, t("Görevler"), report.challenges.map((c) => [c.title, `${c.count} · ${t("{n} kişi", { n: c.players })}`]));
      y += 280;

      // Most loved photos
      if (report.topPhotos.length > 0) {
        ctx.fillStyle = "#1c1b18";
        ctx.font = "600 24px system-ui, sans-serif";
        ctx.fillText(t("En sevilen kareler"), m, y);
        y += 20;
        const size = (w - m * 2 - 5 * 16) / 6;
        const images = await Promise.all(report.topPhotos.map((p) => loadPhoto(p.fileId, 400).catch(() => null)));
        images.forEach((img, i) => {
          const x = m + i * (size + 16);
          if (img) drawImageInRect(ctx, img, x, y, size, size, "cover");
          ctx.fillStyle = "#78736a";
          ctx.font = "400 16px system-ui, sans-serif";
          ctx.fillText(`♥ ${report.topPhotos[i].hearts}`, x, y + size + 24);
        });
      }

      ctx.fillStyle = "#a19c92";
      ctx.font = "400 15px system-ui, sans-serif";
      ctx.fillText(new Date(report.generatedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }), m, h - 50);
      if (event.shareFrame.watermark) drawWatermark(ctx, w - m, h - 34, 14, false);

      const pt = PAGE_SIZES_PT.A4;
      saveBlob(buildPdf([{ jpeg: await canvasToJpegBytes(canvas, 0.92), pixelWidth: w, pixelHeight: h, pageWidthPt: pt.width, pageHeightPt: pt.height }]), `katilim-raporu-${event.slug}.pdf`);
      trackEvent("report_exported");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className={`space-y-4 ${ui.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`flex items-center gap-2 ${ui.sectionTitle}`}>
            <FileBarChart className="h-4 w-4" /> {t("Katılım raporu")}
          </h3>
          <p className={`mt-1 ${ui.hint}`}>{t("Etkinliğin özeti: katılım, yoğun saatler, görevler ve en sevilen kareler.")}</p>
        </div>
        <button type="button" disabled={!report || exporting} onClick={exportPdf} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium disabled:opacity-50">
          {exporting && <Loader2 className="h-4 w-4 animate-spin" />} {t("PDF indir")}
        </button>
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {!report && !error && (
        <div className="flex justify-center py-6 text-stone-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {report && (
        <>
          <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {kpis.map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-stone-50 px-3 py-2.5">
                <dd className="text-xl font-semibold tabular-nums text-stone-900">{value}</dd>
                <dt className="text-[11px] text-stone-500">{label}</dt>
              </div>
            ))}
          </dl>
          {report.hourly.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-stone-600">
                {t("Saatlere göre yüklemeler")}
                {peak && peak.count > 0 && <span className="font-normal text-stone-500"> · {t("en yoğun: {time}", { time: hourLabel(peak.hour) })}</span>}
              </p>
              <div className="flex h-28 items-end gap-0.5" aria-hidden>
                {report.hourly.slice(-24).map((b) => (
                  <div key={b.hour} title={`${hourLabel(b.hour)} · ${b.count}`} className={`flex-1 rounded-t ${b.hour === peak?.hour ? "bg-stone-900" : "bg-stone-300"}`} style={{ height: `${Math.max(2, (b.count / Math.max(1, peak?.count ?? 1)) * 100)}%` }} />
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-600">{t("En aktif misafirler")}</p>
              <ol className="space-y-1 text-sm">
                {report.topContributors.map((c, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate text-stone-800">{c.name || t("Misafir")}</span>
                    <span className="tabular-nums text-stone-500">{c.count}</span>
                  </li>
                ))}
                {report.topContributors.length === 0 && <li className="text-stone-400">—</li>}
              </ol>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-600">{t("Görevler")}</p>
              <ul className="space-y-1 text-sm">
                {report.challenges.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate text-stone-800">{c.title}</span>
                    <span className="shrink-0 tabular-nums text-stone-500">
                      {c.count} · {t("{n} kişi", { n: c.players })}
                    </span>
                  </li>
                ))}
                {report.challenges.length === 0 && <li className="text-stone-400">—</li>}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
