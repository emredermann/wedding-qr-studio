# Çıkış Planı: Vercel ve Supabase'e bağımlı kalmadan çalıştırma

Mira bugün **Vercel** (uygulama) + **Supabase** (veritabanı ve giriş) + **Google Drive** (dosyalar) üzerinde çalışıyor. Bu rehber, gerektiğinde bu sağlayıcılardan birini ya da ikisini **kod yeniden yazmadan** bırakmanın yolunu anlatır.

| Parça | Bağımlılık | Çıkış yolu | Kod değişikliği |
| --- | --- | --- | --- |
| Uygulama (Next.js) | Düşük | Docker imajı: herhangi bir sunucu, AWS, Google Cloud… | Yok |
| Veritabanı (Postgres) | Düşük | `scripts/db-backup.sh` ile veriyi al, başka bir Supabase'e yükle | Yok |
| Giriş (Supabase Auth) | Orta | Kendi sunucunda Supabase (açık kaynak, aynı API) | Yok (yalnızca ortam değişkenleri) |
| Dosyalar (Google Drive) | Yok | Zaten her etkinlik sahibinin kendi Drive'ında | — |

> Bu daldaki her parça test edildi: Docker imajı derlenip çalıştırıldı (sağlık kontrolü “healthy”, sayfalar 200), yedek → geri yükleme pgvector'lü iki Postgres arasında denendi ve tüm tablolar birebir aynı çıktı (`rate_limits` hariç; o bilerek atlanır).

---

## 0. Önce: kendi alan adın

QR kodların içinde sitenin adresi var. Adres **senin alan adın** olduğu sürece, arkadaki sunucuyu değiştirmek basılı kartları hiç etkilemez; `vercel.app` adresine basılmış kartlar ise Vercel'den çıkınca çalışmaz.

- Alan adını bağımsız bir firmada tut (ör. Cloudflare Registrar) ve DNS'i oradan yönet.
- Kartları her zaman **kendi alan adından** açtığın panelden indir.
- Geçişten 1–2 gün önce DNS kayıtlarının TTL değerini düşür (ör. 300 sn); değişiklik dakikalar içinde yayılır.

---

## 1. Uygulama: Vercel'den çıkış (Docker)

Repodaki `Dockerfile`, Next.js'in *standalone* çıktısıyla kendi başına çalışan küçük bir Node.js sunucusu üretir. Vercel'deki derleme bundan etkilenmez (`NEXT_OUTPUT=standalone` yalnızca Docker içinde ayarlanır).

### Ortam değişkenleri

| Ne zaman | Değişkenler |
| --- | --- |
| **Derlemede** (`--build-arg`) — tarayıcı koduna gömülür | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN` |
| **Çalışırken** (`--env-file`) — imaja asla girmez | `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `APP_SECRET`, `TRUSTED_IP_HEADER` |

`NEXT_PUBLIC_*` değerlerinden biri değişirse imajı **yeniden derlemek** gerekir.

### A) Tek sunucu (VPS: Hetzner, DigitalOcean…) — en basit yol

`deploy/` klasöründe hazır bir kurulum var: Mira konteyneri + HTTPS sertifikasını kendiliğinden alan ve yenileyen **Caddy**.

1. Ubuntu bir sunucu aç (2 vCPU / 4 GB RAM 500 eşzamanlı misafir için yeterli bir başlangıçtır), Docker'ı kur.
2. Alan adının **A kaydını** sunucunun IP adresine yönlendir.
3. Repoyu sunucuya klonla, `.env.example` dosyasını `deploy/.env.production` olarak kopyala ve doldur (`NEXT_PUBLIC_APP_URL=https://alanadiniz.com`).
4. Çalıştır:

   ```bash
   cd deploy
   DOMAIN=alanadiniz.com docker compose --env-file .env.production up -d --build
   ```

5. `https://alanadiniz.com/api/health` adresi `{"ok":true,…}` dönmeli.

Güncelleme: `git pull` ve aynı `docker compose … up -d --build` komutu.

### B) AWS

İmajı bir kez derleyip Amazon ECR'ye gönder, sonra şunlardan birinde çalıştır:

- **AWS App Runner** — en az ayar: port `3000`, sağlık kontrolü yolu `/api/health`, çalışma zamanı değişkenleri ve sırlar (Secrets Manager) panelden.
- **ECS Fargate + Application Load Balancer** — daha fazla kontrol ve birden fazla konteyner.
- **Lightsail Containers** — en ucuz, küçük ölçek için.

```bash
docker build -t mira \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  --build-arg NEXT_PUBLIC_APP_URL=https://alanadiniz.com .
docker run -p 3000:3000 --env-file .env.production mira   # yerelde dene
```

Aynı imaj Google Cloud Run, Fly.io ve Render'da da çalışır.

### Bilmen gerekenler

- **Birden fazla konteyner sorunsuz.** Hız sınırları, yükleme kotaları ve oturumlar Postgres'te ve imzalı çerezlerde; konteynerler arasında paylaşılan bellek yok. Uygulama “server action” kullanmadığı için ek bir şifreleme anahtarı da gerekmez.
- **Misafirin IP adresi** (hız sınırı ve kota için): Caddy veya AWS ALB arkasında ek ayar gerekmez (uygulama `X-Forwarded-For` başlığının en sağdaki değerini okur). Önüne **Cloudflare** koyarsan `TRUSTED_IP_HEADER=cf-connecting-ip` ayarla.
- **Vercel Analytics / Speed Insights** Vercel dışında kendiliğinden devre dışı kalır; hata vermez.
- **Video akışı** (`/api/drive/stream`) uzun süren istekler açar; yük dengeleyicinin zaman aşımı en az 60 sn olmalı.
- Adres değişince güncelle: Google Cloud → OAuth istemcisi → yönlendirme adresi `https://alanadiniz.com/api/host/drive/callback`; Supabase → Authentication → URL Configuration → Site URL ve `https://alanadiniz.com/auth/callback`.

---

## 2. Veritabanı: düzenli yedek

### Elle yedek

```bash
DATABASE_URL='postgresql://postgres.<ref>:<şifre>@<pooler-host>:5432/postgres' \
BACKUP_PASSPHRASE='uzun-rastgele-bir-parola' \
  npm run db:backup                 # → backups/mira-backup-<tarih>.tar.gz.gpg
```

- `DATABASE_URL`: Supabase → Project Settings → Database → Connection string → **Session pooler** URI.
- `pg_dump` sürümü sunucununkiyle aynı ya da daha yeni olmalı (Supabase'in yeni projeleri Postgres 17). Gerekirse `PG_DUMP=/usr/lib/postgresql/17/bin/pg_dump`.
- Yedekte neler var: tüm uygulama tabloları (etkinlikler, medya kayıtları, anı defteri, kalpler, yüz vektörleri, ortak yöneticiler, kotalar, Drive bağlantıları, oturma planları, marka logoları ve çerçeveler) ve etkinlik sahibi hesapları (`auth.users`, `auth.identities`). Şema zaten `supabase/migrations/` içinde olduğu için yalnızca veri alınır.
- **Yedek kişisel veri içerir** (isimler, notlar, yüz vektörleri). Her zaman `BACKUP_PASSPHRASE` ile şifrele ve parolayı ayrı bir yerde (parola yöneticisi) sakla; parola olmadan yedek açılamaz. `backups/` klasörü git'e girmez.

### Otomatik haftalık yedek (GitHub Actions)

`.github/workflows/db-backup.yml` her pazar gece şifreli bir yedek alır ve 30 gün saklar (Actions → ilgili çalıştırma → Artifacts).

1. GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret**:
   - `SUPABASE_DB_URL` — Session pooler URI
   - `BACKUP_PASSPHRASE` — uzun, rastgele parola
2. Actions sekmesinden “Database backup” iş akışını bir kez elle çalıştır (**Run workflow**) ve artifact'ın oluştuğunu gör.

İki sır tanımlı değilse iş akışı hiçbir şey yapmaz; yedek asla şifresiz yüklenmez. Zamanlanmış çalışma yalnızca varsayılan dalda (`main`) etkindir.

> Ayda bir, bir yedeği boş bir test projesine geri yükleyerek yedeğin gerçekten açıldığını kontrol et. Hiç denenmemiş yedek, yedek sayılmaz.

---

## 3. Supabase'den çıkış: kendi sunucunda Supabase

Supabase açık kaynaktır; resmi Docker kurulumu Postgres, giriş (GoTrue), PostgREST ve API ağ geçidini birlikte getirir. Mira'nın kodu aynı API'leri kullandığı için **değişmez**.

1. Resmi rehberle kur: <https://supabase.com/docs/guides/self-hosting/docker> (yeni `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` ve veritabanı şifresi üretmeyi atlama). `pgvector` eklentisi imajda hazırdır.
2. Eski projeden son yedeği al (bölüm 2).
3. Yeni veritabanına geri yükle — migration'lar dahil:

   ```bash
   DATABASE_URL='postgresql://postgres:<şifre>@<yeni-sunucu>:5432/postgres' \
   BACKUP_PASSPHRASE='…' \
     npm run db:restore -- backups/mira-backup-<tarih>.tar.gz.gpg --with-migrations
   ```

   Yükleme tek bir işlemdir: hedef boş değilse ya da bir hata olursa hiçbir şey yazılmaz. Sonunda tablo satır sayıları yazdırılır.
4. Uygulamanın ortam değişkenlerini değiştir: `NEXT_PUBLIC_SUPABASE_URL` (yeni API adresi), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Docker kullanıyorsan imajı yeniden derle.
5. Yeni kurulumun Auth ayarlarında Site URL ve `https://alanadiniz.com/auth/callback` yönlendirmesini tanımla; yeni kayıtları kapat (`DISABLE_SIGNUP=true`).

**Etkinlik sahipleri ne yaşar?** Şifreleri taşınır (şifre özetleri `auth.users` içinde gelir), ama JWT anahtarı değiştiği için **bir kez yeniden giriş yapmaları** gerekir. Misafirler hiçbir şey fark etmez.

**Olası sorun:** Bulut ve kendi kurulumundaki giriş servisinin sürümleri çok farklıysa `auth.users` tablosunun kolonları uyuşmayabilir ve geri yükleme hata verir. Bu durumda kendi kurulumunu güncel sürüme yükselt; hesap sayısı azsa alternatif olarak hesapları `npm run user -- create` ile yeniden oluşturup yedeği `auth_users.sql` olmadan yükleyebilirsin.

Aynı adımlar, verileri **başka bir Supabase bulut projesine** (ör. farklı bir hesap ya da bölge) taşımak için de geçerlidir.

---

## 4. Taşınmayanlar ve asla değiştirilmemesi gerekenler

- **Fotoğraf ve videolar taşınmaz**, taşınması da gerekmez: her etkinlik sahibinin kendi Google Drive'ında durur. Veritabanı yalnızca Drive dosya kimliklerini tutar.
- **`APP_SECRET` aynı kalmalı.** Etkinlik sahiplerinin Drive bağlantı anahtarları bununla şifreli; değişirse herkes Drive'ını yeniden bağlamak zorunda kalır ve misafir çerezleri geçersiz olur.
- **Google OAuth istemcisi** (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) aynı kalabilir; yalnızca yeni adresin yönlendirme URI'sini ekle.

---

## 5. Geçiş günü kontrol listesi

**Önceden (1–2 gün):**
- [ ] DNS TTL'sini düşür (300 sn).
- [ ] Yeni ortamı kur, bir test yedeğini geri yükleyip dene.
- [ ] Geçişi etkinlik olmayan bir saate planla.

**Geçiş (yaklaşık 30 dakika):**
- [ ] Aktif etkinliklerde **Ayarlar → Misafir yüklemeleri**'ni geçici olarak kapat (yeni kayıt gelmesin).
- [ ] Son yedeği al → yeni veritabanına geri yükle (`--with-migrations`).
- [ ] Yeni uygulamanın ortam değişkenlerini ayarla, başlat; `/api/health` → `{"ok":true}`.
- [ ] DNS'i yeni sunucuya yönlendir.
- [ ] Google OAuth yönlendirme adresini ve Supabase Auth URL'lerini güncelle.

**Kontrol:**
- [ ] Etkinlik sahibi girişi (bir kez yeniden giriş beklenir)
- [ ] Etkinlik listesi ve ayarlar açılıyor
- [ ] Telefondan QR okut → fotoğraf yükle → galeride görünüyor
- [ ] Video oynuyor, canlı ekran yeni yüklemeyi gösteriyor
- [ ] “Beni Bul” eşleşme buluyor
- [ ] Yüklemeleri tekrar aç

**Geri dönüş:** Sorun çıkarsa DNS'i eski adrese geri çevir; eski ortam ve veritabanı dokunulmadan duruyor. Geçiş sırasında yüklemeler kapalı olduğu için iki taraf arasında veri farkı oluşmaz.

---

## 6. İleride: Supabase'i tamamen bırakmak

Kendi sunucunda Supabase çalıştırmak bile istenmezse (örneğin yalnızca AWS RDS + Cognito), veritabanı erişimi (`getAdminDb()` kullanan ~31 dosya) ve giriş (`src/lib/host-auth.ts` ve ilgili ~7 dosya) bir ara katmana taşınmalı. Bu büyük bir iştir ve ancak somut bir ihtiyaç doğduğunda, parça parça yapılması önerilir. Veriler yukarıdaki yedekle zaten standart Postgres olarak elinde.
