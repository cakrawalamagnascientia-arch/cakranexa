-- ============================================================================
-- KEANGGOTAAN BERBAYAR FASE 3 — PAKET, LANGGANAN, INVOICE, DIGITAL READING SHELF, DIGITAL MEMBER PICK
-- ============================================================================
-- JALANKAN MANUAL di Supabase SQL Editor (tidak dijalankan otomatis oleh aplikasi). Aman dijalankan ulang.
-- Urutan: schema.sql -> src/db/authors_schema.sql -> src/db/i18n_content_migration.sql
--         -> src/db/digital_products_migration.sql (fase 1) -> src/db/digital_phase2_migration.sql (fase 2) -> file ini.
-- Jalankan SEBELUM men-deploy kode fase 3: server Render menolak start bila tabel di bawah belum ada
-- (backend/startupChecks.ts), sehingga Render tetap menjalankan versi sebelumnya.
--
-- Spesifikasi: docs/PHASE-3-BRIEF.md. Angka paket = seed backend/digital/membership/plans.ts (dicek otomatis oleh
-- backend/digital/__tests__/membershipMigration.test.ts).
--
-- Perubahan pada tabel fase 2 (satu-satunya yang diizinkan brief + keputusan A1):
--   * entitlements.scope ('product' | 'shelf', default 'product') dan digital_product_id boleh NULL untuk scope 'shelf'.
--     Keanggotaan Professional/Author memberi SATU baris 'shelf' per periode, bukan satu baris per judul.
--   * Indeks unik parsial (user_id, source, source_ref, starts_at) WHERE scope = 'shelf': webhook ganda tidak
--     menggandakan hak rak.
--   Baris lama tidak diubah (semuanya menjadi scope 'product'). Tidak ada data yang dihapus.
--
-- Keamanan:
--   * Tidak ada data kartu. subscriptions.midtrans_token hanya token Midtrans (saved_token_id kartu / token GoPay),
--     terenkripsi AES-256-GCM oleh server, dan kolomnya tidak bisa dibaca browser (grant per kolom).
--   * Browser hanya MEMBACA baris miliknya: subscriptions, subscription_invoices, digital_member_picks.
--     plans & plan_benefits publik. subscription_events hanya service role.
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
  CREATE TYPE entitlement_scope AS ENUM ('product', 'shelf');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE plan_shelf_access AS ENUM ('none', 'pick', 'full');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE membership_billing_cycle AS ENUM ('monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('pending', 'active', 'past_due', 'grace', 'canceled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE membership_payment_method AS ENUM ('card', 'gopay', 'va', 'qris', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_invoice_status AS ENUM ('draft', 'issued', 'paid', 'failed', 'void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- initial = pembayaran pertama; renewal = periode berikutnya; upgrade = selisih prorata; manual = pembayaran offline (admin).
DO $$ BEGIN
  CREATE TYPE subscription_invoice_kind AS ENUM ('initial', 'renewal', 'upgrade', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. ENTITLEMENTS: SCOPE 'shelf' (perluasan fase 2) --------------------------------
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS scope entitlement_scope NOT NULL DEFAULT 'product';
ALTER TABLE entitlements ALTER COLUMN digital_product_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE entitlements ADD CONSTRAINT entitlements_scope_product_check CHECK (
    (scope = 'product' AND digital_product_id IS NOT NULL) OR (scope = 'shelf' AND digital_product_id IS NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Satu baris rak per (user, sumber, periode). Baris 'product' tetap memakai entitlements_source_unique dari fase 2.
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_shelf_unique
    ON entitlements (user_id, source, source_ref, starts_at) WHERE scope = 'shelf';
CREATE INDEX IF NOT EXISTS idx_entitlements_shelf_access
    ON entitlements (user_id, status) WHERE scope = 'shelf';

-- 3. ATURAN RAK: SATU TEMPAT ---------------------------------------------------------
-- Produk masuk Digital Reading Shelf bila aktif, selesai diproses, dan shelf_entry_date <= tanggal (WIB).
-- Sama dengan isProductOnShelf() di backend/digital/entitlements.ts (server memeriksa dengan fungsi TypeScript itu
-- untuk menghindari satu query tambahan per halaman; tes PGlite memastikan keduanya sama).
-- SECURITY DEFINER: hasilnya tidak bergantung pada RLS pemanggil (hanya boolean tentang status katalog publik).
CREATE OR REPLACE FUNCTION is_product_on_shelf(p_product_id UUID, p_date DATE DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM digital_products p
         WHERE p.id = p_product_id
           AND p.is_active
           AND p.processing_status = 'ready'
           AND p.shelf_entry_date IS NOT NULL
           AND p.shelf_entry_date <= COALESCE(p_date, (NOW() AT TIME ZONE 'Asia/Jakarta')::date)
    );
$$;

-- 4. PAKET --------------------------------------------------------------------------
-- id teks stabil ('plan-reader', ...) agar seed, store memori (tes), dan produksi memakai ID yang sama.
CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (code IN ('free', 'reader', 'professional', 'author')),
    name_id TEXT NOT NULL,
    name_en TEXT NOT NULL,
    price_monthly INTEGER NOT NULL DEFAULT 0 CHECK (price_monthly >= 0),
    price_yearly INTEGER NOT NULL DEFAULT 0 CHECK (price_yearly >= 0),
    founding_price_yearly INTEGER CHECK (founding_price_yearly IS NULL OR founding_price_yearly >= 0),
    founding_cap INTEGER CHECK (founding_cap IS NULL OR founding_cap >= 0),
    founding_count INTEGER NOT NULL DEFAULT 0 CHECK (founding_count >= 0),
    max_devices INTEGER NOT NULL DEFAULT 1 CHECK (max_devices BETWEEN 1 AND 50),
    shelf_access plan_shelf_access NOT NULL DEFAULT 'none',
    print_discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (print_discount_percent BETWEEN 0 AND 100),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT plans_founding_within_cap CHECK (founding_cap IS NULL OR founding_count <= founding_cap)
);

DROP TRIGGER IF EXISTS update_plans_modtime ON plans;
CREATE TRIGGER update_plans_modtime
    BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Teks manfaat ada di i18n (digital.json, key membership.benefits.<benefit_key>).
-- feature_flag: nama flag env; awalan "!" = tampil bila flag MATI; NULL = selalu tampil.
CREATE TABLE IF NOT EXISTS plan_benefits (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    benefit_key TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    feature_flag TEXT,
    PRIMARY KEY (plan_id, benefit_key)
);

-- Seed (angka final brief fase 3). ON CONFLICT DO NOTHING: menjalankan ulang tidak menimpa perubahan admin.
INSERT INTO plans (id, code, name_id, name_en, price_monthly, price_yearly, founding_price_yearly, founding_cap, founding_count, max_devices, shelf_access, print_discount_percent, sort_order, is_active) VALUES
    ('plan-free', 'free', 'Free Circle', 'Free Circle', 0, 0, NULL, NULL, 0, 1, 'none', 0, 1, TRUE),
    ('plan-reader', 'reader', 'Reader Circle', 'Reader Circle', 39000, 390000, 299000, 1000, 0, 1, 'pick', 10, 2, TRUE),
    ('plan-professional', 'professional', 'Professional & Academic Society', 'Professional & Academic Society', 99000, 990000, 790000, 500, 0, 2, 'full', 15, 3, TRUE),
    ('plan-author', 'author', 'Author Guild', 'Author Guild', 149000, 1490000, 1190000, 250, 0, 2, 'full', 15, 4, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO plan_benefits (plan_id, benefit_key, sort_order, feature_flag) VALUES
    ('plan-free', 'account', 10, NULL),
    ('plan-free', 'newsletter', 20, NULL),
    ('plan-free', 'samples', 30, NULL),
    ('plan-free', 'wishlist', 40, NULL),
    ('plan-free', 'publicEvents', 50, NULL),
    ('plan-free', 'preorderAlerts', 60, NULL),
    ('plan-free', 'recommendations', 70, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-free', 'points', 80, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-free', 'birthdayGift', 90, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-free', 'referralBasic', 100, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'account', 10, NULL),
    ('plan-reader', 'newsletter', 20, NULL),
    ('plan-reader', 'samples', 30, NULL),
    ('plan-reader', 'wishlist', 40, NULL),
    ('plan-reader', 'publicEvents', 50, NULL),
    ('plan-reader', 'preorderAlerts', 60, NULL),
    ('plan-reader', 'digitalPick', 70, 'ENABLE_READER_DIGITAL_PICK'),
    ('plan-reader', 'memberPrintDiscount', 80, 'ENABLE_MEMBER_PRINT_DISCOUNT'),
    ('plan-reader', 'readerWallet', 90, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'memberPick', 100, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'preorderDiscount', 110, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'freeShipping', 120, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'digitalSampler', 130, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'backlistDiscount', 140, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'purchaseReward', 150, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'bookClub', 160, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'earlyAccess', 170, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'birthdayVoucher', 180, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'referral', 190, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-reader', 'annualGift', 200, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'account', 10, NULL),
    ('plan-professional', 'newsletter', 20, NULL),
    ('plan-professional', 'samples', 30, NULL),
    ('plan-professional', 'wishlist', 40, NULL),
    ('plan-professional', 'publicEvents', 50, NULL),
    ('plan-professional', 'preorderAlerts', 60, NULL),
    ('plan-professional', 'digitalShelf', 70, NULL),
    ('plan-professional', 'memberPrintDiscount', 80, 'ENABLE_MEMBER_PRINT_DISCOUNT'),
    ('plan-professional', 'proWallet', 90, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'annualCredit', 100, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'expertWebinar', 110, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'researchDigest', 120, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'companionResources', 130, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'citationTools', 140, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'executiveSummary', 150, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'readingPathway', 160, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'preorderPriority', 170, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'expertForum', 180, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'memberCertificate', 190, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-professional', 'corporateReferral', 200, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'account', 10, NULL),
    ('plan-author', 'newsletter', 20, NULL),
    ('plan-author', 'samples', 30, NULL),
    ('plan-author', 'wishlist', 40, NULL),
    ('plan-author', 'publicEvents', 50, NULL),
    ('plan-author', 'preorderAlerts', 60, NULL),
    ('plan-author', 'digitalShelf', 70, 'ENABLE_AUTHOR_GUILD_SHELF'),
    ('plan-author', 'authorOwnWorks', 80, '!ENABLE_AUTHOR_GUILD_SHELF'),
    ('plan-author', 'memberPrintDiscount', 90, 'ENABLE_MEMBER_PRINT_DISCOUNT'),
    ('plan-author', 'authorAcademy', 100, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'manuscriptClinic', 110, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'ownBooksDiscount', 120, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'authorWallet', 130, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'miniDiagnostic', 140, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'editorialDiscount', 150, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'fastTrack', 160, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'templateLibrary', 170, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'marketIntelligence', 180, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'launchBundle', 190, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'authorProfile', 200, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'authorCommunity', 210, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'referralWallet', 220, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'eventPriority', 230, 'MEMBERSHIP_EXTENDED_BENEFITS'),
    ('plan-author', 'strategySession', 240, 'MEMBERSHIP_EXTENDED_BENEFITS')
ON CONFLICT (plan_id, benefit_key) DO NOTHING;

-- Kursi Founding diambil/dilepas atomik (UPDATE bersyarat satu baris: dua pendaftar bersamaan pada kursi terakhir
-- -> hanya satu yang berhasil).
CREATE OR REPLACE FUNCTION membership_claim_founding(p_plan_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE plans
       SET founding_count = founding_count + 1
     WHERE id = p_plan_id
       AND founding_cap IS NOT NULL
       AND founding_count < founding_cap;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION membership_release_founding(p_plan_id TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE plans SET founding_count = founding_count - 1 WHERE id = p_plan_id AND founding_count > 0;
$$;

-- 5. LANGGANAN -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    plan_id TEXT NOT NULL REFERENCES plans(id),
    billing_cycle membership_billing_cycle NOT NULL,
    status subscription_status NOT NULL DEFAULT 'pending',
    is_founding BOOLEAN NOT NULL DEFAULT FALSE,
    price_locked INTEGER NOT NULL CHECK (price_locked >= 0),       -- harga periode berjalan (Founding: harga tahun pertama)
    current_period_start TIMESTAMPTZ,                               -- NULL sampai pembayaran pertama lunas
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    ended_reason TEXT,                                              -- 'unpaid' | 'canceled' | 'refunded' | 'payment_expired' | ...
    payment_method membership_payment_method NOT NULL,
    midtrans_subscription_id TEXT,                                  -- Midtrans Subscriptions (auto-debit kartu/GoPay)
    midtrans_token TEXT,                                            -- token Midtrans terenkripsi server; BUKAN nomor kartu
    midtrans_token_expires_at TIMESTAMPTZ,
    midtrans_account_id TEXT,                                       -- akun GoPay tertaut (tokenisasi)
    pending_plan_id TEXT REFERENCES plans(id),                      -- downgrade / tahunan->bulanan terjadwal di akhir periode
    pending_billing_cycle membership_billing_cycle,
    founding_ends_at TIMESTAMPTZ,                                   -- akhir harga Founding (ulang tahun pertama)
    extra_grace_days INTEGER NOT NULL DEFAULT 0 CHECK (extra_grace_days BETWEEN 0 AND 365),
    customer_email TEXT NOT NULL,
    customer_name TEXT NOT NULL DEFAULT '',
    language VARCHAR(8) NOT NULL DEFAULT 'id',
    whatsapp_number VARCHAR(20),                                    -- 628…; hanya bila anggota menyetujui pengingat WhatsApp
    whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_opt_in_at TIMESTAMPTZ,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    is_test BOOLEAN NOT NULL DEFAULT FALSE,                         -- pendaftar di DIGITAL_BETA_EMAILS
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT subscriptions_period_check CHECK (
        (current_period_start IS NULL AND current_period_end IS NULL)
        OR (current_period_start IS NOT NULL AND current_period_end > current_period_start)
    ),
    CONSTRAINT subscriptions_whatsapp_check CHECK (
        whatsapp_opt_in = FALSE OR (whatsapp_number IS NOT NULL AND whatsapp_number ~ '^628[0-9]{7,11}$')
    )
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_period ON subscriptions (status, current_period_end);
-- Satu user maksimal satu langganan yang belum berakhir (pending/active/past_due/grace).
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_open
    ON subscriptions (user_id) WHERE status IN ('pending', 'active', 'past_due', 'grace');
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_midtrans_unique
    ON subscriptions (midtrans_subscription_id) WHERE midtrans_subscription_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_subscriptions_modtime ON subscriptions;
CREATE TRIGGER update_subscriptions_modtime
    BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 6. INVOICE -------------------------------------------------------------------------
-- order_ref "SUB-YYYYMMDD-XXXXXXXXXX" stabil per tagihan; order_id Midtrans = "<order_ref>-<percobaan>".
CREATE TABLE IF NOT EXISTS subscription_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    kind subscription_invoice_kind NOT NULL,
    plan_id TEXT NOT NULL REFERENCES plans(id),
    billing_cycle membership_billing_cycle NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    status subscription_invoice_status NOT NULL DEFAULT 'issued',
    order_ref VARCHAR(64) NOT NULL UNIQUE,
    midtrans_order_id VARCHAR(80) UNIQUE,
    midtrans_snap_token TEXT,
    snap_redirect_url TEXT,
    snap_created_at TIMESTAMPTZ,
    midtrans_transaction_id TEXT,
    payment_type TEXT,
    claims_founding BOOLEAN NOT NULL DEFAULT FALSE,                 -- invoice ini memegang satu kursi Founding
    is_founding_price BOOLEAN NOT NULL DEFAULT FALSE,
    issued_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ,
    attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    failure_reason TEXT,
    is_test BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT subscription_invoices_period_check CHECK (period_end > period_start)
);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_subscription ON subscription_invoices (subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_user ON subscription_invoices (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_open ON subscription_invoices (status, due_at) WHERE status IN ('issued', 'failed');
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_paid ON subscription_invoices (paid_at) WHERE status = 'paid';
-- Satu invoice pertama/perpanjangan per periode (webhook & job bersamaan tidak membuat dua tagihan).
CREATE UNIQUE INDEX IF NOT EXISTS subscription_invoices_period_unique
    ON subscription_invoices (subscription_id, period_start) WHERE kind IN ('initial', 'renewal') AND status <> 'void';

DROP TRIGGER IF EXISTS update_subscription_invoices_modtime ON subscription_invoices;
CREATE TRIGGER update_subscription_invoices_modtime
    BEFORE UPDATE ON subscription_invoices FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 7. EVENT LANGGANAN -------------------------------------------------------------------
-- dedupe_key unik: pengingat H-7/H-3/H-1/H0, pemberitahuan Founding, dan email gagal bayar tidak terkirim dua kali.
CREATE TABLE IF NOT EXISTS subscription_events (
    id BIGSERIAL PRIMARY KEY,
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    type TEXT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daftar jenis event dibuat ulang setiap migration dijalankan (menambah jenis baru tanpa mengubah data).
ALTER TABLE subscription_events DROP CONSTRAINT IF EXISTS subscription_events_type_check;
ALTER TABLE subscription_events ADD CONSTRAINT subscription_events_type_check CHECK (type IN (
    'created', 'activated', 'renewed', 'payment_failed', 'reminder_sent', 'grace_started', 'expired', 'canceled',
    'upgraded', 'downgraded', 'founding_notice', 'invoice_issued', 'cancel_reverted', 'change_canceled',
    'payment_method_changed', 'pick_selected', 'reconciled', 'admin_extended', 'admin_grace', 'admin_plan_changed',
    'admin_founding', 'admin_canceled', 'autodebit_error', 'refunded', 'payment_orphan', 'whatsapp_failed',
    -- Fase 6 (membership_phase6_migration.sql); ada juga di sini agar menjalankan ulang file ini tidak menolak data baru.
    'plan_migration_notice', 'plan_migrated', 'title_picked', 'family_added', 'family_removed'
));

CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription ON subscription_events (subscription_id, created_at DESC);

-- 8. DIGITAL MEMBER PICK (Reader Circle) ------------------------------------------------
-- Satu judul per slot bulanan; entitlement scope 'product', source 'membership', source_ref = id pick (keputusan A2).
CREATE TABLE IF NOT EXISTS digital_member_picks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE RESTRICT,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    entitlement_id UUID REFERENCES entitlements(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT digital_member_picks_period_unique UNIQUE (subscription_id, period_start),
    CONSTRAINT digital_member_picks_period_check CHECK (period_end > period_start)
);

CREATE INDEX IF NOT EXISTS idx_digital_member_picks_user ON digital_member_picks (user_id, period_start DESC);

-- 9. HAK EKSEKUSI FUNGSI -----------------------------------------------------------------
REVOKE ALL ON FUNCTION membership_claim_founding(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION membership_release_founding(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION membership_claim_founding(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION membership_release_founding(TEXT) TO service_role;
-- Aturan rak berisi data publik (status katalog), boleh dipanggil siapa saja.
GRANT EXECUTE ON FUNCTION is_product_on_shelf(UUID, DATE) TO anon, authenticated, service_role;

-- 10. ROW LEVEL SECURITY ------------------------------------------------------------------
ALTER TABLE plans                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_benefits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_member_picks  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_select_public" ON plans;
CREATE POLICY "plans_select_public" ON plans FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS "plan_benefits_select_public" ON plan_benefits;
CREATE POLICY "plan_benefits_select_public" ON plan_benefits FOR SELECT TO anon, authenticated USING (TRUE);

-- User hanya MEMBACA baris miliknya (semua penulisan lewat server). subscription_events: tanpa policy = service role saja.
DROP POLICY IF EXISTS "subscriptions_select_own" ON subscriptions;
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscription_invoices_select_own" ON subscription_invoices;
CREATE POLICY "subscription_invoices_select_own" ON subscription_invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "digital_member_picks_select_own" ON digital_member_picks;
CREATE POLICY "digital_member_picks_select_own" ON digital_member_picks FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Kolom token/ID Midtrans dan idempotency key tidak bisa dibaca browser, bahkan untuk baris miliknya.
REVOKE SELECT ON subscriptions FROM anon, authenticated;
GRANT SELECT (
    id, user_id, plan_id, billing_cycle, status, is_founding, price_locked, current_period_start, current_period_end,
    cancel_at_period_end, canceled_at, ended_at, ended_reason, payment_method, pending_plan_id, pending_billing_cycle,
    founding_ends_at, extra_grace_days, language, whatsapp_number, whatsapp_opt_in, whatsapp_opt_in_at, created_at, updated_at
) ON subscriptions TO authenticated;
