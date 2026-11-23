/**
 * Brand kit and share frames. Stored on the event as jsonb (0008
 * migration): `branding` holds small logo images as data URLs (resized in
 * the browser before upload), `share_frame` the frame settings.
 *
 * Frames are only ever drawn on a share/download copy in the browser; the
 * original file in Google Drive is never touched.
 *
 * Dependency-free (zod only) so `node --test` can load it directly.
 */
import { z } from "zod";


/* ------------------------------------------------------------ share frame */

export const FRAME_STYLES = ["none", "classic", "polaroid", "band"] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

export interface ShareFrameSettings {
  style: FrameStyle;
  /** Caption printed on the frame (Pro); null = event name + date. */
  text: string | null;
  /** Guests may save/share framed copies from the gallery. Off unless the host turns it on. */
  guestShare: boolean;
  /** Put the brand logo on the frame (Pro, needs a logo). */
  showLogo: boolean;
}

export const DEFAULT_SHARE_FRAME: ShareFrameSettings = { style: "classic", text: null, guestShare: false, showLogo: true };

export const shareFrameSchema = z.object({
  style: z.enum(FRAME_STYLES),
  text: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => (v ? v : null)),
  guestShare: z.boolean(),
  showLogo: z.boolean(),
});

export function readShareFrame(value: unknown): ShareFrameSettings {
  const parsed = shareFrameSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_SHARE_FRAME };
}

/** What the browser needs to draw a frame (same on every package). */
export type ShareFrameDto = ShareFrameSettings;

/* -------------------------------------------------------------- brand kit */

export const MAX_SPONSORS = 8;
const LOGO_MAX_CHARS = 300_000;
const SPONSOR_MAX_CHARS = 160_000;
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

const logoSchema = (max: number) => z.string().max(max, "Logo çok büyük.").regex(DATA_URL, "Geçersiz görsel.");

export const brandingSchema = z.object({
  logo: logoSchema(LOGO_MAX_CHARS).nullable(),
  sponsors: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9]{4,16}$/),
        name: z.string().trim().min(1).max(60),
        logo: logoSchema(SPONSOR_MAX_CHARS),
      }),
    )
    .max(MAX_SPONSORS, `En fazla ${MAX_SPONSORS} sponsor`),
  sponsorsLabel: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? v : null)),
  showOnLiveWall: z.boolean(),
});

export type BrandingInput = z.infer<typeof brandingSchema>;

/** What the `events.branding` column keeps: metadata only (images live in `event_brand_assets`). */
export interface BrandingMeta {
  hasLogo: boolean;
  sponsors: Array<{ id: string; name: string }>;
  sponsorsLabel: string | null;
  showOnLiveWall: boolean;
  /** Bumped on every save; busts the cache of asset URLs. */
  version: number;
}

const brandingMetaSchema = z.object({
  hasLogo: z.boolean(),
  sponsors: z.array(z.object({ id: z.string(), name: z.string() })).max(MAX_SPONSORS),
  sponsorsLabel: z.string().nullable(),
  showOnLiveWall: z.boolean(),
  version: z.number().int().nonnegative(),
});

export function readBranding(value: unknown): BrandingMeta | null {
  const parsed = brandingMetaSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function brandingMetaFrom(input: BrandingInput, version: number): BrandingMeta {
  return {
    hasLogo: Boolean(input.logo),
    sponsors: input.sponsors.map(({ id, name }) => ({ id, name })),
    sponsorsLabel: input.sponsorsLabel,
    showOnLiveWall: input.showOnLiveWall,
    version,
  };
}

/** Brand kit as guests and hosts see it: image URLs instead of data. */
export interface BrandDto {
  logoUrl: string | null;
  sponsors: Array<{ id: string; name: string; logoUrl: string }>;
  sponsorsLabel: string | null;
  showOnLiveWall: boolean;
}

export function brandAssetUrl(slug: string, asset: string, version: number): string {
  return `/api/events/${encodeURIComponent(slug)}/brand?a=${encodeURIComponent(asset)}&v=${version}`;
}

/** Null when nothing is set. */
export function brandFor(slug: string, branding: BrandingMeta | null): BrandDto | null {
  if (!branding) return null;
  if (!branding.hasLogo && branding.sponsors.length === 0) return null;
  return {
    logoUrl: branding.hasLogo ? brandAssetUrl(slug, "logo", branding.version) : null,
    sponsors: branding.sponsors.map((s) => ({ id: s.id, name: s.name, logoUrl: brandAssetUrl(slug, s.id, branding.version) })),
    sponsorsLabel: branding.sponsorsLabel,
    showOnLiveWall: branding.showOnLiveWall,
  };
}

/** Decodes one stored image (a data URL from `event_brand_assets`) for the asset endpoint. */
export function decodeDataUrl(dataUrl: string | null | undefined): { mime: string; bytes: Uint8Array } | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], bytes: Uint8Array.from(Buffer.from(match[2], "base64")) };
}
