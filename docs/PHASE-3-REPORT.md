# Laporan Fase 3 — Keanggotaan Berbayar

Implementasi [`docs/PHASE-3-BRIEF.md`](PHASE-3-BRIEF.md) Langkah 1–10. **Belum di-commit/push** (menunggu review).
Panduan operasional: [`docs/SETUP-KEANGGOTAAN.md`](SETUP-KEANGGOTAAN.md).

Keputusan yang dipakai (hasil audit Langkah 0):

| No. | Keputusan |
|---|---|
| A1 | Indeks unik parsial untuk hak rak |
| A2 | `source_ref` Pick = id pick |
| A3 | "Sudah dimiliki" hanya menghitung hak produk seumur hidup |
| A4 | Pelanggaran kecepatan halaman lewat rak: pertama blokir judul itu saja; kedua dalam 30 hari tangguhkan seluruh rak |
| A5 | Waktu Asia/Jakarta |
| A6 | Coba ulang auto-debit H+1..H+3 |

Tambahan: auto-debit dikenali lewat ID langganan Midtrans dan dicocokkan ulang harian; auto-debit di balik flag; hanya manfaat peluncuran yang tampil; Reader 1 perangkat dan Author 2; cron per jam.

---

## 1. Hasil verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `npm run lint` (tsc) | 0 error |
| `npm test` (vitest) | 18 file, **142 lulus**, 3 dilewati (tes lama yang memang di-skip), termasuk tes pengingat WhatsApp |
| Tes Langkah 10 no. 1–10 | Semua lulus (`backend/digital/__tests__/membership.test.ts`, 20 skenario) |
| `npm run i18n:check` | 0 masalah (id, en, zh) |
| `npm run build` + `npm run check:bundle` | Berhasil; tidak ada rahasia server di bundle frontend |
| Migration di Postgres (PGlite) | Seluruh migration fase 1→3 berurutan dan diulang; 51 pemeriksaan constraint, fungsi, dan RLS lulus (termasuk nomor WhatsApp) |
| Kesetaraan SQL ↔ kode | Tes otomatis: seed paket/manfaat = `plans.ts`, dan semua kolom yang dipakai store ada di tabel |
| Tes 10: snapshot checkout cetak | `POST /api/orders` identik byte-per-byte antara HEAD, kode baru dengan flag mati, dan flag hidup tanpa login (subtotal Rp555.000, total Rp573.000) |
| Uji browser (Playwright, Midtrans tiruan) | **56/56 lulus** (rincian di bawah) |

Cakupan uji browser, pada lebar 1280 dan 360 px:

- `/membership`: sisa kursi dari server, harga Founding default tahunan, dan hanya manfaat peluncuran.
- `/membership/terms`: indexable, dengan judul sendiri. `/membership/checkout` noindex.
- Checkout Professional tahunan → Snap (stub) → `/library?welcome=1`, dengan onboarding 3 langkah, Rak Digital 2 judul, dan "Segera masuk rak" 1 judul.
- `/account/membership`: batal lalu batalkan pembatalan.
- Checkout Reader bulanan → pilih Pick → terkunci.
- Tab admin Keanggotaan.
- Tanpa kunci i18n mentah, tanpa overflow horizontal, dan tanpa error halaman.

Pemetaan tes Langkah 10:

| No. | Skenario | Hasil |
|---|---|---|
| 1 | Dua pendaftar bersamaan pada kursi Founding terakhir | Hanya satu Founding. Diuji juga di SQL: fungsi `membership_claim_founding` atomik. |
| 2 | Settlement ganda | Satu invoice `paid`, satu hak rak. Signature palsu → 403; nominal beda → 400. |
| 3 | Professional | Buka judul di rak; judul yang masuk rak besok → 403 `no_entitlement`; tetap bisa beli satuan; keesokan harinya terbuka. |
| 4 | Reader | Tanpa Pick → 403; setelah Pick bisa; ganti Pick → 409 `pick_locked`; bulan berikutnya boleh memilih lagi. |
| 5 | Lompat waktu (perpanjangan manual) | H-7 invoice + pengingat tercatat sekali; H-3/H-1/H0; H0 → grace (akses tetap); H+6 → expired (reader menolak, progres tetap); bayar lagi → aktif dengan harga reguler, progres tersambung. |
| 6 | Upgrade prorata | Kredit tepat; hak lama `revoked (upgraded)`; perangkat 1 → 2. |
| 7 | Batal | Akses sampai akhir periode, tanpa invoice berikutnya, Midtrans `disable`; batalkan pembatalan → `enable`; akhir periode → `canceled` + Midtrans `cancel`. |
| 8 | Auto-debit gagal | `past_due`, percobaan ulang, satu email; berhasil → aktif; notifikasi tak terverifikasi → 403; tetap gagal sampai akhir tenggang → expired. |
| 9 | Pemberitahuan Founding | Tepat 30 hari sebelum ulang tahun, sekali; perpanjangan Rp990.000. |
| 10 | Flag harga member mati | Tidak ada diskon walau anggota aktif (tes backend, snapshot server, dan render komponen identik). Flag hidup: Reader 10%, Professional 15%, tidak bertumpuk dengan promo. |

**Belum bisa diuji otomatis:** uji Sandbox Midtrans sungguhan untuk kartu, GoPay, VA, dan QRIS. Aktivasi Midtrans masih ditinjau dan kunci Sandbox belum ada di `.env` lokal. Skrip dan langkahnya ada di SETUP-KEANGGOTAAN bagian 4.

---

## 2. Migration SQL

[`src/db/membership_phase3_migration.sql`](../src/db/membership_phase3_migration.sql): manual, aman diulang, tanpa `DROP`/`DELETE`.

- **Tabel:**
  - `plans` (id teks stabil) dan `plan_benefits` (dengan `feature_flag`);
  - `subscriptions`;
  - `subscription_invoices`, dengan jenis `initial`/`renewal`/`upgrade`/`manual`;
  - `subscription_events`, dengan `dedupe_key` unik;
  - `digital_member_picks`.
- **Perubahan fase 2 (hanya ini):**
  - `entitlements.scope`;
  - `digital_product_id` boleh NULL untuk scope `shelf`;
  - CHECK konsistensi scope;
  - indeks unik parsial hak rak.
- **Fungsi:**
  - `is_product_on_shelf(product_id, date)`;
  - `membership_claim_founding` / `membership_release_founding` (atomik, hanya service role).
- **RLS:** user hanya membaca langganan, invoice, dan Pick miliknya. Kolom token/ID Midtrans tidak bisa dibaca browser (grant per kolom). `plans` dan `plan_benefits` publik. `subscription_events` hanya untuk service role.
- `REQUIRED_SCHEMA` dan `check_schema.sql` kini 41 objek. **Jalankan migration sebelum deploy**; tanpa itu Render menolak start dan tetap memakai versi lama.

---

## 3. Env baru

`ENABLE_AUTODEBIT`, `PAYMENT_TOKEN_KEY`, `ENABLE_READER_DIGITAL_PICK`, `ENABLE_AUTHOR_GUILD_SHELF`, `ENABLE_MEMBER_PRINT_DISCOUNT`,
`MEMBERSHIP_EXTENDED_BENEFITS`. Semua default mati/kosong. `CRON_SECRET` sudah ada; `POST /api/internal/cron` sekarang juga
menjalankan job keanggotaan. Detail: SETUP-KEANGGOTAAN bagian 2–3.

---

## 4. Template email (id & en; zh memakai en)

`backend/digital/membership/email.ts`:

- selamat datang;
- invoice H-7 (varian auto-debit);
- pengingat H-3/H-1/H0;
- pembayaran gagal;
- masa tenggang;
- akses dikunci (progres disimpan 12 bulan);
- upgrade / downgrade terjadwal / downgrade berlaku;
- pembatalan;
- pemberitahuan harga Founding;
- Pick dikunci.

Email tidak memuat data kartu. Tautan mengarah ke `/account/membership` atau `/library`.

---

## 5. File

**Backend**

- Baru:
  - `backend/digital/membership/` — `plans.ts`, `service.ts`, `jobs.ts`, `gateway.ts`, `email.ts`, `router.ts`, `admin.ts`;
  - `backend/digital/time.ts`.
- Diubah:
  - `types.ts`, `config.ts`, `store.ts`, `memoryStore.ts`, `supabaseStore.ts`;
  - `entitlements.ts` (akses rak), `access.ts` (batas perangkat setelah downgrade), `checkout.ts`, `player.ts`, `admin.ts`;
  - `anomalies.ts` (A4 + job cron tambahan), `rateLimits.ts`, `index.ts`;
  - `backend/startupChecks.ts`;
  - `server.ts`: rute webhook keanggotaan; harga member cetak di balik flag; `shelfEntryDate`; sitemap `/membership/terms`.
- Tes:
  - baru: `membership.test.ts`, `membershipMigration.test.ts`;
  - disesuaikan: `harness.ts`, `startupChecks.test.ts`.

**Frontend**

- Baru:
  - `services/membershipApi.ts`, `hooks/useMembershipPlans.ts`;
  - `components/digital/MembershipCheckoutView.tsx`, `MembershipTermsView.tsx`, `components/account/AccountMembershipView.tsx`;
  - `components/MembershipAdminTab.tsx`;
  - `components/MembershipOfferCard.tsx`, `utils/membershipOffer.ts`;
  - `utils/memberPrice.ts`, `hooks/useMemberPrintDiscount.ts`.
- Diubah:
  - `MembershipView.tsx` (paket dari server), `LibraryView.tsx` (tab Rak Digital/Milik Saya, Pick, "Segera masuk rak", onboarding);
  - `data/membership.ts` (data cadangan = seed server; usulan statis dihapus);
  - `App.tsx`, `utils/router.ts`, `types.ts`, `services/digitalNavigation.ts`, `services/seoService.ts`, `services/apiClient.ts`;
  - `AdminDashboard.tsx`;
  - `BookCard.tsx`, `BookDetailView.tsx`, `CartDrawer.tsx`, `CheckoutForm.tsx`, `CheckoutModal.tsx`, `NotificationService.ts` (harga member, hanya bila berlaku);
  - `vitest.config.ts`.
- i18n: `digital.json`, `seo.json`, `common.json`, dan `checkout.json` (id/en/zh).

**Dokumen**

`docs/SETUP-KEANGGOTAAN.md` (baru), `docs/DEPLOY-SUPABASE.md` (bagian 8), `docs/SETUP-DIGITAL.md` (rujukan), dan laporan ini.

**Perubahan belum di-commit dari sesi sebelumnya yang ikut menunggu review**

- Perbaikan `admin.ts`, `checkout.ts`, dan `email.ts` fase 2.
- Noindex akun/checkout digital.
- `InstitutionsView.tsx`.
- `docs/SKEMA-KEANGGOTAAN.md`.

Halaman keanggotaan kini mengikuti brief (paket dari server).

---

## 6. Keputusan yang perlu Anda tinjau

1. **Pendaftaran ikut flag `DIGITAL_ENABLED`** (atau email beta), sama seperti pembelian satuan, karena keanggotaan membuka rak digital. `/membership` selalu tampil; tombol menjadi "Segera hadir".
2. **Draf ketentuan `/membership/terms`:**
   - pembayaran periode berjalan tidak dikembalikan, kecuali diwajibkan hukum;
   - harga tanpa pernyataan pajak;
   - mohon ditinjau sebelum pendaftaran dibuka.
3. **Harga member cetak.** Dihitung dari harga dasar (harga coret bila buku sedang promo), dan hanya dipakai bila lebih murah dari harga promo; tidak bertumpuk.
   - Ongkir tetap dihitung dari subtotal normal.
   - Pilihan "bertumpuk bila diatur admin" belum dibuat.
4. **Satu langganan per user.** Yang dihitung hanya status yang belum berakhir (`pending`, `active`, `past_due`, `grace`); `canceled` dianggap sudah berakhir.
5. **Kursi Founding.**
   - Dipesan saat pendaftaran dan dilepas bila tidak dibayar dalam 24 jam.
   - Kursi tetap terhitung bila anggota kemudian pindah paket, karena kuota adalah "anggota pertama".
   - Upgrade ke paket tahunan yang masih punya kuota memakai harga Founding paket tujuan (sesuai brief).
6. **Slot Pick** adalah potongan bulanan di dalam periode tagihan (paket tahunan tetap 1 Pick per bulan). Hak Pick berakhir di akhir slot + 5 hari.
7. **Pembatalan saat grace/past_due** langsung mengakhiri akses, karena periodenya sudah lewat dan belum dibayar.
8. **Churn bulanan sederhana** = (batal + expired bulan ini) / anggota aktif di awal bulan (perkiraan dari tanggal dibuat dan berakhir).
9. **Tenggang tambahan dari admin** hanya berlaku untuk periode berjalan dan di-reset saat perpanjangan.
10. **Tidak ada selisih angka** antara kode dan brief (harga, kuota Founding, tenggang 5 hari, pengingat H-7/H-3/H-1/H0). Catatan lama A8 (rasio wallet dokumen owner) tetap tercatat di SKEMA-KEANGGOTAAN; wallet disembunyikan di peluncuran.

---

## 7. Pengingat WhatsApp (+62 852 8614 6806)

Nomor resmi perusahaan menjadi **pengirim** pengingat ke anggota yang menyetujuinya. Detail: [SETUP-KEANGGOTAAN bagian 4a](SETUP-KEANGGOTAAN.md).

- **Yang dikirim:** invoice H-7, pengingat H-3/H-1/H0, auto-debit gagal, masa tenggang, akses dikunci, dan pemberitahuan harga Founding. Dedupe sama dengan email; email tetap dikirim.
- **Persetujuan:**
  - Anggota mencentang persetujuan dan mengisi nomor saat checkout, atau di Keanggotaan Saya (`POST /api/membership/whatsapp`).
  - Mematikan pengingat menghapus nomornya.
  - Nomor tidak dikirim ke Midtrans.
  - Kolom ini hanya tampil bila gateway aktif.
- **Gateway** (env `WHATSAPP_PROVIDER`, default `off`):
  - `fonnte`: nomor tetap di HP, pesan teks bebas, tidak resmi.
  - `cloud`: WhatsApp Cloud API resmi, template disetujui Meta.
- **Admin → Keanggotaan → Pengingat WhatsApp:**
  - periksa status gateway (nomor tersambung dicocokkan dengan nomor resmi);
  - kirim pesan uji;
  - nomor WA anggota tampil di detail;
  - kegagalan tercatat sebagai event `whatsapp_failed`.
- **Skema:** kolom `whatsapp_number`, `whatsapp_opt_in`, dan `whatsapp_opt_in_at` di `subscriptions` (dengan CHECK format 628…), dan jenis event `whatsapp_failed`. Semuanya sudah termasuk di migration fase 3, yang belum dijalankan di produksi.
- **Tes:**
  - `whatsapp.test.ts`: normalisasi nomor, isi pesan id/en, format permintaan Fonnte dan Cloud API.
  - Skenario di `membership.test.ts`:
    - hanya dengan persetujuan;
    - sekali per hari-H;
    - berhenti setelah dimatikan;
    - gagal → event dan email tetap terkirim;
    - uji admin.
  - PGlite: constraint nomor.

**Keputusan Anda:** pilih Fonnte atau Cloud API, lalu isi tokennya di Render.
- **Fonnte** paling cepat dan nomor tetap bisa dipakai chat manual, tetapi tidak resmi. Ada risiko nomor utama perusahaan dibatasi atau diblokir WhatsApp.
- **Cloud API** resmi, tetapi butuh verifikasi Meta dan template. Umumnya nomor juga harus dipindah dari aplikasi WhatsApp, kecuali Meta/BSP menyediakan mode *coexistence*.

---

## 8. Belum otomatis / menunggu

- Aktivasi Midtrans (recurring kartu, GoPay tokenization, Subscriptions API), lalu `ENABLE_AUTODEBIT=true`.
- Kunci Sandbox Midtrans untuk uji ujung-ke-ujung kartu, GoPay, VA, dan QRIS.
- Token gateway WhatsApp (Fonnte atau Cloud API) di Render. Tanpa itu, pengingat hanya lewat email.
- Refund manual di dashboard Midtrans.
- Kuitansi HTML, bukan faktur pajak.
- Menjalankan migration fase 3 di Supabase produksi (oleh Anda, sebelum deploy).
