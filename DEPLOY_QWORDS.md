# Deployment Qwords Cloud Hosting SOHO

Rilis Qwords memakai frontend React/Vite yang sama, prerender HTML, PHP untuk routing/SEO/API terjemahan, dan Supabase yang sudah ada. Target produksi adalah `https://visitigamedia.com`. Build berjalan di Windows/Linux atau CI. Hosting menjalankan PHP saja.

## Prasyarat hosting dan keputusan cutover

- Gunakan staging ber-HTTPS dengan document root dan sibling private miliknya sendiri. Isolasi Supabase staging dari produksi.
- Konfirmasi PHP 8.2, 8.3, atau 8.4 dengan patch yang didukung Qwords, modul `curl`, `openssl`, `mbstring`, `dom`, `json`, `libxml`, memori minimal 128 MiB, dan waktu eksekusi minimal 30 detik sesuai kebutuhan dispatcher. Uji batas tambahan FastCGI/LiteSpeed, CA TLS, DNS, koneksi HTTPS ke Supabase dan, bila dipakai, DeepL.
- Konfirmasi `.htaccess` efektif. Aturan memerlukan Apache 2.4 atau perilaku setara LiteSpeed, `mod_rewrite` termasuk `InheritDownBefore` dan `END`, serta izin override `FileInfo` dan `Options` (atau daftar directive yang ekuivalen). Minta Qwords memeriksa FollowSymLinks/SymLinksIfOwnerMatch, `mod_headers` (termasuk kondisi ekspresi), `mod_deflate`, dan forwarding Authorization ke PHP. PHP menentukan canonical slash untuk Qwords. Konfirmasi `DirectoryIndex` dan kebutuhan override `Indexes` pada setiap aplikasi legacy.
- Jika `open_basedir` aktif, izinkan sibling `qwords-private` dibaca oleh PHP. Verifikasi owner akun dan izin minimum yang sesuai dengan handler (mulai dari 0755 direktori public, 0644 file public, 0750 private dan 0600 konfigurasi bila PHP berjalan sebagai owner). Folder private harus di luar semua document root, alias dan subdomain. Periksa symlink, OPcache dan cache LiteSpeed/CDN.
- Gunakan Force HTTPS DirectAdmin/vhost setelah sertifikat valid. Uji HTTP → HTTPS satu kali, metode API pada HTTPS, serta jangkauan ACME `/.well-known/acme-challenge/` melalui jalur validasi Qwords. PHP hanya mengirim HSTS setelah `https_verified=true` dan server melaporkan HTTPS yang tepercaya. Jika HSTS harus berlaku juga pada file statis, atur di panel/vhost setelah persetujuan. Uji CSP, media dan gzip di browser staging.
- Saldo berdasarkan observasi lama adalah 8.722 inode (250.000 dikurangi 241.278) dan kuota disk 50 GB. Ukur ulang penggunaan dan ukuran WordPress, staging, ZIP, backup, serta salinan rollback sebelum upload. Simpan backup tambahan di luar akun bila kapasitas kurang.
- Inventarisasi document root, jalur aplikasi, subdomain, alias, `.htaccess` bertingkat, email, cron, dan WordPress. Untuk prosedur karantina dan mapping, pakai [runbook migrasi](docs/WORDPRESS_MIGRATION.md). Jika hierarki shared root gagal memenuhi uji isolasi atau child routing, minta Qwords menetapkan document root terpisah pada saat cutover yang disetujui. Struktur sibling tetap dipertahankan. Aplikasi lama yang masih diperlukan harus mendapat jalur hosting yang diverifikasi oleh operator.

Jalankan [diagnostik staging](docs/QWORDS_PREFLIGHT.md) dan [uji validasi](docs/QWORDS_VALIDATION.md) sebelum menyetujui cutover.

## Build dan konfigurasi

Di mesin build gunakan Node 22+, npm, PHP CLI dengan ekstensi ZIP, dan Chromium Playwright.

| Variabel build | Kegunaan |
| --- | --- |
| `VITE_SITE_URL` | Origin HTTPS staging terpisah atau `https://visitigamedia.com` untuk produksi. Tanpa path atau trailing slash. |
| `VITE_SUPABASE_URL` | Origin HTTPS project yang sudah diotorisasi. Pilih project terisolasi untuk staging. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key atau legacy anon JWT. Key yang sama dipakai PHP untuk query publik. |
| `QWORDS_STAGING` | `true` untuk staging, `false` untuk produksi. |
| `QWORDS_ALLOW_OFFLINE` | `false` untuk rilis. `true` hanya untuk fixture lokal staging. |
| `QWORDS_LEGACY_APPS` | Daftar nama folder terverifikasi, dipisahkan koma. Kosong secara default. |
| `VITE_APP_VERSION` | Opsional, identitas revisi untuk observability frontend. |
| `PHP_BINARY` | Opsional, path PHP CLI untuk tes dan packaging bila PHP tidak ada di PATH. |

Contoh PowerShell setelah memuat URL/key Supabase yang sesuai sebagai variabel lingkungan atau melalui `.env.production.local`. Ganti placeholder staging dengan origin nyata.

```powershell
npm ci
npx playwright install chromium
$env:VITE_SITE_URL = 'https://staging.example.test'
$env:QWORDS_STAGING = 'true'
$env:QWORDS_ALLOW_OFFLINE = 'false'
$env:QWORDS_LEGACY_APPS = ''
npm run build:qwords
npm run package:qwords
npm run verify:qwords -- artifacts/qwords-staging.zip
```

Untuk rilis produksi gunakan approval operator dan konfigurasi Supabase produksi yang diotorisasi.

```powershell
$env:VITE_SITE_URL = 'https://visitigamedia.com'
$env:QWORDS_STAGING = 'false'
$env:QWORDS_ALLOW_OFFLINE = 'false'
npm run build:qwords
npm run package:qwords
npm run verify:qwords -- artifacts/qwords-production.zip
```

Di Bash set variabel dengan `export NAMA=nilai`. Lanjutkan setiap perintah hanya jika langkah sebelumnya sukses. Bandingkan checksum ZIP terhadap laporan dari build tepercaya dengan `Get-FileHash -Algorithm SHA256` atau `sha256sum`. Verifikasi internal mencocokkan setiap file terhadap manifest. Hash eksternal memastikan ZIP dan manifest yang diterima berasal dari pekerjaan yang ditinjau.

```text
qwords-staging.zip atau qwords-production.zip
  public_html/
    .htaccess
    _qwords.php
    index.html, 404.html, assets/, id/, en/, admin/, dan media public
  qwords-private/
    build.json
    config.example.php
    runtime.php
    shell.html
  manifest.json
```

Laporan `*.zip.report.json` mencatat SHA-256 arsip, jumlah file dan direktori deploy, estimasi inode, ukuran ZIP, ukuran uncompressed, file terbesar serta tambahan ruang/inode untuk satu salinan rollback setara. Tambahkan ukuran WordPress dan aplikasi riil dari DirectAdmin untuk menghitung kebutuhan aktual. Lihat angka pengujian lokal di [laporan validasi](docs/QWORDS_VALIDATION.md).

## Upload manual di DirectAdmin

1. Selesaikan staging dan persetujuan cutover. Backup sesuai [runbook rollback](docs/QWORDS_ROLLBACK.md). Konfirmasi document root dan path sibling untuk domain yang sedang dikerjakan.
2. Unduh artifact dari build yang ditinjau. Verifikasi ZIP, hash dan mode di `qwords-private/build.json`. Ekstrak ke folder sementara di luar document root atau ekstrak lokal kemudian upload dalam mode yang mempertahankan dotfiles. Aktifkan tampilan hidden files di File Manager.
3. Siapkan `qwords-private` sebagai sibling document root. Salin `config.example.php` menjadi `config.php` di folder itu. Isi `site_url`, `supabase_url`, `supabase_publishable_key`, `staging` sesuai build. Isi `deepl_auth_key` hanya bila terjemahan diaktifkan. Konfigurasi nyata, ZIP, manifest dan laporan tinggal di luar web root. Atur izin dan jalankan staging preflight.
4. Untuk shared root, pertahankan direktori aplikasi terverifikasi, ACL/rules nested dan ACME sesuai inventaris. Pindahkan sisa root WordPress dan folder backup ke lokasi private yang disetujui. Pastikan file lama yang bertabrakan dengan nama assets, `.htaccess` lama, PHP handler atau rewrite tingkat vhost diselesaikan sesuai runbook. Jika isolasi membutuhkan akses panel/support yang belum ada, hentikan cutover.
5. Tempatkan pasangan `public_html` + `qwords-private` dari revisi yang sama melalui swap yang disetujui atau maintenance window. Periksa bahwa `.htaccess` aktif, validasi staging/produksi, bersihkan cache HTML/OPcache dengan panel bila dibutuhkan, dan catat revisi serta checksum. Bila ada regresi, jalankan rollback. DNS, MX, SPF, DKIM, DMARC dan email punya prosedur perubahan tersendiri.

## SEO dan refresh CMS

PHP mengambil detail berita/portfolio dan sitemap dari Supabase dengan hak anon pada setiap request. Respons detail 200, canonical/alias 301, missing/unpublished 404 dan kegagalan upstream 503. Cache dinamis dan API memakai `no-store` dan bypass LiteSpeed. Tidak ada disk cache. Halaman statis id/en memakai snapshot HTML yang divalidasi saat build, dengan canonical, hreflang, JSON-LD, OG, Twitter dan markup semantik. Daftar berita/portfolio, homepage dan CMS statis bisa tertinggal hingga artifact diterbitkan. Jika terjadi penghapusan sensitif, segera refresh/promosikan artifact dan bersihkan cache HTML di hosting/CDN yang disetujui. Lihat [validasi SEO](docs/QWORDS_VALIDATION.md).

`build-qwords.yml` menyediakan dispatch manual dan dapat dipanggil dari CI eksternal setelah batch edit CMS. Jalankan hanya rebuild artifact, misalnya `gh workflow run build-qwords.yml -f mode=staging -f site_url=https://STAGING_ORIGIN` dari pipeline yang diotorisasi. Tinjau snapshot tanpa JavaScript dan diff hash manifest untuk halaman yang diedit, uji sitemap/status, lalu minta reviewer untuk artifact produksi. Playwright berjalan di runner, jadi file HTML diperbarui oleh build tanpa edit manual. Artifact produksi diunduh dan dipromosikan manual dengan prosedur di atas.

Siapkan environment GitHub terpisah `qwords-staging` dan `qwords-production`. Set variable environment `VITE_SUPABASE_URL` dan secret environment `VITE_SUPABASE_PUBLISHABLE_KEY` untuk masing-masing. Opsional variable `QWORDS_LEGACY_APPS`. Batasi environment produksi ke `main`, aktifkan required reviewers dan prevent self-review bila tersedia, dan simpan marker `QWORDS_PRODUCTION_APPROVAL_GATE` hanya sebagai **environment secret** setelah proteksi diperiksa. Marker memblokir environment kosong dan tidak membuktikan bahwa proteksi GitHub sudah benar. Dispatch produksi harus dari `main` dengan input `BUILD PRODUCTION`, lalu menunggu approval environment. Jika paket GitHub tidak mendukung proteksi reviewer, biarkan marker kosong dan lakukan build lokal melalui operator yang berwenang. Workflow hanya mengunggah artifact ke Actions.

Cloudflare tetap tersedia lewat workflow manual terpisah. Default `deploy=false` menghasilkan artifact, dan deployment opsional di workflow Cloudflare memerlukan dispatch eksplisit serta environment yang sesuai.

## Backend yang sudah ada

Gunakan project Supabase yang sama ketika kepemilikan dan akses masih sesuai. Build memvalidasi tabel publik dan menggunakan snapshot yang diambil dengan key anon. Prosedur read-only, checklist Auth/RLS dan opsi pemindahan project ada di [runbook validasi](docs/QWORDS_VALIDATION.md). Simpan key DeepL di private config. Endpoint terjemahan memverifikasi JWT via Supabase Auth dan memakai `app_metadata.role=admin`.

Rujukan [Qwords DirectAdmin](https://kb.qwords.com/category/directadmin/tutorial-awal-menggunakan-hosting-dengan-panel-direct-admin/), [Apache .htaccess](https://httpd.apache.org/docs/2.4/rewrite/htaccess.html), [LiteSpeed rewrite](https://docs.litespeedtech.com/lsws/cp/cpanel/switch-apache/), dan [Proteksi GitHub Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
