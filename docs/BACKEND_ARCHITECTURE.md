# Backend PHP/MySQL Qwords

React/Vite memakai client HTTP bertipe di `src/lib/api.ts`. PHP diakses melalui satu entry `public_html/_qwords.php`. Dispatcher yang sama melayani HTML prerender, detail SEO, sitemap, API dan streaming media. InnoDB menyimpan CMS, hubungan, sesi akun versi, data formulir dan observasi. File sesi serta media berada di sibling data permanen di luar document root.

```text
React -> /api/content, /api/admin, /api/actions, /api/session
      -> _qwords.php -> qwords-private/runtime.php
                     -> app/{api,database,content,forms,security,media}.php
                     -> database khusus + visitiga-data di luar web root
```

API memakai prepared statements, proyeksi dan filter yang dibatasi, pagination, transaksi untuk slug alias, relasi, form dan rate limiting. Login memakai sesi cookie host-only dan CSRF. Batas waktu DB 8 detik untuk statement yang didukung engine, koneksi 3 detik dan lock 4 detik. Data dinamis dan respons admin memakai no-store. Aset build tetap memakai kebijakan cache Apache/LiteSpeed. DeepL opsional. Tidak diperlukan worker, Node atau Composer pada hosting.

## Matriks migrasi

| Fitur | Sebelumnya | PHP/MySQL | Migrasi | Verifikasi dan batas |
| --- | --- | --- | --- | --- |
| Login, logout, proteksi rute dan idle | Supabase Auth/JWT, app_metadata, SDK session | PHP session, cookie Secure/HttpOnly/SameSite, CSRF, rate limit dan role/version DB | Buat pengguna baru dan ganti password secara privat | Uji HTTP MariaDB. TLS nyata di staging. |
| Homepage, slide, About, visi misi | Singleton, JSONB, update RLS | API singleton dan JSON ID/EN, upload media | Import singleton asli, pertahankan urutan dan ID | Akses publik dan snapshot E2E. Uji operator edit seluruh field. |
| Services, landing dan proyek terkait | RLS, RPC, join table | Transaksi relasi InnoDB dan CRUD admin | Import slug, konten dan urutan foreign key | Fixture API dan staging CMS. |
| Produk dan katalog PDF | CRUD, RLS, bucket | CRUD, judul dua bahasa, upload ganti PDF dan reference check | Import ID dan media checksum | Uji upload dan katalog nyata di staging. |
| Portfolio | UUID, slug, trigger alias | UUID, unique slug, alias transaksi dan FK | Import canonical dan alias persis | SEO 200/301/404, uji konflik. |
| Berita dan Summernote | RLS published, PostgREST | Filter published server, sanitasi HTML, editor yang sama | Import draft, published, copy bilingual dan media | Uji HTTP MariaDB untuk publish/delete dan SEO. |
| Komentar berita | RPC, RLS, advisory lock | Cursor, public only pada berita publish, admin delete, rate limiter InnoDB | Import FK dan ID | Uji form, nomor halaman dan moderasi. |
| Kontak, leads, status, notes | RPC, tabel private | POST tervalidasi, batas rate, admin CRUD, read state | Import ID, waktu, notes dan riwayat relevan | Uji HTTP MariaDB dan halaman admin aktual di staging. |
| Careers dan kemitraan | Jobs published policy, RPC, pengajuan private | Job published, FK nullable, admin CRUD dan mark-read | Import job sebelum pengajuan, ID dan status dipertahankan | Uji draft/publish dan pengajuan. CV existing diarahkan via mekanisme halaman yang sama. |
| Dashboard, realtime, analytics | Realtime WS, event table | Polling 30 detik saat tab terlihat, pagination, agregasi SQL dan event retention 730 hari | Import analytics yang masih diperlukan dan dibolehkan | Uji akses, ukur beban pada staging. |
| Observability | RPC, dedupe, retention PostgreSQL | Endpoint same-origin, dedupe transaksi dan retensi 30 hari | Import data yang diperlukan atau mulai koleksi baru | Detail sensitif dibatasi di server. |
| Media, foto dan video | Supabase Storage | File privat, registri checksum, auth dokumen, Range | Salin file yang sah dan rewrite referensi | Uji PNG/Range/delete; ukuran video riil sesuai limit host. |
| SEO | Prerender Supabase, fungsi PHP/Cloudflare | Export read-only lokal/same-origin dan detail PDO | Rebuild dari snapshot publik yang diverifikasi | Browser, canonical, sitemap, robots; CWV live belum diukur. |
| Terjemahan | DeepL diperlukan beberapa save | Copy dua bahasa manual dan optional DeepL | Pertahankan konten ID/EN | Disabled tidak menghalangi save biasa. |
| Hosting & rilis | Cloudflare/Supabase alternatif | Artifact PHP + MySQL, tanpa auto deploy | Gunakan DirectAdmin dan backup terpisah | Linux CI perlu dijalankan, staging Qwords wajib. |

Historical PostgreSQL migrations remain in `supabase/migrations/`. They include 18 RLS-enabled tables and the last Careers policy restricting public reads. Source audit maps SDK initialization, Auth listener, PostgREST collections and projections, RPC, Realtime, Storage, analytics, observability, and build export to the paths above. Cloudflare Functions, SDK fixture tools, and workflow were retired in the active tree. Historical copies remain in Git at `b48a833`.
