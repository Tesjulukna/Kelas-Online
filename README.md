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
