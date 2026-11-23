"use client";

import type { BrandDto } from "@/lib/branding";
import { useT } from "@/lib/i18n/provider";

/** Sponsor logos (Pro brand kit) in a quiet, wrapping row. */
export function SponsorStrip({ brand, className = "" }: { brand: BrandDto | null; className?: string }) {
  const t = useT();
  if (!brand || brand.sponsors.length === 0) return null;
  return (
    <section className={`text-center ${className}`} aria-label={brand.sponsorsLabel || t("Sponsorlar")}>
      <p className="mb-3 text-[10px] font-semibold tracking-[0.25em] text-stone-400 uppercase">{brand.sponsorsLabel || t("Sponsorlar")}</p>
      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {brand.sponsors.map((s) => (
          <li key={s.id}>
            <img src={s.logoUrl} alt={s.name} title={s.name} className="h-8 max-w-[7rem] object-contain opacity-80" loading="lazy" />
          </li>
        ))}
      </ul>
    </section>
  );
}
