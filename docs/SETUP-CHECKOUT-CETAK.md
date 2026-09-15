# Checkout buku cetak: transfer bank ke rekening PT

Checkout buku cetak sebelum Xendit, dengan ongkir RajaOngkir. Kode: `backend/printCheckout/` (klien RajaOngkir di
`rajaongkir.ts`), data bersama `src/data/shippingRates.ts`, `src/data/shippingZones.ts`, dan `src/data/paymentRouting.ts`.

## 1. Database

1. Jalankan `src/db/print_checkout_migration.sql` di Supabase SQL Editor, setelah migration fase 4. Aman diulang. Untuk rekening internasional, jalankan juga `src/db/bank_account_currency_migration.sql` dan untuk mengisi gudang CakraNexa jalankan `src/db/shipping_origin_cakranexa_migration.sql`.
2. Jalankan `src/db/check_schema.sql`: 70 baris harus `ada = true` (urutan 9 = migration ini).
3. Server Render menolak start sebelum migration dijalankan (`backend/startupChecks.ts`), jadi jalankan migration **sebelum** deploy.

Bagian 5 migration menandai pesanan uji yang sudah ada sebagai `is_test`:
- data contoh yang dulu terisi otomatis di form checkout (Dr. Ahmad Fauzi, Jl. Salemba Raya No. 4);
- email domain contoh (`@example.com`, `@test…`);
- penanda "test"/"dummy" di email atau nama.

Pratinjau dulu dengan `SELECT` yang ditulis di komentar. Pesanan uji lain ditandai lewat tombol **Tandai Uji** di Dispatcher.

## 2. Env Render

| Env | Wajib | Keterangan |
|---|---|---|
| `RAJAONGKIR_API_KEY` | ya | API key RajaOngkir by Komerce (`rajaongkir.komerce.id/api/v1`); satu-satunya nama env yang dibaca. Hanya di server, tidak pernah masuk bundle frontend atau log. `/api/health` → `rajaongkirConfigured`. Key API lama (`api.rajaongkir.com`) tidak berlaku. |
| `ACCESS_TOKEN_SECRET` | ya (sudah ada) | Menandatangani tautan halaman pesanan pembeli (`/pesanan/<nomor>?t=…`) dan hasil pencarian wilayah RajaOngkir. Mengganti nilainya membuat tautan lama tidak berlaku. |
| `RESEND_API_KEY`, `EMAIL_FROM` | ya | Email pembeli: instruksi transfer, tagihan setelah ongkir diisi, perpanjangan, lunas, kedaluwarsa. |
| `SITE_URL` | ya | Awal tautan halaman pesanan di email (mis. `https://cakranexa.com`). |
| `FINANCE_WHATSAPP` | opsional | Nomor WhatsApp Finance untuk tombol konfirmasi. Bawaan +62 852-8614-6806. |
| `ORDER_NOTIFICATION_EMAILS` | disarankan | Penerima email "Pesanan Baru" dan "Bukti Transfer". Tanpa env ini dipakai daftar bawaan di `server.ts`. |

Rekening transfer manual mendukung IDR dan USD. Rekening USD Mandiri `167-00-1171867-2` atas nama PT Cakrawala Magna Scientia ditambahkan oleh `src/db/bank_account_currency_migration.sql` dan ditampilkan terpisah dengan label USD.

Asal gudang bawaan CakraNexa adalah `Jl. Bintara Raya 9A Nomor 27 RT 005 RW 005, Bekasi Barat, Kota Bekasi, Jawa Barat 17134`. Di Komerce, alamat ini dipetakan ke ID `6521` (`BINTARA, BEKASI BARAT`). Migration `src/db/shipping_origin_cakranexa_migration.sql` mengisi pengaturan ini ke `print_checkout_settings`.
| `CRON_SECRET` | opsional | `POST /api/internal/cron` juga menjalankan job kedaluwarsa pesanan cetak (berguna saat server Render tidur). |
| `PRINT_ORDER_JOB` | opsional | `false` mematikan timer 15 menit di server (job tetap bisa lewat cron atau tombol admin). |

## 3. Alur pesanan

| Status | Arti | Berikutnya |
|---|---|---|
| `awaiting_transfer` | Menunggu transfer ke rekening PT. Batas waktu `payment_due_at` (bawaan 24 jam). | Admin **Konfirmasi Pembayaran** → `paid`. Lewat batas → `expired` + email. |
| `awaiting_shipping_quote` | Pesanan ≥ N eksemplar (bawaan 5), tujuan tanpa layanan kurir, atau tarif kurir tidak tersedia saat cadangan = "tahan pesanan". | Admin **Isi Ongkir & Kirim Tagihan** (menampilkan tarif RajaOngkir bila pesanan punya kecamatan tujuan) → `awaiting_transfer` + email tagihan. |
| `expired` | Tidak dibayar sampai batas waktu. | Admin **Perpanjang 24 Jam** → `awaiting_transfer` + email. Transfer yang ternyata masuk tetap bisa dikonfirmasi. |
| `paid` → `processing` → `shipped` | Lunas, disiapkan, dikirim. | Nomor resi di Dispatcher. |
| `pending` | Hanya metode gateway (Midtrans), bila diaktifkan di payment_routing. | Webhook Midtrans. |

- **Efek lunas** (stok berkurang, email konfirmasi ke pembeli, pesanan masuk hitungan "Siap Dikirim") hanya terjadi lewat `markOrderPaid`.
  - Tombol konfirmasi admin, dropdown status lunas/dikirim di Dispatcher, dan webhook Midtrans memakai fungsi yang sama.
  - Update bersyarat menjamin efeknya hanya sekali.
  - Stok tidak lagi dikurangi saat pesanan dibuat.
- **Halaman pesanan pembeli** (`/pesanan/<nomor>?t=…`, juga ditautkan di email) berisi:
  - nominal persis;
  - rincian ongkir dan kode unik;
  - rekening aktif dari tab Pembayaran;
  - batas waktu WIB;
  - tombol **Konfirmasi via WhatsApp** dengan teks "Konfirmasi pembayaran pesanan #[nomor], Rp[nominal], atas nama [nama pembeli]";
  - unggah bukti transfer (opsional, bucket privat `digital-assets`, dibuka admin lewat **Lihat Bukti Transfer**).

## 4. Pengaturan admin

- **Management Pengiriman → Ongkos Kirim Checkout Buku Cetak (RajaOngkir)**:
  - **lokasi asal pengiriman (gudang)**: cari kecamatan/kelurahan gudang, pilih, simpan. Wajib diisi; sebelum diisi
    checkout memakai cadangan;
  - kurir yang ditawarkan (bawaan JNE, POS, TIKI, SiCepat, J&T, AnterAja), dihitung dalam satu permintaan;
  - berat kemasan per pesanan (bawaan 80 g). Berat buku dari katalog (`beratGram`), bawaan 500 g per eksemplar;
  - kuota harian API (bawaan 100, paket Komerce Starter) dan **pemakaian hari ini** (x/100) dengan peringatan di 80%;
  - **cadangan saat RajaOngkir tidak tersedia/kuota habis**: tabel zona (bawaan, "ongkir estimasi") atau tahan pesanan;
  - batas N eksemplar untuk ongkir manual;
  - tabel zona cadangan.

  Pembeli mengetik kecamatan/kelurahan/kode pos (minimal 3 huruf, jeda ketik 400 ms), memilih wilayah dari hasil
  RajaOngkir, lalu memilih layanan kurir (termurah terpilih lebih dulu). Satu pemilihan wilayah = satu permintaan tarif
  untuk semua kurir. Server menghitung ulang tarif untuk wilayah, berat, dan layanan itu; tarif yang berbeda ditolak (409)
  dan pembeli memilih ulang. Hasil pencarian ditandatangani server sehingga browser tidak bisa mengganti wilayah tujuan.
  Pencarian disimpan 24 jam per kata kunci dan tarif 30 menit per (asal, tujuan, berat, kurir). Penghitung harian
  (tabel `shipping_api_usage`, tanggal WIB) hanya bertambah saat server benar-benar memanggil RajaOngkir.

  Saat RajaOngkir gagal, timeout (5 detik), kuota habis, atau API key/lokasi asal belum diatur:
  - **tabel zona**: pembeli melihat "ongkir estimasi"; pesanan `shipping_source = 'zone_fallback'` tampil dengan tanda
    **ONGKIR ESTIMASI** di Dispatcher. Admin bisa **Koreksi Ongkir & Tagih Ulang** selama belum dibayar (kode unik dan
    batas waktu baru, email tagihan ke pembeli);
  - **tahan pesanan**: status `awaiting_shipping_quote`, admin mengisi ongkir.

  Tips pencarian: nama kota besar bisa cocok dengan desa bernama sama di provinsi lain (mis. "surabaya" menampilkan
  desa Surabaya di Lampung lebih dulu). Pembeli sebaiknya mengetik nama kecamatan/kelurahan atau kode pos.
- **Pembayaran → Metode Pembayaran Checkout Buku Cetak** (`payment_routing`):
  - bawaan hanya transfer bank; metode lain Off sampai diaktifkan;
  - bila hanya satu metode aktif, checkout tidak menampilkan pilihan metode;
  - Xendit belum terpasang, sehingga pilihan Xendit diperlakukan seperti Off.
- **Kode unik** (Pembayaran, bawaan aktif):
  - nominal transfer = subtotal + ongkir − 1.000 + kode (1–999), jadi pembeli membayar Rp1–Rp999 lebih sedikit;
  - kode dipilih agar nominal berbeda dari pesanan lain yang masih menunggu transfer, sehingga Finance cukup mencocokkan mutasi;
  - potongan tercatat di `unique_discount`.
- **Batas waktu transfer** (Pembayaran): bawaan 24 jam.
- Pengaturan tersimpan di server dan terbaca checkout paling lambat 1 menit setelah disimpan.

## 5. Catatan

- Pesanan transfer manual lama berstatus `processing` dibuat sebelum status `awaiting_transfer` ada. Tinjau manual: bila belum dibayar, ubah ke `expired` atau `cancelled`.
- Pengaturan lama di tab Pembayaran dan tarif per kg di tab Pengiriman hanya tersimpan di browser dan tidak lagi dipakai checkout.
