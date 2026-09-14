# Setup akses institusi (fase 4)

Panduan operasional untuk kontrak institusi (docs/PHASE-4-BRIEF Langkah 2, dengan koreksi review) dan anggota institusi
(Langkah 3). Dasbor admin institusi, EBA, dan halaman publik menyusul di langkah berikutnya.

## 1. Database

1. Jalankan migration secara berurutan di Supabase SQL Editor: fase 3, lalu `src/db/print_orders_royalty_migration.sql`,
   lalu `src/db/institution_phase4_migration.sql`. Migration fase 4 aman dijalankan ulang, termasuk bagian 16 (tambahan
   Langkah 2 dan koreksi review: kolom bahasa, tautan Midtrans, satu kontrak terbuka per institusi, dan konfigurasi
   perpanjangan otomatis).
2. Jalankan `src/db/check_schema.sql`. Semua 61 baris harus `ada = true`; baris urutan 8 adalah fase 4.
3. Server Render menolak start bila tabel institusi belum ada (lihat `REQUIRED_SCHEMA` di `backend/startupChecks.ts`).

## 2. Env Render

| Env | Wajib | Keterangan |
|---|---|---|
| `ACCESS_TOKEN_SECRET` | ya (sudah dipakai fase 2) | Juga menandatangani tautan unduh invoice di email. Jika berubah, tautan lama tidak berlaku. |
| `PUBLIC_API_URL` | opsional | URL publik API Render untuk tautan invoice, mis. `https://api.cakranexa.com`. Kosong = `RENDER_EXTERNAL_URL` (diisi otomatis oleh Render). |
| `RESEND_API_KEY`, `EMAIL_FROM` | ya | Email invoice, pengingat, perpanjangan, tenggang, dan berakhir dikirim lewat Resend. |
| `INSTITUTION_INQUIRY_EMAILS` | opsional | Penerima email internal institusi, termasuk pemberitahuan perpanjangan H-45. Kosong = `ORDER_NOTIFICATION_EMAILS`. |
| `CRON_SECRET` | opsional | Penjadwal eksternal `POST /api/internal/cron` juga menjalankan job institusi. |
| `ENABLE_IP_ACCESS` | opsional | `true` = pengguna yang masuk dari rentang IP institusi bisa bergabung sebagai tamu (4 jam, bisa diubah di konfigurasi). Bawaan mati. |

Tidak ada env rekening bank atau PPN:
- **Rekening bank** diambil dari CMS (tab **Pembayaran**, tabel `admin_bank_accounts`, hanya yang aktif). Tab itu menyinkronkan daftar rekening ke server setiap kali diubah. Rekening yang dihapus di sana dinonaktifkan di database, tidak dihapus. Tanpa rekening aktif, invoice tidak bisa diterbitkan.
- **PPN, jatuh tempo, masa tenggang, lama trial, EBA, kuota Founding, dan jadwal perpanjangan** diatur di tab **Institusi & Kontrak → Konfigurasi program institusi** (tabel `institution_config`). PPN bawaan 0% dan ditambahkan di atas harga kontrak. Nilai baru berlaku untuk kontrak dan invoice yang dibuat setelahnya.
- **Identitas penerbit di kepala invoice** diambil dari konten CMS: nama perusahaan, alamat, telepon, dan email footer, serta NPWP di kredensial perusahaan.

## 3. Alur admin (tab "Institusi & Kontrak")

1. **Institusi baru.** Pilih permintaan penawaran dari `/institutions`, atau isi manual. Institusi dibuat dengan status prospek.
2. **Kontrak baru.** Pilih tier dan tanggal mulai, centang Founding bila tersedia, lalu pilih koleksi: seluruh rak, atau custom per judul dengan "pilih semua" per kategori. Klik **Hitung rincian**, lalu **Simpan draf**. Harga dikunci pada kontrak.
3. **Terbitkan invoice.** Sistem membuat nomor `INV-INST-YYYY-NNNN`, PDF di bucket privat, dan email ke kontak dan admin institusi berisi tautan unduh (berlaku 180 hari) serta rekening.
4. **Pelunasan**, dengan salah satu cara:
   - **Manual:** unggah bukti (PDF/PNG/JPG/WebP, maksimal 10 MB), lalu **Tandai lunas**.
   - **Midtrans (opsional):** buat tautan **VA Midtrans**. Webhook (URL sama dengan pesanan lain, order_id `INST-…`) melunasi otomatis.
5. **Setelah lunas:**
   - Kontrak dan institusi menjadi aktif.
   - Setiap anggota aktif mendapat satu hak akses rak: berlaku sampai akhir periode + 14 hari, dengan 2 perangkat.
   - Perpanjangan yang dibayar lebih awal menunggu, lalu aktif otomatis saat periodenya dimulai.
6. **Trial:** 30 hari gratis dengan tier Starter, tanpa EBA, sekali per institusi, langsung aktif.

## 4. Founding

- Diskon Founding (15% tahun pertama) untuk **30 institusi pertama yang membayar** kontrak Founding. Hitungannya kumulatif: kursi tidak terbuka lagi walau institusinya kemudian berakhir.
- Kursi **direservasi saat invoice Founding terbit**, bukan saat draf dibuat.
- Reservasi **dilepas** bila invoice dibatalkan atau belum dibayar sampai jatuh tempo.
- Saat menerbitkan invoice, kuota diperiksa ulang. Bila sudah penuh sejak draf dibuat, invoice ditolak; batalkan draf dan buat ulang tanpa Founding.
- Invoice Founding yang dibayar setelah jatuh tempo tetap diterima. Bila hal itu membuat jumlah institusi Founding melebihi kuota, riwayat institusi mencatat `founding_over_cap` untuk ditinjau.

## 5. Perpanjangan (otomatis)

| Waktu | Yang terjadi |
|---|---|
| H-60 | Pemberitahuan ke institusi: harga perpanjangan (dihitung ulang dari jumlah judul di rak saat itu, tanpa Founding), ringkasan penggunaan agregat, dan tanggal invoice terbit. Draf kontrak periode berikutnya dibuat. |
| H-45 | Email internal ke admin CakraNexa (`INSTITUTION_INQUIRY_EMAILS`): invoice akan terbit otomatis, dengan pengingat opsi **Tidak diperpanjang**. |
| H-30 | Invoice perpanjangan **terbit otomatis** (harga dihitung ulang sekali lagi) dan dikirim bersama pemberitahuan H-30, lengkap dengan tautan unduh dan rekening. |
| Akhir periode | Belum dibayar: masa tenggang 14 hari, akses tetap. Setelah itu kontrak berakhir dan hak akses anggota berakhir sendiri pada tanggalnya. |
| +30 hari setelah akhir periode | Invoice perpanjangan yang belum dibayar di-void dan kontrak perpanjangannya dibatalkan. |

- **Tidak diperpanjang:** tombol pada kontrak berjalan. Draf/invoice perpanjangan yang belum dibayar dibatalkan, dan job tidak lagi mengirim pemberitahuan atau invoice. Untuk membatalkan keputusan ini, buat **Kontrak baru** untuk institusi tersebut.
- Perpanjangan yang sudah dibayar tidak bisa ditandai tidak diperpanjang; pengembalian dana ditangani manual.
- Semua jadwal (60/30, 45, 30, +30) bisa diubah di konfigurasi.

## 6. Job per jam (otomatis di Render)

- Pengingat invoice H-3, lalu status "lewat jatuh tempo" dan email pada hari jatuh tempo.
- Jadwal perpanjangan pada bagian 5, beserta aktivasi perpanjangan yang sudah dibayar.
- Masa tenggang dan berakhirnya kontrak.
- Job bisa dijalankan manual dari tombol **Jalankan job**.

## 7. Email (id/en formal, sesuai bahasa institusi)

Email yang dikirim ke institusi:
- invoice terbit;
- pengingat jatuh tempo;
- lewat jatuh tempo;
- lunas & aktif;
- lunas untuk periode berikutnya;
- trial dimulai;
- perpanjangan H-60 dan H-30 (H-30 memuat invoice);
- masa tenggang;
- akses berakhir.

Email internal ke admin CakraNexa: pemberitahuan perpanjangan H-45.

## 8. Anggota institusi (Langkah 3)

Cara bergabung:
- **Undangan email.** Admin CakraNexa (detail institusi → **Anggota**) atau admin institusi mengundang lewat daftar/CSV, maksimal 500 email sekali kirim. Email berisi tautan ke halaman gabung institusi (`/institutions/join/<slug>`); sampai halaman itu dibuat di Langkah 6, tautan dialihkan ke Pustaka Saya (`/library`). Undangan diterima otomatis saat penerima masuk dengan email yang sama dan email itu sudah terverifikasi.
- **Domain email.** Pengguna dengan email terverifikasi yang domainnya (termasuk subdomain) cocok dengan domain institusi bisa bergabung sendiri.
- **Kode gabung.** Admin institusi membuat kode dengan batas pemakaian, tanggal kedaluwarsa, dan label grup opsional. Kode bisa dinonaktifkan kapan saja.
- **Rentang IP (tamu).** Hanya bila `ENABLE_IP_ACCESS=true`. Pengguna tetap harus masuk; tidak ada akses anonim. Keanggotaan tamu berakhir sendiri setelah 4 jam.

Aturan akses:
- Anggota yang bergabung saat kontrak sudah lunas **langsung** mendapat hak akses. Bila kontrak belum lunas, hak akses diberikan saat pelunasan.
- **Koleksi custom** dibatasi di pemeriksaan hak akses: anggota hanya bisa membuka judul yang ada di kontrak.
- **Pengguna bersamaan** dibatasi per kontrak, misalnya Starter 5. Bila semua slot terpakai, anggota mendapat pesan "Semua slot institusi sedang dipakai" dan saran membeli akses individu.
  - Satu anggota yang membuka dua judul tetap dihitung satu slot.
  - Slot lepas 2 menit setelah heartbeat terakhir.
  - Penolakan dicatat di `access_logs` (`institution_busy`) untuk statistik agregat di Langkah 4.
- Anggota yang punya keanggotaan individu atau membeli judul satuan memakai hak akses pribadinya lebih dulu dan tidak memakan slot institusi. Urutannya: milik permanen → langganan individu → institusi.
- Setiap anggota maksimal 2 perangkat.

Mengelola anggota:
- **Nonaktifkan** mencabut hak akses dan mengakhiri sesi yang sedang berjalan. Anggota yang dinonaktifkan admin tidak bisa bergabung ulang lewat domain atau kode; aktifkan kembali dari daftar anggota.
- Anggota yang **keluar sendiri** bisa bergabung ulang.
- Jumlah admin institusi mengikuti kursi admin tier kontrak. Admin institusi tidak bisa menonaktifkan atau menurunkan peran dirinya sendiri.
- Institusi hanya melihat data agregat. Riwayat baca per anggota tidak ditampilkan.
