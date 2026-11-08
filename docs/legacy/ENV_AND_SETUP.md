# ENV_AND_SETUP.md — Kurulum, Ortam Değişkenleri, Göçler ve Doğrulama Rehberi

## 1. Ön Gereksinimler (Prerequisites)
- **Node.js:** `v20.x` veya üzeri
- **Paket Yöneticisi:** `npm` (`package-lock.json` mevcuttur)
- **İsteğe Bağlı Bulut Hesapları:**
  - **Supabase Projesi:** PostgreSQL + Auth + `pgvector` eklentisi (yapılandırılmazsa uygulama deterministik Demo Modunda çalışır).
  - **Cloudflare R2 Bucket:** S3 uyumlu medya depolama (yapılandırılmazsa uygulama otomatik olarak `.local-storage/wedding-qr-media` altında HMAC-SHA256 imzalı yerel depolama motorunu kullanır).
  - **OpenAI API Key:** `gpt-4o-mini` Vision fotoğraf sınıflandırması için (yapılandırılmazsa deterministik URL/dosya adı sınıflandırma yedeği devreye girer).
  - **Stripe Hesabı:** Canlı ödeme oturumları için (yapılandırılmazsa HMAC imzalı yerel ödeme simülasyonu devreye girer).

---

## 2. Ortam Değişkenleri Referansı (`.env.local`)

`.env.example` dosyasını `.env.local` olarak kopyalayın (`cp .env.example .env.local`). Tüm ortam değişkenleri ve doğrulama kuralları (`src/lib/env.public.ts` & `src/lib/env.server.ts`) aşağıda listelenmiştir:

| Değişken Adı | Kapsam | Zorunluluk / Varsayılan | Doğrulama Kuralı ve Açıklama |
| :--- | :--- | :--- | :--- |
| **`NEXT_PUBLIC_SUPABASE_URL`** | Public (Browser + Server) | Zorunlu (`z.url()`) | Supabase proje URL'i (`https://<ref>.supabase.co`). `src/lib/env.public.ts` içinde literal `process.env.NEXT_PUBLIC_SUPABASE_URL` olarak okunur. |
| **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | Public (Browser + Server) | Zorunlu (`min(20)`) | Supabase anon/publishable anahtarı. RLS kurallarına tabidir. |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Server-Only | Opsiyonel (`min(20)`) | Supabase `service_role` gizli anahtarı. Tanımlanmazsa `getSupabaseAdminClient()` otomatik olarak `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `x-wqr-server-key` başlığına (`is_trusted_server()`) düşer. |
| **`SUPABASE_SERVER_RPC_SECRET`** | Server-Only | Opsiyonel (`min(32)`) | Varsayılan: `"wqr_srv_9f4e2a8c1d7b6e3f5a0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c"`. `x-wqr-server-key` başlığında gönderilir ve `0004_private_biometric_gallery.sql` içindeki `public.is_trusted_server()` fonksiyonundaki SHA-256 özetiyle doğrulanır. |
| **`R2_ACCOUNT_ID`** | Server-Only | Opsiyonel (R2 için zorunlu) | `^[a-f0-9]{32}$` formatında 32 karakterlik Cloudflare hesap kimliği. |
| **`R2_ACCESS_KEY_ID`** | Server-Only | Opsiyonel (`min(16)`) | Cloudflare R2 S3 API Access Key ID. |
| **`R2_SECRET_ACCESS_KEY`** | Server-Only | Opsiyonel (`min(32)`) | Cloudflare R2 S3 API Secret Access Key. |
| **`R2_BUCKET`** | Server-Only | Opsiyonel | Varsayılan: `"wedding-qr-media"`. `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$` formatında bucket adı. |
| **`R2_PUBLIC_URL`** | Server-Only | Opsiyonel (R2 için zorunlu) | `https://...` (veya `http://localhost...`) ile başlayan R2 genel erişim taban URL'i (sondaki `/` otomatik temizlenir). |
| **`GUEST_SESSION_SECRET`** | Server-Only | Opsiyonel | `wqr_guest_session` çerezi ve yerel depolama URL'lerini imzalamak için kullanılan HMAC sırrı. Tanımlanmazsa sırasıyla `SUPABASE_SERVICE_ROLE_KEY` -> `R2_SECRET_ACCESS_KEY` -> `STRIPE_WEBHOOK_SECRET` -> yerleşik sabite düşer. |
| **`OPENAI_API_KEY`** | Server-Only | Opsiyonel | `POST /api/webhooks/process-media` içindeki `gpt-4o-mini` Vision fotoğraf kategorizasyonu için kullanılır. |
| **`STRIPE_SECRET_KEY`** | Server-Only | Opsiyonel | `POST /api/checkout` içinde gerçek Stripe Checkout oturumu oluşturmak için kullanılır. |
| **`STRIPE_WEBHOOK_SECRET`** | Server-Only | Opsiyonel | `POST /api/webhooks/payment` içinde `Stripe-Signature` HMAC doğrulaması için kullanılır. |
| **`GITHUB_PAGES`** | Build-Time | Opsiyonel (`"true"`) | Yalnızca GitHub Pages statik dışa aktarım (`output: "export"`) derlemesinde `"true"` yapılır. Yerel geliştirmede veya Vercel/Railway'de **tanımlanmamalıdır**. |
| **`NEXT_PUBLIC_BASE_PATH`** | Build-Time | Opsiyonel | `GITHUB_PAGES="true"` olduğunda varsayılan olarak `"/wedding-qr-studio"` değerini alır. |

---

## 3. Projeyi Yerelde Ayağa Kaldırma Adımları

### Adım 1: Bağımlılıkları Yükleyin
```bash
npm install
```

### Adım 2: Ortam Değişkenlerini Hazırlayın
```bash
cp .env.example .env.local
```
`.env.local` dosyasını açıp en azından `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` değerlerini girin.

### Adım 3: Veri Tabanı Göçlerini (Migrations) Uygulayın
`supabase/migrations/` dizinindeki 4 SQL dosyasını **kesinlikle sırasıyla** Supabase SQL Editor üzerinden veya Supabase CLI (`supabase db push`) ile çalıştırın:
1. `supabase/migrations/0001_init_schema.sql` — Çekirdek tablolar (`albums`, `co_hosts`, `media`, `media_faces`), `pgvector` eklentisi, temel RLS politikaları ve `get_public_album` / `match_guest_faces` RPC'leri.
2. `supabase/migrations/0002_event_flow_builder.sql` — `profiles` tablosu, `on_auth_user_created` tetikleyicisi, `is_super_admin()`, `albums.theme_config` & `flow_config` JSONB sütunları ve `guest_registrations` tablosu.
3. `supabase/migrations/0003_production_readiness.sql` — `guard_album_billing_columns()` tetikleyicisi ve Super-Admin güncelleme politikaları.
4. `supabase/migrations/0004_private_biometric_gallery.sql` — `is_trusted_server()`, `enforce_media_faces_cap()` (fotoğraf başı 25 yüz sınırı), güncellenmiş `match_guest_faces` (varsayılan `0.82` eşik, `guest_name: null` maskeleme) ve `api_rate_limits` / `consume_rate_limit()`.

### Adım 4: Kurulum ve R2 / Yerel Depolama Doğrulama Betiğini Çalıştırın
```bash
npm run setup
```
`scripts/setup.mjs` betiği şunları otomatik olarak yapar:
1. Supabase bağlantısını, `get_public_album` RPC'sini ve `0004` göçündeki `is_trusted_server()` yetkisini test eder.
2. Eğer Cloudflare R2 anahtarları `.env.local` içinde tanımlıysa bucket erişimini (`HeadBucketCommand`) doğrular ve `infra/r2-cors.json` içindeki CORS kurallarını (`PutBucketCorsCommand`) otomatik olarak bucket'a uygular.
3. Eğer R2 anahtarları tanımlı değilse `.local-storage/wedding-qr-media` dizinini oluşturarak HMAC imzalı yerel depolama motorunu hazırlar.

### Adım 5: Geliştirme Sunucusunu Başlatın
```bash
npm run dev
```
Uygulama `http://localhost:3000` adresinde açılır:
- Pazarlama Sayfası: `http://localhost:3000/`
- Giriş / Kayıt: `http://localhost:3000/login`
- Çift Paneli (Dashboard): `http://localhost:3000/dashboard`
- Demo Albüm Stüdyosu: `http://localhost:3000/dashboard/00000000-0000-4000-8000-000000000001`
- Master Super-Admin Paneli: `http://localhost:3000/admin`
- Görsel Akış ve Tema Stüdyosu: `http://localhost:3000/admin/events/00000000-0000-4000-8000-000000000001/builder`
- Misafir QR Deneyimi (Demo): `http://localhost:3000/e/demo-wedding`

---

## 4. Kalite Kontrol, Tip Denetimi ve Derleme Komutları

Projede birim testi çerçevesi yerine uçtan uca katı TypeScript denetimi, ESLint 9 kuralları, `npm run setup` altyapı doğrulaması ve üretim derlemesi (`next build`) kullanılır:

```bash
# 1. TypeScript katı tip kontrolü (sıfır hata olmalıdır)
npx tsc --noEmit

# 2. ESLint kod kalitesi ve Next.js kuralları kontrolü
npm run lint

# 3. Supabase şeması ve R2 / yerel depolama entegrasyon testi
npm run setup

# 4. Tam üretim derlemesi (Turbopack / Next.js 16)
npm run build
```

---

## 5. Gelecek AI Ajanları İçin Kritik Kurulum ve Ortam Uyarıları

> [!CAUTION]
> **`src/lib/env.public.ts` İçinde Dinamik `process.env[key]` Kullanmayın:**
> Next.js derleyicisi istemci paketine (`client bundle`) yalnızca tam olarak `process.env.NEXT_PUBLIC_SUPABASE_URL` ve `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` şeklinde yazılmış literal ifadeleri gömer (inline eder). `process.env[name]` şeklinde dinamik erişim yaparsanız tarayıcıda `undefined` döner ve uygulama çöker.

> [!WARNING]
> **Modül Seviyesi Ortam Değişkeni Önbelleklemesi (`cachedPublicEnv`, `cachedSupabaseEnv`, `cachedR2Env`):**
> `src/lib/env.public.ts` ve `src/lib/env.server.ts` dosyaları ilk başarılı okumadan sonra ortam değişkenlerini bellek içi tekil (singleton) değişkenlerde (`cachedPublicEnv`, `cachedSupabaseEnv`, `cachedR2Env`) önbelleğe alır. `.env.local` dosyasında değişiklik yaptığınızda sunucu sürecinin (`next dev`) yeniden başlatılması gerekir.

> [!IMPORTANT]
> **`public/models/` Ağırlık Dosyalarının Varlığı:**
> İstemci tarafı yüz tanımanın (`src/lib/faceRecognition.ts` -> `loadFaceModels()`) çalışması için `public/models/` dizinindeki 6 dosyanın (`ssd_mobilenetv1_model*`, `face_landmark_68_model*`, `face_recognition_model*`) statik olarak `/models/*` yolundan sunulabilir olması şarttır. `src/proxy.ts` içindeki `matcher` düzenli ifadesi `.json` ve `.bin` isteklerini engellememelidir.
