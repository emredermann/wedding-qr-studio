import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { forgetDriveAccount } from "@/lib/drive";
import { getPlatformDrive, hostAccountKey, loadDriveConnection, openRefreshToken } from "@/lib/drive-accounts";
import { revokeGoogleToken } from "@/lib/google-oauth";
import { getHostUser } from "@/lib/host-auth";
import { getAdminDb } from "@/lib/supabase/server";
import type { DriveConnectionStatusDto } from "@/types/domain";

export const runtime = "nodejs";

async function countEventsOnOwnDrive(ownerId: string): Promise<number> {
  const { count, error } = await getAdminDb()
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("drive_account", "host");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** GET /api/host/drive — the host's Drive connection status (never exposes tokens). */
export async function GET() {
  try {
    const host = await getHostUser();
    if (!host) return jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.");
    const [connection, eventsOnOwnDrive] = await Promise.all([loadDriveConnection(host.id), countEventsOnOwnDrive(host.id)]);
    const status: DriveConnectionStatusDto = {
      connected: connection?.status === "active",
      status: connection ? connection.status : "none",
      email: connection?.google_email ?? null,
      connectedAt: connection?.connected_at ?? null,
      platformDriveAvailable: getPlatformDrive() !== null,
      eventsOnOwnDrive,
    };
    return jsonOk(status);
  } catch (error) {
    return handleRouteError("host:drive:status", error);
  }
}

/**
 * DELETE /api/host/drive — disconnects the host's Google Drive and revokes
 * the token at Google. Refused while events still store media there, because
 * those events would stop working.
 */
export async function DELETE() {
  try {
    const host = await getHostUser();
    if (!host) return jsonError(401, "UNAUTHENTICATED", "Lütfen giriş yapın.");
    const connection = await loadDriveConnection(host.id);
    if (!connection) return jsonOk({ disconnected: true });

    const eventsOnOwnDrive = await countEventsOnOwnDrive(host.id);
    if (eventsOnOwnDrive > 0) {
      return jsonError(
        409,
        "DRIVE_IN_USE",
        `${eventsOnOwnDrive} etkinliğiniz medyasını bu Drive'da saklıyor. Bağlantıyı koparmak bu etkinlikleri çalışmaz hale getirir; önce etkinlikleri silin.`,
      );
    }

    const refreshToken = openRefreshToken(connection);
    const { error } = await getAdminDb().from("drive_connections").delete().eq("owner_id", host.id);
    if (error) throw new Error(error.message);
    forgetDriveAccount(hostAccountKey(host.id));
    if (refreshToken) await revokeGoogleToken(refreshToken);
    return jsonOk({ disconnected: true });
  } catch (error) {
    return handleRouteError("host:drive:disconnect", error);
  }
}
