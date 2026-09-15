TUGAS: abstraksi payment provider + integrasi Xendit, berdampingan dengan Midtrans.

KONTEKS
Midtrans sudah dipakai untuk checkout cetak (server.ts, webhook /api/payment/midtrans-webhook), pembelian digital fase 2 (prefix DIG-), keanggotaan fase 3 (SUB-), dan invoice institusi fase 4 (INST-). Aktivasi metode di Midtrans tertahan; Xendit didaftarkan paralel. Tujuan: keduanya bisa dipakai bersamaan dan dipilih lewat konfigurasi tanpa deploy, per jenis transaksi dan per metode pembayaran (mis. VA lewat Xendit, kartu/GoPay lewat Midtrans). Kode Midtrans yang ada TIDAK boleh berubah perilakunya.

LANGKAH 0 — AUDIT (jangan ubah kode)
Petakan semua titik yang memanggil Midtrans (createTransaction/Snap, webhook, status check, refund, subscription fase 3) dan semua tabel yang menyimpan order_id/gateway. Laporkan dan tunggu persetujuan.

LANGKAH 1 — ABSTRAKSI
- Buat modul backend/payments/ dengan interface PaymentProvider: createCheckout(order) → {checkoutUrl | vaNumber | qrString, providerRef, expiresAt}; verifyWebhook(req) → boolean; parseWebhook(req) → event ternormalisasi {providerRef, orderRef, status: 'paid'|'pending'|'expired'|'failed'|'refunded', amount, method, raw}; getStatus(providerRef); refund(providerRef, amount) jika didukung; supportsMethod(method); supportsRecurring().
- Implementasi MidtransProvider = pembungkus tipis atas kode yang ada (tanpa mengubah logika).
- Tabel/konfigurasi payment_routing (admin bisa ubah, dibaca dengan cache 60 detik): per transaction_type ('print','digital','membership','institution') dan per method ('va_bni','va_mandiri','va_bri','va_bca','qris','gopay','ovo','dana','shopeepay','card') → provider ('midtrans'|'xendit'|'off'). Env PAYMENT_ROUTING_DEFAULT untuk nilai awal. Frontend menampilkan hanya metode yang tidak 'off'.
- Kolom provider di semua tabel order/invoice/subscription_invoice; kolom provider_ref untuk ID di sisi provider. Order lama = 'midtrans'.
- Satu tabel payment_events untuk semua webhook yang masuk (provider, event_id/idempotency key UNIQUE, payload, processed_at), sehingga pengiriman ulang tidak diproses dua kali di provider mana pun.

LANGKAH 2 — XENDIT
- Pakai Xendit Invoice API (hosted checkout, mirip Snap): POST /v2/invoices dengan external_id = order_id kita (prefix yang sama: DIG-, SUB-, INST-, dan prefix cetak yang ada), amount, payer_email, description, items (kategori jujur: digital untuk e-book/audiobook/keanggotaan), success_redirect_url = /payment/success, failure_redirect_url = /payment/failed, invoice_duration sesuai jenis (cetak 24 jam, digital 2 jam, keanggotaan 3 hari, institusi 14 hari), payment_methods dibatasi sesuai routing.
- Webhook: POST /api/payment/xendit-webhook. Verifikasi header x-callback-token = XENDIT_WEBHOOK_TOKEN; tolak 401 jika tidak cocok. Tangani event invoice PAID/EXPIRED dan, jika dipakai langsung, VA/e-wallet/QR callback. Respons 200 cepat, proses idempoten lewat payment_events.
- Pencocokan status: job tiap 15 menit memanggil GET invoice untuk order pending > 30 menit tanpa webhook (jaga-jaga webhook gagal).
- Refund: implementasikan bila API mendukung metode tersebut; jika tidak, tandai "refund manual" di admin.
- Fee: tabel tarif per provider per metode (Xendit dari dashboard mereka, Midtrans dari tarif yang sudah dicatat) untuk fase 5.
- Recurring Xendit (kartu/direct debit) TIDAK di sesi ini; siapkan supportsRecurring()=false dan catat di docs.

LANGKAH 3 — ADMIN & FRONTEND
- Tab admin "Payment Gateway": status koneksi tiap provider (ping API dengan key), tabel routing yang bisa diubah, daftar 50 payment_events terakhir dengan status proses, tombol "cocokkan ulang" per order.
- Checkout (cetak, digital, keanggotaan): pilihan metode dibangun dari routing; jika provider Xendit, redirect ke checkoutUrl invoice; jika Midtrans, alur Snap seperti sekarang. Halaman /payment/success|failed sudah ada; pastikan menerima parameter dari keduanya.
- Semua teks baru via i18n (id, en, zh).

LANGKAH 4 — VERIFIKASI
Tes: (1) routing 'print/va_mandiri → xendit' membuat invoice Xendit dengan external_id benar; (2) webhook Xendit dengan token salah → 401; token benar → order paid, entitlement/langganan dibuat lewat jalur yang sama dengan Midtrans; (3) webhook yang sama dikirim dua kali → satu kali diproses; (4) routing diubah admin → checkout berikutnya memakai provider baru tanpa restart; (5) semua tes Midtrans yang ada tetap hijau tanpa perubahan snapshot; (6) order lama tanpa kolom provider tetap terbaca sebagai midtrans; (7) pencocokan ulang mengubah pending → paid bila invoice sudah PAID di Xendit.
Uji manual di Xendit Test Mode: bayar invoice simulasi VA dan QRIS dari dashboard test, pastikan webhook diterima (butuh ngrok untuk lokal; berikan saya panduan 5 langkah).
Build, lint, tes hijau, pemindai rahasia bundle bersih. Jangan commit/push sebelum review. Laporkan env baru: XENDIT_SECRET_KEY, XENDIT_WEBHOOK_TOKEN, XENDIT_MODE, PAYMENT_ROUTING_DEFAULT.

ATURAN
Jangan ubah perilaku alur Midtrans yang ada. Jangan simpan data kartu. Migration tidak dijalankan otomatis. Kerjakan per langkah, laporkan tiap langkah.
Untuk buku fisik (selain produk digital) tolong 