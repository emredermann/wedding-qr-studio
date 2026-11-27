import { Cormorant_Garamond, Great_Vibes } from "next/font/google";

/**
 * Typefaces of the invitation templates. Only invitation screens import this
 * module, so other pages never download them. "display" is the app-wide
 * Instrument Serif (--font-display) and "sans" is Geist.
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});
const vibes = Great_Vibes({ subsets: ["latin", "latin-ext"], weight: "400", display: "swap" });

export const INVITE_FAMILY = {
  serif: cormorant.style.fontFamily,
  script: vibes.style.fontFamily,
  display: "var(--font-display), Georgia, serif",
  sans: "var(--font-geist-sans), system-ui, sans-serif",
} as const;
