import { ArrowRight, CalendarPlus, Clock, FileSpreadsheet, Link2, Mail, MessageCircle, Sheet, Upload, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/brand/BrandMark";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { InviteIllustration, SeatingIllustration } from "@/components/landing/InviteVisuals";
import { TemplateShowcase } from "@/components/landing/TemplateShowcase";
import { BRAND } from "@/lib/brand";
import { getServerT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/translate";

/**
 * Links go to the main domain when one is configured (this page may be served
 * on a separate invitations domain, see INVITE_HOST in proxy.ts).
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? "";
/** Where "start" sends people: log in, then the dashboard with "invitation only" preselected. */
const START_HREF = `${APP_URL}/login?next=${encodeURIComponent("/dashboard?yeni=davetiye")}`;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return {
    title: t("Dijital davetiye, LCV ve oturma planı"),
    description: t("Kişiye özel dijital davetiyeler gönderin; yanıtlar kendiliğinden gelsin, Google Drive’daki tabloya yazılsın ve oturma planınıza dökülsün."),
  };
}

const STEPS: Array<{ title: MsgKey; text: MsgKey }> = [
  { title: "Davetiyenizi tasarlayın", text: "Altı şablon, kendi renginiz ve metniniz. Program, kıyafet notu, harita ve “takvime ekle” hazır." },
  { title: "Herkese kendi bağlantısı", text: "Davetiye “Sevgili Ayşe,” diye açılır. Kişi sınırını siz belirlersiniz; bağlantıyı WhatsApp’tan tek dokunuşla gönderin." },
  { title: "Yanıtlar kendiliğinden gelsin", text: "Misafir katılımını, gelecek herkesin adını ve menü tercihini yazar; son tarihe kadar değiştirebilir." },
  { title: "Drive’da tablo, salonda masa", text: "Her yanıt Google Drive’ınızdaki tabloya yazılır ve oturma planınızın misafir listesine düşer." },
];

const FEATURES: Array<{ icon: LucideIcon; title: MsgKey; text: MsgKey }> = [
  { icon: Users, title: "Kişi sınırı", text: "Her davetiyeye kaç kişinin gelebileceğini siz belirlersiniz; misafir sınırı aşamaz." },
  { icon: Mail, title: "İsim isim LCV", text: "Gelecek herkes için ad soyad alınır; liste masaya oturtmaya hazır gelir." },
  { icon: Clock, title: "Son yanıt tarihi", text: "Misafirler bu tarihe kadar yanıtını değiştirebilir; sonra form kapanır." },
  { icon: Sheet, title: "Drive’da canlı tablo", text: "Yanıtlar kendi Google Drive’ınızdaki tabloya anında yazılır; Excel olarak da indirilebilir." },
  { icon: MessageCircle, title: "WhatsApp ile gönderim", text: "Her bağlantı hazır bir mesajla tek dokunuşta paylaşılır." },
  { icon: Link2, title: "Genel bağlantı", text: "Listede olmayanlar için tek bağlantı; her yanıt kendi özel bağlantısına kaydedilir." },
  { icon: CalendarPlus, title: "Takvime ekle", text: "Google Takvim, Apple ve Outlook için tek dokunuş; geri sayım ve yol tarifi de var." },
  { icon: Upload, title: "Excel ve PDF’ten içe aktarma", text: "Hazır davetli listenizi yükleyin; isim, grup ve kişi sayısı kendiliğinden okunur." },
  { icon: FileSpreadsheet, title: "Oturma planı", text: "Katılanlar listeye düşer; masaları çizin, misafirleri sürükleyin, planı PDF alın." },
];

const FAQ: Array<{ q: MsgKey; a: MsgKey }> = [
  {
    q: "Fotoğraf albümünü de kullanmak zorunda mıyım?",
    a: "Hayır. Yalnızca davetiye ve oturma planıyla başlayabilirsiniz; Google Drive bile gerekmez. Dilerseniz fotoğraf albümünü sonra tek tıkla açarsınız.",
  },
  { q: "Misafirlerin uygulama indirmesi gerekiyor mu?", a: "Hayır. Davetiye bir bağlantıdır; telefonun tarayıcısında açılır, hesap ya da şifre gerekmez." },
  {
    q: "Davetiye yanıtları nereye gidiyor?",
    a: "Her yanıt panelinize ve Google Drive’ınızdaki “Davetiye Yanıtları” tablosuna anında yazılır; katılanlar oturma planınızın misafir listesine eklenir. Misafir yanıtını son tarihe kadar aynı bağlantıdan değiştirebilir.",
  },
  { q: "Bağlantı yanlış kişiye giderse?", a: "Panelden o davetliye yeni bir bağlantı oluşturun; eskisi hemen çalışmaz hale gelir." },
  { q: "Ücreti ne kadar?", a: "Davetiye modülü Pro pakete dahildir. Misafir ya da yanıt sınırı yoktur." },
];

export default async function InvitationsLandingPage() {
  const { t } = await getServerT();
  return (
    <div className="min-h-dvh bg-[#f6f2ea] text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-[#f6f2ea]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/davetiye" className="flex items-center gap-2">
            <BrandLogo className="text-base" markClassName="h-7 w-7" />
            <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">{t("Davetiye")}</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-stone-600 md:flex">
            <a href="#sablonlar" className="hover:text-stone-900">{t("Şablonlar")}</a>
            <a href="#nasil" className="hover:text-stone-900">{t("Nasıl çalışır")}</a>
            <a href="#oturma" className="hover:text-stone-900">{t("Oturma planı")}</a>
            <a href="#sss" className="hover:text-stone-900">{t("Sorular")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href={START_HREF} className="rounded-full border border-stone-900 px-4 py-1.5 text-sm transition hover:bg-stone-900 hover:text-white">
              {t("Giriş")}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-14 pb-20 sm:pt-20 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <p className="text-xs tracking-[0.28em] text-stone-500 uppercase">{t("{brand} Davetiye", { brand: BRAND.name })}</p>
          <h1 className="mt-5 font-brand text-6xl leading-[0.98] sm:text-7xl">{t("Davetiyeden masaya, tek yerde.")}</h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-stone-600">
            {t("Kişiye özel dijital davetiyeler gönderin; yanıtlar kendiliğinden gelsin, Google Drive’daki tabloya yazılsın ve oturma planınıza dökülsün.")}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href={START_HREF} className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-7 py-3 text-sm text-stone-50 transition hover:bg-stone-700">
              {t("Davetiyenizi oluşturun")} <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#sablonlar" className="rounded-full px-5 py-3 text-sm text-stone-700 underline-offset-4 hover:underline">
              {t("Şablonları görün")}
            </a>
          </div>
          <p className="mt-5 text-xs text-stone-500">{t("Uygulama yok, misafirden üyelik yok. Google Drive yalnızca yanıt tablosu için.")}</p>
        </div>
        <InviteIllustration t={t} />
      </section>

      {/* Templates */}
      <section id="sablonlar" className="scroll-mt-20 border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-12 max-w-2xl">
            <h2 className="font-brand text-5xl leading-[1.04] sm:text-6xl">{t("Altı şablon, sizin renkleriniz.")}</h2>
            <p className="mt-5 leading-relaxed text-stone-600">
              {t("Her şablonun kendi yazı tipleri ve süslemeleri var. Vurgu rengini, metni ve programı siz belirlersiniz; misafir önce mühürlü bir zarf görür.")}
            </p>
          </div>
          <TemplateShowcase />
        </div>
      </section>

      {/* How it works */}
      <section id="nasil" className="scroll-mt-20 bg-stone-900 text-stone-50">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="max-w-2xl font-brand text-5xl leading-[1.04] sm:text-6xl">{t("Dört adımda, kâğıtsız.")}</h2>
          <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-stone-700/60 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bg-stone-900 p-7">
                <span className="font-brand text-4xl text-stone-500 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-5 font-brand text-2xl">{t(s.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">{t(s.text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="max-w-2xl font-brand text-5xl leading-[1.04] sm:text-6xl">{t("Yanıt toplamanın en kolay yolu.")}</h2>
        <div className="mt-14 grid gap-x-12 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="border-t border-stone-300/70 py-6">
              <Icon className="h-5 w-5 text-stone-500" />
              <h3 className="mt-3 font-brand text-2xl">{t(title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{t(text)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Seating */}
      <section id="oturma" className="scroll-mt-20 border-t border-stone-200 bg-stone-100/70">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 lg:grid-cols-2">
          <div>
            <p className="text-xs tracking-[0.25em] text-stone-500 uppercase">{t("Oturma planı")}</p>
            <h2 className="mt-4 font-brand text-5xl leading-[1.04] sm:text-6xl">{t("Herkes doğru masada.")}</h2>
            <p className="mt-5 max-w-xl leading-relaxed text-stone-600">
              {t("“Katılıyorum” diyen herkes kişi kişi listenize düşer. Masaları çizin, misafirleri sürükleyin; yanıtı değişen olursa plan sizi uyarır.")}
            </p>
          </div>
          <SeatingIllustration t={t} />
        </div>
      </section>

      {/* Album upsell */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-stone-200 bg-white p-8">
          <div className="max-w-xl">
            <h2 className="font-brand text-3xl">{t("Düğün günü için de hazır.")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              {t("İsterseniz aynı etkinlikte fotoğraf albümünü açın: misafirler masadaki QR’ı okutup fotoğraf ve videolarını doğrudan Drive’ınıza yükler.")}
            </p>
          </div>
          <Link href={`${APP_URL}/`} className="inline-flex items-center gap-2 rounded-full border border-stone-900 px-5 py-2.5 text-sm">
            {t("Fotoğraf albümünü keşfedin")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section id="sss" className="scroll-mt-20 border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <h2 className="font-brand text-5xl leading-[1.04]">{t("Sorular")}</h2>
          <div className="mt-10 divide-y divide-stone-200 border-y border-stone-200">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg">
                  {t(q)}
                  <span className="text-stone-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-stone-600">{t(a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-stone-900 text-stone-50">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h2 className="font-brand text-5xl sm:text-6xl">{t("İlk davetiyenizi bugün gönderin.")}</h2>
          <Link href={START_HREF} className="mt-10 inline-flex items-center gap-2 rounded-full bg-stone-50 px-7 py-3 text-sm text-stone-900 transition hover:bg-white">
            {t("Davetiyenizi oluşturun")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-xs text-stone-500">
        <BrandLogo className="text-sm" markClassName="h-5 w-5" />
        <Link href={`${APP_URL}/`} className="hover:text-stone-800">
          {t("{brand} fotoğraf albümü", { brand: BRAND.name })}
        </Link>
      </footer>
    </div>
  );
}
