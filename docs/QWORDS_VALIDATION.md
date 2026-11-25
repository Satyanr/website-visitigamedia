# Validasi Qwords

Tanggal: 23 November 2026 (WIB). Pengujian seluruhnya lokal. Runtime tersedia:
Node 24.20.0, PHP CLI/mod_php 8.2.12, Apache 2.4.58 XAMPP, Chromium Playwright.
Versi ini mencatat mesin pengujian, bukan rekomendasi patch version hosting.

| Pemeriksaan | Hasil | Cakupan / batas bukti |
| --- | --- | --- |
| `npm ci` | PASS | Instalasi lockfile; percobaan sandbox awal gagal jaringan, berhasil setelah akses dependency diizinkan |
| `npm run lint` | PASS | Source TypeScript dan konfigurasi sesuai ESLint existing |
| `npm run typecheck` | PASS | `tsconfig.app.json` |
| `npm test -- --maxWorkers=2 --minWorkers=1` | PASS, 91 test / 26 file | Termasuk 3 regression baru locale/noindex |
| `php -l` | PASS | Runtime, entry, config example dan PHP harness |
| `npm run test:qwords` | PASS, 58 pemeriksaan | Dispatcher PHP, guard/header/CSP hash dan Apache/PHP integration; 0 fail, 0 skipped |
| `npm run build` | PASS | Target Cloudflare existing; 34 public HTML id/en + 404; fallback konten bawaan, tanpa kredensial production |
| `npm run build:qwords` | PASS (offline staging) | 34 public HTML id/en + 404; origin dan Supabase key dummy; belum build online production |
| `npm run package:qwords` | PASS | Public/private package, secret scan dan SHA-256 manifest; tanpa config.php, source, migration, node_modules atau .git |
| ZIP upload package | PASS | `artifacts/qwords-staging-offline.zip`, sekitar 48,55 MB; `.htaccess` ada, hash CSP final sesuai, config.php/secret/source/migration tidak dikemas |
| `npx playwright test --config playwright.qwords.config.ts` | PASS, 4 test | Chromium/PHP lokal; 34 public route id/en, direct admin refresh, dynamic SEO, sitemap, 404, mobile, locale/navigation dan contact RPC mock |
| `npm run budget` | PASS, 4 budget | Cloudflare output: JS 122.5/125 KiB, CSS 19.6/22 KiB, mobile hero 43.4/60 KiB, initial transfer 185.6/220 KiB |
| `BUILD_OUTPUT_DIR=dist-qwords npm run budget` | PASS, 4 budget | Qwords offline build: JS 122.5/125 KiB, CSS 19.6/22 KiB, mobile hero 43.4/60 KiB, initial transfer 185.6/220 KiB |
| LiteSpeed/DirectAdmin/Qwords staging | BELUM DIJALANKAN | Tidak ada akses hosting atau perubahan hosting |
| Supabase/Auth/Storage/RLS/CRUD nyata | BELUM DIJALANKAN | Tidak tersedia konfigurasi project yang diotorisasi; mock tidak membuktikan RLS atau permission production |
| DeepL nyata | BELUM DIJALANKAN | Tidak membuat/mengisi secret atau request berbayar |
| CWV/Lighthouse comparison hosting | BELUM DIJALANKAN | Asset budget bukan bukti CWV/TTFB production; perlu baseline yang sama dan pengukuran staging |
| GitHub workflow remote | BELUM DIJALANKAN | File workflow manual tersedia; tidak di-push, tidak menghubungkan kembali repository |

## Validasi penyesuaian struktur source

Backend berada di `server/qwords`; workflow memakai `build-qwords.yml` dan
`deploy-cloudflare.yml`. Referensi packaging, ignore, test harness dan dokumentasi
telah disesuaikan. Pemeriksaan sintaks YAML lokal memastikan kedua workflow hanya
manual, Qwords tidak memiliki job deploy, dan deploy Cloudflare default false
serta bergantung pada build dan environment production. Tidak mengeksekusi workflow
di GitHub. Regresi PHP/Apache setelah perpindahan: **58 lulus, 0 gagal, 0 skipped**,
termasuk penolakan akses publik ke source `server/qwords/runtime.php`.
Di Windows, pembuatan ZIP dan E2E harus dijalankan berurutan: Compress-Archive
dapat mengunci file HTML sementara. Percobaan bersamaan sempat menghasilkan 503
file read unavailable pada satu route; pengulangan setelah kompresi selesai
berhasil: **4 E2E lulus, 0 gagal**. Packaging dan ZIP juga telah diperbarui untuk
struktur source ini; lint/typecheck serta sintaks ketiga file PHP backend lulus.

## Apa yang dibuktikan regression test

- Status 200 untuk static id/en dan shell deep-link admin; canonical slash dan
  redirect WordPress contoh test/alias portfolio 301; locale/slug invalid 404.
- Dynamic route mengalahkan file stale yang benar-benar ada pada filesystem
  Apache; sitemap lama juga tidak menutup handler live.
- Missing, unpublished dan deleted news 404; deleted record hilang dari sitemap.
  Edit konten muncul pada request berikutnya dengan metadata locale yang benar.
- Canonical, hreflang id/en/x-default, Article/CreativeWork/BreadcrumbList,
  OG image yang aman, escaping HTML/JSON, dan pencegahan traversal.
- Supabase unavailable menghasilkan 503 tanpa detail exception, no-store dan
  Retry-After; static prerender tetap tersedia. Sitemap tidak diam-diam stale.
- Anonim, user non-admin dengan `user_metadata.role=admin`, token expired dan
  method selain POST ditolak. Header JWT diteruskan lewat Apache ke PHP dan ke
  mock Supabase Auth; role hanya dipercaya dari verifikasi server.
- Batas payload/text/node, batching DeepL, protected fields, provider failure,
  config/origin mismatch, public-key-only dan pemeriksaan exposure server secret.
- CSP/nosniff/frame protection, gzip nyata Apache, immutable hashed assets,
  no-store dynamic, file sensitif 403, serta private config missing 503.
- Hash CSP dihitung dari script final sesudah Vite memformatnya. Chromium E2E
  memakai CSP artifact dan origin canonical yang diproksikan ke loopback lokal;
  seluruh tes selesai tanpa page error atau pelanggaran CSP.
- Staging noindex bertahan setelah React hydration; header HSTS tidak diterbitkan
  pada HTTP walaupun request mengirim X-Forwarded-Proto palsu.

## Perbaikan yang muncul selama validasi

Prerender awal existing gagal tanpa CMS karena bootstrap dibersihkan sebelum
halaman lazy siap. Mode Playwright kini mempertahankan dataset dan memakai default
konten existing untuk build offline. Build online juga membekukan data publik dan
menahan request analytics/observations browser selama snapshot, sehingga build
tidak menulis data uji ke Supabase. Contact/careers dibaca sebelum snapshot agar
rebuild benar-benar memperbarui HTML, bukan hanya heading awal.

Integration test Apache mengungkap bahwa header Authorization tidak selalu berada
pada `HTTP_AUTHORIZATION`; pembaca kini menangani REDIRECT dan getallheaders juga.
Tes yang sempat gagal sudah diperbaiki dan dijalankan ulang; hasil final pada tabel
tidak menyamakan startup failure dengan test pass.

Warning existing React `fetchPriority` pada jsdom, Browserslist lama, dan peringatan
mixed import Vite tetap muncul; tidak menyebabkan assertion/build gagal. Tidak
melakukan upgrade dependency atau mengubah UI untuk menghilangkan warning tersebut.

## Gate sebelum produksi

Artifact lokal memakai `qwords-test.supabase.co` dan key dummy. Tidak layak dipakai
sebagai produksi atau bukti konektivitas backend. Build ulang online dengan public
Supabase config dan origin yang benar, buat private config terpisah, lalu jalankan
seluruh checklist staging di DEPLOY_QWORDS.md. Konfirmasi extensions, open_basedir,
outbound TLS, Authorization forwarding, rewrite/mod_headers/LSCache, SSL/HSTS,
Auth allowed URLs, RLS/storage permissions, upload limit, cron/backup dan rollback.

SEO live hanya untuk detail news/portfolio dan sitemap. HTML crawler halaman CMS
lain masih memerlukan rebuild + penggantian release. Belum ada scheduler rebuild
otomatis atau deployment otomatis yang diaktifkan. Tidak ada penghapusan WordPress,
perubahan DNS/email, schema atau data production, maupun deployment Cloudflare.
