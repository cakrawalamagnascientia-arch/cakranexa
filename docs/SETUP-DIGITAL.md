# Setup Produk Digital (Fase 2)

Panduan env dan setelan dashboard untuk e-book & audiobook: pembelian satuan, akses terlindungi, reader, dan player.
Dokumen ini disimpan di repo agar tidak hilang di catatan chat. Perbarui bila env atau alur berubah.

> **Status implementasi:** langkah 1–7 selesai: pemrosesan aset, checkout Midtrans, akses/sesi/perangkat, reader, player,
> Pustaka Saya, tab admin "Entitlement & Akses" dan "Anomali", serta deteksi anomali per jam.
> Langkah 8–9 menyusul (penyempurnaan i18n/noindex, tes menyeluruh). Migration produksi baru dijalankan setelah tes langkah 9 hijau.
>
> **Fase 3 (keanggotaan berbayar):** migration, env, cron, dan Midtrans Subscriptions ada di [`docs/SETUP-KEANGGOTAAN.md`](SETUP-KEANGGOTAAN.md).

---

## 1. Arsitektur singkat

| Komponen | Peran |
|---|---|
| **Vercel** | Frontend (SPA). Semua panggilan API diarahkan ke Render lewat `VITE_API_BASE_URL`. Endpoint digital di fungsi Vercel sengaja dimatikan (menjawab `503 use_primary_api`). |
| **Render** (Docker, Starter) | API Express (`server.ts`), ffmpeg + poppler untuk memproses file master, job latar (antrian pemrosesan; deteksi anomali per jam *(langkah 7)*). |
| **Supabase** (Pro) | Database, Auth (email + kata sandi), Storage privat `digital-assets`. |
| **Midtrans Snap** | Pembayaran. Notifikasi pembayaran (webhook) **harus** ke Render. |
| **Resend** | Email konfirmasi pembelian dan peringatan anomali *(langkah 7)*. |

Prinsip keamanan: file utuh (PDF/MP3) hanya ada di bucket privat dan hanya dibaca server. Browser tidak pernah
menerimanya. Setiap akses aset melewati backend yang memeriksa entitlement dan sesi. Service-role key hanya ada di Render.

---

## 2. Env di Render

| Env | Wajib | Contoh / nilai | Keterangan |
|---|---|---|---|
| `NODE_ENV` | ya | `production` | Sudah di `render.yaml`. |
| `SUPABASE_URL` | ya | `https://<ref>.supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | *(rahasia)* | **Hanya di Render.** Jangan pernah di Vercel atau di variabel `VITE_*`. |
| `SUPABASE_JWT_SECRET` | kondisional | *(rahasia)* | Hanya bila proyek masih menandatangani token dengan *Legacy JWT secret* (HS256). Proyek dengan *JWT signing keys* baru diverifikasi otomatis lewat JWKS, jadi boleh dikosongkan. |
| `VITE_SUPABASE_URL` | ya | sama dengan `SUPABASE_URL` | Dibakar ke frontend di image Docker (build arg). |
| `VITE_SUPABASE_ANON_KEY` | ya | *(anon / publishable key)* | Aman dipublikasikan (dilindungi RLS). |
| `VITE_MIDTRANS_CLIENT_KEY` | ya | `SB-Mid-client-…` (Sandbox) | Harus sepasang dengan server key (Sandbox dengan Sandbox). |
| `MIDTRANS_SERVER_KEY` | ya | `SB-Mid-server-…` (Sandbox) | Rahasia. |
| `MIDTRANS_IS_PRODUCTION` | ya | `false` selama uji Sandbox | `render.yaml` berisi `"true"`. **Ubah ke `false` di dashboard Render** selama memakai kunci Sandbox. |
| `SITE_URL` | ya | `https://www.cakranexa.com` | Dipakai untuk tautan di email dan URL kembali setelah pembayaran redirect. |
| `ALLOWED_ORIGINS` | ya | `https://cakranexa.com,https://www.cakranexa.com` | CORS, dipisah koma. `*.vercel.app` dan localhost sudah diizinkan otomatis. |
| `ADMIN_PASSWORD`, `ADMIN_API_KEY` | ya | *(rahasia)* | Login admin CMS. |
| `RESEND_API_KEY` | ya | *(rahasia)* | Tanpa ini email dilewati (hanya dicatat di log). |
| `EMAIL_FROM` | opsional | `CakraNexa <info@cakranexa.com>` | Domain pengirim harus terverifikasi di Resend. |
| `ORDER_NOTIFICATION_EMAILS` | opsional | daftar email dipisah koma | Penerima notifikasi pesanan dan peringatan anomali *(langkah 7)*. |
| `ACCESS_TOKEN_SECRET` | ya | dibuat otomatis oleh blueprint | Rahasia HMAC token media (playlist/segmen/kunci audio). Jangan diganti saat ada pembaca aktif, karena token lama langsung tidak sah. |
| `CRON_SECRET` | ya | dibuat otomatis oleh blueprint | Melindungi `POST /api/internal/cron` (header `Authorization: Bearer <CRON_SECRET>`) untuk penjadwal eksternal opsional. Deteksi anomali sudah berjalan tiap jam di proses server; kosongkan untuk menonaktifkan endpoint. |
| `DIGITAL_ASSETS_BUCKET` | opsional | `digital-assets` | Bucket **privat** untuk master, halaman hasil render, dan HLS. |
| `DIGITAL_ENABLED` | ya | `false` sampai peluncuran | Flag fitur digital (bagian 2a). |
| `DIGITAL_BETA_EMAILS` | opsional | `anda@contoh.com,penguji@contoh.com` | Email penguji: tetap bisa memakai fitur digital saat flag `false`; pesanannya ditandai pesanan uji. |
| `DIGITAL_SAMPLES_BUCKET` | opsional | `digital-samples` | Bucket publik untuk file sampel (fase 1). |
| `INSTITUTION_INQUIRY_EMAILS` | opsional | | Penerima formulir institusi (fase 1). |
| `FFMPEG_PATH`, `PDFTOPPM_PATH`, `PDFTOTEXT_PATH` | tidak | | Sudah terpasang di image Docker; hanya perlu di mesin lokal. |
| `DIGITAL_WORK_DIR` | tidak | | Folder kerja sementara pemrosesan (default: folder tmp OS). |

**Hanya untuk pengembangan lokal** (tidak pernah aktif di Render/Vercel):
- `DIGITAL_LOCAL_DEV=1`: store memori + folder lokal, tanpa Supabase.
- `DIGITAL_LOCAL_STORAGE_DIR`: lokasi folder aset lokal.

Setiap kali mengubah `VITE_*` di Render, **deploy ulang**, karena nilainya dibakar saat build image.

---

## 2a. Flag fitur & pengujian di produksi

Fase 2 diuji langsung di produksi, tanpa staging. Pengamannya:

- **`DIGITAL_ENABLED=false`** (default): situs tampil seperti fase 1.
  - **Tetap tampil:** menu Digital, daftar/detail/sampel e-book dan audiobook, `/membership`, `/institutions`, pemilih format di halaman buku, dan ikon format di kartu buku.
  - **Diganti placeholder "Segera hadir":** tombol beli dan tombol masuk di Pustaka Saya.
  - **Dialihkan:** `/digital/checkout` ke daftar e-book, dan `/library/read|listen/*` ke Pustaka Saya.
  - Endpoint pembeli digital menjawab `404 digital_disabled`. Checkout buku cetak tidak berubah.
- **`DIGITAL_BETA_EMAILS`**:
  - Email penguji tetap bisa membeli, membaca, dan mendengarkan walaupun flag `false`.
  - Caranya: masuk lewat `https://www.cakranexa.com/account/login` (halaman akun tidak terkena flag); setelah itu tombol beli aktif.
- **Status flag dibaca frontend dari `GET /api/digital/status`.** Mengubah flag cukup di env Render lalu deploy ulang Render; Vercel tidak perlu di-build ulang.
- **Pesanan uji.** Pesanan dari email beta ditandai `is_test = true` dan tidak dihitung di ringkasan penjualan admin (Admin → Produk Digital → *Penjualan digital*).
  - Tombol **Hapus pesanan uji** menghapus semua pesanan uji beserta hak aksesnya.
  - Pembayaran uji di produksi memakai uang sungguhan. Lakukan refund di dashboard Midtrans **sebelum** menghapus, karena tombol ini tidak membatalkan transaksi Midtrans.
- **Tidak terkena flag:** admin, webhook Midtrans, dan pemrosesan file master. Katalog bisa disiapkan sebelum peluncuran.
- **Peluncuran:** set `DIGITAL_ENABLED=true` di Render, lalu deploy ulang.

---

## 3. Env di Vercel

| Env | Wajib | Contoh | Keterangan |
|---|---|---|---|
| `VITE_API_BASE_URL` | ya | `https://<API-Render>` (tanpa `/` di akhir) | Tanpa ini frontend memanggil fungsi Vercel dan fitur digital menjawab 503. Semua API, termasuk checkout buku cetak, ikut lewat Render (satu sumber data pesanan). |
| `VITE_SUPABASE_URL` | ya | `https://<ref>.supabase.co` | |
| `VITE_SUPABASE_ANON_KEY` | ya | *(anon / publishable key)* | |
| `VITE_MIDTRANS_CLIENT_KEY` | ya | `SB-Mid-client-…` (Sandbox) | Pasangan dari `MIDTRANS_SERVER_KEY` di Render. |

Semua `VITE_*` dibakar saat build. Setelah mengubahnya, lakukan **Redeploy** di Vercel.
Jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` atau `MIDTRANS_SERVER_KEY` dalam variabel berawalan `VITE_`.

---

## 4. Midtrans (mulai dari Sandbox)

### 4.1 Kunci
Dashboard Sandbox → **Settings → Access Keys**:
- **Server Key** → `MIDTRANS_SERVER_KEY` di Render.
- **Client Key** → `VITE_MIDTRANS_CLIENT_KEY` di Vercel **dan** Render.
- `MIDTRANS_IS_PRODUCTION=false` di Render.

### 4.2 Notification URL (webhook)
Dashboard Sandbox → **Settings → Payment** → kolom **Payment Notification URL**:

```
https://cakranexa.onrender.com/api/payment/midtrans-webhook
```

- Pada 13-09-2026 domain ini terverifikasi sebagai API yang dipanggil frontend live `https://www.cakranexa.com` (nilai `VITE_API_BASE_URL`).
- Isi URL yang sama di dashboard **Sandbox** dan **Production**; keduanya punya setelan terpisah.
- **Kunci server harus sepasang dengan dashboard pengirim.** Notifikasi Sandbox ditandatangani dengan server key Sandbox. Bila Render memakai kunci production, notifikasi Sandbox ditolak 403.
- Server live tetap dalam mode production. **Jangan mengganti server live ke Sandbox**, karena checkout buku cetak pelanggan ikut menjadi transaksi uji. Fase 2 diuji langsung di produksi di balik flag (bagian 2a). Sandbox baru dipakai untuk fase 3 lewat server lokal + ngrok.
- Satu URL untuk **buku cetak dan produk digital**. Pesanan berawalan `DIG-` diteruskan ke modul digital; alur buku cetak tidak berubah.
- **Jangan** arahkan ke domain Vercel. Fungsi Vercel membalas 503 untuk pesanan `DIG-`, sehingga hak akses tidak pernah dibuat.
- **Finish Redirect URL** tidak wajib untuk digital. Setiap pesanan digital mengirim `callbacks.finish` sendiri
  (`<SITE_URL>/digital/checkout?order=<nomor>`), yang dipakai bila pembayaran berlangsung lewat halaman redirect
  (mis. aplikasi e-wallet di ponsel).

### 4.3 Perilaku webhook
Handler hanya menunggu operasi database, lalu langsung membalas. Email konfirmasi dikirim di latar. Midtrans bisa
mengirim notifikasi yang sama berkali-kali atau bersamaan; hasilnya tetap satu entitlement per produk dan satu email.

| Kondisi | Balasan | Efek |
|---|---|---|
| Signature tidak valid | 403 | Diabaikan. |
| `order_id` `DIG-…` tidak dikenal | 404 | — |
| Nominal berbeda dengan pesanan | 400 | Dicatat di log error. |
| `settlement` / `capture` (fraud `accept`) | 200 | Pesanan `paid`; entitlement dibuat (idempoten); email konfirmasi sekali. |
| `pending`, `capture` + `challenge`, `deny`, `cancel`, `expire` | 200 | Status pesanan diperbarui. Pesanan `paid`/`refunded` tidak diturunkan. |
| `refund`, `partial_refund`, `chargeback`, `partial_chargeback` | 200 | Semua entitlement pesanan dicabut dan sesi baca/dengar diakhiri. |
| Error database/server | 500 | Midtrans mengirim ulang; aman diproses ulang. |

Bila pengiriman email gagal, klaim email dilepas agar notifikasi berikutnya untuk pesanan itu mencoba lagi. Karena
Midtrans tidak mengirim ulang setelah menerima 200, email bisa saja tidak terkirim. Pembeli tetap bisa membuka produknya
dari Pustaka Saya.

### 4.4 Pindah ke Production
1. Dashboard **Production** → Access Keys → isi `MIDTRANS_SERVER_KEY` (Render) dan `VITE_MIDTRANS_CLIENT_KEY` (Render + Vercel) dengan kunci production (tanpa awalan `SB-`).
2. `MIDTRANS_IS_PRODUCTION=true` di Render.
3. Isi Payment Notification URL yang **sama** di dashboard Production.
4. Deploy ulang Render **dan** Vercel, karena client key dibakar saat build.
5. Entitlement dari transaksi uji Sandbox tetap ada di database. Cabut lewat admin *(langkah 7)* bila perlu. Tidak ada penghapusan otomatis.

---

## 5. Supabase

### 5.1 Migration (manual, tidak otomatis)
Ikuti [DEPLOY-SUPABASE.md](DEPLOY-SUPABASE.md):

1. Jalankan kueri pemeriksaan `src/db/check_schema.sql` (hanya membaca).
2. Jalankan migration yang belum lengkap, berurutan. Fase 2 = `src/db/digital_phase2_migration.sql`: tabel pesanan digital, entitlement, perangkat, sesi, log akses, progres, catatan, anomali, fungsi pencarian dan deteksi anomali, kebijakan RLS, serta bucket privat `digital-assets`.
3. Jalankan ulang pemeriksaan sampai semua baris `ada = true`.

### 5.2 Storage
- `digital-assets` harus **Private** (Public: off). Jangan tambahkan policy untuk `anon`/`authenticated`; hanya server (service role) yang membaca/menulis.
- `digital-samples` tetap publik (sampel fase 1).

### 5.3 Auth
- **Authentication → Sign In / Providers → Email**: aktif, **Confirm email: ON**.
- **Authentication → URL Configuration**:
  - **Site URL**: `https://www.cakranexa.com` (domain utama; `cakranexa.com` dialihkan ke www)
  - **Redirect URLs**:
    - `https://cakranexa.com/**`
    - `https://www.cakranexa.com/**`, bila domain www dipakai
    - `http://localhost:3000/**`, untuk pengembangan lokal
    - domain preview Vercel, bila ingin menguji login di preview
- **SMTP**: pengirim email bawaan Supabase dibatasi ketat dan hanya untuk uji. Untuk produksi, gunakan SMTP Resend di
  **Authentication → Emails → SMTP Settings**:
  - Host `smtp.resend.com`
  - Port `465`
  - Username `resend`
  - Password = API key Resend
  - Pengirim dari domain yang terverifikasi
- *(Opsional)* Terjemahkan template email konfirmasi dan atur ulang kata sandi ke bahasa Indonesia.

### 5.4 Kunci
- **Project Settings → API Keys**:
  - anon/publishable key → `VITE_SUPABASE_ANON_KEY` (Vercel + Render)
  - service_role/secret key → `SUPABASE_SERVICE_ROLE_KEY` (**Render saja**)
- **Project Settings → JWT Keys**:
  - Bila token masih ditandatangani *Legacy JWT secret*, salin ke `SUPABASE_JWT_SECRET`.
  - Bila sudah memakai signing keys asimetris, biarkan kosong; server memakai JWKS.

---

## 6. Render

- **Blueprint** `render.yaml`:
  - `runtime: docker`, `plan: starter`, `region: singapore`, `healthCheckPath: /api/health`
  - `Dockerfile` memasang `ffmpeg`, `poppler-utils`, dan font DejaVu (watermark)
  - `Dockerfile` mendeklarasikan `ARG VITE_*`, yang diisi Render dari env layanan saat build
- **Pemeriksaan start:** di Render, server menolak start bila Supabase belum di-set, tidak terhubung, atau skemanya belum lengkap. Deploy ditandai gagal dan versi sebelumnya tetap berjalan; log menyebut migration yang kurang. Lihat [DEPLOY-SUPABASE.md](DEPLOY-SUPABASE.md) bagian 6.
- Setelah deploy, cek `GET https://<API-Render>/api/health`. Hasil yang diharapkan:
  - `supabaseConnected: true` dan `supabaseSchemaReady: true`
  - `digitalStore: "supabase"`
  - `processingTools` bernilai `true` semua (runtime Docker)
  - `midtransEnabled: true`
  - `midtransMode: "sandbox"` selama uji
- Log start yang benar memuat `📚 Produk digital fase 2 aktif (penyimpanan: supabase)`.
- Plan harus **Starter** (selalu hidup). Pada 13-09-2026, `/api/health` butuh ±23 detik untuk menjawab. Ini kemungkinan
  tanda layanan tidur (cold start) seperti di plan gratis. Akibatnya notifikasi Midtrans bisa timeout dan baru masuk saat
  dikirim ulang, dan job latar tidak berjalan selama layanan tidur.

---

## 7. Checklist uji ujung-ke-ujung (produksi, email beta)

1. Migration dijalankan; `digital-assets` privat.
2. Env Render dan Vercel terisi (`DIGITAL_ENABLED=false`, `DIGITAL_BETA_EMAILS` berisi email penguji), lalu keduanya di-deploy ulang. Pengunjung biasa tetap melihat katalog digital, tetapi tombol beli berlabel "Segera hadir".
3. `/api/health` sesuai bagian 6.
4. Admin → Produk Digital: set e-book **Tersedia** dengan harga > 0. Di panel **File master**, unggah PDF dan tunggu status **Siap**.
5. Dengan email yang ada di `DIGITAL_BETA_EMAILS`: daftar di `/account/register`, konfirmasi lewat email, lalu masuk. Menu Digital muncul.
6. Buka e-book → **Beli E-Book** → centang lisensi → bayar. Ini pembayaran sungguhan; gunakan produk berharga kecil.
7. Halaman status berganti ke "Pembayaran diterima" dan email konfirmasi masuk.
8. Supabase → `digital_orders` berstatus `paid`; `entitlements` berisi 1 baris `source = purchase`.
9. *(Langkah 5–7)* Buka dari Pustaka Saya → reader; coba perangkat ketiga (harus ditolak) dan pembukaan di dua perangkat (dialog ambil-alih).
10. Selesai menguji:
    1. Refund pembayaran uji di dashboard Midtrans.
    2. Admin → Produk Digital → **Hapus pesanan uji**.
11. Peluncuran: `DIGITAL_ENABLED=true` di Render, lalu deploy ulang.

---

## 8. Catatan operasional

- **Hapus produk digital** yang sudah dimiliki pembeli ditolak (`409 has_entitlements`). Nonaktifkan produknya saja; pemilik tetap bisa membuka.
- **Perangkat**:
  - Dihitung per pengguna. Batasnya adalah nilai `max_devices` tertinggi di antara entitlement yang sedang berlaku (default 2).
  - Pengguna boleh melepas 1 perangkat per 30 hari; admin tanpa jeda *(langkah 7)*.
  - Menghapus data situs di browser membuat ID perangkat baru.
- **Sesi**:
  - Satu sesi aktif per pengguna per produk. Heartbeat tiap 30 detik; tanpa heartbeat 2 menit, sesi berakhir.
  - Membuka di perangkat lain memunculkan dialog ambil-alih.
- **Rate limit per pengguna per menit**:

  | Endpoint | Batas |
  |---|---|
  | halaman e-book *(langkah 5)* | 120 |
  | segmen audio *(langkah 6)* | 60 |
  | pencarian *(langkah 5)* | 30 |
  | mulai sesi | 20 |
  | heartbeat | 10 |
  | perangkat | 20 |
  | pustaka | 60 |

  Pelanggaran menjawab `429 rate_limited` dan dicatat di `access_logs`.
- **Kode penolakan akses** (403) untuk frontend:

  | Kode | Arah UI |
  |---|---|
  | `no_entitlement` | Pembelian (bila `product.purchasable`) atau `/membership` |
  | `expired` | Perpanjang atau beli |
  | `suspended` | Hubungi kami |

---

## 9. Ringkasan endpoint fase 2

| Endpoint | Keterangan |
|---|---|
| `POST /api/payment/midtrans-webhook` | Webhook Midtrans (cetak + digital) |
| `POST /api/digital/checkout` | Buat pesanan + token Snap (login, lisensi, idempotency key) |
| `GET /api/digital/orders`, `GET /api/digital/orders/:nomor` | Riwayat/status pesanan milik pengguna |
| `POST /api/access/:produk/session/start` | Mulai sesi (`{ deviceId, takeover? }`) → 201 / 403 alasan / 403 `device_limit` / 409 `session_conflict` |
| `POST /api/access/:produk/session/heartbeat` | Header `X-Session-Token` |
| `POST /api/access/:produk/session/end` | Token di header atau body `text/plain` (sendBeacon); selalu 204 |
| `GET /api/devices?current=<id>`, `POST /api/devices/:id/release` | Perangkat saya dan pelepasan |
| `GET /api/library` | Pustaka Saya: produk, status akses, progres |
| `/api/admin/digital/processing/*` | Admin: unggah master, status, proses ulang, bab |
