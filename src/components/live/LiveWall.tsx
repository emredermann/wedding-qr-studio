"use client";

import { Expand, Heart, Shrink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useReducer, useState } from "react";

import { trackEvent } from "@/lib/client/analytics";
import { apiFetch } from "@/lib/client/api";
import { driveImageUrl, FULL_IMAGE_SIZE, streamUrl } from "@/lib/media-urls";
import type { GuestbookMessageDto, MediaDto, MediaPage, PublicEventDto } from "@/types/domain";

const PHOTO_MS = 7000;
const VIDEO_MAX_MS = 25000;
const MESSAGE_MS = 9000;
const POLL_MS = 6000;

interface SlideState {
  pool: MediaDto[];
  priority: string[];
  currentId: string | null;
  previousId: string | null;
  /** Items that arrived while the wall was running (shown with a "Yeni" badge). */
  freshIds: string[];
}

type SlideAction = { type: "merge"; items: MediaDto[]; fresh: boolean } | { type: "advance" };

function slideReducer(state: SlideState, action: SlideAction): SlideState {
  if (action.type === "merge") {
    const known = new Set(state.pool.map((m) => m.id));
    const incoming = action.items.filter((m) => !known.has(m.id) && m.kind !== "audio");
    if (incoming.length === 0) return state;
    const pool = [...incoming, ...state.pool].slice(0, 500);
    const ids = incoming.map((m) => m.id);
    const priority = action.fresh ? [...state.priority, ...ids] : state.priority;
    const freshIds = action.fresh ? [...ids, ...state.freshIds].slice(0, 100) : state.freshIds;
    return { ...state, pool, priority, freshIds, currentId: state.currentId ?? pool[0]?.id ?? null };
  }
  if (state.pool.length === 0) return state;
  let nextId: string;
  let priority = state.priority;
  if (priority.length > 0) {
    nextId = priority[0];
    priority = priority.slice(1);
  } else {
    const idx = state.pool.findIndex((m) => m.id === state.currentId);
    nextId = state.pool[(idx + 1) % state.pool.length].id;
  }
  return { ...state, priority, previousId: state.currentId, currentId: nextId };
}

/**
 * Latest ISO timestamp in the list. For an empty event it falls back to the
 * epoch (not the client clock, which may be ahead of the server's).
 */
function maxIso(values: Array<string | null | undefined>): string {
  let best: string | null = null;
  for (const v of values) if (v && (!best || v > best)) best = v;
  return best ?? "1970-01-01T00:00:00.000Z";
}

export function LiveWall({ slug }: { slug: string }) {
  const [event, setEvent] = useState<PublicEventDto | null>(null);
  const [guestUrl, setGuestUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [slides, dispatch] = useReducer(slideReducer, { pool: [], priority: [], currentId: null, previousId: null, freshIds: [] });
  const [messages, setMessages] = useState<GuestbookMessageDto[]>([]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [newestMedia, setNewestMedia] = useState<string | null>(null);
  const [newestMessage, setNewestMessage] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const base = `/api/events/${encodeURIComponent(slug)}`;

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ev, media, notes] = await Promise.all([
          apiFetch<{ event: PublicEventDto }>(base),
          apiFetch<MediaPage>(`${base}/media?limit=100`),
          apiFetch<{ items: GuestbookMessageDto[] }>(`${base}/guestbook`).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        setEvent(ev.event);
        setGuestUrl(`${window.location.origin}/e/${encodeURIComponent(slug)}`);
        trackEvent("live_wall_opened");
        const approved = media.items.filter((m) => m.status === "approved");
        dispatch({ type: "merge", items: approved, fresh: false });
        setNewestMedia(maxIso(media.items.map((m) => m.publishedAt)));
        const approvedNotes = notes.items.filter((n) => n.status === "approved");
        setMessages(approvedNotes.slice(0, 50));
        setNewestMessage(maxIso(notes.items.map((n) => n.publishedAt)));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Yüklenemedi");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, slug]);

  // Polling for new uploads and notes (no page refresh)
  useEffect(() => {
    if (!newestMedia || !newestMessage) return;
    const timer = window.setInterval(async () => {
      try {
        const media = await apiFetch<MediaPage>(`${base}/media?since=${encodeURIComponent(newestMedia)}&limit=50`);
        const fresh = media.items.filter((m) => m.status === "approved");
        if (media.items.length > 0) {
          dispatch({ type: "merge", items: [...fresh].reverse(), fresh: true });
          setNewestMedia((prev) => maxIso([prev, ...media.items.map((m) => m.publishedAt)]));
        }
      } catch {
        // transient network error: try again next tick
      }
      try {
        const notes = await apiFetch<{ items: GuestbookMessageDto[] }>(`${base}/guestbook?since=${encodeURIComponent(newestMessage)}`);
        if (notes.items.length > 0) {
          const approved = notes.items.filter((n) => n.status === "approved").reverse();
          if (approved.length > 0) {
            setMessages((prev) => [...approved, ...prev.filter((p) => !approved.some((a) => a.id === p.id))].slice(0, 50));
            setMessageIndex(0);
          }
          setNewestMessage((prev) => maxIso([prev, ...notes.items.map((n) => n.publishedAt)]));
        }
      } catch {
        // ignore
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [base, newestMedia, newestMessage]);

  const current = slides.pool.find((m) => m.id === slides.currentId) ?? null;
  const previous = slides.pool.find((m) => m.id === slides.previousId) ?? null;

  const advance = useCallback(() => dispatch({ type: "advance" }), []);

  // Slide timer
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(advance, current.kind === "video" ? VIDEO_MAX_MS : PHOTO_MS);
    return () => window.clearTimeout(timer);
  }, [current, advance]);

  // Preload the next photo
  useEffect(() => {
    const nextId = slides.priority[0] ?? slides.pool[(slides.pool.findIndex((m) => m.id === slides.currentId) + 1) % Math.max(1, slides.pool.length)]?.id;
    const next = slides.pool.find((m) => m.id === nextId);
    if (next?.kind === "photo") {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = driveImageUrl(next.fileId, FULL_IMAGE_SIZE);
    }
  }, [slides]);

  // Rotate guestbook notes
  useEffect(() => {
    if (messages.length < 2) return;
    const timer = window.setInterval(() => setMessageIndex((i) => (i + 1) % messages.length), MESSAGE_MS);
    return () => window.clearInterval(timer);
  }, [messages.length]);

  // Keep the screen awake
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen");
      } catch {
        // not supported / denied
      }
    };
    void request();
    const onVisible = () => void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  if (error) {
    return <main className="flex h-dvh items-center justify-center bg-black text-white/70">{error}</main>;
  }

  const accent = event?.themeColor ?? "#b45309";
  const message = messages.length > 0 ? messages[messageIndex % messages.length] : null;
  const isNew = current ? slides.freshIds.includes(current.id) : false;

  return (
    <main className="relative h-dvh w-screen cursor-none overflow-hidden bg-black text-white select-none">
      {previous && previous.id !== current?.id && previous.kind === "photo" && (
        <img
          key={`prev-${previous.id}`}
          src={driveImageUrl(previous.fileId, FULL_IMAGE_SIZE)}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full animate-[eqrFadeOut_1.2s_ease_forwards] object-contain"
        />
      )}
      {current && current.kind === "photo" && (
        <>
          <img
            key={`bg-${current.id}`}
            src={driveImageUrl(current.fileId, 600)}
            alt=""
            aria-hidden
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
          />
          <img
            key={current.id}
            src={driveImageUrl(current.fileId, FULL_IMAGE_SIZE)}
            alt={current.note ?? ""}
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full animate-[eqrKenBurns_8s_ease-out_forwards] object-contain"
          />
        </>
      )}
      {current && current.kind === "video" && (
        <video
          key={current.id}
          src={streamUrl(current.fileId)}
          autoPlay
          muted
          playsInline
          onEnded={advance}
          onError={advance}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {!current && event && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
          <Heart className="h-12 w-12 fill-current" style={{ color: accent }} />
          <h1 className="font-serif text-5xl">{event.coupleNames || event.title}</h1>
          <p className="text-xl text-white/70">QR kodu okutun, ilk fotoğrafı siz paylaşın!</p>
        </div>
      )}

      {/* Caption */}
      {current && (current.guestName || current.note) && (
        <div className="absolute top-8 left-8 max-w-[45vw] rounded-2xl bg-black/45 px-5 py-3 backdrop-blur-md">
          {isNew && (
            <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold tracking-wider uppercase" style={{ backgroundColor: accent }}>
              Yeni
            </span>
          )}
          {current.guestName && <p className="text-lg font-semibold">{current.guestName}</p>}
          {current.note && <p className="text-base text-white/85 italic">“{current.note}”</p>}
        </div>
      )}

      {/* Guestbook ticker */}
      {message && (
        <div key={message.id} className="eqr-step-enter absolute bottom-8 left-8 max-w-[55vw] rounded-3xl bg-white/90 px-7 py-5 text-stone-900 shadow-2xl">
          <p className="line-clamp-4 font-serif text-2xl leading-snug">“{message.message}”</p>
          <p className="mt-2 text-base font-medium" style={{ color: accent }}>
            — {message.guestName}
          </p>
        </div>
      )}

      {/* QR */}
      {guestUrl && (
        <div className="absolute right-8 bottom-8 flex flex-col items-center gap-2 rounded-3xl bg-white p-4 text-center text-stone-900 shadow-2xl">
          <QRCodeSVG value={guestUrl} size={150} level="M" fgColor="#111111" />
          <p className="max-w-[160px] text-sm leading-tight font-semibold">Okut, fotoğrafını paylaş!</p>
        </div>
      )}

      <div className="absolute top-8 right-8 flex items-center gap-3">
        <span className="rounded-full bg-black/45 px-4 py-2 text-sm backdrop-blur-md">{slides.pool.length} anı</span>
        <button type="button" onClick={toggleFullscreen} className="cursor-pointer rounded-full bg-black/45 p-2.5 backdrop-blur-md hover:bg-black/60" aria-label="Tam ekran">
          {fullscreen ? <Shrink className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
        </button>
      </div>
    </main>
  );
}
