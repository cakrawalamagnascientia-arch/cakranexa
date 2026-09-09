# PANDUAN LENGKAP DEPLOYMENT & PENYEMPURNAAN DI VS CODE
## PT CAKRAWALA MAGNA SCIENTIA (CakraNexa)

Panduan ini berisi instruksi langkah demi langkah yang terperinci untuk mendeploy website e-commerce dan portal penerbitan CakraNexa ke platform cloud (**Vercel** dan **Render**), menghubungkannya dengan database cloud (**Supabase**), serta panduan langkah-langkah yang perlu disempurnakan di **Visual Studio Code (VS Code)** saat Anda mengunduh/membuka repositori ini di komputer lokal.

---

## 📑 Daftar Isi
1. [Panduan Integrasi Database Supabase (PostgreSQL)](#1-panduan-integrasi-database-supabase-postgresql)
2. [Panduan Deploy ke Vercel (Frontend & Serverless)](#2-panduan-deploy-ke-vercel)
3. [Panduan Deploy ke Render (Node.js Web Service)](#3-panduan-deploy-ke-render)
4. [Daftar Variabel Lingkungan (.env) Lengkap](#4-daftar-variabel-lingkungan-env-lengkap)
5. [Daftar Item yang Perlu Disempurnakan di VS Code Lokal](#5-daftar-item-yang-perlu-disempurnakan-di-vs-code-lokal)

---

## 1. Panduan Integrasi Database Supabase (PostgreSQL)

Supabase digunakan sebagai database cloud PostgreSQL untuk menyimpan data katalog 21 buku, pesanan pembeli (*orders*), konfigurasi CMS, dan pengaturan SEO secara persisten dan aman.

### Langkah-langkah Setup Supabase:

1. **Buat Akun & Project Baru di Supabase**:
   - Kunjungi [https://supabase.com](https://supabase.com) dan login/signup.
   - Klik **New Project**, pilih organisasi Anda, beri nama project (misal: `cakranexa-db`), buat password database yang kuat, dan pilih region terdekat (misal: `Singapore (ap-southeast-1)`).

2. **Eksekusi Skrip SQL Database (`schema.sql`)**:
   - Di dashboard Supabase, buka menu **SQL Editor** di sidebar kiri.
   - Klik **New Query**.
   - Buka file `schema.sql` dari project ini, salin seluruh kodenya, dan paste ke SQL Editor Supabase.
   - Klik tombol **Run** (Ctrl+Enter).
   - Skrip ini akan membuat tabel-tabel berikut:
     * `books`: Menyimpan 21 buku awal dan covernya.
     * `orders`: Menyimpan transaksi pembelian.
     * `order_items`: Menyimpan rincian item buku dalam setiap transaksi.
     * `site_content`: Menyimpan pengaturan dinamis CMS (Hero, Best Seller, Menu, Footer).
     * `seo_settings`: Menyimpan konfigurasi SEO dan Tracking ID.

3. **Ambil Kredensial API Supabase**:
   - Masuk ke menu **Project Settings** -> **API**.
   - Salin nilai:
     * **Project URL** (contoh: `https://xyzcompany.supabase.co`)
     * **anon public key** (kunci untuk frontend)
     * **service_role secret key** (kunci privat untuk backend server)

---

## 2. Panduan Deploy ke Vercel

Vercel sangat ideal untuk hosting frontend SPA yang super cepat dengan jaringan CDN global edge.

### Langkah Deploy ke Vercel:

1. **Push Proyek ke GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit cakranexa platform"
   git branch -M main
   git remote add origin https://github.com/username/cakranexa-platform.git
   git push -u origin main
   ```

2. **Import Project di Vercel**:
   - Buka [https://vercel.com](https://vercel.com) dan login dengan akun GitHub Anda.
   - Klik **Add New** -> **Project** -> pilih repositori `cakranexa-platform`.
   - Pilih Framework Preset: **Vite**.
   - Root Directory: `./` (default).

3. **Konfigurasi Environment Variables di Vercel**:
   Di bagian **Environment Variables**, tambahkan variabel berikut:

   | Key | Value Contoh |
   | :--- | :--- |
   | `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsIn...` |
   | `VITE_API_BASE_URL` | `https://api-cakranexa.onrender.com` (atau URL backend Render Anda) |
   | `VITE_MIDTRANS_CLIENT_KEY` | `SB-Mid-client-xxxxxxxxxxxxxxxx` |

4. **Deploy**:
   - Klik **Deploy**.
   - Tunggu 1-2 menit hingga proses build selesai. Website Anda akan langsung online di domain `https://cakranexa.vercel.app`.
   - Anda dapat menghubungkan domain custom (misal: `cakranexa.com` atau `cakranexa.com`) di menu **Settings -> Domains**.

---

## 3. Panduan Deploy ke Render (Backend API Service)

Render digunakan untuk menjalankan server Express backend (`server.ts`) yang menangani proxy Midtrans, kalkulator ongkir kurir, webhook pembayaran, dan REST API.

### Langkah Deploy ke Render:

1. **Buka Dashboard Render**:
   - Kunjungi [https://render.com](https://render.com) dan login.
   - Klik tombol **New +** -> pilih **Web Service**.
   - Hubungkan repositori GitHub `cakranexa-platform`.

2. **Pengaturan Web Service di Render**:
   - **Name**: `cakranexa-api`
   - **Language**: `Node`
   - **Region**: `Singapore` (agar latensi rendah ke Indonesia)
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` atau `Starter` ($7/bulan)

3. **Tambahkan Environment Variables di Render**:
   Di tab **Environment Variables**, masukkan:

   ```env
   NODE_ENV=production
   SITE_URL=https://cakranexa.com
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsIn...
   ADMIN_PASSWORD=<password-kuat-untuk-portal-admin>
   MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxxxxx
   MIDTRANS_IS_PRODUCTION=false
   ALLOWED_ORIGINS=https://cakranexa.vercel.app,https://cakranexa.com
   ```
   > Jangan set `PORT` di Render — Render menyuntikkannya otomatis dan server sudah membaca `process.env.PORT`.
   ```env
   ```

4. **Deploy Service**:
   - Klik **Create Web Service**.
   - Render akan mem-build dan menjalankan server. Anda akan mendapatkan URL endpoint seperti `https://cakranexa-api.onrender.com`.
   - Masukkan URL ini ke variabel `VITE_API_BASE_URL` di Vercel (tanpa garis miring di akhir).
   - Di dashboard Midtrans → Settings → Configuration, isi **Payment Notification URL** dengan `https://cakranexa-api.onrender.com/api/payment/midtrans-webhook`.

---

## 4. Daftar Variabel Lingkungan (.env) Lengkap

Simpan file `.env` di root project Anda dengan struktur berikut:

```env
# =============================================================================
# FRONTEND CONFIGURATION (Client-Side)
# =============================================================================
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_API_BASE_URL=http://localhost:3000
VITE_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxxxxxx

# =============================================================================
# BACKEND API & SECRETS CONFIGURATION (Server-Side)
# =============================================================================
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://cakranexa.vercel.app

# Supabase Admin Secret Key (Jangan dibagikan ke publik)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Midtrans Payment Gateway
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxxxxxx
MIDTRANS_IS_PRODUCTION=false

# Kontak & Notifikasi Admin
ADMIN_WA_NUMBER=+6281288992341
ADMIN_EMAIL=redaksi@cakranexa.com
```

---

## 5. Daftar Item yang Perlu Disempurnakan di VS Code Lokal

Setelah Anda mengunduh project ini ke komputer lokal dan membukanya di VS Code, berikut adalah checklist hal-hal yang perlu Anda lengkapi dengan data resmi perusahaan:

### Checklist Penyempurnaan di VS Code:

- [ ] **1. Kredensial Midtrans Payment Gateway Asli**:
  * Daftar akun merchant di [https://midtrans.com](https://midtrans.com).
  * Masuk ke **Settings -> Access Keys**.
  * Ganti `MIDTRANS_SERVER_KEY` dan `MIDTRANS_CLIENT_KEY` di `.env` dari mode Sandbox (`SB-...`) ke mode Production (`Mid-...`).
  * Set `MIDTRANS_IS_PRODUCTION=true` saat siap menerima pembayaran uang asli.
  * Di dashboard Midtrans, masukkan URL Webhook: `https://api.domainanda.com/api/payment/midtrans-webhook`.

- [ ] **2. Nomor Rekening Bank & QRIS Perusahaan**:
  * Buka portal `/admin` -> tab **Pengaturan Pembayaran & Bank**.
  * Masukkan nomor rekening resmi Bank Mandiri / BCA atas nama PT Cakrawala Magna Scientia.
  * Unggah gambar kode QRIS resmi perusahaan di folder `/public/images/payment/qris-cakranexa.png`.

- [ ] **3. Nomor WhatsApp & Email Admin untuk Notifikasi Order**:
  * Masukkan nomor WhatsApp admin operasional yang aktif (format internasional: `+6281...`) di `ADMIN_WA_NUMBER`.
  * Pastikan format template pesan WhatsApp di `src/services/NotificationService.ts` sudah sesuai dengan format sapaan resmi kantor redaksi Anda.

- [ ] **4. Ganti Gambar Placeholder dengan Cover Buku Asli**:
  * Ikuti panduan di file `GAMBAR_DAN_ASSETS.md`.
  * Masukkan file cover 21 buku ke `/public/images/books/` dengan resolusi `600x900 px` format `.webp`.

- [ ] **5. Masukkan ID Digital Marketing & Tracking Resmi**:
  * Buka portal `/admin` -> tab **SEO & Tracking**.
  * Masukkan **Meta Pixel ID** (dari Facebook Events Manager).
  * Masukkan **GA4 Measurement ID** (dari Google Analytics 4, contoh: `G-XXXXXXXXXX`).
  * Masukkan **Google Tag Manager ID** (contoh: `GTM-XXXXXXX`).
  * Masukkan **Google Ads Conversion ID & Label** jika menjalankan kampanye Google Ads.

- [ ] **6. Pasang Domain Custom & SSL**:
  * Hubungkan domain resmi Anda (misal: `cakranexa.com`) di dashboard DNS registrar Anda (Rumahweb, Niagahoster, Cloudflare, dll) mengarah ke CNAME Vercel / Render.
  * Pastikan sertifikat SSL (HTTPS) aktif secara otomatis.

---
*PT CAKRAWALA MAGNA SCIENTIA (CakraNexa) — Panduan Operasional & Teknis Produksi*
