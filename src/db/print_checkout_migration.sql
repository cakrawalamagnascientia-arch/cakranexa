-- ============================================================================
-- CHECKOUT BUKU CETAK: TRANSFER BANK, ONGKIR RAJAONGKIR/ZONA, KODE UNIK, BATAS WAKTU, PAYMENT ROUTING
-- ============================================================================
-- JALANKAN MANUAL di Supabase SQL Editor setelah src/db/institution_phase4_migration.sql. Aman dijalankan ulang.
-- Kode: backend/printCheckout (server menolak start sebelum migration ini dijalankan, lihat backend/startupChecks.ts).
--
--  - Status baru: awaiting_transfer (menunggu transfer manual, batas waktu payment_due_at), awaiting_shipping_quote
--    (pesanan >= N eksemplar menunggu ongkir dari admin), expired (tidak dibayar sampai batas waktu).
--  - Efek "lunas" (stok, email pembeli) hanya lewat markOrderPaid; paid_at / payment_confirmed_by mencatatnya.
--  - Ongkir: tarif kurir RajaOngkir untuk kecamatan tujuan (shipping_source = 'rajaongkir'); saat RajaOngkir tidak
--    tersedia/kuota habis: estimasi tabel zona ('zone_fallback', admin bisa mengoreksi) atau diisi admin ('manual',
--    juga untuk pesanan besar).
--  - Kode unik: total_amount = subtotal_amount + shipping_fee - unique_discount (unique_discount = 1000 - unique_code).
--  - Bukti transfer pembeli di bucket privat digital-assets (payment_proof_path), bukan URL publik.
--  - Data lama tidak diubah, kecuali penandaan is_test pada pesanan uji di bagian 5.
-- ============================================================================

-- 1. STATUS PESANAN -----------------------------------------------------------------------
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (
    payment_status IN ('pending', 'awaiting_transfer', 'awaiting_shipping_quote', 'paid', 'processing', 'shipped', 'failed', 'cancelled', 'expired')
);

-- 2. KOLOM PESANAN (null pada pesanan lama) -----------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_zone TEXT;                 -- id zona (src/data/shippingZones.ts)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS copies INTEGER CHECK (copies IS NULL OR copies > 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_amount BIGINT CHECK (subtotal_amount IS NULL OR subtotal_amount >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS unique_code SMALLINT CHECK (unique_code IS NULL OR unique_code BETWEEN 1 AND 999);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS unique_discount INTEGER NOT NULL DEFAULT 0 CHECK (unique_discount BETWEEN 0 AND 999);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_due_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_by TEXT;          -- 'admin' | 'midtrans'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;             -- catatan admin / id transaksi gateway
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS due_extended_count INTEGER NOT NULL DEFAULT 0 CHECK (due_extended_count >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_path TEXT;            -- bucket privat, dibuka lewat endpoint admin
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_quoted_at TIMESTAMPTZ;
-- Ongkir RajaOngkir: sumber ongkir, kecamatan tujuan (id & label RajaOngkir), berat kiriman, estimasi kurir.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_source TEXT CHECK (shipping_source IS NULL OR shipping_source IN ('rajaongkir', 'zone_fallback', 'manual'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_destination_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_destination_label TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_weight_gram INTEGER CHECK (shipping_weight_gram IS NULL OR shipping_weight_gram > 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_etd TEXT;

-- Job kedaluwarsa (tiap 15 menit) hanya membaca pesanan yang menunggu transfer.
CREATE INDEX IF NOT EXISTS idx_orders_awaiting_transfer_due ON orders (payment_due_at) WHERE payment_status = 'awaiting_transfer';

-- 3. PENGATURAN CHECKOUT (singleton id = 1; diubah admin di tab Management Pengiriman / Pembayaran) ----------
-- zones NULL = tabel zona bawaan di kode (src/data/shippingZones.ts) sampai admin menyimpan tabel zona sendiri.
CREATE TABLE IF NOT EXISTS print_checkout_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    zones JSONB,
    manual_quote_min_copies INTEGER NOT NULL DEFAULT 5 CHECK (manual_quote_min_copies BETWEEN 2 AND 1000),
    unique_code_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    transfer_due_hours INTEGER NOT NULL DEFAULT 24 CHECK (transfer_due_hours BETWEEN 1 AND 168),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO print_checkout_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
-- Ongkir RajaOngkir: cadangan saat tarif kurir tidak tersedia/kuota habis (tabel zona = bawaan, atau tahan pesanan),
-- lokasi asal pengiriman (kecamatan RajaOngkir, diisi admin), kurir yang ditawarkan (NULL = daftar bawaan di kode),
-- berat kemasan per pesanan (bawaan 80 g), dan kuota harian API (paket Starter: 100 permintaan).
ALTER TABLE print_checkout_settings ADD COLUMN IF NOT EXISTS fallback_mode TEXT NOT NULL DEFAULT 'zone_table' CHECK (fallback_mode IN ('zone_table', 'hold_order'));
ALTER TABLE print_checkout_settings ADD COLUMN IF NOT EXISTS origin_id INTEGER CHECK (origin_id IS NULL OR origin_id > 0);
ALTER TABLE print_checkout_settings ADD COLUMN IF NOT EXISTS origin_label TEXT;
ALTER TABLE print_checkout_settings ADD COLUMN IF NOT EXISTS couriers TEXT[];
ALTER TABLE print_checkout_settings ADD COLUMN IF NOT EXISTS packaging_gram INTEGER NOT NULL DEFAULT 80 CHECK (packaging_gram BETWEEN 0 AND 5000);
ALTER TABLE print_checkout_settings ADD COLUMN IF NOT EXISTS daily_quota INTEGER NOT NULL DEFAULT 100 CHECK (daily_quota BETWEEN 1 AND 100000);

-- Pemakaian API RajaOngkir per hari (tanggal WIB). Bertambah hanya saat server benar-benar memanggil API (cache tidak
-- dihitung); tampil di Management Pengiriman dengan peringatan di 80%. Kuota habis -> checkout memakai cadangan.
CREATE TABLE IF NOT EXISTS shipping_api_usage (
    usage_date DATE PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PAYMENT ROUTING (docs/PAYMENT-PROVIDER-BRIEF.md) ---------------------------------------
-- Saat ini dibaca checkout buku cetak ('print'). Bawaan: hanya transfer bank ke rekening PT; metode lain 'off'
-- sampai diaktifkan admin. ON CONFLICT DO NOTHING: menjalankan ulang tidak menimpa pilihan admin.
CREATE TABLE IF NOT EXISTS payment_routing (
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('print', 'digital', 'membership', 'institution')),
    method TEXT NOT NULL CHECK (method IN ('bank_transfer', 'va_bni', 'va_mandiri', 'va_bri', 'va_bca', 'qris', 'gopay', 'ovo', 'dana', 'shopeepay', 'card')),
    provider TEXT NOT NULL CHECK (provider IN ('manual', 'midtrans', 'xendit', 'off')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (transaction_type, method),
    CONSTRAINT payment_routing_manual_check CHECK (provider <> 'manual' OR method = 'bank_transfer')
);
INSERT INTO payment_routing (transaction_type, method, provider) VALUES
    ('print', 'bank_transfer', 'manual'),
    ('print', 'va_bni', 'off'),
    ('print', 'va_mandiri', 'off'),
    ('print', 'va_bri', 'off'),
    ('print', 'va_bca', 'off'),
    ('print', 'qris', 'off'),
    ('print', 'gopay', 'off'),
    ('print', 'ovo', 'off'),
    ('print', 'dana', 'off'),
    ('print', 'shopeepay', 'off'),
    ('print', 'card', 'off')
ON CONFLICT (transaction_type, method) DO NOTHING;

-- Hanya server (service role); tidak ada policy untuk anon/authenticated.
ALTER TABLE print_checkout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_routing ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_api_usage ENABLE ROW LEVEL SECURITY;

-- 5. TANDAI PESANAN UJI YANG SUDAH ADA -------------------------------------------------------
-- Pesanan uji tidak dihitung di omzet dan data royalti (kolom is_test dari print_orders_royalty_migration.sql).
-- Pratinjau sebelum menjalankan UPDATE (salin kondisi WHERE yang sama):
--   SELECT order_id, customer_name, customer_email, payment_status, created_at FROM orders WHERE ... ORDER BY created_at;
-- Kriteria: data contoh yang dulu terisi otomatis di form checkout, domain email contoh, dan penanda "test/dummy".
-- Pesanan uji lain ditandai manual lewat tombol "Tandai uji" di tab Pesanan & Dispatcher.
UPDATE orders SET is_test = TRUE
 WHERE is_test IS DISTINCT FROM TRUE
   AND (
        lower(customer_email) = 'ahmad.fauzi@universitas.ac.id'
     OR customer_name = 'Dr. Ahmad Fauzi, S.E., M.Ak.'
     OR shipping_address ILIKE 'Jl. Salemba Raya No. 4, Senen%'
     OR customer_notes = 'Mohon kemas dengan bubble wrap tebal dan box kardus buku.'
     OR customer_email ~* '@(example|test|uji)\.(com|org|net|id|test)$'
     OR customer_email ~* '(^|[._+-])(test|testing|dummy|coba)[0-9]*([._+-]|@)'
     OR customer_name ~* '\m(test|testing|dummy|uji coba)\M'
   );
