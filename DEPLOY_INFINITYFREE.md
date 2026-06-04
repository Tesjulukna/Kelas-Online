# Deploy Ke InfinityFree

Panduan ini membuat data CRUD kelas, akun member, login, dan bantuan mentor tersimpan di MySQL InfinityFree.

Domain production:

```text
https://ibnucreative.rf.gd
```

Route halaman:
- Homepage: `https://ibnucreative.rf.gd/`
- Login: `https://ibnucreative.rf.gd/login`
- Member: `https://ibnucreative.rf.gd/member`
- Admin: `https://ibnucreative.rf.gd/admin`

## 1. Buat Database

Di panel InfinityFree:
1. Buka menu `MySQL Databases`.
2. Buat database baru.
3. Catat `MySQL Hostname`, `Database Name`, `Username`, dan `Password`.

## 2. Isi Konfigurasi API

Buka file `public/api/config.php`, lalu ganti bagian ini sesuai data database InfinityFree:

```php
'db_host' => 'sqlXXX.infinityfree.com',
'db_name' => 'if0_XXXXXXX_ibnucreative',
'db_user' => 'if0_XXXXXXX',
'db_pass' => 'ISI_PASSWORD_DATABASE',
```

Data database ini bukan nama domain. Ambil nilainya dari panel InfinityFree di menu `MySQL Databases`.

Sebelum deploy pertama, ganti juga password awal admin:

```php
'allow_install' => true,
'install_secret' => 'isi-secret-install-yang-panjang',
'default_admin_username' => 'admin',
'default_admin_password' => 'ganti-password-kuat',
'default_member_password' => 'ganti-password-member',
```

Password admin minimal 12 karakter dan tidak boleh memakai `admin123`.
Password member awal minimal 8 karakter dan tidak boleh memakai `member123`.

## 3. Build Website

Jalankan:

```bash
npm run build
```

## 4. Upload Ke Hosting

Upload semua isi folder `dist/` ke folder `htdocs` di InfinityFree.

Pastikan yang diupload adalah isi `dist`, bukan folder `dist`-nya.
Pastikan file `.htaccess` di dalam `dist/` juga ikut terupload. File ini yang membuat URL seperti `/login`, `/member`, dan `/admin` tetap terbuka saat direfresh atau dibuka langsung.

## 5. Jalankan Installer

Buka di browser:

```text
https://ibnucreative.rf.gd/api/install.php?secret=isi-secret-install-yang-panjang
```

Jika berhasil, database akan membuat tabel:
- `accounts`
- `classes`
- `materials`
- `material_assets`
- `support_tickets`
- `auth_sessions`
- `login_attempts`

Installer akan membuat akun admin dari `default_admin_username` dan `default_admin_password` jika akun itu belum ada.
Kalau website sudah pernah diinstall, tetap jalankan installer sekali setelah upload versi ini karena installer akan menambahkan kolom `avatar`, kolom video upload pada `materials`, tabel `material_assets`, tabel `auth_sessions`, tabel `login_attempts`, dan tabel `member_progress` tanpa menghapus data lama.
Installer juga membuat folder `htdocs/uploads/videos` dan file proteksi `.htaccess` untuk menyimpan video materi.

Catatan keamanan: installer tidak akan mengganti password admin lama kecuali kamu mengaktifkan:

```php
'install_reset_admin_password' => true,
```

Nyalakan opsi ini hanya sebentar saat benar-benar perlu reset password admin, lalu matikan lagi.

## 6. Matikan Installer

Setelah install berhasil, buka lagi `public/api/config.php`, ubah:

```php
'allow_install' => false,
'install_secret' => '',
'install_reset_admin_password' => false,
```

Lalu upload ulang file hasil build atau minimal upload ulang `api/config.php` ke `htdocs/api/config.php`.

## 7. Login

Login admin memakai username dan password yang kamu set di `config.php`.
Setelah upload versi baru dan menjalankan installer, logout dari semua tab lalu login ulang agar browser mendapat token session baru.

Setelah masuk admin, kamu bisa:
- Tambah, edit, hapus kelas.
- Tambah materi YouTube/Shorts atau upload video materi ke hosting.
- Tambah tugas materi, gambar referensi, dan prompt yang bisa dicopy member.
- Tambah, edit, hapus member.
- Balas dan hapus bantuan mentor.
- Member yang dibuat admin bisa login memakai username/password tersebut.
- Foto profil dan gambar prompt disimpan di MySQL sebagai data gambar.
- File video disimpan di `htdocs/uploads/videos` dan hanya diputar lewat `api/video.php` setelah member login.

## 8. Webhook Lynk.id

Kode website sudah menyiapkan endpoint:

```text
https://domain-anda.com/api/lynk-webhook.php
```

Kalau Lynk.id tidak mengirim Merchant Key di header/body, pakai URL dengan secret:

```text
https://domain-anda.com/api/lynk-webhook.php?secret=MERCHANT_KEY_LYNK_ID
```

Isi Merchant Key yang sama di `public/api/config.php`:

```php
'lynk_webhook_secret' => 'MERCHANT_KEY_LYNK_ID',
'site_login_url' => 'https://domain-anda.com/login',
'lynk_send_credentials_email' => true,
'lynk_email_from' => 'no-reply@domain-anda.com',
```

Di dashboard admin, isi `Kode produk Lynk.id` pada kelas. Nilainya dicocokkan dengan ID, slug, atau nama produk dari payload Lynk.id. Jika cocok, webhook akan membuat atau memperbarui akun member, memberi akses kelas, dan mengirim email login memakai fungsi `mail()` bawaan hosting.

Jika hosting belum mendukung `mail()`, akun dan akses tetap dibuat, tetapi `emailSent` pada respons webhook akan bernilai `false`.

Jika upload video gagal, biasanya penyebabnya batas upload hosting. Coba pakai MP4 H.264 yang sudah dikompres, lalu sesuaikan `max_video_upload_mb` di `api/config.php` agar tidak lebih besar dari limit `upload_max_filesize` dan `post_max_size` hosting.

## Catatan

Untuk development lokal tetap pakai:

```bash
npm run dev
```

Untuk production InfinityFree, data tidak lagi memakai `data/data.json`. Data akan tersimpan di MySQL.

Video yang diputar di browser tidak bisa dibuat 100% anti-download atau anti-screen-record. Versi ini sudah memakai proteksi session, memblokir akses langsung folder upload, mematikan tombol download bawaan browser, dan menampilkan watermark nama member di player. Untuk proteksi DRM penuh perlu layanan video khusus seperti Vimeo DRM, Bunny Stream DRM, atau platform sejenis.
