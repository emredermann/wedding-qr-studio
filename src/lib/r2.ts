import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

import { getR2ServerEnv, getSupabaseServerEnv, isR2Configured } from "@/lib/env.server";
import { MAX_PRESIGN_TTL_SECONDS, PRESIGN_TTL_SECONDS } from "@/lib/media-config";
import type { UUID } from "@/types/database";

let r2Client: S3Client | null = null;

const STRICT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FILE_KEY_PATTERN =
  /^albums\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]{1,5}$/;

const LOCAL_STORAGE_ROOT = path.join(process.cwd(), ".local-storage", "wedding-qr-media");

interface LocalObjectMeta {
  contentType: string;
  contentLength: number;
  createdAt: string;
}

function getStorageSigningSecret(): string {
  const supaEnv = getSupabaseServerEnv();
  return (
    process.env.GUEST_SESSION_SECRET?.trim() ||
    supaEnv.SUPABASE_SERVICE_ROLE_KEY ||
    supaEnv.SUPABASE_SERVER_RPC_SECRET
  );
}

function signStoragePayload(payload: string): string {
  return createHmac("sha256", getStorageSigningSecret()).update(payload).digest("hex");
}

function safeHexEqual(expectedHex: string, providedHex: string): boolean {
  if (expectedHex.length !== providedHex.length) return false;
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(providedHex, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isCanonicalFileKey(fileKey: string): boolean {
  if (
    fileKey.includes("..") ||
    fileKey.includes("\\") ||
    fileKey.includes("//") ||
    fileKey.startsWith("/")
  ) {
    return false;
  }
  return FILE_KEY_PATTERN.test(fileKey);
}

function resolveLocalFilePaths(fileKey: string): { dataPath: string; metaPath: string } {
  if (!isCanonicalFileKey(fileKey)) {
    throw new Error("Refusing to resolve non-canonical storage key.");
  }
  const normalizedRel = fileKey.split("/").join(path.sep);
  const dataPath = path.resolve(LOCAL_STORAGE_ROOT, normalizedRel);
  const rootResolved = path.resolve(LOCAL_STORAGE_ROOT);
  if (!dataPath.startsWith(rootResolved + path.sep)) {
    throw new Error("Storage path traversal blocked.");
  }
  return {
    dataPath,
    metaPath: `${dataPath}.meta.json`,
  };
}

export function verifyLocalStoragePutSignature(params: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresAtUnix: number;
  signature: string;
}): boolean {
  if (!isCanonicalFileKey(params.key)) return false;
  const nowUnix = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(params.expiresAtUnix) || params.expiresAtUnix < nowUnix) {
    return false;
  }
  const payload = `PUT:${params.key}:${params.contentType}:${params.contentLength}:${params.expiresAtUnix}`;
  const expected = signStoragePayload(payload);
  return safeHexEqual(expected, params.signature);
}

export function verifyLocalStorageGetSignature(params: {
  key: string;
  expiresAtUnix: number;
  signature: string;
}): boolean {
  if (!isCanonicalFileKey(params.key)) return false;
  const nowUnix = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(params.expiresAtUnix) || params.expiresAtUnix < nowUnix) {
    return false;
  }
  const payload = `GET:${params.key}:${params.expiresAtUnix}`;
  const expected = signStoragePayload(payload);
  return safeHexEqual(expected, params.signature);
}

export async function writeLocalStorageObject(params: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  const { dataPath, metaPath } = resolveLocalFilePaths(params.key);
  await fs.mkdir(/* turbopackIgnore: true */ path.dirname(dataPath), { recursive: true });
  await fs.writeFile(/* turbopackIgnore: true */ dataPath, params.bytes);
  const meta: LocalObjectMeta = {
    contentType: params.contentType,
    contentLength: params.bytes.byteLength,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(/* turbopackIgnore: true */ metaPath, JSON.stringify(meta), "utf8");
}

export async function readLocalStorageObject(
  key: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const { dataPath, metaPath } = resolveLocalFilePaths(key);
    const [bytes, rawMeta] = await Promise.all([
      fs.readFile(/* turbopackIgnore: true */ dataPath),
      fs.readFile(/* turbopackIgnore: true */ metaPath, "utf8").catch(() => null),
    ]);
    let contentType = "application/octet-stream";
    if (rawMeta) {
      const parsed = JSON.parse(rawMeta) as Partial<LocalObjectMeta>;
      if (typeof parsed.contentType === "string" && parsed.contentType) {
        contentType = parsed.contentType;
      }
    }
    return { bytes, contentType };
  } catch {
    return null;
  }
}

/**
 * Cloudflare R2 client (S3-compatible). Stateless apart from its keep-alive
 * HTTP agent, so one instance is reused across requests.
 *
 * Checksums are WHEN_REQUIRED: recent AWS SDKs otherwise add
 * `x-amz-checksum-*` / `x-amz-sdk-checksum-algorithm` to presigned PUT URLs,
 * which browsers cannot reproduce and R2 rejects.
 */
export function getR2Client(): S3Client {
  if (r2Client) return r2Client;
  const env = getR2ServerEnv();
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return r2Client;
}

/**
 * `albums/${albumId}/${uuid}.${ext}` — unguessable v4 UUID object key, zero
 * user-controlled path segments, immune to path traversal and bucket overwrite.
 */
export function buildAlbumFileKey(albumId: UUID, extension: string): string {
  const cleanAlbumId = albumId.trim().toLowerCase();
  if (!STRICT_UUID_PATTERN.test(cleanAlbumId)) {
    throw new Error("Invalid albumId for storage key generation.");
  }
  const ext = extension.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5) || "bin";
  const key = `albums/${cleanAlbumId}/${uuidv4()}.${ext}`;
  if (!isFileKeyForAlbum(key, cleanAlbumId)) {
    throw new Error("Generated fileKey failed canonical format check.");
  }
  return key;
}

/** True when `fileKey` was produced by `buildAlbumFileKey` for `albumId` with zero traversal tokens. */
export function isFileKeyForAlbum(fileKey: string, albumId: UUID): boolean {
  if (!isCanonicalFileKey(fileKey)) {
    return false;
  }
  const match = FILE_KEY_PATTERN.exec(fileKey);
  return match !== null && match[1] === albumId.toLowerCase();
}

export function getPublicUrl(fileKey: string): string {
  const encodedPath = fileKey.split("/").map(encodeURIComponent).join("/");
  if (!isR2Configured()) {
    return `/api/storage/${encodedPath}`;
  }
  const env = getR2ServerEnv();
  return `${env.R2_PUBLIC_URL}/${encodedPath}`;
}

export interface PresignedPut {
  url: string;
  expiresIn: number;
  expiresAt: Date;
}

/**
 * Presigned PUT URL.
 * - `Content-Type` and `Content-Length` are signed, so the browser must upload
 *   the exact byte count and MIME type negotiated during presign.
 * - Expiry is strictly clamped under 300 seconds (`MAX_PRESIGN_TTL_SECONDS = 299`).
 * - Falls back seamlessly to HMAC-SHA256 signed local object storage when
 *   Cloudflare R2 credentials are not configured.
 */
export async function createPresignedPutUrl(params: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
}): Promise<PresignedPut> {
  if (!isCanonicalFileKey(params.key)) {
    throw new Error("Refusing to sign non-canonical storage key.");
  }

  const requestedTtl = params.expiresInSeconds ?? PRESIGN_TTL_SECONDS;
  const expiresIn = Math.min(MAX_PRESIGN_TTL_SECONDS, Math.max(30, Math.floor(requestedTtl)));
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  if (!isR2Configured()) {
    const expiresAtUnix = Math.floor(expiresAt.getTime() / 1000);
    const payload = `PUT:${params.key}:${params.contentType}:${params.contentLength}:${expiresAtUnix}`;
    const sig = signStoragePayload(payload);
    const encodedPath = params.key.split("/").map(encodeURIComponent).join("/");
    const query = new URLSearchParams({
      exp: String(expiresAtUnix),
      len: String(params.contentLength),
      type: params.contentType,
      sig,
    });
    return {
      url: `/api/storage/${encodedPath}?${query.toString()}`,
      expiresIn,
      expiresAt,
    };
  }

  const env = getR2ServerEnv();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });

  const url = await getSignedUrl(getR2Client(), command, {
    expiresIn,
    signableHeaders: new Set(["content-type", "content-length"]),
  });

  return { url, expiresIn, expiresAt };
}

/**
 * Generates a short-lived (< 300s) presigned GET URL for an object in R2 or
 * local signed storage.
 */
export async function createPresignedGetUrl(
  key: string,
  fallbackUrl?: string,
  expiresInSeconds: number = PRESIGN_TTL_SECONDS,
): Promise<string> {
  if (!isCanonicalFileKey(key)) {
    return fallbackUrl ?? "";
  }
  const expiresIn = Math.min(MAX_PRESIGN_TTL_SECONDS, Math.max(30, Math.floor(expiresInSeconds)));

  if (!isR2Configured()) {
    if (fallbackUrl && fallbackUrl.startsWith("https://images.unsplash.com/")) {
      return fallbackUrl;
    }
    const expiresAtUnix = Math.floor(Date.now() / 1000) + expiresIn;
    const payload = `GET:${key}:${expiresAtUnix}`;
    const sig = signStoragePayload(payload);
    const encodedPath = key.split("/").map(encodeURIComponent).join("/");
    return `/api/storage/${encodedPath}?exp=${expiresAtUnix}&sig=${sig}`;
  }

  try {
    const env = getR2ServerEnv();
    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    });
    return await getSignedUrl(getR2Client(), command, { expiresIn });
  } catch {
    return fallbackUrl ?? getPublicUrl(key);
  }
}

export interface R2ObjectHead {
  contentLength: number;
  contentType: string | null;
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.name === "NotFound" || error.name === "NoSuchKey" || error.$metadata.httpStatusCode === 404)
  );
}

/** Object metadata, or `null` if the key does not exist. */
export async function headR2Object(key: string): Promise<R2ObjectHead | null> {
  if (!isCanonicalFileKey(key)) return null;

  if (!isR2Configured()) {
    try {
      const { dataPath, metaPath } = resolveLocalFilePaths(key);
      const stat = await fs.stat(/* turbopackIgnore: true */ dataPath);
      let contentType: string | null = null;
      try {
        const rawMeta = await fs.readFile(/* turbopackIgnore: true */ metaPath, "utf8");
        const parsed = JSON.parse(rawMeta) as Partial<LocalObjectMeta>;
        contentType = typeof parsed.contentType === "string" ? parsed.contentType : null;
      } catch {
        contentType = null;
      }
      return {
        contentLength: stat.size,
        contentType,
      };
    } catch {
      return null;
    }
  }

  const env = getR2ServerEnv();
  try {
    const result = await getR2Client().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    return {
      contentLength: typeof result.ContentLength === "number" ? result.ContentLength : 0,
      contentType: result.ContentType ?? null,
    };
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

/**
 * Fetches the first `byteCount` bytes of a stored R2 or local object so
 * `/api/upload/complete` can verify magic bytes before registering the media row.
 */
export async function readR2ObjectMagicBytes(
  key: string,
  byteCount = 64,
): Promise<Uint8Array | null> {
  if (!isCanonicalFileKey(key)) return null;
  const maxBytes = Math.max(16, Math.min(256, byteCount));

  if (!isR2Configured()) {
    try {
      const { dataPath } = resolveLocalFilePaths(key);
      const handle = await fs.open(/* turbopackIgnore: true */ dataPath, "r");
      try {
        const buffer = Buffer.alloc(maxBytes);
        const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
        return bytesRead > 0 ? new Uint8Array(buffer.subarray(0, bytesRead)) : null;
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }

  const env = getR2ServerEnv();
  const endByte = maxBytes - 1;
  try {
    const result = await getR2Client().send(
      new GetObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Range: `bytes=0-${endByte}`,
      }),
    );
    if (!result.Body) return null;
    const byteArray = await result.Body.transformToByteArray();
    return byteArray;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

/** Deletes an object; deleting a missing key is a no-op. */
export async function deleteR2Object(key: string): Promise<void> {
  if (!isCanonicalFileKey(key)) return;

  if (!isR2Configured()) {
    try {
      const { dataPath, metaPath } = resolveLocalFilePaths(key);
      await Promise.all([
        fs.unlink(/* turbopackIgnore: true */ dataPath).catch(() => undefined),
        fs.unlink(/* turbopackIgnore: true */ metaPath).catch(() => undefined),
      ]);
    } catch {
      // No-op if missing
    }
    return;
  }

  const env = getR2ServerEnv();
  await getR2Client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}
