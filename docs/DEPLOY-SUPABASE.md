# Menyambungkan Render ke Supabase (perbaikan produksi)

**Kondisi 13-09-2026:** `GET https://cakranexa.onrender.com/api/health` menjawab `supabaseConnected: false`.

Akibatnya:

- Semua fitur digital fase 2 menjawab `503 digital_unavailable`, dan belum ada data digital yang pernah tersimpan.
- Pesanan buku cetak hanya tersimpan di memori server dan hilang setiap Render restart.

**Setelah perbaikan ini:** server Render **menolak start** bila Supabase belum di-set, tidak dapat dihubungi, atau skemanya belum lengkap. Server tidak lagi diam-diam jatuh ke memori.

---

## Urutan singkat

1. `DIGITAL_ENABLED=false` di Render. *(Sudah Anda lakukan.)*
2. Cadangkan database (bagian 1).
3. Jalankan kueri pemeriksaan `src/db/check_schema.sql` (bagian 2).
4. Jalankan migration yang belum lengkap, berurutan (bagian 3).
5. Ulangi pemeriksaan sampai semua `ada = true` (bagian 4).
6. Isi env Render (bagian 5).
7. Deploy versi yang memuat pemeriksaan start, lalu cek `/api/health` (bagian 6).
8. Setelah health check menunjukkan `supabaseConnected: true` dan `supabaseSchemaReady: true`, baru migration fase 3 (bagian 8). Migration fase 3 harus dijalankan **sebelum** men-deploy kode fase 3.

---

## 1. Cadangan

- **Paket Pro:** Supabase → **Database → Backups**. Pastikan ada backup harian terbaru, atau aktifkan PITR.
- **Paket Free:** tidak ada backup otomatis. Ambil salinan dengan `pg_dump` memakai connection string dari **Project Settings → Database**:

  ```bash
  pg_dump "postgresql://postgres.<ref>:<password>@<host>:5432/postgres" --schema=public --no-owner -f cakranexa-backup.sql
  ```

  Minimal, ekspor CSV tabel `books`, `authors`, `book_authors`, `orders`, `order_items`, `site_content`, dan `seo_settings` dari **Table Editor**.

---

## 2. Periksa skema (hanya membaca)

1. Supabase → **SQL Editor** → **New query**.
2. Tempel seluruh isi [`src/db/check_schema.sql`](../src/db/check_schema.sql), lalu klik **Run**.
3. Hasilnya 41 baris dengan kolom `urutan`, `migration`, `object`, dan `ada`: 29 baris fase 1–2 (urutan 1–5) dan 12 baris fase 3 (urutan 6). Baris dengan `ada = false` menunjukkan migration yang belum dijalankan.

Kueri ini tidak mengubah apa pun dan aman dijalankan kapan saja.

---

## 3. Jalankan migration yang belum lengkap, berurutan

Jalankan **satu file per kueri**. Buka file di GitHub → **Raw** → salin semua → tempel di SQL Editor → **Run**. Hasil yang benar: *Success. No rows returned*. Bila muncul error, **berhenti** dan kirim pesan errornya; jangan lanjut ke file berikutnya.

| Urutan | File | Aman diulang? | Jalankan bila |
|---|---|---|---|
| 1 | `schema.sql` | **Tidak.** Isinya `CREATE TABLE` biasa dan data awal buku. | **Hanya bila `books` bernilai false.** Frontend live sudah membaca tabel `books`, jadi hampir pasti **dilewati**. Bila `books` ada tetapi tabel lain di urutan 1 false, jangan jalankan file ini; laporkan dulu. |
| 2 | `src/db/authors_schema.sql` | Ya | `authors` atau `book_authors` false |
| 3 | `src/db/i18n_content_migration.sql` | Ya | `books.i18n`, `authors.i18n`, atau `orders.language` false |
| 4 | `src/db/digital_products_migration.sql` (**fase 1**) | Ya | Ada baris urutan 4 yang false |
| 5 | `src/db/digital_phase2_migration.sql` (**fase 2**) | Ya | Ada baris urutan 5 yang false |
| 6 | `src/db/membership_phase3_migration.sql` (**fase 3**, keanggotaan) | Ya | Ada baris urutan 6 yang false. Jalankan sebelum men-deploy kode fase 3 (bagian 8). |

Semua file di urutan 2–5 memakai `IF NOT EXISTS` atau bentuk yang setara. Kelimanya sudah diuji di Postgres lokal: dijalankan berurutan, dijalankan ulang, lalu diperiksa dengan `check_schema.sql`.

**Jangan dijalankan sebagai bagian perbaikan ini:** migration data lain di `src/db/`, yaitu:

- `teologia_books_migration.sql`
- `book_authors_pdf_alignment_migration.sql`
- `author_reference_profiles_migration.sql`
- `publisher_scientia_integritas_migration.sql`
- `shipping_and_payments_schema.sql`
- `real_payment_accounts_migration.sql`

File-file ini mengubah atau menambah data dan bukan syarat server.

---

## 4. Verifikasi

- Jalankan ulang `check_schema.sql`. Semua baris harus `ada = true` (29 sebelum fase 3, 41 setelah migration fase 3).
- Di **Storage**, bucket `digital-assets` harus **Private** dan `digital-samples` **Public**.

---

## 5. Env Render (Dashboard → layanan `cakranexa` → Environment)

Buat nilai acak dengan:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variabel | Wajib | Contoh nilai | Catatan |
|---|---|---|---|
| `NODE_ENV` | ya | `production` | Sudah di `render.yaml`. |
| `SUPABASE_URL` | ya | `https://abcdefghijklmnopqrst.supabase.co` | Project Settings → API → Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…` atau `sb_secret_…` | **Rahasia, hanya di Render.** Jangan pernah di Vercel atau di variabel `VITE_*`. |
| `SUPABASE_JWT_SECRET` | kondisional | *(Legacy JWT secret)* | Isi hanya bila token masih ditandatangani HS256. Proyek dengan signing keys baru biarkan kosong (server memakai JWKS). |
| `VITE_SUPABASE_URL` | ya | sama dengan `SUPABASE_URL` | Dibakar ke frontend saat build Docker. |
| `VITE_SUPABASE_ANON_KEY` | ya | `eyJhbGciOi…` (anon) atau `sb_publishable_…` | Boleh publik (dilindungi RLS). Sama dengan di Vercel. |
| `VITE_MIDTRANS_CLIENT_KEY` | ya | *(Client Key produksi dari dashboard Midtrans → Settings → Access Keys)* | Sepasang dengan server key. |
| `MIDTRANS_SERVER_KEY` | ya | *(Server Key produksi dari dashboard Midtrans → Settings → Access Keys)* | Rahasia. |
| `MIDTRANS_IS_PRODUCTION` | ya | `true` | `false` hanya bila memakai kunci Sandbox. |
| `SITE_URL` | ya | `https://www.cakranexa.com` | Tautan di email dan URL kembali setelah pembayaran. |
| `ALLOWED_ORIGINS` | ya | `https://www.cakranexa.com,https://cakranexa.com` | CORS, dipisah koma. `*.vercel.app` dan localhost diizinkan otomatis. |
| `ADMIN_PASSWORD` | ya | *(kata sandi kuat, ≥16 karakter)* | Login admin CMS. |
| `ADMIN_API_KEY` | ya | `3f9c…` (64 karakter hex) | Rahasia. |
| `RESEND_API_KEY` | ya | *(API key dari dashboard Resend → API Keys)* | Tanpa ini email hanya dicatat di log. |
| `EMAIL_FROM` | opsional | `CakraNexa <info@cakranexa.com>` | Domain harus terverifikasi di Resend. |
| `ORDER_NOTIFICATION_EMAILS` | opsional | `info@cakranexa.com,admin@contoh.com` | Penerima notifikasi pesanan dan peringatan anomali. Kosong = daftar bawaan di kode. |
| `INSTITUTION_INQUIRY_EMAILS` | opsional | `institusi@contoh.com` | Kosong = sama dengan `ORDER_NOTIFICATION_EMAILS`. |
| `ACCESS_TOKEN_SECRET` | ya | *(64 karakter hex)* | Token media audio. **Jangan diganti** setelah ada pembaca; token lama langsung tidak sah. |
| `CRON_SECRET` | ya | *(64 karakter hex)* | Melindungi `POST /api/internal/cron`. |
| `DIGITAL_ASSETS_BUCKET` | opsional | `digital-assets` | Bucket privat (fase 2). |
| `DIGITAL_SAMPLES_BUCKET` | opsional | `digital-samples` | Bucket publik sampel (fase 1). |
| `DIGITAL_ENABLED` | ya | `false` | Tetap `false` sampai uji beta selesai. |
| `DIGITAL_BETA_EMAILS` | opsional | `anda@contoh.com,penguji@contoh.com` | Email penguji fitur digital saat flag `false`. |

**Jangan diisi:**

- `ALLOW_START_WITHOUT_SUPABASE`: hanya untuk darurat (lihat bagian 6).
- `DIGITAL_LOCAL_DEV`: tidak berlaku di Render.
- `PORT`, `RENDER`: diisi Render sendiri.
- `FFMPEG_PATH`, `PDFTOPPM_PATH`, `PDFTOTEXT_PATH`: sudah ada di image Docker.
- `VERCEL`.

Env fase 3 (`ENABLE_AUTODEBIT`, `PAYMENT_TOKEN_KEY`, `ENABLE_READER_DIGITAL_PICK`, `ENABLE_AUTHOR_GUILD_SHELF`, `ENABLE_MEMBER_PRINT_DISCOUNT`, `MEMBERSHIP_EXTENDED_BENEFITS`): lihat [`docs/SETUP-KEANGGOTAAN.md`](SETUP-KEANGGOTAAN.md) bagian 2. Semuanya boleh dibiarkan kosong (default mati).

Variabel `VITE_*` dibakar saat build, jadi perubahan nilainya memerlukan **build ulang** (Render melakukannya saat deploy).

---

## 6. Deploy dan verifikasi

1. Deploy commit yang memuat pemeriksaan start (`backend/startupChecks.ts`). Saat start di Render, server memeriksa bahwa `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` terisi, Supabase menjawab, dan seluruh skema di `check_schema.sql` ada.
2. **Jika gagal**, proses berhenti dan deploy ditandai gagal. Render tetap menjalankan versi sebelumnya. Log menyebut penyebabnya, misalnya:
   - `❌ Skema belum lengkap — jalankan src/db/digital_phase2_migration.sql (belum ada: entitlements, …)`
   - `❌ Supabase tidak dapat dihubungi: books: Invalid API key`
   - `❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set.`
   - `❌ Klien Supabase gagal dibuat (env sudah terisi): Node.js detected but native WebSocket not found. — jalankan Node 22 atau lebih baru.`
     `@supabase/supabase-js` 2.115 butuh Node 22+. Versi Node Render mengikuti `engines` di `package.json` (sekarang `22.x`). Bila di Environment Render ada `NODE_VERSION`, hapus atau ganti ke `22`, karena variabel itu menimpa `engines`.
3. **Jika berhasil**, log memuat `✅ Supabase terhubung, skema lengkap.` dan `📚 Produk digital fase 2 aktif (penyimpanan: supabase)`.
4. Periksa `GET https://cakranexa.onrender.com/api/health`. Hasil yang diharapkan:

   ```json
   {
     "status": "ok",
     "supabaseConnected": true,
     "supabaseSchemaReady": true,
     "digitalStore": "supabase",
     "processingTools": { "ffmpeg": true, "pdftoppm": true, "pdftotext": true },
     "midtransEnabled": true,
     "midtransMode": "production"
   }
   ```

   - `processingTools` bernilai `false` berarti layanan belum berjalan dengan runtime Docker, sehingga pemrosesan e-book/audiobook fase 2 tidak bisa jalan. Ubah **Settings → Runtime** ke Docker, atau sinkronkan Blueprint `render.yaml`.
   - `/api/digital/status` harus menjawab `enabled: false` selama `DIGITAL_ENABLED=false`.

**Darurat saja:** `ALLOW_START_WITHOUT_SUPABASE=true` mengizinkan server start tanpa Supabase, misalnya saat Supabase sedang gangguan dan situs harus tetap tampil. Masalahnya tetap dicatat di log, tetapi pesanan kembali hanya tersimpan di memori. Hapus variabel ini segera setelah Supabase pulih.

---

## 7. Yang berubah setelah tersambung

- **Pesanan buku cetak** tersimpan di tabel `orders` dan `order_items`, jadi tidak hilang saat restart.
- **Perubahan admin** (buku, penulis, konten CMS, SEO, produk digital) disimpan ke Supabase. Buku dan produk digital yang belum ada di database tetap tampil dari data bawaan, jadi katalog dan menu Digital tidak kosong.
- **Fitur digital fase 2** memakai Supabase, tetapi tetap tertutup untuk umum selama `DIGITAL_ENABLED=false`. Hanya email di `DIGITAL_BETA_EMAILS` yang bisa mengujinya.

---

## 8. Fase 3 (keanggotaan berbayar)

1. Cadangkan database (bagian 1).
2. Jalankan `src/db/membership_phase3_migration.sql` di SQL Editor sebagai **satu kueri**. Hasil yang benar: *Success. No rows returned*. File ini aman diulang dan tidak menimpa perubahan harga dari admin.
   - Satu-satunya perubahan pada tabel fase 2: kolom `entitlements.scope` (default `product`), `digital_product_id` boleh NULL untuk scope `shelf`, dan satu indeks unik parsial. Baris lama tidak diubah.
3. Jalankan ulang `check_schema.sql`: 41 baris `ada = true`.
4. Baru setelah itu deploy kode fase 3. Tanpa migration, server menolak start dengan pesan `Skema belum lengkap — jalankan src/db/membership_phase3_migration.sql`, dan Render tetap menjalankan versi sebelumnya.
5. Env, cron, dan Midtrans: [`docs/SETUP-KEANGGOTAAN.md`](SETUP-KEANGGOTAAN.md).
