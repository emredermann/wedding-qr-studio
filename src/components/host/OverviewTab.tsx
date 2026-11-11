"use client";

import { Check, Copy, ExternalLink, FolderOpen, MonitorPlay, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { ZipDownloadButton } from "@/components/media/ZipDownloadButton";
import { trackEvent } from "@/lib/client/analytics";
import { apiFetch } from "@/lib/client/api";
import { formatBytes } from "@/lib/media-config";
import type { EventStatsDto, ExportItem, HostEventDto } from "@/types/domain";
import { useT } from "@/lib/i18n/provider";
import { ui } from "@/components/ui/styles";

export function OverviewTab({
  event,
  stats,
  guestUrl,
  onToggleUploads,
  onMessage,
}: {
  event: HostEventDto;
  stats: EventStatsDto;
  guestUrl: string;
  onToggleUploads: (open: boolean) => Promise<void>;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const liveUrl = `${guestUrl}/live`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(guestUrl);
      trackEvent("guest_link_shared", { method: "copy" });
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onMessage(t("Kopyalanamadı. Bağlantıyı elle seçin."), "error");
    }
  };

  const cards: Array<[string, string | number]> = [
    [t("Toplam anı"), stats.total],
    [t("Fotoğraf"), stats.photos],
    [t("Video"), stats.videos],
    [t("Sesli mesaj"), stats.audio],
    [t("Yazılı not"), stats.guestbookMessages],
    [t("Misafir"), stats.guests],
    [t("Onay bekleyen"), stats.pending],
    [t("Toplam boyut"), formatBytes(stats.totalBytes)],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4 rounded-3xl border border-stone-200 bg-white p-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-stone-600">{t("Misafir bağlantısı")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-800">{guestUrl}</code>
              <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-2 text-xs font-medium">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />} {t("Kopyala")}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(t("{name} etkinliğinden fotoğraflarınızı buradan paylaşın: {url}", { name: event.coupleNames || event.title, url: guestUrl }))}`} target="_blank" rel="noreferrer" onClick={() => trackEvent("guest_link_shared", { method: "whatsapp" })} className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-2 text-xs font-medium">
                <Share2 className="h-4 w-4" /> WhatsApp
              </a>
              <a href={guestUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-2 text-xs font-medium">
                <ExternalLink className="h-4 w-4" /> {t("Aç")}
              </a>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <a href={liveUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-stone-900 p-4 text-white">
              <MonitorPlay className="h-6 w-6 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">{t("Canlı Etkinlik Ekranı")}</span>
                <span className="block text-xs text-white/70">{t("Projeksiyon / TV’de tam ekran açın")}</span>
              </span>
            </a>
            <a href={event.driveFolderUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-stone-300 p-4 text-stone-900">
              <FolderOpen className="h-6 w-6 shrink-0 text-amber-600" />
              <span>
                <span className="block text-sm font-semibold">{t("Google Drive klasörü")}</span>
                <span className="block text-xs text-stone-500">
                  {event.role === "cohost"
                    ? t("Etkinlik sahibinin Drive’ında · açmak için sahibin paylaşması gerekir")
                    : event.driveAccount === "host"
                      ? t("Kendi Drive’ınızda · tüm orijinaller burada")
                      : t("Platform Drive’ında · tüm orijinaller burada")}
                </span>
              </span>
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
            <label className="flex items-center gap-3 text-sm text-stone-800">
              <input type="checkbox" checked={event.uploadsEnabled} onChange={(e) => void onToggleUploads(e.target.checked)} className={ui.checkbox} />
              {t("Misafir yüklemeleri açık")}
            </label>
            <ZipDownloadButton
              scope="host"
              baseName={event.slug}
              label={t("Tüm medyayı indir (ZIP)")}
              onMessage={onMessage}
              loadFiles={async () => {
                const res = await apiFetch<{ items: ExportItem[] }>(`/api/host/events/${event.id}/export`);
                return res.items;
              }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-3xl border border-stone-200 bg-white p-5">
          <QRCodeSVG value={guestUrl} size={168} level="M" />
          <p className="text-xs text-stone-500">{t("Hızlı test için okutun")}</p>
        </div>
      </div>
    </div>
  );
}
