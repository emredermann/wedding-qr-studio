"use client";

import { Camera, ImageUp, Loader2, ScanFace, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Lightbox } from "@/components/media/Lightbox";
import { MediaGrid } from "@/components/media/MediaGrid";
import { ZipDownloadButton } from "@/components/media/ZipDownloadButton";
import { trackEvent } from "@/lib/client/analytics";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { extractSelfieFromFile, extractSingleFaceFromSelfie, loadFaceModels } from "@/lib/faceRecognition";
import type { MediaDto, PublicEventDto } from "@/types/domain";

type Phase = "idle" | "camera" | "analyzing" | "results";

export function FaceSearchPanel({
  event,
  onMessage,
}: {
  event: PublicEventDto;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<MediaDto[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => stopCamera, []);

  async function search(descriptor: number[]) {
    const res = await apiFetch<{ items: MediaDto[] }>(`/api/events/${encodeURIComponent(event.slug)}/faces`, {
      method: "POST",
      json: { descriptor },
    });
    setResults(res.items);
    setPhase("results");
    trackEvent("face_search", { found: res.items.length > 0 });
    if (res.items.length === 0) onMessage("Henüz sizi içeren bir fotoğraf bulunamadı. Daha sonra tekrar deneyin.", "info");
  }

  async function openCamera() {
    setHint("Modeller yükleniyor…");
    setPhase("camera");
    try {
      const [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false }),
        loadFaceModels(),
      ]);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setHint("Yüzünüzü çerçeveye ortalayın ve “Tara”ya basın.");
    } catch (error) {
      stopCamera();
      setPhase("idle");
      setHint(null);
      onMessage(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Kamera izni verilmedi. Bunun yerine bir selfie fotoğrafı yükleyebilirsiniz."
          : errorMessage(error),
        "error",
      );
    }
  }

  async function captureFromCamera() {
    const video = videoRef.current;
    if (!video) return;
    setHint("Yüz analiz ediliyor…");
    try {
      const descriptor = await extractSingleFaceFromSelfie(video);
      if (!descriptor) {
        setHint("Yüz bulunamadı. Işığa dönüp tekrar deneyin.");
        return;
      }
      stopCamera();
      setPhase("analyzing");
      await search(descriptor);
    } catch (error) {
      onMessage(errorMessage(error), "error");
      setPhase("idle");
    } finally {
      setHint(null);
    }
  }

  async function analyzeFile(file: File | undefined) {
    if (!file) return;
    setPhase("analyzing");
    try {
      const descriptor = await extractSelfieFromFile(file);
      if (!descriptor) {
        onMessage("Fotoğrafta yüz bulunamadı. Yüzünüzün net göründüğü bir fotoğraf seçin.", "error");
        setPhase("idle");
        return;
      }
      await search(descriptor);
    } catch (error) {
      onMessage(errorMessage(error), "error");
      setPhase("idle");
    }
  }

  if (!event.faceSearchEnabled || !event.galleryPublic) {
    return <p className="rounded-3xl bg-white/80 p-8 text-center text-stone-600">Yüz arama bu etkinlikte kapalı.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-stone-200 bg-white p-5 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ backgroundColor: "var(--accent)" }}>
          <ScanFace className="h-7 w-7" />
        </span>
        <h2 className="font-serif text-xl text-stone-900">Fotoğraflarımı Bul</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-stone-600">
          Bir selfie çekin; yapay zekâ etkinlikteki yüzlerle karşılaştırıp sizin olduğunuz fotoğrafları getirsin. Selfie’niz cihazınızdan çıkmaz.
        </p>

        {phase === "camera" && (
          <div className="relative mx-auto mt-4 aspect-[3/4] w-full max-w-xs overflow-hidden rounded-3xl bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-[45%] border-2 border-white/70" />
            <button type="button" onClick={() => { stopCamera(); setPhase("idle"); }} aria-label="Kapat" className="absolute top-2 right-2 rounded-full bg-black/50 p-2 text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {hint && <p className="mt-3 text-xs text-stone-500">{hint}</p>}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {phase === "camera" ? (
            <button type="button" onClick={captureFromCamera} className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white" style={{ backgroundColor: "var(--accent)" }}>
              <ScanFace className="h-4 w-4" /> Tara
            </button>
          ) : phase === "analyzing" ? (
            <span className="inline-flex items-center justify-center gap-2 py-3 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Fotoğraflar taranıyor…
            </span>
          ) : (
            <>
              <button type="button" onClick={openCamera} className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white" style={{ backgroundColor: "var(--accent)" }}>
                <Camera className="h-4 w-4" /> Selfie çek
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-800">
                <ImageUp className="h-4 w-4" /> Fotoğraf yükle
              </button>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void analyzeFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>

      {phase === "results" && results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-stone-800">{results.length} fotoğrafta sizi bulduk</p>
            <ZipDownloadButton
              scope="faces"
              baseName={`${event.slug}-fotograflarim`}
              label="Hepsini indir"
              loadFiles={async () => results.map((m) => ({ fileId: m.fileId, name: m.originalName, sizeBytes: m.sizeBytes, createdAt: m.createdAt }))}
              onMessage={onMessage}
            />
          </div>
          <MediaGrid items={results} onOpen={setOpenIndex} />
        </div>
      )}

      {openIndex !== null && (
        <Lightbox items={results} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
      )}
    </div>
  );
}
