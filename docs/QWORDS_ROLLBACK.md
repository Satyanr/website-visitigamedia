# Rollback Qwords

Sebelum cutover, buat backup WordPress beserta database dan dotfiles yang sesuai. Simpan pasangan code release public/private terdahulu, config aktual secara privat, dump database website dedicated, dan snapshot folder `visitiga-data` di tempat privat. Verifikasi restore dengan copy staging. Ukur ruang dan inode untuk semua copy. File ZIP dan dump tidak diunggah ke document root.

Jika gagal, hentikan promosi, rekam status, pindahkan traffic melalui mekanisme DirectAdmin yang sudah disetujui, dan pulihkan pasangan public/private. Pulihkan versi DB website dan media sebagai pasangan bila schema/data memang berubah. Jangan overwrite DB WordPress saat mengembalikan rilis PHP/MySQL. Restore backup WordPress hanya bila rollback kembali ke WordPress dan dengan database serta `.htaccess` yang sesuai. Pertahankan legacy apps, ACME, DNS, MX dan email sesuai konfigurasi yang disetujui.

Purge cache HTML/LiteSpeed/OPcache yang relevan. Uji HTTPS, canonical, status HTTP, auth, media dan legacy routing sebelum membuka traffic. Simpan backup database lama sampai window pemulihan berakhir.
