# Setup Keanggotaan Berbayar (Fase 3)

Panduan peluncuran keanggotaan Cakrawala Magna Society: migration, env, cron, Midtrans, aturan bisnis, dan admin.
Spesifikasi yang berlaku: [`docs/PHASE-3-BRIEF.md`](PHASE-3-BRIEF.md). Laporan implementasi: [`docs/PHASE-3-REPORT.md`](PHASE-3-REPORT.md).

---

## 1. Urutan peluncuran yang aman

1. **Migration dulu, baru deploy.** Jalankan [`src/db/membership_phase3_migration.sql`](../src/db/membership_phase3_migration.sql) di Supabase SQL Editor (satu kueri, aman diulang). Server Render menolak start bila tabel fase 3 belum ada, sehingga deploy sebelum migration akan gagal dan Render tetap menjalankan versi lama.
2. Jalankan [`src/db/check_schema.sql`](../src/db/check_schema.sql). Semua baris urutan 1–6 (41 baris; 12 baris urutan 6 = fase 3) harus `ada = true`. Baris urutan 7 (data royalti cetak) wajib sebelum men-deploy versi yang menulisnya; lihat DEPLOY-SUPABASE bagian 9.
3. Isi env Render (bagian 2). Semua flag fase 3 default **mati**.
4. Deploy. `/api/health` harus tetap `supabaseConnected: true`, `supabaseSchemaReady: true`.
5. Uji dengan email di `DIGITAL_BETA_EMAILS` (keanggotaan ikut flag `DIGITAL_ENABLED`, sama seperti pembelian satuan). Pendaftaran penguji ditandai `is_test` dan tidak masuk ringkasan admin.
6. Peluncuran: `DIGITAL_ENABLED=true`.

Halaman `/membership` selalu tampil. Selama pendaftaran tertutup, tombol paket menjadi "Segera hadir".

---

## 2. Env Render baru

| Env | Default | Keterangan |
|---|---|---|
| `ENABLE_AUTODEBIT` | `false` | Perpanjangan otomatis kartu/GoPay lewat Midtrans Subscriptions. Nyalakan **hanya** setelah Midtrans mengaktifkan recurring kartu dan GoPay tokenization di akun Anda, dan setelah `PAYMENT_TOKEN_KEY` diisi. Selama mati, semua metode (VA, QRIS, kartu, GoPay) dibayar manual per periode, dan halaman menjelaskannya dengan jujur. |
| `PAYMENT_TOKEN_KEY` | *(kosong)* | 64 karakter hex (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Kunci AES-256-GCM untuk token Midtrans yang disimpan (bukan data kartu). Tanpa ini kunci diturunkan dari `ACCESS_TOKEN_SECRET`. **Jangan diganti** setelah ada anggota auto-debit: token lama tidak bisa dibaca dan perpanjangan mereka jatuh ke tagihan manual. |
| `ENABLE_READER_DIGITAL_PICK` | `false` | Reader Circle memilih 1 judul rak per bulan. Mati: Reader tanpa akses rak (sampel saja). |
| `ENABLE_AUTHOR_GUILD_SHELF` | `false` | Author Guild membuka seluruh rak. Mati: sampel + karya sendiri (entitlement `author` fase 2). |
| `ENABLE_MEMBER_PRINT_DISCOUNT` | `false` | Harga member buku cetak (Reader 10%, Professional/Author 15%). Mati: alur cetak identik dengan sebelumnya (diuji snapshot). |
| `MEMBERSHIP_EXTENDED_BENEFITS` | `false` | Menampilkan manfaat yang belum bisa dipenuhi (wallet, poin, loyalitas, hadiah ulang tahun, referral). Teksnya tetap ada di i18n. |
| `CRON_SECRET` | *(sudah ada)* | Melindungi `POST /api/internal/cron` (bagian 3). |
| `WHATSAPP_PROVIDER` | `off` | Pengingat WhatsApp: `off`, `fonnte`, atau `cloud` (bagian 4a). |
| `WHATSAPP_SENDER_NUMBER` | `+62 852 8614 6806` | Nomor resmi pengirim. Dipakai untuk tampilan dan dicocokkan dengan nomor yang tersambung ke gateway. |
| `FONNTE_TOKEN` | *(kosong)* | Token perangkat Fonnte (bila `WHATSAPP_PROVIDER=fonnte`). **Rahasia.** |
| `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | *(kosong)* | Token sistem Meta dan Phone Number ID (bila `WHATSAPP_PROVIDER=cloud`). Token **rahasia**. |
| `WHATSAPP_TEMPLATE_PREFIX`, `WHATSAPP_CLOUD_API_VERSION` | `cnx_`, `v21.0` | Opsional, hanya untuk Cloud API. |
| `FINANCE_WHATSAPP` | `+62 852 8614 6806` | **Cadangan** nomor WhatsApp Finance untuk konfirmasi transfer (cetak & keanggotaan). Sumber utamanya kolom "WhatsApp Finance" di Admin → Pembayaran; env dipakai hanya bila kolom itu kosong. |
| `ENABLE_OFFLINE` | `false` | Fase 6 Langkah 5: baca/dengar offline (Gold 2 judul, Platinum 5). Mati: manfaat offline tidak ditampilkan di paket, tabel perbandingan, dan hero. |
| `ENABLE_CROSS_FORMAT_SYNC` | `false` | Fase 6 Langkah 5: lanjut e-book ↔ audio. Mati: manfaat sinkron tidak ditampilkan. |
| `VITE_ENABLE_GOOGLE_LOGIN` (Vercel) | `false` | Tombol "Lanjutkan dengan Google" di halaman masuk/daftar. Nyalakan hanya setelah provider Google diaktifkan di Supabase Auth. |

Batas perangkat tidak bergantung flag: Reader 1, Professional 2, Author 2. Harga, kuota Founding, batas perangkat, akses rak,
dan persen harga member bisa diubah admin tanpa deploy (tab Keanggotaan → Paket). Flag env di atas tetap perlu diubah di Render.

---

## 3. Job per jam (perpanjangan, pengingat, tenggang)

- Server Render menjalankan job keanggotaan **setiap jam** di proses yang sama (pertama 2 menit setelah start).
- **Disarankan** tambahan Render Cron Job per jam sebagai cadangan bila instance restart:

  ```bash
  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://cakranexa.onrender.com/api/internal/cron
  ```

  Endpoint ini menjalankan deteksi anomali dan job keanggotaan. Keduanya idempoten (update bersyarat + `dedupe_key`), jadi aman berjalan bersamaan dengan job internal.
- Isi job, berurutan per langganan:
  1. Pendaftaran/upgrade tidak dibayar > 24 jam: dicocokkan ulang ke Midtrans, lalu di-void (kursi Founding dilepas).
  2. Pemberitahuan harga Founding 30 hari sebelum ulang tahun pertama (sekali).
  3. Dibatalkan dan periode habis: status `canceled`, langganan Midtrans dihentikan.
  4. H-7: invoice perpanjangan terbit. Pengingat email H-7/H-3/H-1/H0 untuk pembayaran manual, atau satu pemberitahuan untuk auto-debit. Masing-masing tercatat di `subscription_events`, jadi tidak terkirim dua kali.
  5. Jatuh tempo belum dibayar: cocokkan ulang ke Midtrans, lalu `grace` (manual) atau `past_due` (auto-debit). Akses tetap terbuka.
  6. Akhir tenggang (5 hari): cocokkan ulang, lalu `expired`. Email "akses dikunci, progres disimpan 12 bulan".
- Waktu bisnis memakai zona Asia/Jakarta.

---

## 4. Midtrans

- **Notification URL tidak berubah:** `https://cakranexa.onrender.com/api/payment/midtrans-webhook`.
  - Pesanan keanggotaan berawalan `SUB-` (diverifikasi signature).
  - Tagihan otomatis Midtrans Subscriptions dikenali lewat **ID langganan Midtrans**, lalu statusnya diambil ulang dari API Midtrans (isi notifikasi tidak dipercaya).
- **Finish redirect** Snap: `SITE_URL/account/membership?invoice=<nomor>`. Halaman itu mencocokkan status ke Midtrans bila notifikasi belum masuk.
- **Aktivasi yang perlu diajukan ke Midtrans** sebelum `ENABLE_AUTODEBIT=true`:
  - Credit card recurring / one-click (Snap `save_card`, `saved_token_id`);
  - GoPay tokenization (akun GoPay tertaut);
  - akses Subscriptions API (`/v1/subscriptions`).
- **Data kartu tidak pernah melewati server.** Yang disimpan hanya ID langganan Midtrans dan token Midtrans, terenkripsi.
- **Uji Sandbox** (butuh kunci Sandbox di `.env` lokal):
  - Kartu: kartu uji Midtrans `4811 1111 1111 1114`, 3DS OTP `112233`.
  - GoPay: simulator GoPay Sandbox.
  - VA: simulator BCA/BNI/BRI VA di dashboard Sandbox.
  - QRIS: simulator QRIS Sandbox.

  Periksa untuk tiap metode: invoice `paid`, langganan `active`, rak terbuka. Untuk kartu/GoPay dengan `ENABLE_AUTODEBIT=true`, pastikan juga `midtrans_subscription_id` terisi.

---

## 4a. Pengingat WhatsApp dari +62 852 8614 6806

**Yang dikirim.** WhatsApp dikirim untuk:
- invoice H-7;
- pengingat H-3, H-1, dan hari jatuh tempo;
- auto-debit gagal;
- masa tenggang;
- akses dikunci;
- pemberitahuan harga Founding.

Aturannya:
- Hanya dikirim ke anggota yang mencentang persetujuan dan mengisi nomor, di checkout atau di Keanggotaan Saya.
- Anggota bisa mematikannya kapan saja; nomornya ikut dihapus.
- Email tetap dikirim.
- Tiap pengingat tercatat sekali di `subscription_events`, jadi tidak terkirim dua kali.
- Nomor anggota tidak pernah dikirim ke Midtrans.
- Pesan yang gagal tercatat sebagai event `whatsapp_failed`, terlihat di detail langganan admin.

**Pilih gateway:**

| | Fonnte (`fonnte`) | WhatsApp Cloud API resmi (`cloud`) |
|---|---|---|
| Cara menyambung | Buat akun di fonnte.com, tambah perangkat, lalu pindai QR dengan WhatsApp nomor 0852 8614 6806 (seperti WhatsApp Web). Salin token perangkat ke `FONNTE_TOKEN`. | Daftarkan nomor di Meta Business (WhatsApp Manager) dan verifikasi bisnis. Isi `WHATSAPP_CLOUD_TOKEN` (token sistem) dan `WHATSAPP_CLOUD_PHONE_NUMBER_ID`. |
| Nomor di HP | Tetap bisa dipakai untuk chat manual. | Umumnya nomor dipindah dari aplikasi WhatsApp ke Cloud API. Tanyakan ke Meta atau BSP apakah mode *coexistence* tersedia untuk nomor ini. |
| Isi pesan | Teks bebas (sudah disiapkan id/en; zh memakai en). | Wajib template yang disetujui Meta (daftar di bawah). |
| Risiko | Tidak resmi: nomor bisa dibatasi atau diblokir WhatsApp bila dianggap spam. Ini nomor kontak utama perusahaan, jadi jaga volume tetap wajar. | Resmi. Meta memungut biaya per percakapan. |

**Setelah env diisi dan deploy:**
1. Buka Admin → Keanggotaan → Pengingat WhatsApp.
2. Klik **Periksa status gateway**. Nomor tersambung harus +62 852 8614 6806.
3. Klik **Kirim pesan uji** ke nomor Anda sendiri. Pesan uji Cloud API memakai template bawaan Meta `hello_world`.

**Template Cloud API** (kategori *Utility*, bahasa `id` dan `en`). Parameter body berurutan `{{1}}`, `{{2}}`, … sesuai tabel. Isi pesan dapat meniru teks Fonnte di `backend/digital/membership/whatsapp.ts`.

| Template | Parameter |
|---|---|
| `cnx_invoice`, `cnx_invoice_autodebit` | nama, paket, nominal, tanggal jatuh tempo, tautan |
| `cnx_reminder` | nama, paket, nominal, tanggal jatuh tempo, "3 hari lagi" / "hari ini", tautan |
| `cnx_payment_failed` | nama, paket, nominal, tautan |
| `cnx_grace` | nama, paket, akhir masa tenggang, tautan |
| `cnx_locked` | nama, paket, lama penyimpanan progres (bulan), tautan |
| `cnx_founding_notice` | nama, paket, tanggal akhir harga Founding, harga reguler, tautan |

Contoh `cnx_reminder` (id): *Halo {{1}}, pengingat: tagihan keanggotaan {{2}} sebesar {{3}} jatuh tempo {{4}} ({{5}}). Bayar di: {{6}}*
| `cnx_transfer_instructions` | nama, paket, nominal transfer, batas waktu, tautan |
| `cnx_transfer_expired` | nama, paket, nominal transfer, tautan halaman paket |

### Teks pengajuan template transfer (fase 6)

Dua template di bawah dipakai alur transfer bank keanggotaan. Ajukan di WhatsApp Manager → Message templates → **Create template**, kategori **Utility**, tanpa tombol dan tanpa header (body saja). Ajukan tiap bahasa sebagai *language* terpisah pada template yang sama: `id` (Indonesian), `en` (English), dan `zh_CN` (Chinese Simplified). Bila Meta menolak `zh_CN`, biarkan kosong: pesan berbahasa Mandarin otomatis memakai versi `en`.

**1. `cnx_transfer_instructions`** — dikirim setelah tagihan transfer dibuat.

| Bahasa | Body |
|---|---|
| id | Halo {{1}}, terima kasih telah memilih paket {{2}}. Transfer tepat {{3}} (termasuk kode unik) sebelum {{4}}. Rekening tujuan, bukti transfer, dan konfirmasi Finance: {{5}} |
| en | Hello {{1}}, thank you for choosing {{2}}. Please transfer exactly {{3}} (unique code included) before {{4}}. Bank accounts, proof upload, and Finance confirmation: {{5}} |
| zh_CN | 您好 {{1}}，感谢您选择 {{2}} 方案。请在 {{4}} 前准确转账 {{3}}（含唯一识别码）。收款账户、上传凭证与财务确认：{{5}} |

Contoh nilai untuk peninjauan Meta: {{1}} Budi Santoso · {{2}} Gold · {{3}} Rp 989.443 · {{4}} 19 September 2026 pukul 01.07 WIB · {{5}} https://cakranexa.com/account/membership

**2. `cnx_transfer_expired`** — dikirim saat batas transfer terlewati dan tagihan ditutup.

| Bahasa | Body |
|---|---|
| id | Halo {{1}}, batas transfer paket {{2}} sebesar {{3}} sudah lewat sehingga tagihan ditutup. Bila sudah mentransfer, kirim bukti ke Finance. Pilih paket lagi di: {{4}} |
| en | Hello {{1}}, the transfer deadline for {{2}} ({{3}}) has passed, so the invoice was closed. If you already transferred, send the proof to Finance. Choose a plan again at: {{4}} |
| zh_CN | 您好 {{1}}，{{2}} 方案 {{3}} 的转账期限已过，账单已关闭。若您已转账，请将凭证发送给财务。重新选择方案：{{4}} |

Contoh nilai: {{1}} Budi Santoso · {{2}} Gold · {{3}} Rp 989.443 · {{4}} https://cakranexa.com/membership

> **Fonnte sebagai cadangan sementara.** Selama template Cloud API belum disetujui, `WHATSAPP_PROVIDER=fonnte` mengirim teks bebas yang sama tanpa persetujuan. Risikonya: Fonnte bukan gateway resmi WhatsApp, sehingga nomor +62 852 8614 6806 (nomor kontak utama perusahaan) dapat dibatasi atau diblokir bila volume pesan dianggap tidak wajar. Batasi pemakaian pada pengingat transaksional, jangan untuk promosi, dan pindah ke `cloud` setelah template disetujui. Dengan `WHATSAPP_PROVIDER=off`, seluruh pemberitahuan tetap terkirim lewat email.

---

## 5. Aturan bisnis (ringkas)

| Paket | Bulanan | Tahunan | Founding (tahun pertama) | Akses digital | Perangkat |
|---|---|---|---|---|---|
| Free Circle | Rp0 | – | – | sampel | – |
| Reader Circle | Rp39.000 | Rp390.000 | Rp299.000 (1.000 kursi) | 1 Digital Member Pick/bulan (flag) | 1 |
| Professional & Academic Society | Rp99.000 | Rp990.000 | Rp790.000 (500 kursi) | seluruh Digital Reading Shelf | 2 |
| Author Guild | Rp149.000 | Rp1.490.000 | Rp1.190.000 (250 kursi) | seluruh rak (flag), selain itu karya sendiri | 2 |

- **Founding:** tahunan, kuota tersisa, dan belum pernah menjadi anggota berbayar. Kursi diambil atomik saat pendaftaran dan dilepas bila tidak dibayar dalam 24 jam. Perpanjangan memakai harga reguler.
- **Hak akses:** baris `entitlements` scope `shelf` per periode (`ends_at` = akhir periode + 5 hari). Pick = baris scope `product` (`source_ref` = id pick). Judul frontlist (tanggal masuk rak di masa depan) tidak terbuka lewat keanggotaan, tetapi tetap bisa dibeli satuan.
- **Upgrade & bulanan→tahunan:** seketika, kredit prorata, periode baru mulai hari bayar. Hak lama dicabut dengan alasan `upgraded`.
- **Downgrade & tahunan→bulanan:** di akhir periode. Hak paket lama berakhir tepat di akhir periode lama.
- **Batal:** satu klik. Akses sampai akhir periode, auto-debit Midtrans dinonaktifkan, dan pembatalan bisa dibatalkan sebelum periode berakhir.
- **Setelah expired:** berlangganan lagi = langganan baru dengan harga reguler. Progres dan catatan tersambung karena disimpan per user.

---

## 6. Admin → Keanggotaan

- **Ringkasan:** anggota aktif per paket, baru bulan ini, batal/expired, past_due/grace, pendapatan bulan ini, porsi tahunan, churn sederhana, sisa kuota Founding. Langganan uji dikecualikan.
- **Paket:** ubah harga, kuota Founding, perangkat, akses rak, persen harga member, dan aktif/nonaktif. Perubahan berlaku untuk invoice berikutnya; harga di invoice yang sudah terbit tidak berubah.
- **Langganan:** filter paket/status/founding/cari. Detail memuat invoice, event, hak akses, perangkat, Pick, dan riwayat. Aksi yang tersedia:
  - perpanjang manual (pembayaran offline);
  - masa tenggang tambahan;
  - batalkan (akhir periode atau langsung);
  - ubah paket (sekarang atau akhir periode);
  - tandai/hapus Founding.
- **Ekspor CSV** langganan dan invoice (UTF-8 BOM, waktu WIB) untuk akuntansi.
- **Refund** tetap manual di dashboard Midtrans. Notifikasi refund dari Midtrans otomatis mencabut akses dan mengakhiri langganan.

---

## 7. Endpoint fase 3

| Endpoint | Akses |
|---|---|
| `GET /api/membership/plans` | publik (token opsional) |
| `POST /api/membership/subscribe` | anggota |
| `GET /api/membership/me`, `GET /api/membership/shelf` | anggota |
| `POST /api/membership/invoices/:id/pay`, `POST …/refresh`, `GET …/receipt` | anggota (tagihan miliknya) |
| `POST /api/membership/change`, `…/change/cancel`, `…/cancel`, `…/resume`, `…/payment-method`, `…/whatsapp` | anggota |
| `GET/POST /api/membership/picks` | anggota Reader |
| `/api/admin/membership/*` | admin |
| `POST /api/internal/cron` | `CRON_SECRET` |

---

## 8. Belum otomatis

- **Pengingat WhatsApp:** kode siap (bagian 4a), menunggu Anda memilih gateway dan mengisi tokennya. Selama `WHATSAPP_PROVIDER=off`, pengingat hanya lewat email dan kolom WhatsApp tidak tampil untuk anggota.
- **Auto-debit kartu/GoPay:** menunggu aktivasi Midtrans (flag `ENABLE_AUTODEBIT`).
- **Uji ujung-ke-ujung Sandbox** untuk kartu, GoPay, VA, dan QRIS: menunggu kunci Sandbox.
- **Bukti pembayaran** adalah kuitansi HTML, bukan faktur pajak.
- **Refund:** manual di Midtrans.
