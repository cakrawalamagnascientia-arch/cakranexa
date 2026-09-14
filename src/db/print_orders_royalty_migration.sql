-- ============================================================================
-- DATA ROYALTI PESANAN BUKU CETAK (disiapkan di fase 4 untuk perhitungan royalti fase 5)
-- ============================================================================
-- JALANKAN MANUAL di Supabase SQL Editor. Aman dijalankan ulang. Hanya MENAMBAH kolom ber-default; data lama dan
-- alur checkout tidak berubah. Server Render menolak start bila kolom ini belum ada (backend/startupChecks.ts), karena
-- sejak versi ini setiap pesanan baru menuliskannya (backend/printOrderRoyalty.ts).
--
-- Cutover: pesanan dengan order_items.hje_at_sale NULL dibuat SEBELUM migration ini. Fase 5 menghitungnya dengan harga
-- buku saat ini bertanda "perkiraan" dan meninjau statement periode pembukaan secara manual.
--
-- orders
--   channel               'direct' (situs) | 'member' (harga member diterapkan) | 'store' | 'marketplace' | 'bulk'
--                         (tiga terakhir untuk input manual fase 5; pesanan situs selalu direct/member).
--   discount_amount       total selisih HJE dengan harga yang dibayar (promo + harga member).
--   tax_amount            PPN yang terkandung dalam harga buku (env PPN_PERCENT; 0 sampai status PKP dikonfirmasi).
--   gateway_fee_estimate  perkiraan fee payment gateway atas total pembayaran (tarif per metode, env GATEWAY_FEE_RATES).
--   refund_status         'none' | 'partial' | 'full'; refund_amount diisi admin saat ada retur/refund.
--   is_test               pembeli di DIGITAL_BETA_EMAILS (dikecualikan dari royalti dan laporan).
-- order_items
--   hje_at_sale           harga jual eceran per eksemplar saat transaksi (harga coret bila sedang promo).
--   discount_amount       selisih HJE dengan harga yang dibayar untuk baris itu (per baris × jumlah).
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'direct';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_fee_estimate BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status VARCHAR(10) NOT NULL DEFAULT 'none';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS hje_at_sale BIGINT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_amount BIGINT NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_channel_check CHECK (channel IN ('direct', 'member', 'store', 'marketplace', 'bulk'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_refund_status_check CHECK (refund_status IN ('none', 'partial', 'full'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_royalty_amounts_check CHECK (
    discount_amount >= 0 AND tax_amount >= 0 AND gateway_fee_estimate >= 0 AND refund_amount >= 0
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE order_items ADD CONSTRAINT order_items_royalty_amounts_check CHECK (
    (hje_at_sale IS NULL OR hje_at_sale >= 0) AND discount_amount >= 0
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_royalty ON orders (created_at) WHERE is_test = FALSE;
