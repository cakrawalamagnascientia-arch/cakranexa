ADDENDUM: ALUR BUKU FISIK LEWAT XENDIT (melengkapi docs/PAYMENT-PROVIDER-BRIEF.md)

TUJUAN
Checkout buku cetak yang sudah berjalan (guest checkout, Midtrans Snap atau transfer manual) bisa dialihkan ke Xendit lewat payment_routing tanpa mengubah pengalaman pembeli, tanpa mengubah alur admin (Pesanan & Dispatcher, Management Pengiriman), dan tanpa mengubah notifikasi ke penulis.

LANGKAH 0 — AUDIT ALUR CETAK (jangan ubah kode)
Petakan dan laporkan: (1) tabel orders cetak dan semua statusnya (pending, paid, packed, shipped, delivered, canceled, expired?), (2) siapa yang mengubah status paid saat ini (webhook Midtrans vs admin manual untuk transfer bank), (3) di mana ongkir dihitung dan disimpan, (4) apakah stok dikurangi saat order dibuat atau saat paid, (5) di mana email notifikasi penulis/kontributor dan email pembeli dipicu, (6) apakah guest checkout menyimpan email dan nomor HP pembeli, (7) apa yang terjadi pada order yang tidak dibayar (kedaluwarsa otomatis atau menumpuk). Tunggu persetujuan.

LANGKAH 1 — CHECKOUT CETAK VIA XENDIT
- Saat routing metode → 'xendit', buat Xendit Invoice dengan: external_id = order_id cetak yang ada (jangan ganti format), amount = subtotal buku + ongkir + (PPN jika ada), items = tiap buku (nama, qty, harga, category 'physical goods') + satu baris "Ongkos kirim", payer_email dan customer.mobile_number dari form checkout (guest boleh), description "Pesanan CakraNexa #<order_id>", invoice_duration 24 jam (konfigurabel), success/failure redirect ke /payment/success|failed dengan order_id, payment_methods hanya yang diaktifkan untuk 'print' di routing.
- Xendit mengirim email/WhatsApp invoice sendiri jika diaktifkan; MATIKAN fitur notifikasi pembeli dari Xendit (should_send_email=false) agar pembeli hanya menerima email dari sistem kita (Resend), supaya bahasa dan brand konsisten.
- Simpan provider='xendit', provider_ref=invoice id, checkout_url, expires_at di order. Tombol "Bayar sekarang" di halaman konfirmasi dan di email pembeli mengarah ke checkout_url selama belum kedaluwarsa.
- Metode "Transfer bank manual" (rekening dari admin_bank_accounts) TETAP tersedia sebagai pilihan di luar gateway, dengan alur konfirmasi WhatsApp Finance dan tandai lunas oleh admin seperti sekarang. Routing dapat menyetelnya 'on'/'off'.

LANGKAH 2 — WEBHOOK & STATUS
- Event invoice PAID → order.status = paid melalui FUNGSI YANG SAMA yang dipakai webhook Midtrans (satu fungsi markOrderPaid(orderId, paymentInfo)), sehingga semua efek samping tetap berjalan identik: pengurangan stok (jika di tahap paid), email konfirmasi ke pembeli, email ke ORDER_NOTIFICATION_EMAILS, notifikasi penulis/kontributor lewat Resend, dan munculnya order di tab Pesanan & Dispatcher. Jika saat ini efek samping itu tersebar di handler Midtrans, refactor menjadi satu fungsi dulu, dengan tes snapshot yang membuktikan output Midtrans tidak berubah.
- Simpan metode yang dipakai pembeli (paid_method: va_bni, qris, dll.), paid_at, dan fee estimasi dari tabel tarif.
- Event EXPIRED → order.status = expired, kembalikan stok jika sudah dipotong, email "pesanan kedaluwarsa, buat pesanan baru". Jika alur lama tidak punya status expired, tambahkan dan pastikan admin bisa memfilternya.
- Job pencocokan tiap 15 menit untuk order pending yang lewat 30 menit tanpa webhook.
- Refund/retur cetak: tidak otomatis; admin menandai refund di sistem dan melakukan refund di dashboard Xendit; sistem mencatat refund_status untuk fase 5.

LANGKAH 3 — ADMIN & DISPATCHER
- Kolom "Gateway" dan "Metode bayar" di tab Pesanan & Dispatcher, filter per provider, tautan ke invoice di dashboard provider (bukan data kartu).
- Tombol "Kirim ulang tautan pembayaran" untuk order pending (mengirim checkout_url via email; jika kedaluwarsa, buat invoice baru dengan external_id yang sama ditambah akhiran -R1, -R2 dan catat).
- Laporan harian singkat (email ke ORDER_NOTIFICATION_EMAILS): jumlah order paid/pending/expired per provider.

LANGKAH 4 — MIGRASI BERTAHAP
- Routing awal untuk 'print': semua metode 'midtrans' (tidak berubah). Setelah Xendit Live, admin mengubah VA → 'xendit' dulu, amati 2–3 hari, lalu QRIS dan e-wallet. Kartu tetap 'midtrans' sampai kartu Xendit aktif.
- Order yang dibuat sebelum perubahan routing tetap dibayar lewat provider asalnya (provider tersimpan di order); jangan pernah memindahkan order pending ke provider lain.
- Dokumentasikan di docs/SETUP-PAYMENT.md: cara mengubah routing, cara membaca payment_events, dan prosedur jika webhook mati (pencocokan ulang manual).

LANGKAH 5 — VERIFIKASI
Tes: (1) checkout cetak 2 buku + ongkir → invoice Xendit dengan amount tepat dan item tepat; (2) webhook PAID → status paid, stok, email pembeli, email penulis, email admin semua terpicu satu kali (spy pada Resend), identik dengan hasil alur Midtrans pada order serupa (snapshot); (3) webhook PAID dikirim dua kali → satu kali efek; (4) EXPIRED → stok kembali, status expired; (5) transfer manual masih berjalan tanpa perubahan; (6) order lama (provider null) tetap tampil dan tetap bisa ditandai lunas; (7) routing 'print/va_bni' diubah ke xendit → order baru xendit, order lama tetap midtrans; (8) guest checkout tanpa akun tetap bisa membayar via Xendit.
Uji manual: satu order sungguhan bernilai kecil setelah Live, dibayar via VA, dipantau dari webhook sampai muncul di Dispatcher, lalu ditandai is_test.
Build, lint, tes hijau, pemindai rahasia bundle bersih. Jangan commit/push sebelum review.

ATURAN
- Tidak ada perubahan pada tampilan checkout selain penambahan metode dari routing; harga, ongkir, dan langkah pembeli tetap sama.
- Efek samping "order paid" harus berada di satu fungsi yang dipakai semua provider.
- Jangan matikan transfer manual; itu jalur yang menghasilkan uang selama gateway belum aktif.
- Migration tidak dijalankan otomatis; kerjakan per langkah dan laporkan.