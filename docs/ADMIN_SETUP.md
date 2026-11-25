# Setup dan pemulihan admin

Akun lama Supabase perlu dibuat ulang. Gunakan akun individual dan password unik 14–72 byte. Tool lokal menghasilkan SQL dengan hash, sehingga password asli tidak perlu dikirim ke phpMyAdmin atau disimpan di file. Buka PowerShell pada mesin tepercaya dan ganti email placeholder.

```powershell
$secret = Read-Host 'Password admin' -AsSecureString
$handle = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($handle) |
    php server/qwords/tools/admin-sql.php 'ADMIN_EMAIL'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($handle)
  Remove-Variable secret,handle
}
```

Jalankan INSERT yang dihasilkan melalui tab SQL phpMyAdmin pada database khusus. Tutup session dan bersihkan clipboard/temp SQL bila digunakan. Buka `/admin/login` di origin HTTPS, tes login, logout, reload dan akun disabled. Seluruh sesi berakhir setelah 30 menit idle atau 12 jam mutlak. Heartbeat berasal dari interaksi pengguna, sehingga polling tidak memperpanjang sesi.

Untuk recovery ulangi generator dengan opsi `--recover` setelah email. Jalankan UPDATE hanya melalui phpMyAdmin setelah pemilik akun diverifikasi. Perubahan menaikkan `session_version` dan memutus sesi lama. Untuk menonaktifkan akun, operator mengubah role menjadi `disabled` dan menaikkan versi sesi. CLI ini tinggal di luar web root.
