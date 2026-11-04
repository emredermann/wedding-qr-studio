"use client";

import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  extractAllFacesFromFile,
  extractSingleFaceFromSelfie,
  loadFaceModels,
} from "@/lib/faceRecognition";

/**
 * Legacy storage key constant retained only so existing browser storage can be
 * actively purged. Under GDPR/KVKK biometric rules, raw selfies and 128-d
 * descriptors are processed strictly in-memory and never written to persistent
 * disk storage.
 */
export const GUEST_FACE_EMBEDDING_STORAGE_KEY = "guest_face_embedding";

export interface FaceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmbeddingCaptured: (embedding: number[]) => void;
  accentColor?: string;
}

type ScannerState =
  | "awaiting_consent"
  | "loading_models"
  | "starting_camera"
  | "ready"
  | "scanning"
  | "matched"
  | "error";

export function FaceScannerModal({
  isOpen,
  onClose,
  onEmbeddingCaptured,
  accentColor = "#b45309",
}: FaceScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoScanTimerRef = useRef<number | null>(null);

  const [biometricConsent, setBiometricConsent] = useState<boolean>(true);
  const [state, setState] = useState<ScannerState>("loading_models");
  const [statusText, setStatusText] = useState<string>("Loading on-device neural weights…");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Purge any legacy localStorage biometric vector on mount for strict GDPR/KVKK compliance
  useEffect(() => {
    try {
      window.localStorage.removeItem(GUEST_FACE_EMBEDDING_STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (autoScanTimerRef.current !== null) {
      window.clearInterval(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const deliverInMemory = useCallback(
    (embedding: number[]) => {
      // Never write biometric vectors or selfie frames to persistent storage
      try {
        window.localStorage.removeItem(GUEST_FACE_EMBEDDING_STORAGE_KEY);
      } catch {
        // Ignore
      }
      setState("matched");
      setStatusText("Face signature verified in memory! Filtering your photos…");
      stopCamera();
      window.setTimeout(() => {
        onEmbeddingCaptured(embedding);
        onClose();
      }, 450);
    },
    [onClose, onEmbeddingCaptured, stopCamera],
  );

  const startCameraAndModels = useCallback(async () => {
    if (!biometricConsent) {
      setState("awaiting_consent");
      setStatusText("Please confirm biometric privacy consent below to begin.");
      return;
    }

    await Promise.resolve();
    setErrorMessage(null);
    setState("loading_models");
    setStatusText("Loading on-device WebGL face models…");

    try {
      await loadFaceModels();
    } catch (err) {
      setState("error");
      setErrorMessage(
        err instanceof Error
          ? `Could not load face recognition models: ${err.message}`
          : "Could not load face recognition models.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setStatusText("Live camera unavailable — select a selfie from your gallery below");
      setErrorMessage(
        "Live camera access is not available in this browser context. Choose a clear selfie from your phone gallery below.",
      );
      return;
    }

    setState("starting_camera");
    setStatusText("Opening front camera…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setState("ready");
      setStatusText("Center your face inside the illuminated ring");
    } catch (err) {
      setState("error");
      setStatusText("Camera permission denied — use gallery selfie fallback below");
      setErrorMessage(
        err instanceof Error
          ? `Live camera permission was denied (${err.message}). Select a clear selfie from your phone gallery below instead.`
          : "Camera permission denied. Please choose a clear selfie photo from your phone gallery below.",
      );
    }
  }, [biometricConsent]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    const timer = window.setTimeout(() => {
      void startCameraAndModels();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      stopCamera();
    };
  }, [isOpen, startCameraAndModels, stopCamera]);

  const handleCaptureNow = useCallback(async () => {
    if (!biometricConsent) {
      setErrorMessage("Please confirm the biometric privacy consent checkbox first.");
      return;
    }
    const video = videoRef.current;
    if (!video || state === "scanning" || state === "matched") return;

    setState("scanning");
    setStatusText("Analyzing 68 facial landmarks in memory…");

    try {
      const descriptor = await extractSingleFaceFromSelfie(video);
      if (!descriptor) {
        setState("ready");
        setStatusText("No clear face detected yet — hold steady in even light and tap Scan.");
        return;
      }
      deliverInMemory(descriptor);
    } catch (err) {
      setState("ready");
      setStatusText(
        err instanceof Error ? err.message : "Could not read face — please try again.",
      );
    }
  }, [biometricConsent, deliverInMemory, state]);

  // Gentle auto-scan loop while camera is ready and consent is active
  useEffect(() => {
    if (!isOpen || state !== "ready" || !biometricConsent) return;
    let busy = false;

    const timer = window.setInterval(async () => {
      if (busy || !videoRef.current) return;
      busy = true;
      try {
        const descriptor = await extractSingleFaceFromSelfie(videoRef.current);
        if (descriptor) {
          deliverInMemory(descriptor);
        }
      } catch {
        // Keep waiting for a clean frame
      } finally {
        busy = false;
      }
    }, 1000);

    autoScanTimerRef.current = timer;
    return () => {
      window.clearInterval(timer);
      autoScanTimerRef.current = null;
    };
  }, [biometricConsent, deliverInMemory, isOpen, state]);

  const handleFallbackSelfieFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      if (!biometricConsent) {
        setState("awaiting_consent");
        setErrorMessage("Please check the GDPR/KVKK biometric consent box before scanning a selfie.");
        return;
      }

      setState("scanning");
      setErrorMessage(null);
      setStatusText("Extracting 128-d face descriptor on your device…");

      try {
        const embeddings = await extractAllFacesFromFile(file);
        if (embeddings.length === 0) {
          setState("error");
          setStatusText("No face detected in selected photo");
          setErrorMessage(
            "No clear face was detected in that photo. Please pick a well-lit, front-facing selfie.",
          );
          return;
        }
        deliverInMemory(embeddings[0]);
      } catch (err) {
        setState("error");
        setErrorMessage(err instanceof Error ? err.message : "Failed to process selfie image.");
      }
    },
    [biometricConsent, deliverInMemory],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="face-scanner-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-stone-800 bg-stone-950 text-stone-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <h2 id="face-scanner-title" className="text-base font-semibold tracking-tight">
              Private Biometric Photo Unlock
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-800 hover:text-white"
            aria-label="Close scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Camera Viewport with Circular Alignment Guide */}
        <div className="px-6 pt-5">
          <div className="relative mx-auto aspect-square w-60 overflow-hidden rounded-full border-4 border-amber-400/80 bg-stone-900 shadow-[0_0_50px_rgba(251,191,36,0.18)]">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full scale-x-[-1] object-cover"
            />

            {/* Circular alignment reticle */}
            <div className="pointer-events-none absolute inset-3 rounded-full border-2 border-dashed border-white/40" />

            {(state === "loading_models" ||
              state === "starting_camera" ||
              state === "scanning") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-950/80 p-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                <p className="mt-3 text-xs font-medium text-stone-200">{statusText}</p>
              </div>
            )}

            {state === "matched" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/90 p-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                <p className="mt-2 text-xs font-semibold text-emerald-100">{statusText}</p>
              </div>
            )}

            {(state === "error" || state === "awaiting_consent") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-950/92 p-5 text-center">
                <AlertCircle className="h-8 w-8 text-amber-400" />
                <p className="mt-2 text-xs leading-relaxed text-stone-200">
                  {errorMessage ?? statusText}
                </p>
              </div>
            )}
          </div>

          <p className="mt-3.5 text-center text-sm font-medium text-stone-200">{statusText}</p>

          {/* Explicit GDPR / KVKK Biometric Opt-In Consent */}
          <label className="mt-3 flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border border-stone-800 bg-stone-900/70 px-3.5 py-2.5 text-left text-[11px] leading-relaxed text-stone-300">
            <input
              type="checkbox"
              checked={biometricConsent}
              onChange={(e) => {
                const checked = e.target.checked;
                setBiometricConsent(checked);
                if (!checked) {
                  stopCamera();
                  setState("awaiting_consent");
                  setStatusText("Consent required to process facial landmarks.");
                }
              }}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-600 accent-amber-500"
            />
            <span>
              I consent to on-device biometric processing (GDPR / KVKK). My selfie never leaves my
              phone and is converted into an ephemeral 128-d mathematical vector solely to match my
              wedding photos.
            </span>
          </label>

          {/* Primary & Fallback Controls (Minimum 48px Touch Targets) */}
          <div className="mt-4 flex flex-col gap-2.5">
            {state === "ready" || state === "scanning" ? (
              <button
                type="button"
                onClick={() => void handleCaptureNow()}
                disabled={state === "scanning" || !biometricConsent}
                style={{ backgroundColor: accentColor }}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
                {state === "scanning" ? "Scanning Face…" : "Scan Live Camera Now"}
              </button>
            ) : null}

            {state === "error" || state === "awaiting_consent" ? (
              <button
                type="button"
                disabled={!biometricConsent}
                onClick={() => void startCameraAndModels()}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-stone-700 bg-stone-900 px-4 py-3 text-xs font-semibold text-stone-200 transition hover:bg-stone-800 disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Live Front Camera
              </button>
            ) : null}

            {/* Gallery Picker Fallback (NO capture="user" attribute so iOS/Android opens Photo Library when camera is denied!) */}
            <label
              className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border px-4 py-3 text-xs font-semibold transition ${
                state === "error"
                  ? "border-amber-500/70 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                  : "border-stone-800 bg-stone-900/70 text-stone-200 hover:bg-stone-800"
              }`}
            >
              <ImageIcon className="h-4 w-4 text-amber-400" />
              <span>Choose a Clear Selfie from Phone Gallery</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
                onChange={(e) => void handleFallbackSelfieFile(e)}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Footer Privacy Guarantee */}
        <div className="mt-5 border-t border-stone-800/80 bg-stone-900/60 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-[11px] leading-relaxed text-stone-400">
              100% client-side WebGL extraction · Zero raw selfie uploads · Ephemeral in-memory
              session.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
