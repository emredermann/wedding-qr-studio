import { BRAND } from "@/lib/brand";

/**
 * Mira mark: one fine orbit with a single point resting on it — a moment, held.
 * `variant="tile"` draws it on an ink tile (app icon style); `variant="line"`
 * draws only the ring and point in the current text colour.
 */
export function BrandMark({ className = "h-7 w-7", variant = "line" }: { className?: string; variant?: "line" | "tile" }) {
  if (variant === "tile") {
    return (
      <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} role="img" aria-label={BRAND.name}>
        <rect width="64" height="64" rx="14" fill="#1C1B18" />
        <circle cx="32" cy="32" r="16" fill="none" stroke="#F7F5F0" strokeWidth="1.8" />
        <circle cx="43.3" cy="20.7" r="3.6" fill="#F7F5F0" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} role="img" aria-label={BRAND.name}>
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="47.6" cy="16.4" r="4.8" fill="currentColor" />
    </svg>
  );
}

/** Mark + wordmark. Inherits text colour, so it works on light and dark backgrounds. */
export function BrandLogo({ className = "", markClassName = "h-6 w-6", showTagline = false }: {
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark className={markClassName} />
      <span className="flex flex-col leading-none">
        <span className="font-serif text-[1.6em] tracking-[0.01em]">{BRAND.name}</span>
        {showTagline && <span className="mt-1.5 text-[0.62em] tracking-[0.22em] text-stone-500 uppercase">{BRAND.tagline}</span>}
      </span>
    </span>
  );
}
