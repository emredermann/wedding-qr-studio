import "server-only";

import { jsonError } from "@/lib/api/http";
import type { DriveClient } from "@/lib/drive";
import { formatBytes } from "@/lib/media-config";
import { getAdminDb } from "@/lib/supabase/server";

const GiB = 1024 * 1024 * 1024;

/**
 * Per-event upload allowances. Generous for real guests, but they bound how
 * much of the owner's Drive one anonymous visitor can fill. The IP limits are
 * higher because many guests share the venue Wi-Fi (one public IP).
 */
export const UPLOAD_QUOTA = {
  sessionMaxFiles: 1500,
  sessionMaxBytes: 20 * GiB,
  ipMaxFiles: 8000,
  ipMaxBytes: 80 * GiB,
} as const;

/** Keep this much Drive space free so the owner's Gmail/Photos keep working. */
const DRIVE_SAFETY_MARGIN_BYTES = 256 * 1024 * 1024;

/**
 * Rejects the upload early (before any byte is sent) when the owner's Drive
 * cannot fit it, instead of failing at 100% with `storageQuotaExceeded`.
 */
export async function checkDriveSpace(drive: DriveClient, sizeBytes: number): Promise<ReturnType<typeof jsonError> | null> {
  const quota = await drive.getStorageQuota();
  if (quota.limit === null) return null;
  const free = quota.limit - quota.usage - DRIVE_SAFETY_MARGIN_BYTES;
  if (sizeBytes > free) {
    return jsonError(
      507,
      "DRIVE_FULL",
      `Etkinlik sahibinin Google Drive alanı dolu (boş alan: ${formatBytes(Math.max(0, free))}). Lütfen etkinlik sahibine haber verin.`,
    );
  }
  return null;
}

/** Atomically reserves one file for the guest session and IP; returns an error response when over quota. */
export async function reserveUploadQuota(params: {
  eventId: string;
  sessionId: string;
  ip: string;
  sizeBytes: number;
}): Promise<ReturnType<typeof jsonError> | null> {
  const { data, error } = await getAdminDb().rpc("reserve_upload_quota", {
    p_event_id: params.eventId,
    p_session: params.sessionId,
    p_ip: params.ip,
    p_bytes: params.sizeBytes,
    p_session_max_files: UPLOAD_QUOTA.sessionMaxFiles,
    p_session_max_bytes: UPLOAD_QUOTA.sessionMaxBytes,
    p_ip_max_files: UPLOAD_QUOTA.ipMaxFiles,
    p_ip_max_bytes: UPLOAD_QUOTA.ipMaxBytes,
  });

  if (error) {
    // PGRST202 = function not found: the migration has not been re-run yet.
    // Allow the upload (Drive-space and rate limits still apply) but say so loudly.
    if (error.code === "PGRST202") {
      console.error("[upload-quota] reserve_upload_quota missing — re-run supabase/migrations/0001_event_qr_drive.sql");
      return null;
    }
    throw new Error(`[upload-quota] ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; reason: string | null } | null;
  if (row && !row.allowed) {
    return jsonError(
      429,
      "UPLOAD_QUOTA_EXCEEDED",
      row.reason === "ip"
        ? "Bu ağdan bu etkinliğe yapılabilecek yükleme sınırına ulaşıldı. Etkinlik sahibiyle iletişime geçin."
        : `Bu etkinlik için kişi başı yükleme sınırına ulaştınız (${UPLOAD_QUOTA.sessionMaxFiles} dosya / ${formatBytes(UPLOAD_QUOTA.sessionMaxBytes)}).`,
    );
  }
  return null;
}
