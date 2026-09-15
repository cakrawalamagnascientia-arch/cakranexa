# Brief: Integrasi Ongkos Kirim RajaOngkir by Komerce

TUGAS: ongkos kirim otomatis untuk checkout buku cetak memakai RajaOngkir by Komerce (API v1 baru).

## PENTING
- Gunakan API Komerce, base URL https://rajaongkir.komerce.id/api/v1, header "key: <API_KEY>".
  JANGAN memakai endpoint rajaongkir.com lama (starter/basic/pro) atau library yang memakainya.
  Rujukan: https://rajaongkir.com/docs/shipping-cost/getting_started/about dan dokumentasi Komerce.
- Akun: Komerce Collaborator paket Starter (gratis), kuota 100 permintaan/hari. Cache dan debounce WAJIB.
- Satu nama env saja: RAJAONGKIR_API_KEY. Key hanya di server (Render), tidak pernah ke bundle frontend.
- Bentuk respons API harus diverifikasi dengan panggilan sungguhan dari lokal (lihat Langkah 5), bukan ditebak.

## LANGKAH 0 — AUDIT (jangan ubah kode)
Petakan: cara ongkir dihitung sekarang (tabel zona flat hasil hotfix), field alamat di form checkout, kolom berat/dimensi di katalog, tab Management Pengiriman, dan kapan ongkir masuk ke total. Laporkan dan tunggu persetujuan.

## LANGKAH 1 — DATA
Migration (jangan jalankan otomatis):
- books.weight_grams int (default konfigurabel 500 g bila kosong).
- shipping_settings: origin_subdistrict_id, origin_label, packaging_grams (default 80), enabled_couriers text[], default_courier, free_shipping_min int null, fallback_mode enum('zone_table','hold_order') default 'zone_table', cache_ttl_minutes, daily_quota int default 100.
- shipping_quotes: order_id, courier, service, cost, etd, source enum('rajaongkir','zone_fallback','manual'), raw jsonb, quoted_at (jejak audit).
- shipping_api_usage: date, request_count (penghitung pemakaian harian).
- Tabel zona flat dari hotfix TETAP dipakai sebagai fallback; jangan dihapus.
Admin mengisi berat per buku di Katalog & Inventaris dan pengaturan asal/kurir di Management Pengiriman.

## LANGKAH 2 — BACKEND
- GET /api/shipping/destinations?q= → proxy ke destination/domestic-destination (limit 10). Cache 24 jam per kata kunci (Postgres atau memori dengan batas ukuran). Minimal 3 karakter. Rate limit per IP. Kembalikan id, label lengkap (kecamatan, kota, provinsi, kode pos). Tujuan yang dipilih ditandatangani server agar tidak bisa diganti dari browser.
- POST /api/shipping/quote {destination, items[{book_id, qty}]} → berat total = Σ(weight_grams × qty) + packaging_grams, dibulatkan ke atas ke kelipatan 1.000 g (konfigurabel). Panggil calculate/domestic-cost SATU KALI dengan origin dari shipping_settings, courier = enabled_couriers digabung ":", price=lowest. Kembalikan daftar layanan {courier, service, cost, etd} terurut termurah. Cache 30 menit per (origin, destination, weight, couriers). Timeout 5 detik.
- Setiap panggilan ke Komerce menambah shipping_api_usage; jika mencapai daily_quota → langsung fallback tanpa memanggil API.
- Fallback saat API gagal/timeout/kuota habis/asal belum diatur: sesuai fallback_mode. 'zone_table' → pakai tabel zona, tandai source='zone_fallback', pembeli melihat catatan "ongkir estimasi"; 'hold_order' → pesanan berstatus awaiting_shipping_quote dan admin mengisi ongkir (admin melihat daftar tarif RajaOngkir bila tersedia).
- Saat order dibuat: server menghitung ulang; angka browser yang berbeda ditolak (409) dan pembeli diminta memilih ulang. Simpan kurir/layanan/biaya/source ke order dan shipping_quotes. Invoice pembayaran hanya dibuat setelah ongkir final.
- Aturan pesanan ≥ N eksemplar (dari hotfix) tetap: admin mengisi ongkir.
- Opsional bila paket mendukung: pelacakan resi (track AWB) untuk halaman pesanan dan Dispatcher.

## LANGKAH 3 — FRONTEND CHECKOUT
- Pencarian alamat: ketik ≥3 huruf, debounce ≥400 ms, pilih kecamatan dari hasil; lalu daftar kurir & layanan dengan biaya dan estimasi hari; termurah terpilih lebih dulu; total diperbarui saat pilihan berubah.
- Gratis ongkir otomatis jika subtotal ≥ free_shipping_min (jika diisi).
- Pesan "ongkir estimasi" hanya saat fallback zona terpakai; "ongkir sedang dicek ke kurir" saat hold_order.
- Alamat tersimpan untuk pengguna login.
- Teks via i18n (id, en, zh); nama kecamatan tetap Bahasa Indonesia.

## LANGKAH 4 — ADMIN
- Management Pengiriman: asal (pencarian kecamatan), kurir aktif, berat kemasan, mode fallback, tabel zona fallback, gratis ongkir, tombol "Uji hitung" ke satu tujuan, dan penghitung pemakaian API hari ini (x/100) dengan peringatan di 80%.
- Katalog: kolom berat per buku dengan indikator "belum diisi".
- Dispatcher: kurir/layanan/biaya/source yang dipakai, penanda pesanan fallback agar admin bisa koreksi, kolom nomor resi (dan status pelacakan bila tersedia).

## LANGKAH 5 — VERIFIKASI
- Sebelum commit: panggil API Komerce SUNGGUHAN dari lokal dengan RAJAONGKIR_API_KEY untuk 1 pencarian ("menteng") dan 1 perhitungan ke Surabaya; sesuaikan parser dengan respons asli; simpan respons sebagai fixture tes; laporkan bentuk respons yang sebenarnya.
- Tes: (1) 2 buku 450 g + kemasan 80 g → 980 g → 1.000 g; (2) quote terurut termurah; (3) timeout/kuota habis → fallback sesuai mode, pesanan bertanda; (4) cache dipakai untuk permintaan identik; (5) angka browser berbeda → 409; (6) invoice memuat ongkir persis; (7) key tidak ada di bundle dan tidak pernah tercetak di log; (8) penghitung harian naik hanya saat API benar-benar dipanggil; (9) checkout tetap berjalan jika RajaOngkir belum dikonfigurasi (fallback zona).
- Uji manual dengan key sungguhan ke 3 tujuan (Jakarta, Surabaya, Makassar), bandingkan dengan aplikasi kurir.
- Build, lint, tes hijau. Jangan commit/push sebelum review. Laporkan env baru dan pengaturan yang harus diisi admin.

## ATURAN
- Jangan ubah alur pembayaran; ongkir hanya mengisi angka yang sudah dipakai checkout.
- Migration tidak dijalankan otomatis. Kerjakan per langkah dan laporkan.