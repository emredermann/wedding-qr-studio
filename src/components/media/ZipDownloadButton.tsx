"use client";

import { Archive, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { trackEvent, type AnalyticsEvents } from "@/lib/client/analytics";
import { downloadZip, type DownloadableFile, type ZipProgress } from "@/lib/client/download";
import { formatBytes } from "@/lib/media-config";
import { useLang, useT } from "@/lib/i18n/provider";
import { translateLoose } from "@/lib/i18n/translate";

export function ZipDownloadButton({
  label,
  baseName,
  loadFiles,
  className = "",
  onMessage,
  scope,
}: {
  /** Analytics label for where the ZIP was requested from. */
  scope: AnalyticsEvents["zip_downloaded"]["scope"];
  label?: string;
  baseName: string;
  loadFiles: () => Promise<DownloadableFile[]>;
  className?: string;
  onMessage?: (text: string, variant: "success" | "error" | "info") => void;
}) {
  const t = useT();
  const { locale } = useLang();
  const [progress, setProgress] = useState<ZipProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const start = async () => {
    setBusy(true);
    controller.current = new AbortController();
    try {
      const files = await loadFiles();
      if (files.length === 0) {
        onMessage?.(t("İndirilecek dosya yok."), "info");
        return;
      }
      const result = await downloadZip(files, baseName, setProgress, controller.current.signal);
      trackEvent("zip_downloaded", { scope, files: files.length - result.failed.length });
      if (result.failed.length > 0) {
        onMessage?.(t("{n} dosya indirilemedi, kalanlar ZIP'e eklendi.", { n: result.failed.length }), "error");
      } else {
        onMessage?.(t("ZIP dosyası hazır."), "success");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        onMessage?.(error instanceof Error ? translateLoose(error.message) : t("İndirme başarısız."), "error");
      }
    } finally {
      setBusy(false);
      setProgress(null);
      controller.current = null;
    }
  };

  if (busy) {
    const pct = progress && progress.totalBytes > 0 ? Math.round((progress.doneBytes / progress.totalBytes) * 100) : 0;
    return (
      <div className={`flex min-w-56 items-center gap-3 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs text-stone-700 ${className}`}>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2">
            <span>
              {progress ? t("{done}/{total} dosya", { done: progress.doneFiles, total: progress.totalFiles }) : t("Hazırlanıyor…")}
            </span>
            <span>{progress ? `${formatBytes(progress.doneBytes)} · ${new Intl.NumberFormat(locale, { style: "percent" }).format(pct / 100)}` : ""}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full bg-amber-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button type="button" onClick={() => controller.current?.abort()} aria-label={t("İptal")} className="rounded-full p-1 hover:bg-stone-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      className={`inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 ${className}`}
    >
      <Archive className="h-4 w-4" />
      {label ?? t("Tümünü indir (ZIP)")}
    </button>
  );
}
