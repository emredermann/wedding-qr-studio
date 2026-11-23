import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Check,
  Clapperboard,
  FileBarChart,
  Frame,
  GraduationCap,
  Heart,
  Minus,
  PartyPopper,
  Plus,
  ScanLine,
  Smartphone,
  Sparkles,
  Timer,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo, BrandMark } from "@/components/brand/BrandMark";
import { HeroFlyThrough } from "@/components/landing/HeroFlyThrough";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { BRAND } from "@/lib/brand";
import { THEMES, type ThemeId } from "@/lib/event-presets";
import { getServerT } from "@/lib/i18n/server";
import type { MsgKey, Vars } from "@/lib/i18n/translate";

type T = (key: MsgKey, vars?: Vars) => string;

/* ------------------------------------------------------------------ content */

const NAV: Array<{ href: string; label: MsgKey }> = [
  { href: "#nasil-calisir", label: "Nasıl çalışır" },
  { href: "#etkinlikler", label: "Etkinlikler" },
  { href: "#ozellikler", label: "Özellikler" },
  { href: "#karsilastirma", label: "Karşılaştırma" },
  { href: "#paketler", label: "Paketler" },
  { href: "#sss", label: "Sorular" },
];

const STEPS: Array<{ title: MsgKey; text: MsgKey }> = [
  { title: "Kartlar masada", text: "Kartınızı panelde birkaç dakikada tasarlayın, yazdırın ve masalara yerleştirin." },
  { title: "Misafir okutur", text: "Telefonunun kamerasını karta tutar, adını yazar ve karelerini seçer." },
  { title: "Albüm kendiliğinden dolar", text: "Her kare, çekildiği kalitede doğrudan sizin Google Drive’ınıza ulaşır." },
];

const CALLOUTS: Array<{ icon: typeof Smartphone; title: MsgKey; text: MsgKey }> = [
  { icon: Smartphone, title: "Uygulama yok", text: "İndirme, üyelik, şifre… Hiçbiri gerekmez." },
  { icon: ScanLine, title: "Her telefonda", text: "iPhone ya da Android; telefonun kendi kamerası yeterli." },
  { icon: Timer, title: "Birkaç saniye", text: "Okut, seç, gönder. Bu kadar." },
];

const OCCASIONS: Array<{ icon: typeof Heart; theme: ThemeId; title: MsgKey; text: MsgKey; chips: MsgKey[]; sample: string }> = [
  {
    icon: Heart,
    theme: "elegant",
    title: "Düğün & Nişan",
    text: "Gecenin akışı, sesli anı defteri ve zarif masa kartları. Her misafirin karesi tek bir albümde buluşur.",
    chips: ["Gecenin Akışı", "Anı Defteri", "Zarif kartlar"],
    sample: "Elif & Can",
  },
  {
    icon: Briefcase,
    theme: "corporate",
    title: "Kurumsal & Konferans",
    text: "Katılımcılar oturumlardan kareler paylaşır; görevler etkileşimi artırır, canlı ekran salonu bir araya getirir.",
    chips: ["Görevler", "Etkinlik Akışı", "Canlı ekran"],
    sample: "Atlas Summit ’26",
  },
  {
    icon: PartyPopper,
    theme: "night",
    title: "Doğum günü & Özel davet",
    text: "Gece teması, eğlenceli fotoğraf görevleri ve kalplerle öne çıkan en sevilen kareler.",
    chips: ["Görevler", "Gece teması", "En sevilenler"],
    sample: "Deniz 30",
  },
  {
    icon: GraduationCap,
    theme: "minimal",
    title: "Festival & Mezuniyet",
    text: "Yüzlerce misafir, tek QR. “Beni bul” ile herkes yer aldığı kareleri saniyeler içinde bulur.",
    chips: ["Beni Bul", "Sınırsız misafir", "Orijinal kalite"],
    sample: "Mezuniyet 2026",
  },
];

const AFTER_EVENT: Array<{ icon: typeof Heart; title: MsgKey; text: MsgKey; pro: boolean }> = [
  { icon: Clapperboard, title: "Öne çıkanlar videosu", text: "En çok kalp alan karelerden müziksiz, dikey ya da yatay kısa bir video; tek dokunuşla.", pro: false },
  { icon: FileBarChart, title: "Katılım raporu", text: "Kaç misafir, kaç kare, en yoğun saatler, görevler ve en sevilenler; tek sayfalık PDF.", pro: false },
  { icon: Frame, title: "Paylaşım çerçeveleri", text: "Kareler etkinlik adınızla çerçevelenerek paylaşılır; orijinaller Drive’da olduğu gibi kalır.", pro: false },
  { icon: BookOpen, title: "Fotokitap", text: "Seçtiğiniz karelerden kapaklı, baskıya hazır bir PDF albüm; dilediğiniz matbaada bastırın.", pro: true },
];

const GUEST_JOURNEY: Array<{ title: MsgKey; text: MsgKey }> = [
  { title: "Kartı fark eder", text: "Masada zarif bir kart ve tek cümlelik bir davet: “Bu günün karelerini bizimle paylaşın.”" },
  { title: "Kodu okutur", text: "Kamerayı karta tutması yeterli; etkinliğinizin sayfası tek dokunuşla açılır." },
  { title: "Adını yazar", text: "Üyelik yok. Sadece hangi karenin kimden geldiğini bilesiniz diye bir isim." },
  { title: "Paylaşır", text: "Galeriden seçer ya da o an çeker: fotoğraf, video, sesli bir not." },
  { title: "Albümde kendini bulur", text: "Diğer misafirlerin karelerine göz atar, bir selfie ile yer aldığı fotoğrafları bulur." },
];

const CARD_OPTIONS: Array<{ title: MsgKey; text: MsgKey; note: MsgKey }> = [
  { title: "Kart atölyesi", text: "Rengi, çerçeveyi, monogramı ve yazıyı seçin; önizleme siz değiştirdikçe güncellenir.", note: "Panelde · ücretsiz" },
  { title: "Baskıya hazır", text: "A6, A5 ya da bir A4’e dört kart; 300 DPI PNG veya PDF. İster evde, ister matbaada basın.", note: "PNG · PDF" },
  { title: "Kendi tasarımınız", text: "Yalnızca QR kodu indirin; davetiyenize ya da kendi kartınıza dilediğiniz gibi yerleştirin.", note: "Tamamen size ait" },
];

const FEATURES: Array<{ title: MsgKey; text: MsgKey }> = [
  { title: "Orijinal kalite", text: "Hiçbir kare sıkıştırılmaz. Tüm albümü tek dokunuşla indirin." },
  { title: "Videolar da", text: "Fotoğrafların yanında videolar da tam çözünürlükte gelir." },
  { title: "Beni bul", text: "Bir selfie yeterli; misafir yalnızca yer aldığı kareleri görür. Eşleştirme telefonda yapılır." },
  { title: "Canlı ekran", text: "Yeni kareler ve mesajlar, salondaki ekranda usulca belirir." },
  { title: "Anı defteri", text: "Yazılı, sesli ya da görüntülü mesajlar; doğrudan tarayıcıdan." },
  { title: "Kategoriler", text: "Karşılama, sahne, parti… Misafir yüklerken seçer, albüm kendiliğinden düzenlenir." },
  { title: "Görevler", text: "Misafirlere küçük fotoğraf görevleri verin; katılım artar, albüm çeşitlenir." },
  { title: "Etkinlik akışı", text: "Saatli program; o an hangi bölüm yaşanıyorsa misafir sayfasında öne çıkar." },
  { title: "Her etkinliğe bir tema", text: "Zarif, minimal, gece ya da kurumsal; misafir sayfası ve QR kartlar etkinliğinize uyum sağlar." },
  { title: "Görev liderlik tablosu", text: "En çok görevi tamamlayan misafirler misafir sayfasında ve canlı ekranda yarışır." },
  { title: "Kalpler ve en sevilenler", text: "Misafirler beğendikleri karelere kalp bırakır; galeri en sevilenlere göre sıralanır, kalpler canlı ekranda uçuşur." },
  { title: "Ortak yöneticiler", text: "Etkinliği birlikte yönetin: en fazla beş kişi moderasyon ve ayarlarda size yardım eder." },
  { title: "Masaya özel QR", text: "Her masanın kartında kendi QR’ı; yüklemeler masa numarasıyla kaydedilir, galeride masaya göre süzülür." },
  { title: "Onay modu", text: "Dilerseniz hiçbir kare, siz onaylamadan albümde görünmez." },
  { title: "Tek dokunuşla kaldırın", text: "İstemediğiniz bir kareyi gizleyin ya da silin; albümden hemen kalkar." },
  { title: "Sizin Drive’ınız", text: "Tüm dosyalar kendi Google hesabınızda, kendi klasörünüzde durur." },
  { title: "İstatistikler", text: "Kaç misafir, kaç kare, kaç mesaj; hepsi bir bakışta." },
  { title: "Gizlilik", text: "Albümü yalnızca bağlantıya sahip olanlar görebilir." },
  { title: "Kurulum yok", text: "Her şey tarayıcıda; misafirlerinizden hiçbir şey indirmeleri istenmez." },
];

const SEATING_POINTS: Array<{ title: MsgKey; text: MsgKey }> = [
  { title: "Listenizi içe aktarın", text: "Excel, CSV ya da PDF davetli listenizi yükleyin; isimler, gruplar ve menü tercihleri kendiliğinden okunur." },
  { title: "Salonu çizin", text: "Yuvarlak, dikdörtgen ve baş masalar; dans pisti, sahne, bar. Sürükleyin, döndürün, boyutlandırın." },
  { title: "Sürükle, yerleştir", text: "Misafirleri sandalyelere sürükleyin ya da telefonda dokunarak yerleştirin. Kim nerede, bir bakışta görün." },
  { title: "Yazdırın, paylaşın", text: "Planı PNG ya da PDF olarak alın; her masanın misafir listesi de hazır." },
];

type Cell = boolean | MsgKey;
const COMPARISON: { label: MsgKey; mira: Cell; apps: Cell; shared: Cell }[] = [
  { label: "Misafirin uygulama indirmesi", mira: "Gerekmez", apps: "Gerekir", shared: "Çoğu zaman gerekir" },
  { label: "Hesap açma", mira: "Gerekmez", apps: "Gerekir", shared: "Gerekir" },
  { label: "Her telefonda çalışır", mira: true, apps: "Mağazaya bağlı", shared: "Platforma bağlı" },
  { label: "Orijinal çözünürlük", mira: true, apps: "Değişken", shared: "Çoğu zaman sıkıştırılır" },
  { label: "Video", mira: true, apps: true, shared: "Sınırlı" },
  { label: "QR masa kartı", mira: true, apps: false, shared: false },
  { label: "Oturma planı", mira: true, apps: false, shared: false },
  { label: "Dosyalar kimde kalır", mira: "Sizin Drive’ınızda", apps: "Uygulamada", shared: "Platformda" },
  { label: "Ücret", mira: "Ücretsiz başlangıç", apps: "Çoğu zaman ücretli", shared: "Ücretsiz" },
];

const INCLUDED: MsgKey[] = [
  "Sınırsız misafir, Drive’ınız kadar yer",
  "Orijinal kalitede fotoğraf ve video",
  "Selfie ile kendini bulma",
  "Canlı ekran ve anı defteri",
  "Görevler, etkinlik akışı ve temalar",
  "Kalpler, ortak yöneticiler ve masaya özel QR",
  "QR kart atölyesi (PNG · PDF)",
  "Oturma planı ve davetli listesi (Excel · PDF)",
  "Onay modu ve kategoriler",
  "Tüm albümü tek seferde indirme",
  "Depolama kendi Google Drive’ınızda",
  "Görev liderlik tablosu",
  "Öne çıkanlar videosu ve katılım raporu",
  "Paylaşım çerçeveleri (küçük Mira işaretiyle)",
];

const PRO_INCLUDED: MsgKey[] = [
  "Ücretsiz paketteki her şey",
  "Marka kiti: etkinlik logosu ve sponsor logoları",
  "Logonuz misafir sayfasında, canlı ekranda ve videoda",
  "İşaretsiz, kendi yazınız ve logonuzla paylaşım çerçeveleri",
  "Baskıya hazır fotokitap (PDF)",
];

const FAQ: Array<{ q: MsgKey; a: MsgKey }> = [
  {
    q: "Nasıl çalışıyor?",
    a: "Etkinliğinizi oluşturup Google Drive’ınızı bağlarsınız; size özel bir QR kod ve bağlantı hazırlanır. Misafirleriniz kodu okutup paylaştıkça her kare Drive’ınızdaki etkinlik klasörüne düşer ve albümde belirir.",
  },
  {
    q: "Sadece düğünler için mi?",
    a: "Hayır. Düğün, nişan, kurumsal etkinlik, konferans, doğum günü, mezuniyet ya da festival… Etkinlik türünü seçtiğinizde tema, görevler ve misafir sayfası ona göre hazırlanır; hepsini dilediğiniz gibi değiştirebilirsiniz.",
  },
  { q: "Misafirlerin uygulama indirmesi gerekiyor mu?", a: "Hayır. Her şey telefonun tarayıcısında çalışır; hesap ya da şifre de yok. Yalnızca adlarını yazmaları istenir." },
  { q: "Kurulum ne kadar sürer?", a: "Birkaç dakika. Giriş yapın, etkinliğinizi oluşturun, Drive’ınızı bağlayın ve kartınızı indirin." },
  {
    q: "Fotoğraflar nerede saklanıyor?",
    a: "Kendi Google Drive hesabınızda, sizin için açılan bir klasörde. Fotoğraflar, videolar ve sesli mesajlar ayrı klasörlerde durur. Dosyalar her zaman sizindir.",
  },
  { q: "Kalite düşüyor mu?", a: "Hayır. Her dosya telefondan çıktığı haliyle, sıkıştırılmadan yüklenir; indirdiğinizde de aslını alırsınız." },
  { q: "Video yüklenebiliyor mu?", a: "Evet. Büyük videolar parça parça yüklenir; bağlantı koparsa tek dokunuşla yeniden denenebilir." },
  {
    q: "“Beni bul” nasıl çalışıyor, güvenli mi?",
    a: "Misafir bir selfie çeker; eşleştirme tamamen kendi telefonunda yapılır. Selfie hiçbir yere gönderilmez, saklanmaz.",
  },
  { q: "İstemediğim bir fotoğraf yüklenirse?", a: "Panelden tek dokunuşla gizleyebilir ya da silebilirsiniz. Onay modunu açarsanız, siz onaylamadıkça hiçbir kare görünmez." },
  {
    q: "Ücreti ne kadar?",
    a: "Temel özelliklerin tamamı ücretsiz; misafir ya da kare sınırı yok. Pro paket marka kiti, fotokitap ve işaretsiz çerçeveler ekler. Dosyalar kendi Google Drive’ınızda durduğu için depolama da size ek maliyet çıkarmaz.",
  },
];

/* --------------------------------------------------------------- primitives */

function SectionHead({ title, text, dark = false }: { title: ReactNode; text?: string; dark?: boolean }) {
  return (
    <div className="mb-14 max-w-2xl">
      <h2 className="font-brand text-5xl leading-[1.04] sm:text-6xl">{title}</h2>
      {text && <p className={`mt-5 max-w-xl leading-relaxed ${dark ? "text-stone-400" : "text-stone-600"}`}>{text}</p>}
    </div>
  );
}

/** A static miniature of the seating planner (decorative). */
function SeatingIllustration({ t }: { t: T }) {
  const round = (cx: number, cy: number, label: string, filled: number) => (
    <g key={label} transform={`translate(${cx} ${cy})`}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const on = i < filled;
        return (
          <circle
            key={i}
            cx={Math.cos(a) * 52}
            cy={Math.sin(a) * 52}
            r={11}
            fill={on ? "#2c2a26" : "#fff"}
            stroke={on ? "#2c2a26" : "#a19c92"}
            strokeWidth={1.5}
            strokeDasharray={on ? undefined : "3 3"}
          />
        );
      })}
      <circle r={36} fill="#fff" stroke="#a19c92" strokeWidth={2} />
      <text textAnchor="middle" y={4} fontSize={12} fontWeight={600} fill="#2c2a26">
        {label}
      </text>
    </g>
  );
  const masa = t("Masa");
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm" aria-hidden>
      <svg viewBox="0 0 520 400" className="h-auto w-full">
        <defs>
          <pattern id="landing-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#efeae0" strokeWidth={1} />
          </pattern>
          <pattern id="landing-dance" width="24" height="24" patternUnits="userSpaceOnUse">
            <rect width="24" height="24" fill="#f8f6f1" />
            <rect width="12" height="12" fill="#efeae0" />
            <rect x="12" y="12" width="12" height="12" fill="#efeae0" />
          </pattern>
        </defs>
        <rect width="520" height="400" rx="16" fill="#fbfaf7" />
        <rect width="520" height="400" rx="16" fill="url(#landing-grid)" />
        {/* head table */}
        <g transform="translate(260 52)">
          {[-75, -25, 25, 75].map((x) => (
            <circle key={x} cx={x} cy={-24} r={11} fill="#2c2a26" />
          ))}
          <rect x={-110} y={-12} width={220} height={34} rx={8} fill="#fff" stroke="#a19c92" strokeWidth={2} />
          <text textAnchor="middle" y={9} fontSize={12} fontWeight={600} fill="#2c2a26">
            {t("Baş masa")}
          </text>
        </g>
        {/* dance floor */}
        <rect x={190} y={150} width={140} height={110} rx={4} fill="url(#landing-dance)" stroke="#b09d7d" strokeWidth={2} />
        <text x={260} y={210} textAnchor="middle" fontSize={12} fontWeight={600} letterSpacing="0.08em" fill="#5a564f">
          {t("Dans pisti").toLocaleUpperCase("tr-TR")}
        </text>
        {round(95, 170, `${masa} 1`, 8)}
        {round(95, 315, `${masa} 2`, 5)}
        {round(425, 170, `${masa} 3`, 7)}
        {round(425, 315, `${masa} 4`, 3)}
        {round(260, 330, `${masa} 5`, 6)}
      </svg>
    </div>
  );
}

/** Miniature guest page in an event theme (decorative). */
function ThemePreview({ theme, name, t }: { theme: ThemeId; name: string; t: T }) {
  const th = THEMES[theme];
  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-2xl px-4 py-5" style={{ backgroundColor: th.scale["50"], color: th.scale["900"] }} aria-hidden>
      <p className="text-[8px] tracking-[0.3em] uppercase" style={{ color: th.scale["500"] }}>
        {t("Hoş geldiniz")}
      </p>
      <p className={`text-lg leading-none ${th.heading === "display" ? "font-brand" : "font-medium tracking-tight"}`}>{name}</p>
      <div className="mt-1 w-full rounded-full py-1.5 text-center text-[9px] font-semibold text-white" style={{ backgroundColor: th.accent }}>
        {t("Fotoğraf yükle")}
      </div>
      <div className="grid w-full grid-cols-4 gap-0.5">
        {(["300", "200", "400", "200"] as const).map((step, i) => (
          <div key={i} className="aspect-square rounded-[3px]" style={{ backgroundColor: th.scale[step] }} />
        ))}
      </div>
    </div>
  );
}

function PrimaryCta({ children }: { children: ReactNode }) {
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

function PhoneMock({ t }: { t: T }) {
  return (
    <div className="relative mx-auto w-[248px] rounded-[2.4rem] border border-stone-300 bg-white p-2.5 shadow-[0_30px_60px_-30px_rgba(28,27,24,0.35)]">
      <div className="overflow-hidden rounded-[1.9rem] bg-stone-50">
        <div className="flex flex-col items-center px-5 pt-8 pb-5 text-center">
          <BrandMark className="h-5 w-5 text-stone-400" />
          <p className="mt-4 text-[9px] tracking-[0.3em] text-stone-500 uppercase">{t("12 Eylül")}</p>
          <p className="mt-1 font-brand text-2xl">Elif &amp; Can</p>
          <div className="mt-5 w-full rounded-full bg-stone-900 py-2.5 text-[11px] text-stone-50">{t("Fotoğraf yükle")}</div>
          <div className="mt-2 w-full rounded-full border border-stone-300 py-2.5 text-[11px] text-stone-700">{t("Albüme bak")}</div>
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

function TableCard({ variant, name, monogram, t }: { variant: "classic" | "monogram" | "ink"; name: string; monogram?: string; t: T }) {
  const ink = variant === "ink";
  return (
    <div
      className={`flex aspect-[3/4] flex-col items-center justify-between rounded-sm p-6 text-center shadow-[0_20px_40px_-28px_rgba(28,27,24,0.45)] ${
        ink ? "bg-stone-900 text-stone-50" : "border border-stone-200 bg-white text-stone-900"
      }`}
    >
      {variant === "monogram" ? (
        <p className="font-brand text-3xl italic">{monogram}</p>
      ) : (
        <p className={`text-[9px] tracking-[0.3em] uppercase ${ink ? "text-stone-400" : "text-stone-500"}`}>{t("Anılarınızı paylaşın")}</p>
      )}
      <div className={`rounded-sm p-2 ${ink ? "bg-stone-50 text-stone-900" : ""}`}>
        <QrGlyph className="h-20 w-20" />
      </div>
      <div>
        <p className="font-brand text-lg">{name}</p>
        <p className={`mt-1 text-[10px] ${ink ? "text-stone-400" : "text-stone-500"}`}>{t("Kodu okutun, karelerinizi bırakın")}</p>
      </div>
    </div>
  );
}

function CompareCell({ value, strong = false, t }: { value: Cell; strong?: boolean; t: T }) {
  if (value === true) return <Check className={`h-4 w-4 ${strong ? "text-stone-900" : "text-stone-500"}`} strokeWidth={1.75} aria-label={t("Var")} />;
  if (value === false) return <Minus className="h-4 w-4 text-stone-300" strokeWidth={1.75} aria-label={t("Yok")} />;
  return <span className={strong ? "text-stone-900" : "text-stone-500"}>{t(value)}</span>;
}

/* --------------------------------------------------------------------- page */

export default async function HomePage() {
  const { t } = await getServerT();
  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900">
      {/* Navigation: fixed, blends with whatever is beneath it (ivory page or ink letters). */}
      <header className="fixed inset-x-0 top-0 z-30 text-stone-50 mix-blend-difference">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
          <Link href="/" aria-label={BRAND.name}>
            <BrandLogo className="text-base" markClassName="h-6 w-6" />
          </Link>
          <nav className="hidden items-center gap-8 text-sm md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="opacity-80 transition hover:opacity-100">
                {t(n.label)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <LanguageSwitcher tone="dark" />
            <Link href="/login" className="rounded-full border border-current px-4 py-1.5 text-sm transition hover:bg-stone-50 hover:text-stone-900">
              {t("Giriş")}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero: pinned stage; scrolling flies into the "i" of the wordmark. */}
      <HeroFlyThrough>
        <div className="mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pt-24 pb-12">
          <h1 className="sr-only">{BRAND.name}</h1>
          <p className="mb-8 max-w-xl font-brand text-3xl leading-[1.1] sm:text-4xl">
            {t("Her etkinliğin fotoğrafları ve videoları, tek bir QR kodla.")}
            <span className="mt-3 block font-sans text-sm leading-relaxed font-light opacity-70">
              {t("Düğünden konferansa, doğum gününden festivale; misafirleriniz uygulama indirmeden paylaşır.")}
            </span>
          </p>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            {/* The meaning of the name: one quiet, hairline-weight line. */}
            <p className="text-[12.5px] leading-relaxed font-light tracking-[0.02em] opacity-70 sm:whitespace-nowrap">
              <span className="font-normal">mīrus / mīra</span>
              <span className="mx-2.5 opacity-60">:</span>
              {t("hayranlık uyandıran, harika, olağanüstü ve mucizevi")}
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full bg-stone-50 px-7 py-3 text-sm text-black transition hover:opacity-85"
              >
                {t("Albümünüzü oluşturun")}
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Link>
              <a href="#nasil-calisir" className="text-sm underline-offset-4 hover:underline">
                {t("Nasıl çalışır?")}
              </a>
            </div>
          </div>
        </div>
      </HeroFlyThrough>

      {/* How it works */}
      <section id="nasil-calisir" className="scroll-mt-20 bg-stone-900 text-stone-50">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <SectionHead title={t("Üç adım. Hepsi bu.")} dark />
          <ol className="grid gap-px overflow-hidden border border-stone-700 bg-stone-700 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bg-stone-900 p-8">
                <p className="font-brand text-7xl text-stone-500">{i + 1}</p>
                <h3 className="mt-8 font-brand text-2xl">{t(s.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">{t(s.text)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {CALLOUTS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-stone-400" strokeWidth={1.4} />
                <div>
                  <p className="text-sm text-stone-50">{t(title)}</p>
                  <p className="mt-1 text-sm text-stone-400">{t(text)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Built for every event */}
      <section id="etkinlikler" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 sm:py-32">
        <SectionHead
          title={t("Her etkinlik için.")}
          text={t("Etkinlik türünü seçin; tema, görevler ve misafir sayfası ona göre hazırlansın. Gerisini dilediğiniz gibi değiştirin.")}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OCCASIONS.map(({ icon: Icon, theme, title, text, chips, sample }) => (
            <article key={title} className="flex flex-col gap-5 rounded-3xl border border-stone-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-32px_rgba(28,27,24,0.45)]">
              <ThemePreview theme={theme} name={sample} t={t} />
              <div className="flex-1">
                <Icon className="h-5 w-5 text-stone-400" strokeWidth={1.4} />
                <h3 className="mt-3 font-brand text-2xl leading-tight">{t(title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{t(text)}</p>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <li key={chip} className="rounded-full border border-stone-200 px-2.5 py-1 text-[11px] text-stone-600">
                    {t(chip)}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* Guest experience */}
      <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <SectionHead title={t("Misafiriniz için otuz saniye.")}
          text={t("Kartı gördüğü andan albümü açtığı ana kadar her şey akıp gider.")}
        />
        <div className="grid gap-16 md:grid-cols-[1fr_1fr]">
          <ol className="border-t border-stone-200">
            {GUEST_JOURNEY.map((s, i) => (
              <li key={s.title} className="flex gap-6 border-b border-stone-200 py-6">
                <span className="w-6 shrink-0 pt-1 text-sm text-stone-400 tabular-nums">{i + 1}</span>
                <div>
                  <h3 className="font-brand text-2xl">{t(s.title)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-stone-600">{t(s.text)}</p>
                </div>
              </li>
            ))}
          </ol>
          <figure className="flex flex-col justify-center gap-12 md:pl-8">
            <PhoneMock t={t} />
            <blockquote className="font-brand text-3xl leading-snug text-stone-800 sm:text-4xl">
              {t("“En güzel kareler çoğu zaman misafirlerin telefonunda kalır. Onlara ulaşmanın yolu, paylaşmayı zahmetsiz kılmaktan geçer.”")}
            </blockquote>
            <figcaption className="-mt-6 text-sm text-stone-500">{t("{brand} ilkesi", { brand: BRAND.name })}</figcaption>
          </figure>
        </div>
      </section>

      {/* Cards */}
      <section className="border-t border-stone-200 bg-stone-100/60">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <SectionHead title={t("Masada sessiz bir davet.")}
            text={t("Kartınızı paneldeki atölyede tasarlayın: düğün masasından konferans salonuna, etkinliğinizin havasına uyan, baskıya hazır bir QR kart.")}
          />
          <div className="mx-auto grid max-w-3xl grid-cols-3 gap-4 sm:gap-8">
            <TableCard variant="classic" name="Elif & Can" t={t} />
            <div className="translate-y-6">
              <TableCard variant="monogram" name="Deniz 30" monogram="D · 30" t={t} />
            </div>
            <TableCard variant="ink" name="Atlas Summit ’26" t={t} />
          </div>
          <div className="mt-20 grid gap-px overflow-hidden border border-stone-200 bg-stone-200 md:grid-cols-3">
            {CARD_OPTIONS.map((o) => (
              <div key={o.title} className="bg-stone-50 p-8">
                <p className="text-xs text-stone-500">{t(o.note)}</p>
                <h3 className="mt-4 font-brand text-2xl">{t(o.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{t(o.text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="ozellikler" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 sm:py-32">
        <SectionHead title={t("Gereken her şey, fazlası değil.")} />
        <div className="grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t border-stone-200 py-6">
              <h3 className="font-brand text-2xl">{t(f.title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{t(f.text)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Seating planner */}
      <section id="oturma-plani" className="scroll-mt-20 border-t border-stone-200 bg-stone-100/60">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 sm:py-32 lg:grid-cols-2">
          <div>
            <p className="text-xs tracking-[0.25em] text-stone-500 uppercase">{t("Yeni · Oturma planı")}</p>
            <h2 className="mt-4 font-brand text-5xl leading-[1.04] sm:text-6xl">{t("Herkes doğru masada.")}</h2>
            <p className="mt-5 max-w-xl leading-relaxed text-stone-600">
              {t("Davetli listenizden salon planına, tek bir yerde. Masaları yerleştirin, misafirleri sürükleyin; plan siz çalıştıkça kaydedilir.")}
            </p>
            <div className="mt-10 grid gap-x-10 sm:grid-cols-2">
              {SEATING_POINTS.map((p) => (
                <div key={p.title} className="border-t border-stone-200 py-5">
                  <h3 className="font-brand text-2xl">{t(p.title)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{t(p.text)}</p>
                </div>
              ))}
            </div>
          </div>
          <SeatingIllustration t={t} />
        </div>
      </section>

      {/* After the event */}
      <section className="border-t border-stone-200 bg-stone-100/60">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <SectionHead
            title={t("Etkinlik bitince de bitmez.")}
            text={t("Kareler toplandıktan sonra onları paylaşmanın, saklamanın ve ölçmenin en kolay yolu.")}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AFTER_EVENT.map(({ icon: Icon, title, text, pro }) => (
              <article key={title} className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-stone-400" strokeWidth={1.4} />
                  {pro && <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-stone-50 uppercase">Pro</span>}
                </div>
                <h3 className="font-brand text-2xl leading-tight">{t(title)}</h3>
                <p className="text-sm leading-relaxed text-stone-600">{t(text)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section id="karsilastirma" className="scroll-mt-20 border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <SectionHead title={t("Neden {brand}?", { brand: BRAND.name })}
            text={t("Paylaşmak ne kadar kolaysa, albüm o kadar dolu olur. Farkı yaratan, aradaki engelleri kaldırmak.")}
          />
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-900">
                  <th className="py-4 pr-6 font-normal text-stone-500" />
                  <th className="py-4 pr-6 font-brand text-2xl font-normal">{BRAND.name}</th>
                  <th className="py-4 pr-6 font-normal text-stone-500">{t("Fotoğraf uygulamaları")}</th>
                  <th className="py-4 font-normal text-stone-500">{t("Paylaşılan albümler")}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((r) => (
                  <tr key={r.label} className="border-b border-stone-200">
                    <th scope="row" className="py-4 pr-6 font-normal text-stone-600">
                      {t(r.label)}
                    </th>
                    <td className="py-4 pr-6">
                      <CompareCell value={r.mira} strong t={t} />
                    </td>
                    <td className="py-4 pr-6">
                      <CompareCell value={r.apps} t={t} />
                    </td>
                    <td className="py-4">
                      <CompareCell value={r.shared} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing: Free and Pro */}
      <section id="paketler" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 sm:py-32">
        <SectionHead
          title={t("Ücretsiz başlayın. Pro ile markalayın.")}
          text={t("Misafir sayısı, kare sayısı ya da süre sınırı yok; dosyalarınız her pakette kendi Google Drive’ınızda.")}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-8 rounded-3xl border border-stone-200 bg-white p-8 sm:p-10">
            <div>
              <p className="text-sm text-stone-500">{t("Ücretsiz")}</p>
              <p className="mt-4 font-brand text-7xl">{t("0 ₺")}</p>
              <p className="mt-3 text-sm text-stone-600">{t("Kredi kartı yok, deneme süresi yok. Etkinliğinizi hemen kurun.")}</p>
            </div>
            <ul className="grid flex-1 content-start gap-3 text-sm text-stone-700">
              {INCLUDED.map((i) => (
                <li key={i} className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" strokeWidth={1.75} />
                  {t(i)}
                </li>
              ))}
            </ul>
            <div>
              <PrimaryCta>{t("Hemen başlayın")}</PrimaryCta>
            </div>
          </div>
          <div className="flex flex-col gap-8 rounded-3xl bg-stone-900 p-8 text-stone-50 sm:p-10">
            <div>
              <p className="inline-flex items-center gap-1.5 text-sm text-stone-400">
                <Sparkles className="h-4 w-4" strokeWidth={1.5} /> Pro
              </p>
              <p className="mt-4 font-brand text-5xl leading-tight sm:text-6xl">{t("Markanızla")}</p>
              <p className="mt-3 text-sm text-stone-400">{t("Kurumsal etkinlikler, organizatörler ve markasını öne çıkarmak isteyenler için.")}</p>
            </div>
            <ul className="grid flex-1 content-start gap-3 text-sm text-stone-200">
              {PRO_INCLUDED.map((i) => (
                <li key={i} className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" strokeWidth={1.75} />
                  {t(i)}
                </li>
              ))}
            </ul>
            <div>
              <a
                href={BRAND.salesContact || "/login"}
                className="inline-flex items-center gap-2 rounded-full bg-stone-50 px-7 py-3 text-sm text-stone-900 transition hover:bg-stone-200"
              >
                {t("Pro için iletişime geçin")}
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="sss" className="scroll-mt-20 border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 sm:py-32 md:grid-cols-[1fr_1.6fr]">
          <SectionHead title={t("Merak edilenler.")} />
          <div className="border-t border-stone-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group border-b border-stone-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-stone-900 [&::-webkit-details-marker]:hidden">
                  <span className="font-brand text-2xl">{t(f.q)}</span>
                  <Plus className="h-4 w-4 shrink-0 text-stone-400 transition group-open:rotate-45" strokeWidth={1.5} />
                </summary>
                <p className="pb-6 text-sm leading-relaxed text-stone-600">{t(f.a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-stone-900 text-stone-50">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-28 text-center sm:py-36">
          <BrandMark className="h-8 w-8 text-stone-500" />
          <h2 className="mt-10 font-brand text-5xl leading-[1.05] sm:text-6xl">
            {t("Hiçbir an kaybolmasın.")}
          </h2>
          <p className="mt-6 max-w-md text-stone-400">{t("Albümünüzü dakikalar içinde kurun; gerisini misafirleriniz tamamlasın.")}</p>
          <Link
            href="/login"
            className="mt-12 inline-flex items-center gap-2 rounded-full bg-stone-50 px-7 py-3 text-sm text-stone-900 transition hover:bg-stone-200"
          >
            {t("Albümünüzü oluşturun")}
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
                {t(n.label)}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  );
}
