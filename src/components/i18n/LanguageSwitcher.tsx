"use client";

import { LANGS } from "@/lib/i18n/config";
import { useLang, useT } from "@/lib/i18n/provider";

/** "TR | EN" pill. `tone="dark"` for dark backgrounds (live wall, lightbox). */
export function LanguageSwitcher({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  const { lang, setLang } = useLang();
  const t = useT();
  const base = tone === "dark" ? "border-white/20 bg-white/10 text-white/70" : "border-stone-200 bg-white text-stone-500";
  const active = tone === "dark" ? "bg-white text-stone-900" : "bg-stone-900 text-white";
  return (
    <div role="group" aria-label={t("Dil")} className={`inline-flex shrink-0 rounded-full border p-0.5 text-[11px] font-semibold ${base} ${className}`}>
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => code !== lang && setLang(code)}
          aria-pressed={code === lang}
          lang={code}
          title={code === "tr" ? "Türkçe" : "English"}
          className={`rounded-full px-2 py-0.5 uppercase transition ${code === lang ? active : "hover:opacity-80"}`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
