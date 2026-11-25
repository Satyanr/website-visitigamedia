# Backup dan rollback Qwords

## Sebelum cutover

1. Dokumentasikan domain dan document root, sibling private, daftar subdomain, aturan WordPress/legacy, permissions, versi PHP dan status HTTPS. Ambil baseline route publik, aplikasi terverifikasi, login, ACME, email dan sitemap.
2. Dari DirectAdmin File Manager/Backup, siapkan backup WordPress lengkap dengan dotfiles/uploads dan ekspor database WordPress memakai metode yang diotorisasi. Simpan bersama salinan konfigurasi yang diperlukan di lokasi privat/di luar akun bila inode terbatas. Pastikan backup dapat direstore sebelum melanjutkan.
3. Simpan pasangan rilis public/private sebelumnya, checksum paket dan konfigurasi privat terpisah dengan akses minimum. Jika ini cutover pertama, pasangan rollback adalah web root WordPress, konfigurasi dan database WordPress yang sesuai, serta aplikasi lama yang dipertahankan. Jangan memasukkan kredensial atau data CMS ke manifest atau log umum.
4. Buat catatan alokasi inode/disk untuk live + staging/extraction + backup + pasangan rollback aktual. Jangan mengandalkan observasi kuota lama. Gunakan *report JSON* untuk biaya paket baru dan ukur backup WordPress/aplikasi secara terpisah. Persiapkan lokasi karantina di luar semua document root.
5. Sepakati maintenance window, siapa yang berwenang mengembalikan layanan, dan keputusan rollback bila route publik/admin, HTTPS, legacy app, email atau proteksi file gagal. Hindari cutover dengan pasangan public/private dari revisi berbeda.

## Saat regresi terjadi

1. Hentikan upload/promosi lain dan catat gejala, versi, waktu dan status HTTP. Simpan snapshot rilis gagal untuk diagnosis di lokasi privat.
2. Di panel kembalikan pasangan document root + sibling private sebelumnya atau root WordPress dan konfigurasinya. Jika tidak tersedia swap atomik, gunakan maintenance window yang disetujui dan pulihkan dotfiles/routing/permissions sebelum membuka traffic. Pulihkan DB hanya bila memang berubah, dengan backup yang tepat serta approval terpisah. Perubahan data Supabase memerlukan prosedur tersendiri.
3. Purge cache HTML/LiteSpeed/CDN dan invalidasi OPcache melalui fasilitas panel yang diizinkan. Pertahankan aset hashed versi yang berjalan hingga klien dengan HTML lama sudah stabil.
4. Uji HTTPS, ACME, status/canonical public, admin/auth, aplikasi legacy dan proteksi secret. Bila kembali ke WordPress, cek permalink, media dan login WordPress. Dokumentasikan waktu pemulihan. Tidak perlu mengubah DNS/MX untuk rollback file apabila pemetaan domain tetap sama.
