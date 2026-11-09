# Event QR — "Wedding QR" → "Event QR" Dönüşüm Spesifikasyonu (Migration Spec)

Bu doküman, kod tabanındaki tüm **"Wedding QR"**, **`wedding-qr`**, **`weddingqr`**, **`wqr`** (Wedding QR kısaltması) ve düğün-spesifik teknik/dokümantasyon referanslarının **"Event QR"** (`event-qr`, `eventqr`, `eqr`) yapısına eksiksiz ve güvenli biçimde dönüştürülmesi için hazırlanmış **uygulamaya hazır teknik görev spesifikasyonudur**.

---

## Sistem Bağlamı ve Mimari Kurallar (Kesinlikle Korunmalı)

1. **Next.js 16.4.5 Kuralları:** `src/proxy.ts` (`middleware.ts` değil) kullanılır; route handler'larda `context.params` bir `Promise`'dir (`await context.params`).
2. **Güvenlik ve Geriye Dönük Uyumluluk (Kritik Notlar):**
   - `src/lib/secret-box.ts` içindeki HKDF salt değeri (`"wedding-qr/secret-box"`), veritabanındaki `drive_connections.refresh_token_enc` kayıtlarını şifrelemek için kullanılmıştır. Eğer mevcut üretim veritabanında bağlı Drive hesapları varsa bu salt doğrudan değiştirildiğinde eski token'lar çözülemez (`openSecret` `null` döner). Bu nedenle **`openSecret` içinde önce `"event-qr/secret-box"` denenmeli, başarısız olursa `"wedding-qr/secret-box"` (legacy fallback) ile açılmalıdır.**
   - `src/lib/login-identity.ts` içindeki `DEFAULT_LOGIN_EMAIL_DOMAIN` (`"kullanici.eventqr.app"`) güncellenirken, `loginEmailToUsername` fonksiyonu hem yeni (`kullanici.eventqr.app`) hem de eski (`kullanici.weddingqr.app`) domain uzantısını kullanıcı adına dönüştürebilmelidir.
   - `src/app/api/media/confirm/route.ts` içinde Drive `appProperties` doğrulaması yapılırken hem `eqrUploadId` / `eqrEventId` hem de geçiş sürecindeki yüklemeler için `wqrUploadId` / `wqrEventId` kabul edilmelidir.
3. **Doğrulama:** Tüm adımlar tamamlandığında `npm run check` (`npm run lint && npm run typecheck && npm test && npm run build`) **0 hata ve 0 uyarı** ile geçmelidir.

---

## BÖLÜM 1: Paket ve Ortam Yapılandırması (`package.json`, `.env.example`)

### Görev 1.1: `package.json` ve `package-lock.json`
* **Dosya:** `package.json` (Satır 2) ve `package-lock.json` (Satır 2, 8)
* **Değişiklik:** Paket adını `"wedding-qr-studio"` yerine `"event-qr-studio"` (veya `"event-qr"`) olarak güncelle.
  ```json
  // package.json (Satır 2)
  "name": "event-qr-studio",
  ```

### Görev 1.2: `.env.example`
* **Dosya:** `.env.example` (Satır 2)
* **Mevcut:**
  ```dotenv
  # Wedding QR — environment variables
  ```
* **Yeni:**
  ```dotenv
  # Event QR — environment variables
  ```

---

## BÖLÜM 2: Kimlik, Şifreleme ve Çekirdek Kütüphaneler (`src/lib/*`, `scripts/*`)

### Görev 2.1: `src/lib/login-identity.ts` — Giriş Kimliği Domain'i
* **Dosya:** `src/lib/login-identity.ts` (Satır 12, 33, 39–44)
* **Mevcut:**
  ```ts
  export const DEFAULT_LOGIN_EMAIL_DOMAIN = "kullanici.weddingqr.app";
  ```
* **Uygulanacak Çözüm:**
  1. `DEFAULT_LOGIN_EMAIL_DOMAIN = "kullanici.eventqr.app"` olarak güncelle, eski domain için `LEGACY_LOGIN_EMAIL_DOMAINS = ["kullanici.weddingqr.app"]` tanımla.
  2. Satır 33'teki JSDoc yorumunu `/** "ayse" → "ayse@kullanici.eventqr.app". Full e-mails (legacy accounts) pass through unchanged. */` olarak güncelle.
  3. `loginEmailToUsername` fonksiyonunda hem aktif `domain` hem de `LEGACY_LOGIN_EMAIL_DOMAINS` kontrolü yap:
  ```ts
  export const DEFAULT_LOGIN_EMAIL_DOMAIN = "kullanici.eventqr.app";
  const LEGACY_LOGIN_EMAIL_DOMAINS = ["kullanici.weddingqr.app"] as const;

  export function loginEmailToUsername(email: string | null | undefined, domain: string = loginEmailDomain()): string | null {
    if (!email) return null;
    const lower = email.toLowerCase();
    for (const d of [domain, ...LEGACY_LOGIN_EMAIL_DOMAINS]) {
      const suffix = `@${d}`;
      if (lower.endsWith(suffix)) return email.slice(0, -suffix.length);
    }
    return email;
  }
  ```

### Görev 2.2: `scripts/manage-users.mjs` — Kullanıcı Yönetim Script'i
* **Dosya:** `scripts/manage-users.mjs` (Satır 13, 19, 85–88, 157)
* **Değişiklikler:**
  - Satır 13 (yorum): `"<username>@<NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN or kullanici.eventqr.app>"`
  - Satır 19: `const DEFAULT_DOMAIN = "kullanici.eventqr.app";`
  - Satır 85–88 (`usernameOf`): `@kullanici.weddingqr.app` uzantılı eski hesapları da temiz gösterecek şekilde güncelle.
  - Satır 157 (yardım metni): `Yeni düğün sahibi hesabı` → `Yeni etkinlik sahibi hesabı`

### Görev 2.3: `src/lib/secret-box.ts` — HKDF Anahtar Türetme Bilgisi (Salt)
* **Dosya:** `src/lib/secret-box.ts` (Satır 12–36)
* **Mevcut (Satır 12–14):**
  ```ts
  function deriveKey(appSecret: string, purpose: string): Buffer {
    return Buffer.from(hkdfSync("sha256", appSecret, "wedding-qr/secret-box", `${VERSION}:${purpose}`, 32));
  }
  ```
* **Uygulanacak Çözüm (Geriye Dönük Uyumlu):**
  Yeni şifrelemelerde `"event-qr/secret-box"` kullan; `openSecret` içinde `"event-qr/secret-box"` ile şifre çözme başarısız olursa `"wedding-qr/secret-box"` ile tekrar dene:
  ```ts
  const PRIMARY_SALT = "event-qr/secret-box";
  const LEGACY_SALT = "wedding-qr/secret-box";

  function deriveKey(appSecret: string, purpose: string, salt: string = PRIMARY_SALT): Buffer {
    return Buffer.from(hkdfSync("sha256", appSecret, salt, `${VERSION}:${purpose}`, 32));
  }

  export function sealSecret(plaintext: string, appSecret: string, purpose: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", deriveKey(appSecret, purpose, PRIMARY_SALT), iv);
    cipher.setAAD(Buffer.from(purpose, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  export function openSecret(sealed: string, appSecret: string, purpose: string): string | null {
    const [version, iv, tag, data] = sealed.split(".");
    if (version !== VERSION || !iv || !tag || data === undefined) return null;
    for (const salt of [PRIMARY_SALT, LEGACY_SALT]) {
      try {
        const decipher = createDecipheriv("aes-256-gcm", deriveKey(appSecret, purpose, salt), Buffer.from(iv, "base64url"));
        decipher.setAAD(Buffer.from(purpose, "utf8"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
      } catch {
        // try next salt
      }
    }
    return null;
  }
  ```

### Görev 2.4: Çerez İsimleri (`wqr_` → `eqr_`)
1. **`src/lib/guest-session.ts` (Satır 12, 26):**
   - `export const GUEST_COOKIE = "eqr_guest";` (Eski misafir oturumlarının kopmaması için `readGuestSession` içinde `request.cookies.get(GUEST_COOKIE)?.value ?? request.cookies.get("wqr_guest")?.value` oku).
2. **`src/lib/google-oauth.ts` (Satır 13):**
   - `export const DRIVE_OAUTH_COOKIE = "eqr_drive_oauth";`

### Görev 2.5: Yorumlar, Loglar ve Hata Mesajları (`src/lib/*`)
1. **`src/lib/api/http.ts` (Satır 108):**
   - `"Veritabanı şeması eksik veya eski. Supabase SQL Editor'da supabase/migrations/0001_wedding_qr_drive.sql dosyasını çalıştırın."` → `0001_event_qr_drive.sql` (Görev 4.1 ile uyumlu olarak).
2. **`src/lib/upload-quota.ts` (Satır 65):**
   - `console.error("[upload-quota] reserve_upload_quota missing — re-run supabase/migrations/0001_wedding_qr_drive.sql");` → `0001_event_qr_drive.sql`
3. **`src/lib/rate-limit.ts` (Satır 17):**
   - `* limiter outage must not take the wedding down.` → `* limiter outage must not take the event down.`
4. **`src/lib/client/zip.ts` (Satır 7):**
   - `* page to disk, so large weddings don't exhaust RAM. Each archive stays below` → `* page to disk, so large events don't exhaust RAM. Each archive stays below`

---

## BÖLÜM 3: API Rotaları, UI Bileşenleri ve CSS (`wqr` → `eqr` & Düğün Referansları)

### Görev 3.1: Google Drive `appProperties` Anahtarları
1. **`src/app/api/drive/upload-session/route.ts` (Satır 189):**
   - Mevcut: `appProperties: { wqrUploadId: uploadId, wqrEventId: event.id },`
   - Yeni: `appProperties: { eqrUploadId: uploadId, eqrEventId: event.id },`
2. **`src/app/api/media/confirm/route.ts` (Satır 114–115):**
   - Mevcut:
     ```ts
     file.appProperties?.wqrUploadId === token.u &&
     file.appProperties?.wqrEventId === token.e &&
     ```
   - Yeni (geçiş uyumlu):
     ```ts
     (file.appProperties?.eqrUploadId ?? file.appProperties?.wqrUploadId) === token.u &&
     (file.appProperties?.eqrEventId ?? file.appProperties?.wqrEventId) === token.e &&
     ```

### Görev 3.2: Etkinlik Oluşturma Fallback Slug (`src/app/api/host/events/route.ts`)
* **Dosya:** `src/app/api/host/events/route.ts` (Satır 84)
* **Mevcut:** `if (base.length < 3) base = \`dugun-${randomBytes(3).toString("hex")}\`;`
* **Yeni:** `if (base.length < 3) base = \`etkinlik-${randomBytes(3).toString("hex")}\`;`

### Görev 3.3: İstemci LocalStorage Anahtarı ve CSS Sınıfları (`wqr` → `eqr`)
1. **`src/components/guest/GuestApp.tsx` (Satır 19, 104, 157, 195):**
   - Satır 19: `const NAME_KEY = "wqr:guest-name";` → `const NAME_KEY = "eqr:guest-name";` (Okurken `localStorage.getItem(NAME_KEY) || localStorage.getItem("wqr:guest-name")` ile eski değeri de koru).
   - Satır 104, 157: `wqr-safe-top` → `eqr-safe-top`
   - Satır 195: `wqr-safe-bottom` → `eqr-safe-bottom`
2. **`src/app/globals.css` (Satır 89–145):**
   - `@keyframes wqrFadeUp` → `@keyframes eqrFadeUp`
   - `.wqr-step-enter` → `.eqr-step-enter` (`animation: eqrFadeUp ...`)
   - `.wqr-ambient-surface` → `.eqr-ambient-surface`
   - `.wqr-safe-top` → `.eqr-safe-top`
   - `.wqr-safe-bottom` → `.eqr-safe-bottom`
   - `.wqr-safe-pb-bar` → `.eqr-safe-pb-bar`
   - `@keyframes wqrFadeOut` → `@keyframes eqrFadeOut`
   - `@keyframes wqrKenBurns` → `@keyframes eqrKenBurns`
3. **`src/components/live/LiveWall.tsx` (Satır 211, 229, 269):**
   - Satır 211: `animate-[wqrFadeOut_1.2s_ease_forwards]` → `animate-[eqrFadeOut_1.2s_ease_forwards]`
   - Satır 229: `animate-[wqrKenBurns_8s_ease-out_forwards]` → `animate-[eqrKenBurns_8s_ease-out_forwards]`
   - Satır 269: `wqr-step-enter` → `eqr-step-enter`
4. **`src/components/media/Lightbox.tsx` (Satır 92, 146):**
   - Satır 92: `wqr-safe-top` → `eqr-safe-top`
   - Satır 146: `wqr-safe-bottom` → `eqr-safe-bottom`
5. **`src/components/ui/Feedback.tsx` (Satır 51):**
   - Satır 51: `wqr-safe-bottom` → `eqr-safe-bottom`

---

## BÖLÜM 4: Veritabanı Şema Dosyaları (`supabase/*`)

### Görev 4.1: `supabase/migrations/0001_wedding_qr_drive.sql` → `supabase/migrations/0001_event_qr_drive.sql`
* **İşlem:** Dosya adını `git mv supabase/migrations/0001_wedding_qr_drive.sql supabase/migrations/0001_event_qr_drive.sql` ile değiştir ve dosya içi yorumları güncelle:
  - **Satır 2:** `-- Wedding QR — Google Drive storage schema (Supabase / Neon PostgreSQL)` → `-- Event QR — Google Drive storage schema (Supabase / Neon PostgreSQL)`
  - **Satır 214:** `-- Exact scan over one wedding's faces (a few thousand rows) is fast and` → `-- Exact scan over one event's faces (a few thousand rows) is fast and`

### Görev 4.2: `supabase/cleanup_legacy.sql`
* **Dosya:** `supabase/cleanup_legacy.sql` (Satır 2)
* **Mevcut:** `-- Wedding QR — OPTIONAL one-time cleanup of the OLD (R2 / "Lumina") schema.`
* **Yeni:** `-- Event QR — OPTIONAL one-time cleanup of the OLD (R2 / "Lumina") schema.`

---

## BÖLÜM 5: Birim Testleri (`tests/*`)

### Görev 5.1: `tests/login-identity.test.ts`
* **Dosya:** `tests/login-identity.test.ts` (Satır 6, 10, 18)
* **Değişiklik:**
  - `const DOMAIN = "kullanici.eventqr.app";` olarak güncelle.
  - Satır 10 ve 18'deki beklenen değerleri `ayse.mehmet@kullanici.eventqr.app` ve `ayse@kullanici.eventqr.app` yap.
  - Ayrıca geriye dönük uyumluluğu doğrulamak için `assert.equal(loginEmailToUsername("ayse@kullanici.weddingqr.app", DOMAIN), "ayse");` testini koru.

### Görev 5.2: `tests/secret-box.test.ts`
* **Dosya:** `tests/secret-box.test.ts`
* **Değişiklik:** `sealSecret` ve `openSecret` testlerinin yeni `"event-qr/secret-box"` ile geçtiğini doğrula.

---

## BÖLÜM 6: Dokümantasyon Dosyaları (`DEPLOYMENT.md`, `README.md`, `BUG_REPORT_AND_FIX_SPEC.md`, `docs/legacy/*`)

### Görev 6.1: `DEPLOYMENT.md`
* Aşağıdaki satırlardaki tüm `wedding-qr` / `weddingqr` / `0001_wedding_qr_drive.sql` ve "düğün sahibi" ifadelerini `event-qr` / `eventqr` / `0001_event_qr_drive.sql` ve "etkinlik sahibi" olarak güncelle:
  - **Satır 15–16:** `git clone https://github.com/<kullanıcı>/event-qr-studio.git` ve `cd event-qr-studio`
  - **Satır 23, 34, 35, 46, 58–61, 91, 174, 180–185, 194, 215:** "düğün sahibi" → "etkinlik sahibi", "Canlı Düğün Ekranı" → "Canlı Etkinlik Ekranı", "Düğün günü" → "Etkinlik günü"
  - **Satır 26, 208:** `supabase/migrations/0001_wedding_qr_drive.sql` → `supabase/migrations/0001_event_qr_drive.sql`
  - **Satır 44:** `ayse.mehmet@kullanici.weddingqr.app` → `ayse.mehmet@kullanici.eventqr.app`
  - **Satır 65:** `(ör. wedding-qr)` → `(ör. event-qr)`
  - **Satır 75:** `https://wedding-qr.vercel.app/api/host/drive/callback` → `https://event-qr.vercel.app/api/host/drive/callback`
  - **Satır 214:** `Drive appProperties.wqrUploadId` → `Drive appProperties.eqrUploadId`

### Görev 6.2: `README.md`
* **Satır 3:** `doğrudan çiftin kişisel Google Drive’ına` → `doğrudan etkinlik sahibinin kişisel Google Drive’ına`
* **Satır 11:** `Canlı düğün ekranı` → `Canlı etkinlik ekranı`
* **Satır 13:** `düğün sahibi düzenler.` → `etkinlik sahibi düzenler.`
* **Satır 32:** `Her düğün sahibi kendi Drive’ını bağlar` → `Her etkinlik sahibi kendi Drive’ını bağlar`
* **Satır 60:** `api/host/              düğün sahibi: etkinlikler, moderasyon, dışa aktarma` → `api/host/              etkinlik sahibi: etkinlikler, moderasyon, dışa aktarma`

### Görev 6.3: `BUG_REPORT_AND_FIX_SPEC.md` ve `docs/legacy/*`
* **`BUG_REPORT_AND_FIX_SPEC.md`:**
  - Satır 1, 6: `Wedding QR Studio` → `Event QR Studio`
  - Satır 129: `supabase/migrations/0001_wedding_qr_drive.sql` → `supabase/migrations/0001_event_qr_drive.sql`
* **`docs/legacy/*` (`PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, `ENV_AND_SETUP.md`, `API_AND_FLOWS.md`, `CONVENTIONS_AND_PATTERNS.md`, `DATA_MODELS.md`, `TECH_STACK.md`):**
  - Arşiv dokümanlarındaki `Wedding QR Studio`, `wedding-qr-studio`, `wedding-qr-media`, `wqr_` referanslarını `Event QR Studio`, `event-qr-studio`, `event-qr-media`, `eqr_` olarak güncelle.

---

## Doğrulama (Verification) Protokolü

Tüm değişiklikler uygulandıktan sonra sırasıyla şu kontrolleri çalıştır:

1. **Kalan referans taraması:**
   ```bash
   git grep -i "wedding"
   git grep -i "wqr"
   ```
   *(Yalnızca `src/lib/login-identity.ts`, `tests/login-identity.test.ts`, `src/lib/secret-box.ts`, `src/lib/guest-session.ts` ve `src/app/api/media/confirm/route.ts` içindeki geriye dönük uyumluluk sabitlerinde kontrollü olarak bulunmalıdır.)*

2. **Kalite ve Derleme Kontrolleri:**
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```
   - Tüm testler ve derleme **0 hata, 0 uyarı** ile tamamlanmalıdır.
