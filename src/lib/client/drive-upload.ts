"use client";

import { apiFetch, ApiError } from "@/lib/client/api";
import { bytesToHex } from "@/lib/media-config";
import type { MediaDto, UploadSessionResponse } from "@/types/domain";

/**
 * Direct browser → Google Drive upload.
 *   A) POST /api/drive/upload-session → one-time resumable session URI
 *   B) PUT the bytes straight to that URI (chunked + resumable, with progress)
 *   C) POST /api/media/confirm with the Drive fileId (+ face descriptors)
 * The Next.js server never receives the file bytes.
 */

// Multiple of 256 KiB, as Drive requires. 16 MiB halves the round trips of
// 8 MiB on mobile networks while keeping a failed chunk cheap to resend
// (a resumed upload restarts from the last byte Drive confirmed).
const CHUNK_SIZE = 16 * 1024 * 1024;
const SINGLE_PUT_LIMIT = 16 * 1024 * 1024;
const MAX_RETRIES = 6;
/** Total confirm attempts and the exponential back-off between them. */
const CONFIRM_ATTEMPTS = 3;
const CONFIRM_BACKOFF_MS = [1000, 2500] as const;

export interface UploadExtras {
  faces?: number[][];
  width?: number;
  height?: number;
}

export interface UploadOptions {
  file: Blob;
  fileName: string;
  eventSlug: string;
  guestName?: string;
  note?: string;
  category?: string | null;
  /** Photo challenge the guest joined (validated again on the server). */
  challengeId?: string | null;
  isGuestbook?: boolean;
  /** Resolved in parallel with the byte upload (e.g. face descriptors). */
  extras?: Promise<UploadExtras>;
  onProgress?: (fraction: number) => void;
  /**
   * Called once the bytes are on Drive, before waiting for `extras` and the
   * confirm call. Lets a caller start the next transfer while face analysis
   * and confirmation of this file finish in the background.
   */
  onBytesUploaded?: () => void;
  signal?: AbortSignal;
}

interface XhrResult {
  status: number;
  responseText: string;
  rangeHeader: string | null;
}

function xhrPut(
  url: string,
  body: Blob | null,
  headers: Record<string, string>,
  onProgress: ((loaded: number) => void) | null,
  signal?: AbortSignal,
): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    if (onProgress) xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () =>
      resolve({ status: xhr.status, responseText: xhr.responseText, rangeHeader: xhr.getResponseHeader("Range") });
    xhr.onerror = () => resolve({ status: 0, responseText: "", rangeHeader: null });
    xhr.ontimeout = () => resolve({ status: 0, responseText: "", rangeHeader: null });
    xhr.onabort = () => reject(new DOMException("Yükleme iptal edildi.", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}

function nextOffsetFromRange(range: string | null, fallback: number): number {
  const match = range ? /bytes=0-(\d+)/.exec(range) : null;
  return match ? Number(match[1]) + 1 : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDriveFile(text: string): { id: string } {
  const json = JSON.parse(text) as { id?: string };
  if (!json.id) throw new Error("Google Drive dosya kimliği döndürmedi.");
  return { id: json.id };
}

/** Asks Drive how many bytes it already has (after a network failure). */
async function queryUploadedBytes(url: string, size: number, signal?: AbortSignal): Promise<number | { id: string }> {
  const res = await xhrPut(url, null, { "Content-Range": `bytes */${size}` }, null, signal);
  if (res.status === 200 || res.status === 201) return parseDriveFile(res.responseText);
  if (res.status === 308) return nextOffsetFromRange(res.rangeHeader, 0);
  if (res.status === 404 || res.status === 410) {
    throw new Error("Yükleme oturumunun süresi doldu. Lütfen dosyayı tekrar seçin.");
  }
  return -1;
}

async function putResumable(
  url: string,
  file: Blob,
  mimeType: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ id: string }> {
  const size = file.size;
  let offset = 0;
  let failures = 0;

  while (true) {
    const single = size <= SINGLE_PUT_LIMIT && offset === 0;
    const end = single ? size : Math.min(offset + CHUNK_SIZE, size);
    const headers: Record<string, string> = { "Content-Type": mimeType };
    if (!single) headers["Content-Range"] = `bytes ${offset}-${end - 1}/${size}`;

    const startOffset = offset;
    const res = await xhrPut(
      url,
      single ? file : file.slice(offset, end),
      headers,
      (loaded) => onProgress(Math.min(0.999, (startOffset + loaded) / size)),
      signal,
    );

    if (res.status === 200 || res.status === 201) {
      onProgress(1);
      return parseDriveFile(res.responseText);
    }
    if (res.status === 308) {
      offset = nextOffsetFromRange(res.rangeHeader, end);
      failures = 0;
      continue;
    }
    if (res.status === 404 || res.status === 410) {
      throw new Error("Yükleme oturumunun süresi doldu. Lütfen tekrar deneyin.");
    }
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new Error(`Google Drive yüklemeyi reddetti (${res.status}).`);
    }

    // Network error, timeout, 408/429 or 5xx: back off, ask Drive where to resume.
    failures += 1;
    if (failures > MAX_RETRIES) throw new Error("Bağlantı sorunu nedeniyle yükleme tamamlanamadı.");
    await sleep(Math.min(16_000, 1000 * 2 ** (failures - 1)) + Math.random() * 500);
    const resume = await queryUploadedBytes(url, size, signal);
    if (typeof resume === "object") {
      onProgress(1);
      return resume;
    }
    if (resume >= 0) offset = resume;
  }
}

async function readMagicHex(file: Blob): Promise<string | undefined> {
  try {
    const buffer = await file.slice(0, 32).arrayBuffer();
    const hex = bytesToHex(new Uint8Array(buffer));
    return hex.length >= 16 ? hex : undefined;
  } catch {
    return undefined;
  }
}

export async function uploadToDrive(options: UploadOptions): Promise<MediaDto> {
  const { file, fileName, eventSlug, guestName, note, category, challengeId, isGuestbook = false, extras, onProgress, onBytesUploaded, signal } = options;
  const report = onProgress ?? (() => undefined);

  const session = await apiFetch<UploadSessionResponse>("/api/drive/upload-session", {
    method: "POST",
    json: {
      eventSlug,
      fileName,
      mimeType: file.type,
      sizeBytes: file.size,
      magicBytesHex: await readMagicHex(file),
      guestName: guestName || undefined,
      isGuestbook,
    },
    signal,
  });

  const noExtras: UploadExtras = {};
  // Extras (face analysis) keep running in parallel with the byte transfer.
  const extrasReady = (extras ?? Promise.resolve(noExtras)).catch(() => noExtras);
  const driveFile = await putResumable(session.uploadUrl, file, session.mimeType, report, signal);
  onBytesUploaded?.();
  const extra = await extrasReady;

  const confirm = () =>
    apiFetch<{ media: MediaDto }>("/api/media/confirm", {
      method: "POST",
      json: {
        uploadToken: session.uploadToken,
        fileId: driveFile.id,
        guestName: guestName || undefined,
        note: note || undefined,
        category: category || undefined,
        challengeId: challengeId || undefined,
        faces: extra.faces ?? [],
        width: extra.width,
        height: extra.height,
      },
    });

  // Confirm is idempotent, so retrying after a dropped connection / 5xx is safe.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw new DOMException("Yükleme iptal edildi.", "AbortError");
    try {
      return (await confirm()).media;
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500);
      if (!retryable || attempt >= CONFIRM_ATTEMPTS - 1) throw error;
      await sleep(CONFIRM_BACKOFF_MS[attempt] ?? CONFIRM_BACKOFF_MS[CONFIRM_BACKOFF_MS.length - 1]);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Yükleme onaylanamadı. Lütfen tekrar deneyin.");
}
