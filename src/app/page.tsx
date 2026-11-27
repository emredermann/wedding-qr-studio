import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Check,
  Clapperboard,
  FileBarChart,
  Frame,
  GraduationCap,
  HardDrive,
  Heart,
  Minus,
  PartyPopper,
  Plus,
  ScanLine,
  Smartphone,
  Sparkles,
  Timer,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo, BrandMark } from "@/components/brand/BrandMark";
import { HeroFlyThrough } from "@/components/landing/HeroFlyThrough";
import { InviteIllustration, SeatingIllustration } from "@/components/landing/InviteVisuals";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { BRAND } from "@/lib/brand";
import { THEMES, type ThemeId } from "@/lib/event-presets";
import { getServerT } from "@/lib/i18n/server";
import { siteUrl, socialDefaults } from "@/lib/site";
import type { MsgKey, Vars } from "@/lib/i18n/translate";

type T = (key: MsgKey, vars?: Vars) => string;

/* ------------------------------------------------------------------ content */

const NAV: Array<{ href: string; label: MsgKey }> = [
  { href: "#nasil-calisir", label: "Nasıl çalışır" },
  { href: "#etkinlikler", label: "Etkinlikler" },
  { href: "#davetiye", label: "Davetiye" },
  { href: "#ozellikler", label: "Özellikler" },
  { href: "#karsilastirma", label: "Karşılaştırma" },
  { href: "#paketler", label: "Paketler" },
  { href: "#sss", label: "Sorular" },
  { href: "/iletisim?kaynak=menu", label: "İletişim" },
];

const STEPS: Array<{ title: MsgKey; text: MsgKey }> = [
  { title: "Etkinliğinizi kurun", text: "Türünü seçin; tema, görevler ve etkinlik akışı hazır gelsin. QR kartlarınızı birkaç dakikada tasarlayıp yazdırın." },
  { title: "Misafirler okutur, paylaşır", text: "Kartı telefonun kamerasıyla okuturlar; görevlere katılır, fotoğraf, video ve mesajlarını bırakırlar." },
  { title: "Anılar sizde kalır", text: "Her kare orijinal kalitede Google Drive’ınıza ulaşır. Ardından öne çıkanlar videosu, fotokitap ve katılım raporu hazır." },
];

const CALLOUTS: Array<{ icon: typeof Smartphone; title: MsgKey; text: MsgKey }> = [
  { icon: Smartphone, title: "Uygulama yok", text: "İndirme, üyelik, şifre… Hiçbiri gerekmez." },
  { icon: ScanLine, title: "Her telefonda", text: "iPhone ya da Android; telefonun kendi kamerası yeterli." },
  { icon: Timer, title: "Birkaç saniye", text: "Okut, seç, gönder. Bu kadar." },
  { icon: HardDrive, title: "Sizin Drive’ınız", text: "Dosyalar kendi Google hesabınızda; dilediğiniz an indirin." },
];

interface Occasion {
  icon: typeof Heart;
  theme: ThemeId;
  title: MsgKey;
  text: MsgKey;
  chips: MsgKey[];
  sample: string;
  date: string;
  /** CSS background standing in for a guest photo. */
  art: string;
  /** Decorative lights on the photo: [x%, y%, size px, colour]. */
  lights: Array<[number, number, number, string]>;
  module: { eyebrow: MsgKey; line: string | MsgKey; chip: string; translate?: boolean };
}

const OCCASIONS: Occasion[] = [
  {
    icon: Heart,
    theme: "elegant",
    title: "Düğün & Nişan",
    text: "Gecenin akışı, sesli anı defteri ve zarif masa kartları. Her misafirin karesi tek bir albümde buluşur.",
    chips: ["Gecenin Akışı", "Anı Defteri", "Zarif kartlar"],
    sample: "Elif & Can",
    date: "12 · 09 · 2026",
    art: "linear-gradient(165deg, #f6e3d2 0%, #e0b596 42%, #9d7259 78%, #5d4434 100%)",
    lights: [[18, 22, 34, "rgba(255,244,222,0.75)"], [72, 30, 22, "rgba(255,236,210,0.6)"], [52, 14, 14, "rgba(255,255,255,0.7)"]],
    module: { eyebrow: "Gecenin Akışı", line: "İlk dans", chip: "21:00", translate: true },
  },
  {
    icon: Briefcase,
    theme: "corporate",
    title: "Kurumsal & Konferans",
    text: "Katılımcılar oturumlardan kareler paylaşır; görevler etkileşimi artırır, canlı ekran salonu bir araya getirir.",
    chips: ["Görevler", "Etkinlik Akışı", "Canlı ekran"],
    sample: "Atlas Summit ’26",
    date: "04 · 03 · 2026",
    art: "radial-gradient(120% 70% at 50% 0%, rgba(160,190,255,0.85) 0%, rgba(47,84,209,0.55) 38%, transparent 70%), linear-gradient(180deg, #121a33 0%, #1c2a57 60%, #0c1124 100%)",
    lights: [[50, 8, 40, "rgba(220,232,255,0.55)"], [20, 70, 10, "rgba(140,170,255,0.7)"], [80, 66, 12, "rgba(140,170,255,0.6)"]],
    module: { eyebrow: "Görevler", line: "Konuşmacıyla bir kare", chip: "2/3", translate: true },
  },
  {
    icon: PartyPopper,
    theme: "night",
    title: "Doğum günü & Özel davet",
    text: "Gece teması, eğlenceli fotoğraf görevleri ve kalplerle öne çıkan en sevilen kareler.",
    chips: ["Görevler", "Gece teması", "En sevilenler"],
    sample: "Deniz 30",
    date: "21 · 06 · 2026",
    art: "linear-gradient(160deg, #2a0f4a 0%, #5b3bd6 50%, #e86fb8 100%)",
    lights: [[16, 20, 18, "rgba(255,214,102,0.85)"], [70, 18, 12, "rgba(255,255,255,0.8)"], [84, 54, 22, "rgba(255,140,210,0.7)"], [34, 58, 10, "rgba(173,216,255,0.8)"]],
    module: { eyebrow: "Liderlik tablosu", line: "🥇 Ayşe", chip: "3/3" },
  },
  {
    icon: GraduationCap,
    theme: "minimal",
    title: "Festival & Mezuniyet",
    text: "Yüzlerce misafir, tek QR. “Beni bul” ile herkes yer aldığı kareleri saniyeler içinde bulur.",
    chips: ["Beni Bul", "Sınırsız misafir", "Orijinal kalite"],
    sample: "Mezuniyet 2026",
    date: "28 · 06 · 2026",
    art: "linear-gradient(170deg, #fde7b0 0%, #f5b46a 40%, #d9774a 70%, #5f7f6e 100%)",
    lights: [[74, 18, 38, "rgba(255,248,220,0.85)"], [22, 30, 14, "rgba(255,255,255,0.55)"]],
    module: { eyebrow: "Beni Bul", line: "14 fotoğrafta sizi bulduk", chip: "✓" },
  },
];

const AFTER_EVENT: Array<{ icon: typeof Heart; title: MsgKey; text: MsgKey }> = [
  { icon: Clapperboard, title: "Öne çıkanlar videosu", text: "En çok kalp alan karelerden müziksiz, dikey ya da yatay kısa bir video; tek dokunuşla." },
  { icon: FileBarChart, title: "Katılım raporu", text: "Kaç misafir, kaç kare, en yoğun saatler, görevler ve en sevilenler; tek sayfalık PDF." },
  { icon: Frame, title: "Paylaşım çerçeveleri", text: "Kareler etkinlik adınızla çerçevelenerek paylaşılır; orijinaller Drive’da olduğu gibi kalır." },
  { icon: BookOpen, title: "Fotokitap", text: "Seçtiğiniz karelerden kapaklı, baskıya hazır bir PDF albüm; dilediğiniz matbaada bastırın." },
];

const GUEST_JOURNEY: Array<{ title: MsgKey; text: MsgKey }> = [
  { title: "Kartı fark eder", text: "Masada, girişte ya da sahnede; etkinliğinizin havasında bir kart ve tek cümlelik bir davet." },
  { title: "Kodu okutur", text: "Kamerayı karta tutması yeterli; etkinliğinizin sayfası kendi teması ve logonuzla tek dokunuşla açılır." },
  { title: "Adını yazar", text: "Üyelik yok. Sadece hangi karenin kimden geldiğini bilesiniz diye bir isim." },
  { title: "Bir göreve katılır", text: "“Ekiple bir grup fotoğrafı” gibi küçük görevler; tamamladıkça liderlik tablosunda yükselir." },
  { title: "Paylaşır", text: "Galeriden seçer ya da o an çeker: fotoğraf, video, sesli ya da görüntülü bir mesaj." },
  { title: "Albümde kendini bulur", text: "Selfie ile yer aldığı kareleri bulur, sevdiklerine kalp bırakır, çerçeveli bir kopyasını paylaşır." },
];

const CARD_OPTIONS: Array<{ title: MsgKey; text: MsgKey; note: MsgKey }> = [
  { title: "Kart atölyesi", text: "On şablon; etkinlik türünüze göre önerilenler önde. Rengi, çerçeveyi ve yazıyı seçin, önizleme anında güncellenir.", note: "Panelde" },
  { title: "Masaya özel QR", text: "Her masanın kartı kendi QR’ını taşır; yüklemeler masa numarasıyla gelir, galeri masaya göre süzülür.", note: "İsteğe bağlı" },
  { title: "Giriş panosu", text: "Kapıya ya da sahneye tek, büyük bir QR; misafirler daha içeri girmeden paylaşmaya başlar.", note: "A4 · A3 · 50×70" },
  { title: "Baskıya hazır", text: "A6, A5 ya da bir A4’e dört kart; 300 DPI. İsterseniz yalnızca QR’ı indirip kendi davetiyenize yerleştirin.", note: "PNG · PDF" },
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

const INVITE_STEPS: Array<{ title: MsgKey; text: MsgKey }> = [
  { title: "Davetiyenizi tasarlayın", text: "Altı şablon, kendi renginiz ve metniniz. Program, kıyafet notu, harita ve “takvime ekle” hazır." },
  { title: "Herkese kendi bağlantısı", text: "Davetiye “Sevgili Ayşe,” diye açılır. Kişi sınırını siz belirlersiniz; bağlantıyı SMS’le ya da paylaşım menüsünden tek dokunuşla gönderin." },
  { title: "Yanıtlar kendiliğinden gelsin", text: "Misafir katılımını, gelecek herkesin adını ve menü tercihini yazar; son tarihe kadar değiştirebilir." },
  { title: "Drive’da tablo, salonda masa", text: "Her yanıt Google Drive’ınızdaki tabloya yazılır ve oturma planınızın misafir listesine düşer." },
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
  { label: "Dijital davetiye ve LCV", mira: true, apps: "Ayrı uygulama", shared: false },
  { label: "Oturma planı", mira: true, apps: false, shared: false },
  { label: "Dosyalar kimde kalır", mira: "Sizin Drive’ınızda", apps: "Uygulamada", shared: "Platformda" },
  { label: "Ücret", mira: "Pro paket", apps: "Çoğu zaman ücretli", shared: "Ücretsiz" },
];

const INCLUDED: MsgKey[] = [
  "Sınırsız misafir, Drive’ınız kadar yer",
  "Orijinal kalitede fotoğraf ve video",
  "Selfie ile kendini bulma",
  "Canlı ekran ve anı defteri",
  "Görevler, etkinlik akışı ve temalar",
  "Kalpler, ortak yöneticiler ve masaya özel QR",
  "QR kart atölyesi (PNG · PDF)",
  "Dijital davetiye, LCV ve Drive’da yanıt tablosu",
  "Oturma planı ve davetli listesi (Excel · PDF)",
  "Onay modu ve kategoriler",
  "Tüm albümü tek seferde indirme",
  "Depolama kendi Google Drive’ınızda",
  "Görev liderlik tablosu",
  "Öne çıkanlar videosu ve katılım raporu",
  "Marka kiti, paylaşım çerçeveleri ve fotokitap",
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
  {
    q: "Davetiye yanıtları nereye gidiyor?",
    a: "Her yanıt panelinize ve Google Drive’ınızdaki “Davetiye Yanıtları” tablosuna anında yazılır; katılanlar oturma planınızın misafir listesine eklenir. Misafir yanıtını son tarihe kadar aynı bağlantıdan değiştirebilir.",
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
    a: "Etkinlik oluşturmak ve ayarlarını yönetmek için Pro paket gerekir; Pro’da tüm özellikler açıktır, misafir ya da kare sınırı yoktur. Ortak yönetici olarak davet edildiğiniz etkinlikleri ücretsiz hesapla yönetebilirsiniz. Dosyalar kendi Google Drive’ınızda durduğu için depolama size ek maliyet çıkarmaz.",
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

/** Miniature guest page in an event theme (decorative). */
/** A guest page in an event theme, shown on a phone that rises out of a soft glow (decorative). */
function EventScreen({ occasion, t }: { occasion: Occasion; t: T }) {
  const th = THEMES[occasion.theme];
  const ink = th.scale["900"];
  const muted = th.scale["500"];
  const line = occasion.module.translate ? t(occasion.module.line as MsgKey) : occasion.module.line;
  return (
    <div
      className="relative h-[19rem] overflow-hidden"
      style={{ background: `radial-gradient(90% 70% at 50% 100%, ${th.accent}33 0%, transparent 70%), ${th.scale["100"]}` }}
      aria-hidden
    >
      <div
        className="absolute top-7 left-1/2 w-[196px] -translate-x-1/2 rounded-[2rem] p-[7px] shadow-[0_30px_60px_-24px_rgba(0,0,0,0.45)] transition duration-500 group-hover:-translate-y-1.5"
        style={{ backgroundColor: th.dark ? "#2a2834" : "#ffffff", border: `1px solid ${th.scale["200"]}` }}
      >
        <div className="overflow-hidden rounded-[1.55rem]" style={{ backgroundColor: th.scale["50"], color: ink }}>
          <div className="flex items-center justify-between px-4 pt-2.5 text-[7px] font-semibold" style={{ color: muted }}>
            <span>9:41</span>
            <span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: th.scale["200"] }} />
          </div>
          <div className="px-3.5 pt-2.5 pb-2">
            <p className={`truncate text-[15px] leading-tight ${th.heading === "display" ? "font-brand" : "font-semibold tracking-tight"}`}>{occasion.sample}</p>
            <p className="mt-0.5 text-[7.5px] tracking-[0.18em]" style={{ color: muted }}>
              {occasion.date}
            </p>
          </div>
          <div className="relative mx-2.5 aspect-[4/3] overflow-hidden rounded-xl" style={{ background: occasion.art }}>
            {occasion.lights.map(([x, y, size, color], i) => (
              <span key={i} className="absolute rounded-full blur-[1px]" style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: color }} />
            ))}
            <span className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.38), transparent)" }} />
            <span className="absolute bottom-1.5 left-2 text-[7px] font-medium text-white/90">Ayşe</span>
            <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/40 px-1.5 py-0.5 text-[7px] text-white backdrop-blur-sm">♥ 24</span>
          </div>
          <div className="mx-2.5 mt-2 flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ backgroundColor: th.surface, border: `1px solid ${th.scale["200"]}` }}>
            <span className="h-5 w-5 shrink-0 rounded-lg" style={{ backgroundColor: th.accent }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[6px] font-semibold tracking-[0.14em] uppercase" style={{ color: muted }}>
                {t(occasion.module.eyebrow)}
              </span>
              <span className="block truncate text-[8.5px]">{line}</span>
            </span>
            <span className="rounded-full px-1.5 py-0.5 text-[7px] tabular-nums" style={{ backgroundColor: th.scale["100"], color: th.scale["700"] }}>
              {occasion.module.chip}
            </span>
          </div>
          <div className="mx-2.5 mt-2 rounded-xl py-2.5 text-center text-[8.5px] font-semibold text-white" style={{ backgroundColor: th.accent }}>
            {t("Fotoğraf yükle")}
          </div>
          <div className="grid grid-cols-3 gap-[3px] px-2.5 pt-2 pb-3">
            {[0.9, 0.55, 0.75].map((o, i) => (
              <span key={i} className="aspect-square rounded-md" style={{ background: occasion.art, opacity: o }} />
            ))}
          </div>
        </div>
      </div>
      {/* Fade into the card so the phone reads as rising out of it. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: `linear-gradient(to top, ${th.scale["100"]}, transparent)` }} />
    </div>
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

const TILE_TONES = ["bg-stone-300", "bg-amber-200", "bg-stone-400", "bg-stone-200", "bg-amber-100", "bg-stone-300"];

/** Decorative guest page: tasks card with progress, upload button, gallery with hearts. */
function PhoneMock({ t }: { t: T }) {
  const tasks: Array<[MsgKey, boolean]> = [
    ["Ekiple bir grup fotoğrafı", true],
    ["Sahneden bir kare", false],
    ["Günün en komik anı", false],
  ];
  return (
    <div className="relative mx-auto w-[260px] rounded-[2.4rem] border border-stone-300 bg-white p-2.5 shadow-[0_30px_60px_-30px_rgba(28,27,24,0.35)]" aria-hidden>
      <div className="overflow-hidden rounded-[1.9rem] bg-stone-50">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 pt-6 pb-3">
          <div>
            <p className="font-brand text-lg leading-none">Elif &amp; Can</p>
            <p className="mt-1 text-[8px] text-stone-500">{t("12 Eylül")}</p>
          </div>
          <span className="rounded-full border border-stone-200 px-2 py-0.5 text-[8px] text-stone-600">Ayşe ✎</span>
        </div>
        <div className="space-y-2.5 p-3">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-stone-900 text-[10px] text-white">◎</span>
              <div className="min-w-0 flex-1">
                <p className="text-[7px] font-semibold tracking-wider text-stone-500 uppercase">{t("Görevler")}</p>
                <p className="truncate text-[9px] text-stone-800">{t("Bir görev seçin, anı yakalayın")}</p>
              </div>
              <span className="rounded-full bg-stone-100 px-1.5 text-[8px] text-stone-600">1/3</span>
            </div>
            <div className="h-0.5 bg-stone-100">
              <div className="h-full w-1/3 bg-stone-900" />
            </div>
            {tasks.map(([task, done]) => (
              <div key={task} className="flex items-center gap-2 border-t border-stone-100 px-3 py-1.5">
                <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] ${done ? "bg-stone-900 text-white" : "border border-stone-300"}`}>{done ? "✓" : ""}</span>
                <span className={`flex-1 truncate text-[8.5px] ${done ? "text-stone-400" : "text-stone-700"}`}>{t(task)}</span>
                <span className="text-[7.5px] font-semibold text-stone-900">{done ? "" : t("Katıl")}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-stone-900 py-3 text-center text-[10px] text-stone-50">{t("Fotoğraf yükle")}</div>
          <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-xl">
            {TILE_TONES.map((tone, i) => (
              <div key={i} className={`relative aspect-square ${tone}`}>
                {i < 3 && <span className="absolute right-0.5 bottom-0.5 rounded-full bg-black/45 px-1 text-[6.5px] text-white">♥ {[12, 8, 5][i]}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A tent card standing on the table: printed face, fold shadow and contact shadow (decorative). */
function TentCard({ variant, t }: { variant: "wedding" | "party" | "corporate"; t: T }) {
  const face =
    variant === "wedding"
      ? { bg: "#fbf8f2", fg: "#2b2620", muted: "#9a7b52" }
      : variant === "party"
        ? { bg: "#17122a", fg: "#f4f0ff", muted: "#c9b2ff" }
        : { bg: "#ffffff", fg: "#0f1b2d", muted: "#2f54d1" };
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-[6px] shadow-[0_2px_0_rgba(0,0,0,0.04),0_30px_40px_-24px_rgba(40,30,20,0.55)]" style={{ backgroundColor: face.bg, color: face.fg }}>
        {/* Fold at the top of a tent card. */}
        <span className="absolute inset-x-0 top-0 h-3" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.12), transparent)" }} />
        <div className="flex aspect-[3/4] flex-col items-center justify-between px-5 pt-7 pb-6 text-center">
          {variant === "wedding" && (
            <>
              <span className="pointer-events-none absolute inset-2.5 rounded-[3px] border" style={{ borderColor: `${face.muted}66` }} />
              <span className="pointer-events-none absolute inset-[13px] rounded-[2px] border" style={{ borderColor: `${face.muted}33` }} />
              <svg viewBox="0 0 80 18" className="h-4 w-16" style={{ color: face.muted }} aria-hidden>
                <path d="M2 9h28M50 9h28" stroke="currentColor" strokeWidth="0.8" />
                <path d="M40 2c3 3 3 11 0 14c-3-3-3-11 0-14z" fill="currentColor" opacity="0.7" />
                <circle cx="33" cy="9" r="1.4" fill="currentColor" />
                <circle cx="47" cy="9" r="1.4" fill="currentColor" />
              </svg>
            </>
          )}
          {variant === "party" && (
            <>
              {[
                [12, 14, "#ffd166"], [82, 10, "#ff8fd1"], [70, 30, "#9ad7ff"], [20, 44, "#c9b2ff"], [88, 62, "#ffd166"], [10, 78, "#ff8fd1"], [76, 86, "#9ad7ff"],
              ].map(([x, y, c], k) => (
                <span key={k} className="absolute h-1.5 w-1.5 rounded-full" style={{ left: `${x}%`, top: `${y}%`, backgroundColor: String(c) }} />
              ))}
              <p className="relative font-brand text-3xl italic" style={{ color: "#ffd98a" }}>
                D · 30
              </p>
            </>
          )}
          {variant === "corporate" && (
            <div className="absolute inset-x-0 top-0 flex h-9 items-center gap-2 px-4" style={{ backgroundColor: face.muted }}>
              <span className="h-3.5 w-3.5 rounded-[4px] bg-white/90" />
              <span className="text-[9px] font-bold tracking-[0.2em] text-white">ATLAS</span>
            </div>
          )}
          {variant !== "party" && (
            <p className={`relative text-[8.5px] tracking-[0.28em] uppercase ${variant === "corporate" ? "mt-7" : ""}`} style={{ color: face.muted }}>
              {t(variant === "wedding" ? "Anılarınızı paylaşın" : "Etkinlik Anılarınız Burada")}
            </p>
          )}
          <div className="relative rounded-md bg-white p-2 text-stone-900 shadow-sm">
            <QrGlyph className="h-[4.5rem] w-[4.5rem]" />
          </div>
          <div className="relative">
            <p className={variant === "corporate" ? "text-[15px] font-semibold tracking-tight" : "font-brand text-xl italic"}>
              {variant === "wedding" ? "Elif & Can" : variant === "party" ? t("Parti Anılarınız Burada") : "Atlas Summit ’26"}
            </p>
            <p className="mt-1 text-[9px] tracking-[0.18em] uppercase" style={{ color: face.muted }}>
              {variant === "wedding" ? t("Masa {n}", { n: 4 }) : t("Kodu okutun, karelerinizi bırakın")}
            </p>
          </div>
        </div>
      </div>
      {/* Contact shadow on the table. */}
      <span className="absolute -bottom-3 left-1/2 h-4 w-[85%] -translate-x-1/2 rounded-[50%] bg-black/20 blur-md" aria-hidden />
    </div>
  );
}

function CompareCell({ value, strong = false, t }: { value: Cell; strong?: boolean; t: T }) {
  if (value === true) return <Check className={`h-4 w-4 ${strong ? "text-stone-900" : "text-stone-500"}`} strokeWidth={1.75} aria-label={t("Var")} />;
  if (value === false) return <Minus className="h-4 w-4 text-stone-300" strokeWidth={1.75} aria-label={t("Yok")} />;
  return <span className={strong ? "text-stone-900" : "text-stone-500"}>{t(value)}</span>;
}

/* --------------------------------------------------------------------- page */

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getServerT();
  const social = socialDefaults(lang);
  // Search results, the browser tab and share cards all show just the brand name.
  const title = BRAND.name;
  const description = t(
    "Misafirleriniz QR kodu okutur; düğün, nişan ve etkinlik fotoğraf ve videoları uygulama indirmeden, orijinal kalitede Google Drive’ınıza gelir. Dijital davetiye, LCV ve oturma planı da Mira’da.",
  );
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    openGraph: { ...social.openGraph, url: "/", title, description },
    twitter: { ...social.twitter, title, description },
  };
}

/**
 * Structured data for Google: who we are (Organization), the site
 * (WebSite), the product (SoftwareApplication) and the FAQ shown on the page.
 */
function JsonLd({ t }: { t: T }) {
  const base = siteUrl();
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${base}/#organization`, name: BRAND.name, url: `${base}/`, logo: `${base}/icon.svg` },
      { "@type": "WebSite", "@id": `${base}/#website`, url: `${base}/`, name: BRAND.name, inLanguage: "tr-TR", publisher: { "@id": `${base}/#organization` } },
      {
        "@type": "SoftwareApplication",
        name: BRAND.name,
        url: `${base}/`,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web, iOS, Android",
        description: t(BRAND.description),
        publisher: { "@id": `${base}/#organization` },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: t(q), acceptedAnswer: { "@type": "Answer", text: t(a) } })),
      },
    ],
  };
  // "<" is escaped so no answer text can close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export default async function HomePage() {
  const { t } = await getServerT();
  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900">
      <JsonLd t={t} />
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

          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              {/* The page's single H1: what Mira does, in the words people search for. */}
              <h1 className="text-lg leading-snug font-normal tracking-[-0.01em] sm:text-xl">
                <span className="sr-only">{BRAND.name}: </span>
                {t("Her etkinliğin fotoğrafları ve videoları, tek bir QR kodla.")}
              </h1>
              <p className="mt-1.5 text-[13px] leading-relaxed font-light opacity-70">{t("Düğünden konferansa, doğum gününden festivale; misafirleriniz uygulama indirmeden paylaşır.")}</p>
              {/* The meaning of the name: one quiet, hairline-weight line. */}
              <p className="mt-4 text-[12px] leading-relaxed font-light tracking-[0.02em] opacity-55">
                <span className="font-normal">mīrus / mīra</span>
                <span className="mx-2.5 opacity-60">:</span>
                {t("hayranlık uyandıran, harika, olağanüstü ve mucizevi")}
              </p>
            </div>
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
          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
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
          {OCCASIONS.map((occasion) => {
            const { icon: Icon, title, text, chips } = occasion;
            return (
              <article
                key={title}
                className="group flex flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_32px_64px_-36px_rgba(28,27,24,0.5)]"
              >
                <EventScreen occasion={occasion} t={t} />
                <div className="flex flex-1 flex-col gap-3 p-6">
                  <Icon className="h-5 w-5 text-stone-400" strokeWidth={1.4} />
                  <h3 className="font-brand text-2xl leading-tight">{t(title)}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-stone-600">{t(text)}</p>
                  <ul className="flex flex-wrap gap-1.5 pt-1">
                    {chips.map((chip) => (
                      <li key={chip} className="rounded-full border border-stone-200 px-2.5 py-1 text-[11px] text-stone-600">
                        {t(chip)}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
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
            text={t("Etkinlik türünüze göre önerilen şablonlarla başlayın: düğün masasından konferans salonuna, masa kartı, giriş panosu ya da sadece QR; hepsi baskıya hazır.")}
          />
          {/* A tabletop: linen surface, three tent cards in the real template palettes. */}
          <div
            className="relative overflow-hidden rounded-[2rem] px-6 pt-14 pb-20 sm:px-12"
            style={{
              background:
                "radial-gradient(120% 80% at 50% 0%, #fdfbf7 0%, #efe8dc 55%, #e2d8c8 100%), repeating-linear-gradient(90deg, rgba(0,0,0,0.015) 0 2px, transparent 2px 5px)",
              backgroundBlendMode: "multiply",
            }}
            aria-hidden
          >
            <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/[0.06] to-transparent" />
            <div className="relative mx-auto grid max-w-3xl grid-cols-3 items-end gap-4 sm:gap-10">
              <div className="-rotate-[4deg] transition duration-500 hover:rotate-0">
                <TentCard variant="wedding" t={t} />
              </div>
              <div className="-translate-y-6 transition duration-500 hover:-translate-y-8">
                <TentCard variant="party" t={t} />
              </div>
              <div className="rotate-[3deg] transition duration-500 hover:rotate-0">
                <TentCard variant="corporate" t={t} />
              </div>
            </div>
          </div>
          <div className="mt-20 grid gap-px overflow-hidden border border-stone-200 bg-stone-200 md:grid-cols-2 lg:grid-cols-4">
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

      {/* Invitations & RSVP */}
      <section id="davetiye" className="scroll-mt-20 border-t border-stone-200 bg-[#f3efe7]">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <p className="text-xs tracking-[0.25em] text-stone-500 uppercase">{t("Yeni · Davetiye & LCV")}</p>
              <h2 className="mt-4 font-brand text-5xl leading-[1.04] sm:text-6xl">{t("Davetiyeden masaya, tek yerde.")}</h2>
              <p className="mt-5 max-w-xl leading-relaxed text-stone-600">
                {t("Kişiye özel dijital davetiyenizi gönderin; yanıtlar kendiliğinden gelsin, Drive’daki tabloya yazılsın ve oturma planınıza dökülsün.")}
              </p>
              <Link href="/davetiye" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-stone-900 underline-offset-4 hover:underline">
                {t("Davetiye şablonlarını görün")} <ArrowRight className="h-4 w-4" />
              </Link>
              <ol className="mt-8 space-y-0">
                {INVITE_STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-5 border-t border-stone-300/70 py-5">
                    <span className="font-brand text-3xl leading-none text-stone-400 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3 className="font-brand text-2xl">{t(s.title)}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-stone-600">{t(s.text)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <InviteIllustration t={t} />
          </div>
        </div>
      </section>

      {/* Seating planner */}
      <section id="oturma-plani" className="scroll-mt-20 border-t border-stone-200 bg-stone-100/60">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 sm:py-32 lg:grid-cols-2">
          <div>
            <p className="text-xs tracking-[0.25em] text-stone-500 uppercase">{t("Oturma planı")}</p>
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
            {AFTER_EVENT.map(({ icon: Icon, title, text }) => (
              <article key={title} className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-6">
                <Icon className="h-5 w-5 text-stone-400" strokeWidth={1.4} />
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

      {/* Pricing: Pro creates and manages events; free accounts keep using what they have */}
      <section id="paketler" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 sm:py-32">
        <SectionHead
          title={t("Pro ile etkinliğinizi kurun.")}
          text={t("Tüm özellikler Pro pakette. Misafir, kare ya da süre sınırı yok; dosyalarınız kendi Google Drive’ınızda.")}
        />
        <div className="flex flex-col gap-10 rounded-3xl bg-stone-900 p-8 text-stone-50 sm:p-12">
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm text-stone-400">
              <Sparkles className="h-4 w-4" strokeWidth={1.5} /> Pro
            </p>
            <p className="mt-4 font-brand text-5xl leading-tight sm:text-6xl">{t("Her şey dahil")}</p>
            <p className="mt-3 text-sm text-stone-400">{t("Etkinlik oluşturun, ayarlarını yönetin ve tüm araçları kullanın.")}</p>
          </div>
          <ul className="grid content-start gap-x-10 gap-y-3.5 text-sm text-stone-200 sm:grid-cols-2 lg:grid-cols-3">
            {INCLUDED.map((i) => (
              <li key={i} className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" strokeWidth={1.75} />
                {t(i)}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/iletisim?kaynak=pro"
              className="inline-flex items-center gap-2 rounded-full bg-stone-50 px-7 py-3 text-sm text-stone-900 transition hover:bg-stone-200"
            >
              {t("Pro için iletişime geçin")}
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full border border-stone-600 px-7 py-3 text-sm text-stone-100 transition hover:border-stone-300">
              {t("Giriş yapın")}
            </Link>
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
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-stone-50 px-7 py-3 text-sm text-stone-900 transition hover:bg-stone-200"
            >
              {t("Albümünüzü oluşturun")}
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
            <Link href="/iletisim?kaynak=ana-sayfa" className="inline-flex items-center gap-2 rounded-full border border-stone-600 px-7 py-3 text-sm text-stone-100 transition hover:border-stone-300">
              {t("Detaylı bilgi için iletişime geçin")}
            </Link>
          </div>
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
