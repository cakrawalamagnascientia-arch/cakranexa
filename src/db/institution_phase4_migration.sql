-- ============================================================================
-- AKSES INSTITUSI FASE 4 — INSTITUSI, KONTRAK, INVOICE, ANGGOTA, READING LIST, EBA, PENGGUNAAN
-- ============================================================================
-- JALANKAN MANUAL di Supabase SQL Editor (tidak dijalankan otomatis oleh aplikasi). Aman dijalankan ulang.
-- Urutan: ... -> src/db/membership_phase3_migration.sql (fase 3) -> file ini.
-- Spesifikasi: docs/PHASE-4-BRIEF. Angka tier/skala/Founding/EBA = src/data/membership.ts (dicek otomatis oleh
-- backend/digital/__tests__/institutionMigration.test.ts).
--
-- Perubahan pada tabel fase sebelumnya (hanya menambah kolom nullable, data lama tidak diubah):
--   * access_sessions.institution_id  — sesi yang memakai hak akses institusi (dasar batas pengguna bersamaan).
--   * reading_events.institution_id   — verified reading pengguna institusi (dasar Author Royalty Pool institusi fase 5).
-- Hak akses anggota memakai entitlements yang sudah ada: source 'institution', scope 'shelf', source_ref = id kontrak.
--
-- Keamanan & privasi:
--   * Admin institusi hanya membaca data institusinya; anggota biasa hanya baris keanggotaannya dan reading list
--     yang dipublikasikan. Laporan penggunaan berbentuk agregat harian (tanpa riwayat baca per individu).
--   * Konfigurasi, tier/harga, kode gabung, tugas, dan event hanya untuk server (service role).
-- ============================================================================

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. ENUM ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE institution_org_type AS ENUM ('university', 'school', 'library', 'government', 'firm', 'company', 'research', 'nonprofit', 'training_center');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_status AS ENUM ('prospect', 'trial', 'active', 'grace', 'expired', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_tier AS ENUM ('starter', 'campus', 'network', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_contract_status AS ENUM ('draft', 'issued', 'active', 'grace', 'expired', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_collection_scope AS ENUM ('full', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_invoice_status AS ENUM ('draft', 'issued', 'paid', 'overdue', 'void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_payment_method AS ENUM ('transfer', 'va', 'midtrans', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_member_role AS ENUM ('member', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_member_status AS ENUM ('invited', 'active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- invite = undangan email/CSV; domain = email domain institusi; code = kode gabung; ip = tamu jaringan kampus (flag);
-- admin = ditambahkan admin CakraNexa.
DO $$ BEGIN
  CREATE TYPE institution_join_method AS ENUM ('invite', 'domain', 'code', 'ip', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_eba_type AS ENUM ('credit', 'debit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_request_type AS ENUM ('course_adoption', 'reading_list', 'quote', 'renewal', 'acquisition', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_request_status AS ENUM ('open', 'in_progress', 'done', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. KONFIGURASI & TINGKAT ---------------------------------------------------------
-- Nilai yang bisa diubah admin CakraNexa tanpa deploy. ON CONFLICT DO NOTHING: menjalankan ulang tidak menimpa perubahan.
CREATE TABLE IF NOT EXISTS institution_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_institution_config_modtime ON institution_config;
CREATE TRIGGER update_institution_config_modtime
    BEFORE UPDATE ON institution_config FOR EACH ROW EXECUTE FUNCTION update_modified_column();

INSERT INTO institution_config (key, value, description) VALUES
    ('eba_pct', '40', 'Persen biaya tahunan yang benar-benar ditagih yang menjadi kredit EBA di akhir periode'),
    ('eba_expiry_days', '90', 'Kredit EBA hangus sekian hari setelah periode kontrak berakhir'),
    ('founding_cap', '30', 'Kuota institusi Founding (dihitung dari institusi active + grace)'),
    ('founding_discount_pct', '15', 'Diskon Founding tahun pertama (%)'),
    ('catalog_scale', '[{"min_titles":150,"pct":100},{"min_titles":100,"pct":80},{"min_titles":50,"pct":60},{"min_titles":0,"pct":40}]', 'Skala harga menurut jumlah judul di rak saat kontrak dibuat'),
    ('ppn_pct', '0', 'PPN invoice institusi (%); 0 sampai status PKP dikonfirmasi'),
    ('invoice_due_days', '14', 'Jatuh tempo invoice (hari sejak terbit)'),
    ('grace_days', '14', 'Masa tenggang kontrak setelah period_end (hari)'),
    ('trial_days', '30', 'Lama kontrak trial gratis (hari, maksimal sekali per institusi)'),
    ('renewal_notice_days', '[60, 30]', 'Pemberitahuan perpanjangan (hari sebelum period_end)'),
    ('license_price_multiplier', '5', 'Harga lisensi permanen default = harga e-book satuan × nilai ini'),
    ('license_concurrent_users', '5', 'Pengguna bersamaan per lisensi permanen'),
    ('ip_guest_session_hours', '4', 'Lama sesi tamu jaringan institusi (ENABLE_IP_ACCESS)')
ON CONFLICT (key) DO NOTHING;

-- Tingkat kontrak (dokumen strategi Bab VII). Harga penuh untuk katalog >= 150 judul; enterprise = penawaran khusus.
CREATE TABLE IF NOT EXISTS institution_tiers (
    tier institution_tier PRIMARY KEY,
    name TEXT NOT NULL,
    concurrent_users INTEGER CHECK (concurrent_users IS NULL OR concurrent_users > 0),
    admin_seats INTEGER CHECK (admin_seats IS NULL OR admin_seats > 0),
    full_price INTEGER CHECK (full_price IS NULL OR full_price >= 0),
    report_cadence TEXT CHECK (report_cadence IS NULL OR report_cadence IN ('quarterly', 'monthly', 'monthly_analysis')),
    webinars_per_year INTEGER CHECK (webinars_per_year IS NULL OR webinars_per_year >= 0),
    print_discount_pct INTEGER CHECK (print_discount_pct IS NULL OR print_discount_pct BETWEEN 0 AND 100),
    bulk_order_min INTEGER CHECK (bulk_order_min IS NULL OR bulk_order_min > 0),
    reading_lists_per_year INTEGER CHECK (reading_lists_per_year IS NULL OR reading_lists_per_year >= 0),
    account_manager BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_institution_tiers_modtime ON institution_tiers;
CREATE TRIGGER update_institution_tiers_modtime
    BEFORE UPDATE ON institution_tiers FOR EACH ROW EXECUTE FUNCTION update_modified_column();

INSERT INTO institution_tiers (tier, name, concurrent_users, admin_seats, full_price, report_cadence, webinars_per_year, print_discount_pct, bulk_order_min, reading_lists_per_year, account_manager, sort_order) VALUES
    ('starter', 'Starter', 5, 1, 9900000, 'quarterly', 2, 20, 25, 2, FALSE, 1),
    ('campus', 'Campus', 20, 3, 24900000, 'monthly', 4, 25, 50, 6, FALSE, 2),
    ('network', 'Network', 50, 10, 59900000, 'monthly_analysis', 8, 30, 100, 12, TRUE, 3),
    ('enterprise', 'Consortium / Enterprise', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, TRUE, 4)
ON CONFLICT (tier) DO NOTHING;

-- 3. INSTITUSI ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(80) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),   -- /institutions/join/<slug>
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200),
    type institution_org_type NOT NULL,
    address TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone VARCHAR(40),
    npwp TEXT,
    email_domains TEXT[] NOT NULL DEFAULT '{}',          -- huruf kecil, mis. {"ui.ac.id"} (auto-join lewat email terverifikasi)
    ip_ranges CIDR[],                                    -- akses tamu jaringan institusi (ENABLE_IP_ACCESS)
    status institution_status NOT NULL DEFAULT 'prospect',
    inquiry_id UUID REFERENCES institution_inquiries(id) ON DELETE SET NULL,   -- dikonversi dari permintaan penawaran fase 1
    account_manager TEXT,
    logo_url TEXT,
    show_logo_public BOOLEAN NOT NULL DEFAULT FALSE,     -- logo mitra di /institutions hanya bila diizinkan
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institutions_status ON institutions (status);
CREATE INDEX IF NOT EXISTS idx_institutions_domains ON institutions USING GIN (email_domains);

DROP TRIGGER IF EXISTS update_institutions_modtime ON institutions;
CREATE TRIGGER update_institutions_modtime
    BEFORE UPDATE ON institutions FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 4. KONTRAK ---------------------------------------------------------------------------
-- contracted_price = full_price × catalog_scale_pct × (100 - founding_discount_pct), dikunci saat kontrak dibuat.
-- eba_credit = contracted_price × eba_pct (dikreditkan ke ledger di akhir periode bila lunas & bukan trial).
CREATE TABLE IF NOT EXISTS institution_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    tier institution_tier NOT NULL,
    is_trial BOOLEAN NOT NULL DEFAULT FALSE,
    concurrent_users INTEGER NOT NULL CHECK (concurrent_users > 0),
    admin_seats INTEGER NOT NULL CHECK (admin_seats > 0),
    full_price INTEGER NOT NULL CHECK (full_price >= 0),
    catalog_scale_pct INTEGER NOT NULL CHECK (catalog_scale_pct IN (40, 60, 80, 100)),
    catalog_title_count_at_signing INTEGER NOT NULL CHECK (catalog_title_count_at_signing >= 0),
    founding_discount_pct INTEGER NOT NULL DEFAULT 0 CHECK (founding_discount_pct BETWEEN 0 AND 100),
    contracted_price INTEGER NOT NULL CHECK (contracted_price >= 0),
    eba_pct INTEGER NOT NULL DEFAULT 40 CHECK (eba_pct BETWEEN 0 AND 100),
    eba_credit INTEGER NOT NULL DEFAULT 0 CHECK (eba_credit >= 0),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    grace_days INTEGER NOT NULL DEFAULT 14 CHECK (grace_days BETWEEN 0 AND 365),
    status institution_contract_status NOT NULL DEFAULT 'draft',
    collection_scope institution_collection_scope NOT NULL DEFAULT 'full',
    previous_contract_id UUID REFERENCES institution_contracts(id) ON DELETE SET NULL,   -- perpanjangan
    notes TEXT,
    signed_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT institution_contracts_period_check CHECK (period_end > period_start),
    CONSTRAINT institution_contracts_trial_check CHECK (NOT is_trial OR (contracted_price = 0 AND eba_pct = 0 AND eba_credit = 0))
);

-- Satu kontrak berjalan (active/grace) per institusi; kontrak perpanjangan yang sudah dibayar menunggu di 'issued'.
CREATE UNIQUE INDEX IF NOT EXISTS institution_contracts_one_running
    ON institution_contracts (institution_id) WHERE status IN ('active', 'grace');
-- Trial gratis maksimal sekali per institusi.
CREATE UNIQUE INDEX IF NOT EXISTS institution_contracts_one_trial
    ON institution_contracts (institution_id) WHERE is_trial;
CREATE INDEX IF NOT EXISTS idx_institution_contracts_status_period ON institution_contracts (status, period_end);

DROP TRIGGER IF EXISTS update_institution_contracts_modtime ON institution_contracts;
CREATE TRIGGER update_institution_contracts_modtime
    BEFORE UPDATE ON institution_contracts FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Koleksi custom per judul (collection_scope = 'custom'). Admin memilih judul satu per satu atau "pilih semua per
-- kategori" di UI, yang mengisi baris di sini; satu bentuk data sehingga akses, laporan, dan royalti tetap sederhana.
CREATE TABLE IF NOT EXISTS institution_contract_collections (
    contract_id UUID NOT NULL REFERENCES institution_contracts(id) ON DELETE CASCADE,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE RESTRICT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (contract_id, digital_product_id)
);

-- 5. INVOICE ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institution_invoice_counters (
    year INTEGER PRIMARY KEY CHECK (year BETWEEN 2000 AND 9999),
    last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

CREATE TABLE IF NOT EXISTS institution_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES institution_contracts(id) ON DELETE RESTRICT,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    number VARCHAR(32) NOT NULL UNIQUE CHECK (number ~ '^INV-INST-[0-9]{4}-[0-9]{4,}$'),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    tax_pct NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_pct BETWEEN 0 AND 100),
    tax_amount INTEGER NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total INTEGER NOT NULL,
    issued_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ,
    status institution_invoice_status NOT NULL DEFAULT 'draft',
    payment_method institution_payment_method,
    paid_at TIMESTAMPTZ,
    payment_reference TEXT,
    proof_path TEXT,                                     -- bukti transfer di bucket privat (bukan URL publik)
    pdf_path TEXT,                                       -- PDF invoice di bucket privat; unduh lewat tautan bertoken
    midtrans_order_id VARCHAR(80) UNIQUE,                -- opsional: VA sekali bayar, order_id berawalan INST-
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT institution_invoices_total_check CHECK (total = amount + tax_amount)
);

CREATE INDEX IF NOT EXISTS idx_institution_invoices_contract ON institution_invoices (contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_institution_invoices_open ON institution_invoices (status, due_at) WHERE status IN ('issued', 'overdue');

DROP TRIGGER IF EXISTS update_institution_invoices_modtime ON institution_invoices;
CREATE TRIGGER update_institution_invoices_modtime
    BEFORE UPDATE ON institution_invoices FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Nomor invoice berurutan per tahun (INV-INST-2026-0001), atomik walau dua admin menerbitkan bersamaan.
CREATE OR REPLACE FUNCTION next_institution_invoice_number(p_year INTEGER)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    INSERT INTO institution_invoice_counters (year, last_number) VALUES (p_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = institution_invoice_counters.last_number + 1
    RETURNING 'INV-INST-' || p_year::TEXT || '-' || lpad(last_number::TEXT, 4, '0');
$$;

-- 6. ANGGOTA ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institution_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,   -- NULL selama undangan belum diterima
    role institution_member_role NOT NULL DEFAULT 'member',
    status institution_member_status NOT NULL DEFAULT 'invited',
    invited_email TEXT CHECK (invited_email IS NULL OR invited_email = lower(invited_email)),
    invited_at TIMESTAMPTZ,
    invited_by TEXT,
    joined_at TIMESTAMPTZ,
    joined_via institution_join_method,
    group_label TEXT CHECK (group_label IS NULL OR char_length(group_label) <= 100),   -- mis. "Prodi Akuntansi 2026"
    disabled_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,                              -- tamu jaringan institusi (sesi sementara)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT institution_members_identity_check CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL),
    CONSTRAINT institution_members_active_check CHECK (status <> 'active' OR user_id IS NOT NULL),
    CONSTRAINT institution_members_user_unique UNIQUE (institution_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS institution_members_email_unique
    ON institution_members (institution_id, invited_email) WHERE invited_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_institution_members_user ON institution_members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_institution_members_status ON institution_members (institution_id, status);

DROP TRIGGER IF EXISTS update_institution_members_modtime ON institution_members;
CREATE TRIGGER update_institution_members_modtime
    BEFORE UPDATE ON institution_members FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Kode gabung (mis. AKUN-2026) dengan batas waktu dan jumlah pemakaian.
CREATE TABLE IF NOT EXISTS institution_join_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    code VARCHAR(40) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{3,39}$'),
    expires_at TIMESTAMPTZ,
    max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    group_label TEXT CHECK (group_label IS NULL OR char_length(group_label) <= 100),
    created_by TEXT,
    disabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT institution_join_codes_quota_check CHECK (max_uses IS NULL OR used_count <= max_uses)
);

-- Pakai kode secara atomik: mengembalikan institusi bila kode masih berlaku dan kuota tersisa, selain itu kosong.
CREATE OR REPLACE FUNCTION institution_use_join_code(p_code TEXT, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (code_id UUID, institution_id UUID, group_label TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE institution_join_codes c
       SET used_count = c.used_count + 1
     WHERE c.code = upper(btrim(p_code))
       AND c.disabled_at IS NULL
       AND (c.expires_at IS NULL OR c.expires_at > p_now)
       AND (c.max_uses IS NULL OR c.used_count < c.max_uses)
    RETURNING c.id, c.institution_id, c.group_label;
$$;

-- 7. READING LIST ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institution_reading_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    contract_id UUID REFERENCES institution_contracts(id) ON DELETE SET NULL,   -- kuota reading list per tier per kontrak
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institution_reading_lists_institution ON institution_reading_lists (institution_id, is_published);

DROP TRIGGER IF EXISTS update_institution_reading_lists_modtime ON institution_reading_lists;
CREATE TRIGGER update_institution_reading_lists_modtime
    BEFORE UPDATE ON institution_reading_lists FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TABLE IF NOT EXISTS institution_reading_list_items (
    list_id UUID NOT NULL REFERENCES institution_reading_lists(id) ON DELETE CASCADE,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    note TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
    PRIMARY KEY (list_id, digital_product_id)
);

-- 8. EBA WALLET & LISENSI PERMANEN --------------------------------------------------------
-- Saldo per kontrak = kredit - debit. Kredit EBA dicatat sekali (dedupe_key) di akhir periode; kredit yang tidak
-- terpakai sampai expires_at dihapus lewat baris debit 'expired'. Penukaran memakai institution_eba_debit (atomik).
CREATE TABLE IF NOT EXISTS institution_eba_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    contract_id UUID NOT NULL REFERENCES institution_contracts(id) ON DELETE RESTRICT,
    type institution_eba_type NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    reference TEXT,                                      -- 'period_end' | id lisensi | nomor pesanan cetak | 'expired'
    expires_at TIMESTAMPTZ,                              -- hanya untuk kredit
    dedupe_key TEXT UNIQUE,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT institution_eba_ledger_credit_expiry_check CHECK (type = 'debit' OR expires_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_institution_eba_ledger_contract ON institution_eba_ledger (contract_id, created_at);

-- Debit atomik: mengunci kontrak, menolak bila kredit sudah hangus atau saldo kurang. Mengembalikan saldo baru, atau
-- NULL bila ditolak. Kunci dedupe yang sama tidak mendebit dua kali (mengembalikan saldo saat ini).
CREATE OR REPLACE FUNCTION institution_eba_debit(p_contract_id UUID, p_amount INTEGER, p_reference TEXT, p_dedupe_key TEXT, p_created_by TEXT, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_institution UUID;
    v_balance INTEGER;
    v_valid BOOLEAN;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN NULL;
    END IF;
    SELECT c.institution_id INTO v_institution FROM institution_contracts c WHERE c.id = p_contract_id FOR UPDATE;
    IF v_institution IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT COALESCE(SUM(CASE WHEN l.type = 'credit' THEN l.amount ELSE -l.amount END), 0)::INTEGER INTO v_balance
      FROM institution_eba_ledger l WHERE l.contract_id = p_contract_id;
    IF p_dedupe_key IS NOT NULL AND EXISTS (SELECT 1 FROM institution_eba_ledger l WHERE l.dedupe_key = p_dedupe_key) THEN
        RETURN v_balance;
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM institution_eba_ledger l
         WHERE l.contract_id = p_contract_id AND l.type = 'credit' AND l.expires_at > p_now
    ) INTO v_valid;
    IF NOT v_valid OR v_balance < p_amount THEN
        RETURN NULL;
    END IF;
    INSERT INTO institution_eba_ledger (institution_id, contract_id, type, amount, reference, dedupe_key, created_by, created_at)
    VALUES (v_institution, p_contract_id, 'debit', p_amount, p_reference, p_dedupe_key, p_created_by, p_now);
    RETURN v_balance - p_amount;
END;
$$;

-- Lisensi permanen hasil penukaran EBA (atau pemberian admin): judul tetap dapat dibaca anggota walau kontrak
-- berakhir, dibatasi pengguna bersamaan per lisensi.
CREATE TABLE IF NOT EXISTS institution_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE RESTRICT,
    concurrent_users INTEGER NOT NULL DEFAULT 5 CHECK (concurrent_users > 0),
    price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
    source TEXT NOT NULL DEFAULT 'eba' CHECK (source IN ('eba', 'admin')),
    ledger_id UUID REFERENCES institution_eba_ledger(id) ON DELETE SET NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institution_licenses_institution ON institution_licenses (institution_id, digital_product_id);

-- Harga lisensi permanen per judul (menimpa default harga e-book × license_price_multiplier).
CREATE TABLE IF NOT EXISTS institution_license_prices (
    digital_product_id UUID PRIMARY KEY REFERENCES digital_products(id) ON DELETE CASCADE,
    price INTEGER NOT NULL CHECK (price >= 0),
    concurrent_users INTEGER NOT NULL DEFAULT 5 CHECK (concurrent_users > 0),
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. PENGGUNAAN HARIAN (agregat untuk laporan; tanpa data per individu) ------------------
CREATE TABLE IF NOT EXISTS institution_usage_daily (
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
    sessions INTEGER NOT NULL DEFAULT 0 CHECK (sessions >= 0),
    unique_users INTEGER NOT NULL DEFAULT 0 CHECK (unique_users >= 0),
    pages_read INTEGER NOT NULL DEFAULT 0 CHECK (pages_read >= 0),
    seconds_listened INTEGER NOT NULL DEFAULT 0 CHECK (seconds_listened >= 0),
    denied_concurrency INTEGER NOT NULL DEFAULT 0 CHECK (denied_concurrency >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (institution_id, date, digital_product_id)
);

-- 10. TUGAS & EVENT -----------------------------------------------------------------------
-- Tugas untuk admin CakraNexa: course adoption, permintaan reading list, penawaran, perpanjangan mendekat, akuisisi.
CREATE TABLE IF NOT EXISTS institution_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    type institution_request_type NOT NULL,
    status institution_request_status NOT NULL DEFAULT 'open',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,          -- mis. {"course":"Akuntansi Pajak","products":[...],"students":120}
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_to TEXT,
    resolution TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institution_requests_status ON institution_requests (status, created_at DESC);

DROP TRIGGER IF EXISTS update_institution_requests_modtime ON institution_requests;
CREATE TRIGGER update_institution_requests_modtime
    BEFORE UPDATE ON institution_requests FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Jejak & dedupe (email perpanjangan 60/30 hari, grace, expired, kredit EBA, laporan periodik, dsb.).
CREATE TABLE IF NOT EXISTS institution_events (
    id BIGSERIAL PRIMARY KEY,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    contract_id UUID REFERENCES institution_contracts(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institution_events_institution ON institution_events (institution_id, created_at DESC);

-- 11. PERLUASAN TABEL FASE 2 ----------------------------------------------------------------
ALTER TABLE access_sessions ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_access_sessions_institution_live
    ON access_sessions (institution_id, last_heartbeat) WHERE ended_at IS NULL AND institution_id IS NOT NULL;

ALTER TABLE reading_events ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reading_events_institution_time
    ON reading_events (institution_id, created_at) WHERE institution_id IS NOT NULL;

-- 12. SESI INSTITUSI ATOMIK (batas pengguna bersamaan) ------------------------------------
-- Mengunci baris institusi sehingga dua anggota yang membuka judul bersamaan pada slot terakhir tidak sama-sama lolos.
-- Pengguna dihitung sekali walau membuka beberapa judul; sesi dianggap hidup bila heartbeat < p_window_seconds.
-- p_scope_product_id diisi untuk lisensi permanen (batas per judul), NULL untuk kontrak (batas seluruh koleksi).
-- Mengembalikan session_id NULL bila penuh (server menjawab 429 institution_busy).
CREATE OR REPLACE FUNCTION institution_claim_session(
    p_institution_id UUID,
    p_capacity INTEGER,
    p_scope_product_id UUID,
    p_user_id UUID,
    p_product_id UUID,
    p_device_id UUID,
    p_entitlement_id UUID,
    p_token_hash TEXT,
    p_ip TEXT,
    p_user_agent TEXT,
    p_now TIMESTAMPTZ,
    p_window_seconds INTEGER
)
RETURNS TABLE (session_id UUID, in_use INTEGER, capacity INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_locked UUID;
    v_in_use INTEGER;
    v_already BOOLEAN;
    v_id UUID;
BEGIN
    SELECT i.id INTO v_locked FROM institutions i WHERE i.id = p_institution_id FOR UPDATE;
    IF v_locked IS NULL THEN
        RAISE EXCEPTION 'institution_not_found';
    END IF;

    SELECT COUNT(DISTINCT s.user_id)::INTEGER INTO v_in_use
      FROM access_sessions s
     WHERE s.institution_id = p_institution_id
       AND s.ended_at IS NULL
       AND s.last_heartbeat > p_now - make_interval(secs => p_window_seconds)
       AND (p_scope_product_id IS NULL OR s.digital_product_id = p_scope_product_id)
       AND NOT (s.user_id = p_user_id AND s.digital_product_id = p_product_id);

    SELECT EXISTS (
        SELECT 1 FROM access_sessions s
         WHERE s.institution_id = p_institution_id
           AND s.user_id = p_user_id
           AND s.ended_at IS NULL
           AND s.last_heartbeat > p_now - make_interval(secs => p_window_seconds)
           AND (p_scope_product_id IS NULL OR s.digital_product_id = p_scope_product_id)
           AND s.digital_product_id <> p_product_id
    ) INTO v_already;

    IF NOT v_already AND v_in_use >= p_capacity THEN
        RETURN QUERY SELECT NULL::UUID, v_in_use, p_capacity;
        RETURN;
    END IF;

    INSERT INTO access_sessions (user_id, digital_product_id, device_id, entitlement_id, session_token, ip, user_agent, started_at, last_heartbeat, institution_id)
    VALUES (p_user_id, p_product_id, p_device_id, p_entitlement_id, p_token_hash, p_ip, p_user_agent, p_now, p_now, p_institution_id)
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, CASE WHEN v_already THEN v_in_use ELSE v_in_use + 1 END, p_capacity;
END;
$$;

-- 13. FUNGSI BANTU RLS (SECURITY DEFINER: tidak rekursif terhadap policy institution_members) --------
CREATE OR REPLACE FUNCTION is_institution_member(p_institution_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM institution_members m
         WHERE m.institution_id = p_institution_id AND m.user_id = auth.uid() AND m.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION is_institution_admin(p_institution_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM institution_members m
         WHERE m.institution_id = p_institution_id AND m.user_id = auth.uid() AND m.status = 'active' AND m.role = 'admin'
    );
$$;

-- 14. HAK EKSEKUSI FUNGSI --------------------------------------------------------------------
REVOKE ALL ON FUNCTION next_institution_invoice_number(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION institution_use_join_code(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION institution_eba_debit(UUID, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION institution_claim_session(UUID, INTEGER, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION is_institution_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_institution_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION next_institution_invoice_number(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION institution_use_join_code(TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION institution_eba_debit(UUID, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION institution_claim_session(UUID, INTEGER, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION is_institution_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_institution_admin(UUID) TO authenticated, service_role;

-- 15. ROW LEVEL SECURITY --------------------------------------------------------------------
ALTER TABLE institution_config               ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_tiers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_contracts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_contract_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_invoice_counters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_join_codes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_reading_lists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_reading_list_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_eba_ledger           ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_licenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_license_prices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_usage_daily          ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_requests             ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_events               ENABLE ROW LEVEL SECURITY;

-- Anggota aktif melihat institusinya (nama/banner); admin institusi melihat kontrak, invoice, anggota, penggunaan,
-- ledger EBA, dan lisensinya. Tanpa policy (hanya service role): config, tiers, counters, join codes, license prices,
-- requests, events.
DROP POLICY IF EXISTS "institutions_select_member" ON institutions;
CREATE POLICY "institutions_select_member" ON institutions FOR SELECT TO authenticated USING (is_institution_member(id));

DROP POLICY IF EXISTS "institution_contracts_select_admin" ON institution_contracts;
CREATE POLICY "institution_contracts_select_admin" ON institution_contracts FOR SELECT TO authenticated USING (is_institution_admin(institution_id));

DROP POLICY IF EXISTS "institution_contract_collections_select_admin" ON institution_contract_collections;
CREATE POLICY "institution_contract_collections_select_admin" ON institution_contract_collections FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM institution_contracts c WHERE c.id = contract_id AND is_institution_admin(c.institution_id)));

DROP POLICY IF EXISTS "institution_invoices_select_admin" ON institution_invoices;
CREATE POLICY "institution_invoices_select_admin" ON institution_invoices FOR SELECT TO authenticated USING (is_institution_admin(institution_id));

DROP POLICY IF EXISTS "institution_members_select_own_or_admin" ON institution_members;
CREATE POLICY "institution_members_select_own_or_admin" ON institution_members FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR is_institution_admin(institution_id));

DROP POLICY IF EXISTS "institution_reading_lists_select" ON institution_reading_lists;
CREATE POLICY "institution_reading_lists_select" ON institution_reading_lists FOR SELECT TO authenticated
    USING (is_institution_admin(institution_id) OR (is_published AND is_institution_member(institution_id)));

DROP POLICY IF EXISTS "institution_reading_list_items_select" ON institution_reading_list_items;
CREATE POLICY "institution_reading_list_items_select" ON institution_reading_list_items FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM institution_reading_lists l
         WHERE l.id = list_id AND (is_institution_admin(l.institution_id) OR (l.is_published AND is_institution_member(l.institution_id)))
    ));

DROP POLICY IF EXISTS "institution_eba_ledger_select_admin" ON institution_eba_ledger;
CREATE POLICY "institution_eba_ledger_select_admin" ON institution_eba_ledger FOR SELECT TO authenticated USING (is_institution_admin(institution_id));

DROP POLICY IF EXISTS "institution_licenses_select_admin" ON institution_licenses;
CREATE POLICY "institution_licenses_select_admin" ON institution_licenses FOR SELECT TO authenticated USING (is_institution_admin(institution_id));

DROP POLICY IF EXISTS "institution_usage_daily_select_admin" ON institution_usage_daily;
CREATE POLICY "institution_usage_daily_select_admin" ON institution_usage_daily FOR SELECT TO authenticated USING (is_institution_admin(institution_id));
