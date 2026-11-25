# Validasi migrasi PHP/MySQL

Pengujian lokal 25 November 2026 (WIB). MariaDB 10.4.32 berjalan pada loopback dengan direktori database baru di workspace. Apache dan PHP lokal memakai fixture. Data uji yang berasal dari repo hanya baseline recovery.

| Pemeriksaan | Hasil | Bukti |
| --- | --- | --- |
| npm ci, ESLint, TypeScript, Vitest | PASS | 85 tes Vitest pada 24 file. |
| PHP lint, runtime PHP 8.2 dan Apache Windows | PASS | 63 pemeriksaan Qwords dengan MariaDB aktif, termasuk ACME, legacy rewrite, WordPress 301/410, CSP/cache dan error HTTP. |
| PHP 8.4.28 CLI + MariaDB | PASS | 55 pemeriksaan runtime dan integrasi pada binary resmi yang diverifikasi SHA-256. [PHP 8.4 Windows](https://www.php.net/downloads.php?os=windows&version=8.4). |
| MariaDB 10.4.32 asli | PASS | PDO, login/logout, expiry/CSRF, disabled role, CMS CRUD, slug alias, relasi, draft/publish, komentar, leads/Careers, agregasi, upload publik/privat, Range, MIME, reference check, XSS dan DB outage. |
| Migrasi seed dan media | PASS | Dry-run rollback, apply, apply ulang identik. Seed berisi 49 portfolio, 5 berita, 6 card produk, 6 landing layanan dan singleton CMS. Fixture media menolak checksum salah, verifikasi checksum benar, rewrite URL lokal dan maintenance. |
| Chromium Qwords | PASS | 4 E2E termasuk 34 halaman id/en, mobile, hydration, deep links admin dan form dengan fixture same-origin. Auth, mutasi, akses privat dan upload diuji terpisah dalam HTTP integration MariaDB. |
| Build dan refresh SEO | PASS | Build offline staging dan build dari snapshot ekspor MariaDB. Perubahan hero fixture muncul di H1 id/en dan mengubah checksum. Simulasi mode produksi memakai fixture terisolasi dan mempertahankan admin noindex. |
| Package, ZIP integrity dan budget | PASS | Laporan checksum dan inode tersedia. 122,5/125 KiB JS, 19,6/22 KiB CSS, 43,4/60 KiB hero, dan 215,8/220 KiB total aset yang diukur. |
| Audit npm runtime | PASS | 0 advisori. |
| Audit npm semua dependency | FAIL | 44 advisori development/tooling (4 low, 10 moderate, 27 high, 3 critical). |
| Linux Actions, PHP 8.3 baru, Oracle MySQL | SKIPPED | Integrasi lokal memakai Windows dan MariaDB. Workflow menyiapkan matrix PHP, Apache Linux dan MariaDB 10.11. Tidak ada workflow remote dijalankan. |
| Live Qwords/DirectAdmin/LiteSpeed serta data asli | REQUIRES LIVE STAGING | Versi PHP/DB dan ekstensi host, sertifikat, app legacy, inventaris migrasi authorized, media/limit upload, E2E admin hosted dan CWV/TTFB masih perlu diperiksa. Tidak ada build/unggahan produksi dengan data asli. |

## ZIP staging fixture

`artifacts/qwords-staging.zip` sekitar 48 MiB, berisi 448 file deployment dan 51 direktori. Estimasi 499 inode dan sekitar 49,9 MiB uncompressed. Manifest menambah satu file pada arsip. Satu salinan rollback code setara memerlukan sekitar 499 inode dan 49,9 MiB sebelum menghitung database, media dan WordPress. Laporan `artifacts/qwords-staging.zip.report.json` memuat ukuran byte, file terbesar dan SHA-256. Paket memakai fixture staging offline.

## Staging sebelum cutover

1. Pilih PHP 8.4 untuk domain dan jalankan probe. Konfirmasi ekstensi, MySQL/MariaDB vendor, skema versi 2, TLS, akses private folder, `open_basedir`, FastCGI dan kebutuhan `AllowOverride`. Uji LiteSpeed redirect/cache, HSTS setelah Force HTTPS, CSP dan gzip/Brotli.
2. Dengan database staging terisolasi, periksa admin login/logout, idle/absolut expiry, disabled role, CSRF, session fixation, update password dan read-after-write. Lakukan edit kedua bahasa, draft/publish/delete, upload image/PDF/video, komentar, leads, Careers, dashboard dan observability.
3. Bandingkan inventory data/media asli dengan data hasil import. Uji dry-run FK/checksum dan QA manual untuk media yang hilang. Verifikasi private downloads dan hilangnya sumber data eksternal pada browser/network.
4. Uji canonical, hreflang, Open Graph/Twitter, JSON-LD, sitemap dan status 200/301/404/410/503 setelah CMS berubah. Uji staging noindex, admin noindex dan konfigurasi produksi indexable. Rebuild artifact dari snapshot publik untuk halaman statis. Bandingkan CWV/TTFB dengan profil yang sama di staging. Budget aset lokal hanya mengukur bundle, CSS, hero dan logo terkait.
5. Uji legacy allowlist, WordPress redirects, backup karantina, ACME dan rollback pasangan public/private serta DB/media. Verifikasi staging tidak memengaruhi subdomain, database lain atau email.
