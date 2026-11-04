"use client";

import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Film,
  Heart,
  Image as ImageIcon,
  Loader2,
  Lock,
  Mic,
  RefreshCw,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  UserCheck,
  Volume2,
  WifiOff,
  X,
} from "lucide-react";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  FaceScannerModal,
  GUEST_FACE_EMBEDDING_STORAGE_KEY,
} from "@/components/FaceScannerModal";
import { DEMO_ALBUM_ID } from "@/lib/demo-data";
import {
  computeClientDifferenceHash,
  extractAllFacesFromFile,
} from "@/lib/faceRecognition";
import {
  classifyMimeType,
  detectMimeFromMagicBytes,
  formatBytes,
   hexToBytes,
  inferMimeTypeFromFileName,
  MAX_CONCURRENT_UPLOADS,
  normaliseMimeType,
  readFileMagicBytesHex,
} from "@/lib/media-config";
import type {
  CompleteUploadResponse,
  GuestEventPayload,
  GuestFaceMatch,
  MatchFacesResponse,
  Media,
  MediaCategory,
  MediaType,
  PresignUploadResponse,
  PublicAlbum,
} from "@/types/database";
import {
  type BiometricOptInStep,
  buildThemeCssVariables,
  type ButtonStyle,
  DEFAULT_THEME_CONFIG,
  type FlowStepConfig,
  type FlowStepType,
  type GuestRegistrationStep,
  type MainHubStep,
  type ThemeFontFamily,
  type WelcomeSplashStep,
} from "@/types/flow";

const GUEST_NAME_STORAGE_KEY = "guest_display_name";
const FLOW_STATE_STORAGE_PREFIX = "wqr_flow_state_v2_";

type UploadStatus = "queued" | "uploading" | "indexing_faces" | "completed" | "error";

interface UploadQueueItem {
  id: string;
  file: File;
  mediaType: MediaType;
  previewUrl: string | null;
  progress: number;
  status: UploadStatus;
  retryCount: number;
  errorMessage?: string;
  mediaId?: string;
}

/**
 * Private-by-Default Biometric Gallery Tabs:
 *  - `find_me`: Biometric Face Gate — ONLY shows photos containing the guest's
 *    own face verified via `match_guest_faces` RPC.
 *  - `my_uploads`: Shows ONLY media uploaded by this guest's verified session.
 * Standard guests NEVER see an open public gallery of other attendees' uploads.
 */
type GalleryTab = "find_me" | "my_uploads";

interface PersistedFlowState {
  version: 2;
  albumId: string;
  completedStepTypes: FlowStepType[];
  updatedAt: string;
}

const CATEGORY_LABELS: ReadonlyArray<{ value: "all" | MediaCategory; label: string }> = [
  { value: "all", label: "All Moments" },
  { value: "getting_ready", label: "Getting Ready" },
  { value: "ceremony", label: "Ceremony" },
  { value: "reception", label: "Reception" },
  { value: "party", label: "Party" },
  { value: "venue", label: "Venue" },
  { value: "general", label: "Candid" },
];

function getButtonRadiusClass(style: ButtonStyle): string {
  switch (style) {
    case "pill":
      return "rounded-full";
    case "sharp":
      return "rounded-none";
    case "rounded":
    default:
      return "rounded-2xl";
  }
}

function getFontFamilyClass(font: ThemeFontFamily): string {
  switch (font) {
    case "serif":
      return "font-serif";
    case "mono":
      return "font-mono";
    case "display":
      return "font-serif tracking-wide";
    case "sans":
    default:
      return "font-sans";
  }
}

function readValidatedFlowState(albumId: string): Set<FlowStepType> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(`${FLOW_STATE_STORAGE_PREFIX}${albumId}`);
    if (!raw) {
      // Check legacy boolean key
      if (window.localStorage.getItem(`completed_flow_${albumId}`) === "true") {
        return new Set<FlowStepType>([
          "welcome_splash",
          "guest_registration",
          "biometric_opt_in",
        ]);
      }
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      parsed.version === 2 &&
      "albumId" in parsed &&
      parsed.albumId === albumId &&
      "completedStepTypes" in parsed &&
      Array.isArray(parsed.completedStepTypes)
    ) {
      const valid = parsed.completedStepTypes.filter(
        (t): t is FlowStepType =>
          t === "welcome_splash" ||
          t === "guest_registration" ||
          t === "biometric_opt_in" ||
          t === "main_hub",
      );
      return new Set(valid);
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function writeValidatedFlowState(albumId: string, completed: Set<FlowStepType>): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedFlowState = {
      version: 2,
      albumId,
      completedStepTypes: Array.from(completed),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(`${FLOW_STATE_STORAGE_PREFIX}${albumId}`, JSON.stringify(payload));
    window.localStorage.setItem(`completed_flow_${albumId}`, "true");
  } catch {
    // Ignore storage quota errors in private mode
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatCountdown(targetIso: string, nowMs: number): string {
  const diff = Math.max(0, Date.parse(targetIso) - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}h ${minutes
    .toString()
    .padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
}

/**
 * Uploads a `File` or `Blob` directly to Cloudflare R2 using `XMLHttpRequest`
 * so we receive granular byte-level upload progress without proxying through Next.js.
 */
function putFileToR2WithProgress(
  uploadUrl: string,
  file: Blob,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Cloudflare R2 upload failed with status ${xhr.status}.`));
      }
    };

    xhr.onerror = () =>
      reject(new Error("Network reception interrupted while uploading. Tap Retry when back online."));
    xhr.onabort = () => reject(new Error("Upload was cancelled."));
    xhr.send(file);
  });
}

export default function GuestEventPage() {
  const defaultThemeVars = buildThemeCssVariables(DEFAULT_THEME_CONFIG) as React.CSSProperties;
  return (
    <Suspense
      fallback={
        <div
          style={defaultThemeVars}
          className="wqr-ambient-surface flex min-h-screen flex-col items-center justify-center p-6"
        >
          <Loader2 className="h-9 w-9 animate-spin text-amber-700" />
          <p className="mt-4 font-serif text-lg">Opening Private Wedding Experience…</p>
        </div>
      }
    >
      <GuestEventPageContent />
    </Suspense>
  );
}

function GuestEventPageContent() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [album, setAlbum] = useState<PublicAlbum | null>(null);
  const [isGalleryLocked, setIsGalleryLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<"private" | "disposable_camera" | null>(null);
  const [myUploads, setMyUploads] = useState<Media[]>([]);
  const [guestSessionId, setGuestSessionId] = useState<string>("");

  // Network connectivity state for weak venue reception resilience
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.navigator.onLine : true,
  );

  const [guestName, setGuestName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(GUEST_NAME_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [guestContact, setGuestContact] = useState<string>("");
  const [contactConsent, setContactConsent] = useState<boolean>(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [guestTable, setGuestTable] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return new URLSearchParams(window.location.search).get("table")?.trim() ?? "";
    } catch {
      return "";
    }
  });
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  // Private-by-default gallery tabs (NO public "All Media" tab!)
  const [activeTab, setActiveTab] = useState<GalleryTab>("find_me");
  const [selectedCategory, setSelectedCategory] = useState<"all" | MediaCategory>("all");
  const [selectedUploadCategory, setSelectedUploadCategory] = useState<MediaCategory>("general");
  const [lightboxMedia, setLightboxMedia] = useState<Media | null>(null);

  // Biometric face matching — strictly ephemeral in-memory state (never persisted to localStorage)
  const [isFaceScannerOpen, setIsFaceScannerOpen] = useState<boolean>(false);
  const [faceEmbedding, setFaceEmbedding] = useState<number[] | null>(null);
  const [faceMatches, setFaceMatches] = useState<GuestFaceMatch[]>([]);
  const [isMatchingFaces, setIsMatchingFaces] = useState<boolean>(false);
  const [faceMatchError, setFaceMatchError] = useState<string | null>(null);

  // Concurrency-bounded Upload Queue (max 3 simultaneous PUT requests)
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const queueRef = useRef<UploadQueueItem[]>([]);
  const activeWorkersRef = useRef<number>(0);
  const demoBlobUrlsRef = useRef<Set<string>>(new Set());

  // Voice Toasts (MediaRecorder API)
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isUploadingVoice, setIsUploadingVoice] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Purge any legacy localStorage biometric vector on mount
  useEffect(() => {
    try {
      window.localStorage.removeItem(GUEST_FACE_EMBEDDING_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  // Revoke all temporary ObjectURLs on unmount to prevent mobile Safari/Chrome memory leaks
  useEffect(() => {
    const demoUrls = demoBlobUrlsRef.current;
    return () => {
      for (const item of queueRef.current) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
      for (const url of demoUrls) {
        URL.revokeObjectURL(url);
      }
      demoUrls.clear();
    };
  }, []);

  // Live clock for Disposable Camera reveal countdown
  const [nowMs, setNowMs] = useState<number>(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const fetchEventData = useCallback(async () => {
    if (!slug) return;
    await Promise.resolve();
    setNowMs(Date.now());
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(slug)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json()) as GuestEventPayload | { error?: { message?: string } };
      if (!res.ok || !("album" in data)) {
        throw new Error(
          ("error" in data && data.error?.message) || "Could not load wedding event.",
        );
      }

      setAlbum(data.album);
      setIsGalleryLocked(data.isGalleryLocked);
      setLockReason(data.lockReason);
      setMyUploads(data.myUploads);
      setGuestSessionId(data.guestSessionId);

      // Default to "my_uploads" if face recognition is disabled or gallery is locked
      if (!data.album.flow_config.features.enableFaceRecognition || data.isGalleryLocked) {
        setActiveTab("my_uploads");
      }

      // Dynamic Flow State Machine: determine first uncompleted onboarding step
      const enabledSteps = data.album.flow_config.steps.filter((s) => s.enabled);
      const completedTypes = readValidatedFlowState(data.album.id);

      const firstIncompleteIdx = enabledSteps.findIndex(
        (step) => step.type !== "main_hub" && !completedTypes.has(step.type),
      );
      const mainHubIdx = Math.max(
        0,
        enabledSteps.findIndex((s) => s.type === "main_hub"),
      );

      setActiveStepIndex(firstIncompleteIdx === -1 ? mainHubIdx : firstIncompleteIdx);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load event.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchEventData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchEventData]);

  const enabledSteps = useMemo<FlowStepConfig[]>(() => {
    if (!album) return [];
    const list = album.flow_config.steps.filter((s) => s.enabled);
    return list.length > 0 ? list : album.flow_config.steps;
  }, [album]);

  const currentStep =
    enabledSteps[activeStepIndex] ?? enabledSteps[enabledSteps.length - 1] ?? null;

  const advanceOnboardingStep = useCallback(() => {
    if (!album) return;
    const completed = readValidatedFlowState(album.id);
    if (currentStep) {
      completed.add(currentStep.type);
    }
    const nextIdx = activeStepIndex + 1;
    const targetStep = enabledSteps[nextIdx];
    if (!targetStep || targetStep.type === "main_hub") {
      for (const step of enabledSteps) {
        if (step.type !== "main_hub") completed.add(step.type);
      }
    }
    writeValidatedFlowState(album.id, completed);
    setActiveStepIndex(Math.min(enabledSteps.length - 1, nextIdx));
  }, [activeStepIndex, album, currentStep, enabledSteps]);

  // Execute `match_guest_faces` RPC whenever a guest's 128-d face descriptor is captured
  const runFaceSearch = useCallback(
    async (embeddingToMatch: number[], targetAlbumId: string) => {
      await Promise.resolve();
      setIsMatchingFaces(true);
      setFaceMatchError(null);
      try {
        const res = await fetch("/api/faces/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            albumId: targetAlbumId,
            embedding: embeddingToMatch,
            threshold: 0.82,
          }),
        });
        const data = (await res.json()) as MatchFacesResponse | { error?: { message?: string } };
        if (!res.ok || !("matches" in data)) {
          throw new Error(
            ("error" in data && data.error?.message) || "Could not match faces in this gallery.",
          );
        }
        setFaceMatches(data.matches);
      } catch (err) {
        setFaceMatchError(err instanceof Error ? err.message : "Face search failed.");
      } finally {
        setIsMatchingFaces(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!album || !faceEmbedding || isGalleryLocked) return;
    const timer = window.setTimeout(() => {
      void runFaceSearch(faceEmbedding, album.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [album, faceEmbedding, isGalleryLocked, runFaceSearch]);

  // Background face indexing after photo upload completes
  const indexPhotoFacesInBackground = useCallback(
    async (file: File, uploadedMedia: Media, currentAlbumId: string) => {
      try {
        const embeddings = await extractAllFacesFromFile(file);
        if (embeddings.length > 0) {
          await fetch("/api/faces/index", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              albumId: currentAlbumId,
              mediaId: uploadedMedia.id,
              embeddings,
            }),
          });
          // If the guest already scanned their selfie, re-run face match so their newly uploaded selfie/group photo appears!
          if (faceEmbedding) {
            void runFaceSearch(faceEmbedding, currentAlbumId);
          }
        }
      } catch (err) {
        console.warn("[background-face-indexing] non-fatal warning:", err);
      }
    },
    [faceEmbedding, runFaceSearch],
  );

  const updateQueueItem = useCallback((id: string, patch: Partial<UploadQueueItem>) => {
    queueRef.current = queueRef.current.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    setUploadQueue([...queueRef.current]);
  }, []);

  const revokeQueueItemPreview = useCallback((id: string) => {
    const target = queueRef.current.find((i) => i.id === id);
    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
      updateQueueItem(id, { previewUrl: null });
    }
  }, [updateQueueItem]);

  const processSingleUpload = useCallback(
    async (item: UploadQueueItem) => {
      if (!album) return;

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        updateQueueItem(item.id, {
          status: "error",
          errorMessage: "Waiting for venue Wi-Fi / mobile signal… Tap Retry when online.",
        });
        return;
      }

      updateQueueItem(item.id, { status: "uploading", progress: 4, errorMessage: undefined });

      const reportedMime = normaliseMimeType(item.file.type);
      const inferredMime =
        reportedMime && reportedMime !== "application/octet-stream"
          ? reportedMime
          : inferMimeTypeFromFileName(item.file.name);

      try {
        // 1. Client-side magic-byte inspection before spending mobile upload bandwidth
        const magicBytesHex = await readFileMagicBytesHex(item.file, 32);
        const rawBytes = hexToBytes(magicBytesHex);
        const detectedMagic = rawBytes ? detectMimeFromMagicBytes(rawBytes, inferredMime) : null;
        if (!detectedMagic) {
          throw new Error(
            "Unsupported file signature. Please upload standard photos (JPEG/PNG/HEIC/WebP), videos (MP4/MOV/WebM), or voice toasts.",
          );
        }

        const effectiveMime = detectedMagic.mimeType;
        const mediaType = detectedMagic.mediaType;

        // Demo mode simulation for `/e/demo-wedding`
        if (album.id === DEMO_ALBUM_ID) {
          await new Promise((r) => window.setTimeout(r, 400));
          updateQueueItem(item.id, { progress: 65 });
          const clientPhash =
            mediaType === "photo" ? await computeClientDifferenceHash(item.file) : null;
          const demoUrl = URL.createObjectURL(item.file);
          demoBlobUrlsRef.current.add(demoUrl);

          const demoItem: Media = {
            id: crypto.randomUUID(),
            album_id: album.id,
            file_key: `albums/${album.id}/${crypto.randomUUID()}.jpg`,
            file_url: demoUrl,
            media_type: mediaType,
            mime_type: effectiveMime,
            size_bytes: item.file.size,
            guest_name: guestName || "Wedding Guest",
            guest_session_id: guestSessionId || "demo-session",
            category: selectedUploadCategory,
            phash: clientPhash,
            is_hidden: album.flow_config.features.requireModerationBeforePublic,
            created_at: new Date().toISOString(),
          };
          if (mediaType === "photo" && album.flow_config.features.enableFaceRecognition) {
            updateQueueItem(item.id, { status: "indexing_faces", progress: 92 });
            try {
              await extractAllFacesFromFile(item.file);
            } catch {
              // Ignore in demo
            }
          }
          revokeQueueItemPreview(item.id);
          updateQueueItem(item.id, { status: "completed", progress: 100, mediaId: demoItem.id });
          setMyUploads((prev) => [demoItem, ...prev]);
          return;
        }

        // 2. Request Presigned R2 PUT URL (< 300s TTL, magic-byte & tier validated)
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            albumId: album.id,
            fileName: item.file.name,
            fileType: effectiveMime,
            fileSize: item.file.size,
            magicBytesHex,
          }),
        });

        const presignData = (await presignRes.json()) as
          | PresignUploadResponse
          | { error?: { message?: string } };
        if (!presignRes.ok || !("uploadUrl" in presignData)) {
          throw new Error(
            ("error" in presignData && presignData.error?.message) ||
              "Could not obtain upload URL.",
          );
        }

        // 3. Compute client-side 64-bit dHash for photos (revokes its own ObjectURL in finally)
        const clientPhash =
          presignData.mediaType === "photo"
            ? await computeClientDifferenceHash(item.file)
            : null;

        // 4. Direct PUT from browser to Cloudflare R2 (Zero-Proxy Upload)
        await putFileToR2WithProgress(
          presignData.uploadUrl,
          item.file,
          presignData.headers["Content-Type"],
          (pct) => {
            updateQueueItem(item.id, { progress: Math.max(8, Math.round(pct * 0.86)) });
          },
        );

        // 5. Register uploaded object in Supabase (verifies R2 HEAD + R2 magic bytes)
        const completeRes = await fetch("/api/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            albumId: album.id,
            fileKey: presignData.fileKey,
            guestName: guestName.trim() || null,
            guestSessionId: guestSessionId || null,
            category: selectedUploadCategory,
            phash: clientPhash,
          }),
        });

        const completeData = (await completeRes.json()) as
          | CompleteUploadResponse
          | { error?: { message?: string } };
        if (!completeRes.ok || !("media" in completeData)) {
          throw new Error(
            ("error" in completeData && completeData.error?.message) ||
              "Could not verify uploaded file.",
          );
        }

        const createdMedia = completeData.media;
        if (createdMedia.guest_session_id && !guestSessionId) {
          setGuestSessionId(createdMedia.guest_session_id);
        }

        // Release the temporary local preview ObjectURL now that the cloud URL is ready
        revokeQueueItemPreview(item.id);
        updateQueueItem(item.id, {
          status: "completed",
          progress: 100,
          mediaId: createdMedia.id,
        });

        setMyUploads((prev) => [createdMedia, ...prev]);

        // 6. Asynchronous background WebGL face extraction (never blocks upload workers!)
        if (
          createdMedia.media_type === "photo" &&
          album.flow_config.features.enableFaceRecognition
        ) {
          void indexPhotoFacesInBackground(item.file, createdMedia, album.id);
        }
      } catch (err) {
        updateQueueItem(item.id, {
          status: "error",
          retryCount: item.retryCount + 1,
          errorMessage: err instanceof Error ? err.message : "Upload failed.",
        });
      }
    },
    [
      album,
      guestName,
      guestSessionId,
      indexPhotoFacesInBackground,
      revokeQueueItemPreview,
      selectedUploadCategory,
      updateQueueItem,
    ],
  );

  // Concurrency queue pump: maintains at most MAX_CONCURRENT_UPLOADS (3) active workers
  const pumpUploadQueue = useCallback(() => {
    const runWorker = async () => {
      while (true) {
        const nextItem = queueRef.current.find((item) => item.status === "queued");
        if (!nextItem) break;
        updateQueueItem(nextItem.id, { status: "uploading", progress: 2 });
        await processSingleUpload(nextItem);
      }
    };

    while (activeWorkersRef.current < MAX_CONCURRENT_UPLOADS) {
      const hasQueued = queueRef.current.some((item) => item.status === "queued");
      if (!hasQueued) break;
      activeWorkersRef.current += 1;
      void runWorker().finally(() => {
        activeWorkersRef.current -= 1;
      });
    }
  }, [processSingleUpload, updateQueueItem]);

  // Listen for online/offline events so venue reception drops auto-recover
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      pumpUploadQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [pumpUploadQueue]);

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      const newItems: UploadQueueItem[] = fileArray.map((file) => {
        const reported = normaliseMimeType(file.type) ?? inferMimeTypeFromFileName(file.name);
        const mediaType = (reported ? classifyMimeType(reported) : null) ?? "photo";
        const previewUrl = mediaType === "photo" ? URL.createObjectURL(file) : null;
        return {
          id: crypto.randomUUID(),
          file,
          mediaType,
          previewUrl,
          progress: 0,
          status: "queued",
          retryCount: 0,
        };
      });

      queueRef.current = [...queueRef.current, ...newItems];
      setUploadQueue([...queueRef.current]);
      pumpUploadQueue();
    },
    [pumpUploadQueue],
  );

  const handleRetryQueueItem = useCallback(
    (id: string) => {
      updateQueueItem(id, { status: "queued", progress: 0, errorMessage: undefined });
      pumpUploadQueue();
    },
    [pumpUploadQueue, updateQueueItem],
  );

  const handleRetryAllFailed = useCallback(() => {
    queueRef.current = queueRef.current.map((item) =>
      item.status === "error"
        ? { ...item, status: "queued", progress: 0, errorMessage: undefined }
        : item,
    );
    setUploadQueue([...queueRef.current]);
    pumpUploadQueue();
  }, [pumpUploadQueue]);

  const clearCompletedQueueItems = useCallback(() => {
    for (const item of queueRef.current) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
    queueRef.current = [];
    setUploadQueue([]);
  }, []);

  // Overall progress bar percentage across active/completed items in batch
  const overallUploadProgress = useMemo(() => {
    if (uploadQueue.length === 0) return 0;
    const sum = uploadQueue.reduce((acc, item) => acc + item.progress, 0);
    return Math.round(sum / uploadQueue.length);
  }, [uploadQueue]);

  const activeUploadCount = useMemo(
    () =>
      uploadQueue.filter(
        (item) =>
          item.status === "queued" ||
          item.status === "uploading" ||
          item.status === "indexing_faces",
      ).length,
    [uploadQueue],
  );

  const failedUploadCount = useMemo(
    () => uploadQueue.filter((item) => item.status === "error").length,
    [uploadQueue],
  );

  // Guest registration form handler (Step 2 of dynamic flow)
  const handleGuestRegistrationSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!album) return;
      setRegistrationError(null);

      const trimmedContact = guestContact.trim();
      if (trimmedContact && !contactConsent) {
        setRegistrationError(
          "Please check the GDPR / KVKK consent box to save your contact information, or leave the contact field blank.",
        );
        return;
      }

      setIsRegistering(true);
      try {
        if (guestName.trim()) {
          window.localStorage.setItem(GUEST_NAME_STORAGE_KEY, guestName.trim());
        }
        const res = await fetch(`/api/events/${encodeURIComponent(album.slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            guestSessionId: guestSessionId || undefined,
            guestName: guestName.trim() || null,
            contact: trimmedContact || null,
            tableNumber: guestTable.trim() || null,
            contactConsent: trimmedContact ? contactConsent : undefined,
          }),
        });
        if (!res.ok) {
          const errData = (await res.json()) as { error?: { message?: string } };
          throw new Error(errData.error?.message || "Could not save guest registration.");
        }
        advanceOnboardingStep();
      } catch (err) {
        setRegistrationError(
          err instanceof Error ? err.message : "Could not save registration.",
        );
      } finally {
        setIsRegistering(false);
      }
    },
    [
      advanceOnboardingStep,
      album,
      contactConsent,
      guestContact,
      guestName,
      guestSessionId,
      guestTable,
    ],
  );

  // Delete guest's own upload (verified by HttpOnly session cookie on server)
  const handleDeleteOwnUpload = useCallback(
    async (mediaId: string) => {
      if (!album) return;
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(album.slug)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ mediaId, guestSessionId: guestSessionId || undefined }),
        });
        if (res.ok) {
          setMyUploads((prev) => {
            const removed = prev.find((m) => m.id === mediaId);
            if (removed && demoBlobUrlsRef.current.has(removed.file_url)) {
              URL.revokeObjectURL(removed.file_url);
              demoBlobUrlsRef.current.delete(removed.file_url);
            }
            return prev.filter((m) => m.id !== mediaId);
          });
          setFaceMatches((prev) => prev.filter((m) => m.media_id !== mediaId));
          if (lightboxMedia?.id === mediaId) setLightboxMedia(null);
        }
      } catch (err) {
        console.error("Failed to delete upload:", err);
      }
    },
    [album, guestSessionId, lightboxMedia],
  );

  // Voice Toast Recorder (MediaRecorder API)
  const cleanupRecordedVoicePreview = useCallback(() => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
    }
    setRecordedAudioBlob(null);
    setRecordingSeconds(0);
  }, [recordedAudioUrl]);

  const stopVoiceRecording = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVoice(false);
  }, []);

  const startVoiceRecording = useCallback(async () => {
    setVoiceError(null);
    cleanupRecordedVoicePreview();

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        const baseType = preferredMime.includes("mp4") ? "audio/mp4" : "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: baseType });
        const previewUrl = URL.createObjectURL(blob);
        setRecordedAudioBlob(blob);
        setRecordedAudioUrl(previewUrl);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 179) {
            stopVoiceRecording();
            return 180;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setVoiceError(
        err instanceof Error
          ? `Microphone permission denied (${err.message}).`
          : "Could not access microphone.",
      );
    }
  }, [cleanupRecordedVoicePreview, stopVoiceRecording]);

  const handleUploadVoiceToast = useCallback(async () => {
    if (!recordedAudioBlob || !album) return;
    setIsUploadingVoice(true);
    setVoiceError(null);

    try {
      const ext = recordedAudioBlob.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([recordedAudioBlob], `voice-toast-${Date.now()}.${ext}`, {
        type: recordedAudioBlob.type || "audio/webm",
      });
      enqueueFiles([file]);
      cleanupRecordedVoicePreview();
      setIsVoiceModalOpen(false);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "Failed to queue voice toast.");
    } finally {
      setIsUploadingVoice(false);
    }
  }, [album, cleanupRecordedVoicePreview, enqueueFiles, recordedAudioBlob]);

  // Displayed media list: strictly either `myUploads` OR biometric `faceMatches` (never a public feed!)
  const displayedMedia = useMemo<Media[]>(() => {
    let source: Media[] = [];
    if (activeTab === "my_uploads") {
      source = myUploads;
    } else {
      source = faceMatches.map((match) => ({
        id: match.media_id,
        album_id: album?.id ?? "",
        file_key: match.file_key,
        file_url: match.file_url,
        media_type: match.media_type,
        mime_type: "image/jpeg",
        size_bytes: 0,
        guest_name: null,
        guest_session_id: null,
        category: match.category,
        phash: null,
        is_hidden: false,
        created_at: match.created_at,
      }));
    }

    if (selectedCategory === "all") return source;
    return source.filter((item) => item.category === selectedCategory);
  }, [activeTab, album?.id, faceMatches, myUploads, selectedCategory]);

  if (loading) {
    const fallbackVars = buildThemeCssVariables(DEFAULT_THEME_CONFIG) as React.CSSProperties;
    return (
      <div
        style={fallbackVars}
        className="wqr-ambient-surface flex min-h-screen flex-col items-center justify-center p-6"
      >
        <Loader2 className="h-9 w-9 animate-spin text-amber-700" />
        <p className="mt-4 font-serif text-lg">Opening Private Wedding Experience…</p>
      </div>
    );
  }

  if (loadError || !album) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 p-6 text-center text-stone-800">
        <AlertCircle className="h-12 w-12 text-rose-500" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">Event Unavailable</h1>
        <p className="mt-2 max-w-md text-sm text-stone-600">
          {loadError ?? "We couldn't find this wedding event."}
        </p>
      </div>
    );
  }

  const theme = album.theme_config;
  const features = album.flow_config.features;
  const btnRadius = getButtonRadiusClass(theme.buttonStyle);
  const fontClass = getFontFamilyClass(theme.fontFamily);
  const themeStyle = buildThemeCssVariables(theme) as React.CSSProperties;

  // ===========================================================================
  // Dynamic Onboarding Flow Steps (welcome_splash -> guest_registration -> biometric_opt_in)
  // ===========================================================================
  if (currentStep && currentStep.type !== "main_hub") {
    return (
      <div
        style={themeStyle}
        className={`wqr-ambient-surface flex min-h-screen flex-col justify-between px-6 py-10 ${fontClass}`}
      >
        {/* Top bar with progress indicators */}
        <header className="mx-auto flex w-full max-w-md items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-widest opacity-70">
            {album.title}
          </span>
          <div className="flex items-center gap-1.5" aria-label="Onboarding progress">
            {enabledSteps.map((s, idx) => (
              <span
                key={s.id}
                style={{
                  backgroundColor:
                    idx <= activeStepIndex ? theme.primaryColor : "rgba(120,113,108,0.25)",
                }}
                className="h-1.5 w-6 rounded-full transition-all duration-300"
              />
            ))}
          </div>
        </header>

        {/* Step 1: Welcome Splash */}
        {currentStep.type === "welcome_splash" ? (
          <main
            key="step-welcome"
            className="wqr-step-enter mx-auto my-auto flex w-full max-w-md flex-col items-center text-center"
          >
            {theme.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={theme.logoUrl}
                alt={album.title}
                className="mb-6 h-16 w-auto object-contain"
              />
            ) : null}

            {theme.coverMediaUrl ? (
              <div className="mb-8 aspect-[4/5] w-full overflow-hidden rounded-3xl shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={theme.coverMediaUrl}
                  alt={album.title}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div
                style={{ borderColor: `${theme.primaryColor}33` }}
                className="mb-8 flex h-24 w-24 items-center justify-center rounded-full border-2 bg-white/50 shadow-inner backdrop-blur-xs"
              >
                <Heart style={{ color: theme.primaryColor }} className="h-10 w-10" />
              </div>
            )}

            <p className="text-xs uppercase tracking-[0.25em] opacity-65">
              {(currentStep as WelcomeSplashStep).settings.showEventDate && album.event_date
                ? new Date(album.event_date).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Wedding Celebration"}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {(currentStep as WelcomeSplashStep).settings.headline || album.title}
            </h1>
            <p className="mt-4 text-sm leading-relaxed opacity-80">
              {(currentStep as WelcomeSplashStep).settings.subtitle}
            </p>

            <button
              type="button"
              onClick={advanceOnboardingStep}
              style={{ backgroundColor: theme.primaryColor }}
              className={`mt-8 flex min-h-12 w-full items-center justify-center px-8 py-4 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 ${btnRadius}`}
            >
              {(currentStep as WelcomeSplashStep).settings.ctaText}
            </button>
          </main>
        ) : null}

        {/* Step 2: Guest Registration */}
        {currentStep.type === "guest_registration" ? (
          <main key="step-register" className="wqr-step-enter mx-auto my-auto w-full max-w-md">
            <div className="rounded-3xl border border-stone-200/70 bg-white/85 p-7 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <UserCheck style={{ color: theme.primaryColor }} className="h-5 w-5" />
                <h1 className="text-xl font-semibold text-stone-900">
                  {(currentStep as GuestRegistrationStep).settings.title}
                </h1>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-stone-600">
                {(currentStep as GuestRegistrationStep).settings.subtitle}
              </p>

              <form
                onSubmit={(e) => void handleGuestRegistrationSubmit(e)}
                className="mt-6 space-y-4 text-stone-900"
              >
                {(currentStep as GuestRegistrationStep).settings.askName ? (
                  <div>
                    <label className="block text-xs font-medium text-stone-700">Your Name</label>
                    <input
                      type="text"
                      required={(currentStep as GuestRegistrationStep).settings.mandatory}
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="e.g. Elena Rossi"
                      className="mt-1.5 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2"
                    />
                  </div>
                ) : null}

                {(currentStep as GuestRegistrationStep).settings.askContact ? (
                  <div>
                    <label className="block text-xs font-medium text-stone-700">
                      {(currentStep as GuestRegistrationStep).settings.contactLabel}
                    </label>
                    <input
                      type="text"
                      required={(currentStep as GuestRegistrationStep).settings.mandatory}
                      value={guestContact}
                      onChange={(e) => setGuestContact(e.target.value)}
                      placeholder="+1 555 234 5678 or you@email.com"
                      className="mt-1.5 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2"
                    />
                    {guestContact.trim().length > 0 ? (
                      <label className="mt-2.5 flex min-h-12 cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-600">
                        <input
                          type="checkbox"
                          checked={contactConsent}
                          onChange={(e) => setContactConsent(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-400 accent-amber-700"
                        />
                        <span>
                          I consent under GDPR / KVKK to share my contact details with the couple
                          solely to receive updates about this wedding album.
                        </span>
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {(currentStep as GuestRegistrationStep).settings.askTableNumber ? (
                  <div>
                    <label className="block text-xs font-medium text-stone-700">
                      Table Number (Optional)
                    </label>
                    <input
                      type="text"
                      value={guestTable}
                      onChange={(e) => setGuestTable(e.target.value)}
                      placeholder="Table 7"
                      className="mt-1.5 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2"
                    />
                  </div>
                ) : null}

                {registrationError ? (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {registrationError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={isRegistering}
                  style={{ backgroundColor: theme.primaryColor }}
                  className={`mt-2 flex min-h-12 w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-50 ${btnRadius}`}
                >
                  {isRegistering ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {(currentStep as GuestRegistrationStep).settings.submitText}
                </button>

                {!(currentStep as GuestRegistrationStep).settings.mandatory ? (
                  <button
                    type="button"
                    onClick={advanceOnboardingStep}
                    className="flex min-h-12 w-full items-center justify-center py-2 text-center text-xs font-medium text-stone-600 hover:text-stone-900"
                  >
                    {(currentStep as GuestRegistrationStep).settings.skipText}
                  </button>
                ) : null}
              </form>
            </div>
          </main>
        ) : null}

        {/* Step 3: Biometric Opt-In */}
        {currentStep.type === "biometric_opt_in" ? (
          <main
            key="step-biometric"
            className="wqr-step-enter mx-auto my-auto w-full max-w-md text-center"
          >
            <div className="rounded-3xl border border-stone-200/70 bg-white/90 p-8 text-stone-900 shadow-xl backdrop-blur-md">
              <div
                style={{ backgroundColor: `${theme.primaryColor}18` }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              >
                <ScanFace style={{ color: theme.primaryColor }} className="h-8 w-8" />
              </div>
              <h1 className="mt-5 text-2xl font-semibold">
                {(currentStep as BiometricOptInStep).settings.title}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">
                {(currentStep as BiometricOptInStep).settings.subtitle}
              </p>

              <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-stone-100/90 p-3.5 text-left text-[11px] leading-relaxed text-stone-600">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  Private-by-Default Biometric Gallery: Standard guests never see an open feed of
                  other attendees&apos; photos. Your selfie is processed strictly on your device to
                  unlock only the photos you appear in.
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsFaceScannerOpen(true)}
                style={{ backgroundColor: theme.primaryColor }}
                className={`mt-6 flex min-h-12 w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 ${btnRadius}`}
              >
                <Camera className="h-4 w-4" />
                {(currentStep as BiometricOptInStep).settings.ctaScanText}
              </button>

              <button
                type="button"
                onClick={advanceOnboardingStep}
                className="mt-2 flex min-h-12 w-full items-center justify-center py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                {(currentStep as BiometricOptInStep).settings.skipText}
              </button>
            </div>

            <FaceScannerModal
              isOpen={isFaceScannerOpen}
              onClose={() => setIsFaceScannerOpen(false)}
              accentColor={theme.primaryColor}
              onEmbeddingCaptured={(emb) => {
                setFaceEmbedding(emb);
                setActiveTab("find_me");
                advanceOnboardingStep();
              }}
            />
          </main>
        ) : null}

        <footer className="mx-auto text-center text-[11px] opacity-55">
          Powered by Wedding QR Studio · Private Biometric Sharing
        </footer>
      </div>
    );
  }

  // ===========================================================================
  // Step 4: Main Hub (Upload Controls, Queue, Biometric Face Gate & My Uploads)
  // ===========================================================================
  const mainHubStep = enabledSteps.find((s): s is MainHubStep => s.type === "main_hub");
  const acceptMimeList = [
    features.enablePhotoUpload
      ? "image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/gif"
      : null,
    features.enableVideoUpload ? "video/mp4,video/quicktime,video/webm,video/3gpp" : null,
  ]
    .filter(Boolean)
    .join(",");

  return (
    <div style={themeStyle} className={`wqr-ambient-surface min-h-screen pb-24 ${fontClass}`}>
      {/* Offline Reception Banner */}
      {!isOnline ? (
        <div className="bg-amber-900 px-4 py-2.5 text-center text-xs font-medium text-amber-50">
          <span className="inline-flex items-center gap-2">
            <WifiOff className="h-4 w-4" />
            Weak venue reception detected — queued uploads will automatically resume as soon as your
            connection returns.
          </span>
        </div>
      ) : null}

      {/* Hero Header */}
      <header className="border-b border-stone-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-65">
              {album.event_date
                ? new Date(album.event_date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Private Wedding Vault"}
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">
              {album.title}
            </h1>
            {mainHubStep?.settings.welcomeBanner ? (
              <p className="mt-1 text-xs opacity-75">{mainHubStep.settings.welcomeBanner}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {enabledSteps.length > 1 ? (
              <button
                type="button"
                onClick={() => setActiveStepIndex(0)}
                className={`flex min-h-12 items-center gap-1.5 border border-stone-300/80 bg-white/95 px-4 py-2.5 text-xs font-medium text-stone-700 shadow-2xs transition hover:bg-stone-100 ${btnRadius}`}
                title="Replay Welcome & Sign-In Flow"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Guest Sign-In</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        {/* Upload Action Card */}
        <section className="rounded-3xl border border-stone-200/80 bg-white/90 p-5 text-stone-900 shadow-sm backdrop-blur-md sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={guestName}
                onChange={(e) => {
                  setGuestName(e.target.value);
                  try {
                    window.localStorage.setItem(GUEST_NAME_STORAGE_KEY, e.target.value);
                  } catch {
                    // Ignore
                  }
                }}
                placeholder="Your name (for the couple)"
                className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-2 sm:w-52"
              />

              <select
                value={selectedUploadCategory}
                onChange={(e) => setSelectedUploadCategory(e.target.value as MediaCategory)}
                aria-label="Moment category"
                className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-2 sm:w-auto"
              >
                <option value="general">Moment: Auto / Candid</option>
                <option value="getting_ready">Moment: Getting Ready</option>
                <option value="ceremony">Moment: Ceremony</option>
                <option value="reception">Moment: Reception</option>
                <option value="party">Moment: Party</option>
                <option value="venue">Moment: Venue</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {features.enablePhotoUpload || features.enableVideoUpload ? (
                <label
                  style={{ backgroundColor: theme.primaryColor }}
                  className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 px-5 py-3 text-xs font-semibold text-white shadow-md transition hover:opacity-95 ${btnRadius}`}
                >
                  <Upload className="h-4 w-4" />
                  <span>{mainHubStep?.settings.uploadCtaText || "Add Photos & Videos"}</span>
                  <input
                    type="file"
                    multiple
                    accept={acceptMimeList}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        enqueueFiles(e.target.files);
                        e.target.value = "";
                      }
                    }}
                    className="hidden"
                  />
                </label>
              ) : null}

              {features.enableVoiceToasts ? (
                <button
                  type="button"
                  onClick={() => setIsVoiceModalOpen(true)}
                  className={`flex min-h-12 items-center gap-2 border border-stone-300 bg-stone-900 px-4 py-3 text-xs font-semibold text-white shadow-xs transition hover:bg-stone-800 ${btnRadius}`}
                >
                  <Mic className="h-4 w-4 text-amber-400" />
                  Leave Voice Toast
                </button>
              ) : null}

              {features.enableFaceRecognition && !isGalleryLocked ? (
                <button
                  type="button"
                  onClick={() => setIsFaceScannerOpen(true)}
                  className={`flex min-h-12 items-center gap-1.5 border border-stone-300 bg-white px-4 py-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 ${btnRadius}`}
                >
                  <ScanFace style={{ color: theme.primaryColor }} className="h-4 w-4" />
                  {faceEmbedding ? "Rescan My Face" : "Scan Face to Unlock Photos"}
                </button>
              ) : null}
            </div>
          </div>

          {/* Concurrency-Bounded Upload Queue with Instant Thumbnail Previews & Retry Controls */}
          {uploadQueue.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-stone-700">
                <span>
                  {activeUploadCount > 0
                    ? `Uploading directly to cloud (${activeUploadCount} remaining · max ${MAX_CONCURRENT_UPLOADS} parallel)…`
                    : failedUploadCount > 0
                      ? `${failedUploadCount} upload(s) paused — tap Retry below`
                      : `All ${uploadQueue.length} file(s) uploaded in full resolution`}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{overallUploadProgress}%</span>
                  {failedUploadCount > 0 ? (
                    <button
                      type="button"
                      onClick={handleRetryAllFailed}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-500"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry All Failed
                    </button>
                  ) : null}
                  {activeUploadCount === 0 ? (
                    <button
                      type="button"
                      onClick={clearCompletedQueueItems}
                      className="min-h-9 px-2 text-[11px] text-stone-500 underline hover:text-stone-800"
                    >
                      Clear Queue
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div
                  style={{
                    width: `${overallUploadProgress}%`,
                    backgroundColor: theme.primaryColor,
                  }}
                  className="h-full transition-all duration-300"
                />
              </div>

              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-xs">
                {uploadQueue.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-stone-700 shadow-2xs"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-stone-200"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
                          {item.mediaType === "video" ? (
                            <Film className="h-4 w-4" />
                          ) : item.mediaType === "audio" ? (
                            <Volume2 className="h-4 w-4" />
                          ) : (
                            <ImageIcon className="h-4 w-4" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.file.name}</p>
                        <p className="text-[11px] text-stone-400">
                          {formatBytes(item.file.size)} · {item.progress}%
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {item.status === "queued" ? (
                        <span className="text-stone-400">Queued</span>
                      ) : null}
                      {item.status === "uploading" ? (
                        <span className="flex items-center gap-1 text-amber-700">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {item.progress}%
                        </span>
                      ) : null}
                      {item.status === "indexing_faces" ? (
                        <span className="flex items-center gap-1 text-indigo-600">
                          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                          Indexing faces…
                        </span>
                      ) : null}
                      {item.status === "completed" ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Saved
                        </span>
                      ) : null}
                      {item.status === "error" ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="max-w-44 truncate text-[11px] text-rose-600"
                            title={item.errorMessage}
                          >
                            {item.errorMessage ?? "Error"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRetryQueueItem(item.id)}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-stone-300 bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-800 hover:bg-stone-200"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Retry
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* Private-by-Default Biometric Gallery Navigation Tabs */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {features.enableFaceRecognition ? (
              <button
                type="button"
                onClick={() => setActiveTab("find_me")}
                style={
                  activeTab === "find_me"
                    ? { backgroundColor: theme.primaryColor, color: "#ffffff" }
                    : undefined
                }
                className={`flex min-h-12 items-center gap-2 px-5 py-2.5 text-xs font-semibold transition ${btnRadius} ${
                  activeTab === "find_me"
                    ? "shadow-xs"
                    : "bg-white/80 text-stone-700 hover:bg-white"
                }`}
              >
                <ScanFace className="h-4 w-4" />
                <span>Photos of Me (Face Gate)</span>
                {faceEmbedding ? (
                  <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px]">
                    {faceMatches.length}
                  </span>
                ) : null}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setActiveTab("my_uploads")}
              style={
                activeTab === "my_uploads"
                  ? { backgroundColor: theme.primaryColor, color: "#ffffff" }
                  : undefined
              }
              className={`flex min-h-12 items-center gap-2 px-5 py-2.5 text-xs font-semibold transition ${btnRadius} ${
                activeTab === "my_uploads"
                  ? "shadow-xs"
                  : "bg-white/80 text-stone-700 hover:bg-white"
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>My Shared Moments ({myUploads.length})</span>
            </button>
          </div>

          {/* Moment Category Filter Pills */}
          {(activeTab === "my_uploads" || (activeTab === "find_me" && faceEmbedding)) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_LABELS.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`min-h-10 rounded-full px-3.5 py-1.5 text-[11px] font-medium transition ${
                    selectedCategory === cat.value
                      ? "bg-stone-900 text-white"
                      : "bg-white/75 text-stone-700 hover:bg-white"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Disposable Camera Countdown / Private Album State */}
        {isGalleryLocked && activeTab === "find_me" ? (
          <section className="mt-8 rounded-3xl border border-stone-200/80 bg-white/90 p-10 text-center text-stone-900 shadow-sm backdrop-blur-md">
            <div
              style={{ backgroundColor: `${theme.primaryColor}1a` }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            >
              {lockReason === "disposable_camera" ? (
                <Clock style={{ color: theme.primaryColor }} className="h-8 w-8" />
              ) : (
                <Lock style={{ color: theme.primaryColor }} className="h-8 w-8" />
              )}
            </div>

            {lockReason === "disposable_camera" && album.reveal_at ? (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Disposable Camera Mode
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Your Face-Matched Photos Develop After the Party
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
                  Keep snapping and uploading candid moments! Biometric face matching unlocks for
                  guests in:
                </p>
                <div className="mt-6 inline-block rounded-2xl border border-stone-200 bg-stone-950 px-7 py-4 font-mono text-2xl font-bold tracking-wider text-amber-400 shadow-inner">
                  {formatCountdown(album.reveal_at, nowMs)}
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                  Private Couple Vault
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Uploads Are Open — Full Vault Is Exclusive to the Couple
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
                  Every photo, video, and voice toast you share is delivered directly in full
                  resolution to the couple&apos;s private vault. You can view and manage your own
                  uploads anytime in the &ldquo;My Shared Moments&rdquo; tab.
                </p>
              </>
            )}
          </section>
        ) : null}

        {/* BIOMETRIC FACE GATE: Shown when guest is on "find_me" tab and has NOT scanned their face yet */}
        {!isGalleryLocked && activeTab === "find_me" && !faceEmbedding ? (
          <section className="mt-8 rounded-3xl border border-stone-200/80 bg-white/90 p-8 text-center text-stone-900 shadow-sm backdrop-blur-md sm:p-12">
            <div
              style={{ backgroundColor: `${theme.primaryColor}18` }}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full"
            >
              <ScanFace style={{ color: theme.primaryColor }} className="h-10 w-10" />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
              Private Biometric Gallery Gate
            </p>
            <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
              Scan a Quick Selfie to Unlock Photos of Yourself
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-stone-600">
              To protect every attendee&apos;s privacy, this wedding does not have a public feed.
              Scan your face with your front camera (or choose a selfie from your phone gallery) to
              instantly unlock every photo you appear in.
            </p>

            <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3">
              <button
                type="button"
                onClick={() => setIsFaceScannerOpen(true)}
                style={{ backgroundColor: theme.primaryColor }}
                className={`flex min-h-12 w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 ${btnRadius}`}
              >
                <Camera className="h-4 w-4" />
                Scan My Face to View My Photos
              </button>
            </div>

            <p className="mx-auto mt-4 max-w-md text-[11px] text-stone-500">
              Zero raw selfie storage · 128-d mathematical face descriptor extracted on-device via
              WebGL.
            </p>
          </section>
        ) : null}

        {/* Active Biometric Face Match Banner when `faceEmbedding` is present */}
        {!isGalleryLocked && activeTab === "find_me" && faceEmbedding ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white/90 p-4 text-xs text-stone-900 shadow-2xs">
            <div className="flex items-center gap-3">
              <ScanFace style={{ color: theme.primaryColor }} className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">
                  {isMatchingFaces
                    ? "Matching your 128-d biometric signature against event photos…"
                    : `Showing ${faceMatches.length} verified photo(s) featuring your face`}
                </p>
                {faceMatchError ? (
                  <p className="mt-0.5 text-rose-600">{faceMatchError}</p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    Filtered exclusively for your face (cosine similarity ≥ 0.82).
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFaceScannerOpen(true)}
                style={{ backgroundColor: theme.primaryColor }}
                className={`min-h-12 px-4 py-2 text-xs font-semibold text-white ${btnRadius}`}
              >
                Rescan Selfie
              </button>
              <button
                type="button"
                onClick={() => {
                  setFaceEmbedding(null);
                  setFaceMatches([]);
                }}
                className="min-h-12 px-3 py-2 text-xs font-medium text-stone-500 hover:text-stone-800"
              >
                Lock Gallery
              </button>
            </div>
          </div>
        ) : null}

        {/* Media Gallery Feed (Rendered ONLY for verified `faceMatches` or `myUploads`) */}
        {(activeTab === "my_uploads" || (!isGalleryLocked && faceEmbedding !== null)) && (
          <section className="mt-6">
            {displayedMedia.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-white/60 p-12 text-center text-stone-800">
                <ImageIcon className="mx-auto h-10 w-10 text-stone-400" />
                <p className="mt-3 text-sm font-semibold">
                  {activeTab === "find_me"
                    ? "No photos matching your face have been uploaded yet"
                    : "You haven't uploaded any moments from this device yet"}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {activeTab === "find_me"
                    ? "As guests and photographers upload photos with you in them, they will appear here automatically."
                    : "Tap 'Add Photos & Videos' or 'Leave Voice Toast' above to share your memories with the couple!"}
                </p>
              </div>
            ) : (
              <div
                className={
                  theme.galleryLayout === "masonry"
                    ? "columns-2 gap-4 space-y-4 sm:columns-3"
                    : theme.galleryLayout === "carousel"
                      ? "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4"
                      : "grid grid-cols-2 gap-4 sm:grid-cols-3"
                }
              >
                {displayedMedia.map((item) => {
                  const isMine = activeTab === "my_uploads";
                  return (
                    <article
                      key={item.id}
                      className={`group relative overflow-hidden rounded-2xl border border-stone-200/80 bg-white text-stone-900 shadow-xs transition hover:shadow-md ${
                        theme.galleryLayout === "masonry"
                          ? "break-inside-avoid"
                          : theme.galleryLayout === "carousel"
                            ? "w-72 shrink-0 snap-center"
                            : ""
                      }`}
                    >
                      {item.media_type === "photo" ? (
                        <button
                          type="button"
                          onClick={() => setLightboxMedia(item)}
                          className="block w-full text-left"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.file_url}
                            alt="Wedding moment"
                            loading="lazy"
                            className={`w-full object-cover transition duration-300 group-hover:scale-[1.02] ${
                              theme.galleryLayout === "grid" ? "aspect-square" : "max-h-96"
                            }`}
                          />
                        </button>
                      ) : null}

                      {item.media_type === "video" ? (
                        <div className="relative aspect-[4/5] w-full bg-stone-950">
                          <video
                            src={item.file_url}
                            controls
                            preload="metadata"
                            className="h-full w-full object-cover"
                          />
                          <span className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white">
                            <Film className="h-3 w-3" />
                            Video
                          </span>
                        </div>
                      ) : null}

                      {item.media_type === "audio" ? (
                        <div className="flex flex-col justify-between bg-gradient-to-br from-stone-900 to-stone-800 p-5 text-stone-100">
                          <div className="flex items-center gap-2 text-amber-400">
                            <Volume2 className="h-5 w-5" />
                            <span className="text-xs font-semibold uppercase tracking-wider">
                              Voice Toast
                            </span>
                          </div>
                          <audio src={item.file_url} controls className="mt-4 w-full" />
                        </div>
                      ) : null}

                      {/* Card Footer */}
                      <div className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                        <div className="truncate">
                          <p className="truncate font-medium">
                            {isMine ? item.guest_name || "My Upload" : "Matched Moment"}
                          </p>
                          <p className="text-[10px] capitalize text-stone-500">
                            {item.category.replace("_", " ")}
                            {item.is_hidden ? " · Pending host approval" : ""}
                          </p>
                        </div>

                        {isMine ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteOwnUpload(item.id)}
                            className="flex h-12 w-12 items-center justify-center rounded-full text-stone-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="Delete my upload"
                            aria-label="Delete my upload"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Biometric Selfie Scanner Modal */}
      <FaceScannerModal
        isOpen={isFaceScannerOpen}
        onClose={() => setIsFaceScannerOpen(false)}
        accentColor={theme.primaryColor}
        onEmbeddingCaptured={(embedding) => {
          setFaceEmbedding(embedding);
          setActiveTab("find_me");
        }}
      />

      {/* Voice Toast Recorder Modal */}
      {isVoiceModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border border-stone-800 bg-stone-950 p-6 text-stone-100 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-amber-400" />
                <h2 className="text-base font-semibold">Record a Voice Toast</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopVoiceRecording();
                  cleanupRecordedVoicePreview();
                  setIsVoiceModalOpen(false);
                }}
                className="flex h-12 w-12 items-center justify-center rounded-full text-stone-400 hover:bg-stone-800 hover:text-white"
                aria-label="Close voice recorder"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-stone-400">
              Leave a heartfelt audio message or marriage advice for the couple.
            </p>

            <div className="my-6 flex flex-col items-center justify-center rounded-2xl border border-stone-800 bg-stone-900/70 p-6">
              <div className="font-mono text-3xl font-bold text-amber-400">
                {formatDuration(recordingSeconds)}
              </div>
              <p className="mt-1 text-xs text-stone-400">
                {isRecordingVoice
                  ? "Recording live…"
                  : recordedAudioUrl
                    ? "Preview your voice toast below"
                    : "Tap Record to start (max 3:00)"}
              </p>

              {recordedAudioUrl ? (
                <audio src={recordedAudioUrl} controls className="mt-4 w-full" />
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                {!isRecordingVoice && !recordedAudioUrl ? (
                  <button
                    type="button"
                    onClick={() => void startVoiceRecording()}
                    className="flex min-h-12 items-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-xs font-semibold text-white shadow-lg transition hover:bg-rose-500"
                  >
                    <Mic className="h-4 w-4" />
                    Start Recording
                  </button>
                ) : null}

                {isRecordingVoice ? (
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="flex min-h-12 items-center gap-2 rounded-full bg-amber-500 px-6 py-3 text-xs font-semibold text-stone-950 shadow-lg transition hover:bg-amber-400"
                  >
                    <Square className="h-4 w-4 fill-current" />
                    Stop Recording
                  </button>
                ) : null}

                {recordedAudioUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={cleanupRecordedVoicePreview}
                      className="min-h-12 rounded-full border border-stone-700 px-5 py-2.5 text-xs font-medium text-stone-300 hover:bg-stone-800"
                    >
                      Re-record
                    </button>
                    <button
                      type="button"
                      disabled={isUploadingVoice}
                      onClick={() => void handleUploadVoiceToast()}
                      style={{ backgroundColor: theme.primaryColor }}
                      className="flex min-h-12 items-center gap-2 rounded-full px-6 py-2.5 text-xs font-semibold text-white shadow-lg disabled:opacity-50"
                    >
                      {isUploadingVoice ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Send Voice Toast
                    </button>
                  </>
                ) : null}
              </div>

              {voiceError ? (
                <p className="mt-3 text-center text-xs text-rose-400">{voiceError}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Photo Lightbox */}
      {lightboxMedia ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxMedia(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxMedia(null)}
            className="absolute top-5 right-5 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close photo"
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxMedia.file_url}
            alt="Full resolution wedding moment"
            className="max-h-[88vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
