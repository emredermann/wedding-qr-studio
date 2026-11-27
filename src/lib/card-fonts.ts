import { Caveat, Great_Vibes } from "next/font/google";

/**
 * Handwritten faces for the hand-drawn QR card templates. Only the card
 * designer imports this module, so other pages never download them. The
 * canvas uses them by family name once `document.fonts.load()` resolves.
 */
const caveat = Caveat({ subsets: ["latin", "latin-ext"], weight: ["500", "600"], display: "swap" });
const greatVibes = Great_Vibes({ subsets: ["latin", "latin-ext"], weight: "400", display: "swap" });

export type ScriptFont = "caveat" | "vibes";

/** CSS font-family lists usable in `ctx.font`. */
export const SCRIPT_FAMILY: Record<ScriptFont, string> = {
  caveat: caveat.style.fontFamily,
  vibes: greatVibes.style.fontFamily,
};

/** Weight that looks right for each face. */
export const SCRIPT_WEIGHT: Record<ScriptFont, string> = { caveat: "600", vibes: "400" };

/** Resolves once the handwritten faces are ready for canvas drawing (never rejects). */
export async function loadScriptFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    (Object.keys(SCRIPT_FAMILY) as ScriptFont[]).map((key) =>
      document.fonts.load(`${SCRIPT_WEIGHT[key]} 64px ${SCRIPT_FAMILY[key]}`, "Düğün Anılarınız Burada ğüşıöçİ").catch(() => []),
    ),
  );
}
