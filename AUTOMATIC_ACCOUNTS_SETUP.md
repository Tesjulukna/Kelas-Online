# Produk Akun Otomatis: nama dan token login

Di Tambah/Edit Produk, pilih **Produk Akun Otomatis**. Pilih Spreadsheet dan tab token, atau isi nama baru lalu tekan **Tambah Tab Baru**. Setiap produk menggunakan tab terpisah. Bagian Platform tetap bisa memuat link website tujuan dan nama link. Masa berlaku diisi dalam hari; `0` berarti tanpa batas waktu. Nama memakai nama pembeli dari checkout atau profil member.

Tab otomatis berisi kolom A-H:

```text
id | name | token | status | order_id | buyer_email | created_at | expires_at
```

Tab stok akun manual memakai format A-F yang berbeda. Tombol Tambah Tab Baru menyiapkan header sesuai jenis produk. Memilih tab yang formatnya salah ditolak. Setelah token pernah dibuat untuk sebuah produk, jenis produk dan sumber tabnya tidak bisa diganti agar riwayat pembeli tetap terhubung.

## Setelah pembayaran sukses

1. Callback pembayaran terverifikasi membuat token acak 256 bit (64 karakter hex), dengan nama pembeli. Token disimpan terenkripsi di database dalam transaksi yang sama dengan akses produk.
2. Website meminta GAS mencatat token pada tab produk. ID pesanan memastikan retry tidak membuat akun kedua; kode token tidak berubah saat callback diulang.
3. Setelah GAS mengonfirmasi registrasi, email dikirim berisi nama, token login, link website, dan masa berlaku jika ada. Pembeli juga dapat menyalin token lewat halaman akses member.
4. Jika GAS belum tersedia, token tersimpan menunggu registrasi dan email belum dikirim. Worker/cron yang sudah dikonfigurasi mencoba kembali. Akun otomatis tidak mengurangi stok akun manual; satu pembelian ulang menghasilkan satu token baru.

Daftar token tampil di Tambah/Edit Produk: preview 5 akun, Lihat Semua, pencarian, filter, dan pagination 20/50. Data pesanan/token dibuat sistem; untuk menonaktifkan login, ubah kolom `status` di Spreadsheet menjadi `disabled`. Status aktif adalah `active`. Maksimal 10.000 akun per tab pada script ini.

## Mengaktifkan GAS terbaru

Salin ulang [Code.gs](integrations/google-apps-script/Code.gs), simpan, lalu **Deploy → Manage deployments → Edit → New version → Deploy**. URL /exec tetap memakai deployment yang sama. Konfigurasi WEBSITE_SHARED_SECRET, ALLOWED_SPREADSHEET_IDS, URL GAS, dan kunci hosting mengikuti [panduan utama](ACCOUNT_PRODUCTS_SETUP.md).

## Login website tujuan nanti

Backend website tujuan memanggil URL /exec GAS dengan POST JSON berikut:

```json
{
  "action": "validate_token",
  "secret": "KUNCI_KONEKSI_DARI_ENV_SERVER",
  "spreadsheetId": "ID_SPREADSHEET",
  "tab": "Token Website A",
  "token": "TOKEN_YANG_DIISI_PEMBELI"
}
```

ID Spreadsheet dan tab dipasang di konfigurasi backend website tujuan, bukan mengikuti input browser. Website A harus selalu mengecek tab A; website B mengecek tab B. GAS menolak token yang tidak ditemukan, tidak aktif, muncul lebih dari sekali, atau sudah kedaluwarsa.

Respons token sah:

```json
{"ok":true,"data":{"valid":true,"accountId":"auto-...","name":"Nama Pembeli","expiresAt":null}}
```

Token tidak sah: `{"ok":true,"data":{"valid":false}}`. Koneksi/configuration failure menghasilkan `ok:false`; keduanya tidak boleh menghasilkan sesi login. Backend website tujuan harus membuat session cookie HttpOnly setelah validasi berhasil, membatasi percobaan login, dan memeriksa ulang validitas saat sesi diperpanjang. Jangan kirim secret GAS ke browser atau menaruh token dalam URL. Sheet tetap privat; akses Web App Anyone diproteksi oleh secret yang diperiksa script.

Contoh PHP server tersedia di [token-login-example.php](integrations/google-apps-script/token-login-example.php). Ini contoh validasi untuk website tujuan, bukan halaman login yang sudah dipasang. Login website tujuan baru tersambung setelah backend website tersebut memakai protokol ini.

Referensi: [GAS Web Apps](https://developers.google.com/apps-script/guides/web), [pengelolaan tab Spreadsheet](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet), [ContentService JSON dan redirect](https://developers.google.com/apps-script/guides/content).
