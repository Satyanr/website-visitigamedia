# API website

Same-origin JSON dengan `Cache-Control: no-store`. Error berbentuk `{ error, code }` pada validasi aplikasi. Gangguan DB mengembalikan 503 generik. Public routes tidak membaca sesi untuk menentukan visibilitas. Request mutasi dari browser membawa Origin yang cocok dengan site_url. Tambahkan `X-CSRF-Token` dari sesi untuk mutasi admin.

| Method dan path | Akses | Tujuan |
| --- | --- | --- |
| GET /api/session | Browser | `null` atau user admin, CSRF dan status DeepL. |
| POST /api/session | Same-origin, HTTPS | `email,password`, login dan cookie. |
| PATCH/DELETE /api/session | Admin + CSRF | Aktivitas pengguna atau logout. |
| GET /api/content/{collection} | Publik | Koleksi CMS publik, pagination dan filter terbatas. |
| GET /api/admin/{collection} | Admin | Koleksi CMS, draft, leads, submissions, analytics dan observability. |
| POST/PATCH/PUT/DELETE /api/admin/{collection} | Admin + CSRF | CRUD yang diizinkan untuk koleksi. PATCH/DELETE membutuhkan filter ID tunggal. PUT untuk singleton ID 1. |
| POST /api/actions/{name} | Same-origin | `submit_contact_message`, `submit_news_comment`, `submit_careers_submission`, `record_website_event`, `submit_website_observation`. |
| POST /api/actions/{name} | Admin + CSRF | `save_service_landing`, `mark_contact_messages_read`, `mark_careers_submissions_read`, `purge_old_website_observations`, `admin_dashboard_summary`. |
| GET/POST/DELETE /api/admin/media | Admin dan CSRF pada mutasi | List per folder, multipart path/file, delete paths. `visibility=private` memakai folder documents. |
| GET/HEAD /media/{folder}/{uuid.ext} | Publik | Baca file, termasuk satu byte range. |
| GET/HEAD /api/admin/files/documents/{uuid.ext} | Admin | Unduh dokumen privat. |
| POST /api/translate-content | Admin + CSRF | Translate objek ID/EN dengan DeepL jika key tersedia. |
| GET /api/content-export | X-Qwords-Export privat | Dataset publik version 1 untuk build di luar server. |

Respons koleksi berbentuk `{ rows, count? }`. Query menerima `fields`, `filters` sebagai array triple JSON `[field, operator, value]`, `sort` sebagai pasangan field/ascending, `limit`, `offset`, dan cursor komentar `before`. SQL identifiers tidak diterima di luar whitelist. Rentang data biasa 200 per halaman dengan maksimum 1.000. Public mutation rates bergantung pada tindakan dan kombinasi hashed IP/browser/email.
