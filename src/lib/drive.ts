import "server-only";

import { getServerEnv } from "@/lib/env.server";

/**
 * Google Drive API v3 over plain `fetch`, one client per Google account.
 *
 * Accounts: the optional "platform Drive" from the env (GOOGLE_REFRESH_TOKEN)
 * and each host's own connected Drive (see `src/lib/drive-accounts.ts`).
 * Access tokens and quota are cached per account.
 *
 * Why not a Service Account: service accounts have a 0 GB quota on personal
 * Google accounts (`storageQuotaExceeded`). We authenticate as the owner with
 * an OAuth2 refresh token (scope `drive.file`, so the app can only see files
 * and folders it created itself — never the rest of the owner's Drive).
 *
 * Why not `googleapis`: the REST surface we need is small, and plain fetch
 * keeps serverless bundles tiny and cold starts fast.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveAccountKind = "app" | "host";

export class DriveError extends Error {
  readonly status: number;
  readonly reason: string | null;
  /** Which kind of account failed (set for OAuth token errors). */
  readonly account: DriveAccountKind | null;
  constructor(message: string, status: number, reason: string | null = null, account: DriveAccountKind | null = null) {
    super(message);
    this.name = "DriveError";
    this.status = status;
    this.reason = reason;
    this.account = account;
  }
}

/** Raised when an event's Drive cannot be used (host not connected / revoked, no platform Drive). */
export class DriveNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveNotConnectedError";
  }
}

export interface DriveCredentials {
  /** Cache key: "app" or "host:<ownerId>". */
  key: string;
  account: DriveAccountKind;
  refreshToken: string;
  /** Folder under which this account's event folders are created. */
  rootFolderId: string;
  /** Called once when Google answers `invalid_grant` (access revoked or expired). */
  onRevoked?: () => Promise<void>;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  trashed?: boolean;
  createdTime?: string;
  imageMediaMetadata?: { width?: number; height?: number };
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
}

export interface EventFolders {
  rootId: string;
  photosId: string;
  videosId: string;
  voiceId: string;
}

// ---------------------------------------------------------------------------
// OAuth2 access token (refresh-token grant), cached per server instance
// ---------------------------------------------------------------------------

const tokenCache = new Map<string, { value: string; expiresAtMs: number }>();
const inflightTokens = new Map<string, Promise<string>>();

async function requestAccessToken(creds: DriveCredentials): Promise<{ token: string; expiresInSec: number }> {
  const env = getServerEnv();
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: creds.refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    if (json.error === "invalid_grant" && creds.onRevoked) {
      await creds.onRevoked().catch((error) => console.error("[drive] onRevoked handler failed", error));
    }
    throw new DriveError(
      `OAuth token refresh failed: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim(),
      res.status,
      json.error ?? null,
      creds.account,
    );
  }
  return { token: json.access_token, expiresInSec: json.expires_in ?? 3600 };
}

export async function getAccessToken(creds: DriveCredentials, forceRefresh = false): Promise<string> {
  const cached = tokenCache.get(creds.key);
  if (!forceRefresh && cached && cached.expiresAtMs - 60_000 > Date.now()) return cached.value;

  let inflight = inflightTokens.get(creds.key);
  if (!inflight) {
    inflight = requestAccessToken(creds)
      .then(({ token, expiresInSec }) => {
        tokenCache.set(creds.key, { value: token, expiresAtMs: Date.now() + expiresInSec * 1000 });
        return token;
      })
      .finally(() => {
        inflightTokens.delete(creds.key);
      });
    inflightTokens.set(creds.key, inflight);
  }
  return inflight;
}

/** Drops cached tokens for an account (after disconnect / reconnect). */
export function forgetDriveAccount(key: string): void {
  tokenCache.delete(key);
  quotaCache.delete(key);
}

// ---------------------------------------------------------------------------
// Low-level request helper with 401 refresh + exponential backoff
// ---------------------------------------------------------------------------

const RETRYABLE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "backendError", "internalError"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readDriveErrorReason(res: Response): Promise<{ message: string; reason: string | null }> {
  try {
    const json = (await res.clone().json()) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> } | string;
      error_description?: string;
    };
    if (typeof json.error === "string") {
      return { message: json.error_description ?? json.error, reason: json.error };
    }
    return {
      message: json.error?.message ?? `HTTP ${res.status}`,
      reason: json.error?.errors?.[0]?.reason ?? null,
    };
  } catch {
    return { message: `HTTP ${res.status}`, reason: null };
  }
}

interface DriveRequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  /** Max retry attempts for 429/5xx/rate-limit 403 (default 3). */
  retries?: number;
}

async function driveRequest(creds: DriveCredentials, url: string, options: DriveRequestOptions = {}): Promise<Response> {
  const { retries = 3, headers = {}, ...init } = options;
  let refreshed = false;

  for (let attempt = 0; ; attempt += 1) {
    const token = await getAccessToken(creds, false);
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { ...headers, Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await getAccessToken(creds, true);
      continue;
    }

    let retryable = res.status === 429 || res.status >= 500;
    if (res.status === 403) {
      const { reason } = await readDriveErrorReason(res);
      retryable = reason !== null && RETRYABLE_REASONS.has(reason);
    }

    if (retryable && attempt < retries) {
      const backoff = 400 * 2 ** attempt + Math.floor(Math.random() * 250);
      await sleep(backoff);
      continue;
    }
    return res;
  }
}

async function ensureOk(res: Response, context: string): Promise<Response> {
  if (res.ok) return res;
  const { message, reason } = await readDriveErrorReason(res);
  throw new DriveError(`${context}: ${message}`, res.status, reason);
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitiseDriveName(value: string, maxLength = 120): string {
  const cleaned = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Dosya").slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const quotaCache = new Map<string, { value: DriveStorageQuota; fetchedAtMs: number }>();
const QUOTA_CACHE_MS = 60_000;

export interface DriveStorageQuota {
  /** Total bytes, or null for unlimited plans. */
  limit: number | null;
  usage: number;
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

/** Creates a Drive client bound to one Google account. */
export function createDriveClient(creds: DriveCredentials) {
  const client = {
  account: creds.account,
  rootFolderId: creds.rootFolderId,

  /**
   * Drive storage quota of this account, cached for a minute per server
   * instance so a burst of uploads costs one Drive call.
   */
  async getStorageQuota(): Promise<DriveStorageQuota> {
    const cachedQuota = quotaCache.get(creds.key);
    if (cachedQuota && Date.now() - cachedQuota.fetchedAtMs < QUOTA_CACHE_MS) return cachedQuota.value;
    const res = await driveRequest(creds, `${API_BASE}/about?fields=${encodeURIComponent("storageQuota(limit,usage)")}`);
    await ensureOk(res, "getStorageQuota");
    const json = (await res.json()) as { storageQuota?: { limit?: string; usage?: string } };
    const limit = json.storageQuota?.limit ? Number(json.storageQuota.limit) : null;
    const value: DriveStorageQuota = {
      limit: limit !== null && Number.isFinite(limit) ? limit : null,
      usage: Number(json.storageQuota?.usage ?? 0) || 0,
    };
    quotaCache.set(creds.key, { value, fetchedAtMs: Date.now() });
    return value;
  },

  /** Adds bytes to the cached usage so back-to-back sessions see each other. */
  noteReservedBytes(bytes: number): void {
    const cachedQuota = quotaCache.get(creds.key);
    if (cachedQuota) {
      quotaCache.set(creds.key, { ...cachedQuota, value: { ...cachedQuota.value, usage: cachedQuota.value.usage + bytes } });
    }
  },

  async createFolder(name: string, parentId: string): Promise<string> {
    const res = await driveRequest(creds, `${API_BASE}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ name: sanitiseDriveName(name), mimeType: DRIVE_FOLDER_MIME, parents: [parentId] }),
    });
    await ensureOk(res, "createFolder");
    const json = (await res.json()) as { id: string };
    return json.id;
  },

  async findFolder(name: string, parentId: string): Promise<string | null> {
    const q = [
      `name = '${escapeQueryValue(sanitiseDriveName(name))}'`,
      `'${escapeQueryValue(parentId)}' in parents`,
      `mimeType = '${DRIVE_FOLDER_MIME}'`,
      "trashed = false",
    ].join(" and ");
    const params = new URLSearchParams({ q, fields: "files(id)", pageSize: "1", spaces: "drive" });
    const res = await driveRequest(creds, `${API_BASE}/files?${params.toString()}`);
    await ensureOk(res, "findFolder");
    const json = (await res.json()) as { files?: Array<{ id: string }> };
    return json.files?.[0]?.id ?? null;
  },

  async ensureFolder(name: string, parentId: string): Promise<string> {
    return (await client.findFolder(name, parentId)) ?? client.createFolder(name, parentId);
  },

  /**
   * Creates `<Event_Title>_<slug>/{Photos,Videos,VoiceNotes}` under
   * this account's root folder. Idempotent: existing folders are reused.
   */
  async createEventFolders(title: string, slug: string): Promise<EventFolders> {
    const safeTitle = sanitiseDriveName(title, 80).replace(/\s+/g, "_");
    const rootId = await client.ensureFolder(`${safeTitle}_${slug}`, creds.rootFolderId);
    const [photosId, videosId, voiceId] = await Promise.all([
      client.ensureFolder("Photos", rootId),
      client.ensureFolder("Videos", rootId),
      client.ensureFolder("VoiceNotes", rootId),
    ]);
    return { rootId, photosId, videosId, voiceId };
  },

  /**
   * Starts a resumable upload session and returns the one-time session URI.
   * Passing the browser's `Origin` makes Google answer the browser's PUT with
   * the right CORS headers, so bytes go browser → Drive without our server.
   */
  async createResumableSession(params: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    parentId: string;
    origin: string;
    appProperties: Record<string, string>;
    description?: string;
  }): Promise<string> {
    const query = new URLSearchParams({
      uploadType: "resumable",
      fields: "id,name,mimeType,size",
    });
    const res = await driveRequest(creds, `${UPLOAD_BASE}/files?${query.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": params.mimeType,
        "X-Upload-Content-Length": String(params.sizeBytes),
        Origin: params.origin,
      },
      body: JSON.stringify({
        name: sanitiseDriveName(params.name, 200),
        mimeType: params.mimeType,
        parents: [params.parentId],
        appProperties: params.appProperties,
        ...(params.description ? { description: params.description.slice(0, 1000) } : {}),
      }),
    });
    await ensureOk(res, "createResumableSession");
    const location = res.headers.get("location");
    if (!location || !location.startsWith("https://www.googleapis.com/upload/drive/v3/")) {
      throw new DriveError("createResumableSession: Drive did not return a session URI", 502);
    }
    return location;
  },

  async getFile(fileId: string): Promise<DriveFile | null> {
    const fields = "id,name,mimeType,size,parents,appProperties,trashed,createdTime,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)";
    const res = await driveRequest(creds, `${API_BASE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`);
    if (res.status === 404) return null;
    await ensureOk(res, "getFile");
    return (await res.json()) as DriveFile;
  },

  /** Reads the first `byteCount` bytes (magic-byte verification). */
  async readHeadBytes(fileId: string, byteCount = 64): Promise<Uint8Array> {
    const res = await driveRequest(creds, `${API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Range: `bytes=0-${byteCount - 1}` },
    });
    await ensureOk(res, "readHeadBytes");
    const buffer = new Uint8Array(await res.arrayBuffer());
    return buffer.slice(0, byteCount);
  },

  /** Anyone with the link can view — required for lh3 thumbnails. */
  async makePublic(fileId: string): Promise<void> {
    const res = await driveRequest(creds, `${API_BASE}/files/${encodeURIComponent(fileId)}/permissions?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ role: "reader", type: "anyone", allowFileDiscovery: false }),
    });
    await ensureOk(res, "makePublic");
  },

  /** Removes the "anyone with the link" permission (moderation: hide). */
  async makePrivate(fileId: string): Promise<void> {
    const res = await driveRequest(
      creds,
      `${API_BASE}/files/${encodeURIComponent(fileId)}/permissions/anyoneWithLink`,
      { method: "DELETE" },
    );
    if (res.status === 404) return;
    await ensureOk(res, "makePrivate");
  },

  /** Moves a file or folder to the Drive trash (recoverable for 30 days). */
  async trash(fileId: string): Promise<void> {
    const res = await driveRequest(creds, `${API_BASE}/files/${encodeURIComponent(fileId)}?fields=id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ trashed: true }),
    });
    if (res.status === 404) return;
    await ensureOk(res, "trash");
  },

  /**
   * Fetches a server-side thumbnail for files that are not public yet
   * (pending/hidden items shown to the host or their uploader).
   */
  async fetchThumbnail(fileId: string, size: number): Promise<Response | null> {
    const res = await driveRequest(
      creds,
      `${API_BASE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent("thumbnailLink,hasThumbnail")}`,
    );
    if (res.status === 404) return null;
    await ensureOk(res, "fetchThumbnail");
    const json = (await res.json()) as { thumbnailLink?: string; hasThumbnail?: boolean };
    if (!json.thumbnailLink) return null;
    const link = json.thumbnailLink.replace(/=s\d+$/, `=s${size}`);
    const token = await getAccessToken(creds, false);
    const thumb = await fetch(link, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    return thumb.ok ? thumb : null;
  },

  /**
   * Opens a byte stream for a file, forwarding an optional `Range` header.
   * The caller pipes `res.body` to the client without buffering it.
   */
  async openStream(fileId: string, range: string | null): Promise<Response> {
    const res = await driveRequest(creds, `${API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: range ? { Range: range } : {},
      retries: 1,
    });
    if (res.status === 416) return res;
    return ensureOk(res, "openStream");
  },
  };
  return client;
}

export type DriveClient = ReturnType<typeof createDriveClient>;

/**
 * Moves a file/folder to the Drive trash after its database row is already
 * gone. Failures are logged, not thrown: a leftover file in the event folder
 * is harmless and recoverable, whereas a DB row pointing at a trashed file
 * would show as a broken item.
 */
export async function trashBestEffort(drive: DriveClient, fileId: string, scope: string): Promise<void> {
  try {
    await drive.trash(fileId);
  } catch (error) {
    console.error(`[${scope}] Drive trash failed (row already deleted)`, { fileId, error });
  }
}
