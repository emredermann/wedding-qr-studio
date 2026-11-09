"use client";

import { Loader2, Mic, Square, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MAX_AUDIO_RECORDING_SECONDS, MAX_VIDEO_RECORDING_SECONDS } from "@/lib/media-config";

// MP4/AAC first: it plays everywhere (iPhone, Google Drive preview) and carries its
// duration. Chrome's WebM recordings have no duration, so Drive shows 0:00 and
// cannot play them; WebM/Ogg remain as fallbacks for browsers without MP4 support.
const AUDIO_TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
const VIDEO_TYPES = ["video/mp4;codecs=avc1,mp4a", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4", "video/webm"];

function pickMimeType(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return mime.startsWith("audio") ? "m4a" : "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export interface Recording {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

/**
 * Browser voice / video guestbook recorder built on the MediaRecorder API.
 * Calls `onDone` with the recording; the caller uploads it to Drive.
 */
export function Recorder({
  mode,
  onDone,
  onCancel,
  onError,
}: {
  mode: "audio" | "video";
  onDone: (recording: Recording) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<"starting" | "recording" | "preview">("starting");
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recording = useRef<Recording | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const limit = mode === "audio" ? MAX_AUDIO_RECORDING_SECONDS : MAX_VIDEO_RECORDING_SECONDS;

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    (async () => {
      try {
        if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("Bu tarayıcı kayıt yapmayı desteklemiyor.");
        }
        const stream = await navigator.mediaDevices.getUserMedia(
          mode === "audio"
            ? { audio: { echoCancellation: true, noiseSuppression: true } }
            : { audio: true, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } },
        );
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (mode === "video" && liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          await liveVideoRef.current.play().catch(() => undefined);
        }

        const mimeType = pickMimeType(mode === "audio" ? AUDIO_TYPES : VIDEO_TYPES);
        const recorder = new MediaRecorder(stream, {
          ...(mimeType ? { mimeType } : {}),
          ...(mode === "video" ? { videoBitsPerSecond: 2_500_000 } : { audioBitsPerSecond: 128_000 }),
        });
        recorderRef.current = recorder;
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          // Full type incl. codecs (e.g. `video/mp4;codecs=avc1,mp4a`): iOS Safari needs it
          // for the local preview, otherwise the video may stay black or play without sound.
          const fullType = recorder.mimeType || mimeType || (mode === "audio" ? "audio/webm" : "video/webm");
          // Base type (`video/mp4`) is what the server expects for the upload.
          const type = fullType.split(";")[0].trim();
          const blob = new Blob(chunks, { type });
          const previewBlob = fullType === type ? blob : new Blob(chunks, { type: fullType });
          if (blob.size === 0) {
            onError("Kayıt boş görünüyor, lütfen tekrar deneyin.");
            onCancel();
            return;
          }
          recording.current = {
            blob,
            mimeType: type,
            fileName: `ani-defteri-${mode === "audio" ? "ses" : "video"}-${new Date().toISOString().replace(/[:.]/g, "-")}.${extensionFor(type)}`,
          };
          setPreviewUrl(URL.createObjectURL(previewBlob));
          setState("preview");
        };
        recorder.start(1000);
        setState("recording");
        const startedAt = Date.now();
        timer = window.setInterval(() => {
          const elapsed = Math.floor((Date.now() - startedAt) / 1000);
          setSeconds(elapsed);
          if (elapsed >= limit && recorder.state === "recording") recorder.stop();
        }, 250);
      } catch (error) {
        if (cancelled) return;
        onError(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? mode === "audio"
              ? "Mikrofon izni verilmedi."
              : "Kamera/mikrofon izni verilmedi."
            : error instanceof Error
              ? error.message
              : "Kayıt başlatılamadı.",
        );
        onCancel();
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [mode, limit, onCancel, onError]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stop = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          {mode === "audio" ? <Mic className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          {mode === "audio" ? "Sesli mesaj" : "Video mesaj"}
        </p>
        <button type="button" onClick={onCancel} aria-label="Vazgeç" className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      {mode === "video" && state !== "preview" && (
        <video ref={liveVideoRef} muted playsInline className="mb-3 aspect-video w-full -scale-x-100 rounded-2xl bg-black object-cover" />
      )}

      {state === "starting" && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Hazırlanıyor…
        </p>
      )}

      {state === "recording" && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="flex items-center gap-2 font-mono text-2xl text-stone-900">
            <span className="h-3 w-3 animate-pulse rounded-full bg-rose-600" /> {mmss}
          </p>
          <p className="text-xs text-stone-500">En fazla {Math.round(limit / 60) >= 1 ? `${Math.round(limit / 60)} dakika` : `${limit} saniye`}</p>
          <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white">
            <Square className="h-4 w-4 fill-current" /> Kaydı bitir
          </button>
        </div>
      )}

      {state === "preview" && previewUrl && (
        <div className="space-y-3">
          {mode === "audio" ? (
            <audio src={previewUrl} controls className="w-full" />
          ) : (
            <video src={previewUrl} controls playsInline className="aspect-video w-full rounded-2xl bg-black" />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="flex-1 rounded-full border border-stone-300 py-2.5 text-sm font-medium text-stone-700">
              Sil
            </button>
            <button
              type="button"
              onClick={() => recording.current && onDone(recording.current)}
              className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Gönder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
