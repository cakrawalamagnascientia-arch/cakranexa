# CHANGELOG PERBAIKAN — Audit Kode CakraNexa (v1.1.0)

Tanggal audit: 6 September 2026
Lingkup: seluruh repositori (`server.ts`, `schema.sql`, `src/**`, konfigurasi, dokumentasi).

---

## 1. Ringkasan Eksekutif

Kode awal adalah prototipe yang secara visual lengkap, tetapi **belum aman dan belum konsisten untuk produksi**:

| Kategori | Jumlah temuan | Status |
| :--- | :---: | :--- |
| Keamanan kritis | 7 | ✅ Diperbaiki |
| Bug fungsional / deployment | 8 | ✅ Diperbaiki |
| Inkonsistensi data & konfigurasi | 12 | ✅ Diperbaiki |
| Fitur yang masih perlu dikerjakan | 5 | ⏳ Lihat bagian 6 |

---

## 2. Masalah Keamanan Kritis (semua sudah diperbaiki)

| # | Masalah | Dampak | Perbaikan |
| :-- | :--- | :--- | :--- |
| K1 | **Portal Admin tanpa login.** Tombol "Admin Portal" di Navbar/Footer membuka dashboard penuh. | Siapa pun melihat PII pelanggan, mengubah katalog/CMS. | `AdminLoginGate.tsx` membungkus `AdminDashboard`. Password diverifikasi server (`ADMIN_PASSWORD`), token sesi 12 jam di `sessionStorage`. |
| K2 | **Endpoint tulis API publik** (`POST/DELETE /api/books`, `GET /api/orders`, `PATCH /api/orders/:id`, `POST /api/seo`, `POST /api/site-content`). | Katalog bisa dihapus; situs bisa diubah dari luar. | Middleware `requireAdmin` (Bearer token / `X-Admin-Key`). Rate-limit login 10x/15 menit, `timingSafeEqual`. |
| K3 | **RLS bocor**: `orders FOR SELECT USING (true)`. | Seluruh data pelanggan terbaca via anon key. | Policy dihapus; `orders`/`order_items` hanya bisa diakses service role (server). |
| K4 | **CORS default allow** semua origin + `credentials: true`. | CSRF lintas domain. | Whitelist `ALLOWED_ORIGINS` + `*.vercel.app` + localhost; origin lain ditolak 403. |
| K5 | **Webhook Midtrans tanpa verifikasi signature** dan tidak menulis ke DB. | Pesanan bisa ditandai lunas oleh siapa pun. | Verifikasi SHA-512 (`order_id+status_code+gross_amount+ServerKey`), mapping status resmi, update Supabase. |
| K6 | **Total pesanan dipercaya dari klien**; stok tidak berkurang. | Manipulasi harga; overselling. | Server menghitung ulang dari harga katalog, cek stok, RPC `decrement_book_stock`. |
| K7 | Kunci Midtrans/Supabase server bisa terbaca via `NEXT_PUBLIC_*`; anon key dipakai sebagai fallback service key di server. | Kebocoran hak akses. | Server hanya membaca `SUPABASE_SERVICE_ROLE_KEY`; `.env.example` dipisah tegas frontend/backend. |

---

## 3. Bug Fungsional & Deployment (sudah diperbaiki)

| # | Masalah | Perbaikan |
| :-- | :--- | :--- |
| F1 | `PORT = 3000` hardcoded → gagal di Render/Cloud Run. | `Number(process.env.PORT) \|\| 3000`. |
| F2 | **Tidak ada routing URL.** Refresh `/katalog/<slug>` selalu ke beranda; sitemap mengiklankan URL yang tidak bisa dibuka. Folder `src/app/*` (Next.js) adalah kode mati. | `src/utils/router.ts` — sinkron state ↔ URL via History API, dukung back/forward, `?kategori=`, `?q=`. `src/app/` dihapus. |
| F3 | Tabel `seo_settings` & `site_content` dipakai server tapi tidak ada di `schema.sql`. | Ditambahkan (singleton `id=1`) + kolom buku yang dipakai kode (`original_harga`, `daftar_isi`, `is_best_seller`, …), constraint status, trigger `updated_at`. |
| F4 | `fetch('/api/seo')`, `fetch('/api/site-content')` relatif → rusak saat frontend Vercel + API Render. | Semua lewat `apiClient` dengan `API_BASE_URL` tunggal. |
| F5 | Pesanan ditulis **dua kali** (browser→Supabase, lalu Express→Supabase). | Satu jalur: `POST /api/orders`. |
| F6 | Setelah checkout pelanggan **diarahkan ke halaman Admin**. | Dihapus; tampil halaman sukses. |
| F7 | CRUD buku dari Admin hanya ke `localStorage`; upsert server melewatkan `badge/rating/stock/berat`. | `apiClient.saveBook/deleteBook` dipanggil dari `App.tsx`; `bookToRow` lengkap. |
| F8 | `paymentStatus: 'success'` (bukan anggota `OrderStatus`); `createdAt` string lokal tidak terurut; `GET /api/books/:id` hanya cek memory; sitemap pakai seed statis. | `'paid'`; ISO timestamp + `formatOrderDate()`; `loadBooks()` dari Supabase; sitemap dari katalog aktual. |

---

## 4. Inkonsistensi yang Diseragamkan

- **Kontak resmi** (sebelumnya 3 nomor WA, 4 email, 3 domain) → `+62 812 8899 2341`, `redaksi@ / finance@ / hrd@cakranexa.com`, `https://cakranexa.com`. `NotificationService` membaca kontak dari *Pengaturan Pembayaran*, bukan hardcoded.
- **`tahunTerbit: 2026`** di-hardcode di 8+ tempat → dihapus; nilai dari data.
- **Data 21 buku** diduplikasi di `server.ts` → server mengimpor `src/data/booksData.ts`.
- **Nomor order** dua format → `CNX-YYYYMM-XXXXXX` (`utils/orderUtils.ts`), kompatibel aturan `order_id` Midtrans.
- **ID GA palsu** `G-CKRNX2024` → kosong (diisi lewat Admin › SEO).
- Teks "Seluruh 21 buku" → dinamis `books.length`.
- `src/types.ts` + `src/types/index.ts` ganda → satu file `src/types.ts`.
- `tailwind.config.js` (diabaikan Tailwind v4), `src/assets/*.jpg` (566 KB, tidak dipakai), `@google/genai`, `bun.lock` (kadaluarsa) → dihapus.
- `package.json` `react-example` → `cakranexa`; dev-deps dipisah; `cross-env` untuk `npm start`; `engines.node >= 20`.
- `tsconfig.json`: `types: [node, vite/client]`, alias `@/*` → `./src/*` (sebelumnya root).
- `vite.config.ts`: proxy `/api` untuk `npm run dev:client`, code-splitting (react/recharts/pdf/motion).
- `vercel.json`: rewrite SPA tidak menimpa `sitemap.xml`, `robots.txt`, aset; cache immutable untuk `/assets`.
- Favicon 566 KB → `public/favicon.png` 64 px + `logo-square-512.png`.
- `metadata.json` nama "Remix Remix Remix Remix …" → dirapikan.
- README: React 18 → 19, tabel endpoint + kolom akses, skema & RLS, env, referensi `GAMBAR_DAN_ASSETS.md` (nama file sebelumnya salah). DEPLOY: env Render (tambah `ADMIN_PASSWORD`, `SITE_URL`, hapus `PORT`), langkah webhook Midtrans.

---

## 5. File Baru

| File | Fungsi |
| :--- | :--- |
| `src/components/AdminLoginGate.tsx` | Gerbang login admin (UI + verifikasi token). Mode "Preview Lokal" hanya saat `vite` dev tanpa backend. |
| `src/services/adminAuth.ts` | Simpan/hapus token sesi admin. |
| `src/services/midtransSnap.ts` | Memuat Snap.js (`VITE_MIDTRANS_CLIENT_KEY`) & membuka popup pembayaran. |
| `src/utils/router.ts` | Parser & builder URL, `pushRoute()`. |
| `src/utils/orderUtils.ts` | Nomor order, ID, ISO timestamp, format tanggal, VA simulasi. |

---

## 6. Pekerjaan Lanjutan Sebelum Go-Live

1. **Jalankan `npm install && npm run lint && npm run build`** secara lokal — lingkungan audit tidak memiliki akses jaringan, sehingga pemeriksaan tipe penuh belum dijalankan (sintaks seluruh file sudah diverifikasi bersih).
2. **Isi `ADMIN_PASSWORD`** (wajib) dan **`MIDTRANS_SERVER_KEY`** + `VITE_MIDTRANS_CLIENT_KEY`. Tanpa server key, checkout berjalan dalam mode simulasi berlabel jelas; status "lunas" dari simulasi **hanya lokal** — status final di produksi ditentukan webhook.
3. **Ongkir & rekening bank** masih tersimpan di `localStorage` meski tabel `shipping_methods`/`admin_bank_accounts`/`payment_settings` sudah ada — perlu endpoint `GET/POST /api/shipping-methods` dan `/api/payment-settings` agar pengaturan admin berlaku untuk semua pelanggan.
4. **Notifikasi WA/email masih simulasi** (hanya log di browser). Perlu integrasi server-side: Fonnte/Wablas/WhatsApp Business API dan Resend/SMTP, dipicu dari `POST /api/orders` & webhook.
5. **Tarif ongkir** adalah estimasi internal; integrasi RajaOngkir/Biteship di `POST /api/shipping/calculate` bila ingin tarif nyata.
6. Data `SEED_ADMIN_ORDERS` (pesanan dummy) masih dimuat sebagai riwayat awal di Admin — hapus atau ganti dengan `apiClient.getOrders()` saat DB sudah terisi.
7. Jalankan `schema.sql` lalu `src/db/shipping_and_payments_schema.sql` di Supabase SQL Editor. **Perhatian:** `schema.sql` berisi `DROP TABLE` — komentari jika DB sudah berisi data produksi.

---

## 7. Pembaruan Katalog dari `Judul_buku_Cakranexa.pdf` (v1.2.0)

- `src/data/booksData.ts` ditulis ulang: **17 judul persis** dari PDF (nama, sinopsis penuh, penulis, penerbit, tahun 2026, dimensi 155 × 230 mm, ISBN, harga). ID `book-6…9` (judul yang tidak ada di PDF) dihapus; ID lain dipertahankan.
- `schema.sql` seed digenerate ulang dari data yang sama (17 baris); kolom `rating/reviews_count/stock` tidak lagi punya default palsu.
- UI grid card & detail: harga `0` → "Harga menyusul" + tombol "Beri tahu saya (WA)"; ISBN kosong → "menyusul"; halaman `0` disembunyikan; rating/ulasan/stok palsu, 5 bab daftar isi dummy, dan 2 testimoni fiktif dihapus. Keranjang & server menolak buku tanpa harga.
- Ticker Best Seller hanya menampilkan buku yang bisa dipesan; urut ISBN terbit → ulasan nyata.
- Dashboard analitik: semua angka (pendapatan, unit, kategori, best seller, grafik) dihitung dari pesanan nyata; seed pesanan/feedback/kalender dihapus; admin memuat pesanan dari server saat login.
- Domain/email diseragamkan penuh ke `cakranexa.com` (sisa `cakrawalamagna.co.id` di Kontak, Footer, CMS dibersihkan).
- Dokumen baru **`PERSIAPAN_GO_LIVE.md`**: daftar kunci API, keputusan auth, dan inventaris data dummy yang tersisa.
