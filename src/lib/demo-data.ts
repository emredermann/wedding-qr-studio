import type {
  AdminEventMetric,
  Album,
  GuestFaceMatch,
  Media,
  PublicAlbum,
} from "@/types/database";
import { DEFAULT_FLOW_CONFIG, DEFAULT_THEME_CONFIG } from "@/types/flow";

export const DEMO_ALBUM_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_ALBUM_SLUG = "demo-wedding";
export const DEMO_OWNER_ID = "00000000-0000-4000-8000-000000000099";

export const DEMO_PUBLIC_ALBUM: PublicAlbum = {
  id: DEMO_ALBUM_ID,
  slug: DEMO_ALBUM_SLUG,
  title: "Clara & Julian — Villa Aurelia, Rome",
  event_date: "2026-06-20",
  privacy_mode: "public",
  reveal_at: null,
  expires_at: "2028-06-20T23:59:59.000Z",
  theme_config: {
    ...DEFAULT_THEME_CONFIG,
    primaryColor: "#9a3412",
    backgroundColor: "#faf8f5",
    textColor: "#1c1917",
    fontFamily: "serif",
    buttonStyle: "pill",
    galleryLayout: "masonry",
  },
  flow_config: DEFAULT_FLOW_CONFIG,
};

export const DEMO_FULL_ALBUM: Album = {
  ...DEMO_PUBLIC_ALBUM,
  owner_id: DEMO_OWNER_ID,
  plan_tier: "unlimited",
  is_paid: true,
  created_at: "2026-05-01T10:00:00.000Z",
};

export const DEMO_MEDIA_ITEMS: Media[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    album_id: DEMO_ALBUM_ID,
    file_key: `albums/${DEMO_ALBUM_ID}/ceremony-vows.jpg`,
    file_url:
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=85",
    media_type: "photo",
    mime_type: "image/jpeg",
    size_bytes: 2_845_120,
    guest_name: "Elena Rossi",
    guest_session_id: "demo-guest-1",
    category: "ceremony",
    phash: "f0e8c8c0f0f8f0e0",
    is_hidden: false,
    created_at: "2026-06-20T16:15:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    album_id: DEMO_ALBUM_ID,
    file_key: `albums/${DEMO_ALBUM_ID}/ceremony-vows-dup.jpg`,
    file_url:
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1180&q=80",
    media_type: "photo",
    mime_type: "image/jpeg",
    size_bytes: 2_610_400,
    guest_name: "Elena Rossi",
    guest_session_id: "demo-guest-1",
    category: "ceremony",
    phash: "f0e8c8c0f0f8f0e1", // Near-identical perceptual hash (1-bit Hamming distance)
    is_hidden: false,
    created_at: "2026-06-20T16:15:08.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    album_id: DEMO_ALBUM_ID,
    file_key: `albums/${DEMO_ALBUM_ID}/getting-ready-suite.jpg`,
    file_url:
      "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=85",
    media_type: "photo",
    mime_type: "image/jpeg",
    size_bytes: 3_120_000,
    guest_name: "Sophie Laurent",
    guest_session_id: "demo-guest-2",
    category: "getting_ready",
    phash: "3c7e7e7e3c3c1818",
    is_hidden: false,
    created_at: "2026-06-20T13:40:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    album_id: DEMO_ALBUM_ID,
    file_key: `albums/${DEMO_ALBUM_ID}/reception-toast.jpg`,
    file_url:
      "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=85",
    media_type: "photo",
    mime_type: "image/jpeg",
    size_bytes: 3_540_900,
    guest_name: "Marcus Vance",
    guest_session_id: "demo-guest-3",
    category: "reception",
    phash: "a5a55a5ac3c33c3c",
    is_hidden: false,
    created_at: "2026-06-20T19:30:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000105",
    album_id: DEMO_ALBUM_ID,
    file_key: `albums/${DEMO_ALBUM_ID}/garden-venue.jpg`,
    file_url:
      "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=85",
    media_type: "photo",
    mime_type: "image/jpeg",
    size_bytes: 4_110_200,
    guest_name: "Luca Moretti",
    guest_session_id: "demo-guest-4",
    category: "venue",
    phash: "0f1f3f7f7f3f1f0f",
    is_hidden: false,
    created_at: "2026-06-20T15:10:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000106",
    album_id: DEMO_ALBUM_ID,
    file_key: `albums/${DEMO_ALBUM_ID}/dancefloor-sparklers.jpg`,
    file_url:
      "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1200&q=85",
    media_type: "photo",
    mime_type: "image/jpeg",
    size_bytes: 3_890_000,
    guest_name: "Aria Chen",
    guest_session_id: "demo-guest-5",
    category: "party",
    phash: "9966996666996699",
    is_hidden: false,
    created_at: "2026-06-20T22:05:00.000Z",
  },
];

export function getDemoFaceMatches(): GuestFaceMatch[] {
  return DEMO_MEDIA_ITEMS.slice(0, 3).map((item, idx) => ({
    media_id: item.id,
    file_key: item.file_key,
    file_url: item.file_url,
    media_type: item.media_type,
    category: item.category,
    guest_name: item.guest_name,
    created_at: item.created_at,
    similarity: Number((0.94 - idx * 0.06).toFixed(2)),
  }));
}

export function getDemoAdminMetrics(): AdminEventMetric[] {
  const secondAlbum: Album = {
    id: "00000000-0000-4000-8000-000000000002",
    owner_id: DEMO_OWNER_ID,
    slug: "amalfi-welcome-dinner",
    title: "Sofia & Matteo — Amalfi Welcome Sunset",
    event_date: "2026-08-14",
    plan_tier: "pro",
    privacy_mode: "public",
    reveal_at: "2026-08-15T10:00:00.000Z",
    is_paid: true,
    expires_at: "2028-08-14T23:59:59.000Z",
    theme_config: {
      ...DEFAULT_THEME_CONFIG,
      primaryColor: "#0369a1",
      backgroundColor: "#f8fafc",
      textColor: "#0f172a",
      fontFamily: "display",
      buttonStyle: "rounded",
      galleryLayout: "grid",
    },
    flow_config: DEFAULT_FLOW_CONFIG,
    created_at: "2026-05-12T14:20:00.000Z",
  };

  return [
    {
      album: DEMO_FULL_ALBUM,
      mediaCount: 412,
      photoCount: 368,
      videoCount: 31,
      audioCount: 13,
      facesIndexedCount: 1_184,
      storageBytes: 6_842_150_912,
      guestRegistrationCount: 148,
    },
    {
      album: secondAlbum,
      mediaCount: 189,
      photoCount: 164,
      videoCount: 18,
      audioCount: 7,
      facesIndexedCount: 520,
      storageBytes: 2_915_041_280,
      guestRegistrationCount: 76,
    },
  ];
}
