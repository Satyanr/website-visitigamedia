# Migrasi data Supabase yang diotorisasi

Riwayat PostgreSQL di `supabase/migrations/` adalah referensi. Jangan jalankan SQL PostgreSQL pada MySQL dan jangan mengubah RLS/production Supabase. Pemilik project mengeluarkan ekspor read-only yang diotorisasi. Ambil semua data yang memang dibutuhkan dengan pemisahan public/private. Catat waktu snapshot dan lakukan final delta/freeze terkontrol setelah staging lulus.

1. Ekspor tabel CMS, draft, translations, slug alias, foreign keys, komentar, leads dan pengajuan. Analytics dan observability hanya bila ada dasar retensi. Gunakan JSON baris, atau konversi CSV ke typed JSON secara lokal. Jangan masukkan Auth export/password atau URL download sementara.
2. Buat dokumen JSON object `{"version":1,"tables":{"news":[],"portfolios":[]},"media":[]}`. `server/qwords/app/schema.json` menentukan kolom. Pertahankan UUID, numeric IDs, UTC timestamps, JSON object/arrays dan foreign keys. Field historis yang sudah dihapus frontend dapat disimpan dalam ekspor arsip privat. Pisahkan perubahan kolom yang membutuhkan review sebelum import. Importer mengecek FK dan duplicate di engine.
3. Unduh objek bucket dengan izin pemilik. Tiap entri media menggunakan `source` URL HTTPS legacy persis, `target` berupa `imported/UUID.ext` atau `documents/UUID.ext`, `visibility`, `file` path relatif terhadap manifest, dan `sha256`. Pertahankan objek produksi yang ada sampai rollback window berakhir. Masukkan objek yang dibutuhkan saja dan cocokkan hitungan/checksum.
4. Jalankan di mesin lokal terpercaya atau CLI yang diizinkan, terhadap DB dedicated dan storage terisolasi.

   ```text
   php server/qwords/tools/import.php --dry-run private-export.json private-config.php
   php server/qwords/tools/import.php --apply private-export.json private-config.php
   ```

   Dry-run benar-benar mencoba INSERT di transaksi rollback dan memeriksa relasi/checksum. Apply menerima record identik pada ulang, menolak perbedaan tanpa override diam-diam, dan melaporkan tabel/nomor baris tanpa data privat. File media disiapkan sebelum transaksi data. Apply yang terhenti dapat dilanjutkan dengan manifest identik. InnoDB dapat mengonsumsi nomor auto-increment saat rollback, jadi dry-run dilakukan di database terisolasi.
5. Tanpa SSH hosting, jalankan import di MariaDB/MySQL lokal dengan skema sama, verifikasi, buat dump **data saja** dan import via phpMyAdmin pada database website khusus yang belum berisi data. Pindahkan media privat melalui File Manager ke path data yang sama secara logis. Bandingkan totals, checksum dan sampel URL. Dump dan file ekspor hanya disimpan offline/private.
6. Buat admin ulang secara terpisah. Ekspor ulang dataset publik dari database hasil migrasi, rebuild, cek preview HTML terlokalisasi dan uji staging. Jangan cutover bila ledger data atau media masih memiliki entri hilang yang memengaruhi website.

## Pemulihan jika Supabase asli belum dapat diakses

`node scripts/seed-qwords.mjs` menghasilkan baseline review dari seed historis repo dan default CMS, dengan ID deterministik khusus recovery. Aset harus merupakan file asli atau varian optimasi yang cocok. Baseline ini tidak memastikan isi produksi terbaru, hubungan yang berubah, media yang diupload, draft, komentar, leads, pelamar, auth, atau analytics. Jangan mencampur ID seed dan ID live. Pulihkan dari backup/akses pemilik atau lakukan rekonstruksi yang disetujui dari inventaris publik dan backup privat.
