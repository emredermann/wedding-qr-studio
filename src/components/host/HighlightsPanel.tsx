"use client";

import { Clapperboard, Loader2, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ui } from "@/components/ui/styles";
import { trackEvent } from "@/lib/client/analytics";
import { saveBlob } from "@/lib/client/download";
import { drawImageInRect, drawWatermark, loadOptionalImage, loadPhoto } from "@/lib/client/frame";
import { mediaImageSrc } from "@/lib/media-urls";
import { useLang, useT } from "@/lib/i18n/provider";
import type { HostEventDto, MediaDto } from "@/types/domain";

const SLIDE_MS = 2600;
const FADE_MS = 600;
const TITLE_MS = 2200;

type Orientation = "portrait" | "landscape";
const SIZES: Record<Orientation, { w: number; h: number }> = { portrait: { w: 1080, h: 1920 }, landscape: { w: 1920, h: 1080 } };

/** Wall clock for the recording loop (kept outside the component). */
const clock = () => performance.now();

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/**
 * Highlights: the most-hearted photos as a slideshow (no music) the host can
 * play full screen or export as a short video, rendered in the browser.
 */
export function HighlightsPanel({ event, photos }: { event: HostEventDto; photos: MediaDto[] }) {
  const t = useT();
  const { locale } = useLang();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(photos.slice(0, 15).map((p) => p.id)));
  const [playing, setPlaying] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = photos.filter((p) => selected.has(p.id));
  const title = event.coupleNames || event.title;
  const dateText = event.eventDate ? new Date(`${event.eventDate}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "";

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 40) next.add(id);
      return next;
    });

  const exportVideo = async () => {
    const mime = pickMime();
    if (!mime) {
      setError(t("Bu tarayıcı video kaydını desteklemiyor. Chrome, Edge ya da Safari’nin güncel sürümünü deneyin."));
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const { w, h } = SIZES[orientation];
      const [images, logo] = await Promise.all([
        Promise.all(chosen.map((p) => loadPhoto(p.fileId, 1600).catch(() => null))),
        loadOptionalImage(event.brand?.logoUrl),
      ]);
      const slides = images.filter((img): img is HTMLImageElement => img !== null);
      if (slides.length === 0) throw new Error(t("Fotoğraflar yüklenemedi."));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas desteklenmiyor.");
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
      const total = TITLE_MS + slides.length * SLIDE_MS + TITLE_MS;
      const unit = Math.min(w, h) / 100;

      const drawSlide = (img: HTMLImageElement, local: number, alpha: number) => {
        // Gentle zoom (Ken Burns), blurred fill behind portrait/landscape mismatches.
        const zoom = 1 + 0.06 * (local / SLIDE_MS);
        ctx.globalAlpha = alpha;
        ctx.filter = "blur(40px) brightness(0.6)";
        drawImageInRect(ctx, img, -40, -40, w + 80, h + 80, "cover");
        ctx.filter = "none";
        const zw = w * zoom;
        const zh = h * zoom;
        drawImageInRect(ctx, img, (w - zw) / 2, (h - zh) / 2, zw, zh, "contain");
        ctx.globalAlpha = 1;
      };
      const drawCard = (heading: string, sub: string, alpha: number) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#111110";
        ctx.fillRect(0, 0, w, h);
        let y = h / 2;
        if (logo) {
          const lh = unit * 14;
          const lw = Math.min((logo.width / logo.height) * lh, w * 0.6);
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.beginPath();
          ctx.roundRect(w / 2 - lw / 2 - unit * 3, y - lh - unit * 9, lw + unit * 6, lh + unit * 4, unit * 2);
          ctx.fill();
          ctx.drawImage(logo, w / 2 - lw / 2, y - lh - unit * 7, lw, lh);
          y += unit * 2;
        }
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `400 ${Math.round(unit * 8)}px Georgia, serif`;
        ctx.fillText(heading, w / 2, y, w * 0.9);
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.font = `400 ${Math.round(unit * 3.4)}px system-ui, sans-serif`;
        ctx.fillText(sub, w / 2, y + unit * 9, w * 0.9);
        ctx.globalAlpha = 1;
      };

      const frameAt = (ms: number) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        if (ms < TITLE_MS) {
          drawCard(title, dateText, 1);
        } else if (ms < TITLE_MS + slides.length * SLIDE_MS) {
          const s = ms - TITLE_MS;
          const i = Math.floor(s / SLIDE_MS);
          const local = s % SLIDE_MS;
          if (i > 0 && local < FADE_MS) drawSlide(slides[i - 1], SLIDE_MS, 1);
          else if (i === 0 && local < FADE_MS) drawCard(title, dateText, 1);
          drawSlide(slides[i], local, Math.min(1, local / FADE_MS));
        } else {
          const local = ms - TITLE_MS - slides.length * SLIDE_MS;
          drawSlide(slides[slides.length - 1], SLIDE_MS, 1);
          drawCard(title, t("Hepsi için teşekkürler"), Math.min(1, local / FADE_MS));
        }
        if (event.shareFrame.watermark) drawWatermark(ctx, w - unit * 4, h - unit * 4, unit * 1.4, true);
      };

      frameAt(0);
      recorder.start(500);
      const started = clock();
      await new Promise<void>((resolve) => {
        // Timer (not requestAnimationFrame) so recording continues at a steady pace.
        const timer = window.setInterval(() => {
          const ms = clock() - started;
          if (ms >= total) {
            window.clearInterval(timer);
            resolve();
            return;
          }
          frameAt(ms);
          setProgress(ms / total);
        }, 1000 / 30);
      });
      recorder.stop();
      await done;
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      saveBlob(new Blob(chunks, { type: mime.split(";")[0] }), `one-cikanlar-${event.slug}.${ext}`);
      trackEvent("highlights_exported", { slides: slides.length });
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
          <Clapperboard className="h-4 w-4" /> {t("Öne çıkanlar")}
        </h3>
        <p className={`mt-1 ${ui.hint}`}>{t("En çok kalp alan fotoğraflardan müziksiz bir slayt gösterisi. Tam ekran oynatın ya da kısa video olarak indirin.")}</p>
      </div>
      {photos.length === 0 ? (
        <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-500">{t("Henüz onaylı fotoğraf yok.")}</p>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
            {photos.map((p) => {
              const on = selected.has(p.id);
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on} className={`relative aspect-square overflow-hidden rounded-lg ${on ? "ring-2 ring-stone-900" : "opacity-40"}`}>
                  <img src={mediaImageSrc(p, 300)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  {p.heartCount > 0 && <span className="absolute right-0.5 bottom-0.5 rounded-full bg-black/55 px-1 text-[9px] text-white">♥ {p.heartCount}</span>}
                </button>
              );
            })}
          </div>
          <p className={ui.hint}>{t("{n} fotoğraf seçili (en fazla 40).", { n: chosen.length })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={chosen.length === 0} onClick={() => setPlaying(true)} className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Play className="h-4 w-4" /> {t("Oynat")}
            </button>
            <select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)} className="rounded-full border border-stone-300 bg-white px-3 py-2 text-sm">
              <option value="portrait">{t("Dikey (hikâye, 9:16)")}</option>
              <option value="landscape">{t("Yatay (16:9)")}</option>
            </select>
            <button type="button" disabled={chosen.length === 0 || progress !== null} onClick={exportVideo} className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium disabled:opacity-50">
              {progress !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              {progress !== null ? t("Video hazırlanıyor… %{n}", { n: Math.round(progress * 100) }) : t("Video olarak indir")}
            </button>
          </div>
          {progress !== null && <p className={ui.hint}>{t("Video gerçek zamanlı kaydedilir; bitene kadar bu sekmeyi açık tutun.")}</p>}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        </>
      )}
      {playing && <Slideshow photos={chosen} title={title} dateText={dateText} logoUrl={event.brand?.logoUrl ?? null} onClose={() => setPlaying(false)} />}
    </section>
  );
}

function Slideshow({ photos, title, dateText, logoUrl, onClose }: { photos: MediaDto[]; title: string; dateText: string; logoUrl: string | null; onClose: () => void }) {
  const t = useT();
  const [index, setIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => (i + 1 >= photos.length ? -1 : i + 1)), 3500);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    void rootRef.current?.requestFullscreen?.().catch(() => undefined);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [photos.length, onClose]);
  const current = index >= 0 ? photos[index] : null;
  return (
    <div ref={rootRef} className="fixed inset-0 z-[70] flex items-center justify-center bg-black text-white">
      {current ? (
        <img key={current.id} src={mediaImageSrc(current, 1600)} alt="" className="absolute inset-0 h-full w-full animate-[eqrKenBurns_3.5s_ease-out_forwards] object-contain" />
      ) : (
        <div className="eqr-step-enter text-center">
          {logoUrl && <img src={logoUrl} alt="" className="mx-auto mb-6 h-20 max-w-[16rem] rounded-xl bg-white/90 object-contain p-2" />}
          <p className="font-serif text-6xl">{title}</p>
          {dateText && <p className="mt-4 text-xl text-white/60">{dateText}</p>}
        </div>
      )}
      <button type="button" onClick={onClose} aria-label={t("Kapat")} className="absolute top-6 right-6 rounded-full bg-white/10 p-3 hover:bg-white/20">
        <X className="h-6 w-6" />
      </button>
    </div>
  );
}
