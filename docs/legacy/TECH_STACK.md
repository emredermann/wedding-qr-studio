# TECH_STACK.md — Teknoloji Yığını, Kütüphaneler ve Dış Entegrasyonlar

## 1. Çekirdek Çalışma Zamanı ve Diller

| Teknoloji | Versiyon | Kullanım Yeri ve Rolü |
| :--- | :--- | :--- |
| **TypeScript** | `^5` (`ES2017` target, `strict: true`) | Tüm uygulama kodu (`src/**/*.ts`, `src/**/*.tsx`), uçtan uca tip güvenliği (`noEmit: true`, `moduleResolution: "bundler"`). |
| **Node.js** | `>= 20` (`@types/node: ^20`) | Next.js sunucu çalışma zamanı, `node:crypto` (HMAC-SHA256, `timingSafeEqual`), `node:stream` (`PassThrough`, `Readable`), `node:fs/promises`. |
| **PostgreSQL + PL/pgSQL** | Supabase Postgres 15+ | Veri tabanı, `pgvector` eklentisi, Row Level Security (RLS) politikaları, tetikleyiciler (`triggers`) ve `SECURITY DEFINER` RPC fonksiyonları. |

---

## 2. Framework ve UI Kütüphaneleri (`package.json`)

| Paket | Versiyon | Detaylar ve Kullanıldığı Dosyalar |
| :--- | :--- | :--- |
| **`next`** | `16.4.5` | App Router, Turbopack, `src/proxy.ts` oturum ara katmanı, `next/server` (`NextRequest`, `NextResponse`, `after`), `cacheComponents: true`, `partialPrefetching: true`. |
| **`react` & `react-dom`** | `19.3.0` | İstemci ve Sunucu bileşenleri, `Suspense`, `useId`, `useCallback`, `useMemo`, `useRef`. |
| **`tailwindcss` & `@tailwindcss/turbopack`** | `^4` | Tailwind CSS v4 (`@import "tailwindcss";` ve `@theme inline` sözdizimi ile `src/app/globals.css`), Turbopack CSS yükleyicisi (`next.config.ts`). |
| **`lucide-react`** | `^1.67.0` | Tüm arayüz ikonları (`Camera`, `ScanFace`, `QrCode`, `Mic`, `ShieldCheck`, `Sparkles` vb.). |
| **`qrcode.react`** | `^4.2.0` | `src/components/QrCardBuilder.tsx` içinde `QRCodeCanvas` (1024px kaynak tuval, `level="H"`) ve `QRCodeSVG` (vektörel SVG çıktı) üretimi. |
| **`server-only`** | `^0.0.1` | Sunucu modüllerinin (`src/lib/env.server.ts`, `src/lib/r2.ts`, `src/lib/auth.ts`, `src/lib/guest-session.ts`, `src/lib/payments.ts`, `src/lib/rate-limit.ts`, `src/lib/supabase/server.ts`, `src/lib/api/http.ts`) yanlışlıkla istemci paketine (`client bundle`) dahil edilmesini derleme zamanında engeller. |

---

## 3. Veri Erişimi, Depolama ve Doğrulama Kütüphaneleri

| Paket | Versiyon | Detaylar ve Kullanıldığı Dosyalar |
| :--- | :--- | :--- |
| **`@supabase/supabase-js`** | `^2.118.0` | Tipli (`Database` generic) PostgreSQL, Auth, Realtime ve RPC istemcisi. |
| **`@supabase/ssr`** | `^0.12.7` | Next.js App Router çerez tabanlı oturum yönetimi (`createBrowserClient`, `createServerClient` — `src/lib/supabase/client.ts`, `server.ts`, `proxy.ts`). |
| **`@aws-sdk/client-s3`** | `^3.1161.0` | Cloudflare R2 nesne depolama işlemleri (`PutObjectCommand`, `GetObjectCommand`, `HeadObjectCommand`, `DeleteObjectCommand`, `PutBucketCorsCommand`, `HeadBucketCommand`). |
| **`@aws-sdk/s3-request-presigner`** | `^3.1161.0` | `getSignedUrl` ile `< 300s` süreli imzalı `PUT` ve `GET` URL'lerinin üretilmesi (`src/lib/r2.ts`). |
| **`archiver` & `@types/archiver`** | `^8.0.0` | `src/app/api/albums/[albumId]/download/route.ts` içinde `ZipArchive({ zlib: { level: 0 } })` ile sıfır-RAM akışlı (streaming) ZIP arşivi üretimi. |
| **`zod`** | `^4.6.7` | **Zod v4** şema doğrulaması (`z.url()`, `z.uuid()`, `z.email()`, `z.enum()`, `z.core.$ZodIssue` — `src/lib/env.server.ts`, `src/lib/api/http.ts`, `src/lib/validation/*.ts`, `src/app/api/**/route.ts`). |
| **`uuid` & `@types/uuid`** | `^14.0.3` / `^10.0.0` | `src/lib/r2.ts` içinde `v4 as uuidv4` ile tahmin edilemez R2 nesne anahtarlarının (`albums/${albumId}/${uuid}.${ext}`) üretilmesi. |

---

## 4. Yapay Zeka, Biyometri ve Görüntü İşleme Araçları

| Teknoloji / Servis | Versiyon / Model | Kullanım Yeri ve Teknik Detaylar |
| :--- | :--- | :--- |
| **`@vladmandic/face-api`** | `^1.7.15` | `src/lib/faceRecognition.ts` içinde dinamik `import("@vladmandic/face-api")` ile yalnızca tarayıcıda yüklenir. `public/models/` altındaki 3 sinir ağını (`ssdMobilenetv1`, `faceLandmark68Net`, `faceRecognitionNet`) kullanarak 128-boyutlu `Float32Array` yüz vektörleri çıkarır. |
| **PostgreSQL `pgvector`** | `vector(128)` + `hnsw` | `public.media_faces.embedding` sütununda 128-boyutlu L2-normalize vektörleri saklar. `match_guest_faces` RPC'si `<=>` (kosinüs mesafesi) operatörü ile `1 - (embedding <=> query_embedding) >= 0.82` eşleşmesi yapar. |
| **OpenAI Vision API** | `gpt-4o-mini` | `src/app/api/webhooks/process-media/route.ts` (`classifyEventPhotoWithVision`) içinde `POST https://api.openai.com/v1/chat/completions` çağrısıyla (`detail: "low"`, `temperature: 0`, `max_tokens: 16`) fotoğrafları 5 kategoriden birine (`getting_ready`, `ceremony`, `reception`, `party`, `venue`) sınıflandırır. |
| **Perceptual Hash (`dHash`)** | 64-bit (16 hex karakter) | İstemcide (`computeClientDifferenceHash` — `9×8` Canvas BT.601 parlaklık farkı) ve sunucu yedeğinde (`computeServerFallbackPhash` — 65 pencere örneklemesi) hesaplanır. `src/lib/phash.ts` (`hammingDistance64`, `groupDuplicateMediaByPhash`) ile Hamming mesafesi `<= 10` olan kopya fotoğraflar gruplanır. |

---

## 5. Dış Servisler ve Altyapı Entegrasyonları

1. **Supabase (Auth + Postgres + pgvector):**
   - Kimlik doğrulama (`signInWithPassword`, `signUp`, `signOut`, `getUser`).
   - Veri tabanı ve RLS (`public.albums`, `public.media`, `public.media_faces`, `public.co_hosts`, `public.profiles`, `public.guest_registrations`, `public.api_rate_limits`).
2. **Cloudflare R2 (S3 Uyumlu Nesne Depolama):**
   - Endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` (`region: "auto"`, `forcePathStyle: true`).
   - CORS yapılandırması: `infra/r2-cors.json` (`PUT`, `GET`, `HEAD` metodları, `content-type` başlığı).
3. **Stripe (Ödeme ve Webhook):**
   - `src/app/api/checkout/route.ts`: Doğrudan `https://api.stripe.com/v1/checkout/sessions` REST uç noktasına `application/x-www-form-urlencoded` POST isteği atar (harici `stripe` npm paketi kullanılmaz, sıfır bağımlılık şişkinliği).
   - `src/app/api/webhooks/payment/route.ts`: `Stripe-Signature` başlığını `node:crypto` ile doğrular.
4. **Dağıtım Platformları:**
   - **Vercel (`vercel.json`):** `src/app/api/albums/[albumId]/download/route.ts` için `maxDuration: 300` sn, `src/app/api/webhooks/process-media/route.ts` için `maxDuration: 60` sn.
   - **Railway (`railway.json`):** `NIXPACKS` builder, `npm run build` / `npm run start`, healthcheck `/`.
   - **GitHub Pages (`.github/workflows/deploy.yml`):** Statik önizleme derlemesi (`GITHUB_PAGES="true"`).

---

## 6. Gelecek AI Ajanları İçin Kritik Teknoloji Uyarıları

> [!CAUTION]
> **Zod v4 Sözdizimi Farklılıkları (`zod@^4.6.7`):**
> Projede **Zod v4** kullanılmaktadır. Zod v3'teki `z.string().url()`, `z.string().uuid()`, `z.string().email()` yerine Zod v4'ün birinci sınıf doğrulayıcıları olan **`z.url()`**, **`z.uuid()`**, **`z.email()`** ve hata tipi olarak **`z.core.$ZodIssue`** (`src/lib/api/http.ts`) kullanılmaktadır. Yeni şema yazarken Zod v4 API'sini kullanın.

> [!WARNING]
> **Tailwind CSS v4 Yapılandırması (`@tailwindcss/turbopack@^4`):**
> Projede `tailwind.config.js` veya `postcss.config.js` **yoktur**. Tailwind v4, `next.config.ts` içindeki `turbopack.rules["*.css"]` (`@tailwindcss/turbopack`) ve `src/app/globals.css` başındaki `@import "tailwindcss";` satırı ile çalışır. Eski Tailwind v3 yapılandırma dosyaları oluşturmayın.

> [!IMPORTANT]
> **`@vladmandic/face-api` SSR Koruması:**
> `@vladmandic/face-api` yalnızca tarayıcıda (`window !== "undefined"`) dinamik `import()` ile yüklenmelidir (`src/lib/faceRecognition.ts` içindeki `getFaceApi()`). Bu paketi asla sunucu bileşenlerinde veya üst düzey statik `import` ile sunucu tarafında çalıştırmaya çalışmayın; WebGL / Canvas bağımlılıkları nedeniyle Node.js ortamında hata verir.
