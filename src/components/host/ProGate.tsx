"use client";

import { Lock, Sparkles } from "lucide-react";

import { BRAND } from "@/lib/brand";
import { useT } from "@/lib/i18n/provider";

/** Small "PRO" pill next to a Pro feature's title. */
export function ProBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full bg-stone-900 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white uppercase ${className}`}>
      <Sparkles className="h-2.5 w-2.5" /> Pro
    </span>
  );
}

/** Shown instead of a Pro feature on the free package. */
export function ProLock({ text }: { text: string }) {
  const t = useT();
  const contact = BRAND.salesContact;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white">
        <Lock className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-medium text-stone-900">{t("Bu özellik Pro pakette")}</p>
        <p className="mt-0.5 text-xs text-stone-600">{text}</p>
        {contact ? (
          <a
            href={contact}
            target={contact.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            className="mt-2 inline-flex rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            {t("Pro’ya geçin")}
          </a>
        ) : (
          <p className="mt-1 text-xs text-stone-500">{t("Pro paketi {brand} ekibi tanımlar; bizimle iletişime geçin.", { brand: BRAND.name })}</p>
        )}
      </div>
    </div>
  );
}
