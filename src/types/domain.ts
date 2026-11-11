import type { Challenge, ScheduleItem } from "@/lib/event-extras";

/**
 * Domain types shared by API routes (server) and pages (client).
 * Database rows use snake_case; DTOs sent to the browser use camelCase and
 * never expose Drive folder IDs or guest session IDs.
 */

export const MEDIA_KINDS = ["photo", "video", "audio"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_STATUSES = ["approved", "pending", "hidden"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const DEFAULT_CATEGORIES = ["Hazırlık", "Nikah", "İlk Dans", "Yemek", "After Party"] as const;

export interface EventRow {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  couple_names: string | null;
  event_date: string | null;
  welcome_message: string | null;
  theme_color: string;
  categories: string[];
  uploads_enabled: boolean;
  require_approval: boolean;
  gallery_public: boolean;
  face_search_enabled: boolean;
  guestbook_enabled: boolean;
  drive_folder_id: string;
  drive_photos_folder_id: string;
  drive_videos_folder_id: string;
  drive_voice_folder_id: string;
  /** "app" = platform Drive from the env, "host" = the owner's connected Drive. */
  drive_account: "app" | "host";
  /** jsonb (0002 migration); read through `readSchedule`, may be absent on old schemas. */
  schedule?: unknown;
  /** jsonb (0002 migration); read through `readChallenges`. */
  challenges?: unknown;
  created_at: string;
  updated_at: string;
}

export interface MediaItemRow {
  id: string;
  event_id: string;
  drive_file_id: string;
  kind: MediaKind;
  mime_type: string;
  size_bytes: number;
  original_name: string;
  guest_name: string | null;
  guest_session_id: string | null;
  note: string | null;
  category: string | null;
  is_guestbook: boolean;
  status: MediaStatus;
  width: number | null;
  height: number | null;
  face_count: number;
  /** Photo challenge the guest joined (0002 migration). */
  challenge_id?: string | null;
  published_at: string | null;
  created_at: string;
}

export interface GuestbookMessageRow {
  id: string;
  event_id: string;
  guest_name: string;
  guest_session_id: string | null;
  message: string;
  status: MediaStatus;
  published_at: string | null;
  created_at: string;
}

/** Public event info shown on the guest page and live wall. */
export interface PublicEventDto {
  slug: string;
  title: string;
  coupleNames: string | null;
  eventDate: string | null;
  welcomeMessage: string | null;
  themeColor: string;
  categories: string[];
  uploadsEnabled: boolean;
  requireApproval: boolean;
  galleryPublic: boolean;
  faceSearchEnabled: boolean;
  guestbookEnabled: boolean;
  /** Optional program schedule (empty when the host did not set one). */
  schedule: ScheduleItem[];
  /** Optional photo challenges guests can join while uploading. */
  challenges: Challenge[];
}

/** Host-facing event info (includes Drive links and stats). */
export interface HostEventDto extends PublicEventDto {
  id: string;
  driveFolderUrl: string;
  driveAccount: "app" | "host";
  createdAt: string;
  updatedAt: string;
}

export interface EventStatsDto {
  total: number;
  photos: number;
  videos: number;
  audio: number;
  pending: number;
  hidden: number;
  totalBytes: number;
  guests: number;
  guestbookMessages: number;
  facesIndexed: number;
}

export interface HostEventListItem {
  id: string;
  slug: string;
  title: string;
  coupleNames: string | null;
  eventDate: string | null;
  themeColor: string;
  mediaCount: number;
  createdAt: string;
}

export interface MediaDto {
  id: string;
  fileId: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  guestName: string | null;
  note: string | null;
  category: string | null;
  challengeId: string | null;
  isGuestbook: boolean;
  status: MediaStatus;
  width: number | null;
  height: number | null;
  createdAt: string;
  publishedAt: string | null;
  /** True when the current guest uploaded it (only set on guest endpoints). */
  isMine?: boolean;
}

export interface GuestbookMessageDto {
  id: string;
  guestName: string;
  message: string;
  status: MediaStatus;
  createdAt: string;
  publishedAt: string | null;
}

export interface MediaPage {
  items: MediaDto[];
  nextCursor: string | null;
}

export interface UploadSessionResponse {
  uploadUrl: string;
  uploadToken: string;
  kind: MediaKind;
  mimeType: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, string[]> };
}

/** One file in the in-browser ZIP export manifest. */
export interface ExportItem {
  fileId: string;
  name: string;
  sizeBytes: number;
  folder: string;
  createdAt: string;
}

/** Result of POST /api/host/events/:eventId/media/bulk. */
export interface BulkMediaResponse {
  updated: MediaDto[];
  deletedIds: string[];
  /** Ids that were not found or whose Drive permission change failed. */
  failedIds: string[];
}

/** GET /api/host/drive — the host's own Google Drive connection (tokens never leave the server). */
export interface DriveConnectionStatusDto {
  connected: boolean;
  status: "none" | "active" | "revoked";
  email: string | null;
  connectedAt: string | null;
  /** A platform Drive (env) exists, so hosts may create events without connecting. */
  platformDriveAvailable: boolean;
  /** Events whose media is stored in this host's own Drive. */
  eventsOnOwnDrive: number;
}
