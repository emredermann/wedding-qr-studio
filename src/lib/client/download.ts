"use client";

import { streamUrl } from "@/lib/media-urls";
import { Crc32, ZIP_MAX_ENTRIES, ZIP_PART_LIMIT_BYTES, ZipWriter } from "@/lib/client/zip";

/** Original-quality bytes are fetched through the Range proxy in 16 MB chunks. */
const RANGE_CHUNK = 16 * 1024 * 1024;
/** Kept low so parallel 16 MB Range requests stay under the Drive API quota. */
const PARALLEL_FILES = 3;
const MAX_CHUNK_ATTEMPTS = 5;
const MAX_RETRY_AFTER_MS = 60_000;

/** A transient HTTP failure (429 / 502 / 503) carrying the server's requested wait. */
class RetryableHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(`HTTP ${status}`);
    this.name = "RetryableHttpError";
  }
}

/** Parses `Retry-After` (delta-seconds or HTTP-date) into milliseconds. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(MAX_RETRY_AFTER_MS, Number(trimmed) * 1000);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, at - Date.now()));
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("İndirme iptal edildi.", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("İndirme iptal edildi.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface DownloadableFile {
  fileId: string;
  name: string;
  sizeBytes: number;
  folder?: string;
  createdAt?: string;
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Downloads one original file as a Blob (chunked Range requests), computing CRC-32 on the way. */
export async function fetchOriginal(
  file: DownloadableFile,
  onBytes?: (delta: number) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; crc: number }> {
  const crc = new Crc32();
  const chunks: Blob[] = [];
  let offset = 0;
  const total = file.sizeBytes;
  while (offset < total) {
    const end = Math.min(offset + RANGE_CHUNK, total) - 1;
    let attempt = 0;
    while (true) {
      try {
        const res = await fetch(streamUrl(file.fileId), {
          headers: { Range: `bytes=${offset}-${end}` },
          credentials: "same-origin",
          signal,
        });
        if (res.status === 429 || res.status === 502 || res.status === 503) {
          throw new RetryableHttpError(res.status, parseRetryAfter(res.headers.get("Retry-After")));
        }
        if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const usable = res.status === 200 ? bytes.subarray(offset, end + 1) : bytes;
        if (usable.length === 0) throw new Error("Boş yanıt");
        crc.update(usable);
        chunks.push(new Blob([usable as BlobPart]));
        offset += usable.length;
        onBytes?.(usable.length);
        break;
      } catch (error) {
        if (signal?.aborted) throw error;
        attempt += 1;
        if (attempt >= MAX_CHUNK_ATTEMPTS) throw new Error(`"${file.name}" indirilemedi.`);
        const backoff = Math.min(16_000, 800 * 2 ** (attempt - 1)) + Math.random() * 400;
        const requested = error instanceof RetryableHttpError ? (error.retryAfterMs ?? 0) : 0;
        await wait(Math.max(backoff, requested), signal);
      }
    }
  }
  return { blob: new Blob(chunks), crc: crc.digest() };
}

export async function downloadOriginal(file: DownloadableFile): Promise<void> {
  const { blob } = await fetchOriginal(file);
  saveBlob(blob, file.name);
}

export interface ZipProgress {
  doneFiles: number;
  totalFiles: number;
  doneBytes: number;
  totalBytes: number;
  part: number;
  failed: string[];
}

/**
 * Builds one or more `.zip` files entirely in the browser (no server RAM),
 * fetching up to 3 originals in parallel. Archives are split at ~3.5 GB or
 * 60 000 entries so no part overflows the classic-ZIP limits.
 */
export async function downloadZip(
  files: DownloadableFile[],
  baseName: string,
  onProgress: (progress: ZipProgress) => void,
  signal?: AbortSignal,
): Promise<ZipProgress> {
  const progress: ZipProgress = {
    doneFiles: 0,
    totalFiles: files.length,
    doneBytes: 0,
    totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
    part: 1,
    failed: [],
  };
  let writer = new ZipWriter();
  const estimatedParts = Math.max(1, Math.ceil(progress.totalBytes / ZIP_PART_LIMIT_BYTES));
  const partName = (n: number) => (estimatedParts > 1 || n > 1 ? `${baseName}-bolum-${n}.zip` : `${baseName}.zip`);

  const flush = () => {
    if (writer.entryCount === 0) return;
    saveBlob(writer.finish(), partName(progress.part));
    progress.part += 1;
    writer = new ZipWriter();
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      if (signal?.aborted) throw new DOMException("İndirme iptal edildi.", "AbortError");
      const file = files[cursor];
      cursor += 1;
      try {
        const { blob, crc } = await fetchOriginal(
          file,
          (delta) => {
            progress.doneBytes += delta;
            onProgress({ ...progress });
          },
          signal,
        );
        const path = file.folder ? `${file.folder}/${file.name}` : file.name;
        if (
          writer.byteLength + blob.size > ZIP_PART_LIMIT_BYTES ||
          writer.entryCount >= ZIP_MAX_ENTRIES ||
          !writer.canFit(path, blob.size)
        ) {
          flush();
        }
        writer.add(path, blob, crc, file.createdAt ? new Date(file.createdAt) : new Date());
      } catch (error) {
        if (signal?.aborted) throw error;
        progress.failed.push(file.name);
      }
      progress.doneFiles += 1;
      onProgress({ ...progress });
    }
  };

  await Promise.all(Array.from({ length: Math.min(PARALLEL_FILES, files.length) }, worker));
  flush();
  return progress;
}
