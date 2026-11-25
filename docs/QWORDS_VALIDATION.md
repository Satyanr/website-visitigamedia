# Validasi rilis Qwords

Audit lokal 25 November 2026 (WIB). PHP 8.2.12, Apache 2.4.58 XAMPP, Node 24.20.0, dan Chromium Playwright. Pengujian PHP/Chromium memakai fixture. Tidak ada perubahan hosting atau database.

| Pemeriksaan | Status | Bukti atau kondisi |
| --- | --- | --- |
| `npm ci`, `npm run lint`, `npm run typecheck` | PASS | Instalasi final lockfile dengan cache workspace, ESLint dan TypeScript. |
| `npm test` | PASS | 91 tes / 26 file. |
| `npm run test:qwords` dan PHP lint | PASS | 68 pemeriksaan, 0 skipped di Windows PHP 8.2.12 + Apache. Termasuk child routing, ACME, proteksi backup/PHP, query WordPress, gzip, cache, CSP dan Authorization. |
| PHP 8.3.37 dan 8.4.28 CLI | PASS | Masing-masing 60 pemeriksaan runtime/build guard, enam extension wajib + ZIP, dan verifikasi ZIP. Binary x64 NTS terlebih dahulu diverifikasi menggunakan SHA-256 resmi. [PHP 8.3](https://www.php.net/downloads.php?os=windows&version=8.3), [PHP 8.4](https://www.php.net/downloads.php?os=windows&version=8.4). |
| Chromium Qwords E2E | PASS | 4 tes, termasuk 34 URL publik id/en, mobile, admin refresh, mock CMS detail, contact RPC dan noindex staging. |
| Snapshot refresh dan mode indexable | PASS | Dua build fresh dengan tabel CMS fixture berbeda menghasilkan H1 dan SHA-256 homepage id/en yang berbeda. HTML publik indexable dan admin noindex. Percobaan fixture awal mengosongkan gambar hero sehingga fallback tetap muncul. Fixture dengan gambar lokal valid lulus ulang. |
| `npm run build:qwords` dan `npm run package:qwords` | PASS | Build staging offline dan 34 snapshot localized + halaman 404. Guard produksi menolak offline dan konfigurasi Supabase kosong. |
| Verifikasi ZIP dan validator redirect | PASS | `.htaccess` ada dalam ZIP Windows, SHA-256 cocok, ZIP tanpa `.htaccess` ditolak, inventaris kosong lulus dan mapping positif/negatif diuji melalui runtime. |
| `npm run build` Cloudflare | PASS | Smoke build offline untuk memastikan jalur build alternatif tetap berfungsi. |
| `npm run budget` | PASS | Staging Qwords dan build Cloudflare offline, JS gzip 122,5/125 KiB, CSS gzip 19,6/22 KiB, hero 43,4/60 KiB, total termasuk logo 215,8/220 KiB. |
| `npm audit --omit=dev` | PASS | 0 advisori dependency runtime yang dilaporkan saat audit. |
| `npm audit` seluruh dependency | FAIL | 47 advisori tooling/development tersisa (4 low, 10 moderate, 30 high, 3 critical). Perubahan lockfile difokuskan pada DOMPurify. |
| Linux Apache, ZIP Linux dan pemagaran environment GitHub | SKIPPED | Workflow lolos parsing YAML lokal. Runner remote belum dijalankan dan proteksi environment harus dikonfirmasi di GitHub. |
| Qwords LiteSpeed, DirectAdmin, TLS, `open_basedir`, legacy app nyata, CWV | REQUIRES LIVE STAGING | Uji di host yang diberikan Qwords, dengan inventaris dan baseline yang sah. Tidak ada pengukuran CWV/TTFB live. |
| Supabase online, Auth/RLS/Storage, migrasi policy careers, DeepL, build produksi | REQUIRES LIVE STAGING | Konfigurasi terotorisasi dan pengujian terisolasi belum tersedia. Bukti fixture tidak mewakili project hosted. |

## Ukuran artifact staging offline

- `artifacts/qwords-staging.zip` berukuran 50.324.141 byte, sekitar 48,0 MiB. Ukuran uncompressed 52.421.398 byte, sekitar 50,0 MiB.
- 432 file deployment dan 48 direktori, sekitar 480 inode sebelum overhead ZIP/extraction. Manifest menambah satu file pada arsip. Satu salinan rollback setara memerlukan sekitar 480 inode dan 50,0 MiB tambahan. Hitung salinan WordPress/legacy yang sebenarnya terpisah.
- File terbesar adalah katalog PDF (4.042.773 byte), MP4 showreel (3.223.775 byte), dan WebM showreel (2.290.510 byte). Laporan `artifacts/qwords-staging.zip.report.json` berisi daftar lengkap dan checksum paket.

## SEO dan HTTP yang harus diverifikasi di staging

| Permukaan | Hasil yang diharapkan |
| --- | --- |
| Halaman statis id/en | Prerender tanpa JavaScript, metadata canonical/hreflang, OG/Twitter, JSON-LD, semantic heading dan gambar. Setelah batch CMS, rerun artifact build, periksa hash dari manifest dan isi HTML halaman yang terdampak, kemudian rilis manual. |
| Detail berita dan portfolio | 200 untuk record publik. 301 satu kali untuk canonical/suffix dan portfolio alias yang masih hidup. 404 untuk slug tidak valid, hilang, dihapus atau berita unpublished, termasuk tanpa locale. 503 dengan `Retry-After` ketika query gagal. |
| Sitemap dan robots | Sitemap segar per request, locale id/en/x-default dan lastmod, tanpa slug hilang; ukuran dan jumlah terbatas. Staging mengirim noindex dan robots disallow, produksi indexable pada halaman publik dan admin tetap noindex. |
| Cache | Upstream runtime dibatasi dengan timeout per request dan total. Detail/sitemap/API memakai `no-store` dan LiteSpeed no-cache. HTML statis revalidate. Aset hashed bisa immutable. Purge rule/cache lama saat cutover. |
| Staging nyata | Uji A/B perubahan CMS dengan screenshot/HTML snapshot, mobile dan desktop, direct admin refresh, TLS, ACME, CSP dan gzip. Catat baseline dan hasil Lighthouse/CWV/TTFB di origin produksi/staging sebanding. Asset budget lokal hanya menghitung JS, CSS, mobile hero dan file logo. |

Snapshot daftar/homepage dapat menyimpan data publik dari waktu build. Prioritaskan rebuild bila konten yang sebelumnya publik dihapus atau di-unpublish. Pakai project staging dengan marker terkontrol dan bandingkan snapshot sebelum/sesudah. Data gambar yang pernah diunggah ke bucket public tetap dapat dibuka lewat URL sampai object tersebut dipindah/dihapus oleh admin yang berwenang.

## Supabase read-only

Audit statis mencakup 52 migrasi existing dan menemukan 18 tabel public yang dibuat dengan RLS diaktifkan. Rujuk kebijakan historis di [audit Supabase](../supabase/RLS_AUDIT.md) dan cocokkan riwayat serta kebijakan efektif dengan Dashboard project terotorisasi. Kebijakan lowongan publik lama mengacu ke fungsi `is_admin()`, padahal kebijakan admin terpisah sudah ada dan grant fungsi untuk anon bergantung konfigurasi project. Migrasi baru memisahkan kedua jalur. Uji GET anon, GET non-admin dan read/write admin di project terisolasi sebelum mempertimbangkan penerapan pada production. Pada project dengan skema yang sudah cocok, ganti konfigurasi origin/build dan runtime tanpa menjalankan ulang migrasi.

1. Dapatkan origin project dan publishable key/legacy anon dari pemilik. Jalankan prosedur dari mesin yang berwenang dan simpan hanya status, nama tabel dan hitungan. Gunakan Header `apikey` untuk publishable key, tambah `Authorization: Bearer <anon JWT>` hanya untuk legacy key. Jangan gunakan `service_role`.
2. Jalankan template PowerShell berikut setelah mengatur `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` di sesi privat. Semua query memakai GET dengan proyeksi dan limit satu. Hasil nol diperbolehkan untuk koleksi kosong. Singleton/config seharusnya ada untuk rilis online.

   ```powershell
   $origin = ([uri]$env:VITE_SUPABASE_URL).GetLeftPart([UriPartial]::Authority)
   $key = $env:VITE_SUPABASE_PUBLISHABLE_KEY
   if (!$origin.StartsWith('https://') -or !$key -or $key.StartsWith('sb_secret_')) { throw 'Gunakan origin HTTPS dan key publik yang diotorisasi.' }
   node --input-type=module -e "import {assertPublicKey} from './scripts/qwords-lib.mjs'; assertPublicKey(process.env.VITE_SUPABASE_PUBLISHABLE_KEY)"
   if ($LASTEXITCODE -ne 0) { throw 'Public key invalid.' }
   $headers = @{ apikey = $key; Accept = 'application/json' }
   if (!$key.StartsWith('sb_publishable_')) { $headers.Authorization = "Bearer $key" }
   $queries = [ordered]@{
     news = 'select=slug,published_at,updated_at&published_at=not.is.null'
     portfolios = 'select=id,slug,updated_at'
     portfolio_slug_aliases = 'select=old_slug,portfolio_id'
     products = 'select=id,sort_order'
     product_catalogue = 'select=id,file_url&id=eq.1'
     homepage_content = 'select=id&id=eq.1'
     service_content = 'select=id&id=eq.1'
     service_landings = 'select=slug,service_landing_portfolios(portfolio_id,position)'
     about_content = 'select=id&id=eq.1'
     contact_settings = 'select=id&id=eq.1'
     careers_jobs = 'select=id,status&status=eq.published'
     careers_page_content = 'select=id&id=eq.1'
   }
   foreach ($table in $queries.Keys) {
     try {
       $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0 -Headers $headers -Uri "$origin/rest/v1/${table}?$($queries[$table])&limit=1"
       if ($response.StatusCode -ne 200) { throw 'Unexpected HTTP status' }
       $decoded = ConvertFrom-Json -InputObject $response.Content
       "$table PASS ($(@($decoded | Where-Object { $null -ne $_ }).Count) rows returned)"
     } catch {
       Write-Warning "$table FAIL. Check status and schema in the private dashboard."
     }
   }
   ```

3. Jalankan build online sebagai pemeriksaan tambahan untuk keberadaan konfigurasi singleton, enam slug service landing, bentuk dataset dan HTML. Di Storage dashboard, periksa properti, MIME dan policy bucket `website-media`. Lakukan HEAD ke URL satu object publik yang diketahui di `/storage/v1/object/public/website-media/…`, lalu cek 200/MIME dan keterbacaan di staging. Jangan menebak nama object. Kebijakan operasi listing/upload/update/delete harus diuji terisolasi di bawah ini.

## Supabase Auth, RLS dan mutasi di project testing terisolasi

Jangan menjalankan rangkaian mutasi pada produksi. Siapkan akun visitor tanpa sesi, authenticated non-admin, dan admin dengan role yang disetel lewat jalur administrator tepercaya. Catat JWT expiry/refresh, logout, redirect URL/callback, claim `app_metadata.role`, cookie/session dan hasil tiap operasi tanpa menyalin password atau token. Claim `user_metadata.role` tidak boleh memberi akses admin.

- Anon/non-admin hanya dapat melihat berita publish dan lowongan publish serta koleksi/konfigurasi publik. Cocokkan `news`, `portfolios`, alias, `products`, `product_catalogue`, homepage, about, contact, service content/landings/junction, careers jobs dan careers page dengan tabel migrasinya. Tes draft, perubahan slug, publish/unpublish, hapus, upload dan kasus record kosong. Portfolio saat ini seluruh tabel publik berdasarkan kebijakan repo. Draft portfolio privat memerlukan model publikasi tersendiri.
- Uji Auth JWT via `/auth/v1/user` dan API terjemahan. Anon/non-admin/JWT kedaluwarsa ditolak. Auth outage 503 dan provider failure terkontrol. DeepL key opsional di config private. Uji terjemahan nyata hanya bila key testing dan biaya sudah disetujui.
- Uji RPC publik `submit_contact_message`, `submit_news_comment`, `submit_careers_submission`, dan `submit_website_observation` dengan payload fixture serta batas rate/honeypot. Akses daftar/moderasi/lead, `save_service_landing`, RPC mark-as-read/purge, observability dan dashboard analytics/realtime tetap terbatas sesuai migrasi. Uji insert `website_events` yang sah dan akses baca/admin. Cocokkan grant kolom untuk data sensitif dan join pada `careers_submissions`.
- Uji download object public dan upload/update/delete/list admin pada `website-media`. Periksa bahwa non-admin tidak mendapat write/list. Uji MIME dan batas ukuran gambar/PDF/video. Bucket public tidak sesuai untuk menyimpan file privat atau media draft yang harus dirahasiakan.
- Jika kepemilikan berubah, utamakan transfer akses/organisasi project existing sesuai persetujuan. Bila project baru benar-benar diperlukan, ekspor/restore schema dan data, migrasikan Auth dan storage objects melalui prosedur resmi yang cocok, verifikasi grant/RLS, callback, public URLs, newsletter/RPC dan hitungan sebelum switch. Lakukan dry run di project isolated, pertahankan project lama sebagai rollback, dan dapatkan approval untuk tiap perubahan production. [Restore project Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase), [Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).
