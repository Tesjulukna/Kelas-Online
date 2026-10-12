# Produk Akun dari Google Spreadsheet

Fitur ini memakai backend PHP + MySQL pada hosting Domainesia. Tambah Produk → Jenis produk → **Produk Akun**. Spreadsheet menjadi sumber input stok; database website mengendalikan reservasi dan penjualan. Satu checkout berisi satu akun. Produk akun tidak masuk bonus kelas atau bundling.

## Konfigurasi server sekali saja

1. Di Google Cloud, aktifkan **Google Sheets API**, buat **Service Account**, lalu unduh kunci JSON.
2. Simpan JSON **di luar `public_html`**, contoh `/home/USER/private/google-sheets.json`. Jangan simpan di repository atau upload lewat form produk.
3. Tambahkan dua entri ke array konfigurasi `public_html/api/config.php` di hosting:

   ```php
   'google_sheets_credentials_file' => '/home/USER/private/google-sheets.json',
   'account_stock_key' => 'KUNCI_ACAK_HEX_64_KARAKTER',
   ```

   Alternatif: environment `GOOGLE_SHEETS_CREDENTIALS_FILE` dan `ACCOUNT_STOCK_KEY`.
   Buat kunci acak di terminal hosting dengan `php -r 'echo bin2hex(random_bytes(32));'`. Simpan kunci itu dengan aman; menggantinya membuat stok yang sudah dienkripsi tidak dapat dibuka. Backup database tidak menyertakan kunci ini.
4. Pastikan PHP memiliki OpenSSL, cURL, dan PDO MySQL. User database harus dapat membuat tabel. Tabel stok dibuat otomatis pada akses backend.
5. Konfigurasi email Resend yang sudah digunakan website (`resend_api_key`, `resend_from_email`) tetap diperlukan. Callback Tripay harus aktif.
6. Tambahkan cron setiap 5 menit:

   ```text
   */5 * * * * /usr/local/bin/php /home/USER/public_html/api/account-stock-worker.php
   ```

   Sesuaikan path PHP dan nama user dengan hosting. Worker melepaskan reservasi yang kedaluwarsa dan mencoba kembali email/pembaruan Sheet yang gagal. File worker hanya bisa dijalankan melalui CLI.

## Spreadsheet privat

Bagikan Spreadsheet sebagai **Editor** ke `client_email` pada JSON service account. Tidak perlu Publish to web atau akses siapa saja.

Impor [template CSV](public/templates/account-stock.csv) ke tab pilihan. Kolom A–F harus berurutan:

| id | username | password | status | order_id | buyer_email |
| --- | --- | --- | --- | --- | --- |
| akun-001 | email/username akun | password akun | available | | |

- Format kolom sebagai **Plain text** supaya nol di depan dan simbol password tidak berubah.
- `id` dan `username` harus unik. Jangan mengganti ID akun yang sudah diimpor.
- Status input: `available`/`tersedia`, `disabled`/`nonaktif`, atau `sold`/`terjual`. Contoh template dinonaktifkan; ganti dengan akun nyata dan status `available`.
- `order_id` dan `buyer_email` kosong untuk akun siap jual. Website mengisi keduanya saat akun terjual.
- Setiap tab stok digunakan untuk satu produk. Setelah diimpor, sumber produk tidak dapat diganti. Buat produk baru untuk sumber lain.
- Maksimal 10.000 akun per tab. Jangan memindahkan atau mengurutkan baris saat website sedang memperbarui status penjualan.

## Menambahkan produk dan stok

1. Admin → Produk Digital → Tambah Produk → **Produk Akun**.
2. Tempel link Spreadsheet. Saat fokus berpindah dari kolom, tab otomatis dideteksi. Tombol **Deteksi Tab Spreadsheet** dapat dipakai untuk mencoba ulang.
3. Pilih tab stok dari daftar. Jika hanya ada satu tab data, tab tersebut otomatis dipilih.
4. Isi judul, thumbnail, harga, dan catatan penggunaan. Bagian **Platform** juga dapat diisi link produk dan nama file; link tersebut disertakan bersama akun di email dan halaman akses pembeli. Simpan produk: website mengimpor stok setelah produk tersimpan.
5. Untuk menambah atau memperbarui stok, edit Sheet, lalu buka Edit Produk → **Sinkronkan Stok Tersimpan**. Sinkronisasi memakai sumber terakhir yang sudah disimpan.

Jumlah stok dihitung dari akun yang dapat dipesan. Akun ditahan saat invoice dibuat agar tidak dipesan pembeli lain. Pembayaran sukses mengubahnya menjadi terjual; gagal/kedaluwarsa mengembalikannya ke stok. Sinkronisasi tidak akan mengaktifkan kembali akun yang sudah terjual, meskipun status di Sheet dikembalikan ke `available`.

## Pengiriman dan akses

Setelah callback pembayaran terverifikasi, akun dialokasikan secara berurutan dan kredensial dikirim melalui email. Callback yang berulang memakai akun yang sama. Username/password hanya disimpan terenkripsi, tidak masuk API katalog atau payload invoice. Detail akun di halaman akses memerlukan login member pembeli (admin juga dapat mengakses).

Produk akun dapat dibeli ulang. Di Produk Digital member terdapat tombol **Lihat Akun** untuk setiap pembelian. Pembeli tamu juga dibuatkan akun member oleh alur produk yang sudah ada. Email akun dan email kredensial member adalah dua email terpisah.

Jika Google atau email sedang bermasalah, penjualan tetap tersimpan; worker mencoba kembali pengiriman. Admin juga bisa menekan Sinkronkan Stok untuk mencoba lagi. Saat restore backup di website yang sama, stok akun lama dipertahankan supaya akun terjual tidak menjadi tersedia kembali. Untuk pindah server, bawa backup dan kunci enkripsinya.

## Pengujian

`npm run build`, `npm test`, dan `tests/php/account-stock.test.php` memeriksa impor 50 akun, stok 50 → 49, callback berulang, reservasi, rollback, akses pembeli, enkripsi, retry email, dan sinkronisasi ulang. Untuk menjalankan pengujian PHP melalui npm, tetapkan `PHP_TEST_BINARY` dan jika diperlukan `PHP_TEST_EXTENSION_DIR`; ekstensi `pdo_sqlite` diperlukan untuk database pengujian. Tes SQLite mengadaptasi sintaks lock MySQL, sehingga bukan bukti uji konkurensi InnoDB.

Sebelum penjualan nyata, lakukan satu pembayaran sandbox dengan Spreadsheet privat dan email percobaan. Kredensial Google/hosting tidak termasuk repository, sehingga uji koneksi Google dan pengiriman nyata dilakukan setelah konfigurasi server.

Referensi implementasi: [Google service account](https://developers.google.com/identity/protocols/oauth2/service-account), [daftar tab Spreadsheet](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get), [membaca nilai](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get), [memperbarui nilai](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update), dan [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
