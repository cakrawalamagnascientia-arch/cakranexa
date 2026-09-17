-- ============================================================================
-- FASE 6 LANGKAH 1 — PAKET BLUE/SILVER/GOLD/PLATINUM, JATAH JUDUL, KUOTA AUDIO, AKUN KELUARGA, ROUTING
-- ============================================================================
-- JALANKAN MANUAL di Supabase SQL Editor (tidak dijalankan otomatis oleh aplikasi). Aman dijalankan ulang.
-- Urutan: ... -> src/db/membership_phase3_migration.sql -> src/db/institution_phase4_migration.sql
--         -> src/db/print_checkout_migration.sql -> file ini.
-- Spesifikasi: docs/PHASE-6-BRIEF.md (skema terkunci) + keputusan 17-09-2026.
-- Angka paket = PHASE6_PLANS di backend/digital/membership/plans.ts (dicek backend/digital/__tests__/phase6Migration.test.ts).
--
-- Sebelum menjalankan, cek pelanggan paket lama (hanya membaca):
--   SELECT p.code, s.status, count(*) FROM subscriptions s JOIN plans p ON p.id = s.plan_id
--    WHERE s.status IN ('active', 'grace', 'past_due') AND NOT s.is_test GROUP BY 1, 2;
-- Hasil nol atau tidak, file ini sama: paket baru di-UPSERT, paket lama dinonaktifkan (TIDAK dihapus) dan diberi
-- penerus (free->blue, reader->silver, professional->gold, author->platinum). Pelanggan paket lama (bila ada) tetap di
-- paketnya sampai akhir periode, mendapat pemberitahuan harga 30 hari sebelumnya, lalu diperpanjang ke paket penerus.
--
-- Perubahan lain:
--   * max_devices = 2 untuk semua paket (keputusan 10).
--   * payment_routing: baris 'digital' (checkout satuan) semuanya off, baris 'membership' transfer bank manual.
--     ON CONFLICT DO NOTHING: pilihan admin yang sudah tersimpan tidak ditimpa.
--   * reading_events.subscription_id (nullable) untuk agregasi kuota audio per langganan & akun.
--   * period_title_picks: jatah judul e-book per bulan (Silver 2, Gold 6); kuota dijaga trigger.
--   * family_members: akun keluarga Platinum (maks. family_accounts per langganan); dijaga trigger.
--   * institution_config.eba_pct 40 -> 20 (hanya bila masih nilai bawaan 40); default kolom kontrak 20.
--   Tidak ada data yang dihapus. entitlements source 'purchase' lama tetap dibaca.
-- ============================================================================

-- 1. PAKET --------------------------------------------------------------------------
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_code_check;
ALTER TABLE plans ADD CONSTRAINT plans_code_check
    CHECK (code IN ('free', 'reader', 'professional', 'author', 'blue', 'silver', 'gold', 'platinum'));

-- NULL = tanpa batas (paket rak penuh lama) atau tidak berlaku (Blue).
ALTER TABLE plans ADD COLUMN IF NOT EXISTS ebook_titles_per_period INTEGER
    CHECK (ebook_titles_per_period IS NULL OR ebook_titles_per_period BETWEEN 0 AND 100);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS audio_hours_per_period INTEGER
    CHECK (audio_hours_per_period IS NULL OR audio_hours_per_period BETWEEN 0 AND 1000);
-- Hari setelah shelf_entry_date sampai judul terbuka untuk paket ini; NULL = rak tidak dibuka (Blue: sampel saja).
ALTER TABLE plans ADD COLUMN IF NOT EXISTS frontlist_days INTEGER
    CHECK (frontlist_days IS NULL OR frontlist_days BETWEEN 0 AND 3650);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS offline_titles INTEGER NOT NULL DEFAULT 0
    CHECK (offline_titles BETWEEN 0 AND 100);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS family_accounts INTEGER NOT NULL DEFAULT 0
    CHECK (family_accounts BETWEEN 0 AND 10);
-- Paket lama -> paket baru saat perpanjangan.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS successor_plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL;

-- Paket baru (UPSERT: menjalankan ulang mengembalikan angka skema terkunci). Tanpa Founding perorangan.
INSERT INTO plans (id, code, name_id, name_en, price_monthly, price_yearly, founding_price_yearly, founding_cap, founding_count,
                   max_devices, shelf_access, print_discount_percent, sort_order, is_active,
                   ebook_titles_per_period, audio_hours_per_period, frontlist_days, offline_titles, family_accounts, successor_plan_id) VALUES
    ('plan-blue', 'blue', 'Blue', 'Blue', 0, 0, NULL, NULL, 0, 2, 'none', 0, 11, TRUE, NULL, NULL, NULL, 0, 0, NULL),
    ('plan-silver', 'silver', 'Silver', 'Silver', 49000, 490000, NULL, NULL, 0, 2, 'pick', 10, 12, TRUE, 2, 5, 90, 0, 0, NULL),
    ('plan-gold', 'gold', 'Gold', 'Gold', 99000, 990000, NULL, NULL, 0, 2, 'pick', 15, 13, TRUE, 6, 20, 45, 2, 0, NULL),
    ('plan-platinum', 'platinum', 'Platinum', 'Platinum', 199000, 1990000, NULL, NULL, 0, 2, 'full', 15, 14, TRUE, NULL, 60, 0, 5, 2, NULL)
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name_id = EXCLUDED.name_id,
    name_en = EXCLUDED.name_en,
    price_monthly = EXCLUDED.price_monthly,
    price_yearly = EXCLUDED.price_yearly,
    founding_price_yearly = NULL,
    founding_cap = NULL,
    max_devices = EXCLUDED.max_devices,
    shelf_access = EXCLUDED.shelf_access,
    print_discount_percent = EXCLUDED.print_discount_percent,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    ebook_titles_per_period = EXCLUDED.ebook_titles_per_period,
    audio_hours_per_period = EXCLUDED.audio_hours_per_period,
    frontlist_days = EXCLUDED.frontlist_days,
    offline_titles = EXCLUDED.offline_titles,
    family_accounts = EXCLUDED.family_accounts,
    successor_plan_id = NULL;

-- Paket lama: nonaktif (tidak bisa dipilih), penerus untuk perpanjangan, 2 perangkat. Baris tidak dihapus.
UPDATE plans SET is_active = FALSE, max_devices = 2, successor_plan_id = 'plan-blue' WHERE id = 'plan-free';
UPDATE plans SET is_active = FALSE, max_devices = 2, successor_plan_id = 'plan-silver' WHERE id = 'plan-reader';
UPDATE plans SET is_active = FALSE, max_devices = 2, successor_plan_id = 'plan-gold' WHERE id = 'plan-professional';
UPDATE plans SET is_active = FALSE, max_devices = 2, successor_plan_id = 'plan-platinum' WHERE id = 'plan-author';
ALTER TABLE plans ALTER COLUMN max_devices SET DEFAULT 2;

-- Manfaat paket baru (teks di digital.json membership.benefits.<key>). UPSERT agar urutan ikut seed.
INSERT INTO plan_benefits (plan_id, benefit_key, sort_order, feature_flag) VALUES
    ('plan-blue', 'account', 10, NULL),
    ('plan-blue', 'samples', 20, NULL),
    ('plan-blue', 'audioSample', 30, NULL),
    ('plan-blue', 'newsletter', 40, NULL),
    ('plan-blue', 'devicesTwo', 50, NULL),
    ('plan-silver', 'titleQuota', 10, NULL),
    ('plan-silver', 'audioHours', 20, NULL),
    ('plan-silver', 'frontlistDays', 30, NULL),
    ('plan-silver', 'devicesTwo', 40, NULL),
    ('plan-silver', 'memberPrintDiscount', 50, 'ENABLE_MEMBER_PRINT_DISCOUNT'),
    ('plan-gold', 'titleQuota', 10, NULL),
    ('plan-gold', 'audioHours', 20, NULL),
    ('plan-gold', 'frontlistDays', 30, NULL),
    ('plan-gold', 'offlineTitles', 40, NULL),
    ('plan-gold', 'notesHighlights', 50, NULL),
    ('plan-gold', 'formatSync', 60, NULL),
    ('plan-gold', 'devicesTwo', 70, NULL),
    ('plan-gold', 'memberPrintDiscount', 80, 'ENABLE_MEMBER_PRINT_DISCOUNT'),
    ('plan-platinum', 'fullShelf', 10, NULL),
    ('plan-platinum', 'audioHours', 20, NULL),
    ('plan-platinum', 'frontlistFirstDay', 30, NULL),
    ('plan-platinum', 'offlineTitles', 40, NULL),
    ('plan-platinum', 'notesHighlights', 50, NULL),
    ('plan-platinum', 'formatSync', 60, NULL),
    ('plan-platinum', 'familyAccounts', 70, NULL),
    ('plan-platinum', 'devicesTwo', 80, NULL),
    ('plan-platinum', 'memberPrintDiscount', 90, 'ENABLE_MEMBER_PRINT_DISCOUNT')
ON CONFLICT (plan_id, benefit_key) DO UPDATE SET sort_order = EXCLUDED.sort_order, feature_flag = EXCLUDED.feature_flag;

-- Jenis event baru: pemberitahuan pindah paket, jatah judul, akun keluarga.
ALTER TABLE subscription_events DROP CONSTRAINT IF EXISTS subscription_events_type_check;
ALTER TABLE subscription_events ADD CONSTRAINT subscription_events_type_check CHECK (type IN (
    'created', 'activated', 'renewed', 'payment_failed', 'reminder_sent', 'grace_started', 'expired', 'canceled',
    'upgraded', 'downgraded', 'founding_notice', 'invoice_issued', 'cancel_reverted', 'change_canceled',
    'payment_method_changed', 'pick_selected', 'reconciled', 'admin_extended', 'admin_grace', 'admin_plan_changed',
    'admin_founding', 'admin_canceled', 'autodebit_error', 'refunded', 'payment_orphan', 'whatsapp_failed',
    'plan_migration_notice', 'plan_migrated', 'title_picked', 'family_added', 'family_removed'
));

-- 2. PAYMENT ROUTING ----------------------------------------------------------------
INSERT INTO payment_routing (transaction_type, method, provider) VALUES
    ('digital', 'bank_transfer', 'off'),
    ('digital', 'va_bni', 'off'),
    ('digital', 'va_mandiri', 'off'),
    ('digital', 'va_bri', 'off'),
    ('digital', 'va_bca', 'off'),
    ('digital', 'qris', 'off'),
    ('digital', 'gopay', 'off'),
    ('digital', 'ovo', 'off'),
    ('digital', 'dana', 'off'),
    ('digital', 'shopeepay', 'off'),
    ('digital', 'card', 'off'),
    ('membership', 'bank_transfer', 'manual'),
    ('membership', 'va_bni', 'off'),
    ('membership', 'va_mandiri', 'off'),
    ('membership', 'va_bri', 'off'),
    ('membership', 'va_bca', 'off'),
    ('membership', 'qris', 'off'),
    ('membership', 'gopay', 'off'),
    ('membership', 'ovo', 'off'),
    ('membership', 'dana', 'off'),
    ('membership', 'shopeepay', 'off'),
    ('membership', 'card', 'off')
ON CONFLICT (transaction_type, method) DO NOTHING;

-- 3. KUOTA AUDIO ----------------------------------------------------------------------
ALTER TABLE reading_events ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reading_events_subscription_audio
    ON reading_events (subscription_id, user_id, created_at) WHERE subscription_id IS NOT NULL AND unit = 'second';

-- Detik konten tervalidasi (unit_end - unit_start) satu akun dalam satu langganan pada rentang waktu.
CREATE OR REPLACE FUNCTION membership_audio_seconds(p_subscription_id UUID, p_user_id UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS BIGINT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(SUM(unit_end - unit_start), 0)::BIGINT
      FROM reading_events
     WHERE subscription_id = p_subscription_id
       AND user_id = p_user_id
       AND unit = 'second'
       AND created_at >= p_from
       AND created_at < p_to;
$$;

-- 4. JATAH JUDUL PER BULAN ----------------------------------------------------------------
-- Satu baris per judul yang dibuka dengan jatah pada satu slot bulanan; slot berikutnya boleh memilih judul yang sama.
CREATE TABLE IF NOT EXISTS period_title_picks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE RESTRICT,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    entitlement_id UUID REFERENCES entitlements(id) ON DELETE SET NULL,
    picked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT period_title_picks_unique UNIQUE (subscription_id, user_id, period_start, digital_product_id),
    CONSTRAINT period_title_picks_period_check CHECK (period_end > period_start)
);

CREATE INDEX IF NOT EXISTS idx_period_title_picks_slot ON period_title_picks (subscription_id, user_id, period_start);

-- Kuota dijaga di database (dua klik bersamaan tidak melewati batas). Pesan 'title_quota_full' dikenali server.
CREATE OR REPLACE FUNCTION period_title_picks_enforce_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER;
    v_used INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('period_title_picks:' || NEW.subscription_id::text || ':' || NEW.user_id::text));
    SELECT p.ebook_titles_per_period INTO v_limit
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.id = NEW.subscription_id;
    IF v_limit IS NULL THEN
        RAISE EXCEPTION 'title_quota_unavailable' USING ERRCODE = 'P0001';
    END IF;
    -- Judul yang sudah dipilih di slot ini: biarkan constraint unik yang menolak (23505), bukan pesan jatah penuh.
    IF EXISTS (SELECT 1 FROM period_title_picks
                WHERE subscription_id = NEW.subscription_id AND user_id = NEW.user_id
                  AND period_start = NEW.period_start AND digital_product_id = NEW.digital_product_id) THEN
        RETURN NEW;
    END IF;
    SELECT count(*) INTO v_used
      FROM period_title_picks
     WHERE subscription_id = NEW.subscription_id AND user_id = NEW.user_id AND period_start = NEW.period_start;
    IF v_used >= v_limit THEN
        RAISE EXCEPTION 'title_quota_full' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS period_title_picks_quota ON period_title_picks;
CREATE TRIGGER period_title_picks_quota
    BEFORE INSERT ON period_title_picks FOR EACH ROW EXECUTE FUNCTION period_title_picks_enforce_quota();

-- 5. AKUN KELUARGA PLATINUM -----------------------------------------------------------------
-- Tiap anggota punya rak, perangkat, sesi, dan kuota audio sendiri (hak rak source 'membership', source_ref = langganan pemilik).
CREATE TABLE IF NOT EXISTS family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMPTZ,
    CONSTRAINT family_members_removed_check CHECK ((status = 'removed') = (removed_at IS NOT NULL))
);

-- Satu akun hanya bisa menjadi anggota keluarga aktif di satu langganan.
CREATE UNIQUE INDEX IF NOT EXISTS family_members_one_active
    ON family_members (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_family_members_owner ON family_members (owner_subscription_id) WHERE status = 'active';

CREATE OR REPLACE FUNCTION family_members_enforce_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER;
    v_owner UUID;
    v_used INTEGER;
BEGIN
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('family_members:' || NEW.owner_subscription_id::text));
    SELECT p.family_accounts, s.user_id INTO v_limit, v_owner
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.id = NEW.owner_subscription_id;
    IF v_owner = NEW.user_id THEN
        RAISE EXCEPTION 'family_owner' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO v_used
      FROM family_members
     WHERE owner_subscription_id = NEW.owner_subscription_id AND status = 'active' AND id <> NEW.id;
    IF v_used >= COALESCE(v_limit, 0) THEN
        RAISE EXCEPTION 'family_full' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_members_limit ON family_members;
CREATE TRIGGER family_members_limit
    BEFORE INSERT OR UPDATE OF status ON family_members FOR EACH ROW EXECUTE FUNCTION family_members_enforce_limit();

-- 6. KREDIT INSTANSI 20% -----------------------------------------------------------------------
UPDATE institution_config SET value = '20', description = 'Persen biaya tahunan yang dibayar yang menjadi kredit akhir periode (buku cetak atau potongan perpanjangan)'
 WHERE key = 'eba_pct' AND value = '40'::jsonb;
ALTER TABLE institution_contracts ALTER COLUMN eba_pct SET DEFAULT 20;

-- 7. HAK EKSEKUSI & ROW LEVEL SECURITY ----------------------------------------------------------
REVOKE ALL ON FUNCTION membership_audio_seconds(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION membership_audio_seconds(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

ALTER TABLE period_title_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- Browser hanya MEMBACA baris miliknya; semua penulisan lewat server.
DROP POLICY IF EXISTS "period_title_picks_select_own" ON period_title_picks;
CREATE POLICY "period_title_picks_select_own" ON period_title_picks FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "family_members_select_own" ON family_members;
CREATE POLICY "family_members_select_own" ON family_members FOR SELECT TO authenticated USING (auth.uid() = user_id);
