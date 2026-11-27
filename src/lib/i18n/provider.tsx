"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, LOCALE, type Lang } from "@/lib/i18n/config";
import { translate, type MsgKey, type Vars } from "@/lib/i18n/translate";

export type TFunction = (key: MsgKey, vars?: Vars) => string;

interface LanguageContextValue {
  lang: Lang;
  locale: string;
  t: TFunction;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback(
    (next: Lang) => {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; samesite=lax`;
      document.documentElement.lang = next;
      setLangState(next);
      // Server-rendered parts (landing page, page titles) re-render in the new language.
      router.refresh();
    },
    [router],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, locale: LOCALE[lang], t: (key, vars) => translate(lang, key, vars), setLang }),
    [lang, setLang],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

function useLanguageContext(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("LanguageProvider is missing");
  return ctx;
}

/** `t("Türkçe metin")` → text in the current language. */
export function useT(): TFunction {
  return useLanguageContext().t;
}

export function useLang() {
  const { lang, locale, setLang } = useLanguageContext();
  return { lang, locale, setLang };
}
