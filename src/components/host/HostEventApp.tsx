"use client";

import { BookHeart, ChevronLeft, Images, LayoutDashboard, Loader2, QrCode, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { GuestbookModerationTab } from "@/components/host/GuestbookModerationTab";
import { GuestsTab } from "@/components/host/GuestsTab";
import { HostHeader } from "@/components/host/HostHeader";
import { MediaModerationTab } from "@/components/host/MediaModerationTab";
import { OverviewTab } from "@/components/host/OverviewTab";
import { QrCardDesigner } from "@/components/host/QrCardDesigner";
import { SettingsTab } from "@/components/host/SettingsTab";
import { ToastRegion, useToastQueue } from "@/components/ui/Feedback";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { EventStatsDto, HostEventDto } from "@/types/domain";
import { useLang, useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";

const STATS_REFRESH_DEBOUNCE_MS = 1500;

type Tab = "overview" | "media" | "guestbook" | "guests" | "qr" | "settings";

const TABS: Array<{ id: Tab; label: MsgKey; icon: typeof Images }> = [
  { id: "overview", label: "Özet", icon: LayoutDashboard },
  { id: "media", label: "Medya", icon: Images },
  { id: "guestbook", label: "Anı Defteri", icon: BookHeart },
  { id: "guests", label: "Misafirler", icon: Users },
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

        <nav className="-mx-4 mt-5 mb-6 overflow-x-auto border-b border-stone-200 px-4">
          <ul className="flex gap-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                    tab === id ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {t(label)}
                  {id === "media" && stats.pending > 0 && (
                    <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">{stats.pending}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {tab === "overview" && <OverviewTab event={event} stats={stats} guestUrl={guestUrl} onToggleUploads={toggleUploads} onMessage={onMessage} />}
        {tab === "media" && <MediaModerationTab event={event} pendingCount={stats.pending} onMessage={onMessage} onChanged={refresh} />}
        {tab === "guestbook" && <GuestbookModerationTab event={event} onMessage={onMessage} />}
        {tab === "guests" && <GuestsTab event={event} onMessage={onMessage} />}
        {tab === "qr" && (
          <QrCardDesigner url={guestUrl} coupleNames={event.coupleNames || event.title} dateText={dateText} themeColor={event.themeColor} slug={event.slug} tableNumbers={event.tableNumbers} eventDate={event.eventDate} />
        )}
        {tab === "settings" && <SettingsTab key={event.updatedAt} event={event} onSaved={(ev) => setData({ ...data, event: ev })} onMessage={onMessage} />}
      </main>
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
