# Deploy Vercel + Supabase

Project ini sekarang bisa jalan di Vercel dengan API Node serverless dan data di Supabase.

## 1. Buat Supabase project

1. Buka Supabase, buat project baru.
2. Masuk ke SQL Editor.
3. Jalankan isi file `supabase/schema.sql`.
   Jalankan ulang file ini setiap ada update schema, misalnya untuk tabel keamanan `login_attempts`.
4. Buka Storage dan pastikan bucket berikut ada:
   - `ibnu-assets` public untuk gambar dan PDF.
   - `ibnu-videos` private untuk video materi.

Catatan: Supabase Free membatasi global upload file sampai 50 MB. Kalau video 80 MB ingin tetap dipakai, naikkan limit di Storage Settings atau ubah `MAX_VIDEO_UPLOAD_MB`.

## 2. Environment Vercel

Isi Environment Variables di Vercel:

```bash
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=isi_service_role_key
SUPABASE_PUBLIC_BUCKET=ibnu-assets
SUPABASE_VIDEO_BUCKET=ibnu-videos
MAX_VIDEO_UPLOAD_MB=50
LYNK_WEBHOOK_SECRET=isi_merchant_key_lynk
SITE_LOGIN_URL=https://domain-vercel-anda.vercel.app/login
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=IbnuCreative Academy <akses@domain-anda.com>
```

Opsional:

```bash
LYNK_RESET_EXISTING_MEMBER_PASSWORD=false
LYNK_PRODUCT_CLASS_MAP={"kode-produk-lynk":["id-kelas"]}
LYNK_SEND_CREDENTIALS_EMAIL=true
RESEND_REPLY_TO=support@domain-anda.com
```

## 3. Deploy ke Vercel

Build command:

```bash
npm run build
```

Output directory:

```bash
dist
```

Vercel akan membaca `api/*.js` sebagai serverless functions. File PHP lama di `public/api` sudah dikecualikan lewat `.vercelignore`.

## 4. Login awal

Setelah schema dijalankan:

- Admin: `admin` / `admin123`
- Member: `member` / `member123`

Ganti password admin dari dashboard setelah deploy, minimal 12 karakter.
Ganti atau nonaktifkan juga akun member contoh jika website sudah masuk production.

## 5. Webhook Lynk.id

URL webhook production:

```text
https://domain-vercel-anda.vercel.app/api/lynk-webhook
```

Endpoint ini akan membuat atau memperbarui member berdasarkan produk Lynk yang cocok dengan `Kode produk Lynk.id` di kelas.

## 6. Email otomatis Resend

1. Buat akun Resend dan verifikasi domain pengirim.
2. Buat API key dengan akses sending.
3. Isi `RESEND_API_KEY` dan `RESEND_FROM_EMAIL` di Vercel.
4. Redeploy Vercel.

`RESEND_FROM_EMAIL` harus memakai domain yang sudah terverifikasi di Resend, misalnya:

```bash
RESEND_FROM_EMAIL=IbnuCreative Academy <akses@domain-anda.com>
```

Kalau email gagal, webhook tetap membuat akun member dan response webhook akan berisi `emailError` untuk membantu debug.
