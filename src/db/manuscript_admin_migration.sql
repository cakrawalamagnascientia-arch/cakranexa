-- ============================================================================
-- FASE 5R LANGKAH 2 — AKUN PENULIS, ADDENDUM KONTRAK, PENGINGAT
-- ============================================================================
-- JALANKAN MANUAL di Supabase SQL Editor (tidak dijalankan otomatis oleh aplikasi). Aman dijalankan ulang.
-- Urutan: ... -> src/db/manuscript_contracts_migration.sql -> file ini.
-- Spesifikasi: docs/PHASE-5-BRIEF.md (fase 5R) dan keputusan review Langkah 1.
--
--  - authors.user_id: akun login penulis (dashboard /author). Diisi admin, atau otomatis bila email login sudah
--    dikonfirmasi, sama dengan authors.email, dan user_id masih kosong. Setiap tautan/pelepasan dicatat di
--    author_account_links (log tetap ada walau penulis/akun dihapus).
--  - manuscript_contract_addenda: addendum merujuk kontrak induk (tanggal, file, perubahan hak/jangka waktu/honor).
--    Kontrak induk tidak diubah; nilai efektif dihitung server dari kontrak + addendum urut tanggal.
--  - manuscript_reminders: pengingat jatuh tempo & hak kembali (12 bulan sebelumnya) terkirim sekali per tahap/tanggal.
--  - Hanya server (service role): RLS aktif tanpa policy. Tidak ada operasi hapus data.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. AKUN LOGIN PENULIS --------------------------------------------------------
ALTER TABLE authors ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS user_link_source TEXT
    CHECK (user_link_source IS NULL OR user_link_source IN ('admin', 'auto_email'));
ALTER TABLE authors ADD COLUMN IF NOT EXISTS user_linked_at TIMESTAMPTZ;
-- Satu akun login untuk satu penulis.
CREATE UNIQUE INDEX IF NOT EXISTS uq_authors_user_id ON authors (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS author_account_links (
    id BIGSERIAL PRIMARY KEY,
    author_id UUID NOT NULL,                                                -- tanpa FK: log tetap ada
    user_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('link', 'unlink')),
    source TEXT NOT NULL CHECK (source IN ('admin', 'auto_email')),
    actor TEXT,                                                             -- 'admin' atau email pengguna
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_author_account_links_author ON author_account_links (author_id, created_at DESC);

-- 2. ADDENDUM KONTRAK ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manuscript_contract_addenda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES manuscript_contracts(id) ON DELETE RESTRICT,
    addendum_number TEXT NOT NULL UNIQUE,
    signed_at DATE NOT NULL,
    -- Perubahan (NULL = tidak berubah)
    rights_print BOOLEAN,
    rights_ebook BOOLEAN,
    rights_audiobook BOOLEAN,
    rights_translation BOOLEAN,
    rights_derivative BOOLEAN,
    term_years INTEGER CHECK (term_years IS NULL OR term_years BETWEEN 1 AND 25),
    honor_total BIGINT CHECK (honor_total IS NULL OR honor_total >= 0),
    revision_fee_per_edition BIGINT CHECK (revision_fee_per_edition IS NULL OR revision_fee_per_edition >= 0),
    description TEXT NOT NULL,
    file_path TEXT,                                                         -- bucket privat
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT manuscript_addenda_changes_check CHECK (
        num_nonnulls(rights_print, rights_ebook, rights_audiobook, rights_translation, rights_derivative,
                     term_years, honor_total, revision_fee_per_edition) > 0
    )
);
CREATE INDEX IF NOT EXISTS idx_manuscript_addenda_contract ON manuscript_contract_addenda (contract_id, signed_at);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_manuscript_addenda_modtime') THEN
        CREATE TRIGGER update_manuscript_addenda_modtime BEFORE UPDATE ON manuscript_contract_addenda
            FOR EACH ROW EXECUTE FUNCTION update_modified_column();
    END IF;
END $$;

-- 3. PENGINGAT ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manuscript_reminders (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('payment_due_soon', 'payment_overdue', 'rights_revert_12m')),
    ref_id UUID NOT NULL,                                                   -- tahap pembayaran / kontrak
    ref_date DATE NOT NULL,                                                 -- jatuh tempo / tanggal hak kembali
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT manuscript_reminders_unique UNIQUE (kind, ref_id, ref_date)
);

-- 4. KEAMANAN ------------------------------------------------------------------
ALTER TABLE author_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE manuscript_contract_addenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE manuscript_reminders ENABLE ROW LEVEL SECURITY;
