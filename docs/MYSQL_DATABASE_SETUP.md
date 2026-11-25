# Setup MySQL/MariaDB di DirectAdmin

1. Di dashboard DirectAdmin buka **Account Manager → MySQL Management**. Buat database baru menggunakan prefix akun, misalnya suffix `visitiga`. Pilih user khusus dan password acak. Jangan gunakan nama, user, atau database WordPress.
2. Buka phpMyAdmin untuk database baru. Di tab Import, jalankan `qwords-private/database/001_initial.sql` lalu `002_report_index.sql`. DDL MySQL dapat melakukan implicit commit. Jika langkah bermasalah, inspeksi objek/version dan pulihkan backup database khusus sebelum mencoba ulang.
3. Pastikan `SELECT version FROM schema_versions ORDER BY version` menampilkan 1 dan 2. Aplikasi memerlukan CRUD tabel website, akses read-only terhadap versi, dan SELECT/UPDATE tabel admin. Gunakan user instalasi terpisah bila panel mendukung grant per tabel. Runtime tidak perlu CREATE, DROP, FILE, SUPER, GRANT atau akses database lain. Jika panel hanya memberi akses tingkat database, pastikan user terbatas pada database dedicated dan mintakan grant minimum ke Qwords.
4. Di PHP Selector domain staging pilih PHP 8.4 (kode minimum 8.2). Aktifkan `pdo_mysql`, `fileinfo`, `session`, `openssl`, `dom`, `mbstring`, `json`, `libxml`; aktifkan `curl` hanya untuk DeepL. Set `display_errors=Off`. Konfirmasi versi MariaDB/MySQL, InnoDB dan utf8mb4. Local fixture menggunakan MariaDB 10.4.32. Runner CI disiapkan untuk MariaDB 10.11.
5. Salin private config example ke `qwords-private/config.php`. Isi host, port, nama, user dan password dari panel. Siapkan path sesi dan media permanen di luar semua document root. Isi `app_secret` acak dan key ekspor terpisah bila memakai API. Kedua nilai hanya pada config privat.
6. Isi data melalui prosedur [Migrasi Data](SUPABASE_DATA_MIGRATION.md). Buat admin dengan [Admin Setup](ADMIN_SETUP.md).

Jangan jalankan installer atau migrasi sebagai route HTTP. SQL dan CLI tools terdapat di bagian private dari artifact.
