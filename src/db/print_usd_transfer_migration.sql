-- ============================================================================
-- CHECKOUT BUKU CETAK — JALUR TRANSFER DARI LUAR NEGERI (REKENING MANDIRI VALAS USD)
-- ============================================================================
-- JALANKAN MANUAL di Supabase SQL Editor (tidak dijalankan otomatis oleh aplikasi). Aman dijalankan ulang.
-- Urutan: ... -> src/db/print_checkout_migration.sql -> file ini.
--
--  - admin_bank_accounts.currency (sama dengan bank_account_currency_migration.sql) dan swift_code untuk rekening USD.
--  - orders.transfer_currency: jalur yang dipilih pembeli saat checkout transfer bank (IDR / USD). Jalur USD: nominal
--    tetap Rupiah, tanpa kode unik, batas waktu 5 hari kerja. Alur konfirmasi Finance tidak berubah.
--  - orders.usd_amount_received: catatan jumlah USD yang diterima, diisi Finance saat konfirmasi (opsional).
--  - Tidak ada data yang dihapus. Satu-satunya perubahan data: SWIFT BMRIIDJA untuk rekening USD Mandiri yang belum
--    punya kode SWIFT.
-- ============================================================================

-- 1. REKENING PERUSAHAAN ----------------------------------------------------------
ALTER TABLE public.admin_bank_accounts
    ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'IDR' CHECK (currency IN ('IDR', 'USD'));
ALTER TABLE public.admin_bank_accounts
    ADD COLUMN IF NOT EXISTS swift_code TEXT CHECK (swift_code IS NULL OR swift_code ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$');

UPDATE public.admin_bank_accounts
   SET swift_code = 'BMRIIDJA'
 WHERE currency = 'USD' AND upper(bank_code) = 'MANDIRI' AND swift_code IS NULL;

-- 2. PESANAN CETAK -----------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS transfer_currency TEXT
    CHECK (transfer_currency IS NULL OR transfer_currency IN ('IDR', 'USD'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS usd_amount_received NUMERIC(14, 2)
    CHECK (usd_amount_received IS NULL OR usd_amount_received > 0);
