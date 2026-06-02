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

## Deploy InfinityFree Legacy

Ikuti panduan di [DEPLOY_INFINITYFREE.md](./DEPLOY_INFINITYFREE.md).
