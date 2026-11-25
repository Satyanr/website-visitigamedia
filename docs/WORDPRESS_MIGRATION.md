# Migrasi URL WordPress dan shared document root

Mulai dengan ekspor sitemap WordPress, export konten/permalink, log publik, Search Console atau crawl yang sudah ditinjau. Gabungkan dengan manifest build Qwords dan route CMS publik. Simpan inventaris asli privat dengan tanggal dan sumber. Biarkan mapping kosong sampai tersedia bukti. Kategori, media, proyek dan halaman lama dapat memiliki status berbeda.

| Tipe | Bukti dan field yang harus dikumpulkan |
| --- | --- |
| Page, post, project, category | URL/path persis, canonical lama, bukti kesetaraan dan target canonical id/en |
| Media | URL lama dan checksum/identitas file, URL media baru yang ada di artifact |
| Permalink tanggal | Path tahun/bulan/hari persis sesuai inventory, target konten atau status removal |
| Query permalink | Endpoint root atau `/index.php`, parameter WordPress `p`, `page_id` atau `attachment_id`, ID persis, target atau status removal |
| Removed | Path yang sudah diverifikasi, alasan, status 404 atau 410, target kosong |

### Template inventaris privat

Mulai dari JSON array kosong `[]`. Setiap baris menggunakan format di bawah. Nilai kurung sudut adalah placeholder dan akan ditolak validator sampai diganti.

```json
[
  {
    "source": "<absolute path with optional exact WordPress selector>",
    "status": 301,
    "target": "<canonical path in the release>",
    "evidence": "<inventory filename, date, and reference>",
    "preserve_query": []
  }
]
```

`source` case-sensitive dan mencocokkan path persis, termasuk trailing slash. Untuk varian yang benar-benar tercatat, tambahkan baris terpisah. Query berbasis ID cocok bila satu selector muncul tepat sekali. Beberapa parameter UTM umum dapat diteruskan dengan menamainya di `preserve_query`. Selector WordPress, token dan parameter lainnya dibuang. Set `status` ke 404/410 dan hapus `target`/kosongkan `preserve_query` untuk konten yang tidak punya pengganti. Gunakan path lokal tanpa host/fragment untuk target. Target media harus ada pada artifact dan berada di direktori media yang diizinkan.

```powershell
npm run validate:qwords-redirects -- PATH_KE_INVENTARIS_PRIVAT.json artifacts/qwords
```

Validator memeriksa struktur, duplikat, query selector, target media lokal, konflik namespace/application dan rantai atau loop. Salin baris yang sudah lulus ke private `config.php` sebagai array PHP pada `migration_routes`. Mapping legacy dari konfigurasi lama masih diterima tetapi ikut melalui pemeriksaan. Di staging, uji setiap URL lama dan target dengan GET dan HEAD, status yang diharapkan serta hanya satu 301. Verifikasi target detail masih diterbitkan dan tidak menjadi alias atau 404. Untuk asset media atau URL yang memiliki handler vhost di luar cakupan paket, verifikasi penanganannya melalui Qwords sebelum membuat mapping. Pantau penerimaan sitemap/404 setelah cutover.

### Koeksistensi dan isolasi

- Inventarisasi `beta`, `brochure`, `info`, `lms`, `smart-classroom`, `uai`, `cgi-bin`, backup, subdomain dan semua alias. Untuk tiap path yang benar-benar dibutuhkan, cek owner, status, jenis file, entry point PHP, rewrite nested, autentikasi, header, symlink dan traffic yang sah. Uji endpoint login/form dan deep link aplikasi dengan pemiliknya.
- Isi `QWORDS_LEGACY_APPS` hanya dengan nama top-level yang lulus verifikasi. Build menghasilkan pengecualian di `.htaccess`. Root PHP router/CSP tidak mengambil alih request legacy yang diizinkan. Proteksi dotfile, bundle internal dan backup tetap berlaku. Gunakan hasil uji staging untuk memastikan child auth/routing dan direktori ACME bekerja dengan server yang diberikan Qwords.
- Root akan mengarahkan `/index.php` ke dispatcher Qwords untuk inventaris query. Skrip root WordPress lain dan PHP di luar folder allowlist ditolak. File/media lama di `/wp-content/` hanya dapat dialihkan melalui baris inventaris yang valid. Unknown route mendapat 404. Simpan sisa WordPress, archive, `backup`, `backup_17112022`, PHP lama, `.htaccess` lama, dan dokumen rahasia di luar document root sebelum cutover. Jangan whitelist backup atau `cgi-bin`.
- Root `.htaccess` tidak mengendalikan alias/vhost terpisah, CGI handler server, symlink, atau child `.htaccess` yang menonaktifkan inheritance atau rewrite. Jika tidak bisa membersihkan konflik atau menguji precedence dengan aman, gunakan document root dedicated untuk Qwords dan pertahankan akses aplikasi terverifikasi lewat rute yang diatur provider. Jadwalkan perubahan tersebut secara terpisah. Jangan mengedit aplikasi/subdomain lain hanya untuk memaksa rilis.
