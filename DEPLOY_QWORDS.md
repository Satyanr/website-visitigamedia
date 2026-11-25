# Deploy Visitiga ke Qwords Cloud Hosting SOHO

Target produksi `https://visitigamedia.com`. React/Vite dirakit di mesin build atau runner. Qwords menjalankan PHP + database MySQL/MariaDB dedicated. Backend dan semua data disimpan pada akun Qwords. Cloudflare dan Supabase lama merupakan referensi historis di commit `b48a833`; workflow deployment lama tidak aktif.

## Checklist DirectAdmin

1. Buat document root HTTPS staging terpisah. Backup WordPress, database WordPress, nested rules dan inventaris aplikasi sebelum cutover. Pantau saldo disk dan inode. Observasi lama menyisakan sekitar 8.722 inode, sehingga ukur ulang dan beri ruang untuk ekstraksi, backup dan rollback.
2. Buat database dan user website khusus via MySQL Management. Import initial schema dan update melalui phpMyAdmin. Pilih PHP 8.4 untuk domain, cek ekstensi dan batas. PHP 7.4 harus dinaikkan sebelum paket digunakan. [Setup database dan ekstensi](docs/MYSQL_DATABASE_SETUP.md)
3. Buat sibling `qwords-private` dan `visitiga-data` di luar semua document root. Buat konfigurasi privat dan folder sessions/media/documents. Provision admin dari SQL hash sekali pakai. [Admin](docs/ADMIN_SETUP.md) · [Storage](docs/LOCAL_MEDIA_STORAGE.md)
4. Pindahkan konten/data dengan prosedur yang diotorisasi. Bangun artifact staging dan verifikasi hash. Ekstrak di lokasi privat sementara atau lokal, upload `public_html/` dan `qwords-private/` sebagai folder sibling. Aktifkan hidden files di File Manager. Simpan ZIP, manifest, config dan backup di luar web root. [Migrasi data](docs/SUPABASE_DATA_MIGRATION.md)
5. Cek aturan rewrite/headers, PHP, DB, TLS, sesi dan media di staging. Konfirmasi Apache/LiteSpeed `AllowOverride FileInfo Options`, rewrite inheritance, ACME, compression, dan izin `open_basedir` membaca sibling. Atur HTTPS melalui panel sesuai konfigurasi provider dan aktifkan HSTS setelah verifikasi. [Preflight](docs/QWORDS_PREFLIGHT.md) · [Validasi](docs/QWORDS_VALIDATION.md)
6. Periksa `beta,brochure,info,lms,smart-classroom,uai` dengan pemilik dan isi allowlist hanya untuk folder yang terverifikasi. Jangan gunakan shared document root jika child rules atau vhost menyimpang. Pilih dedicated docroot dengan provider saat cutover disetujui. Karantina backup dan WordPress lama secara privat, pertahankan pemulihan. [Migrasi WordPress](docs/WORDPRESS_MIGRATION.md)
7. Setelah staging, backup DB serta pasangan private/public dan data, build produksi, verifikasi, dan promosikan dalam maintenance window. Uji route, SEO, login, upload dan aplikasi yang dipertahankan. Rollback jika terjadi regresi. [Rollback](docs/QWORDS_ROLLBACK.md)

## Build dan release

Set `VITE_SITE_URL`, `QWORDS_STAGING` dan, bila ada, `QWORDS_LEGACY_APPS` (koma). Siapkan `QWORDS_CONTENT_EXPORT` berisi path JSON publik yang dibuat via CLI `php server/qwords/tools/content-export.php PRIVATE_CONFIG`, atau `QWORDS_CONTENT_API` dan secret `QWORDS_EXPORT_KEY` untuk HTTP ekspor HTTPS. Masukkan DB config hanya di PHP privat. Database credentials tidak diperlukan oleh Vite.

```powershell
npm ci
npx playwright install chromium
$env:VITE_SITE_URL='https://STAGING_ORIGIN'
$env:QWORDS_STAGING='true'
$env:QWORDS_ALLOW_OFFLINE='false'
$env:QWORDS_CONTENT_EXPORT='PATH_KE_SNAPSHOT_PUBLIK.json'
npm run build:qwords
npm run package:qwords
npm run verify:qwords -- artifacts/qwords-staging.zip
```

Untuk produksi pilih snapshot yang diotorisasi dan ganti `VITE_SITE_URL=https://visitigamedia.com` serta `QWORDS_STAGING=false`. Jalankan perintah yang sama dengan `artifacts/qwords-production.zip`. Offline hanya untuk staging fixture. Tidak ada deployment otomatis. Verifikasi checksum eksternal dari `*.zip.report.json` dengan `Get-FileHash` atau `sha256sum`. ZIP memuat dua deployment directories dan manifest. SQL/tools berada dalam private folder. Data, upload, log, tes, konfigurasi nyata dan dump tidak masuk ZIP.

GitHub Actions memakai dispatch staging/production, service MariaDB terisolasi, dan hanya upload artifact. Isi environment `qwords-staging` atau `qwords-production` dengan variable `QWORDS_CONTENT_API`, secret `QWORDS_EXPORT_KEY` dan opsional variable `QWORDS_LEGACY_APPS`. Untuk produksi gunakan `main`, input `BUILD PRODUCTION`, required reviewers dan marker environment secret `QWORDS_PRODUCTION_APPROVAL_GATE` setelah proteksi diverifikasi. Build lokal dengan approval operator adalah alternatif lengkap.

## Refresh dan perawatan

Ekspor konten publik setelah batch update CMS, rebuild eksternal, bandingkan checksum HTML id/en dan promosikan artifact melalui prosedur manual. Runtime menyajikan detail/sitemap langsung dari DB. Snapshot listing dan halaman statis berubah saat artifact baru dipromosikan. Simpan data stabil di luar release. Jadwalkan private CLI `maintenance.php` melalui DirectAdmin Cron jika tersedia, misalnya sekali sehari dengan PHP absolut sesuai versi. Aplikasi juga membersihkan batch saat observability dibuka oleh admin. Set rotasi log di panel dan periksa kuota. Playwright/Node tidak berjalan pada hosting.

[Rujukan Qwords DirectAdmin](https://kb.qwords.com/category/directadmin/tutorial-awal-menggunakan-hosting-dengan-panel-direct-admin/) · [PDO MySQL](https://www.php.net/manual/en/ref.pdo-mysql.php) · [Transaksi InnoDB](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/for-update).
