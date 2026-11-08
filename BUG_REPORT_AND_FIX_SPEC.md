# Wedding QR Studio — Hata Analizi ve Çözüm Spesifikasyonu (Remediation Spec)

> **Durum (2026-11-08):** Bu dokümandaki 7 görevin tamamı uygulanmıştır. Sonraki denetimde eklenenler: misafir/IP başına yükleme kotası ve Drive boş alan ön kontrolü, sahtelenemeyen istemci IP'si, kısmi `PATCH`, toplu moderasyon uç noktası, "önce DB sonra Drive" silme sırası, `getClaims()` ile yerel JWT doğrulama ve `tests/` altında `node:test` birim testleri (`npm test`).


Bu doküman, **Wedding QR Studio** (`Next.js 16.4.5`, `React 19.3`, `Supabase PostgreSQL + pgvector`, `Google Drive API v3`) kod tabanında tespit edilen olası çalışma zamanı hatalarını, darboğazları ve kenar durumlarını (edge-cases) gidermek için hazırlanmış **uygulamaya hazır teknik spesifikasyondur**.

---

## Sistem Bağlamı ve Mimari Kurallar (Değiştirilmemeli)
1. **Next.js 16 Kuralları:** `src/proxy.ts` (`middleware.ts` değil) kullanılır; route handler'larda `context.params` bir `Promise`'dir (`await context.params`).
2. **Güvenlik Modeli:** Tüm veritabanı tablolarında RLS açıktır ve `anon` / `authenticated` rolleri için politika yoktur. Yalnızca sunucu tarafındaki `getAdminDb()` (`SUPABASE_SERVICE_ROLE_KEY`) okuma/yazma yapar.
3. **Medya Akışı:** Dosya baytları sunucudan geçmez; tarayıcıdan doğrudan Google Drive resumable upload URL'sine (`PUT`) gönderilir.
4. **Doğrulama:** Her değişiklikten sonra `npm run check` (`eslint --max-warnings=0 . && next typegen && tsc --noEmit && next build`) **0 hata ve 0 uyarı** ile geçmelidir.

---

## Görev Listesi ve Teknik Çözüm Adımları

### GÖREV 1: Ters Proxy / Özel Domain Arkasında `403 ORIGIN_NOT_ALLOWED` Hatasının Giderilmesi
* **Öncelik:** Kritik (P0)
* **Etkilenen Dosya:** `src/app/api/drive/upload-session/route.ts` (Satır 53–60)
* **Kök Neden:** `allowedOrigin(request)` fonksiyonu yalnızca `request.nextUrl.origin` ve `process.env.NEXT_PUBLIC_APP_URL` değerlerini kontrol ediyor. Uygulama bir reverse proxy (Render, Railway, Cloudflare, Nginx) arkasında çalışırken `request.nextUrl.origin` dahili konteyner adresini (`http://localhost:3000` vb.) döndürebilir veya kullanıcı `www.` alt alan adıyla erişebilir. Bu durumda Google Drive CORS oturumu başlatılamaz ve tüm yüklemeler `403 ORIGIN_NOT_ALLOWED` ile reddedilir.
* **Uygulanacak Çözüm:**
  1. `allowedOrigin(request: NextRequest)` fonksiyonunda `x-forwarded-host` (veya `host`) ve `x-forwarded-proto` başlıklarını okuyarak dış (public) origin'i de `allowed` kümesine ekle.
  2. `NEXT_PUBLIC_APP_URL` tanımlıysa hem `www.` içeren hem de içermeyen varyantını güvenli şekilde kabul et.
  ```ts
  function allowedOrigin(request: NextRequest): string | null {
    const origin = request.headers.get("origin")?.trim().replace(/\/+$/, "");
    if (!origin) return null;

    const allowed = new Set<string>([request.nextUrl.origin.replace(/\/+$/, "")]);

    const fwdHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim();
    const fwdProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(":", "");
    if (fwdHost && fwdProto) {
      allowed.add(`${fwdProto}://${fwdHost}`);
    }

    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
    if (configured) {
      allowed.add(configured);
      try {
        const u = new URL(configured);
        if (u.hostname.startsWith("www.")) {
          allowed.add(`${u.protocol}//${u.hostname.slice(4)}${u.port ? `:${u.port}` : ""}`);
        } else {
          allowed.add(`${u.protocol}//www.${u.hostname}${u.port ? `:${u.port}` : ""}`);
        }
      } catch {
        // ignore invalid NEXT_PUBLIC_APP_URL format
      }
    }

    return allowed.has(origin) ? origin : null;
  }
  ```

---

### GÖREV 2: `/api/media/confirm` Yetim (Orphan) Drive Dosyası ve `face_count` Tutarsızlığının Giderilmesi
* **Öncelik:** Kritik (P0)
* **Etkilenen Dosyalar:**
  * `src/app/api/media/confirm/route.ts` (Satır 117–165)
  * `src/lib/client/drive-upload.ts` (Satır 203–212)
* **Kök Neden:**
  1. `status === "approved"` olduğunda `DriveService.makePublic(fileId)` veritabanı `insert` işleminden **önce** çağrılıyor. Eğer `insert` beklenmeyen bir DB hatasıyla başarısız olursa (23505 unique constraint hariç), dosya Drive'da herkese açık olarak kalır ancak DB'de görünmez.
  2. `media_items` tablosuna `face_count: facesToStore.length` yazılıyor; fakat hemen altındaki `face_descriptors` insert işlemi başarısız olursa hata yutuluyor (`console.error`) ve `face_count` gerçekte 0 iken DB'de `> 0` olarak kalıyor.
* **Uygulanacak Çözüm:**
  1. `src/app/api/media/confirm/route.ts` içinde:
     * Önce `media_items` tablosuna `insert` işlemini yap.
     * Ardından `status === "approved"` ise `DriveService.makePublic(fileId)` çağır. Eğer `makePublic` hata fırlatırsa ve kurtarılamazsa, oluşturulan `media_items` satırını sil (`rollback`) ki istemci retry yaptığında idempotency bloğu yarım kalmış (public olmamış) dosyayı onaylanmış sanmasın.
     * `facesToStore.length > 0` ise `face_descriptors` insert işlemini yap; eğer `faceInsert.error` dönerse `media_items` satırının `face_count` değerini `0` olarak güncelle.
  2. `src/lib/client/drive-upload.ts` içinde:
     * `confirm()` retry mekanizmasını 1 denemeden 3 denemeye (exponential backoff: `1000ms`, `2500ms`) çıkar.

---

### GÖREV 3: İstemci Tarafı ZIP İndirmede Rate-Limit (429), Bellek/Paralellik ve Classic-ZIP Taşması
* **Öncelik:** Kritik (P0)
* **Etkilenen Dosyalar:**
  * `src/lib/client/download.ts` (Satır 6–143)
  * `src/lib/client/zip.ts` (Satır 50–141)
  * `src/components/guest/GalleryPanel.tsx` (Satır 83–98)
* **Kök Neden:**
  1. `downloadZip` içinde `PARALLEL_FILES = 4` paralel işçi aynı anda çalışıyor. 4 işçi de dosyaları indirmeyi bitirdiğinde `if (writer.byteLength + blob.size > ZIP_PART_LIMIT_BYTES) flush();` kontrolü sırayla çalışsa bile, tek bir ZIP arşivinde `65535` girdi sınırı (16-bit `setUint16(8, this.entries.length)`) veya `0xffffffff` (4 GiB) offset sınırı kontrol edilmiyor.
  2. `PARALLEL_FILES = 4` ile 16 MB'lık Range istekleri atıldığında Google Drive API kota sınırına (`userRateLimitExceeded`) takılma riski yüksek.
  3. `fetchOriginal` içinde `res.status === 429` döndüğünde `Retry-After` başlığı dikkate alınmıyor.
* **Uygulanacak Çözüm:**
  1. `src/lib/client/download.ts`:
     * `PARALLEL_FILES` değerini `2` veya `3` olarak sınırla.
     * `fetchOriginal` içinde `res.status === 429` veya `res.status === 502/503` geldiğinde `res.headers.get("Retry-After")` değerini oku ve en az o süre kadar bekle.
     * `writer.byteLength + blob.size > ZIP_PART_LIMIT_BYTES` kontrolüne ek olarak `writer.entryCount >= 60_000` kontrolü ekle (16-bit entry count taşmasını önlemek için).
  2. `src/lib/client/zip.ts`:
     * `add()` metodunda `if (this.offset + 30 + nameBytes.length + data.size > 0xfffffffe)` durumunda açık bir hata fırlat veya çağıranın önce `flush()` yapmasını garanti et.

---

### GÖREV 4: Yüz Tanıma (`faceRecognition.ts`) Canvas Bellek Sızıntısı ve HEIC Selfie Hata Yönetimi
* **Öncelik:** Orta (P1)
* **Etkilenen Dosyalar:**
  * `src/lib/faceRecognition.ts` (Satır 222–241)
  * `src/components/guest/FaceSearchPanel.tsx` (Satır 95–110)
* **Kök Neden:**
  1. `extractAllFacesFromImage` içinde `createBoundedCanvasFromImage` ile oluşturulan `HTMLCanvasElement`, `finally` bloğunda `input.width = 0; input.height = 0;` ile temizlenirken, **`extractSelfieFromFile`** (Satır 228) içinde oluşturulan `input` canvas'ı temizlenmiyor. iOS Safari'de tekrarlı aramalarda WebGL/Canvas bellek sızıntısına yol açar.
  2. Android/Chrome kullanıcıları `FaceSearchPanel` üzerinden `.heic` / `.heif` uzantılı bir fotoğraf seçtiğinde tarayıcı bunu decode edemez; kullanıcıya daha yönlendirici bir mesaj (`"Bu fotoğraf formatı (HEIC) tarayıcınızda açılamadı. Lütfen 'Selfie çek' seçeneğini kullanın veya JPEG/PNG seçin."`) gösterilmelidir.
* **Uygulanacak Çözüm:**
  1. `src/lib/faceRecognition.ts` içindeki `extractSelfieFromFile` fonksiyonunda `input` canvas'ını iç `try / finally` bloğuna al ve `if (input instanceof HTMLCanvasElement) { input.width = 0; input.height = 0; }` uygula.
  2. `decodeImage` hata mesajını HEIC/HEIF dosya adını/tipini kontrol ederek özelleştir.

---

### GÖREV 5: iOS Safari `MediaRecorder` Codec ve Video/Ses Önizleme Uyumluluğu
* **Öncelik:** Orta (P1)
* **Etkilenen Dosyalar:**
  * `src/components/guest/Recorder.tsx` (Satır 86–102)
  * `src/app/api/drive/ upload-session/route.ts` & `src/lib/media-config.ts`
* **Kök Neden:**
  * `Recorder.tsx` satır 88'de `const type = (recorder.mimeType || ...).split(";")[0];` ile codec parametresi kesilip `new Blob(chunks, { type })` oluşturuluyor. iOS Safari'de kaydedilen `video/mp4;codecs=avc1,mp4a` verisi yerel önizleme (`previewUrl`) sırasında tam `recorder.mimeType` ile Blob'a sarılmazsa bazı iOS sürümlerinde önizleme videosu siyah ekran verebilir veya ses çalmayabilir.
* **Uygulanacak Çözüm:**
  * `Recorder.tsx` içinde yerel önizleme `Blob`'unu oluştururken `recorder.mimeType || type` kullan; ancak `Recording.mimeType` alanına (sunucuya gönderilen normalize MIME) `normaliseMimeType` ile temizlenmiş baz tipi (`video/mp4`, `audio/webm` vb.) koymaya devam et.

---

### GÖREV 6: Yönetim Paneli İstatistik Darboğazı (`computeStats`) ve Galeri Cursor Sayfalama Kaybı
* **Öncelik:** Orta (P1)
* **Etkilenen Dosyalar:**
  * `src/app/api/host/events/[eventId]/route.ts` (Satır 15–43)
  * `supabase/migrations/0001_wedding_qr_drive.sql`
  * `src/app/api/events/[slug]/media/route.ts` (Satır 83–90)
  * `src/app/api/host/events/[eventId]/media/route.ts` (Satır 31–39)
* **Kök Neden:**
  1. `computeStats(eventId)` fonksiyonu her çağrıldığında (ve moderasyon ekranında her tekil onay/gizleme işleminde `onChanged -> refresh()` tetiklendiğinde) `fetchAllRows` ile 50.000 satıra kadar tüm `media_items` kayıtlarını Node.js belleğine çekip JS dizileri üzerinde `.filter()` çalıştırıyor.
  2. Galeri uç noktalarında `query.lt("created_at", cursor)` kullanılıyor. Toplu yüklemelerde aynı milisaniyede (`created_at`) oluşan iki kayıttan biri sayfa sınırına (`limit`) denk gelirse bir sonraki sayfada atlanır.
* **Uygulanacak Çözüm:**
  1. `computeStats` içinde tüm satırları çekmek yerine ya Postgres tarafında tek bir özet RPC fonksiyonu (`event_media_stats(p_event_id uuid)`) tanımla (veya mevcut yapı korunacaksa en azından `MediaModerationTab.tsx` içinde her tekil onaylamada tüm etkinliği yeniden çekmek yerine yalnızca gerekli sayaçları güncelle / debounce uygula).
  2. Sayfalama sorgularında sıralamayı `.order("created_at", { ascending: false }).order("id", { ascending: false })` yap.

---

### GÖREV 7: Bileşen Yaşam Döngüsü ve Bellek Temizliği (`QrCardDesigner` & `UploadPanel`)
* **Öncelik:** Düşük (P2)
* **Etkilenen Dosyalar:**
  * `src/components/host/QrCardDesigner.tsx` (Satır 379–387, 254–268)
  * `src/components/guest/UploadPanel.tsx` (Satır 58–135)
* **Kök Neden:**
  1. `QrCardDesigner.tsx` içindeki `onPhoto` fonksiyonu `URL.createObjectURL(file)` oluşturuyor ancak `img.onload` / `img.onerror` sonrasında veya yeni fotoğraf seçildiğinde `URL.revokeObjectURL` çağırmıyor.
  2. `UploadPanel.tsx` içinde kullanıcı yükleme devam ederken sekmeyi değiştirirse (`GuestApp` içinde `activeTab !== "upload"` olduğunda `UploadPanel` unmount olur!), devam eden yüklemelerin state'i sıfırlanır ancak XHR istekleri arka planda sahipsiz çalışmaya devam eder.
* **Uygulanacak Çözüm:**
  1. `QrCardDesigner.tsx` içinde `onPhoto` fonksiyonunda `img.onload` ve `img.onerror` içinde `URL.revokeObjectURL(objectUrl)` çağır (`HTMLImageElement` decode edildikten sonra canvas çizimi için `objectUrl`'in açık kalmasına gerek yoktur).
  2. `src/components/guest/GuestApp.tsx` (Satır 170–182) içinde `UploadPanel` bileşenini sekme değiştiğinde unmount etmek yerine `className={activeTab === "upload" ? "block" : "hidden"}` ile DOM'da tut. Böylece misafir fotoğrafları yüklenirken "Galeri" veya "Anı Defteri" sekmesine geçip gezinebilir ve yükleme kuyruğu / ilerleme durumu kaybolmaz!

---

## Doğrulama (Verification) Protokolü

Tüm görevler tamamlandıktan sonra sırasıyla şu komutları çalıştırın:

```bash
npm run lint
npm run typecheck
npm run build
```

* Hiçbir dosyada `@ts-ignore`, `@ts-expect-error` veya `eslint-disable` kullanılmamalıdır.
* Tüm hata mesajları projenin dil bütünlüğüne uygun olarak **Türkçe** kalmalıdır.
