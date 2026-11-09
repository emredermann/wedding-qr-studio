# ARCHITECTURE.md — Sistem Mimarisi ve Tasarım Desenleri

## 1. Katmanlı Mimari Genel Bakış

Lumina, **Next.js 16 App Router** üzerinde çalışan, sunucu tarafı yetkilendirme/doğrulama katmanı ile istemci tarafı ağır medya/WebGL işleme katmanını birbirinden ayıran hibrit bir mimariye sahiptir:

1. **Edge / Request Interception Katmanı (`src/proxy.ts` & `src/lib/supabase/proxy.ts`):**
   - Gelen her HTTP isteğinde (statik dosyalar ve yüksek hacimli anonim `/api/events/*` rotaları hariç) Supabase SSR çerezlerini (`cookies`) yeniler.
   - `/admin` altındaki rotaları korur; oturumu olmayan kullanıcıları `?next=` parametresiyle `/login` sayfasına yönlendirir.
   - `/dashboard/00000000-0000-4000-8000-000000000001` (`PUBLIC_DEMO_DASHBOARD_PATH`) rotasını demo önizlemesi için açık bırakır.
2. **Backend API Katmanı (`src/app/api/**/route.ts`):**
   - `server-only` modüllerle korunan Route Handler'lardan oluşur.
   - İstek gövdesi boyutu sınırlandırması (`parseJsonBody`), Zod şema doğrulaması, IP + oturum bazlı sabit pencereli hız sınırlaması (`checkRateLimit`), HMAC-SHA256 misafir oturumu doğrulaması (`getVerifiedGuestSession`) ve Supabase RLS / Trusted Server iletişimini yürütür.
3. **Arka Plan İşlemleri (Background Jobs — `next/server` `after()`):**
   - `POST /api/upload/complete` içinde bir fotoğraf başarıyla kaydedildiğinde, yanıt istemciye hemen (`201 Created`) döndürülür; ardından Next.js `after()` API'si kullanılarak arka planda HMAC imzalı bir iç webhook isteği `POST /api/webhooks/process-media` uç noktasına gönderilir.
   - Bu arka plan işi OpenAI `gpt-4o-mini` Vision sınıflandırmasını ve 64-bit `phash` kopya tespitini asenkron olarak gerçekleştirir.
4. **İstemci Medya ve Biyometrik İşleme Katmanı (`src/lib/faceRecognition.ts`, `src/components/FaceScannerModal.tsx`, `src/components/QrCardBuilder.tsx`):**
   - WebGL tabanlı yüz tespiti (`ssdMobilenetv1`, `faceLandmark68Net`, `faceRecognitionNet`), istemci tarafı 9×8 gri tonlamalı `dHash` hesaplaması, 3-işçili eşzamanlı yükleme kuyruğu (`MAX_CONCURRENT_UPLOADS = 3`) ve 300-DPI HTML5 Canvas tabanlı QR kart çizimi tamamen tarayıcıda çalışır.
5. **Veri ve Depolama Katmanı (`Supabase PostgreSQL + pgvector` & `Cloudflare R2`):**
   - PostgreSQL veritabanı yalnızca meta verileri, JSONB akış/tema yapılandırmalarını ve 128-boyutlu `vector(128)` yüz gömmelerini tutar.
   - Medya baytları doğrudan Cloudflare R2'de (veya yerel `.local-storage/event-qr-media` dizininde) saklanır.

---

## 2. Tam Dizin ve Dosya Yapısı

```text
event-qr-studio/
├── .env.example                                  # Ortam değişkenleri şablonu
├── .github/workflows/deploy.yml                  # GitHub Pages statik dışa aktarım (export) CI/CD iş akışı
├── AGENTS.md                                     # Next.js 16 ajan kuralları (next dev tarafından yönetilir)
├── eslint.config.mjs                             # ESLint 9 flat config (next/core-web-vitals + typescript)
├── infra/
│   └── r2-cors.json                              # Cloudflare R2 bucket CORS kuralları (PUT, GET, HEAD)
├── next.config.ts                                # Next.js 16 yapılandırması (Turbopack, güvenlik başlıkları, GH Pages export modu)
├── package.json                                  # Bağımlılıklar ve betikler
├── public/
│   └── models/                                   # @vladmandic/face-api WebGL sinir ağı ağırlıkları (.bin + manifest.json)
│       ├── face_landmark_68_model-weights_manifest.json
│       ├── face_landmark_68_model.bin
│       ├── face_recognition_model-weights_manifest.json
│       ├── face_recognition_model.bin
│       ├── ssd_mobilenetv1_model-weights_manifest.json
│       └── ssd_mobilenetv1_model.bin
├── railway.json                                  # Railway Nixpacks dağıtım yapılandırması
├── scripts/
│   └── setup.mjs                                 # Supabase (0004 şeması) ve R2 / .local-storage kurulum doğrulama betiği
├── supabase/
│   └── migrations/                               # Sıralı PostgreSQL ve RLS göç dosyaları
│       ├── 0001_init_schema.sql                  # albums, co_hosts, media, media_faces, RLS, get_public_album, match_guest_faces
│       ├── 0002_event_flow_builder.sql           # profiles, is_super_admin, theme_config, flow_config, guest_registrations
│       ├── 0003_production_readiness.sql         # guard_album_billing_columns trigger, anon kısıtlamaları
│       └── 0004_private_biometric_gallery.sql    # is_trusted_server(), enforce_media_faces_cap(), api_rate_limits, consume_rate_limit()
├── tsconfig.json                                 # Strict TypeScript yapılandırması (@/* -> ./src/*)
├── vercel.json                                   # Vercel fonksiyon süre sınırları (download: 300s, process-media: 60s)
└── src/
    ├── proxy.ts                                  # Next.js 16 request proxy (oturum yenileme ve rota koruma)
    ├── app/
    │   ├── apple-icon.tsx                        # Dinamik Apple touch icon üretici
    │   ├── globals.css                           # Tailwind v4, CSS değişkenleri (--event-*) ve iOS safe-area sınıfları
    │   ├── icon.svg                              # Uygulama ikonu
    │   ├── layout.tsx                            # Kök HTML düzeni, Geist fontları ve metadata
    │   ├── page.tsx                              # Pazarlama açılış sayfası (LandingPage)
    │   ├── login/page.tsx                        # Çift / Ev sahibi giriş ve kayıt sayfası (LoginPage)
    │   ├── dashboard/
    │   │   ├── page.tsx                          # Çiftin etkinlik albümleri listesi ve yeni albüm oluşturma (CoupleDashboardPage)
    │   │   └── [albumId]/
    │   │       ├── layout.tsx                    # Statik dışa aktarım için generateStaticParams()
    │   │       └── page.tsx                      # Albüm yönetim stüdyosu: Moderation, Duplicates, QR Studio, Settings, Guests
    │   ├── admin/
    │   │   ├── page.tsx                          # Master Super-Admin kontrol merkezi (MasterSuperAdminDashboardPage)
    │   │   └── events/[albumId]/builder/
    │   │       ├── layout.tsx                    # Statik dışa aktarım için generateStaticParams()
    │   │       └── page.tsx                      # Görsel Etkinlik Akışı ve Tema Stüdyosu (EventFlowBuilderPage)
    │   ├── e/[slug]/
    │   │   ├── layout.tsx                        # Statik dışa aktarım için generateStaticParams()
    │   │   └── page.tsx                          # Misafir QR deneyimi: Onboarding adımları, yükleme kuyruğu, yüz tarama (GuestEventPage)
    │   └── api/
    │       ├── admin/events/route.ts             # GET (metrikler), PATCH (VIP ödeme), POST (klonlama), DELETE (etkinlik silme)
    │       ├── albums/route.ts                   # GET (albüm listesi), POST (yeni albüm oluşturma)
    │       ├── albums/[albumId]/route.ts         # GET (detay), PATCH (ayarlar/moderasyon/co-host), DELETE (toplu medya silme)
    │       ├── albums/[albumId]/download/route.ts# GET (Zero-RAM Streaming ZIP indirme motoru)
    │       ├── checkout/route.ts                 # POST (Stripe Checkout veya imzalı yerel simülasyon)
    │       ├── events/[slug]/route.ts            # GET (misafir etkinlik yükü), POST (kayıt), DELETE (misafirin kendi yüklemesini silmesi)
    │       ├── faces/index/route.ts              # POST (fotoğraftaki 128-d yüz vektörlerini kaydetme)
    │       ├── faces/match/route.ts              # POST (selfie vektörü ile albümde yüz eşleştirme)
    │       ├── storage/[...fileKey]/route.ts     # PUT / GET (R2 olmadığında yerel HMAC imzalı nesne depolama)
    │       ├── upload/presign/route.ts           # POST (<240s imzalı PUT URL üretimi)
    │       ├── upload/complete/route.ts          # POST (R2 HEAD + magic-byte doğrulaması ve media satırı kaydı)
    │       └── webhooks/
    │           ├── payment/route.ts              # POST (Stripe imza doğrulaması ve 24 ay paket aktivasyonu)
    │           └── process-media/route.ts        # POST (OpenAI Vision sınıflandırma ve pHash kopya tespiti)
    ├── components/
    │   ├── FaceScannerModal.tsx                  # Canlı kamera + galeri yedekli WebGL yüz tarama modalı
    │   ├── QrCardBuilder.tsx                     # 300-DPI 5x7" masa kartı, toplu masa üretimi ve SVG/PNG QR stüdyosu
    │   └── ui/
    │       ├── BrandLogo.tsx                     # BrandCrest SVG madalyonu ve BrandLogo bileşeni
    │       └── Feedback.tsx                      # useToastQueue, ToastRegion, FieldError, useModalAccessibility
    ├── lib/
    │   ├── auth.ts                               # getAuthenticatedActor() ve verifyAlbumManagerAccess()
    │   ├── demo-data.ts                          # Deterministik demo sabitleri (DEMO_ALBUM_ID, DEMO_MEDIA_ITEMS vb.)
    │   ├── env.public.ts                         # Tarayıcı güvenli ortam değişkenleri (getPublicEnv)
    │   ├── env.server.ts                         # Sunucu ortam değişkenleri Zod doğrulaması (getSupabaseServerEnv, isR2Configured)
    │   ├── faceRecognition.ts                    # loadFaceModels, extractAllFacesFromFile, extractSingleFaceFromSelfie, computeClientDifferenceHash
    │   ├── guest-session.ts                      # eqr_guest_session HMAC-SHA256 çerez imzalama ve doğrulama
    │   ├── media-config.ts                       # MIME beyaz listesi, dosya boyutu sınırları, detectMimeFromMagicBytes
    │   ├── payments.ts                           # PLAN_CATALOG, verifyWebhookSignature, computePostEventExpiration
    │   ├── phash.ts                              # hammingDistance64 ve groupDuplicateMediaByPhash
    │   ├── r2.ts                                 # S3Client R2 işlemleri ve .local-storage HMAC yedekleme motoru
    │   ├── rate-limit.ts                         # Bellek içi (Map) sabit pencereli hız sınırlayıcı (checkRateLimit)
    │   ├── vector.ts                             # 128-d L2 normalizasyonu ve pgvector dizge dönüşümü (toVectorString)
    │   ├── api/http.ts                           # jsonOk, jsonError, parseJsonBody, getDatabaseErrorCode
    │   ├── supabase/
    │   │   ├── client.ts                         # Singleton tarayıcı istemcisi (getSupabaseBrowserClient)
    │   │   ├── proxy.ts                          # updateSession() çerez yenileme ve /admin koruma mantığı
    │   │   └── server.ts                         # createSupabaseServerClient, getSupabaseAdminClient, getSupabasePrivilegedClient
    │   └── validation/
    │       ├── forms.ts                          # İstemci/sunucu ortak form doğrulayıcıları ve Türkçe karakter destekli sanitizeSlugInput
    │       └── upload.ts                         # presignUploadRequestSchema ve completeUploadRequestSchema
    └── types/
        ├── database.ts                           # Tüm tablo, RPC, API istek/yanıt ve Supabase Database generic tipleri
        └── flow.ts                               # EventThemeConfig, EventFlowConfig, normalizeThemeConfig, normalizeFlowConfig, buildThemeCssVariables
```

---

## 3. Kullanılan Tasarım Desenleri (Design Patterns)

### 3.1. Trusted Server Header & Dual-Privilege Supabase Pattern
- **Dosyalar:** `src/lib/supabase/server.ts`, `supabase/migrations/0004_private_biometric_gallery.sql`
- **Problem:** Geliştirici `.env.local` dosyasına `SUPABASE_SERVICE_ROLE_KEY` eklememiş olsa bile Next.js sunucusunun anonim istemcilerden (tarayıcılardan) ayırt edilerek RLS politikalarını güvenle geçebilmesi gerekir.
- **Çözüm:** `getSupabaseAdminClient()` her isteğe `"x-eqr-server-key": env.SUPABASE_SERVER_RPC_SECRET` başlığını ekler. PostgreSQL tarafındaki `public.is_trusted_server()` fonksiyonu ya `auth.role() = 'service_role'` olup olmadığını ya da `request.headers` içindeki `x-eqr-server-key` değerinin SHA-256 özetinin `'0d1226778c8a120ec5852b60f330eb8bd89518fcb758d6eba6d8766e0983c38e'` (`DEFAULT_SERVER_RPC_SECRET` özeti) ile eşleşip eşleşmediğini kontrol eder.

### 3.2. Dual-Backend Storage Strategy (R2 + Signed Local Filesystem Fallback)
- **Dosyalar:** `src/lib/r2.ts`, `src/app/api/storage/[...fileKey]/route.ts`
- **Çözüm:** `isR2Configured()` fonksiyonu Cloudflare R2 ortam değişkenlerini kontrol eder. Eğer R2 yapılandırılmışsa `@aws-sdk/client-s3` ve `@aws-sdk/s3-request-presigner` kullanılır. Yapılandırılmamışsa aynı fonksiyonlar (`createPresignedPutUrl`, `createPresignedGetUrl`, `headR2Object`, `readR2ObjectMagicBytes`, `deleteR2Object`) yerel `.local-storage/event-qr-media` dizinini ve HMAC-SHA256 imzalı `/api/storage/[...fileKey]` uç noktasını kullanır. Üst katmandaki hiçbir API rotası hangi depolama motorunun çalıştığını bilmek zorunda değildir.

### 3.3. Stateless Cryptographic Guest Session Pattern
- **Dosyalar:** `src/lib/guest-session.ts`
- **Çözüm:** Misafirler için veritabanında bir `sessions` tablosu tutulmaz. Bunun yerine sunucu `randomUUID()` üretir, bunu `HMAC-SHA256("eqr-session:" + sessionId, secret)` ile imzalayarak `${sessionId}.${hmacHex}` formatında `eqr_guest_session` adlı `HttpOnly`, `SameSite=Lax` çereze (veya `x-guest-session-token` başlığına) yazar. Doğrulama sabit zamanlı `crypto.timingSafeEqual` ile yapılır; istemcinin JSON gövdesinde gönderdiği imzasız `guestSessionId` asla tek başına kabul edilmez.

### 3.4. Concurrency-Bounded Worker Queue Pattern (Mobile Memory Guard)
- **Dosyalar:** `src/app/e/[slug]/page.tsx` (`pumpUploadQueue`, `activeWorkersRef`, `MAX_CONCURRENT_UPLOADS = 3`)
- **Çözüm:** Misafir telefonundan 50 adet 4K fotoğraf/video seçtiğinde tarayıcının tüm dosyaları aynı anda belleğe alıp çökmesini önlemek için `pumpUploadQueue` en fazla 3 eşzamanlı işçi (`worker`) çalıştırır. Her yükleme tamamlandığında geçici `URL.createObjectURL` önizlemesi `URL.revokeObjectURL` ile derhal bellekten temizlenir.

### 3.5. Zero-RAM PassThrough Streaming ZIP Pattern
- **Dosyalar:** `src/app/api/albums/[albumId]/download/route.ts`
- **Çözüm:** 10 GB+ boyutundaki bir düğün albümünü indirirken dosyalar sunucu belleğinde tamponlanmaz. `archiver` kütüphanesi `zlib: { level: 0 }` (STORE modu — yeniden sıkıştırma yok) ile bir Node `PassThrough` akışına bağlanır, `Readable.toWeb(passThrough)` ile Web `ReadableStream` olarak doğrudan HTTP yanıtına (`Response`) aktarılır.

### 3.6. Defensive JSONB Normalization Pattern
- **Dosyalar:** `src/types/flow.ts` (`normalizeThemeConfig`, `normalizeFlowConfig`, `buildThemeCssVariables`)
- **Çözüm:** Veritabanındaki `albums.theme_config` ve `albums.flow_config` JSONB sütunlarından gelen veriler çalışma zamanında (`runtime`) katı tip kontrollerinden geçirilir, eksik/bozuk alanlar varsayılanlarla (`DEFAULT_THEME_CONFIG`, `DEFAULT_FLOW_CONFIG`) tamamlanır, `main_hub` adımının her zaman aktif (`enabled: true`) kalması garanti edilir ve WCAG kontrast oranı (`getContrastRatio >= 4.5`) sağlanacak şekilde CSS değişkenleri üretilir.

---

## 4. Servisler Arası İletişim Protokolleri

| Kaynak | Hedef | Protokol / Mekanizma | Kimlik Doğrulama / Güvenlik |
| :--- | :--- | :--- | :--- |
| **Tarayıcı (Misafir)** | **Next.js API** | HTTPS REST (`JSON`) | `eqr_guest_session` (`HttpOnly` HMAC çerezi) + IP Rate Limit |
| **Tarayıcı (Çift / Admin)** | **Next.js API** | HTTPS REST (`JSON`) | Supabase Auth SSR Cookie (`@supabase/ssr`) |
| **Tarayıcı (Misafir)** | **Cloudflare R2** | HTTPS `PUT` (Binary Stream) | S3 Presigned URL (`X-Amz-Signature`, `< 240s` TTL, imzalı `Content-Type` ve `Content-Length`) |
| **Next.js Server** | **Supabase PostgreSQL** | HTTPS PostgREST & RPC | `SUPABASE_SERVICE_ROLE_KEY` **veya** `x-eqr-server-key` (`is_trusted_server()`) |
| **Next.js Server** | **Cloudflare R2** | HTTPS S3 API (`HEAD`, `GET Range`, `DELETE`) | AWS Signature V4 (`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`) |
| **Next.js `complete` Route** | **Next.js `process-media` Route** | İç HTTPS `POST` (`next/server` `after()`) | `X-Internal-Webhook-Signature` (`t=...,v1=...` HMAC-SHA256, 300s replay korumalı) |
| **Stripe / Local Checkout** | **Next.js `payment` Webhook** | HTTPS `POST` (`JSON`) | `Stripe-Signature` (`t=...,v1=...` HMAC-SHA256, `timingSafeEqual`) |
| **Next.js `process-media`** | **OpenAI API** | HTTPS `POST /v1/chat/completions` | `Authorization: Bearer ${OPENAI_API_KEY}` |

---

## 5. Çift Modlu Dağıtım Mimarisi (Full-Stack Server vs. GitHub Pages Static Export)

`next.config.ts` ve `.github/workflows/deploy.yml` dosyaları projeyi iki farklı modda derleyebilir:

1. **Tam Yığın Sunucu Modu (Vercel / Railway / Node.js — Varsayılan):**
   - `GITHUB_PAGES` ortam değişkeni `"true"` **değildir**.
   - `cacheComponents: true`, `partialPrefetching: true`, güvenlik başlıkları (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) ve tüm `/api/**` rotaları ile `src/proxy.ts` aktiftir.
2. **GitHub Pages Statik Önizleme Modu (`GITHUB_PAGES="true"`):**
   - `.github/workflows/deploy.yml` iş akışı derleme öncesinde `rm -rf src/app/api src/proxy.ts` komutunu çalıştırır ve `output: "export"`, `basePath: "/event-qr-studio"`, `images: { unoptimized: true }` ayarlarıyla statik HTML üretir.
   - Dinamik rotaların (`[albumId]`, `[slug]`) statik derlemede hata vermemesi için şu üç `layout.tsx` dosyasında `generateStaticParams()` tanımlanmıştır:
     - `src/app/admin/events/[albumId]/builder/layout.tsx`
     - `src/app/dashboard/[albumId]/layout.tsx`
     - `src/app/e/[slug]/layout.tsx`

---

## 6. Gelecek AI Ajanları İçin Kritik Mimari Uyarılar

> [!CAUTION]
> **R2 S3Client Checksum Ayarlarına Dokunmayın (`src/lib/r2.ts`):**
> `getR2Client()` içinde `requestChecksumCalculation: "WHEN_REQUIRED"` ve `responseChecksumValidation: "WHEN_REQUIRED"` ayarları **hayati önem taşır**. AWS SDK v3'ün güncel sürümleri varsayılan olarak presigned PUT URL'lerine `x-amz-checksum-crc32` gibi parametreler ekler; tarayıcıdaki `XMLHttpRequest` bu başlıkları üretemediği için Cloudflare R2 yüklemeleri `403 SignatureDoesNotMatch` / `400 Bad Request` ile reddeder.

> [!WARNING]
> **Dinamik Rotalardaki `layout.tsx` (`generateStaticParams`) Dosyalarını Silmeyin:**
> `src/app/dashboard/[albumId]/layout.tsx`, `src/app/admin/events/[albumId]/builder/layout.tsx` ve `src/app/e/[slug]/layout.tsx` dosyaları GitHub Actions (`deploy.yml`) üzerindeki `output: "export"` derlemesinin başarılı olması için gereklidir. Yeni bir dinamik sayfa rotası (`[param]`) eklerseniz mutlaka eşlik eden bir `generateStaticParams()` ekleyin.

> [!IMPORTANT]
> **Turbopack Dinamik `fs` Çağrıları (`/* turbopackIgnore: true */`):**
> `src/lib/r2.ts` içerisindeki yerel dosya sistemi işlemlerinde (`fs.mkdir`, `fs.writeFile`, `fs.readFile`, `fs.stat`, `fs.open`, `fs.unlink`) `/* turbopackIgnore: true */` yorum direktifi kullanılmıştır. Turbopack'in çalışma zamanı dosya anahtarlarını statik olarak çözümlemeye çalışıp derleme uyarısı/hatası vermemesi için bu yorumları koruyun.
