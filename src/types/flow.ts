/**
 * Strict TypeScript definitions for Task 5:
 * Per-Event Dynamic Screen, Theme, and Guest Onboarding Flow Builder.
 */

export const THEME_FONTS = ["serif", "sans", "mono", "display"] as const;
export type ThemeFontFamily = (typeof THEME_FONTS)[number];

export const BUTTON_STYLES = ["rounded", "pill", "sharp"] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export const GALLERY_LAYOUTS = ["masonry", "grid", "carousel"] as const;
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number];

export interface EventThemeConfig {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: ThemeFontFamily;
  logoUrl: string | null;
  coverMediaUrl: string | null;
  buttonStyle: ButtonStyle;
  galleryLayout: GalleryLayout;
}

export const FLOW_STEP_TYPES = [
  "welcome_splash",
  "guest_registration",
  "biometric_opt_in",
  "main_hub",
] as const;
export type FlowStepType = (typeof FLOW_STEP_TYPES)[number];

export interface WelcomeSplashSettings {
  headline: string;
  subtitle: string;
  ctaText: string;
  showEventDate: boolean;
}

export interface GuestRegistrationSettings {
  title: string;
  subtitle: string;
  mandatory: boolean;
  askName: boolean;
  askContact: boolean;
  contactLabel: string;
  askTableNumber: boolean;
  submitText: string;
  skipText: string;
}

export interface BiometricOptInSettings {
  title: string;
  subtitle: string;
  ctaScanText: string;
  skipText: string;
}

export interface MainHubSettings {
  welcomeBanner: string;
  uploadCtaText: string;
}

export type FlowStepBase<T extends FlowStepType, S> = {
  id: string;
  type: T;
  enabled: boolean;
  title: string;
  settings: S;
};

export type WelcomeSplashStep = FlowStepBase<"welcome_splash", WelcomeSplashSettings>;
export type GuestRegistrationStep = FlowStepBase<"guest_registration", GuestRegistrationSettings>;
export type BiometricOptInStep = FlowStepBase<"biometric_opt_in", BiometricOptInSettings>;
export type MainHubStep = FlowStepBase<"main_hub", MainHubSettings>;

export type FlowStepConfig =
  | WelcomeSplashStep
  | GuestRegistrationStep
  | BiometricOptInStep
  | MainHubStep;

export interface FeatureToggles {
  enablePhotoUpload: boolean;
  enableVideoUpload: boolean;
  enableVoiceToasts: boolean;
  enableFaceRecognition: boolean;
  enableLiveSlideshow: boolean;
  requireModerationBeforePublic: boolean;
  maxUploadSizeMb: number;
}

export interface EventFlowConfig {
  steps: FlowStepConfig[];
  features: FeatureToggles;
}

export const DEFAULT_THEME_CONFIG: EventThemeConfig = {
  primaryColor: "#b45309", // warm amber-700
  backgroundColor: "#fafaf9", // stone-50
  textColor: "#1c1917", // stone-900
  fontFamily: "serif",
  logoUrl: null,
  coverMediaUrl: null,
  buttonStyle: "pill",
  galleryLayout: "masonry",
};

export const DEFAULT_FEATURE_TOGGLES: FeatureToggles = {
  enablePhotoUpload: true,
  enableVideoUpload: true,
  enableVoiceToasts: true,
  enableFaceRecognition: true,
  enableLiveSlideshow: true,
  requireModerationBeforePublic: false,
  maxUploadSizeMb: 250,
};

export const DEFAULT_FLOW_CONFIG: EventFlowConfig = {
  steps: [
    {
      id: "step_welcome_splash",
      type: "welcome_splash",
      enabled: true,
      title: "Welcome Splash",
      settings: {
        headline: "Welcome to Our Wedding",
        subtitle: "Capture and share every candid moment with us tonight.",
        ctaText: "Enter Celebration",
        showEventDate: true,
      },
    },
    {
      id: "step_guest_registration",
      type: "guest_registration",
      enabled: true,
      title: "Guest Sign-In",
      settings: {
        title: "Sign the Digital Guestbook",
        subtitle: "Let us know who is sharing these memories.",
        mandatory: false,
        askName: true,
        askContact: true,
        contactLabel: "WhatsApp / Email (for your photo gallery link)",
        askTableNumber: true,
        submitText: "Continue",
        skipText: "Skip for now",
      },
    },
    {
      id: "step_biometric_opt_in",
      type: "biometric_opt_in",
      enabled: true,
      title: "Instant Face Match",
      settings: {
        title: "Find Every Photo of Yourself",
        subtitle:
          "Take a quick selfie to automatically filter the wedding gallery for photos you appear in.",
        ctaScanText: "Scan My Face",
        skipText: "Maybe later",
      },
    },
    {
      id: "step_main_hub",
      type: "main_hub",
      enabled: true,
      title: "Main Event Hub",
      settings: {
        welcomeBanner: "Share your photos, videos & voice toasts below",
        uploadCtaText: "Add Photos & Videos",
      },
    },
  ],
  features: DEFAULT_FEATURE_TOGGLES,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function asHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : fallback;
}

function asSafeUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Safely normalises raw JSONB `theme_config` from Postgres into a complete
 * `EventThemeConfig` with guaranteed fallbacks.
 */
export function normalizeThemeConfig(raw: unknown): EventThemeConfig {
  if (!isRecord(raw)) return { ...DEFAULT_THEME_CONFIG };

  const font = raw.fontFamily;
  const fontFamily: ThemeFontFamily =
    typeof font === "string" && (THEME_FONTS as readonly string[]).includes(font)
      ? (font as ThemeFontFamily)
      : DEFAULT_THEME_CONFIG.fontFamily;

  const btn = raw.buttonStyle;
  const buttonStyle: ButtonStyle =
    typeof btn === "string" && (BUTTON_STYLES as readonly string[]).includes(btn)
      ? (btn as ButtonStyle)
      : DEFAULT_THEME_CONFIG.buttonStyle;

  const layout = raw.galleryLayout;
  const galleryLayout: GalleryLayout =
    typeof layout === "string" && (GALLERY_LAYOUTS as readonly string[]).includes(layout)
      ? (layout as GalleryLayout)
      : DEFAULT_THEME_CONFIG.galleryLayout;

  return {
    primaryColor: asHexColor(raw.primaryColor, DEFAULT_THEME_CONFIG.primaryColor),
    backgroundColor: asHexColor(raw.backgroundColor, DEFAULT_THEME_CONFIG.backgroundColor),
    textColor: asHexColor(raw.textColor, DEFAULT_THEME_CONFIG.textColor),
    fontFamily,
    logoUrl: asSafeUrlOrNull(raw.logoUrl),
    coverMediaUrl: asSafeUrlOrNull(raw.coverMediaUrl),
    buttonStyle,
    galleryLayout,
  };
}

function parseHexRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length === 3) {
    return [
      Number.parseInt(cleaned[0] + cleaned[0], 16) || 0,
      Number.parseInt(cleaned[1] + cleaned[1], 16) || 0,
      Number.parseInt(cleaned[2] + cleaned[2], 16) || 0,
    ];
  }
  return [
    Number.parseInt(cleaned.slice(0, 2), 16) || 0,
    Number.parseInt(cleaned.slice(2, 4), 16) || 0,
    Number.parseInt(cleaned.slice(4, 6), 16) || 0,
  ];
}

function getRelativeLuminance(hex: string): number {
  const [r, g, b] = parseHexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = getRelativeLuminance(hexA);
  const l2 = getRelativeLuminance(hexB);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Generates deterministic, contrast-verified CSS custom properties for
 * `theme_config` so the server shell and client components render with zero
 * FOUC, zero layout shift (CLS), and guaranteed dark/light readability.
 */
export function buildThemeCssVariables(theme: EventThemeConfig): Record<string, string> {
  const fontStack =
    theme.fontFamily === "serif" || theme.fontFamily === "display"
      ? "Georgia, 'Playfair Display', 'Times New Roman', serif"
      : theme.fontFamily === "mono"
        ? "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace"
        : "var(--font-geist-sans), system-ui, -apple-system, sans-serif";

  const radius =
    theme.buttonStyle === "pill"
      ? "9999px"
      : theme.buttonStyle === "sharp"
        ? "0px"
        : "0.875rem";

  const bgLuminance = getRelativeLuminance(theme.backgroundColor);
  const isDarkBg = bgLuminance < 0.22;
  const safeText =
    getContrastRatio(theme.textColor, theme.backgroundColor) >= 4.5
      ? theme.textColor
      : isDarkBg
        ? "#faf8f5"
        : "#1c1917";

  const primaryLuminance = getRelativeLuminance(theme.primaryColor);
  const primaryFg = primaryLuminance > 0.42 ? "#18181b" : "#ffffff";

  return {
    "--event-primary": theme.primaryColor,
    "--event-primary-fg": primaryFg,
    "--event-primary-soft": `${theme.primaryColor}1f`,
    "--event-primary-border": `${theme.primaryColor}38`,
    "--event-bg": theme.backgroundColor,
    "--event-text": safeText,
    "--event-surface": isDarkBg ? "rgba(28, 25, 23, 0.9)" : "rgba(255, 255, 255, 0.92)",
    "--event-surface-text": isDarkBg ? "#faf8f5" : "#1c1917",
    "--event-font": fontStack,
    "--event-radius": radius,
  };
}

function normalizeStep(raw: unknown): FlowStepConfig | null {
  if (!isRecord(raw) || typeof raw.type !== "string") return null;
  const settings = isRecord(raw.settings) ? raw.settings : {};

  switch (raw.type) {
    case "welcome_splash": {
      const def = DEFAULT_FLOW_CONFIG.steps[0] as WelcomeSplashStep;
      return {
        id: asString(raw.id, def.id),
        type: "welcome_splash",
        enabled: asBoolean(raw.enabled, def.enabled),
        title: asString(raw.title, def.title),
        settings: {
          headline: asString(settings.headline, def.settings.headline),
          subtitle: asString(settings.subtitle, def.settings.subtitle),
          ctaText: asString(settings.ctaText, def.settings.ctaText),
          showEventDate: asBoolean(settings.showEventDate, def.settings.showEventDate),
        },
      };
    }
    case "guest_registration": {
      const def = DEFAULT_FLOW_CONFIG.steps[1] as GuestRegistrationStep;
      return {
        id: asString(raw.id, def.id),
        type: "guest_registration",
        enabled: asBoolean(raw.enabled, def.enabled),
        title: asString(raw.title, def.title),
        settings: {
          title: asString(settings.title, def.settings.title),
          subtitle: asString(settings.subtitle, def.settings.subtitle),
          mandatory: asBoolean(settings.mandatory, def.settings.mandatory),
          askName: asBoolean(settings.askName, def.settings.askName),
          askContact: asBoolean(settings.askContact, def.settings.askContact),
          contactLabel: asString(settings.contactLabel, def.settings.contactLabel),
          askTableNumber: asBoolean(settings.askTableNumber, def.settings.askTableNumber),
          submitText: asString(settings.submitText, def.settings.submitText),
          skipText: asString(settings.skipText, def.settings.skipText),
        },
      };
    }
    case "biometric_opt_in": {
      const def = DEFAULT_FLOW_CONFIG.steps[2] as BiometricOptInStep;
      return {
        id: asString(raw.id, def.id),
        type: "biometric_opt_in",
        enabled: asBoolean(raw.enabled, def.enabled),
        title: asString(raw.title, def.title),
        settings: {
          title: asString(settings.title, def.settings.title),
          subtitle: asString(settings.subtitle, def.settings.subtitle),
          ctaScanText: asString(settings.ctaScanText, def.settings.ctaScanText),
          skipText: asString(settings.skipText, def.settings.skipText),
        },
      };
    }
    case "main_hub": {
      const def = DEFAULT_FLOW_CONFIG.steps[3] as MainHubStep;
      return {
        id: asString(raw.id, def.id),
        type: "main_hub",
        enabled: true, // main_hub is always enabled as the terminal step
        title: asString(raw.title, def.title),
        settings: {
          welcomeBanner: asString(settings.welcomeBanner, def.settings.welcomeBanner),
          uploadCtaText: asString(settings.uploadCtaText, def.settings.uploadCtaText),
        },
      };
    }
    default:
      return null;
  }
}

/**
 * Safely normalises raw JSONB `flow_config` from Postgres into a complete
 * `EventFlowConfig`. Preserves custom step ordering while guaranteeing every
 * step type exists exactly once and `main_hub` is enabled.
 */
export function normalizeFlowConfig(raw: unknown): EventFlowConfig {
  if (!isRecord(raw)) {
    return {
      steps: DEFAULT_FLOW_CONFIG.steps.map((s) => ({ ...s })),
      features: { ...DEFAULT_FEATURE_TOGGLES },
    };
  }

  const rawFeatures = isRecord(raw.features) ? raw.features : {};
  const features: FeatureToggles = {
    enablePhotoUpload: asBoolean(
      rawFeatures.enablePhotoUpload,
      DEFAULT_FEATURE_TOGGLES.enablePhotoUpload,
    ),
    enableVideoUpload: asBoolean(
      rawFeatures.enableVideoUpload,
      DEFAULT_FEATURE_TOGGLES.enableVideoUpload,
    ),
    enableVoiceToasts: asBoolean(
      rawFeatures.enableVoiceToasts,
      DEFAULT_FEATURE_TOGGLES.enableVoiceToasts,
    ),
    enableFaceRecognition: asBoolean(
      rawFeatures.enableFaceRecognition,
      DEFAULT_FEATURE_TOGGLES.enableFaceRecognition,
    ),
    enableLiveSlideshow: asBoolean(
      rawFeatures.enableLiveSlideshow,
      DEFAULT_FEATURE_TOGGLES.enableLiveSlideshow,
    ),
    requireModerationBeforePublic: asBoolean(
      rawFeatures.requireModerationBeforePublic,
      DEFAULT_FEATURE_TOGGLES.requireModerationBeforePublic,
    ),
    maxUploadSizeMb: asNumber(
      rawFeatures.maxUploadSizeMb,
      DEFAULT_FEATURE_TOGGLES.maxUploadSizeMb,
      5,
      2048,
    ),
  };

  const seen = new Set<FlowStepType>();
  const steps: FlowStepConfig[] = [];

  if (Array.isArray(raw.steps)) {
    for (const item of raw.steps) {
      const parsed = normalizeStep(item);
      if (parsed && !seen.has(parsed.type)) {
        seen.add(parsed.type);
        steps.push(parsed);
      }
    }
  }

  for (const def of DEFAULT_FLOW_CONFIG.steps) {
    if (!seen.has(def.type)) {
      steps.push(def);
    }
  }

  return { steps, features };
}
