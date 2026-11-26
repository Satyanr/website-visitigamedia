# Update staging Qwords melalui DirectAdmin

Rilis ini memperbaiki carousel dan media artikel di `staging.visitigamedia.com`. Gunakan document root staging dan direktori `qwords-private` yang memang dipakai oleh staging. Semua langkah dilakukan melalui File Manager dan phpMyAdmin.

## Temuan audit

| Gejala | Penyebab dan perbaikan |
| --- | --- |
| Hero tanpa background, pagination, atau autoplay | `003_recovery_seed.sql`, `qwords-content-export.json`, dan API publik staging berisi enam `image_url` kosong. Komponen lama membuang semua slide dengan URL kosong. Carousel kini mempertahankan keenam slide, urutan, copy bilingual, dan interval 6.000 ms. Slide tanpa gambar memakai latar desain yang sudah ada. [Endpoint homepage staging](https://staging.visitigamedia.com/api/content/homepage_content) |
| Foto dari file hilang saat disimpan | Summernote sebelumnya memakai penyisipan data URL bawaan. PHP membuang URL tersebut. Pemilih file, paste, dan drop kini memakai kompresi yang juga digunakan oleh field cover, API media, dan path UUID `news/`. Batas file artikel menyisakan 16 KiB dari 2 MiB untuk multipart. Simpan diblokir selama proses media. |
| Foto eksternal gagal tampil | CSP Qwords tidak mengizinkan sumber HTTPS eksternal. Dialog sekarang memvalidasi skema dan meminta browser memuat gambar sebelum menyisipkannya. URL yang gagal didekode atau diblokir hotlink menampilkan pesan di editor. CSP memberi akses HTTPS pada `img-src` saja untuk fitur gambar, dan koneksi API tetap same-origin. |
| Video hilang setelah disimpan atau dimuat ulang | Sanitizer PHP dan DOMPurify membuang iframe, CSP tidak mengizinkan player, dan dialog bawaan menerima lebih banyak penyedia. Dialog baru membentuk URL player YouTube, YouTube privacy-enhanced, dan Vimeo berdasarkan hostname, path, dan ID. MP4/WebM tersedia lewat aset same-origin di `/videos/` dan URL UUID media publik yang terdaftar. Kedua sanitizer membangun ulang tag video dengan atribut yang diizinkan. [YouTube player URL](https://developers.google.com/youtube/player_parameters) · [Vimeo player URL](https://help.vimeo.com/hc/en-us/articles/30021987305873-How-do-I-embed-parameters-to-a-Vimeo-com-URL) |
| Media berbeda antara EN dan ID | HTML lokal dapat tertinggal ketika sumber EN ditambah gambar atau video. Simpan manual melengkapi media dari sumber sambil mempertahankan teks dan posisi media yang sudah ada. Tampilan ID juga melengkapi artikel lama. Terjemahan otomatis memakai penanda yang menyimpan URL dan embed di luar teks terjemahan, lalu memulihkannya di posisi semula. Jika layanan terjemahan menghilangkan penanda, artikel tetap terbuka dan editor menampilkan error. |
| Konfigurasi staging rentan hilang saat file diganti | Template rilis sebelumnya tidak memuat handler PHP 8.4 Qwords atau rule eksplisit untuk meneruskan Authorization. Packager kini menambahkan handler untuk origin staging yang tepat. Template mempertahankan forwarding, routing, ACL, CSP, dan noindex. |

### Status gambar asli

Migrasi `20261021000000_add_homepage_content_management.sql` dan rangkaian migrasi `20261112000000`–`20261112020000` mengaitkan gambar beranda asli `/hero-1600.webp` dengan penempatan pertama dan judul **ADVERTISING / PERIKLANAN**. File itu tersedia di paket. Migrasi `20261117020000_clear_legacy_homepage_hero_images.sql` sengaja mengosongkan aset slideshow lama. Migrasi berikutnya menambah kampanye dengan URL kosong. Empat gambar dalam konfigurasi lama tidak menyediakan pemetaan yang terverifikasi untuk formasi enam kampanye pada staging.

Gambar asli untuk **Outdoor LED, Indoor Experience, Videotron Rental, Buy Your Videotron**, dan **Event Impact** belum ditemukan dengan pemetaan yang bisa diverifikasi. Lima slide tersebut masih tampil dengan teks di atas latar desain. Setelah gambar asli ditemukan, pasangkan ke slide terkait melalui **Admin → Beranda** dan uji kedua bahasa. Patch yang disertakan memperbarui gambar Advertising saja.

## Update incremental

1. Aktifkan **Show Hidden Files** di DirectAdmin File Manager. Catat path document root staging dan path private dari instalasi sekarang. Unduh backup file yang akan ditimpa, termasuk web root `.htaccess`, HTML, dan file PHP private. Simpan daftar file yang baru ditambahkan untuk rollback.
2. Di phpMyAdmin pilih database staging dedicated. Jalankan query di bawah dan simpan hasil JSON secara privat. Jika update menghasilkan `patched_rows=0`, periksa kondisi baris sebelum melanjutkan.
   ```sql
   SELECT id, hero_slides FROM homepage_content WHERE id = 1;
   ```
3. Verifikasi SHA-256 ZIP memakai laporan rilis. Ekstrak ZIP secara lokal atau dalam folder sementara di luar document root. Gunakan daftar delta rilis sebagai daftar upload. Salin aset baru `public_html/assets/` dan media publik yang terverifikasi terlebih dahulu. Simpan semua aset dengan hash lama selama masa rollback agar tab yang terbuka tetap bisa mengambil chunk lama.
4. Salin file yang berubah di `qwords-private/` ke path private staging. Ganti hanya file yang tercantum dalam daftar perubahan. `config.php`, penyimpanan sesi dan media, serta database menggunakan instalasi staging yang ada. Jalankan langkah berikutnya dalam jendela pemeliharaan agar HTML, shell, dan header tetap selaras.
5. Salin HTML yang berubah ke path staging masing-masing. Terapkan `public_html/.htaccess` dari paket dengan mempertahankan aturan hosting khusus staging dari backup, termasuk challenge ACME dan mapping subaplikasi yang berlaku. Pastikan blok di bawah ada tepat sekali, forwarding Authorization tetap aktif, dan hash CSP berasal dari paket yang sama dengan HTML. Jika hosting mengirim CSP lain yang lebih ketat, sesuaikan aturan staging agar header tidak saling bertentangan.
   ```apacheconf
   <FilesMatch "\.(php|phtml|php3|php4|php5)$">
       SetHandler application/x-httpd-php84
   </FilesMatch>
   ```
6. Gunakan tab **Import** phpMyAdmin pada database staging untuk menjalankan `004_staging_hero_images.sql`. Hasil `patched_rows=1` menunjukkan gambar pertama dipulihkan. Patch membatasi target ke `id=1`, bentuk enam slide, judul Advertising di indeks pertama, dan URL yang kosong atau belum ada. Recovery seed dan SQL instalasi tidak diperlukan untuk update ini.
7. Jika cache HTML, LiteSpeed, atau OPcache menahan file lama, purge cache staging melalui panel. Periksa HTTPS, header `X-Robots-Tag`, direct URL dan reload artikel EN/ID, login, serta hero pada desktop dan mobile. Uji unggah JPG/PNG/WebP, URL dari CDN, dan Video dengan satu video YouTube serta satu video Vimeo yang mengizinkan embed di domain staging. MP4/WebM menggunakan path aset staging yang sudah tersedia di `/videos/`.

Gunakan `upload_max_filesize=2M` dan sisakan ruang multipart di `post_max_size` (misalnya `3M` jika panel mengizinkan). Editor menampilkan jumlah foto yang sedang diproses dan pesan untuk file yang gagal. Foto baru yang tidak ikut tersimpan dibersihkan melalui API saat editor ditutup. PHP memeriksa referensi di konten CMS di dalam lock sebelum menghapus file. Penutupan tab atau sesi kedaluwarsa dapat menghentikan pembersihan otomatis. Gunakan API media admin untuk penghapusan manual setelah meninjau kandidat agar pemeriksaan referensi tetap berjalan.

## Rollback incremental

1. Jeda edit artikel selama pemulihan. Pulihkan file public dan private yang ditimpa dari backup staging, termasuk `.htaccess` dengan handler PHP 8.4 dan forwarding Authorization. Aset dengan hash rilis baru boleh tetap ada selama tidak direferensikan.
2. Jika patch sebelumnya mengembalikan `patched_rows=1` dan backup mencatat URL Advertising kosong, jalankan query berikut. Konfirmasi bahwa indeks pertama masih merupakan slide yang sama dan belum diubah melalui CMS. Jika editor telah mengubah mapping gambar setelah rilis, bandingkan dengan backup di phpMyAdmin sebelum membalik perubahan.
   ```sql
   UPDATE homepage_content
   SET hero_slides = JSON_SET(hero_slides, '$[0].image_url', ''),
       updated_at = updated_at
   WHERE id = 1 AND JSON_TYPE(hero_slides) = 'ARRAY' AND JSON_LENGTH(hero_slides) = 6
     AND BINARY JSON_UNQUOTE(JSON_EXTRACT(hero_slides, '$[0].content_en.title')) = 'ADVERTISING'
     AND BINARY JSON_UNQUOTE(JSON_EXTRACT(hero_slides, '$[0].image_url')) = '/hero-1600.webp';
   ```
3. Purge cache staging dan periksa homepage, login, dan direct URL artikel. Pemutar versi terdahulu tidak menampilkan embed yang baru disimpan. Hindari menyimpan ulang artikel dengan media baru selama rollback agar sanitizer lama tidak membuang tag video.

## Verifikasi lokal

- Vitest lulus 88 tes. Lint, TypeScript, dan pemeriksaan sintaks PHP lulus.
- Suite Qwords lulus 63 pemeriksaan di Apache, PHP 8.2, dan MariaDB 10.4 terisolasi. Patch diuji dua kali pada baris fixture untuk memeriksa idempotensi dan memastikan lima URL lain, konten bilingual, kolom lain, dan timestamp tidak berubah. Suite juga memeriksa simpan dan baca ulang media dari database serta perlindungan terhadap penghapusan file yang masih dirujuk.
- Enam tes Playwright lulus pada ZIP staging akhir melalui fixture loopback. Kasus carousel memakai enam aset fixture yang valid untuk memeriksa pagination dan autoplay, sedangkan ZIP staging berisi pemetaan Advertising yang terverifikasi. Upload file, paste, drop, penyisipan di posisi kursor, penyimpanan media di dua bahasa, direct URL, dan reload diuji di browser. PNG di atas 2 MiB dikompresi menjadi WebP dengan total payload multipart di bawah 2 MiB.
- WebM lokal diputar di Chromium. Pengujian YouTube dan Vimeo memakai respons player fixture pada host yang diizinkan. DeepL memakai respons terjemahan fixture. Uji playback dari penyedia dan terjemahan di hosting masuk dalam UAT setelah update manual.
- Build Qwords dari snapshot API publik staging memvalidasi 34 halaman prerender SEO dan performance budget. Verifikasi ZIP, SHA-256 berkas, handler PHP 8.4, noindex, dan file gambar Advertising lulus. Patch SQL tetap menjadi file terpisah untuk phpMyAdmin.
- Prerender preview umum memvalidasi 142 halaman dan kelima tes Playwright preview umum lulus dengan fixture API same-origin.
