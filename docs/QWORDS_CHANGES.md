# Daftar perubahan Qwords

Audit/implementasi lokal: 23 November 2026. Tidak ada push atau deployment.

## File existing yang diubah

| File | Alasan / konsekuensi |
| --- | --- |
| `package.json` | Menambahkan build/package/test Qwords; perintah Cloudflare tetap |
| `.gitignore` | Abaikan output Qwords, artifact, tool test dan config server lokal |
| `eslint.config.js` | Abaikan direktori hasil build/artifact/cache test |
| `vitest.config.ts` | Pisahkan Node/PHP integration tests dari Vitest React |
| `scripts/prerender.mjs` | Header apikey baru, timeout REST, output terpisah, strict online CMS, validasi slug, dataset build frozen, offline defaults, tunggu konten effect-driven dan mode noindex |
| `scripts/check-performance-budget.mjs` | Output dapat dipilih lewat `BUILD_OUTPUT_DIR`; budget tidak dinaikkan |
| `src/main.tsx` | Jangan membersihkan bootstrap Playwright sebelum lazy route siap; lifecycle browser normal tetap |
| `src/hooks/usePageMeta.ts` | Build staging mempertahankan noindex setelah hydration |
| `src/pages/PortfolioDetailPage.tsx` | Metadata memakai locale sebelum disiapkan; menghindari mutasi record/shared related rows, tanpa perubahan markup/style |
| `src/test/portfolio-detail.test.tsx` | Regression metadata locale dan record tidak dimutasi |

## File baru

| File | Tujuan |
| --- | --- |
| `server/qwords/.htaccess` | Routing sebelum static detail, deny rules (termasuk source server), CSP, cache dan kompresi |
| `server/qwords/entry.php` | Bootstrap public minimal dengan path private tetap |
| `server/qwords/runtime.php` | Dispatcher, Supabase REST/Auth, localized SEO, sitemap, robots, API DeepL; tidak bergantung Node/Composer |
| `server/qwords/config.example.php` | Template konfigurasi server kosong; config nyata dibuat di luar web root |
| `scripts/build-qwords.mjs` | Orkestrasi build/prerender; staging default; produksi menolak offline |
| `scripts/package-qwords.mjs` | Paket public/private dari allowlist output; hilangkan snapshot detail dan file khusus Cloudflare; hash CSP dari script final |
| `scripts/qwords-lib.mjs` | Guard public key/environment, secret scan, manifest SHA-256, penolakan symlink |
| `scripts/supabase-headers.mjs` | Header build yang membedakan publishable dan legacy anon JWT |
| `scripts/prerender-defaults.mjs` | Memakai kembali konten default TypeScript existing untuk smoke build tanpa CMS |
| `.github/workflows/build-qwords.yml` | Workflow manual menghasilkan ZIP staging, tanpa deploy credentials atau deploy job |
| `.github/workflows/deploy-cloudflare.yml` | Workflow manual build Cloudflare; deployment hanya dengan input eksplisit deploy=true dan environment production |
| `playwright.qwords.config.ts` | Browser test target PHP lokal; tidak dipakai produksi |
| `tests/qwords-e2e/public.e2e.ts` | Direct refresh 34 public routes, admin, SEO, locale/mobile, form RPC mock |
| `tests/qwords/apache.test.mjs` | Apache sebenarnya: rewrite, cache, gzip, protected files, JWT forwarding, bootstrap private |
| `tests/qwords/runtime.test.mjs` | Runner Node/PHP dan guard artifact/header |
| `tests/qwords/runtime-check.php` | Regression dispatcher dengan upstream mock, termasuk failure/security cases |
| `tests/qwords/browser-router.php` | Router PHP khusus browser test offline; tidak ikut artifact |
| `tests/qwords/browser-data.json` | Record berita/portfolio dummy untuk browser test |
| `src/test/staging-meta.test.tsx` | noindex hydration staging dan indexing produksi |
| `DEPLOY_QWORDS.md` | Audit, requirements, variabel, packaging, manual deployment, refresh dan rollback |
| `docs/QWORDS_VALIDATION.md` | Hasil pemeriksaan aktual dan yang masih perlu staging |
| `docs/QWORDS_CHANGES.md` | Daftar file ini |

## Tetap dipertahankan

`vite.config.ts`, `src/App.tsx`, `src/lib/supabase.ts`, `src/lib/translation.ts`,
`src/lib/seo.ts`, seluruh Pages Functions, konfigurasi/header/redirect Cloudflare,
semua SQL migration, CSS/animasi/assets, public/admin modules, Auth, Storage,
RPC contact/comments/careers dan analytics. SDK Supabase existing memang sudah
menjaga user JWT ketika menghapus fallback Bearer publishable key; tidak diganti.

Tidak menambahkan dependency npm. `node_modules`, `dist`, `dist-qwords`,
`.qwords-test`, `test-results` dan `artifacts` merupakan output lokal yang
diabaikan, bukan source yang diunggah. Artifact yang dibuat dalam sesi ini
berlabel offline staging dan memakai endpoint/key dummy; bukan release produksi.

Lokasi backend kini mengikuti struktur yang diminta: `server/qwords`. Packaging,
PHP test harness, Apache/browser tests, ignore rule dan dokumentasi memakai path
tersebut. Workflow Qwords menggunakan nama `build-qwords.yml`. Struktur paket
hosting tetap public_html + qwords-private, sehingga source backend tetap di luar
document root setelah upload.
