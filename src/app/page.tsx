import { BookHeart, Camera, Download, Heart, MonitorPlay, QrCode, ScanFace, ShieldCheck } from "lucide-react";
import Link from "next/link";

const FEATURES = [
  { icon: Camera, title: "Uygulamasız yükleme", text: "Misafirler QR’ı okutur, adını yazar ve tek dokunuşla fotoğraf/video yükler. Hesap yok, indirme yok." },
  { icon: ScanFace, title: "Beni Bul (yapay zekâ)", text: "Misafir selfie çeker, sadece kendisinin olduğu fotoğrafları görür. Yüz analizi tarayıcıda yapılır." },
  { icon: MonitorPlay, title: "Canlı etkinlik ekranı", text: "Yeni fotoğraflar ve mesajlar salondaki projeksiyonda ya da ekranda sayfa yenilenmeden akar." },
  { icon: BookHeart, title: "Sesli & görüntülü anı defteri", text: "Misafirler tarayıcıdan sesli mesaj, video mesaj ya da yazılı not bırakır." },
  { icon: QrCode, title: "QR & masa kartı tasarlayıcı", text: "Renk, çerçeve, baş harfler, logo ya da fotoğrafla 300 DPI PNG/PDF masa ve davet kartları." },
  { icon: Download, title: "Orijinal kalitede indirme", text: "Sıkıştırma yok. Tek tıkla tüm albümü ZIP olarak indirin ya da Drive klasörünü açın." },
  { icon: ShieldCheck, title: "Moderasyon paneli", text: "Onay modu, gizleme, silme, kategoriler (Sahne, Masa 1, After Party…) ve istatistikler." },
  { icon: Heart, title: "Tamamen ücretsiz", text: "Ücretli paket yok, kilitli özellik yok. Tüm medya kendi Google Drive’ınızda saklanır." },
];

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2">
          <Heart className="h-6 w-6 fill-amber-600 text-amber-600" />
          <span className="font-serif text-xl">Wedding QR</span>
        </span>
        <Link href="/dashboard" className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white">
          Panele git
        </Link>
      </header>

      <section className="mx-auto max-w-4xl px-5 pt-12 pb-16 text-center">
        <p className="text-xs font-semibold tracking-[0.3em] text-amber-700 uppercase">Etkinlik fotoğraf paylaşımı</p>
        <h1 className="mt-4 font-serif text-5xl leading-tight sm:text-6xl">Her misafirin objektifinden, tek bir albüm.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-stone-600">
          Düğün, nişan, doğum günü, mezuniyet ya da şirket etkinliği — masalara QR kart koyun, misafirler fotoğraf, video ve mesajlarını anında paylaşsın. Hepsi orijinal kalitede doğrudan sizin Google Drive’ınıza.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="rounded-full bg-amber-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-900/20">
            Event sahibi girişi
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-3xl border border-stone-200 bg-white p-5">
            <Icon className="h-6 w-6 text-amber-700" />
            <h2 className="mt-3 font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{text}</p>
          </article>
        ))}
      </section>

      <footer className="border-t border-stone-200 py-8 text-center text-xs text-stone-500">
        Wedding QR · Medyalarınız yalnızca sizin Google Drive hesabınızda saklanır.
      </footer>
    </main>
  );
}
