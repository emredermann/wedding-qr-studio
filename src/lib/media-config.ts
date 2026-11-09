import type { MediaKind } from "@/types/domain";

/**
 * Media rules shared by the browser (pre-checks) and the server (authoritative
 * checks). Uploads are whitelisted by MIME type AND verified by magic bytes.
 */

type MediaType = MediaKind;

const MiB = 1024 * 1024;

/** Per-file size limits. Google Drive itself accepts up to 5 TB. */
export const MAX_FILE_SIZE_BYTES: Readonly<Record<MediaKind, number>> = {
  photo: 60 * MiB,
  video: 4000 * MiB, // < 4 GiB keeps every ZIP entry within the classic (non-ZIP64) format
  audio: 200 * MiB,
};

/** Guestbook recordings (MediaRecorder) duration caps in seconds. */
export const MAX_AUDIO_RECORDING_SECONDS = 180;
export const MAX_VIDEO_RECORDING_SECONDS = 60;

/** Max simultaneous browser → Drive uploads (keeps mobile memory bounded). */
export const MAX_CONCURRENT_UPLOADS = 3;

/** Explicit whitelist of allowed photo MIME types (SVG and arbitrary subtypes are forbidden). */
export const ALLOWED_PHOTO_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
]);

/** Explicit whitelist of allowed video MIME types. */
export const ALLOWED_VIDEO_MIMES: ReadonlySet<string> = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/3gpp",
]);

/** Explicit whitelist of allowed audio MIME types (MediaRecorder output). */
export const ALLOWED_AUDIO_MIMES: ReadonlySet<string> = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
]);

const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

/** "Audio/WebM; codecs=opus" → "audio/webm". Returns null if malformed. */
export function normaliseMimeType(value: string): string | null {
  const base = value.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base === "image/jpg") return "image/jpeg";
  if (base === "audio/x-m4a") return "audio/mp4";
  if (base === "video/x-m4v") return "video/mp4";
  return MIME_PATTERN.test(base) ? base : null;
}

/** Maps a normalised MIME type to its media type using strict whitelisting, or null if not allowed. */
export function classifyMimeType(mimeType: string): MediaType | null {
  if (ALLOWED_PHOTO_MIMES.has(mimeType)) return "photo";
  if (ALLOWED_VIDEO_MIMES.has(mimeType)) return "video";
  if (ALLOWED_AUDIO_MIMES.has(mimeType)) return "audio";
  return null;
}

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
};

/**
 * Resolves a canonical file extension strictly from the whitelisted MIME map.
 * User-supplied filenames are never interpolated into storage keys.
 */
export function resolveExtension(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "bin";
}

/**
 * Some mobile browsers report an empty `File.type` (e.g. HEIC on Android).
 * Infers a candidate MIME type from the extension; magic-byte validation still
 * verifies the actual binary header before the upload is accepted.
 */
export function inferMimeTypeFromFileName(fileName: string): string | null {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  const byExtension: Readonly<Record<string, string>> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    "3gp": "video/3gpp",
    weba: "audio/webm",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    mp3: "audio/mpeg",
  };
  return byExtension[ext] ?? null;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.byteLength < offset + length) return "";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[offset + i]);
  }
  return out;
}

/**
 * Inspects the first 12–64 magic bytes of a file buffer and returns the
 * detected `{ mimeType, mediaType }`, or `null` if the binary header does not
 * match any whitelisted image, video, or audio container signature.
 */
export function detectMimeFromMagicBytes(
  bytes: Uint8Array,
  claimedMimeType?: string | null,
): { mimeType: string; mediaType: MediaType } | null {
  if (bytes.byteLength < 4) return null;

  // 1. JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", mediaType: "photo" };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", mediaType: "photo" };
  }

  // 3. GIF87a / GIF89a
  if (bytes.byteLength >= 6) {
    const sig6 = asciiAt(bytes, 0, 6);
    if (sig6 === "GIF87a" || sig6 === "GIF89a") {
      return { mimeType: "image/gif", mediaType: "photo" };
    }
  }

  // 4. RIFF....WEBP
  if (
    bytes.byteLength >= 12 &&
    asciiAt(bytes, 0, 4) === "RIFF" &&
    asciiAt(bytes, 8, 4) === "WEBP"
  ) {
    return { mimeType: "image/webp", mediaType: "photo" };
  }

  // 5. ISO BMFF ('ftyp' at bytes 4..7): HEIC, HEIF, AVIF, MP4, MOV, 3GP, M4A
  if (bytes.byteLength >= 12 && asciiAt(bytes, 4, 4) === "ftyp") {
    const brand = asciiAt(bytes, 8, 4).toLowerCase();
    const headerAscii = asciiAt(bytes, 8, Math.min(24, bytes.byteLength - 8)).toLowerCase();

    if (
      brand.startsWith("hei") ||
      brand.startsWith("hev") ||
      headerAscii.includes("heic") ||
      headerAscii.includes("heix")
    ) {
      return { mimeType: "image/heic", mediaType: "photo" };
    }
    if (brand === "mif1" || brand === "msf1") {
      if (headerAscii.includes("avif")) {
        return { mimeType: "image/avif", mediaType: "photo" };
      }
      return { mimeType: "image/heif", mediaType: "photo" };
    }
    if (brand === "avif" || brand === "avis" || headerAscii.includes("avif")) {
      return { mimeType: "image/avif", mediaType: "photo" };
    }
    if (brand === "qt  ") {
      return { mimeType: "video/quicktime", mediaType: "video" };
    }
    if (brand.startsWith("3gp") || brand.startsWith("3g2")) {
      return { mimeType: "video/3gpp", mediaType: "video" };
    }
    if (brand === "m4a " || claimedMimeType?.startsWith("audio/")) {
      return { mimeType: "audio/mp4", mediaType: "audio" };
    }
    return { mimeType: "video/mp4", mediaType: "video" };
  }

  // 6. EBML (WebM / Matroska): 1A 45 DF A3
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    if (claimedMimeType?.startsWith("audio/")) {
      return { mimeType: "audio/webm", mediaType: "audio" };
    }
    return { mimeType: "video/webm", mediaType: "video" };
  }

  // 7. OGG container: "OggS"
  if (asciiAt(bytes, 0, 4) === "OggS") {
    return { mimeType: "audio/ogg", mediaType: "audio" };
  }

  // 8. MP3 (ID3v2 tag or MPEG audio frame sync)
  if (
    asciiAt(bytes, 0, 3) === "ID3" ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  ) {
    return { mimeType: "audio/mpeg", mediaType: "audio" };
  }

  return null;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
