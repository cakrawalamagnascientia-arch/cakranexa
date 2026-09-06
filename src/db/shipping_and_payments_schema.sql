-- =========================================================================
-- CAKRANEXA PUBLISHING - SUPABASE DATABASE SCHEMA
-- MODULE: SHIPPING (LOGISTICS) & PAYMENT SETTINGS MANAGEMENT
-- =========================================================================

-- 1. EXTENSIONS & FUNCTIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Function to automatically update timestamp (identik dengan yang ada di schema.sql, aman dijalankan ulang)
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- 2. TABLE: shipping_methods
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipping_methods (
    id VARCHAR(64) PRIMARY KEY,
    courier_code VARCHAR(32) NOT NULL, -- e.g. JNE, J&T, POS, SICEPAT, TIKI
    name VARCHAR(128) NOT NULL,        -- e.g. JNE Express, POS Indonesia
    service VARCHAR(64) NOT NULL,     -- e.g. REG (Reguler), YES (Ekspres)
    estimated_days VARCHAR(64) NOT NULL, -- e.g. '1 - 2 Hari Kerja'
    base_rate_per_kg NUMERIC(12, 2) NOT NULL DEFAULT 12000,
    min_cost NUMERIC(12, 2) NOT NULL DEFAULT 12000,
    free_shipping_threshold NUMERIC(12, 2) DEFAULT 300000, -- 0 or NULL if no free shipping
    is_active BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying active shipping methods
CREATE INDEX IF NOT EXISTS idx_shipping_methods_active 
ON public.shipping_methods(is_active);

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_shipping_methods_modtime
    BEFORE UPDATE ON public.shipping_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- Enable Row Level Security (RLS)
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;

-- Public can read active shipping methods
CREATE POLICY "Allow public read active shipping methods"
ON public.shipping_methods FOR SELECT
USING (is_active = true);

-- Penulisan hanya lewat server (service_role, bypass RLS). Tidak ada policy tulis untuk anon/authenticated.


-- -------------------------------------------------------------------------
-- 3. TABLE: admin_bank_accounts
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_bank_accounts (
    id VARCHAR(64) PRIMARY KEY,
    bank_name VARCHAR(64) NOT NULL,     -- e.g. Bank Mandiri, BCA, BNI
    bank_code VARCHAR(32) NOT NULL,     -- e.g. MANDIRI, BCA, BNI, BRI, BSI
    account_number VARCHAR(64) NOT NULL,-- e.g. 137-00-2884910-2
    account_holder VARCHAR(128) NOT NULL,-- e.g. PT CAKRAWALA MAGNA SCIENTIA
    branch VARCHAR(128),                -- e.g. KC Jakarta Salemba Raya
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active
ON public.admin_bank_accounts(is_active);

CREATE OR REPLACE TRIGGER update_admin_bank_accounts_modtime
    BEFORE UPDATE ON public.admin_bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

ALTER TABLE public.admin_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read active bank accounts"
ON public.admin_bank_accounts FOR SELECT
USING (is_active = true);

-- Penulisan hanya lewat server (service_role).


-- -------------------------------------------------------------------------
-- 4. TABLE: payment_settings (Singleton Config Row)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_settings (
    id VARCHAR(32) PRIMARY KEY DEFAULT 'primary_settings',
    enable_manual_transfer BOOLEAN NOT NULL DEFAULT true,
    enable_midtrans_va BOOLEAN NOT NULL DEFAULT true,
    enable_qris BOOLEAN NOT NULL DEFAULT true,
    enable_ewallet BOOLEAN NOT NULL DEFAULT true,
    enable_credit_card BOOLEAN NOT NULL DEFAULT true,
    
    qris_merchant_name VARCHAR(128) NOT NULL DEFAULT 'PT CAKRAWALA MAGNA SCIENTIA',
    qris_nmid VARCHAR(64) NOT NULL DEFAULT 'ID1020240988172',
    qris_image_url TEXT,

    admin_notification_whatsapp VARCHAR(32) NOT NULL DEFAULT '+6281288992341',
    admin_notification_email VARCHAR(128) NOT NULL DEFAULT 'finance@cakranexa.com',
    manual_transfer_instructions TEXT NOT NULL DEFAULT 'Silakan lakukan transfer sesuai total tagihan ke salah satu rekening resmi PT Cakrawala Magna Scientia. Unggah bukti transfer atau konfirmasi melalui WhatsApp Admin.',
    payment_success_note TEXT NOT NULL DEFAULT 'Pesanan Anda telah diterima redaksi. Tim logistik segera menyiapkan ekspedisi dan mengirimkan nomor resi resmi.',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read payment settings"
ON public.payment_settings FOR SELECT
USING (true);

-- Penulisan hanya lewat server (service_role).


-- -------------------------------------------------------------------------
-- 5. INITIAL SEED DATA
-- -------------------------------------------------------------------------

-- Seed Shipping Methods
INSERT INTO public.shipping_methods (id, courier_code, name, service, estimated_days, base_rate_per_kg, min_cost, free_shipping_threshold, is_active, description)
VALUES 
('jne-reg', 'JNE', 'JNE Express', 'REG (Reguler)', '2 - 3 Hari', 14000, 14000, 300000, true, 'Layanan reguler terpercaya menjangkau seluruh kecamatan dan instansi nusantara.'),
('jne-yes', 'JNE', 'JNE Express', 'YES (Yakin Esok Sampai)', '1 Hari Kerja', 25000, 25000, 500000, true, 'Prioritas penerbangan ekspres khusus dokumen & buku pegangan mendesak.'),
('jnt-ez', 'J&T', 'J&T Express', 'EZ (Standar)', '2 - 3 Hari', 13000, 13000, 300000, true, 'Penjemputan dan pengantaran 365 hari tanpa libur ke seluruh Indonesia.'),
('pos-kilat', 'POS', 'POS Indonesia', 'Kilat Khusus', '2 - 4 Hari', 12000, 12000, 250000, true, 'Spesialis pengiriman instansi kampus, perpustakaan daerah, dan pelosok.'),
('sicepat-best', 'SICEPAT', 'SiCepat Ekspres', 'BEST (Besok Sampai)', '1 Hari Kerja', 24000, 24000, 500000, true, 'Kecepatan optimal untuk ibu kota provinsi dan kota besar.'),
('sicepat-reg', 'SICEPAT', 'SiCepat Ekspres', 'REG (Reguler)', '2 - 3 Hari', 13500, 13500, 300000, true, 'Ekonomis dengan pelacakan barcode real-time akurat.'),
('tiki-reg', 'TIKI', 'TIKI', 'REG (Reguler)', '2 - 3 Hari', 13000, 13000, 300000, true, 'Jaringan ekspedisi mapan dengan komitmen penanganan buku aman.')
ON CONFLICT (id) DO NOTHING;

-- Seed Admin Bank Accounts
INSERT INTO public.admin_bank_accounts (id, bank_name, bank_code, account_number, account_holder, branch, is_active, is_default)
VALUES
('bank-mandiri-giro', 'Bank Mandiri', 'MANDIRI', '137-00-2884910-2', 'PT CAKRAWALA MAGNA SCIENTIA', 'KC Jakarta Salemba Raya', true, true),
('bank-bca-bisnis', 'Bank Central Asia (BCA)', 'BCA', '542-098-7712', 'PT CAKRAWALA MAGNA SCIENTIA', 'KCU Matraman Jakarta', true, false),
('bank-bni-giro', 'Bank Negara Indonesia (BNI)', 'BNI', '028-199-3401', 'PT CAKRAWALA MAGNA SCIENTIA', 'KC Salemba', true, false)
ON CONFLICT (id) DO NOTHING;

-- Seed Payment Settings
INSERT INTO public.payment_settings (id, enable_manual_transfer, enable_midtrans_va, enable_qris, enable_ewallet, enable_credit_card, qris_merchant_name, qris_nmid, admin_notification_whatsapp, admin_notification_email, manual_transfer_instructions, payment_success_note)
VALUES (
  'primary_settings',
  true,
  true,
  true,
  true,
  true,
  'PT CAKRAWALA MAGNA SCIENTIA',
  'ID1020240988172',
  '+6281288992341',
  'finance@cakranexa.com',
  'Transfer ke rekening Giro resmi PT Cakrawala Magna Scientia. Cantumkan ID Invoice pada berita transfer dan upload struk transfer atau hubungi WhatsApp Admin.',
  'Terima kasih! Pesanan literatur akademik Anda telah dikonfirmasi dan segera disiapkan oleh divisi penerbitan CakraNexa.'
)
ON CONFLICT (id) DO NOTHING;
