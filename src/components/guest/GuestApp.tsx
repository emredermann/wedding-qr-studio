"use client";

import { BookHeart, Camera, Heart, Images, Loader2, Pencil, ScanFace } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { FaceSearchPanel } from "@/components/guest/FaceSearchPanel";
import { GalleryPanel } from "@/components/guest/GalleryPanel";
import { GuestbookPanel } from "@/components/guest/GuestbookPanel";
import { UploadPanel } from "@/components/guest/UploadPanel";
import { ToastRegion, useToastQueue } from "@/components/ui/Feedback";
import { trackEvent } from "@/lib/client/analytics";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { MediaDto, PublicEventDto } from "@/types/domain";

type Tab = "upload" | "gallery" | "find" | "guestbook";

const NAME_KEY = "wqr:guest-name";

function readStoredName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export function GuestApp({ slug }: { slug: string }) {
  const [event, setEvent] = useState<PublicEventDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string>(readStoredName);
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
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
        <h1 className="font-serif text-2xl text-stone-900">Etkinlik bulunamadı</h1>
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
  const displayName = event.coupleNames || event.title;
  const dateText = formatDate(event.eventDate);

  if (!guestName || editingName) {
    return (
      <main style={accentStyle} className="wqr-safe-top flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 px-6 py-10">
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg" style={{ backgroundColor: "var(--accent)" }}>
            <Heart className="h-7 w-7 fill-current" />
          </span>
          <p className="text-xs font-semibold tracking-[0.3em] text-stone-500 uppercase">Hoş geldiniz</p>
          <h1 className="mt-2 font-serif text-4xl leading-tight text-stone-900">{displayName}</h1>
          {dateText && <p className="mt-2 text-sm text-stone-600">{dateText}</p>}
          <p className="mt-5 text-sm leading-relaxed text-stone-700">
            {event.welcomeMessage || "Bu özel günde çektiğiniz fotoğrafları, videoları ve dileklerinizi bizimle paylaşın."}
          </p>

          <form onSubmit={saveName} className="mt-8 space-y-3 text-left">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">Adınız veya rumuzunuz</span>
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={80}
                placeholder="Örn. Ayşe Teyze"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3.5 text-base outline-none focus:border-stone-500"
              />
            </label>
            <button
              type="submit"
              disabled={!nameDraft.trim()}
              className="w-full rounded-2xl py-3.5 text-base font-semibold text-white shadow-md disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Başla
            </button>
            <p className="text-center text-[11px] text-stone-500">Uygulama yok, üyelik yok. Sadece adınız.</p>
          </form>
        </div>
      </main>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Camera; show: boolean }> = [
    { id: "upload", label: "Yükle", icon: Camera, show: event.uploadsEnabled },
    { id: "gallery", label: "Galeri", icon: Images, show: true },
    { id: "find", label: "Beni Bul", icon: ScanFace, show: event.faceSearchEnabled },
    { id: "guestbook", label: "Anı Defteri", icon: BookHeart, show: event.guestbookEnabled },
  ];
  const visibleTabs = tabs.filter((t) => t.show);
  const activeTab: Tab = tab && visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0].id;

  return (
    <main style={accentStyle} className="min-h-dvh bg-stone-50 pb-28">
      <header className="wqr-safe-top border-b border-stone-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-serif text-xl text-stone-900">{displayName}</h1>
            {dateText && <p className="text-xs text-stone-500">{dateText}</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              setNameDraft(guestName);
              setEditingName(true);
            }}
            className="inline-flex max-w-[45%] shrink-0 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700"
          >
            <span className="truncate">{guestName}</span>
            <Pencil className="h-3 w-3 shrink-0" />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-5">
        {/* Kept mounted while other tabs are open so in-flight uploads, the queue
            and progress bars survive a tab switch (no orphaned XHRs). */}
        {event.uploadsEnabled && (
          <div className={activeTab === "upload" ? "block" : "hidden"}>
            <UploadPanel
              event={event}
              guestName={guestName}
              onUploaded={(media) => setRecentUploads((prev) => [media, ...prev])}
              onMessage={onMessage}
            />
          </div>
        )}
        {activeTab === "gallery" && <GalleryPanel event={event} recentUploads={recentUploads} onMessage={onMessage} />}
        {activeTab === "find" && <FaceSearchPanel event={event} onMessage={onMessage} />}
        {activeTab === "guestbook" && <GuestbookPanel event={event} guestName={guestName} onMessage={onMessage} />}
      </div>

      <nav className="wqr-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur-md">
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
