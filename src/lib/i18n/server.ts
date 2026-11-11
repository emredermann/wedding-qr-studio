import "server-only";

import { cookies } from "next/headers";

import { LANG_COOKIE, LOCALE, normaliseLang, type Lang } from "@/lib/i18n/config";
import { translate, type MsgKey, type Vars } from "@/lib/i18n/translate";

export async function getServerLang(): Promise<Lang> {
  const store = await cookies();
  return normaliseLang(store.get(LANG_COOKIE)?.value);
}

/** For Server Components and metadata. */
export async function getServerT() {
  const lang = await getServerLang();
  return { lang, locale: LOCALE[lang], t: (key: MsgKey, vars?: Vars) => translate(lang, key, vars) };
}
