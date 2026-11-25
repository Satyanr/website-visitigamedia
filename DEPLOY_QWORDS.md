# Deployment Qwords SOHO — Visitiga Media

Status: target **terpisah**, belum dideploy. Tidak ada perubahan DNS, WordPress,
email, project Supabase, schema, ataupun Cloudflare production. Node hanya untuk
build lokal/CI. Hosting melayani static assets + HTML prerender + PHP 8.2+.

## Hasil audit arsitektur

| Bagian | Existing | Adaptasi minimum |
| --- | --- | --- |
| React/Vite/TypeScript, lazy routes, animasi, CSS, media | Browser SPA + Playwright prerender | Tetap; tidak mengubah komponen visual/public/admin |
| `functions/[locale]/news/[slug].js`, portfolio detail | `env.ASSETS`, Pages Functions + Supabase REST | Dispatcher PHP, public key dengan RLS, bootstrap data yang sama |
| `functions/sitemap.xml.js` | Sitemap dinamis; daftar route berbeda dari generator build | Sitemap PHP memakai `STATIC_ROUTES` yang sama, pagination REST |
| `functions/api/translate-content.js` | Supabase Auth + DeepL | Endpoint PHP dengan kontrak sama dan verifikasi admin di server |
| `public/_redirects`, `_routes.json` | Aturan khusus Cloudflare | `.htaccess` + dispatcher PHP; file Cloudflare tidak ikut paket |
| `public/_headers` | Header khusus Pages | CSP/security/cache/compression Apache, HSTS opt-in di PHP |
| `scripts/prerender.mjs` | Bearer berisi `sb_publishable_` | `apikey` saja untuk key baru; JWT legacy anon tetap didukung |
| Lifecycle prerender | Bootstrap dibersihkan sebelum lazy page siap | Mode Playwright mempertahankan dataset; build offline memakai default existing |
| SEO portfolio locale | Record dimutasi sesudah metadata disiapkan | Locale diterapkan sebelum metadata, tanpa mutasi record |
| Supabase Auth/RLS/Storage/CMS/RPC | Browser memakai public key dan JWT sesi | Tetap. Tidak membutuhkan service role atau MySQL |
| GitHub Actions | Folder sudah dihapus pada pembersihan sebelum audit | Dua workflow manual: build artifact Qwords dan build/deploy Cloudflare dengan deploy opt-in |

`npm run build`, `deploy:cloudflare`, `wrangler.jsonc`, `public/_headers`, dan
seluruh Pages Functions tetap tersedia. Workflow Cloudflare disiapkan kembali
sebagai opsi manual; deploy default mati. Folder ini tidak diinisialisasi Git.

## Struktur source

```text
website-visitigamedia/
  src/                         React + CMS
  public/                      Aset website
  functions/                   Cloudflare Pages Functions existing
  server/qwords/               Backend/config template PHP dan .htaccess Qwords
  scripts/                     Prerender, build dan packaging
  supabase/                    Migration yang tidak diunggah ke web root
  .github/workflows/
    deploy-cloudflare.yml       Manual; deploy hanya jika input deploy=true
    build-qwords.yml            Manual; artifact staging tanpa deploy
  DEPLOY_QWORDS.md
  package.json
  vite.config.ts
```

`server/qwords` adalah lokasi source; saat packaging PHP dipisah menjadi
`qwords-private` di luar document root dan entry public minimal. Jangan mengunggah
folder source `server` langsung ke `public_html`.

## Konfirmasi kemampuan hosting terlebih dahulu

Konfirmasi ke Qwords untuk akun SOHO yang sebenarnya; menu Setup Node.js App
**bukan** bukti bahwa akses SSH/cron/semua module tersedia:

- PHP **8.2+** dengan `curl`, `openssl`, `mbstring`, `dom`, `json`, `libxml`.
  Tidak membutuhkan Composer, MySQL, Node persistent, atau root access.
- Apache 2.4 atau LiteSpeed yang mendukung per-directory mod_rewrite, flag END,
  mod_headers, DirectoryIndex dan `AllowOverride FileInfo Options Indexes`.
  `.htaccess` wajib aktif. mod_deflate opsional, tetapi kompresi harus diverifikasi.
- PHP dapat membaca direktori private di luar document root (`open_basedir`
  mengizinkan sibling `qwords-private`). HTTPS outbound port 443 ke project
  Supabase dan `api.deepl.com` / `api-free.deepl.com`; CA bundle valid.
- Authorization diteruskan ke PHP/FastCGI. Contoh rule sudah disertakan;
  konfigurasi server tertentu tetap perlu bantuan support.
- Batas waktu PHP setidaknya 75 detik untuk batch terjemahan besar; memory 128 MB
  atau lebih. REST request timeout 12 detik, connect timeout 3 detik; deadline
  batch 45 detik diperiksa sebelum tiap batch (satu request terakhir bisa selesai
  hingga 12 detik setelah deadline). Maksimal respons upstream 8 MB.
- Akses File Manager/SFTP/FTP yang dapat mengunggah hidden `.htaccess`, membuat
  sibling private, mengatur permission, backup dan mengganti direktori release.
  SSH, symlink, ZIP extraction, cron dan atomic swap **perlu dikonfirmasi**.
- LiteSpeed/LSCache/CDN tidak meng-cache respons PHP dinamis atau API. Paket
  menonaktifkan CacheLookup dan mengirim `no-store`/`X-LiteSpeed-Cache-Control`.
  Cache plugin/setting tingkat akun juga harus diperiksa.
- Staging menggunakan subdomain yang **sudah disiapkan** dengan HTTPS dan
  document root terisolasi. Jangan menaruh artifact di WordPress aktif.

Jika PHP tidak berjalan atau rewrite diabaikan, **jangan upload konfigurasi
private dan jangan cutover**. Ketiadaan rewrite harus dianggap gagal validasi.

## Konfigurasi build (public, disematkan ke browser)

| Variabel | Keterangan |
| --- | --- |
| `VITE_SITE_URL` | Origin HTTPS final target, tanpa path/trailing slash; wajib eksplisit |
| `VITE_SUPABASE_URL` | Origin HTTPS project Supabase yang disetujui |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public `sb_publishable_...` atau JWT **anon** lama; bukan secret/service role |
| `VITE_APP_VERSION` | Opsional, label release observability |
| `QWORDS_STAGING` | Default `true`; `false` hanya untuk build produksi setelah validasi staging |
| `QWORDS_ALLOW_OFFLINE` | Default false; `true` hanya untuk smoke test staging tanpa REST, tidak layak produksi |
| `VITE_NOINDEX` | Diatur otomatis oleh target Qwords agar sesuai mode staging |

Build membaca `.env.production` / `.env.production.local` dan environment shell.
Jangan menggunakan `VITE_DEEPL_AUTH_KEY`, `VITE_*SECRET*`, `VITE_*SERVICE_ROLE*`,
atau secret dalam source. Guard menolak variabel tersebut dan privileged key.
Publishable key memang public; proteksi data bergantung pada RLS dan Auth.
JWT sesi pengguna tetap diteruskan oleh browser; perbaikan header tidak menghapusnya.

Contoh PowerShell (ganti placeholder sendiri; jangan memasukkan server secret):

```powershell
$env:VITE_SITE_URL = 'https://STAGING-DOMAIN-ANDA'
$env:VITE_SUPABASE_URL = 'https://PROJECT-ANDA.supabase.co'
$env:VITE_SUPABASE_PUBLISHABLE_KEY = 'PUBLIC-KEY-ANDA'
$env:QWORDS_STAGING = 'true'
npm ci
npx playwright install chromium
npm run lint
npm run typecheck
npm test
npm run test:qwords
npm run build:qwords
npm run package:qwords
Compress-Archive -LiteralPath artifacts/qwords -DestinationPath artifacts/qwords-staging.zip -Force
```

Pada Linux: `export NAMA=value`, lalu command npm sama; archive dengan
`cd artifacts && zip -r qwords-staging.zip qwords`. Node 22+ dan Playwright Chromium
diperlukan **hanya di mesin build**. Tidak memakai Vite dev/preview server di hosting.
Untuk produksi, ulang build dengan origin produksi dan `QWORDS_STAGING=false`.
Build produksi menolak mode offline dan gagal jika pembacaan CMS prerender gagal.

`build:qwords` menghasilkan `dist-qwords/` terpisah dari `dist/` Cloudflare.
Upload **hanya** paket `artifacts/qwords/`, bukan `dist-qwords` mentah. Packaging
menghapus file khusus Cloudflare dan snapshot detail berita/portfolio, memindahkan
shell/config build ke private, serta memindai secret dan membuat SHA-256 manifest.
Paket tidak menyertakan node_modules, source development, Git, migration SQL,
`.env`, source map, maupun konfigurasi rahasia. `config.php` tidak pernah dikemas.

## Konfigurasi PHP private

Struktur DirectAdmin contoh, sesuaikan document root aktual dengan panel:

```text
/home/USER/domains/staging.example.com/
  public_html/                 <- isi artifacts/qwords/public_html
    .htaccess
    _qwords.php
    assets/
    id/.../index.html
    en/.../index.html
    admin/index.html
    404.html
  qwords-private/              <- isi artifacts/qwords/qwords-private
    runtime.php
    shell.html
    build.json
    config.example.php
    config.php                <- buat manual, di luar web root
```

Jika subdomain berbagi document root induk, gunakan document root terpisah atau
struktur sibling yang disetujui hosting. Jangan menempatkan private di folder
yang dapat diakses lewat domain lain. Periksa juga alias `private_html`/HTTPS.
Entry memakai path sibling tetap; jangan menambahkan pilihan path dari URL.

Salin `config.example.php` menjadi `config.php` secara manual di hosting.
Isi `site_url`, `supabase_url`, `supabase_publishable_key`, `staging` sesuai build.
Isi `deepl_auth_key` hanya di sini jika terjemahan diaktifkan. Tidak perlu service
role dalam implementasi ini. Simpan permission private 700/750 dan config 600/640
sesuai user PHP hosting. Jangan memasukkannya ke archive, Git, browser, log atau tiket.
Origin dan mode yang berbeda dari build ditolak dengan 503 untuk mencegah canonical
dan noindex salah. DeepL yang belum dikonfigurasi memberi 503, CMS lain tetap berjalan.

## Routing, SEO dan cache

- `/id/`, `/en/` dan seluruh `STATIC_ROUTES` melayani HTML hasil Playwright.
  Assets asli dilayani langsung. PHP hanya memilih file HTML yang ada di manifest
  route, tidak merender ulang React dan tidak menjalankan Node.
- Root dan URL publik tanpa locale diarahkan 301 ke `/en/`, mengikuti existing.
  URL statis tanpa slash dan `/index.html` dinormalisasi satu kali. Admin deep link
  memakai shell admin `noindex`; refresh tidak membutuhkan file per sub-route.
- Detail berita/portfolio dicegat sebelum filesystem. Supabase dibaca setiap
  request memakai public key/RLS. Konten tidak ada/unpublished/deleted: **404**;
  upstream gagal: **503 + Retry-After**, tanpa stale fallback yang berpura-pura 200.
  Alias portfolio dari `portfolio_slug_aliases` menghasilkan 301.
- Metadata, canonical, hreflang id/en/x-default, OG/Twitter, JSON-LD Article atau
  CreativeWork + BreadcrumbList, image dan teks preview diperbarui dari record
  beserta payload locale. Bootstrap JSON tetap memakai kontrak React yang sama.
  Preview crawler mengikuti pendekatan Pages Functions existing (teks konten yang
  di-escape, bukan menjalankan rich HTML mentah); UI React, DOMPurify dan interaksi
  setelah JavaScript tetap existing. Preview tanpa JS bukan salinan penuh UI React.
- Sitemap selalu live, pagination REST 500 baris; mencakup service lengkap, careers,
  berita dan portfolio saat ini. Kegagalan upstream menghasilkan 503, bukan sitemap
  lama. Pada 50.000 record/tabel perlu sitemap index; implementasi menolak overflow.
- Dynamic HTML/sitemap/API: `no-store`, tidak ada cache disk atau stale response.
  Edit/hapus CMS tercermin pada request berikutnya **bila Supabase tersedia**.
  Konsekuensi: latency dan read Supabase per request; ukur TTFB di staging sebelum
  cutover. Tidak mengklaim Core Web Vitals/TTFB setara sebelum pengukuran hosting.
- HTML statis: `no-cache, max-age=0, must-revalidate`. Ini hanya revalidasi file,
  **tidak** memperbarui snapshot CMS. Hashed JS/CSS/fonts: immutable satu tahun;
  media bernama tetap: satu jam, revalidate, sehingga edit media tidak terjebak cache
  immutable. Query-busting atau URL media baru tetap lebih aman untuk penggantian.
- CSP mengikuti existing `_headers`; hash script inline dihitung kembali dari
  HTML hasil Vite/prerender saat packaging supaya preload tidak diblokir oleh
  hash source yang sudah berubah. mod_headers diperlukan. Jika memakai custom
  Supabase domain, tambahkan origin HTTPS/WSS eksplisit pada CSP setelah audit.
  Kompresi gzip opsional via mod_deflate; verifikasi Brotli/gzip aktual di hosting.
- HSTS hanya dikirim PHP saat `https_verified=true` dan flag server `HTTPS=on`.
  Tidak mempercayai X-Forwarded-Proto. Aktifkan setelah sertifikat/HTTPS diuji;
  proxy hosting memerlukan konfirmasi support. HSTS pada asset yang dilayani
  langsung membutuhkan konfigurasi HTTPS vhost support; tidak diasumsikan tersedia.
- Staging build menambahkan header `X-Robots-Tag` melalui `.htaccess` untuk semua
  respons, meta noindex tetap setelah hydration, dan robots `Disallow: /`.
  Ini bukan kontrol akses: gunakan password directory/IP restriction panel bila
  data staging perlu dibatasi. Rebuild produksi menghilangkan kebijakan staging.

### Refresh HTML CMS lain — keterbatasan yang disengaja

Homepage, about, services/service landing, products/catalogue, listing news dan
portfolio, contact settings, serta careers tetap mengambil data live lewat React.
Namun **HTML crawler halaman tersebut adalah snapshot build**. Edit CMS pada
halaman itu belum real-time bagi crawler. Agar sinkron:

1. Setelah perubahan konten, jalankan build Qwords dengan public Supabase config
   yang benar dan online (`QWORDS_ALLOW_OFFLINE` tidak aktif).
2. Validasi artifact, unggah **release lengkap** ke staging, tes HTML tanpa JS dan
   browser; setelah persetujuan gunakan prosedur promote release.
3. Ganti public/private satu release bersama, bersihkan cache HTML hosting/CDN
   jika ada; pertahankan asset release lama selama rollout/rollback.

Workflow artifact manual tersedia untuk rebuild ini. Jadwal CI atau cron build
di mesin terpisah dapat ditambahkan setelah akun GitHub/hosting disetujui, namun
tidak ada webhook public, token dispatch, auto-upload, atau cron produksi yang
diaktifkan. Jika kebutuhan SEO real-time untuk semua halaman CMS mutlak, jangan
cutover sebelum refresh otomatis disetujui dan diuji. Keepalive Supabase dan purge
observations yang dahulu dijadwalkan lewat Actions juga **tidak** otomatis aktif
di Qwords; tentukan jadwal pengganti terpisah, tanpa service role di web root.

### Mapping WordPress lama

`legacy_redirects` default kosong. Isi hanya dari export URL WordPress, sitemap
lama, Search Console atau crawl yang telah ditinjau. Format exact path ke canonical
path lokal id/en, status 301. Tidak mendukung arbitrary host, wildcard proxy atau
rantai redirect. Mapping diterapkan sebelum pemilihan HTML; jangan map URL asset
asli karena file tersebut sengaja dilayani langsung. Perubahan struktur permalink
harus diuji pada staging. Tidak ada mapping rekaan dalam paket.
Mapping ini berbasis path, bukan query `?p=ID`; permalink WordPress berbasis query
perlu inventarisasi dan aturan khusus yang diverifikasi, jangan memetakan root `/`
sebagai pengganti seluruh query URL lama.

## Supabase dan CMS — validasi manual terisolasi

Tidak menjalankan SQL migration otomatis atau membuat/mengubah project. Verifikasi
akses REST menggunakan public key dan project yang disetujui; jangan menyalin
laporan audit lama sebagai bukti RLS production saat ini. Periksa RLS/grant untuk
seluruh tabel, RPC kontak/comments/careers/leads, Auth dan bucket `website-media`
dengan akun anon/non-admin/admin pada project testing. Production tetap untouched.

Daftarkan URL callback/site URL staging/production di Supabase Auth **hanya saat
diotorisasi**. Pastikan perubahan tidak menghapus URL Cloudflare yang masih dipakai.
Tes login/logout/token refresh, akses admin tanpa sesi, create/edit/delete berita
dan portfolio, alias slug, publish/unpublish, upload gambar/PDF/video, products,
homepage, services, about, contact settings, careers/job/applications/attachments,
contact submission, comments/moderation, leads, analytics dan observability.
Gunakan data uji pada project terpisah. Tanpa kredensial/akses Supabase, fitur ini
belum dapat dinyatakan lulus end-to-end terhadap backend nyata.

Endpoint terjemahan menerima kontrak existing `POST /api/translate-content` dengan
JWT sesi pada Authorization. Supabase Auth `/auth/v1/user` memverifikasi JWT dan
`app_metadata.role=admin`; `user_metadata` atau decoding JWT lokal tidak dipercaya.
Payload maksimal 120.000 byte, 250 text nodes, 12.000 karakter/node, JSON depth 32,
protected fields tidak diterjemahkan; DeepL dibatch maksimum 50 text/request dan
body bounded. URL upstream tetap, TLS verified, tidak mengikuti redirect, tidak
mengembalikan error provider/secret. Tidak menjadi proxy terbuka.

## Staging, verifikasi dan rollback

1. Backup document root staging yang dituju (jika ada) dan pastikan path bukan
   WordPress aktif. Upload public/private ke sibling yang benar. Jangan upload
   ZIP, manifest, docs atau contoh config ke document root.
2. Konfigurasikan private; periksa PHP extensions, permissions, rewrite, log tanpa
   secret. Validasi `/id/`, `/en/`, seluruh service/public routes, admin/login dan
   refresh deep link. Pastikan staging noindex sebelum URL dibagikan.
   Konfirmasi sertifikat dan Force HTTPS panel dengan support. Saat pergantian
   release, invalidasi OPcache melalui fasilitas panel bila diperlukan; tidak
   menyediakan endpoint public untuk flush OPcache.
3. Uji HTML tanpa JS dan HTTP status untuk artikel baru/edit/delete, portfolio alias,
   canonical/hreflang/JSON-LD/OG, sitemap/robots, missing content 404 dan upstream
   outage 503. Uji 301 tidak loop, Authorization diteruskan, anonim/non-admin ditolak.
4. Pastikan request `.env`, `.git/config`, source maps, `.sql`, backup archive dan
   `qwords-private/config.php` tidak terbaca. Tes hanya dengan file sentinel, jangan
   mengunggah secret untuk menguji proteksi. Verifikasi nosniff/CSP/frame/cache/gzip,
   no-store dynamic dan immutable hashed assets. Ukur CWV mobile/desktop dan TTFB
   dibanding baseline Cloudflare dengan konten dan network profile yang sama.
5. Rollback: simpan pasangan public/private release sebelumnya dan config private
   terpisah. Restore pasangan tersebut bersamaan, clear HTML cache. Jangan hanya
   mengganti HTML saat hashed assets berubah. Jika atomic swap tidak tersedia,
   gunakan maintenance window yang disetujui; partial upload bukan atomic deploy.
6. Setelah seluruh tes dan **persetujuan eksplisit**, build ulang untuk origin
   produksi, mode non-staging, dan promote ke document root yang telah disetujui.
   Backup WordPress/file/config dahulu; jangan menghapusnya. DNS, MX, SPF, DKIM,
   DMARC, nameserver dan email tidak diubah oleh prosedur build/upload ini.
   Perubahan DNS/cutover routing domain, jika diperlukan, adalah pekerjaan
   terpisah yang memerlukan persetujuan. Cloudflare tetap menjadi fallback.

## GitHub Actions opsional

`.github/workflows/build-qwords.yml` hanya `workflow_dispatch`, input origin
staging dan repository variables public Supabase. Tidak ada FTP/SSH credentials,
DeepL/service role, deploy job, push trigger atau langkah menimpa public_html.
Artifact ZIP menyertakan `.htaccess`. Akun/repository GitHub harus dihubungkan
kembali secara manual bila opsi ini hendak digunakan; tidak ada push dalam tugas ini.

`.github/workflows/deploy-cloudflare.yml` juga manual (`workflow_dispatch`).
Input `site_url` menentukan origin canonical build, menggunakan repository
variables public Supabase yang sama. Default `deploy=false` hanya menghasilkan
artifact Cloudflare; tidak mengunggahnya ke hosting. Deployment baru berjalan
jika operator memilih `deploy=true`, build lulus, dan aturan environment
`production` terpenuhi. Konfigurasikan required reviewers sesuai kebijakan akun.
Hanya job deploy membaca secret `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID`;
nilai tidak ditulis dalam source atau artifact. Opsional variable
`CLOUDFLARE_PAGES_PROJECT` default `visitiga-media`. Tidak ada trigger push/schedule
pada kedua workflow dan tidak ada workflow yang dijalankan dalam pekerjaan ini.

## Testing lokal

```text
npm run lint
npm run typecheck
npm test
npm run test:qwords
npm run build
npm run build:qwords
npm run package:qwords
npx playwright test --config playwright.qwords.config.ts
```

`test:qwords` menjalankan regression dispatcher PHP dengan upstream mock, guard
secret dan header Supabase. Jika PHP CLI tidak tersedia, test ditandai SKIP,
bukan dianggap pass. E2E Qwords menggunakan artifact offline testing dan mock
Supabase, tidak menjalankan CRUD/upload terhadap production. Hasil aktual dan
persyaratan staging dicatat di `docs/QWORDS_VALIDATION.md`.

Untuk mereproduksi E2E lokal tanpa menghubungi Supabase, build dahulu dengan
`VITE_SITE_URL=https://qwords-stage.example.test`,
`VITE_SUPABASE_URL=https://qwords-test.supabase.co`,
`VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_only`,
`QWORDS_STAGING=true`, `QWORDS_ALLOW_OFFLINE=true`, lalu `build:qwords` dan
`package:qwords`. Domain/key tersebut **dummy pengujian**, bukan konfigurasi
hosting. Router E2E sengaja menolak artifact selain offline staging tersebut.
Jangan mengunggah artifact dummy ke produksi.

## Rujukan resmi

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Migrasi API keys / apikey vs Bearer](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Apache rewrite flags](https://httpd.apache.org/docs/2.4/rewrite/flags.html)
- [DeepL translate request](https://developers.deepl.com/api-reference/translate/request-translation)
- [Qwords DirectAdmin knowledge base](https://kb.qwords.com/category/directadmin/tutorial-awal-menggunakan-hosting-dengan-panel-direct-admin/)
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Cloudflare Pages direct upload melalui CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

Dokumentasi tersebut tidak membuktikan fitur/limit akun SOHO pengguna; semua
kemampuan hosting di atas tetap memerlukan konfirmasi panel/support dan staging.
