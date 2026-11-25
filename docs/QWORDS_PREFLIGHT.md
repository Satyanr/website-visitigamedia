# Preflight Qwords

Gunakan staging HTTPS terpisah dan database fixture. Aktifkan PHP 8.4 dari panel, amati batas CPU/memori/timeout, cek PDO MySQL dan fileinfo. Probe `tests/qwords/preflight.php` hanya dipakai sementara dan tidak dikemas.

1. Buat token acak 32 byte lokal, representasikan sebagai 64 karakter hex. Masukkan SHA-256 dari string token ke salinan probe pada placeholder `REPLACE_WITH_SHA256_DIGEST`. Simpan token tetap privat.
2. Backup .htaccess staging. Salin probe sebagai `qwords-preflight.php` ke root staging. Sisipkan sebelum blok yang menolak direct PHP.

   ```apache
   RewriteCond %{REQUEST_URI} ^/qwords-preflight\.php$
   RewriteCond %{REQUEST_FILENAME} -f
   RewriteRule ^ - [END]
   ```

3. Tes request HTTPS tanpa token mendapat 404. Kirim GET dengan header `X-Qwords-Preflight` berisi token. HTTP 200 berarti checks boolean tersedia, termasuk schema version serta folder sesi/media. HTTP 503 berarti cek boolean false dan log privat.
4. Uji API auth + CSRF, upload 2M sesuai panel, Range video, SMTP/email existing di domain terkait, legacy deep links, sitemap, canonical, noindex staging, ACME dan HTTPS/headers.
5. Hapus probe dan rewrite pengecualian, verifikasi URL kembali tertutup, kemudian buang token dan salinan lokal. Simpan bukti berupa status/boolean tanpa kredensial.
