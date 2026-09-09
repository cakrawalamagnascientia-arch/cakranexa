# PERSIAPAN GO-LIVE — CakraNexa (https://cakranexa.com)

Dokumen ini menjawab: **apa saja yang harus Anda siapkan** (kunci API, akun, data resmi) sebelum situs dipublikasikan, dan **auth login mana yang dipakai**.

---

## 1. Keputusan Autentikasi Admin: pakai yang sudah dibuat (server-side password)

**Rekomendasi: gunakan mekanisme login bawaan yang sudah saya buat.** Tidak perlu Supabase Auth untuk saat ini.

| | Login bawaan (sudah jadi) | Supabase Auth |
| :--- | :--- | :--- |
| Cara kerja | 1 password di env `ADMIN_PASSWORD`; server menerbitkan token sesi 12 jam; semua endpoint admin diproteksi | Akun email/password per admin, tabel `auth.users`, JWT Supabase |
| Cocok untuk | 1–3 orang admin redaksi dengan password bersama | Banyak admin dengan peran berbeda (editor, finance, super-admin), audit "siapa mengubah apa" |
| Setup tambahan | **Tidak ada** — cukup isi `ADMIN_PASSWORD` | Aktifkan Auth di Supabase, buat user, ubah middleware server untuk memverifikasi JWT, ubah RLS ke `auth.uid()` + tabel role |
| Keamanan | Password dibandingkan timing-safe, rate-limit 10x/15 menit, token hilang saat tab ditutup | Lebih lengkap (reset password, MFA) tapi lebih banyak konfigurasi |

**Pindah ke Supabase Auth hanya jika** nanti butuh >3 admin, pembagian peran, atau log aktivitas per orang. Strukturnya sudah disiapkan agar migrasi mudah: cukup ganti fungsi `isValidAdminToken()` di `server.ts` untuk memverifikasi JWT Supabase.

---

## 2. Akun & Kunci API yang Harus Disiapkan

### A. Wajib (situs tidak berfungsi penuh tanpa ini)

| # | Item | Dari mana | Dimasukkan ke | Keterangan |
| :-- | :--- | :--- | :--- | :--- |
| 1 | **`ADMIN_PASSWORD`** | Anda buat sendiri (min. 16 karakter acak) | Render → Environment | Tanpa ini `/admin` tidak bisa diakses sama sekali |
| 2 | **`SUPABASE_URL`** | Supabase → Project Settings → API → *Project URL* | Render (backend) | Contoh `https://abcd1234.supabase.co` |
| 3 | **`SUPABASE_SERVICE_ROLE_KEY`** | Supabase → Project Settings → API → *service_role* (secret) | Render (backend) **saja** | **JANGAN** pernah masuk ke Vercel / frontend |
| 4 | **`VITE_SUPABASE_URL`** + **`VITE_SUPABASE_ANON_KEY`** | Supabase → API → *anon public* | Vercel (frontend) | Hanya untuk fallback baca katalog; aman dipublikasikan |
| 5 | **`VITE_API_BASE_URL`** | URL Render Anda, mis. `https://cakranexa-api.onrender.com` | Vercel | Tanpa `/` di akhir |
| 6 | **`ALLOWED_ORIGINS`** | `https://cakranexa.com,https://www.cakranexa.com` | Render | Tambahkan domain preview Vercel jika perlu |
| 7 | **Jalankan SQL** | `schema.sql` lalu `src/db/shipping_and_payments_schema.sql` | Supabase → SQL Editor | Sekali saja. Seed 17 buku ikut terisi |

### B. Pembayaran online (Midtrans) — wajib jika ingin menerima VA/QRIS/e-wallet/kartu

| # | Item | Dari mana | Dimasukkan ke |
| :-- | :--- | :--- | :--- |
| 8 | **`MIDTRANS_SERVER_KEY`** | Midtrans Dashboard → Settings → Access Keys | Render **saja** |
| 9 | **`VITE_MIDTRANS_CLIENT_KEY`** | Sama (Client Key) | Vercel |
| 10 | **`MIDTRANS_IS_PRODUCTION`** | `false` saat sandbox (kunci `SB-…`), `true` saat live (`Mid-…`) | Render |
| 11 | **Payment Notification URL** | Midtrans → Settings → Configuration | Isi: `https://<render-url>/api/payment/midtrans-webhook` |
| 12 | Aktivasi metode | Midtrans → Settings → Snap Preferences | Centang BCA/Mandiri/BNI/BRI VA, QRIS, GoPay, ShopeePay, Kartu |

Persyaratan akun Midtrans produksi: akta/SK Kemenkumham PT, NIB, NPWP perusahaan, KTP direktur, rekening bank atas nama PT. Proses verifikasi biasanya 3–7 hari kerja — **urus lebih awal**.

> Tanpa Midtrans, situs tetap jalan dalam **mode simulasi** (label "Mode Simulasi" tampil) + transfer manual dengan upload bukti.

### C. Opsional (bisa menyusul setelah live)

| # | Item | Fungsi | Cara isi |
| :-- | :--- | :--- | :--- |
| 13 | **GA4 Measurement ID** (`G-XXXXXXXX`) | Statistik pengunjung | Google Analytics → Admin → Data Streams; masukkan via **Admin › SEO & Tracking** (tidak perlu env) |
| 14 | **Meta Pixel ID**, **GTM ID**, **Google Ads Conversion ID/Label** | Iklan & retargeting | Sama, via Admin › SEO & Tracking |
| 15 | **Google Search Console** | Indexing | Verifikasi domain (DNS TXT), submit `https://cakranexa.com/sitemap.xml` |
| 16 | **`RAJAONGKIR_API_KEY`** / Biteship | Ongkir real-time | Belum terintegrasi; saat ini tarif estimasi internal (bisa diedit di Admin › Pengiriman) |
| 17 | WhatsApp Business API / Fonnte / Wablas | Notifikasi WA otomatis ke admin & pembeli | Belum terintegrasi (saat ini tombol wa.me manual) |
| 18 | Resend / SMTP (mis. Brevo) | Email faktur otomatis | Belum terintegrasi |
| 19 | Domain & DNS | `cakranexa.com` → Vercel (A/CNAME), `api.cakranexa.com` → Render (CNAME) opsional | Registrar/Cloudflare |

---

## 3. Data Katalog — Status Setelah Pembaruan dari PDF

Katalog kini **persis 17 judul** dari `Judul_buku_Cakranexa.pdf` (4 judul lama yang tidak ada di PDF dihapus). Nama, sinopsis, penulis, penerbit, tahun (2026), dimensi (155 × 230 mm), ISBN, dan harga diambil apa adanya.

Yang **belum ada di PDF** dan masih perlu Anda lengkapi (lewat **Admin › Inventaris** atau langsung di Supabase tabel `books`):

| Kolom | Status | Tampilan saat kosong |
| :--- | :--- | :--- |
| **Harga** | 6 judul belum ada (Pajak Pertambangan, Jejak Audit PPN, Treaty Shopping, Actus Reus, Rekayasa Keuangan, Bukti & Pembuktian) | Kartu & detail: "Harga menyusul", tombol beli diganti "Segera Terbit / Beri tahu saya (WA)"; server menolak pemesanan |
| **ISBN** | 6 judul kosong, 4 judul "Dalam Pengajuan" | "ISBN menyusul" / "Dalam pengajuan" |
| **Jumlah halaman** | Semua belum ada (0) | Baris disembunyikan / "Menyusul" |
| **Cover buku** | Belum ada file | Siapkan `public/images/books/book-1.jpg … book-21.jpg` (ID tetap: 1,2,3,4,5,10–21) ukuran 800×1130 px; jika belum ada, cover SVG otomatis tampil |
| **Daftar isi** (`daftar_isi`, JSON array) | Kosong | Tab Daftar Isi: "akan segera ditambahkan" (bab dummy sudah dihapus) |
| **Tentang penulis** (`tentang_penulis`) | Kosong | Placeholder netral |
| **Rating / jumlah ulasan / stok** | Kosong (angka palsu 4.9 / 25 ulasan / 75 stok sudah dihapus) | Tidak ditampilkan; tab Review: "Belum ada ulasan" |
| **Berat (gram)** | Default 500 g | Dipakai kalkulasi ongkir — isi berat nyata per judul |

---

## 4. Data Dummy Lain yang Masih Harus Diganti (di luar katalog)

Semua ini bisa diisi dari **Admin › CMS / Pembayaran / Pengiriman** tanpa ubah kode:

1. **Rekening bank** (`paymentService.ts` & tabel `admin_bank_accounts`): nomor Mandiri/BCA/BNI/BSI saat ini **fiktif** — ganti dengan rekening resmi PT.
2. **QRIS**: NMID `ID1020240988172` fiktif; unggah gambar QRIS resmi ke `public/images/payment/qris-cakranexa.png`.
3. **Legalitas perusahaan** (Tentang Kami › Legalitas): SK Kemenkumham, NIB, NPWP, keanggotaan IKAPI — saat ini kosong, isi di CMS.
4. **Alamat & telepon kantor**: "Gedung Graha Scientia Lt. 4, Jl. Salemba Raya No. 18" dan `+62 21 3912 8841` adalah contoh — ganti; juga `mapsEmbedUrl` ke tautan Google Maps kantor sebenarnya.
5. **Tim redaksi / dewan editor** (nama, gelar, afiliasi, foto) — contoh, ganti.
6. **Jurnal** (ISSN, peringkat SINTA) — contoh, hapus atau ganti dengan jurnal yang benar-benar dikelola.
7. **Paket harga penerbitan, workshop/pelatihan, lowongan karir, artikel blog** — semuanya konten contoh.
8. **Hero banner** (`public/images/banners/`) dan **logo** (`public/images/logo/`) — lihat `GAMBAR_DAN_ASSETS.md` untuk ukuran.
9. **Tarif ongkir default** (Admin › Pengiriman) — sesuaikan dengan kontrak ekspedisi Anda.
10. **Analitik dashboard admin**: sekarang dihitung 100 % dari pesanan nyata (angka Rp 45 juta / 342 buku / 12.850 pengunjung palsu sudah dihapus). Trafik akan 0 sampai GA4 dihubungkan.

---

## 5. Urutan Eksekusi yang Disarankan

1. Supabase: buat project → jalankan 2 file SQL → salin URL + 2 kunci.
2. Render: deploy `server.ts` (Build `npm install && npm run build`, Start `npm start`) → isi env A + B.
3. Vercel: deploy (framework Vite) → isi env `VITE_*` → hubungkan domain `cakranexa.com`.
4. Buka `https://cakranexa.com/admin` → login → lengkapi data bagian 3 & 4.
5. Midtrans sandbox → uji checkout end-to-end (pesanan berubah `pending → paid` lewat webhook) → ajukan produksi.
6. Google Search Console: submit sitemap.
7. Ganti kunci Midtrans ke produksi, set `MIDTRANS_IS_PRODUCTION=true`.
