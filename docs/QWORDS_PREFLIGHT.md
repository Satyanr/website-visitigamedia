# Staging preflight Qwords

Jalankan di staging HTTPS terisolasi dengan Supabase pengujian yang diotorisasi dan artifact online staging. Gunakan akun File Manager sendiri. Prosedur ini tidak membutuhkan root atau SSH. DOCROOT dan sibling private harus sesuai struktur di [panduan deploy](../DEPLOY_QWORDS.md).

1. Siapkan `qwords-private/config.php` lalu cek izin dan file readable melalui endpoint staging. Salin konfigurasi root `.htaccess` staging untuk dipulihkan sesudah tes.
2. Di mesin lokal, buat token acak 32 byte dan salinan probe di luar output rilis. Perintah ini tidak mencetak token. Jangan merekam command trace, mengirim token dalam URL, atau memasukkan probe/token ke Git.

   ```powershell
   $probe = node -e "const c=require('node:crypto');const t=c.randomBytes(32).toString('hex'); console.log(JSON.stringify({token:t,digest:c.createHash('sha256').update(t).digest('hex')}))" | ConvertFrom-Json
   $body = (Get-Content -Raw tests/qwords/preflight.php).Replace('REPLACE_WITH_SHA256_DIGEST', $probe.digest)
   [IO.File]::WriteAllText((Join-Path (Get-Location) '.qwords-test/qwords-preflight.php'), $body, [Text.UTF8Encoding]::new($false))
   ```

   Buat direktori lokal `.qwords-test` terlebih dahulu bila belum ada. Upload salinannya hanya ke root staging dengan nama `qwords-preflight.php`.

3. Di `.htaccess` staging, tepat sebelum bagian *Reject direct requests for the entry*, sisipkan sementara:

   ```apache
   RewriteCond %{REQUEST_URI} ^/qwords-preflight\.php$
   RewriteCond %{REQUEST_FILENAME} -f
   RewriteRule ^ - [END]
   ```

   Bila PHP handler/override staging menolak hal ini, gunakan bantuan Qwords untuk staging atau direktori tes terpisah dengan konfigurasi yang setara. Jangan menonaktifkan aturan proteksi staging lainnya.

4. Pastikan request tanpa token mendapat 404 dan tidak menampilkan detail. Kemudian jalankan dari PowerShell dengan origin staging yang benar.

   ```powershell
   $uri = 'https://STAGING_ORIGIN/qwords-preflight.php'
   Invoke-RestMethod -Uri $uri -Headers @{
     'X-Qwords-Preflight' = $probe.token
     Authorization = 'Bearer qwords-preflight-check'
   }
   ```

   HTTP 200 berarti seluruh kriteria probe bernilai true. HTTP 503 berarti periksa boolean yang false, misalnya ekstensi, HTTPS, `open_basedir`/izin sibling, CA/outbound HTTPS, timeout/memori, atau header Authorization yang hilang sebelum PHP. Probe hanya melaporkan boolean dan menolak request selain GET HTTPS dengan token yang cocok. Ia membaca satu query anon dan tidak mengeluarkan nilai konfigurasi, path, kredensial atau hasil query. Tambahkan audit log hosting bila diperlukan dari panel secara privat.

5. Uji terpisah trailing slash `/id/about` → `/id/about/` tanpa loop, unknown 404, ACME, cache, gzip, endpoint Auth, validitas header dan perilaku child rules. Verifikasi operasi TLS untuk setiap origin terpisah termasuk vhost legacy. Hanya server HTTPS tepercaya yang boleh mengaktifkan HSTS. Uji dengan dan tanpa header spoof `X-Forwarded-Proto`.
6. Hapus file probe dari staging, hapus pengecualian rewrite, buang token/salinan lokal, dan periksa URL probe kembali 403/404. Verifikasi ZIP tidak berisi probe. Jika host menyediakan cache eksplisit, purge hanya URL probe setelah pemakaian. Catat hasil lulus/gagal tanpa token di log rilis.
