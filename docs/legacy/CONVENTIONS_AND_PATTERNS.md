# CONVENTIONS_AND_PATTERNS.md — Kodlama Standartları, Kurallar ve Kalıplar

## 1. TypeScript ve Modül Sınırları Kuralları

1. **Sıfır `any` ve Katı Tip Güvenliği (`tsconfig.json` -> `"strict": true`):**
   - Projede `any` kullanımı yasaktır; bilinmeyen dış girdiler (JSON gövdeleri, `localStorage` verileri, JSONB sütunları) her zaman `unknown` olarak alınır ve ya Zod şemalarıyla (`schema.safeParse`) ya da tip koruyucularıyla (`isRecord`, `normalizeThemeConfig`, `normalizeFlowConfig`) daraltılır.
2. **Yol Takma Adları (Path Aliases):**
   - Göreli üst dizin (`../../..`) importları yerine her zaman `@/*` (`./src/*`) takma adı kullanılır (örn. `import { jsonOk } from "@/lib/api/http";`).
3. **`import "server-only"` Zorunluluğu:**
   - Gizli anahtarlara, `node:crypto`, `node:fs` veya Supabase Admin istemcisine erişen her kütüphane dosyasının (`src/lib/env.server.ts`, `src/lib/r2.ts`, `src/lib/auth.ts`, `src/lib/guest-session.ts`, `src/lib/payments.ts`, `src/lib/rate-limit.ts`, `src/lib/supabase/server.ts`, `src/lib/api/http.ts`) **ilk satırı** `import "server-only";` olmalıdır.
   - Hem istemci hem sunucu tarafından paylaşılan saf doğrulama/yardımcı dosyalarına (`src/lib/media-config.ts`, `src/lib/phash.ts`, `src/lib/vector.ts`, `src/lib/demo-data.ts`, `src/lib/validation/*.ts`, `src/types/*.ts`) `server-only` **eklenmez**.

---

## 2. İsimlendirme Kuralları (Naming Conventions)

| Katman / Kapsam | Kural | Örnekler |
| :--- | :--- | :--- |
| **PostgreSQL Tablo & Sütunları** | `snake_case` | `album_id`, `guest_session_id`, `is_super_admin`, `faces_indexed_at` |
| **PostgreSQL Fonksiyonları (RPC)** | `snake_case` | `get_public_album`, `match_guest_faces`, `can_manage_album`, `is_trusted_server` |
| **JSONB İç Alanları & API Gövdeleri** | `camelCase` | `theme_config.primaryColor`, `flow_config.features.enablePhotoUpload`, `albumId`, `fileKey` |
| **React Bileşenleri & Tipler** | `PascalCase` | `FaceScannerModal`, `QrCardBuilder`, `GuestEventPayload`, `EventThemeConfig` |
| **Sabitler (Constants)** | `UPPER_SNAKE_CASE` | `MAX_CONCURRENT_UPLOADS`, `PRESIGN_TTL_SECONDS`, `GUEST_SESSION_COOKIE_NAME` |
| **CSS Özel Özellikleri (Variables)** | `--event-*` / `wqr-*` | `--event-primary`, `--event-bg`, `.wqr-safe-top`, `.wqr-ambient-surface` |

---

## 3. Hata Yakalama (Error Handling) ve Loglama Stratejisi

### 3.1. Sunucu Tarafı (`src/lib/api/http.ts` & Route Handlers)
- **JSON Gövde Okuma:** Route Handler içinde doğrudan `await request.json()` çağrılmaz! Bunun yerine bayt sınırı (`maxBytes`) ve `Content-Type: application/json` kontrolü yapan `parseJsonBody(request, zodSchema, maxBytes)` kullanılır:
  ```typescript
  const parsed = await parseJsonBody(request, mySchema, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;
  ```
- **Yapılandırılmış Konsol Loglama:** Tüm sunucu logları köşeli parantez içinde modül/rota adıyla etiketlenir:
  - `console.error("[upload:complete] insert failed", insertError);`
  - `console.warn("[upload:complete] rejected stored object magic bytes", { fileKey, mimeType });`
- **PostgreSQL Özel İstisna Eşlemesi (`getDatabaseErrorCode`):**
  - PL/pgSQL fonksiyonlarımız iş kuralı ihlallerinde `errcode = 'P0001'` ile özel mesajlar (`INVALID_ARGUMENTS`, `ALBUM_NOT_ACCESSIBLE`, `MEDIA_FACES_CAP_REACHED`) fırlatır. Sunucu bu hataları `getDatabaseErrorCode(error)` ile yakalayıp uygun HTTP durum koduna (`403 FORBIDDEN` veya `422 VALIDATION_FAILED`) dönüştürür.

### 3.2. İstemci Tarafı (`src/components/ui/Feedback.tsx`)
- **Bildirim Kuyruğu (`useToastQueue` & `<ToastRegion />`):**
  - Kullanıcıya geri bildirim vermek için `window.alert()` **asla** kullanılmaz. Her sayfada `const { toasts, pushToast, dismissToast } = useToastQueue();` kancası ve `<ToastRegion toasts={toasts} onDismiss={dismissToast} />` bileşeni kullanılır (`variant: "success" | "error" | "info"`).
- **Satır İçi Form Hataları (`<FieldError />`):**
  - Her form alanı için `aria-invalid={Boolean(fieldError)}` ve `aria-describedby` öznitelikleriyle birlikte `<FieldError id="..." message={fieldError} />` bileşeni kullanılır.

---

## 4. Doğrulama (Validation) ve Sanitizasyon Kuralları

### 4.1. Türkçe ve Unicode Destekli Slug Sanitizasyonu (`src/lib/validation/forms.ts`)
- `sanitizeSlugInput(raw, trimTrailing)` fonksiyonu `TURKISH_CHAR_MAP` (`ç->c`, `ğ->g`, `ı->i`, `İ->i`, `ö->o`, `ş->s`, `ü->u`, `ß->ss`) dönüşümünü ve `NFD` aksan temizliğini gerçek zamanlı uygular.
- Kullanıcı yazarken (`onChange`) `sanitizeSlugInput(val, false)` çağrılır (kullanıcının kelime arasına tire `-` yazabilmesi için sondaki tire silinmez); alandan çıkıldığında (`onBlur`) veya form gönderilirken (`onSubmit`) `sanitizeSlugInput(val, true)` çağrılarak sondaki tireler temizlenir ve `validateSlugField` (`3..64` karakter, `SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`) ile doğrulanır.

### 4.2. Medya Doğrulama Kuralları (`src/lib/media-config.ts`)
- **Kesin MIME Beyaz Listesi:** Joker karakterli (`image/*`, `video/*`) kabul yapılmaz ve XSS riski taşıyan `image/svg+xml` yüklemesine **kesinlikle izin verilmez**:
  - `ALLOWED_PHOTO_MIMES`: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`, `image/heic`, `image/heif`
  - `ALLOWED_VIDEO_MIMES`: `video/mp4`, `video/quicktime`, `video/webm`, `video/3gpp`
  - `ALLOWED_AUDIO_MIMES`: `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/mpeg`
- **Dosya Yolu Güvenliği (`src/lib/r2.ts`):**
  - Kullanıcının gönderdiği `fileName` asla R2 anahtarında (`fileKey`) kullanılmaz (`buildAlbumFileKey` her zaman `albums/${cleanAlbumId}/${uuidv4()}.${ext}` üretir).
  - Tüm depolama fonksiyonları işlem yapmadan önce `isCanonicalFileKey(fileKey)` (`FILE_KEY_PATTERN` regex kontrolü + `..`, `\`, `//` engeli) çağırır.

---

## 5. UI / UX, Erişilebilirlik ve Mobil Bellek Yönetimi Kuralları

1. **Minimum 48px Dokunma Hedefleri (`min-h-12`):**
   - Mobil düğün ortamında tek elle kullanım için tüm etkileşimli butonlar, sekmeler ve form girdileri `min-h-12` (`48px`) veya `min-h-11` (`44px`) sınıfına sahiptir.
2. **Modal Erişilebilirliği (`useModalAccessibility`):**
   - Her modal açıldığında `useModalAccessibility({ isOpen, onClose, containerRef })` kancası ile `Escape` tuşuyla kapanma, `document.body.style.overflow = "hidden"` kaydırma kilidi ve `Tab` / `Shift+Tab` odak tuzağı (focus trap) zorunlu olarak uygulanır.
3. **Mobil Safari/Chrome Bellek Sızıntısı Önleme (`URL.revokeObjectURL` & Canvas Temizliği):**
   - `src/lib/faceRecognition.ts` içinde oluşturulan her geçici `ObjectURL` (`URL.createObjectURL(file)`) `try ... finally` bloğu içinde **mutlaka** `URL.revokeObjectURL(objectUrl)` ile serbest bırakılır ve geçici `<canvas>` elemanlarının genişlik/yüksekliği `canvas.width = 0; canvas.height = 0;` yapılarak WebGL/2D grafik belleği anında boşaltılır.
   - 48 MP telefon fotoğraflarının mobil GPU'yu çökertmemesi için `createBoundedCanvasFromImage` görüntüyü WebGL'e vermeden önce en fazla `1280px` boyutuna küçültür.
4. **Baskı ve Ekran Kontrast Garantisi (`ensurePrintContrast` & `buildThemeCssVariables`):**
   - Hem QR kartı tasarımında (`src/components/QrCardBuilder.tsx`) hem de dinamik etkinlik temasında (`src/types/flow.ts`) kullanıcı okunaksız bir renk kombinasyonu seçse bile W3C bağıl parlaklık (`getRelativeLuminance`) ve kontrast oranı (`getContrastRatio >= 4.5` veya baskı için `>= 7.0`) hesaplanarak metin ve QR ön plan renkleri otomatik olarak `#18181B` (koyu) veya `#FAF8F5` (açık) renge düşürülür.

---

## 6. Gelecek AI Ajanları İçin Kritik Kodlama Uyarıları

> [!CAUTION]
> **Galeri Selfie Seçicisine `capture="user"` Eklemeyin (`src/components/FaceScannerModal.tsx`):**
> `FaceScannerModal.tsx` içindeki yedek dosya seçici `<input type="file" accept="image/jpeg,image/png,..." />` elemanına **asla** `capture="user"` veya `capture="environment"` özniteliği eklemeyin! iOS ve Android tarayıcılarında kamera izni reddedildiğinde `capture` özniteliği varsa fotoğraf galerisi açılmaz ve kullanıcı tamamen kilitlenir.

> [!WARNING]
> **Offscreen QR Kanvaslarını `display: none` (`hidden`) Yapmayın (`src/components/QrCardBuilder.tsx`):**
> `QrCardBuilder.tsx` içindeki yüksek çözünürlüklü (`1024px`) kaynak `<QRCodeCanvas>` ve `<QRCodeSVG>` bileşenleri `className="pointer-events-none fixed -top-[9999px] -left-[9999px] opacity-0"` ile ekran dışında tutulmaktadır. Bunları `hidden` (`display: none`) yaparsanız bazı tarayıcılarda kanvas çizimi güncellenmez ve indirilen 300-DPI kartlarda QR kodu boş çıkar.

> [!IMPORTANT]
> **Kriptografik Karşılaştırmalarda `===` Yerine `timingSafeEqual` Kullanın:**
> `src/lib/guest-session.ts`, `src/lib/payments.ts` ve `src/lib/r2.ts` içindeki tüm HMAC imza doğrulamaları `node:crypto` modülündeki `timingSafeEqual(bufA, bufB)` fonksiyonunu kullanır. Yeni bir imza veya gizli anahtar doğrulaması eklerken zamanlama saldırılarına (timing attacks) karşı `timingSafeEqual` standardını koruyun.
