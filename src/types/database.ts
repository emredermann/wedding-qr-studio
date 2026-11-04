import type { EventFlowConfig, EventThemeConfig } from "@/types/flow";

/**
 * Strict type definitions for Lumina: database tables, RPCs and
 * API payloads across Tasks 1–5.
 *
 * Domain entities are declared as interfaces (`Album`, `Media`, `MediaFace`,
 * `CoHost`, `Profile`, `GuestRegistration`). Supabase's generic requires
 * `Record<string, unknown>`-compatible row types, so `Database` wraps them
 * with the `Row<T>` mapped type.
 */

// =============================================================================
// Primitives & enums
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** ISO-8601 timestamp (timestamptz). */
export type Timestamp = string;
/** ISO-8601 date (YYYY-MM-DD). */
export type DateString = string;
export type UUID = string;
/** pgvector literal, e.g. "[0.12,-0.04,...]". */
export type VectorString = string;

export const PLAN_TIERS = ["starter", "pro", "unlimited"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PRIVACY_MODES = ["public", "private"] as const;
export type PrivacyMode = (typeof PRIVACY_MODES)[number];

export const MEDIA_TYPES = ["photo", "video", "audio"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_CATEGORIES = [
  "getting_ready",
  "ceremony",
  "reception",
  "party",
  "venue",
  "general",
] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

// =============================================================================
// Table entities
// =============================================================================

export interface Profile {
  id: UUID;
  email: string | null;
  display_name: string | null;
  is_super_admin: boolean;
  created_at: Timestamp;
}

export interface ProfileInsert {
  id: UUID;
  email?: string | null;
  display_name?: string | null;
  is_super_admin?: boolean;
  created_at?: Timestamp;
}

export interface ProfileUpdate {
  display_name?: string | null;
  is_super_admin?: boolean;
}

export interface Album {
  id: UUID;
  owner_id: UUID;
  slug: string;
  title: string;
  event_date: DateString | null;
  plan_tier: PlanTier;
  privacy_mode: PrivacyMode;
  /** Disposable Camera mode: guest gallery locked until this instant. */
  reveal_at: Timestamp | null;
  is_paid: boolean;
  expires_at: Timestamp;
  theme_config: EventThemeConfig;
  flow_config: EventFlowConfig;
  created_at: Timestamp;
}

export interface AlbumInsert {
  id?: UUID;
  owner_id: UUID;
  slug: string;
  title: string;
  event_date?: DateString | null;
  plan_tier?: PlanTier;
  privacy_mode?: PrivacyMode;
  reveal_at?: Timestamp | null;
  is_paid?: boolean;
  expires_at?: Timestamp;
  theme_config?: EventThemeConfig;
  flow_config?: EventFlowConfig;
  created_at?: Timestamp;
}

export interface AlbumUpdate {
  slug?: string;
  title?: string;
  event_date?: DateString | null;
  privacy_mode?: PrivacyMode;
  reveal_at?: Timestamp | null;
  theme_config?: EventThemeConfig;
  flow_config?: EventFlowConfig;
  /** Service role only (billing / super-admin override). */
  plan_tier?: PlanTier;
  /** Service role only (billing / super-admin override). */
  is_paid?: boolean;
  /** Service role only (billing / super-admin override). */
  expires_at?: Timestamp;
}

export interface Media {
  id: UUID;
  album_id: UUID;
  file_key: string;
  file_url: string;
  media_type: MediaType;
  mime_type: string;
  size_bytes: number;
  guest_name: string | null;
  guest_session_id: string | null;
  category: MediaCategory;
  /** 64-bit perceptual hash, 16 lowercase hex chars. */
  phash: string | null;
  is_hidden: boolean;
  created_at: Timestamp;
  /** Set once when the uploading guest session attaches face embeddings. */
  faces_indexed_at?: Timestamp | null;
}

export interface MediaInsert {
  id?: UUID;
  album_id: UUID;
  file_key: string;
  file_url: string;
  media_type: MediaType;
  mime_type: string;
  size_bytes: number;
  guest_name?: string | null;
  guest_session_id?: string | null;
  category?: MediaCategory;
  phash?: string | null;
  is_hidden?: boolean;
  created_at?: Timestamp;
}

export interface MediaUpdate {
  is_hidden?: boolean;
  category?: MediaCategory;
  phash?: string | null;
  faces_indexed_at?: Timestamp | null;
}

export interface MediaFace {
  id: UUID;
  album_id: UUID;
  media_id: UUID;
  embedding: VectorString;
  created_at: Timestamp;
}

export interface MediaFaceInsert {
  id?: UUID;
  album_id: UUID;
  media_id: UUID;
  embedding: VectorString;
  created_at?: Timestamp;
}

export interface CoHost {
  id: UUID;
  album_id: UUID;
  /** Lower-cased, trimmed email. */
  email: string;
  created_at: Timestamp;
}

export interface CoHostInsert {
  id?: UUID;
  album_id: UUID;
  email: string;
  created_at?: Timestamp;
}

export interface GuestRegistration {
  id: UUID;
  album_id: UUID;
  guest_session_id: string;
  guest_name: string | null;
  contact: string | null;
  table_number: string | null;
  /** Explicit GDPR/KVKK consent timestamp; required whenever `contact` is set. */
  contact_consent_at: Timestamp | null;
  created_at: Timestamp;
}

export interface GuestRegistrationInsert {
  id?: UUID;
  album_id: UUID;
  guest_session_id: string;
  guest_name?: string | null;
  contact?: string | null;
  table_number?: string | null;
  contact_consent_at?: Timestamp | null;
  created_at?: Timestamp;
}

export interface GuestRegistrationUpdate {
  guest_name?: string | null;
  contact?: string | null;
  table_number?: string | null;
  contact_consent_at?: Timestamp | null;
}

// =============================================================================
// RPC types
// =============================================================================

export interface GetPublicAlbumArgs {
  p_slug: string;
}

export interface PublicAlbum {
  id: UUID;
  slug: string;
  title: string;
  event_date: DateString | null;
  privacy_mode: PrivacyMode;
  reveal_at: Timestamp | null;
  expires_at: Timestamp;
  theme_config: EventThemeConfig;
  flow_config: EventFlowConfig;
}

export interface MatchGuestFacesArgs {
  query_embedding: VectorString;
  target_album_id: UUID;
  /** Cosine similarity floor; clamped server-side to [0.78, 0.99], default 0.82. */
  match_threshold?: number;
  /** Max rows (1–200), default 100. */
  match_count?: number;
}

/**
 * Row returned by `match_guest_faces` (service role only). Deliberately
 * contains no uploader identity and no permanent URL.
 */
export interface GuestFaceMatchRow {
  media_id: UUID;
  file_key: string;
  media_type: MediaType;
  category: MediaCategory;
  created_at: Timestamp;
  similarity: number;
}

export interface GuestFaceMatch extends GuestFaceMatchRow {
  file_url: string;
  guest_name: string | null;
}

export interface ConsumeRateLimitArgs {
  p_bucket: string;
  p_limit: number;
  p_window_seconds: number;
}

export interface ConsumeRateLimitRow {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
}

export interface AlbumIdArgs {
  p_album_id: UUID;
}

/** Exception messages raised by our PL/pgSQL functions (errcode P0001). */
export type DatabaseErrorCode =
  | "INVALID_ARGUMENTS"
  | "ALBUM_NOT_ACCESSIBLE"
  | "MEDIA_FACES_CAP_REACHED";

// =============================================================================
// Supabase `Database` generic
// =============================================================================

/** Converts an interface into an index-signature-compatible object type. */
type Row<T> = { [K in keyof T]: T[K] };

type Relationship<Name extends string, Column extends string, Ref extends string> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Ref;
  referencedColumns: ["id"];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Row<Profile>;
        Insert: Row<ProfileInsert>;
        Update: Row<ProfileUpdate>;
        Relationships: [];
      };
      albums: {
        Row: Row<Album>;
        Insert: Row<AlbumInsert>;
        Update: Row<AlbumUpdate>;
        Relationships: [];
      };
      co_hosts: {
        Row: Row<CoHost>;
        Insert: Row<CoHostInsert>;
        Update: Record<string, never>;
        Relationships: [Relationship<"co_hosts_album_id_fkey", "album_id", "albums">];
      };
      media: {
        Row: Row<Media>;
        Insert: Row<MediaInsert>;
        Update: Row<MediaUpdate>;
        Relationships: [Relationship<"media_album_id_fkey", "album_id", "albums">];
      };
      media_faces: {
        Row: Row<MediaFace>;
        Insert: Row<MediaFaceInsert>;
        Update: Record<string, never>;
        Relationships: [
          Relationship<"media_faces_album_id_fkey", "album_id", "albums">,
          Relationship<"media_faces_media_id_fkey", "media_id", "media">,
        ];
      };
      guest_registrations: {
        Row: Row<GuestRegistration>;
        Insert: Row<GuestRegistrationInsert>;
        Update: Row<GuestRegistrationUpdate>;
        Relationships: [
          Relationship<"guest_registrations_album_id_fkey", "album_id", "albums">,
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_public_album: {
        Args: Row<GetPublicAlbumArgs>;
        Returns: Row<PublicAlbum>[];
      };
      match_guest_faces: {
        Args: Row<MatchGuestFacesArgs>;
        Returns: Row<GuestFaceMatchRow>[];
      };
      consume_rate_limit: {
        Args: Row<ConsumeRateLimitArgs>;
        Returns: Row<ConsumeRateLimitRow>[];
      };
      is_album_owner: { Args: Row<AlbumIdArgs>; Returns: boolean };
      can_manage_album: { Args: Row<AlbumIdArgs>; Returns: boolean };
      is_album_publicly_visible: { Args: Row<AlbumIdArgs>; Returns: boolean };
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

// =============================================================================
// API payloads
// =============================================================================

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "ALBUM_NOT_FOUND"
  | "ALBUM_EXPIRED"
  | "ALBUM_LIMIT_REACHED"
  | "SLUG_TAKEN"
  | "FEATURE_DISABLED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "UPLOAD_NOT_FOUND"
  | "UPLOAD_MISMATCH"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level validation messages keyed by dotted path. */
    details?: Record<string, string[]>;
  };
}

/** POST /api/upload/presign */
export interface PresignUploadRequest {
  albumId: UUID;
  fileName: string;
  /** Browser-reported MIME type; parameters (e.g. ";codecs=opus") are allowed. */
  fileType: string;
  fileSize: number;
}

export interface PresignUploadResponse {
  /** Presigned R2 URL, valid for `expiresIn` seconds. */
  uploadUrl: string;
  method: "PUT";
  /** Send exactly these headers with the PUT (they are part of the signature). */
  headers: { "Content-Type": string };
  fileKey: string;
  publicUrl: string;
  mediaType: MediaType;
  expiresIn: number;
  expiresAt: Timestamp;
}

/** POST /api/upload/complete — registers an uploaded object as a media row. */
export interface CompleteUploadRequest {
  albumId: UUID;
  fileKey: string;
  guestName?: string | null;
  guestSessionId?: string | null;
  category?: MediaCategory;
  phash?: string | null;
}

export interface CompleteUploadResponse {
  media: Media;
  /** False when the object was already registered (idempotent retry). */
  created: boolean;
}

/** POST /api/faces/index — stores 128-d face embeddings for an uploaded photo. */
export interface IndexFacesRequest {
  albumId: UUID;
  mediaId: UUID;
  embeddings: number[][];
}

export interface IndexFacesResponse {
  indexedCount: number;
}

/** POST /api/faces/match — searches an album by a 128-d face descriptor. */
export interface MatchFacesRequest {
  albumId: UUID;
  embedding: number[];
  threshold?: number;
}

export interface MatchFacesResponse {
  matches: GuestFaceMatch[];
}

/**
 * GET /api/events/[slug] — public guest event payload.
 *
 * ZERO PUBLIC GALLERY MANDATE:
 * Standard guests NEVER receive an open feed of other attendees' media.
 * `myUploads` contains only the media uploaded by this verified guest session;
 * photos containing the guest's face are retrieved exclusively via
 * `POST /api/faces/match` (`match_guest_faces` RPC).
 */
export interface GuestEventPayload {
  album: PublicAlbum;
  isGalleryLocked: boolean;
  lockReason: "private" | "disposable_camera" | null;
  myUploads: Media[];
  guestSessionId: string;
  registration?: {
    guestName: string | null;
    contact: string | null;
    tableNumber: string | null;
  } | null;
}

/** POST /api/webhooks/process-media */
export interface ProcessMediaWebhookRequest {
  mediaId: UUID;
  albumId: UUID;
  fileUrl: string;
  clientPhash?: string | null;
}

export interface ProcessMediaWebhookResponse {
  mediaId: UUID;
  category: MediaCategory;
  phash: string | null;
  duplicateOfMediaId: UUID | null;
}

/** POST /api/checkout */
export interface CheckoutSessionRequest {
  albumId: UUID;
  planTier: PlanTier;
}

export interface CheckoutSessionResponse {
  checkoutUrl: string;
  sessionId: string;
  mode: "stripe" | "simulated_signed";
}

/** Admin overview item (Task 5 Master Super-Admin Dashboard) */
export interface AdminEventMetric {
  album: Album;
  mediaCount: number;
  photoCount: number;
  videoCount: number;
  audioCount: number;
  facesIndexedCount: number;
  storageBytes: number;
  guestRegistrationCount: number;
}
