/**
 * Shared type scale and form styles, so every screen uses the same sizes.
 *
 * - One typeface everywhere (Geist). `font-serif` is kept as the class name
 *   for large display headings (medium weight, tighter tracking; see
 *   globals.css); only the Mira wordmark uses the brand font (`font-brand`).
 * - Section/card headings: semibold, text-base.
 * - Inputs are 16px on phones (iOS zooms into smaller inputs) and 14px from `sm`.
 */
export const ui = {
  /** Heading of a card or section inside a page. */
  sectionTitle: "text-base font-semibold text-stone-900",
  /** Small caption above a form control. */
  label: "mb-1.5 block text-xs font-semibold text-stone-600",
  /** Helper text under a heading or control. */
  hint: "text-xs leading-relaxed text-stone-500",
  /** Text input, select and textarea. */
  input:
    "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-stone-500 sm:text-sm",
  /** Compact input for dense editors (programme rows, card designer). */
  inputCompact:
    "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-stone-500 sm:text-sm",
  /** Checkbox: fixed size, never squeezed by long labels. */
  checkbox: "h-5 w-5 shrink-0 cursor-pointer accent-stone-900",
  /** White rounded card. */
  card: "rounded-3xl border border-stone-200 bg-white p-5",
} as const;
