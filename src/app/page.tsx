import { ArrowRight, Check, Minus, Plus, ScanLine, Smartphone, Timer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo, BrandMark } from "@/components/brand/BrandMark";
import { BRAND } from "@/lib/brand";

/* ------------------------------------------------------------------ content */

const NAV = [
  { href: "#nasil-calisir", label: "Nasıl çalışır" },
  { href: "#ozellikler", label: "Özellikler" },
  { href: "#karsilastirma", label: "Karşılaştırma" },
  { href: "#sss", label: "SSS" },
];

const STEPS = [
  { title: "Kartlar masada", text: "Paneldeki atölyede QR kartınızı tasarlayın, yazdırın ve masalara bırakın." },
  { title: "Misafir okutur", text: "Telefon kamerasıyla okutup adını yazar, fotoğraf ve videolarını seçer." },
  { title: "Albüm dolar", text: "Her kare orijinal kalitede, doğrudan sizin Google Drive’ınıza düşer." },
];

const CALLOUTS = [
  { icon: Smartphone, title: "Uygulama yok", text: "İndirme, hesap ya da şifre gerekmez." },
  { icon: ScanLine, title: "Her telefonda", text: "iPhone ve Android’in kendi kamerası yeter." },
  { icon: Timer, title: "Saniyeler içinde", text: "Okut, seç, gönder. Hepsi bu kadar." },
];

const GUEST_JOURNEY = [
  { title: "Kartı görür", text: "Masada sade bir kart ve kısa bir davet: “Anılarınızı bizimle paylaşın.”" },
  { title: "QR kodu okutur", text: "Kamera açılır, bağlantıya dokunur. Etkinliğin sayfası anında gelir." },
  { title: "Adını yazar", text: "Kayıt yok. Yalnızca kim olduğunu bilmeniz için bir isim." },
  { title: "Seçer ve gönderir", text: "Galeriden ya da o an çekerek; fotoğraf, video, sesli mesaj." },
  { title: "Albüme bakar", text: "Diğer misafirlerin karelerini görür, selfie ile kendini bulur." },
];

const CARD_OPTIONS = [
  { title: "Kart atölyesi", text: "Renk, çerçeve, monogram ve yazıyı seçin; önizleme anında güncellenir.", note: "Panelde, ücretsiz" },
  { title: "Baskıya hazır", text: "A6, A5 ya da A4’e dört kart; 300 DPI PNG veya PDF. Evde ya da matbaada basın.", note: "PNG · PDF" },
  { title: "Kendi tasarımınız", text: "QR kodu indirin, davetiyenize ya da kendi kartınıza yerleştirin.", note: "Tam serbestlik" },
];

const FEATURES = [
  { title: "Orijinal kalite", text: "Sıkıştırma yok. Tüm albümü tek dokunuşla ZIP olarak indirin." },
  { title: "Video desteği", text: "Fotoğrafın yanında videolar da tam çözünürlükte yüklenir." },
  { title: "Beni bul", text: "Bir selfie ile yalnızca kişinin yer aldığı kareler. Analiz cihazda yapılır." },
  { title: "Canlı ekran", text: "Yeni kareler ve mesajlar salondaki ekranda sessizce belirir." },
  { title: "Anı defteri", text: "Sesli, görüntülü ya da yazılı mesajlar — doğrudan tarayıcıdan." },
  { title: "Kategoriler", text: "Hazırlık, tören, parti… Misafir yüklerken seçer, siz düzenli bulursunuz." },
  { title: "Onay modu", text: "İsterseniz her kare siz onaylamadan albümde görünmez." },
  { title: "Gizleme ve silme", text: "İstemediğiniz içerik tek dokunuşla albümden kalkar." },
  { title: "Sizin Drive’ınız", text: "Medya kendi Google hesabınızda, sizin klasörünüzde durur." },
  { title: "İstatistikler", text: "Kaç misafir, kaç kare, kaç mesaj — bir bakışta." },
  { title: "Gizlilik", text: "Albüm yalnızca bağlantıya sahip olanlara açıktır." },
  { title: "Uygulamasız", text: "Her şey tarayıcıda; misafirden hiçbir şey kurması istenmez." },
];

type Cell = boolean | string;
const COMPARISON: { label: string; mira: Cell; apps: Cell; shared: Cell }[] = [
  { label: "Misafir için uygulama", mira: "Gerekmez", apps: "Gerekir", shared: "Çoğu zaman gerekir" },
  { label: "Hesap / giriş", mira: "Gerekmez", apps: "Gerekir", shared: "Gerekir" },
  { label: "Her telefonda çalışır", mira: true, apps: "Mağazaya bağlı", shared: "Platforma bağlı" },
  { label: "Orijinal çözünürlük", mira: true, apps: "Değişken", shared: "Çoğu zaman sıkıştırılır" },
  { label: "Video", mira: true, apps: true, shared: "Sınırlı" },
  { label: "QR masa kartı", mira: true, apps: false, shared: false },
  { label: "Medya kimde kalır", mira: "Sizin Drive’ınızda", apps: "Uygulamada", shared: "Platformda" },
  { label: "Ücret", mira: "Ücretsiz", apps: "Çoğu zaman ücretli", shared: "Ücretsiz" },
];

const INCLUDED = [
  "Sınırsız misafir ve yükleme",
  "Orijinal kalitede fotoğraf ve video",
  "Selfie ile kendini bulma",
  "Canlı ekran ve anı defteri",
  "QR kart atölyesi (PNG · PDF)",
  "Onay modu ve kategoriler",
  "Tüm albümü ZIP olarak indirme",
  "Depolama kendi Google Drive’ınızda",
];

const FAQ = [
  {
    q: "Nasıl çalışıyor?",
    a: "Etkinliğinizi oluşturur, kendi Google Drive’ınızı bağlarsınız. Size özel bir QR kod ve bağlantı oluşur. Misafirler kodu okutup yükledikçe her şey Drive’ınızdaki etkinlik klasörüne düşer ve albümde görünür.",
  },
  { q: "Misafirlerin uygulama indirmesi gerekiyor mu?", a: "Hayır. Her şey telefonun tarayıcısında çalışır. Hesap ya da şifre de gerekmez; yalnızca bir isim yazmaları istenir." },
  { q: "Kurulum ne kadar sürer?", a: "Birkaç dakika. Giriş yapın, etkinliği oluşturun, Drive’ı bağlayın ve kartı indirin." },
  {
    q: "Fotoğraflar nerede saklanıyor?",
    a: "Sizin Google Drive hesabınızda, otomatik oluşturulan bir klasörde. Fotoğraflar, videolar ve sesli mesajlar ayrı alt klasörlere ayrılır. Dosyalar her zaman sizindir.",
  },
  { q: "Kalite düşüyor mu?", a: "Hayır. Dosyalar sıkıştırılmadan, telefondan çıktığı haliyle yüklenir. İndirirken de orijinal dosyaları alırsınız." },
  { q: "Video yüklenebiliyor mu?", a: "Evet. Büyük dosyalar parça parça yüklenir; bir sorun olursa tek dokunuşla yeniden denenebilir." },
  {
    q: "“Beni bul” nasıl çalışıyor, güvenli mi?",
    a: "Misafir bir selfie çeker; yüz eşleştirmesi tamamen kendi telefonunda yapılır. Selfie hiçbir yere yüklenmez ve saklanmaz.",
  },
  { q: "İstemediğim bir fotoğraf yüklenirse?", a: "Panelden tek dokunuşla gizleyebilir ya da silebilirsiniz. Onay modunu açarsanız hiçbir kare siz onaylamadan görünmez." },
  { q: "Ücreti ne kadar?", a: "Ücretsiz. Depolama kendi Google Drive’ınızda olduğu için ek bir maliyet yoktur; Drive’ınızın kotası kadar alanınız olur." },
];

/* --------------------------------------------------------------- primitives */

function SectionHead({ index, label, title, text }: { index: string; label: string; title: ReactNode; text?: string }) {
  return (
    <div className="mb-14 max-w-2xl">
      <p className="text-[11px] tracking-[0.32em] text-stone-500 uppercase">
        <span className="font-mono text-stone-400">{index}</span>
        <span className="mx-3 inline-block h-px w-8 bg-stone-300 align-middle" />
        {label}
      </p>
      <h2 className="mt-6 font-serif text-4xl leading-[1.1] sm:text-5xl">{title}</h2>
      {text && <p className="mt-5 leading-relaxed text-stone-600">{text}</p>}
    </div>
  );
}

function PrimaryCta({ children = "Albümünü oluştur" }: { children?: ReactNode }) {
  return (
    <Link
      href="/login"
      className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-7 py-3 text-sm text-stone-50 transition hover:bg-stone-700"
    >
      {children}
      <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
    </Link>
  );
}

/** Deterministic QR-like glyph (decorative only — the real code is generated in the panel). */
const QR_SIZE = 21;
const QR_CELLS: boolean[] = Array.from({ length: QR_SIZE * QR_SIZE }, (_, i) => {
  const x = i % QR_SIZE;
  const y = Math.floor(i / QR_SIZE);
  const inFinder = (fx: number, fy: number) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7;
  for (const [fx, fy] of [
    [0, 0],
    [14, 0],
    [0, 14],
  ]) {
    if (inFinder(fx, fy)) {
      const dx = x - fx;
      const dy = y - fy;
      const ring = dx === 0 || dy === 0 || dx === 6 || dy === 6;
      const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      return ring || core;
    }
  }
  if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) return false;
  return ((x * 7 + y * 13 + x * y * 3) % 5) < 2;
});

function QrGlyph({ className = "h-20 w-20" }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} className={className} shapeRendering="crispEdges" aria-hidden>
      {QR_CELLS.map((on, i) => (on ? <rect key={i} x={i % QR_SIZE} y={Math.floor(i / QR_SIZE)} width="1" height="1" fill="currentColor" /> : null))}
    </svg>
  );
}

const TILE_TONES = ["bg-stone-300", "bg-stone-200", "bg-amber-200", "bg-stone-400", "bg-stone-200", "bg-amber-100", "bg-stone-300", "bg-stone-200", "bg-amber-300"];

function PhoneMock() {
  return (
    <div className="relative mx-auto w-[248px] rounded-[2.4rem] border border-stone-300 bg-white p-2.5 shadow-[0_30px_60px_-30px_rgba(28,27,24,0.35)]">
      <div className="overflow-hidden rounded-[1.9rem] bg-stone-50">
        <div className="flex flex-col items-center px-5 pt-8 pb-5 text-center">
          <BrandMark className="h-5 w-5 text-stone-400" />
          <p className="mt-4 text-[9px] tracking-[0.3em] text-stone-500 uppercase">12 Eylül</p>
          <p className="mt-1 font-serif text-2xl">Elif &amp; Can</p>
          <div className="mt-5 w-full rounded-full bg-stone-900 py-2.5 text-[11px] text-stone-50">Fotoğraf yükle</div>
          <div className="mt-2 w-full rounded-full border border-stone-300 py-2.5 text-[11px] text-stone-700">Albüme bak</div>
        </div>
        <div className="grid grid-cols-3 gap-0.5 px-0.5 pb-0.5">
          {TILE_TONES.map((tone, i) => (
            <div key={i} className={`aspect-square ${tone}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TableCard({ variant }: { variant: "classic" | "monogram" | "ink" }) {
  const ink = variant === "ink";
  return (
    <div
      className={`flex aspect-[3/4] flex-col items-center justify-between rounded-sm p-6 text-center shadow-[0_20px_40px_-28px_rgba(28,27,24,0.45)] ${
        ink ? "bg-stone-900 text-stone-50" : "border border-stone-200 bg-white text-stone-900"
      }`}
    >
      {variant === "monogram" ? (
        <p className="font-serif text-3xl italic">E · C</p>
      ) : (
        <p className={`text-[9px] tracking-[0.3em] uppercase ${ink ? "text-stone-400" : "text-stone-500"}`}>Anılarınızı paylaşın</p>
      )}
      <div className={`rounded-sm p-2 ${ink ? "bg-stone-50 text-stone-900" : ""}`}>
        <QrGlyph className="h-20 w-20" />
      </div>
      <div>
        <p className="font-serif text-lg">Elif &amp; Can</p>
        <p className={`mt-1 text-[10px] ${ink ? "text-stone-400" : "text-stone-500"}`}>Kodu okutun, karelerinizi bırakın</p>
      </div>
    </div>
  );
}

function CompareCell({ value, strong = false }: { value: Cell; strong?: boolean }) {
  if (value === true) return <Check className={`h-4 w-4 ${strong ? "text-stone-900" : "text-stone-500"}`} strokeWidth={1.75} aria-label="Var" />;
  if (value === false) return <Minus className="h-4 w-4 text-stone-300" strokeWidth={1.75} aria-label="Yok" />;
  return <span className={strong ? "text-stone-900" : "text-stone-500"}>{value}</span>;
}

/* --------------------------------------------------------------------- page */

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900">
      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-stone-50/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/" aria-label={BRAND.name}>
            <BrandLogo className="text-base" markClassName="h-6 w-6" />
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-stone-600 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-stone-900">
                {n.label}
              </a>
            ))}
          </nav>
          <Link href="/login" className="rounded-full border border-stone-300 px-4 py-1.5 text-sm text-stone-800 transition hover:border-stone-900">
            Giriş
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-16 px-6 pt-20 pb-24 md:grid-cols-[1.15fr_1fr] md:pt-28 md:pb-32">
        <div>
          <p className="text-[11px] tracking-[0.32em] text-stone-500 uppercase">QR ile etkinlik albümü</p>
          <h1 className="mt-8 font-serif text-5xl leading-[1.04] sm:text-7xl">
            Her misafirin objektifinden, <span className="italic text-amber-700">tek</span> bir albüm.
          </h1>
          <p className="mt-8 max-w-lg text-base leading-relaxed text-stone-600 sm:text-lg">
            Masaya bir QR kart bırakın. Misafirleriniz uygulama indirmeden fotoğraf, video ve mesajlarını paylaşsın; hepsi orijinal kalitede
            sizin Google Drive’ınızda toplansın.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <PrimaryCta />
            <a href="#nasil-calisir" className="text-sm text-stone-600 underline-offset-4 transition hover:text-stone-900 hover:underline">
              Nasıl çalışır?
            </a>
          </div>
          <dl className="mt-16 grid max-w-md grid-cols-3 border-t border-stone-200 pt-6">
            {[
              ["0", "uygulama"],
              ["%100", "orijinal kalite"],
              ["0 ₺", "ücret"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="font-serif text-3xl">{v}</dt>
                <dd className="mt-1 text-xs text-stone-500">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative">
          <PhoneMock />
          <div className="absolute -bottom-8 -left-2 hidden w-36 rotate-[-6deg] sm:block md:-left-6">
            <TableCard variant="classic" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="nasil-calisir" className="scroll-mt-20 border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <SectionHead index="01" label="Nasıl çalışır" title={<>Üç adım. <span className="italic">Hepsi bu.</span></>} />
          <ol className="grid gap-px overflow-hidden border border-stone-200 bg-stone-200 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bg-white p-8">
                <p className="font-serif text-6xl text-stone-300">{i + 1}</p>
                <h3 className="mt-8 font-serif text-2xl">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {CALLOUTS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" strokeWidth={1.4} />
                <div>
                  <p className="text-sm text-stone-900">{title}</p>
                  <p className="mt-1 text-sm text-stone-500">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guest experience */}
      <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <SectionHead
          index="02"
          label="Misafir deneyimi"
          title={<>Misafiriniz için <span className="italic">otuz saniye.</span></>}
          text="Kartı gördüğü andan albüme baktığı ana kadar hiçbir engel yok."
        />
        <div className="grid gap-16 md:grid-cols-[1fr_1fr]">
          <ol className="border-t border-stone-200">
            {GUEST_JOURNEY.map((s, i) => (
              <li key={s.title} className="flex gap-6 border-b border-stone-200 py-6">
                <span className="w-6 shrink-0 pt-1.5 font-mono text-xs text-stone-400">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="font-serif text-xl">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-stone-600">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <figure className="flex flex-col justify-center md:pl-8">
            <blockquote className="font-serif text-3xl leading-snug text-stone-800 sm:text-4xl">
              “En güzel kareler misafirlerin telefonunda kalır. Onlara ulaşmanın tek yolu, paylaşmayı <span className="italic">zahmetsiz</span>{" "}
              kılmaktır.”
            </blockquote>
            <figcaption className="mt-6 text-xs tracking-[0.25em] text-stone-500 uppercase">{BRAND.name} ilkesi</figcaption>
          </figure>
        </div>
      </section>

      {/* Cards */}
      <section className="border-t border-stone-200 bg-stone-100/60">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <SectionHead
            index="03"
            label="Masa kartları"
            title={<>Masada <span className="italic">sessiz</span> bir davet.</>}
            text="Kartınızı paneldeki atölyede tasarlayın; etkinliğinizin diline uyan sade, baskıya hazır bir QR kart."
          />
          <div className="mx-auto grid max-w-3xl grid-cols-3 gap-4 sm:gap-8">
            <TableCard variant="classic" />
            <div className="translate-y-6">
              <TableCard variant="monogram" />
            </div>
            <TableCard variant="ink" />
          </div>
          <div className="mt-20 grid gap-px overflow-hidden border border-stone-200 bg-stone-200 md:grid-cols-3">
            {CARD_OPTIONS.map((o) => (
              <div key={o.title} className="bg-stone-50 p-8">
                <p className="text-[10px] tracking-[0.25em] text-stone-500 uppercase">{o.note}</p>
                <h3 className="mt-4 font-serif text-2xl">{o.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{o.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="ozellikler" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 sm:py-32">
        <SectionHead index="04" label="Özellikler" title={<>Gereken her şey, <span className="italic">fazlası değil.</span></>} />
        <div className="grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t border-stone-200 py-6">
              <h3 className="font-serif text-xl">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section id="karsilastirma" className="scroll-mt-20 border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <SectionHead
            index="05"
            label="Karşılaştırma"
            title={<>Neden <span className="italic">{BRAND.name}?</span></>}
            text="Paylaşım ne kadar kolaysa, o kadar çok kare toplanır. Farkı engelleri kaldırmak yaratır."
          />
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-900">
                  <th className="py-4 pr-6 font-normal text-stone-500" />
                  <th className="py-4 pr-6 font-serif text-xl font-normal">{BRAND.name}</th>
                  <th className="py-4 pr-6 font-normal text-stone-500">Fotoğraf uygulamaları</th>
                  <th className="py-4 font-normal text-stone-500">Paylaşılan albümler</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((r) => (
                  <tr key={r.label} className="border-b border-stone-200">
                    <th scope="row" className="py-4 pr-6 font-normal text-stone-600">
                      {r.label}
                    </th>
                    <td className="py-4 pr-6">
                      <CompareCell value={r.mira} strong />
                    </td>
                    <td className="py-4 pr-6">
                      <CompareCell value={r.apps} />
                    </td>
                    <td className="py-4">
                      <CompareCell value={r.shared} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <SectionHead index="06" label="Ücret" title={<>Tek paket. <span className="italic">Ücretsiz.</span></>} />
        <div className="grid overflow-hidden border border-stone-200 bg-white md:grid-cols-[1fr_1.4fr]">
          <div className="flex flex-col justify-between gap-10 border-b border-stone-200 p-10 md:border-r md:border-b-0">
            <div>
              <p className="text-[10px] tracking-[0.25em] text-stone-500 uppercase">Her şey dahil</p>
              <p className="mt-6 font-serif text-7xl">0 ₺</p>
              <p className="mt-3 text-sm text-stone-600">Abonelik yok, kilitli özellik yok. Depolama kendi Google Drive’ınızda.</p>
            </div>
            <div>
              <PrimaryCta>Hemen başla</PrimaryCta>
            </div>
          </div>
          <ul className="grid content-center gap-x-8 gap-y-4 p-10 sm:grid-cols-2">
            {INCLUDED.map((i) => (
              <li key={i} className="flex gap-3 text-sm text-stone-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" strokeWidth={1.75} />
                {i}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="sss" className="scroll-mt-20 border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 sm:py-32 md:grid-cols-[1fr_1.6fr]">
          <SectionHead index="07" label="SSS" title={<>Sıkça <span className="italic">sorulanlar.</span></>} />
          <div className="border-t border-stone-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group border-b border-stone-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-stone-900 [&::-webkit-details-marker]:hidden">
                  <span className="font-serif text-xl">{f.q}</span>
                  <Plus className="h-4 w-4 shrink-0 text-stone-400 transition group-open:rotate-45" strokeWidth={1.5} />
                </summary>
                <p className="pb-6 text-sm leading-relaxed text-stone-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-stone-900 text-stone-50">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-28 text-center sm:py-36">
          <BrandMark className="h-8 w-8 text-stone-500" />
          <h2 className="mt-10 font-serif text-5xl leading-[1.05] sm:text-6xl">
            Hiçbir an <span className="italic text-amber-300">kaybolmasın.</span>
          </h2>
          <p className="mt-6 max-w-md text-stone-400">Albümünüzü dakikalar içinde kurun; gerisini misafirleriniz tamamlasın.</p>
          <Link
            href="/login"
            className="mt-12 inline-flex items-center gap-2 rounded-full bg-stone-50 px-7 py-3 text-sm text-stone-900 transition hover:bg-stone-200"
          >
            Albümünü oluştur
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-stone-900 text-stone-400">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-stone-800 px-6 py-8 text-xs sm:flex-row">
          <BrandLogo className="text-sm text-stone-200" markClassName="h-5 w-5" />
          <nav className="flex gap-6">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-stone-100">
                {n.label}
              </a>
            ))}
          </nav>
          <span>Medyalarınız yalnızca sizin Google Drive’ınızda saklanır.</span>
        </div>
      </footer>
    </main>
  );
}
