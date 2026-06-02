# Deploy Vercel + Supabase

Project ini sekarang bisa jalan di Vercel dengan API Node serverless dan data di Supabase.

## 1. Buat Supabase project

1. Buka Supabase, buat project baru.
2. Masuk ke SQL Editor.
3. Jalankan isi file `supabase/schema.sql`.
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
```

Opsional:

```bash
LYNK_RESET_EXISTING_MEMBER_PASSWORD=false
LYNK_PRODUCT_CLASS_MAP={"kode-produk-lynk":["id-kelas"]}
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

Ganti password admin dari dashboard setelah deploy.

## 5. Webhook Lynk.id

URL webhook production:

```text
https://domain-vercel-anda.vercel.app/api/lynk-webhook
```

Endpoint ini akan membuat atau memperbarui member berdasarkan produk Lynk yang cocok dengan `Kode produk Lynk.id` di kelas.
