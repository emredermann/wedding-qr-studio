"use client";

import { BookHeart, Camera, Heart, Images, Loader2, Pencil, ScanFace } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { FaceSearchPanel } from "@/components/guest/FaceSearchPanel";
import { GalleryPanel } from "@/components/guest/GalleryPanel";
import { GuestbookPanel } from "@/components/guest/GuestbookPanel";
import { ScheduleCard } from "@/components/guest/ScheduleCard";
import { UploadPanel } from "@/components/guest/UploadPanel";
import { ToastRegion, useToastQueue } from "@/components/ui/Feedback";
import { BrandMark } from "@/components/brand/BrandMark";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { BRAND } from "@/lib/brand";
import { trackEvent } from "@/lib/client/analytics";
import { resolveGuestTable } from "@/lib/client/table";
import { useLang, useT } from "@/lib/i18n/provider";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { MediaDto, PublicEventDto } from "@/types/domain";

type Tab = "upload" | "gallery" | "find" | "guestbook";

const NAME_KEY = "eqr:guest-name";
const LEGACY_NAME_KEY = "wqr:guest-name";

function readStoredName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NAME_KEY) || window.localStorage.getItem(LEGACY_NAME_KEY) || "";
  } catch {
    return "";
  }
}

function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

export function GuestApp({ slug }: { slug: string }) {
  const t = useT();
  const { locale } = useLang();
  const [event, setEvent] = useState<PublicEventDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string>(readStoredName);
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  // Table number from the QR card (?table=N), remembered for this event.
  const [scannedTable] = useState(() => resolveGuestTable(slug));
  const [recentUploads, setRecentUploads] = useState<MediaDto[]>([]);
  const { toasts, pushToast, dismissToast } = useToastQueue();

  const onMessage = useCallback(
    (text: string, variant: "success" | "error" | "info" = "info") => pushToast(text, variant),
    [pushToast],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ event: PublicEventDto }>(`/api/events/${encodeURIComponent(slug)}`);
        if (!cancelled) setEvent(res.event);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    const value = nameDraft.trim().slice(0, 80);
    if (!value) return;
    try {
      window.localStorage.setItem(NAME_KEY, value);
    } catch {
      // Private mode: keep it in memory only.
    }
    if (!guestName) trackEvent("guest_joined");
    setGuestName(value);
    setEditingName(false);
  };

  if (loadError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone-50 px-6 text-center">
        <Heart className="h-8 w-8 text-stone-400" />
        <h1 className="font-serif text-2xl text-stone-900">{t("Etkinlik bulunamadı")}</h1>
        <p className="max-w-sm text-sm text-stone-600">{loadError}</p>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-stone-50 text-stone-400">
        <Loader2 className="h-7 w-7 animate-spin" />
      </main>
    );
  }

  const accentStyle = { "--accent": event.themeColor } as React.CSSProperties;
  // Only events that use per-table QR codes care about the table number.
  const tableNo = event.tableNumbers ? scannedTable : null;
  const displayName = event.coupleNames || event.title;
  const dateText = formatDate(event.eventDate, locale);

  if (!guestName || editingName) {
    return (
      <main style={accentStyle} className="eqr-safe-top relative flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 px-6 py-10">
        <LanguageSwitcher className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4" />
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg" style={{ backgroundColor: "var(--accent)" }}>
            <Heart className="h-7 w-7 fill-current" />
          </span>
          <p className="text-xs font-semibold tracking-[0.3em] text-stone-500 uppercase">{t("Hoş geldiniz")}</p>
          <h1 className="mt-2 font-serif text-4xl leading-tight text-stone-900">{displayName}</h1>
          {dateText && <p className="mt-2 text-sm text-stone-600">{dateText}</p>}
          <p className="mt-5 text-sm leading-relaxed text-stone-700">
            {event.welcomeMessage || t("Bu özel günde çektiğiniz fotoğrafları, videoları ve dileklerinizi bizimle paylaşın.")}
          </p>

          <form onSubmit={saveName} className="mt-8 space-y-3 text-left">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">{t("Adınız veya rumuzunuz")}</span>
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={80}
                placeholder={t("Örn. Ayşe Teyze")}
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3.5 text-base outline-none focus:border-stone-500"
              />
            </label>
            <button
              type="submit"
              disabled={!nameDraft.trim()}
              className="w-full rounded-2xl py-3.5 text-base font-semibold text-white shadow-md disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {t("Başla")}
            </button>
            <p className="text-center text-[11px] text-stone-500">{t("Uygulama yok, üyelik yok. Sadece adınız.")}</p>
            <p className="flex items-center justify-center gap-1.5 pt-6 text-[10px] tracking-[0.2em] text-stone-400 uppercase">
              <BrandMark className="h-4 w-4" /> {t("{brand} ile", { brand: BRAND.name })}
            </p>
          </form>
        </div>
      </main>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Camera; show: boolean }> = [
    { id: "upload", label: t("Yükle"), icon: Camera, show: event.uploadsEnabled },
    { id: "gallery", label: t("Galeri"), icon: Images, show: true },
    // "Beni Bul" is only offered when the gallery is public (server enforces this too).
    { id: "find", label: t("Beni Bul"), icon: ScanFace, show: event.faceSearchEnabled && event.galleryPublic },
    { id: "guestbook", label: t("Anı Defteri"), icon: BookHeart, show: event.guestbookEnabled },
  ];
  const visibleTabs = tabs.filter((t) => t.show);
  const activeTab: Tab = tab && visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0].id;

  return (
    <main style={accentStyle} className="min-h-dvh bg-stone-50 pb-28">
      <header className="eqr-safe-top border-b border-stone-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-serif text-2xl leading-tight text-stone-900">{displayName}</h1>
            {dateText && <p className="text-xs text-stone-500">{dateText}</p>}
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            title={t("Adı değiştir")}
            onClick={() => {
              setNameDraft(guestName);
              setEditingName(true);
            }}
            className="inline-flex max-w-[9rem] min-w-0 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700"
          >
            <span className="truncate">{guestName}</span>
            <Pencil className="h-3 w-3 shrink-0" />
          </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-5">
        <ScheduleCard
          schedule={event.schedule}
          eventDate={event.eventDate}
          onShareMoment={
            event.uploadsEnabled
              ? () => {
                  setTab("upload");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              : undefined
          }
        />
        {/* Kept mounted while other tabs are open so in-flight uploads, the queue
            and progress bars survive a tab switch (no orphaned XHRs). */}
        {event.uploadsEnabled && (
          <div className={activeTab === "upload" ? "block" : "hidden"}>
            <UploadPanel
              event={event}
              guestName={guestName}
              tableNo={tableNo}
              onUploaded={(media) => setRecentUploads((prev) => [media, ...prev])}
              onMessage={onMessage}
            />
          </div>
        )}
        {activeTab === "gallery" && <GalleryPanel event={event} recentUploads={recentUploads} guestName={guestName} guestTable={tableNo} onMessage={onMessage} />}
        {activeTab === "find" && <FaceSearchPanel event={event} onMessage={onMessage} />}
        {activeTab === "guestbook" && <GuestbookPanel event={event} guestName={guestName} tableNo={tableNo} onMessage={onMessage} />}
      </div>

      <nav className="eqr-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur-md">
        <ul className="mx-auto flex max-w-3xl">
          {visibleTabs.map(({ id, label, icon: Icon }) => {
            const active = id === activeTab;
            return (
              <li key={id} className="flex-1">
                <button
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full flex-col items-center gap-1 pt-2.5 pb-1 text-[11px] font-medium transition ${active ? "" : "text-stone-500"}`}
                  style={active ? { color: "var(--accent)" } : undefined}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
