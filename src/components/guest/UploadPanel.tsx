"use client";

import { AlertCircle, Camera, CheckCircle2, ImagePlus, Loader2, RotateCcw, Trash2, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { trackEvent } from "@/lib/client/analytics";
import { errorMessage } from "@/lib/client/api";
import { uploadToDrive } from "@/lib/client/drive-upload";
import { analyzePhoto } from "@/lib/faceRecognition";
import {
  classifyMimeType,
  formatBytes,
  inferMimeTypeFromFileName,
  MAX_CONCURRENT_UPLOADS,
  MAX_FILE_SIZE_BYTES,
  normaliseMimeType,
} from "@/lib/media-config";
import type { MediaDto, MediaKind, PublicEventDto } from "@/types/domain";

type ItemStatus = "queued" | "uploading" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  kind: MediaKind;
  previewUrl: string | null;
  status: ItemStatus;
  progress: number;
  error: string | null;
  category: string | null;
  note: string;
}

let faceLock: Promise<unknown> = Promise.resolve();

/**
 * Files whose bytes are already on Drive but still wait for face analysis /
 * confirm do not hold a transfer slot. This caps how many items can be in
 * flight in total (transferring + finishing), bounding memory on phones.
 */
const MAX_UPLOADS_IN_FLIGHT = MAX_CONCURRENT_UPLOADS * 3;

/** Face detection is GPU/CPU heavy: run one photo at a time. */
function analyzeSerially(file: File, withFaces: boolean) {
  const run = faceLock.then(() => analyzePhoto(file, withFaces));
  faceLock = run.catch(() => undefined);
  return run;
}

function detectKind(file: File): MediaKind | null {
  const mime = normaliseMimeType(file.type) || inferMimeTypeFromFileName(file.name);
  return mime ? classifyMimeType(mime) : null;
}

export function UploadPanel({
  event,
  guestName,
  onUploaded,
  onMessage,
}: {
  event: PublicEventDto;
  guestName: string;
  onUploaded: (media: MediaDto) => void;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const queueRef = useRef<QueueItem[]>([]);
  const startedRef = useRef<Set<string>>(new Set());
  /** Items whose bytes reached Drive; they stay "uploading" until confirmed. */
  const bytesDoneRef = useRef<Set<string>>(new Set());
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const busy = items.some((item) => item.status === "queued" || item.status === "uploading");

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  useEffect(() => {
    const queue = queueRef;
    return () => {
      for (const item of queue.current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  function mutate(updater: (prev: QueueItem[]) => QueueItem[]) {
    queueRef.current = updater(queueRef.current);
    setItems(queueRef.current);
  }

  function patch(id: string, changes: Partial<QueueItem>) {
    mutate((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  async function runUpload(item: QueueItem) {
    patch(item.id, { status: "uploading", progress: 0, error: null });
    try {
      const extras =
        item.kind === "photo" ? analyzeSerially(item.file, event.faceSearchEnabled) : Promise.resolve({});
      const media = await uploadToDrive({
        file: item.file,
        fileName: item.file.name || `${item.kind}-${item.id}`,
        eventSlug: event.slug,
        guestName,
        note: item.note,
        category: item.category,
        extras,
        onProgress: (fraction) => patch(item.id, { progress: fraction }),
        onBytesUploaded: () => {
          // Free the transfer slot now; face analysis + confirm finish in the background.
          bytesDoneRef.current.add(item.id);
          pump();
        },
      });
      patch(item.id, { status: "done", progress: 1 });
      trackEvent("upload_completed", { kind: item.kind });
      onUploaded(media);
    } catch (error) {
      startedRef.current.delete(item.id);
      trackEvent("upload_failed", { kind: item.kind });
      patch(item.id, { status: "error", error: errorMessage(error) });
    } finally {
      bytesDoneRef.current.delete(item.id);
      pump();
    }
  }

  function pump() {
    const inFlight = queueRef.current.filter((item) => item.status === "uploading");
    const transferring = inFlight.filter((item) => !bytesDoneRef.current.has(item.id)).length;
    const free = Math.min(MAX_CONCURRENT_UPLOADS - transferring, MAX_UPLOADS_IN_FLIGHT - inFlight.length);
    if (free <= 0) return;
    const next = queueRef.current
      .filter((item) => item.status === "queued" && !startedRef.current.has(item.id))
      .slice(0, free);
    for (const item of next) {
      startedRef.current.add(item.id);
      void runUpload(item);
    }
    const remaining = queueRef.current.filter((i) => i.status === "queued" || i.status === "uploading").length;
    if (remaining === 0 && queueRef.current.some((i) => i.status === "done")) {
      const failed = queueRef.current.filter((i) => i.status === "error").length;
      if (failed === 0) onMessage(event.requireApproval ? "Yüklendi! Etkinlik sahibi onayladıktan sonra galeride görünecek." : "Tüm dosyalar yüklendi. Teşekkürler! 💛", "success");
    }
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const accepted: QueueItem[] = [];
    let rejected = 0;
    for (const file of Array.from(list)) {
      const kind = detectKind(file);
      if (!kind || kind === "audio") {
        rejected += 1;
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES[kind]) {
        onMessage(`${file.name} çok büyük (en fazla ${formatBytes(MAX_FILE_SIZE_BYTES[kind])}).`, "error");
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        kind,
        previewUrl: kind === "photo" ? URL.createObjectURL(file) : null,
        status: "queued",
        progress: 0,
        error: null,
        category,
        note: note.trim(),
      });
    }
    if (rejected > 0) onMessage(`${rejected} dosya desteklenmiyor (yalnızca fotoğraf ve video).`, "error");
    if (accepted.length === 0) return;
    mutate((prev) => [...accepted, ...prev]);
    setNote("");
    pump();
  }

  function retry(id: string) {
    patch(id, { status: "queued", error: null, progress: 0 });
    pump();
  }

  function clearFinished() {
    mutate((prev) => {
      for (const item of prev) if (item.status === "done" && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((item) => item.status !== "done");
    });
  }

  function removeItem(id: string) {
    mutate((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  if (!event.uploadsEnabled) {
    return (
      <div className="rounded-3xl border border-stone-200 bg-white/80 p-8 text-center text-stone-600">
        Etkinlik sahibi şu anda yeni yüklemeleri kapattı. Galeriye göz atabilirsiniz.
      </div>
    );
  }

  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-3xl px-4 py-7 text-white shadow-lg transition active:scale-[0.98]"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Camera className="h-8 w-8" />
          <span className="text-sm font-semibold">Fotoğraf / Video Çek</span>
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-4 py-7 transition active:scale-[0.98]"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          <ImagePlus className="h-8 w-8" />
          <span className="text-sm font-semibold">Galeriden Seç</span>
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*,video/*,.heic,.heif,.mov"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {event.categories.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Hangi an? (isteğe bağlı)</p>
          <div className="flex flex-wrap gap-2">
            {[null, ...event.categories].map((cat) => (
              <button
                key={cat ?? "_none"}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  category === cat ? "border-transparent text-white" : "border-stone-300 bg-white text-stone-700"
                }`}
                style={category === cat ? { backgroundColor: "var(--accent)" } : undefined}
              >
                {cat ?? "Genel"}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block">
        <span className="mb-2 block text-xs font-semibold tracking-wide text-stone-500 uppercase">Anı notu (isteğe bağlı)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          rows={2}
          placeholder="Bu fotoğrafla ilgili kısa bir not bırakın…"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-stone-500"
        />
        <span className="mt-1 block text-right text-[11px] text-stone-400">{note.length}/500 · seçeceğiniz dosyalara eklenir</span>
      </label>

      {items.length > 0 && (
        <div className="rounded-3xl border border-stone-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-stone-800">
              Yüklemeler <span className="font-normal text-stone-500">({doneCount}/{items.length})</span>
            </p>
            {doneCount > 0 && (
              <button type="button" onClick={clearFinished} className="text-xs font-medium text-stone-500 hover:text-stone-800">
                Tamamlananları temizle
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-stone-50 p-2">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-stone-200 text-stone-500">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                  ) : (
                    <Video className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-stone-800">{item.file.name || "Kamera"}</p>
                  <p className="text-[11px] text-stone-500">
                    {formatBytes(item.file.size)}
                    {item.status === "uploading" && ` · %${Math.round(item.progress * 100)}`}
                    {item.status === "queued" && " · sırada"}
                    {item.status === "done" && " · yüklendi"}
                  </p>
                  {item.status === "error" ? (
                    <p className="mt-0.5 flex items-start gap-1 text-[11px] text-rose-600">
                      <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                      {item.error}
                    </p>
                  ) : (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200">
                      <div
                        className="h-full rounded-full transition-[width] duration-200"
                        style={{ width: `${Math.round(item.progress * 100)}%`, backgroundColor: item.status === "done" ? "#16a34a" : "var(--accent)" }}
                      />
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {item.status === "uploading" && <Loader2 className="h-5 w-5 animate-spin text-stone-400" />}
                  {item.status === "done" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  {item.status === "error" && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => retry(item.id)} aria-label="Tekrar dene" className="rounded-full p-1.5 text-stone-600 hover:bg-stone-200">
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => removeItem(item.id)} aria-label="Kaldır" className="rounded-full p-1.5 text-stone-600 hover:bg-stone-200">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center text-[11px] leading-relaxed text-stone-500">
        Fotoğraflarınız orijinal kalitede, sıkıştırılmadan doğrudan etkinlik sahibinin Google Drive arşivine yüklenir.
        {event.faceSearchEnabled && event.galleryPublic && " “Beni Bul” için yüz analizi yalnızca telefonunuzda yapılır."}
      </p>
    </div>
  );
}
