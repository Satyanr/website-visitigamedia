# Perubahan Qwords

Migrasi lokal dari SDK Supabase dan Cloudflare Functions ke API PHP/MySQL, 25 November 2026. PostgreSQL migrations historis tetap tersedia.

| Area | File utama dan perubahan |
| --- | --- |
| MySQL | `server/qwords/database/001_initial.sql` dan `002_report_index.sql` memberi skema InnoDB, sejarah versi, ID/slug/alias, foreign keys, indeks, JSON ID/EN dan watchdog table. |
| Backend | `server/qwords/app/{api,content,database,forms,media,security,schema}.php` dan `schema.json` memberi PDO, CRUD dan filter, transaksi, cookie admin/CSRF, rate limit, agregasi dashboard dan registri media. |
| Routing | `server/qwords/{runtime.php,.htaccess,config.example.php}` memakai backend lokal yang sama untuk API, detail SEO, sitemap dan file. Legacy allowlist, ACME dan mapping WordPress dipertahankan. |
| Frontend | `src/lib/api.ts`, `adminApi.ts`, `publicApi.ts`, `translation.ts`, `AuthContext.tsx`, adapter analytics/observability/comments/form dan editor. React layout dan konsep CMS tetap. Field terjemahan ID manual ditambahkan pada editor yang sebelumnya otomatis, dan dashboard polling saat terlihat. |
| Build | `scripts/{build-qwords,package-qwords,prerender,qwords-lib,seed-qwords}.mjs`, `scripts/qwords-zip.php`, package/lockfile dan `.github/workflows/build-qwords.yml`. Snapshot publik menggantikan Supabase. Deployment workflow Cloudflare serta SDK dihapus dari jalur aktif. |
| Operasi data | `server/qwords/tools/` berisi import dengan dry-run/idempotensi, export publik, generator SQL hash admin dan maintenance privat. Seed rekonstruksi berasal dari source repo. |
| Regresi | `tests/qwords/` menambah integrasi MariaDB nyata dan memperbarui fixture Apache/runtime/preflight. `tests/qwords-e2e/` menguji browser lewat API same-origin. |
| Dokumentasi | Runbook DirectAdmin, migrations, admin, media, API, backup/rollback dan matriks fitur. |

Perubahan detail tersedia di Git diff. [Matriks fitur](BACKEND_ARCHITECTURE.md) · [Validasi](QWORDS_VALIDATION.md).
