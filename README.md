# Wedding QR

Misafirler masadaki QR kodu okutur, adını yazar ve fotoğraf, video ya da sesli/görüntülü mesajlarını **uygulama indirmeden** paylaşır. Tüm medya **orijinal kalitede doğrudan çiftin kişisel Google Drive’ına** gider. Ücretli paket yok, kilitli özellik yok, sıfır altyapı maliyeti.

## Özellikler

| Özellik | Nasıl çalışır |
| --- | --- |
| Sürtünmesiz yükleme | Hesap yok; isim/rumuz + kamera/galeri. Resumable (kesintide kaldığı yerden devam eden) yükleme, canlı ilerleme çubuğu, aynı anda 3 dosya. |
| Beni Bul (yüz tanıma) | `@vladmandic/face-api` tarayıcıda 128 boyutlu yüz vektörü çıkarır; Postgres `pgvector` ile Öklid mesafesi (`<->`) eşleştirmesi. Selfie cihazdan çıkmaz. |
| Canlı düğün ekranı | `/e/<slug>/live`: yeni fotoğraf/video ve notlar sayfa yenilenmeden akar, köşede QR, ekran uyanık kalır. |
| Dijital anı defteri | `MediaRecorder` ile sesli (≤3 dk) ve video (≤60 sn) mesaj, yazılı not. |
| Albüm kategorileri | Hazırlık, Nikah, İlk Dans, Masa 1… düğün sahibi düzenler. |
| Moderasyon paneli | Onay modu, gizle/göster (Drive paylaşım izni de kaldırılır), sil (Drive çöp kutusu), toplu işlem, istatistikler, yüklemeleri aç/kapat. |
| QR & masa kartı tasarlayıcı | 4 şablon, renkler, çerçeve, ortada baş harf/kalp/çift fotoğrafı, masa numarası aralığı → 300 DPI PNG ve çok sayfalı PDF (A6, A5, A4’e 4’lü). |
| Orijinal kalitede toplu indirme | Tarayıcı içinde ZIP (sunucu RAM’i kullanılmaz, >3,5 GB’ta parçalara bölünür) + Drive klasör bağlantısı. |

## Mimari

```
Misafir tarayıcısı ──POST /api/drive/upload-session──▶ Next.js ──(OAuth2, Origin)──▶ Google Drive API
                   ◀──── tek kullanımlık resumable session URI + imzalı uploadToken ─┘
Misafir tarayıcısı ──PUT (8 MB parçalar, Content-Range)────────────────────────────▶ Google Drive
Misafir tarayıcısı ──POST /api/media/confirm {fileId, yüz vektörleri}──▶ Next.js ──▶ Drive: doğrula + "anyone/reader"
                                                                                └──▶ Supabase Postgres: meta veri
Galeri <img> ──────▶ https://lh3.googleusercontent.com/d/<fileId>=s600 | =s1600   (HEIC → JPEG otomatik)
Video / ses / ZIP ─▶ /api/drive/stream/<fileId>  (Range destekli, 16 MB parçalar)
```

- Dosya baytları **asla** sunucudan geçmez (Vercel’in 4,5 MB gövde limiti ve RAM sınırı yok).
- Drive kimliği: **OAuth2 refresh token** (Service Account değil — kişisel hesapta kotası 0 GB). Kapsam `drive.file`: uygulama yalnızca kendi oluşturduğu dosya/klasörleri görür.
- Her etkinlik için otomatik klasör: `<Kök>/<Etkinlik_Adı>_<slug>/{Photos,Videos,VoiceNotes}`.
- Güvenlik: tüm tablolar RLS ile tarayıcıya kapalı; sunucu service-role ile yazar. Misafir kimliği imzalı HttpOnly çerez; yükleme onayı imzalı token + Drive `appProperties` + klasör + boyut + magic-byte kontrolü; Postgres tabanlı rate limit.

## Teknoloji

Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS 4, Zod 4, Supabase (Postgres + pgvector + Auth), Google Drive REST v3 (bağımlılıksız `fetch`), `@vladmandic/face-api`, `qrcode.react`. ZIP ve PDF üretimi için harici kütüphane yok.

## Komutlar

```bash
npm install
npm run drive:token     # Google refresh token + Drive kök klasörü üretir (.env.local'a yazabilir)
npm run dev             # http://localhost:3000
npm run lint            # ESLint (0 uyarı)
npm run typecheck       # next typegen + tsc --noEmit
npm run build           # production build
npm run check           # üçü birden
```

## Klasör yapısı

```
src/app/                 sayfalar ve API rotaları
  api/drive/             upload-session, stream/[fileId], thumb/[fileId]
  api/media/             confirm, [mediaId] (misafirin kendi silmesi)
  api/events/[slug]/     herkese açık etkinlik, galeri, anı defteri, yüz eşleştirme
  api/host/              düğün sahibi: etkinlikler, moderasyon, dışa aktarma
  e/[slug]/              misafir sayfası  ·  e/[slug]/live  canlı ekran
  dashboard/             yönetim paneli  ·  login/  giriş
src/lib/drive.ts         DriveService (OAuth2 + resumable + klasörler + izinler + stream)
src/lib/client/          tarayıcı: resumable yükleyici, ZIP ve PDF yazıcı, indirme
supabase/migrations/     veritabanı şeması (idempotent)
scripts/generate-drive-token.mjs
public/models/           face-api model ağırlıkları
```

Kurulum ve canlıya alma için: **[DEPLOYMENT.md](./DEPLOYMENT.md)**
