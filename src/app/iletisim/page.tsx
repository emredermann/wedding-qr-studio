import { ArrowLeft, Armchair, Camera, Clock, Mail, MonitorPlay, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/brand/BrandMark";
import { ContactForm } from "@/components/contact/ContactForm";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { BRAND } from "@/lib/brand";
import { getServerT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/translate";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return {
    title: t("İletişim"),
    description: t("{brand} hakkında detaylı bilgi almak için formu doldurun; sizinle iletişime geçelim.", { brand: BRAND.name }),
  };
}

const OFFER: Array<{ icon: typeof Camera; title: MsgKey; text: MsgKey }> = [
  { icon: Camera, title: "Ortak fotoğraf albümü", text: "Misafirler masadaki QR’ı okutur; fotoğraf ve videolar orijinal kalitede kendi Google Drive’ınıza gelir." },
  { icon: MonitorPlay, title: "Canlı ekran ve anı defteri", text: "Yeni kareler salondaki ekranda belirir; misafirler yazılı, sesli ya da görüntülü mesaj bırakır." },
  { icon: Mail, title: "Dijital davetiye ve LCV", text: "Kişiye özel davetiyeler; yanıtlar kendiliğinden gelir ve Drive’daki tabloya yazılır." },
  { icon: Armchair, title: "Oturma planı", text: "Katılanlar listeye düşer; masaları çizin, misafirleri sürükleyin, planı PDF alın." },
];

/** "Contact us for details" page: what Mira offers, and a form that is saved for the team. */
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ kaynak?: string }> }) {
  const { t } = await getServerT();
  const { kaynak } = await searchParams;
  const source = kaynak && /^[a-z0-9-]{1,40}$/.test(kaynak) ? kaynak : "iletisim";

  return (
    <div className="min-h-dvh bg-[#f6f2ea] text-stone-900">
      <header className="border-b border-stone-200/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2" aria-label={BRAND.name}>
            <BrandLogo className="text-base" markClassName="h-7 w-7" />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-stone-600 hover:bg-white">
              <ArrowLeft className="h-4 w-4" /> {t("Ana sayfa")}
            </Link>
          </div>
        </div>
      </header>

      {/* Phones: intro, form, then details. Desktop: intro + details left, form right. */}
      <main className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-6 py-14 sm:py-20 lg:grid-cols-[1fr_1.05fr]">
        <section className="lg:col-start-1 lg:row-start-1">
          <p className="text-xs tracking-[0.28em] text-stone-500 uppercase">{t("İletişim")}</p>
          <h1 className="mt-4 font-brand text-5xl leading-[1.02] sm:text-6xl">{t("Detaylı bilgi için bize ulaşın.")}</h1>
          <p className="mt-5 max-w-lg leading-relaxed text-stone-600">
            {t("{brand}, etkinliğinizin öncesinden sonrasına her şeyi tek yerde toplar. Formu doldurun; ihtiyacınızı dinleyelim, size uygun kurulumu birlikte planlayalım.", { brand: BRAND.name })}
          </p>
        </section>

        <section className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-10">
          <ContactForm source={source} />
        </section>

        <section className="lg:col-start-1 lg:row-start-2">
          <ul className="space-y-0">
            {OFFER.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 border-t border-stone-300/70 py-5">
                <Icon className="mt-1 h-5 w-5 shrink-0 text-stone-500" />
                <div>
                  <h2 className="font-brand text-2xl">{t(title)}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-stone-600">{t(text)}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
            <p className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" /> {t("Genellikle bir iş günü içinde dönüş yapıyoruz.")}
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> {t("Bilgileriniz yalnızca size dönüş yapmak için kullanılır, kimseyle paylaşılmaz.")}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
