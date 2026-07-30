# Kelas Online IbnuCreative

Website kelas online berbasis React + Vite dengan dashboard member dan admin.

Domain production: `https://ibnucreative.rf.gd`

Route utama:
- `/`
- `/login`
- `/member`
- `/admin`

Fitur utama:
- Homepage, login, dashboard member, dan dashboard admin.
- Admin CRUD kelas, materi YouTube/Shorts atau upload video, member, dan tiket bantuan mentor.
- Admin bisa menambahkan gambar referensi dan prompt pada materi.
- Member bisa membuka kelas, mengirim tugas, copy prompt, preview/download gambar, dan melihat balasan mentor.
- Member bisa melihat `Kelas Tersedia` untuk kelas yang belum diakses; kelas gratis langsung terbuka, kelas berbayar checkout via Tripay.
- Webhook Lynk.id siap membuat akun member otomatis setelah pembayaran sukses.
- Backend lokal untuk development memakai Vite middleware.
- Backend production untuk Vercel memakai Node serverless functions di `api/` dan Supabase.
- Backend legacy untuk InfinityFree memakai PHP + MySQL di `public/api`.

## Development

```bash
npm install
npm run dev
```

Login lokal mengikuti data di `data/data.json`:
- Admin: `admin` / `admin123`
- Member: `member` / `member123`

## Build

```bash
npm run build
```

Folder hasil build ada di `dist/`.

## Deploy Vercel + Supabase

Ikuti panduan di [DEPLOY_VERCEL_SUPABASE.md](./DEPLOY_VERCEL_SUPABASE.md).

### Login Google

Login Google memakai Supabase Auth sebagai penyedia OAuth, lalu website tetap membuat session member sendiri di tabel `auth_sessions`.

Setelah deploy, aktifkan Google provider di Supabase:

- Buka Supabase Dashboard > Authentication > Providers > Google.
- Isi Google Client ID dan Client Secret dari Google Cloud Console.
- Tambahkan redirect URL website: `https://domain-anda.com/auth/google/callback`.
- Di Google Cloud Console, masukkan redirect URL Supabase OAuth Callback yang ditampilkan di halaman provider Google Supabase.

Environment opsional di Vercel:

```bash
GOOGLE_AUTH_REDIRECT_URL=https://domain-anda.com/auth/google/callback
```

Jika env ini dikosongkan, website otomatis memakai domain request saat ini dengan path `/auth/google/callback`.

## Deploy InfinityFree Legacy

Ikuti panduan di [DEPLOY_INFINITYFREE.md](./DEPLOY_INFINITYFREE.md).

### PayPal Live (backend PHP)

Checkout PayPal memakai Orders API v2 dan mengubah harga rupiah menjadi USD di server. Simpan
credential berikut sebagai environment variable hosting, jangan di source code:

```bash
PAYPAL_CLIENT_ID=client-id-live
PAYPAL_CLIENT_SECRET=client-secret-live
PAYPAL_WEBHOOK_ID=webhook-id-live
PAYPAL_IS_PRODUCTION=true
PAYPAL_CURRENCY=USD
PAYPAL_IDR_PER_USD=16500
PAYPAL_BRAND_NAME=IbnuCreative
PAYPAL_RETURN_URL=https://domain-anda.com/api/paypal-return.php
PAYPAL_CANCEL_URL=https://domain-anda.com/?payment=cancelled
```

Daftarkan listener Live `https://domain-anda.com/api/paypal-webhook.php` pada REST App yang sama.
Event yang direkomendasikan:

- `CHECKOUT.ORDER.APPROVED`
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.PENDING`
- `PAYMENT.CAPTURE.DECLINED` atau `PAYMENT.CAPTURE.DENIED` jika tersedia
- `PAYMENT.CAPTURE.REFUNDED`
- `PAYMENT.CAPTURE.REVERSED`
- `CHECKOUT.PAYMENT-APPROVAL.REVERSED` jika tersedia

PayPal baru muncul di pilihan pembayaran setelah Client ID, Client Secret, Webhook ID, dan kurs
rupiah per USD semuanya tersedia. Jalankan installer database saat deploy; endpoint PayPal juga
akan mencoba membuat tabelnya otomatis bila user database memiliki izin DDL.
