-- ============================================================================
-- PRODUK DIGITAL FASE 2 — ENTITLEMENT, PEMBELIAN SATUAN, READER/PLAYER TERPROTEKSI
-- ============================================================================
-- JALANKAN MANUAL di Supabase SQL Editor (tidak dijalankan otomatis oleh aplikasi). Aman dijalankan ulang.
-- Urutan: schema.sql -> src/db/authors_schema.sql -> src/db/i18n_content_migration.sql
--         -> src/db/digital_products_migration.sql (fase 1) -> file ini.
-- Prasyarat: Supabase Auth aktif (tabel auth.users) dan PostgreSQL 14+ (date_bin).
--
-- Prinsip:
--   * entitlements adalah INTI hak akses. Fase ini hanya mengisinya dari pembelian satuan (source='purchase');
--     fase 3 (membership), fase 4 (institution), dan admin_grant/author cukup MENAMBAH BARIS dengan source lain.
--     Akses sah bila ADA satu entitlement status 'active' dengan starts_at <= now() dan (ends_at IS NULL atau > now()).
--   * File utuh (PDF/MP3), halaman render, dan segmen HLS hanya ada di bucket PRIVAT "digital-assets";
--     semua akses lewat backend (service role) yang memeriksa entitlement + sesi.
--   * Browser hanya boleh MEMBACA baris miliknya sendiri pada: entitlements, reading_progress, user_notes,
--     user_devices, access_sessions. Tabel lain hanya service role (RLS aktif tanpa policy).
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
  CREATE TYPE digital_processing_status AS ENUM ('none', 'processing', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE entitlement_source AS ENUM ('purchase', 'membership', 'institution', 'admin_grant', 'author');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE entitlement_status AS ENUM ('active', 'suspended', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE digital_order_status AS ENUM ('pending', 'challenge', 'paid', 'failed', 'cancelled', 'expired', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. DIGITAL PRODUCTS: FILE MASTER & STATUS PEMROSESAN ---------------------------
-- storage_path = lokasi file master di bucket privat (mis. ebooks/<id>/source.pdf). Tidak pernah dikirim ke browser.
ALTER TABLE digital_products
    ADD COLUMN IF NOT EXISTS storage_path TEXT,
    ADD COLUMN IF NOT EXISTS processing_status digital_processing_status NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS processing_error TEXT,
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS master_content_type TEXT,
    ADD COLUMN IF NOT EXISTS master_size_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS master_uploaded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_digital_products_processing
    ON digital_products (processing_status) WHERE processing_status = 'processing';

-- 3. TEKS HALAMAN E-BOOK (pencarian teks penuh) ----------------------------------
CREATE TABLE IF NOT EXISTS digital_product_pages (
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL CHECK (page_number > 0),
    text_content TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (digital_product_id, page_number)
);

-- Kolom tsvector memakai konfigurasi 'indonesian' bila tersedia di server Postgres, selain itu 'simple'.
DO $$
DECLARE
    cfg TEXT := CASE WHEN EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'indonesian') THEN 'indonesian' ELSE 'simple' END;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'digital_product_pages' AND column_name = 'search_vector'
    ) THEN
        EXECUTE format(
            'ALTER TABLE digital_product_pages ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector(%L::regconfig, coalesce(text_content, %L))) STORED',
            cfg, ''
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_digital_product_pages_search ON digital_product_pages USING GIN (search_vector);

-- Pencarian: teks penuh (websearch) dengan fallback pencocokan substring. Dipanggil server; hasil dipotong
-- menjadi cuplikan ±80 karakter di server — text_content utuh tidak pernah dikirim ke browser.
CREATE OR REPLACE FUNCTION digital_search_pages(p_product_id UUID, p_query TEXT, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (page_number INTEGER, text_content TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    cfg regconfig := COALESCE((SELECT oid::regconfig FROM pg_ts_config WHERE cfgname = 'indonesian' LIMIT 1), 'simple'::regconfig);
    lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
    q tsquery;
    pattern TEXT;
BEGIN
    IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
        RETURN;
    END IF;
    q := websearch_to_tsquery(cfg, p_query);
    RETURN QUERY
        SELECT p.page_number, p.text_content
          FROM digital_product_pages p
         WHERE p.digital_product_id = p_product_id AND p.search_vector @@ q
         ORDER BY p.page_number
         LIMIT lim;
    IF NOT FOUND THEN
        pattern := '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
        RETURN QUERY
            SELECT p.page_number, p.text_content
              FROM digital_product_pages p
             WHERE p.digital_product_id = p_product_id AND p.text_content ILIKE pattern
             ORDER BY p.page_number
             LIMIT lim;
    END IF;
END $$;

-- 4. BAB (audiobook: start_seconds; e-book: start_page) -------------------------
CREATE TABLE IF NOT EXISTS digital_product_chapters (
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL CHECK (chapter_number > 0),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
    start_seconds INTEGER CHECK (start_seconds IS NULL OR start_seconds >= 0),
    start_page INTEGER CHECK (start_page IS NULL OR start_page > 0),
    PRIMARY KEY (digital_product_id, chapter_number),
    CONSTRAINT digital_product_chapters_start_check CHECK (start_seconds IS NOT NULL OR start_page IS NOT NULL)
);

-- 5. PESANAN DIGITAL (terpisah dari orders/order_items buku cetak) ---------------
-- Tabel cetak mewajibkan alamat, kurir, dan telepon; pesanan digital tidak memilikinya, jadi dipisah agar
-- alur cetak tidak berubah. order_number berawalan "DIG-" dan dipakai sebagai order_id Midtrans;
-- webhook Midtrans yang sama mengarahkan order DIG- ke handler digital.
CREATE TABLE IF NOT EXISTS digital_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(64) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    status digital_order_status NOT NULL DEFAULT 'pending',
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'IDR',
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    language VARCHAR(8) NOT NULL DEFAULT 'id',
    license_accepted_at TIMESTAMPTZ NOT NULL,       -- persetujuan ketentuan lisensi di halaman checkout
    license_version VARCHAR(40) NOT NULL,
    snap_token TEXT,
    snap_redirect_url TEXT,
    midtrans_transaction_id TEXT,
    midtrans_status TEXT,
    payment_type TEXT,
    fraud_status TEXT,
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    confirmation_sent_at TIMESTAMPTZ,
    is_test BOOLEAN NOT NULL DEFAULT FALSE,           -- pembeli di DIGITAL_BETA_EMAILS: dikecualikan dari ringkasan penjualan
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_digital_orders_user ON digital_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_digital_orders_real ON digital_orders (created_at DESC) WHERE is_test = FALSE;

DROP TRIGGER IF EXISTS update_digital_orders_modtime ON digital_orders;
CREATE TRIGGER update_digital_orders_modtime
    BEFORE UPDATE ON digital_orders FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TABLE IF NOT EXISTS digital_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES digital_orders(id) ON DELETE CASCADE,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE RESTRICT,
    book_id VARCHAR(50) NOT NULL,
    format digital_format NOT NULL,
    title TEXT NOT NULL,                             -- salinan judul saat dibeli
    unit_price BIGINT NOT NULL CHECK (unit_price > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT digital_order_items_unique UNIQUE (order_id, digital_product_id)
);

CREATE INDEX IF NOT EXISTS idx_digital_order_items_order ON digital_order_items (order_id);

-- 6. ENTITLEMENTS (hak akses) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE RESTRICT,
    source entitlement_source NOT NULL,
    source_ref UUID,                                 -- purchase: digital_orders.id; fase 3/4: subscription/institution id
    status entitlement_status NOT NULL DEFAULT 'active',
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,                             -- NULL = seumur hidup
    max_devices INTEGER NOT NULL DEFAULT 2 CHECK (max_devices BETWEEN 1 AND 50),
    revoked_reason TEXT,
    status_changed_at TIMESTAMPTZ,
    status_changed_by TEXT,                          -- 'webhook' | 'anomaly' | 'admin:<label>'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Satu baris per sumber: webhook ganda tidak membuat entitlement ganda (ON CONFLICT DO NOTHING).
    -- source_ref NULL (mis. admin_grant) tidak dianggap sama, sehingga beberapa grant manual tetap boleh.
    CONSTRAINT entitlements_source_unique UNIQUE (user_id, digital_product_id, source, source_ref),
    CONSTRAINT entitlements_period_check CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_access ON entitlements (user_id, digital_product_id, status);
CREATE INDEX IF NOT EXISTS idx_entitlements_source_ref ON entitlements (source, source_ref);

DROP TRIGGER IF EXISTS update_entitlements_modtime ON entitlements;
CREATE TRIGGER update_entitlements_modtime
    BEFORE UPDATE ON entitlements FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 7. PERANGKAT --------------------------------------------------------------------
-- Batas perangkat dihitung per user: maks = nilai max_devices tertinggi di antara entitlement aktif user.
-- device_fingerprint = hash SHA-256 dari ID perangkat acak yang dibuat browser.
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_fingerprint TEXT NOT NULL,
    user_agent TEXT,
    label TEXT,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    released_by TEXT                                 -- 'user' (maks. 1 per 30 hari) | 'admin'
);

CREATE UNIQUE INDEX IF NOT EXISTS user_devices_active_unique
    ON user_devices (user_id, device_fingerprint) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices (user_id, released_at);

-- 8. SESI AKSES (satu sesi aktif per user per produk) ---------------------------
CREATE TABLE IF NOT EXISTS access_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
    device_id UUID REFERENCES user_devices(id) ON DELETE SET NULL,
    entitlement_id UUID REFERENCES entitlements(id) ON DELETE SET NULL,
    session_token TEXT NOT NULL UNIQUE,              -- hash SHA-256 dari token; token asli hanya dipegang browser
    ip TEXT,
    user_agent TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_event_at TIMESTAMPTZ,                       -- batch reading_events terakhir (validasi durasi wajar)
    ended_at TIMESTAMPTZ,
    end_reason TEXT                                  -- 'closed' | 'takeover' | 'reopened' | 'expired' | 'device_released' | 'admin' | 'revoked'
);

CREATE UNIQUE INDEX IF NOT EXISTS access_sessions_one_active
    ON access_sessions (user_id, digital_product_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_access_sessions_device ON access_sessions (device_id) WHERE ended_at IS NULL;

-- 9. LOG AKSES -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    digital_product_id UUID REFERENCES digital_products(id) ON DELETE CASCADE,
    entitlement_id UUID REFERENCES entitlements(id) ON DELETE SET NULL,
    session_id UUID REFERENCES access_sessions(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('page_view', 'segment', 'key', 'search', 'note', 'session_start', 'session_end', 'denied')),
    ip TEXT,
    user_agent TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_user ON access_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_product_time ON access_logs (digital_product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_action_time ON access_logs (action, created_at DESC);

-- 10. PROGRES BACA/DENGAR --------------------------------------------------------
CREATE TABLE IF NOT EXISTS reading_progress (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),   -- halaman (e-book) atau detik (audiobook)
    percent NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
    legal_notice_accepted_at TIMESTAMPTZ,                         -- notice UU Hak Cipta sudah disetujui
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, digital_product_id)
);

-- 11. VERIFIED READING / LISTENING (dasar royalti fase 5) -----------------------
-- Hanya dicatat server dari sesi sah setelah validasi (dwell wajar, halaman/detik dalam batas, kecepatan <= 2x).
CREATE TABLE IF NOT EXISTS reading_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
    session_id UUID REFERENCES access_sessions(id) ON DELETE SET NULL,
    entitlement_id UUID REFERENCES entitlements(id) ON DELETE SET NULL,   -- sumber akses (purchase/membership/...)
    unit TEXT NOT NULL CHECK (unit IN ('page', 'second')),
    unit_start INTEGER NOT NULL CHECK (unit_start >= 0),
    unit_end INTEGER NOT NULL,
    dwell_ms INTEGER NOT NULL CHECK (dwell_ms > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reading_events_range_check CHECK (unit_end >= unit_start)
);

CREATE INDEX IF NOT EXISTS idx_reading_events_product_time ON reading_events (digital_product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reading_events_user_time ON reading_events (user_id, created_at);

-- 12. CATATAN & HIGHLIGHT ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    digital_product_id UUID NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL CHECK (page_number > 0),
    anchor JSONB NOT NULL DEFAULT '{}'::jsonb,       -- {"rects":[{"x":0.1,"y":0.2,"w":0.3,"h":0.02}]} relatif 0..1 terhadap halaman
    color VARCHAR(16) NOT NULL DEFAULT 'yellow' CHECK (color IN ('yellow', 'green', 'blue', 'pink')),
    note_text TEXT CHECK (note_text IS NULL OR char_length(note_text) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notes_lookup ON user_notes (user_id, digital_product_id, page_number);

DROP TRIGGER IF EXISTS update_user_notes_modtime ON user_notes;
CREATE TRIGGER update_user_notes_modtime
    BEFORE UPDATE ON user_notes FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 13. ANOMALI AKSES ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    digital_product_id UUID REFERENCES digital_products(id) ON DELETE CASCADE,  -- NULL untuk aturan per user
    rule TEXT NOT NULL CHECK (rule IN ('ip_spread', 'device_limit_denials', 'page_speed')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    action_taken TEXT NOT NULL CHECK (action_taken IN ('flagged', 'suspended')),
    suspended_entitlement_ids UUID[] NOT NULL DEFAULT '{}',
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_note TEXT
);

-- Satu anomali terbuka per user + produk + aturan (deteksi per jam tidak membuat duplikat).
CREATE UNIQUE INDEX IF NOT EXISTS access_anomalies_open_unique
    ON access_anomalies (user_id, COALESCE(digital_product_id, '00000000-0000-0000-0000-000000000000'::uuid), rule)
    WHERE resolved_at IS NULL;

-- Kandidat anomali (dipanggil job per jam di server):
--   ip_spread            > 5 IP berbeda dalam 24 jam pada satu produk            -> ditandai
--   device_limit_denials > 3 penolakan device_limit dalam 24 jam (per user)       -> ditandai
--   page_speed           >= 3 jendela 10 detik dengan > 30 page_view (> 3 hlm/dtk) dalam 1 jam -> entitlement ditangguhkan
CREATE OR REPLACE FUNCTION digital_anomaly_candidates(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (user_id UUID, digital_product_id UUID, rule TEXT, details JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT l.user_id, l.digital_product_id, 'ip_spread'::TEXT,
           jsonb_build_object('distinct_ips', COUNT(DISTINCT l.ip), 'window_hours', 24)
      FROM access_logs l
     WHERE l.created_at > p_now - INTERVAL '24 hours'
       AND l.user_id IS NOT NULL AND l.digital_product_id IS NOT NULL AND l.ip IS NOT NULL
     GROUP BY l.user_id, l.digital_product_id
    HAVING COUNT(DISTINCT l.ip) > 5
    UNION ALL
    SELECT l.user_id, NULL::UUID, 'device_limit_denials'::TEXT,
           jsonb_build_object('denials', COUNT(*), 'window_hours', 24)
      FROM access_logs l
     WHERE l.created_at > p_now - INTERVAL '24 hours'
       AND l.user_id IS NOT NULL AND l.action = 'denied' AND l.meta->>'reason' = 'device_limit'
     GROUP BY l.user_id
    HAVING COUNT(*) > 3
    UNION ALL
    SELECT w.user_id, w.digital_product_id, 'page_speed'::TEXT,
           jsonb_build_object('fast_windows', COUNT(*), 'max_pages_per_10s', MAX(w.views))
      FROM (
            SELECT l.user_id, l.digital_product_id,
                   date_bin(INTERVAL '10 seconds', l.created_at, TIMESTAMPTZ '2000-01-01') AS bucket,
                   COUNT(*) AS views
              FROM access_logs l
             WHERE l.created_at > p_now - INTERVAL '1 hour' AND l.action = 'page_view'
               AND l.user_id IS NOT NULL AND l.digital_product_id IS NOT NULL
             GROUP BY 1, 2, 3
            HAVING COUNT(*) > 30
           ) w
     GROUP BY w.user_id, w.digital_product_id
    HAVING COUNT(*) >= 3;
$$;

-- 14. FUNGSI ADMIN: CARI USER (auth.users tidak diekspos lewat API) --------------
CREATE OR REPLACE FUNCTION admin_find_users(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (id UUID, email TEXT, full_name TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
    SELECT u.id, u.email::TEXT, COALESCE(u.raw_user_meta_data->>'full_name', '')::TEXT, u.created_at
      FROM auth.users u
     WHERE COALESCE(p_query, '') = ''
        OR u.email ILIKE '%' || p_query || '%'
        OR (u.raw_user_meta_data->>'full_name') ILIKE '%' || p_query || '%'
     ORDER BY u.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

CREATE OR REPLACE FUNCTION admin_user_profiles(p_ids UUID[])
RETURNS TABLE (id UUID, email TEXT, full_name TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
    SELECT u.id, u.email::TEXT, COALESCE(u.raw_user_meta_data->>'full_name', '')::TEXT, u.created_at
      FROM auth.users u
     WHERE u.id = ANY(p_ids);
$$;

-- Fungsi SECURITY DEFINER hanya boleh dipanggil server (service role).
REVOKE ALL ON FUNCTION digital_search_pages(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION digital_anomaly_candidates(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_find_users(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_user_profiles(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION digital_search_pages(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION digital_anomaly_candidates(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION admin_find_users(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION admin_user_profiles(UUID[]) TO service_role;

-- 15. ROW LEVEL SECURITY ------------------------------------------------------------
ALTER TABLE digital_product_pages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_product_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_anomalies         ENABLE ROW LEVEL SECURITY;

-- User hanya MEMBACA baris miliknya (semua penulisan lewat server). Tabel lain: tanpa policy = service role saja.
DROP POLICY IF EXISTS "entitlements_select_own" ON entitlements;
CREATE POLICY "entitlements_select_own" ON entitlements FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reading_progress_select_own" ON reading_progress;
CREATE POLICY "reading_progress_select_own" ON reading_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_notes_select_own" ON user_notes;
CREATE POLICY "user_notes_select_own" ON user_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_devices_select_own" ON user_devices;
CREATE POLICY "user_devices_select_own" ON user_devices FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "access_sessions_select_own" ON access_sessions;
CREATE POLICY "access_sessions_select_own" ON access_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 16. STORAGE: BUCKET PRIVAT FILE UTUH --------------------------------------------
-- Struktur:
--   ebooks/<product_id>/source.pdf          file master (tidak dihapus saat proses ulang)
--   ebooks/<product_id>/pages/<n>.png       halaman render ~150 dpi, lebar maks. 1600 px
--   audiobooks/<product_id>/source.mp3      file master
--   audiobooks/<product_id>/hls/index.m3u8, seg_<n>.ts, enc.key   (AES-128)
-- PRIVAT dan tanpa policy: hanya server (service role) yang membaca/menulis. Tidak ada signed URL untuk browser.
-- file_size_limit NULL = mengikuti batas global proyek (Free: 50 MB; Pro: dapat dinaikkan hingga 500 GB).
-- Bucket sampel publik "digital-samples" dari fase 1 tetap terpisah.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'digital-assets',
    'digital-assets',
    false,
    NULL,
    ARRAY[
        'application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/flac',
        'image/png', 'video/mp2t', 'application/vnd.apple.mpegurl', 'application/x-mpegurl', 'application/octet-stream',
        'text/plain', 'text/csv'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
