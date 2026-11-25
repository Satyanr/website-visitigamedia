# Daftar perubahan audit Qwords

Audit repository lokal 25 November 2026. Frontend React/Vite/TypeScript/Tailwind/Framer Motion, aplikasi CMS dan backend Supabase tetap memakai arsitektur existing. Workflow Cloudflare tetap manual. Qwords menggunakan PHP dan aset statis pada hosting.

| File | Perubahan |
| --- | --- |
| `server/qwords/.htaccess` | Default tertutup, ACME khusus challenge, perlindungan sisa skrip WordPress/backup, inheritance untuk aplikasi legacy terverifikasi, kebijakan CSP/cache terbatas pada situs yang dikelola. |
| `server/qwords/entry.php`, `runtime.php`, `config.example.php` | Bootstrap gagal tertutup; kecocokan konfigurasi dan public key; deadline upstream, query publik berita, canonical/alias dan support inventory WordPress exact path/query/410. |
| `scripts/build-qwords.mjs`, `scripts/prerender.mjs` | Origin produksi tetap, larangan offline produksi, mode/noindex dan metadata, pemeriksaan dataset publik dan metadata SEO, prerender statis Qwords saja. |
| `scripts/qwords-lib.mjs`, `scripts/package-qwords.mjs`, `scripts/qwords-zip.php` | Hasilkan allowlist/CSP, whitelist file rilis, pisahkan public/private, inventaris file SHA-256, ZIP lintas OS, verifikasi integritas dan laporan disk/inode. |
| `scripts/validate-qwords-redirects.php` | Validator CLI menggunakan aturan yang sama seperti dispatcher. |
| `scripts/check-performance-budget.mjs`, `src/components/Logo.tsx`, `src/assets/logo-visitiga-horizontal.webp` | WebP lossless 420 px dari logo horizontal yang sudah ada untuk navbar/footer. Aset tersebut wajib ikut perhitungan budget. Dimensi tampilan dan branding dipertahankan. |
| `package.json`, `package-lock.json` | Perintah verifikasi ZIP/redirect. Resolusi DOMPurify saja naik dari 3.4.14 ke 3.5.0 dalam rentang existing untuk menutup advisori dependency runtime. |
| `supabase/migrations/20261125000000_separate_public_careers_read_policy.sql` | Pisahkan read lowongan publik dari fungsi pemeriksaan admin. Kebijakan admin existing tetap memberi akses ke semua lowongan. Migrasi disiapkan di repo dan perlu diuji di project terisolasi. |
| `tests/qwords/apache.test.mjs`, `runtime.test.mjs`, `runtime-check.php` | Apache native Windows/Linux, hard fail bila integrasi wajib, fixture routing legacy/WordPress/ACME, status detail, mapping dan validasi. |
| `tests/qwords/preflight.php` | Probe HTTPS bertoken, hanya boolean, digunakan sementara di staging. |
| `.github/workflows/build-qwords.yml` | Dispatch staging/produksi untuk artifact, environment produksi berpagar, PHP CLI matrix 8.2/8.3/8.4, Apache Linux, browser dan budget sebelum artifact online. |
| `DEPLOY_QWORDS.md`, `docs/QWORDS_CHANGES.md`, `docs/QWORDS_VALIDATION.md` | Checklist host, prosedur upload manual, build/rebuild CMS, audit Supabase dan bukti pengujian. |
| `docs/QWORDS_PREFLIGHT.md`, `docs/WORDPRESS_MIGRATION.md`, `docs/QWORDS_ROLLBACK.md` | Instruksi probe/removal, template inventaris/koeksistensi dan prosedur pemulihan. |

Mapping WordPress dan path legacy default kosong. Keputusan tentang aplikasi mana yang harus dipertahankan, ekuivalensi URL, layout vhost, dan penggunaan Supabase yang sebenarnya memerlukan inventaris serta hasil staging. Lihat [status validasi](QWORDS_VALIDATION.md).
