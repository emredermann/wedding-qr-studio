# Canlıya Alma Rehberi (sıfır maliyet)

Bu rehber projeyi **GitHub → Vercel** (önerilen) veya **Render** üzerinde, veritabanı için **Supabase** ve depolama için **kişisel Google Drive** ile ücretsiz olarak yayına almanızı adım adım anlatır. Toplam süre yaklaşık 30–40 dakikadır.

> Kullanılan ücretsiz katmanlar: Supabase Free (500 MB veritabanı; burada yalnızca meta veri tutulur), Google Drive (Gmail ile paylaşılan 15 GB; dilerseniz Google One ile artırılır), Vercel Hobby (kişisel ve ticari olmayan kullanım için).

---

## 0. Gereksinimler

- Node.js **20.9+** (önerilen 22 LTS) ve npm
- Bir GitHub hesabı, bir Google hesabı (medyanın duracağı Drive), bir Supabase hesabı, bir Vercel hesabı

```bash
git clone https://github.com/<kullanıcı>/wedding-qr-studio.git
cd wedding-qr-studio
npm install
cp .env.example .env.local      # Windows PowerShell: Copy-Item .env.example .env.local
```

---

## 1. Supabase (veritabanı + düğün sahibi girişi)

1. https://supabase.com → **New project**. Bölge olarak size en yakın olanı seçin (Türkiye için **Frankfurt (eu-central-1)**). Veritabanı şifresini bir yere not edin.
2. Proje açılınca **SQL Editor → New query** sayfasına gidin. `supabase/migrations/0001_wedding_qr_drive.sql` dosyasının **tamamını** yapıştırıp **Run**’a basın. Script `vector` eklentisini, tabloları, RLS’i ve fonksiyonları oluşturur. Birden fazla kez çalıştırmak güvenlidir.
3. **Project Settings → API** sayfasındaki değerleri `.env.local` dosyasına kopyalayın:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / *publishable* key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` / *secret* key → `SUPABASE_SERVICE_ROLE_KEY` (**gizli**, yalnızca sunucuda)
4. **Authentication → URL Configuration**:
   - **Site URL**: şimdilik `http://localhost:3000` (yayına aldıktan sonra Vercel adresinizle değiştireceksiniz)
   - **Redirect URLs**: `http://localhost:3000/auth/callback` ekleyin
5. *(İsteğe bağlı)* **Authentication → Providers → Email**: tek kullanıcı (siz) olacaksanız “Confirm email” ayarını kapatarak e-posta doğrulamasını atlayabilirsiniz.

> **Neon veya Turso neden yok?** Düğün sahibi girişi için Supabase Auth kullanılıyor. Neon/Turso’da yerleşik bir kimlik doğrulama yok; Supabase’in ücretsiz katmanı Postgres + pgvector + Auth’u tek yerde veriyor.

---

## 2. Google Cloud: Drive API + OAuth istemcisi

> **Neden Service Account değil?** Service Account’ların kişisel Google hesaplarında depolama kotası 0 GB’dir ve yüklemeler `storageQuotaExceeded` hatası verir. Bu yüzden Google hesabı adına çalışan bir **OAuth2 refresh token** kullanılır.

### Medya kimin Drive’ına gider?

| Mod | Nasıl | Ne zaman |
| --- | --- | --- |
| **Her düğün sahibinin kendi Drive’ı** (önerilen) | Düğün sahibi panelde **“Google Drive’ı bağla”** düğmesine basar, kendi Google hesabıyla izin verir. Medya onun Drive’ındaki “Wedding QR” klasörüne gider. | Platformu başkaları da kullanacaksa. |
| **Platform Drive’ı** (isteğe bağlı) | Siz bir kez `npm run drive:token -- --write` çalıştırırsınız; Drive bağlamamış düğün sahiplerinin etkinlikleri sizin Drive’ınıza gider. | Sadece kendi düğününüz/arkadaşlarınız için, ya da yedek olarak. |

İkisi birlikte de çalışır: Drive’ını bağlayan düğün sahibinin **yeni** etkinlikleri kendi Drive’ına, bağlamayanınki platform Drive’ına gider. Platform Drive’ını hiç kurmazsanız (`GOOGLE_REFRESH_TOKEN` ve `GOOGLE_DRIVE_ROOT_FOLDER_ID` boş), her düğün sahibi etkinlik açmadan önce Drive’ını bağlamak zorundadır.

### Adımlar

1. https://console.cloud.google.com → üstten **yeni proje** oluşturun (ör. `wedding-qr`).
2. **APIs & Services → Library** → “**Google Drive API**” → **Enable**.
3. **Google Auth Platform → Branding / Audience / Data access** (eski arayüzde *OAuth consent screen*):
   - User type: **External** → uygulama adı, destek e-postası ve (yayına alınca) ana sayfa adresinizi girin.
   - **Data access → Add or remove scopes**: `openid`, `.../auth/userinfo.email` ve `.../auth/drive.file` (*“See, edit, create and delete only the specific Google Drive files you use with this app”*). Üçü de hassas olmayan kapsamlardır; Google doğrulaması gerekmez.
   - **Audience → Publish app** ile durumu **In production** yapın. Bu iki nedenle şart: “Testing” durumunda yalnızca listeye eklediğiniz test kullanıcıları bağlanabilir (diğer herkes *“Erişim engellendi: … Google doğrulama sürecini tamamlamadı”* hatası alır) ve refresh token’lar **7 gün sonra** geçersiz olur. Yayındaki uygulamada kullanıcılar bir kez *“Google bu uygulamayı doğrulamadı”* uyarısı görebilir; **Gelişmiş → … sayfasına git** ile devam ederler.
4. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application** (Drive bağlama akışı tarayıcıdan bir web adresine döndüğü için *Desktop app* bu akışla çalışmaz).
   - **Authorized redirect URIs** listesine şunları ekleyin:
     - `http://localhost:3000/api/host/drive/callback` (yerel geliştirme)
     - `https://<alan-adınız>/api/host/drive/callback` (yayın — ör. `https://wedding-qr.vercel.app/api/host/drive/callback`)
     - `http://127.0.0.1:53682/oauth2callback` (yalnızca platform Drive’ı için `npm run drive:token` kullanacaksanız)
   - Çıkan **Client ID** ve **Client secret** değerlerini `.env.local` içindeki `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` alanlarına yazın.
   - Daha önce *Desktop app* türünde istemci oluşturduysanız, yeni bir *Web application* istemcisi oluşturup `.env.local` ve Vercel’deki değerleri onunla değiştirin.
5. **Kendi Drive’ınızı bağlama (önerilen):** Uygulamayı çalıştırın, `/dashboard` sayfasında **Google Drive’ı bağla** düğmesine basın, Google hesabınızı seçin ve izin ekranında **Google Drive kutucuğunun işaretli** olduğundan emin olun. Drive’ınızda “Wedding QR” klasörü otomatik oluşur. Bağlantı anahtarı veritabanında `APP_SECRET`’tan türetilen bir anahtarla AES-256-GCM ile şifrelenmiş olarak saklanır ve tarayıcıya hiç gönderilmez.
6. **Platform Drive’ı (isteğe bağlı):**

   ```bash
   npm run drive:token -- --write
   ```

   - Terminal bir yetkilendirme adresi yazdırır; açıp medyanın saklanacağı Google hesabıyla izin verin.
   - Tarayıcı `127.0.0.1` adresine döner ve script kodu otomatik yakalar. Dönmezse adres çubuğundaki URL’yi veya `code` değerini terminale yapıştırın.
   - Script Drive’da **“Wedding QR”** kök klasörünü oluşturur ve `GOOGLE_REFRESH_TOKEN` ile `GOOGLE_DRIVE_ROOT_FOLDER_ID` değerlerini `.env.local` dosyasına yazar.
   - `drive.file` kapsamı yalnızca uygulamanın **kendi oluşturduğu** klasörleri görür; Drive’da elle açtığınız bir klasörün ID’sini kullanmayın.

> **Önemli:** `APP_SECRET` değiştirilirse kayıtlı Drive bağlantılarının şifresi çözülemez; düğün sahiplerinin Drive’larını yeniden bağlaması gerekir. Bu yüzden `APP_SECRET`’i sabit tutun.

---

## 3. Uygulama gizli anahtarı

`APP_SECRET`, misafir çerezlerini ve yükleme izinlerini imzalar. En az 32 karakter olmalıdır:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Çıktıyı `.env.local` içindeki `APP_SECRET=` satırına yapıştırın.

---

## 4. Yerelde çalıştırma ve doğrulama

```bash
npm run dev
```

1. http://localhost:3000/login → hesap oluşturup giriş yapın.
2. **Yeni etkinlik** oluşturun. Drive’daki `Wedding QR/` altında `<Etkinlik>_<slug>/Photos|Videos|VoiceNotes` klasörleri görünmeli.
3. Özet sekmesindeki misafir bağlantısını telefonda açın (aynı Wi-Fi’de `http://<bilgisayar-IP>:3000/e/<slug>`), isim girip bir fotoğraf yükleyin.
4. Production build’i doğrulayın:

```bash
npm run check   # lint + typecheck + test + build — hepsi hatasız bitmeli
```

Bir ortam değişkeni eksikse sunucu açılırken terminalde çerçeveli bir uyarı listesi çıkar ve API’ler `503 SERVER_MISCONFIGURED` döner.

---

## 5. GitHub’a gönderme (secret sızıntısı olmadan)

`.gitignore` dosyası `.env*` (yalnızca `.env.example` hariç), `token.json`, `credentials.json`, `client_secret*.json`, `*.pem`, `*.db`, `*.sqlite`, `uploads/`, `tmp/` ve `.local-storage/` yollarını dışarıda bırakır. Göndermeden önce kontrol edin:

```bash
git status                 # .env.local listede OLMAMALI
git check-ignore -v .env.local
git add -A && git commit -m "Google Drive storage" && git push
```

Kodda hiçbir Client ID, Secret, Token veya Folder ID sabit olarak yazılı değildir; hepsi `process.env` üzerinden okunur.

---

## 6. Vercel’e deploy (önerilen)

1. https://vercel.com/new → GitHub reposunu **Import** edin. Framework otomatik olarak **Next.js** seçilir; Build Command `npm run build`, Install Command `npm install` olarak kalabilir.
2. **Environment Variables** bölümüne `.env.local` içindeki **tüm** anahtarları ekleyin:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `APP_SECRET`
   (Kendi alan adınızı kullanacaksanız `NEXT_PUBLIC_APP_URL=https://alanadiniz.com` de ekleyin.)
3. **Deploy**’a basın. Sonraki her `git push` otomatik olarak yeniden deploy edilir.
4. Supabase → **Authentication → URL Configuration**:
   - **Site URL** = `https://<proje>.vercel.app` (veya kendi alan adınız)
   - **Redirect URLs** listesine `https://<proje>.vercel.app/auth/callback` ekleyin.
5. `vercel.json` fonksiyonları **Frankfurt (`fra1`)** bölgesinde çalıştırır. Supabase projeniz başka bir bölgedeyse buradaki `regions` değerini ona en yakın bölgeyle değiştirin.

**Yayın sonrası kontrol listesi**

- [ ] `https://<proje>.vercel.app/login` ile giriş yapılıyor
- [ ] Etkinlik oluşturunca Drive’da klasörler açılıyor
- [ ] Telefondan fotoğraf yüklenince ilerleme çubuğu %100’e ulaşıyor ve galeride görünüyor
- [ ] iPhone HEIC fotoğrafı galeride JPEG olarak görüntüleniyor
- [ ] Video oynatılıyor (Range akışı)
- [ ] `/e/<slug>/live` sayfası yeni yüklemeyi ~6 sn içinde gösteriyor
- [ ] “Beni Bul” selfie ile eşleşen fotoğrafları getiriyor
- [ ] QR & Masa Kartı sekmesinden PDF indirilip basılabiliyor

---

## 7. Alternatif: Render

1. https://render.com → **New → Web Service** → GitHub reposunu seçin.
2. Runtime **Node**, Build Command `npm ci && npm run build`, Start Command `npm run start`.
3. Environment bölümüne 6. adımdaki değişkenlerin aynısını ekleyin.
4. Supabase’deki Site URL ve Redirect URL’leri Render adresinizle güncelleyin.

> Render’ın ücretsiz planı 15 dakika işlem olmazsa uykuya geçer; ilk istek 30–60 sn sürebilir. Düğün günü için Vercel daha uygundur.

> **Cloudflare Pages önerilmez:** API rotaları Node.js çalışma zamanı (`node:crypto`, akış proxy’si) kullanır. Cloudflare’in Next.js adaptörü Edge çalışma zamanı gerektirdiği için bu proje Vercel veya Render ile çalıştırılmalıdır.

---

## 8. Düğün günü kullanım

1. **QR & Masa Kartı** sekmesinde şablonu seçin, masa numarası aralığını girin (ör. 1–20) ve **PDF (baskı)** indirin. Yazdırırken “Gerçek boyut / %100” seçin ve QR’ı bir telefonla test edin.
2. Salondaki projeksiyon bilgisayarında **Canlı Düğün Ekranı** bağlantısını açın ve tam ekran düğmesine basın.
3. Gerekirse **Ayarlar → Yayından önce onay iste** seçeneğini açın; yeni içerikler siz onaylayana kadar galeride ve canlı ekranda görünmez.
4. Düğünden sonra **Özet → Tüm medyayı indir (ZIP)** ile her şeyi orijinal kalitede indirin veya doğrudan **Google Drive klasörü**nü açın.

---

## 9. Sorun giderme

| Belirti | Neden / Çözüm |
| --- | --- |
| API `503 SERVER_MISCONFIGURED` | Bir ortam değişkeni eksik veya hatalı. Yanıttaki `details.env` listesi hangisi olduğunu söyler; Vercel’de değişkeni ekleyip **Redeploy** edin. |
| `409 DRIVE_NOT_CONNECTED` | Etkinliğin medyasını sakladığı Drive kullanılamıyor: düğün sahibi Drive bağlantısını kopardı/iptal etti ya da platform Drive’ı yapılandırılmadı. Düğün sahibi panelde **Yeniden bağla**’ya (aynı Google hesabıyla) basmalı. |
| Drive bağlarken `redirect_uri_mismatch` | Google Cloud’daki *Web application* istemcisine `https://<alan-adınız>/api/host/drive/callback` adresini ekleyin. Özel alan adı kullanıyorsanız `NEXT_PUBLIC_APP_URL` de aynı adres olmalı. |
| `503 DRIVE_AUTH_FAILED` / `invalid_grant` | Refresh token iptal edilmiş veya süresi dolmuş (çoğunlukla OAuth ekranı “Testing” durumunda kaldığı için). Uygulamayı **In production** yapın, `npm run drive:token -- --write` komutunu tekrar çalıştırın ve yeni token’ı Vercel’e girin. |
| Yükleme `507 DRIVE_FULL` | Drive'da yeterli boş alan yok; yükleme başlamadan reddedildi. Google One ile alan ekleyin veya eski dosyaları silin. |
| Yükleme `429 UPLOAD_QUOTA_EXCEEDED` | Bir misafir (20 GB / 1500 dosya) veya bir ağ (80 GB / 8000 dosya) etkinlik başı sınıra ulaştı. Sınırlar `src/lib/upload-quota.ts` içinde. |
| Yükleme `ORIGIN_NOT_ALLOWED` | Siteye proxy veya farklı bir alan adı üzerinden erişiliyor. `NEXT_PUBLIC_APP_URL` değerini tarayıcıdaki adresle aynı yapın. |
| Yükleme Drive’a giderken CORS hatası | Upload session URI’si başka bir origin için açılmış. Sayfayı yenileyip tekrar deneyin; `NEXT_PUBLIC_APP_URL` değerini kontrol edin. |
| Drive `storageQuotaExceeded` | Drive (15 GB) dolu. Google One ile alan ekleyin veya eski dosyaları silin. |
| Galeride görseller açılmıyor | Dosya “bağlantıya sahip herkes” ile paylaşılamamış olabilir. Google Workspace hesaplarında yönetici dış paylaşımı kapatmış olabilir; kişisel Gmail hesabı kullanın. Yeni yüklenen videoların küçük resmi birkaç dakika içinde hazırlanır. |
| “Beni Bul” hiçbir şey bulmuyor | Yüz vektörleri yükleme sırasında misafirin tarayıcısında çıkarılır. Android Chrome HEIC dosyalarını çözemediği için bu fotoğraflar indekslenmez; iPhone Safari ve JPEG yüklemelerinde sorun yoktur. |
| Hesap oluşturduktan sonra giriş yapılamıyor | E-posta doğrulaması bekleniyor. Gelen kutunuzu kontrol edin veya Supabase’de “Confirm email” ayarını kapatın. |

---

> **Şemayı güncellediyseniz:** `supabase/migrations/0001_wedding_qr_drive.sql` yeniden çalıştırılabilir (idempotent). Yükleme kotası (`upload_quota`, `reserve_upload_quota`) ve istatistik (`event_media_stats`) fonksiyonları bu dosyadadır; eski bir kurulumda dosyayı SQL Editor'da bir kez daha çalıştırın.

## 10. Güvenlik özeti

- Tarayıcı veritabanına hiçbir zaman doğrudan erişmez: tüm tablolarda RLS açıktır ve `anon`/`authenticated` rollerine izin verilmez. Sunucu `SUPABASE_SERVICE_ROLE_KEY` ile çalışır ve sahiplik kontrolünü API katmanında yapar.
- Misafirler hesapsızdır; kimlikleri `APP_SECRET` ile imzalanmış HttpOnly bir çerezde tutulur. Her misafir yalnızca kendi yüklemelerini silebilir.
- `/api/media/confirm` şu kontrolleri yapar: imzalı token (24 saat) ve oturum eşleşmesi, Drive `appProperties.wqrUploadId`, hedef klasör, birebir boyut ve dosyanın ilk 64 baytındaki magic-byte imzası. Uyuşmayan dosya Drive çöp kutusuna taşınır.
- Stream ve küçük resim proxy’leri yalnızca veritabanında kayıtlı dosyaları sunar; onaylanmamış dosyalara yalnızca yükleyen misafir veya düğün sahibi erişebilir.
- Moderasyonda “Gizle”, Drive’daki “bağlantıya sahip herkes” iznini de kaldırır.
- Postgres tabanlı rate limit tüm serverless örneklerinde ortak çalışır.
