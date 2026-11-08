import "server-only";

import { createDriveClient, DriveNotConnectedError, forgetDriveAccount, type DriveAccountKind, type DriveClient } from "@/lib/drive";
import { getServerEnv } from "@/lib/env.server";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { getAdminDb } from "@/lib/supabase/server";
import type { EventRow } from "@/types/domain";

/** HKDF purpose label for encrypted Google refresh tokens. */
const TOKEN_PURPOSE = "google-drive-refresh-token";

export interface DriveConnectionRow {
  owner_id: string;
  google_sub: string;
  google_email: string | null;
  refresh_token_enc: string;
  root_folder_id: string;
  status: "active" | "revoked";
  connected_at: string;
  updated_at: string;
}

export function hostAccountKey(ownerId: string): string {
  return `host:${ownerId}`;
}

export function sealRefreshToken(refreshToken: string): string {
  return sealSecret(refreshToken, getServerEnv().APP_SECRET, TOKEN_PURPOSE);
}

/** The optional platform Drive configured in the environment (null when not set). */
export function getPlatformDrive(): DriveClient | null {
  const env = getServerEnv();
  if (!env.GOOGLE_REFRESH_TOKEN || !env.GOOGLE_DRIVE_ROOT_FOLDER_ID) return null;
  return createDriveClient({
    key: "app",
    account: "app",
    refreshToken: env.GOOGLE_REFRESH_TOKEN,
    rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
  });
}

export async function loadDriveConnection(ownerId: string): Promise<DriveConnectionRow | null> {
  const { data, error } = await getAdminDb().from("drive_connections").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(`[drive-accounts] ${error.message}`);
  return (data as DriveConnectionRow | null) ?? null;
}

/** Decrypts a stored refresh token (null if APP_SECRET changed or the value was tampered with). */
export function openRefreshToken(connection: Pick<DriveConnectionRow, "refresh_token_enc">): string | null {
  return openSecret(connection.refresh_token_enc, getServerEnv().APP_SECRET, TOKEN_PURPOSE);
}

/** Builds a client for a host's own Drive. Marks the connection revoked if Google rejects the token. */
export function hostDriveClient(connection: DriveConnectionRow): DriveClient {
  const refreshToken = openRefreshToken(connection);
  if (!refreshToken) {
    // APP_SECRET changed or the row was tampered with: the host must reconnect.
    throw new DriveNotConnectedError("Google Drive bağlantısı çözülemedi. Panelden Google Drive'ı yeniden bağlayın.");
  }
  const key = hostAccountKey(connection.owner_id);
  return createDriveClient({
    key,
    account: "host",
    refreshToken,
    rootFolderId: connection.root_folder_id,
    onRevoked: async () => {
      forgetDriveAccount(key);
      // Only revoke this exact token, never one from a newer reconnect.
      await getAdminDb()
        .from("drive_connections")
        .update({ status: "revoked" })
        .eq("owner_id", connection.owner_id)
        .eq("refresh_token_enc", connection.refresh_token_enc);
    },
  });
}

/** Drive client for an existing event, based on where the event was created. */
export async function driveForEvent(event: Pick<EventRow, "owner_id" | "drive_account">): Promise<DriveClient> {
  if (event.drive_account === "host") {
    const connection = await loadDriveConnection(event.owner_id);
    if (!connection || connection.status !== "active") {
      throw new DriveNotConnectedError(
        "Etkinlik sahibinin Google Drive bağlantısı kopmuş. Etkinlik sahibi panelden Google Drive'ı yeniden bağlamalı.",
      );
    }
    return hostDriveClient(connection);
  }
  const platform = getPlatformDrive();
  if (!platform) {
    throw new DriveNotConnectedError("Bu etkinliğin kullandığı platform Drive'ı yapılandırılmamış (GOOGLE_REFRESH_TOKEN).");
  }
  return platform;
}

/**
 * Drive for a NEW event: the host's own connected Drive when available,
 * otherwise the platform Drive; neither → the host must connect first.
 */
export async function driveForNewEvent(ownerId: string): Promise<{ drive: DriveClient; account: DriveAccountKind }> {
  const connection = await loadDriveConnection(ownerId);
  if (connection?.status === "active") return { drive: hostDriveClient(connection), account: "host" };
  const platform = getPlatformDrive();
  if (platform) return { drive: platform, account: "app" };
  throw new DriveNotConnectedError(
    connection?.status === "revoked"
      ? "Google Drive bağlantınız kopmuş. Etkinlik oluşturmadan önce Google Drive'ı yeniden bağlayın."
      : "Etkinlik oluşturmadan önce Google Drive'ınızı bağlayın.",
  );
}
