"use client";

import { Armchair, BookHeart, Mail, ChevronLeft, Images, LayoutDashboard, Loader2, QrCode, Settings, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AlbumToolsTab } from "@/components/host/AlbumToolsTab";
import { GuestbookModerationTab } from "@/components/host/GuestbookModerationTab";
import { GuestsTab } from "@/components/host/GuestsTab";
import { HostHeader } from "@/components/host/HostHeader";
import { MediaModerationTab } from "@/components/host/MediaModerationTab";
import { OverviewTab } from "@/components/host/OverviewTab";
import { QrCardDesigner } from "@/components/host/QrCardDesigner";
import { SettingsTab } from "@/components/host/SettingsTab";
import { ToastRegion, useToastQueue } from "@/components/ui/Feedback";
import { apiFetch, ApiError, errorMessage } from "@/lib/client/api";
import type { EventStatsDto, HostEventDto } from "@/types/domain";
import { useLang, useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";

const STATS_REFRESH_DEBOUNCE_MS = 1500;

type Tab = "overview" | "media" | "guestbook" | "guests" | "highlights" | "qr" | "settings";

const TABS: Array<{ id: Tab; label: MsgKey; icon: typeof Images }> = [
  { id: "overview", label: "Özet", icon: LayoutDashboard },
  { id: "media", label: "Medya", icon: Images },
  { id: "guestbook", label: "Anı Defteri", icon: BookHeart },
  { id: "guests", label: "Misafirler", icon: Users },
  { id: "highlights", label: "Öne Çıkanlar & Rapor", icon: Sparkles },
  { id: "qr", label: "QR & Masa Kartı", icon: QrCode },
  { id: "settings", label: "Ayarlar", icon: Settings },
];

export function HostEventApp({ eventId }: { eventId: string }) {
  const t = useT();
  const { locale } = useLang();
  const [data, setData] = useState<{ event: HostEventDto; stats: EventStatsDto } | null>(null);
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [reloadKey, setReloadKey] = useState(0);
  const { toasts, pushToast, dismissToast } = useToastQueue();

  const onMessage = useCallback(
    (text: string, variant: "success" | "error" | "info" = "info") => pushToast(text, variant),
    [pushToast],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ event: HostEventDto; stats: EventStatsDto }>(`/api/host/events/${eventId}`);
        if (cancelled) return;
        setData(res);
        setOrigin(window.location.origin);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadKey]);

  // Moderation actions often come in bursts (approve, approve, hide…). Coalesce
  // them into one stats reload instead of re-fetching the event after each click.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      setReloadKey((k) => k + 1);
    }, STATS_REFRESH_DEBOUNCE_MS);
  }, []);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const toggleUploads = async (open: boolean) => {
    if (!data) return;
    try {
      const res = await apiFetch<{ event: HostEventDto }>(`/api/host/events/${data.event.id}`, {
        method: "PATCH",
        json: { uploadsEnabled: open },
      });
      setData((prev) => (prev ? { ...prev, event: res.event } : prev));
      onMessage(open ? t("Yüklemeler açıldı.") : t("Yüklemeler kapatıldı."), "success");
    } catch (err) {
      onMessage(errorMessage(err), "error");
    }
  };

  if (error) {
    return (
      <div className="min-h-dvh bg-stone-50">
        <HostHeader />
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="rounded-2xl bg-rose-50 p-5 text-sm text-rose-700">{error}</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-stone-600 underline">
            {t("Etkinliklerime dön")}
          </Link>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-dvh bg-stone-50">
        <HostHeader />
        <div className="flex justify-center py-24 text-stone-400">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      </div>
    );
  }

  const { event, stats } = data;
  // Invitation-only event: only Settings applies until the album is opened.
  const view: Tab = event.albumOpen ? tab : "settings";
  const guestUrl = `${origin}/e/${event.slug}`;
  const dateText = event.eventDate
    ? new Date(`${event.eventDate}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <div className="min-h-dvh bg-stone-50">
      <HostHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Link href="/dashboard" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800">
          <ChevronLeft className="h-4 w-4" /> {t("Etkinliklerim")}
        </Link>
        <h1 className="font-serif text-3xl text-stone-900">{event.coupleNames || event.title}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {dateText && `${dateText} · `}/e/{event.slug}
        </p>

        <Link
          href={`/dashboard/${event.id}/davetiye`}
          className="mt-5 flex items-center gap-4 rounded-3xl border border-stone-200 bg-white p-4 transition hover:border-stone-300 hover:shadow-sm"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-900 text-white">
            <Mail className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{t("Düğün öncesi")}</span>
            <span className="block text-sm font-semibold text-stone-900">{t("Davetiye & Oturma")}</span>
            <span className="block truncate text-xs text-stone-500">{t("Kişiye özel davetiye bağlantıları, katılım yanıtları ve oturma planı")}</span>
          </span>
          <Armchair className="h-5 w-5 shrink-0 text-stone-400" />
        </Link>

        {!event.albumOpen && <AlbumClosedCard event={event} onOpened={(ev) => setData({ ...data, event: ev })} onMessage={onMessage} />}

        <nav className="-mx-4 mt-5 mb-6 overflow-x-auto border-b border-stone-200 px-4">
          <ul className="flex gap-1">
            {TABS.filter(({ id }) => event.albumOpen || id === "settings").map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                    view === id ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {t(label)}
                  {id === "media" && stats.pending > 0 && (
                    <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">{stats.pending}</span>
                  )}
                </button>
              </li>
            ))}
            <li>
              <Link
                href={`/dashboard/${event.id}/davetiye`}
                className="inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-stone-500 hover:text-stone-800"
              >
                <Mail className="h-4 w-4" /> {t("Davetiye & Oturma")}
              </Link>
            </li>
          </ul>
        </nav>

        {view === "overview" && <OverviewTab event={event} stats={stats} guestUrl={guestUrl} onToggleUploads={toggleUploads} onMessage={onMessage} />}
        {view === "media" && <MediaModerationTab event={event} pendingCount={stats.pending} onMessage={onMessage} onChanged={refresh} />}
        {view === "guestbook" && <GuestbookModerationTab event={event} onMessage={onMessage} />}
        {view === "guests" && <GuestsTab event={event} onMessage={onMessage} />}
        {view === "highlights" && <AlbumToolsTab event={event} />}
        {view === "qr" && (
          <QrCardDesigner url={guestUrl} coupleNames={event.coupleNames || event.title} dateText={dateText} themeColor={event.themeColor} slug={event.slug} tableNumbers={event.tableNumbers} eventDate={event.eventDate} eventType={event.eventType} />
        )}
        {view === "settings" && <SettingsTab key={event.updatedAt} event={event} onSaved={(ev) => setData({ ...data, event: ev })} onMessage={onMessage} />}
      </main>
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

/**
 * Invitation-only event: the photo album is not open yet. Opening it creates
 * the Drive folders and turns uploads on (needs a connected Google Drive).
 */
function AlbumClosedCard({ event, onOpened, onMessage }: { event: HostEventDto; onOpened: (event: HostEventDto) => void; onMessage: (text: string, variant?: "success" | "error" | "info") => void }) {
  const t = useT();
  const [opening, setOpening] = useState(false);
  const [needsDrive, setNeedsDrive] = useState(false);
  const open = async () => {
    setOpening(true);
    try {
      const res = await apiFetch<{ event: HostEventDto }>(`/api/host/events/${event.id}/album`, { method: "POST" });
      onOpened(res.event);
      onMessage(t("Fotoğraf albümü açıldı. QR kartlarınızı hazırlayabilirsiniz."), "success");
    } catch (err) {
      if (err instanceof ApiError && err.code === "DRIVE_NOT_CONNECTED") setNeedsDrive(true);
      else onMessage(errorMessage(err), "error");
    } finally {
      setOpening(false);
    }
  };
  return (
    <section className="mt-3 flex flex-wrap items-center gap-4 rounded-3xl border border-dashed border-stone-300 bg-white p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-600">
        <Images className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 basis-60">
        <span className="block text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{t("Düğün günü")}</span>
        <span className="block text-sm font-semibold text-stone-900">{t("Fotoğraf albümü henüz açılmadı")}</span>
        <span className="block text-xs leading-relaxed text-stone-500">
          {needsDrive
            ? t("Albümü açmak için önce Etkinliklerim sayfasındaki “Google Drive depolama” kartından Drive’ınızı bağlayın.")
            : t("Bu etkinlik şimdilik davetiye ve oturma planı için. Albümü açtığınızda QR kartlar, misafir yüklemeleri ve canlı ekran kullanılabilir.")}
        </span>
      </span>
      {needsDrive ? (
        <Link href="/dashboard" className="rounded-2xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-800">
          {t("Drive’ı bağla")}
        </Link>
      ) : (
        <button type="button" onClick={() => void open()} disabled={opening || event.plan !== "pro"} className="inline-flex items-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {opening && <Loader2 className="h-4 w-4 animate-spin" />} {t("Albümü aç")}
        </button>
      )}
    </section>
  );
}
