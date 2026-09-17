-- ============================================================================
-- FASE 5R — KONTRAK NASKAH JUAL PUTUS & JADWAL HONOR
-- ============================================================================
-- JALANKAN MANUAL di Supabase SQL Editor (tidak dijalankan otomatis oleh aplikasi). Aman dijalankan ulang.
-- Urutan: ... -> src/db/print_checkout_migration.sql -> file ini.
-- Spesifikasi: docs/PHASE-5-BRIEF.md (fase 5R: jual putus penuh; penulis tidak menerima royalti cetak, ebook, audiobook).
--
--  - manuscript_contracts: kontrak jual putus per penulis per judul (paling banyak satu yang belum diakhiri).
--    Hak kembali ke penulis pada rights_revert_at = signed_at + term_years, paling lama 25 tahun
--    (UU 28/2014 Pasal 18). Aturan ini dicek database dan server (backend/manuscripts/rules.ts).
--  - manuscript_payments: jadwal honor (tahap, jumlah, jatuh tempo, tanggal dibayar) dan honor revisi per edisi.
--  - File kontrak, bukti bayar, dan bukti potong pajak disimpan di bucket privat digital-assets; tabel hanya menyimpan
--    path-nya. Tidak ada nomor rekening, NPWP, atau data pajak dalam bentuk teks.
--  - Hanya server (service role): RLS aktif tanpa policy. Tidak ada operasi hapus; kontrak diakhiri lewat status.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. KONTRAK NASKAH ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manuscript_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_number TEXT NOT NULL UNIQUE,                                   -- nomor kontrak dari admin, huruf besar
    author_id UUID NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE RESTRICT,            -- NULL = naskah belum masuk katalog
    contract_type TEXT NOT NULL DEFAULT 'jual_putus' CHECK (contract_type = 'jual_putus'),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'terminated')),
    -- Cakupan hak yang dialihkan
    rights_print BOOLEAN NOT NULL DEFAULT TRUE,
    rights_ebook BOOLEAN NOT NULL DEFAULT TRUE,
    rights_audiobook BOOLEAN NOT NULL DEFAULT TRUE,
    rights_translation BOOLEAN NOT NULL DEFAULT FALSE,
    rights_derivative BOOLEAN NOT NULL DEFAULT FALSE,
    signed_at DATE NOT NULL,                                                -- tanggal kontrak
    term_years INTEGER NOT NULL DEFAULT 25 CHECK (term_years BETWEEN 1 AND 25),
    rights_revert_at DATE NOT NULL,                                         -- = signed_at + term_years
    honor_total BIGINT NOT NULL CHECK (honor_total >= 0),                   -- Rupiah, jual putus
    revision_fee_per_edition BIGINT NOT NULL DEFAULT 0 CHECK (revision_fee_per_edition >= 0),
    contract_file_path TEXT,                                                -- bucket privat
    notes TEXT,
    terminated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT manuscript_contracts_rights_check
        CHECK (rights_print OR rights_ebook OR rights_audiobook OR rights_translation OR rights_derivative),
    CONSTRAINT manuscript_contracts_revert_check
        CHECK (rights_revert_at = (signed_at + make_interval(years => term_years))::date)
);

-- Satu kontrak yang belum diakhiri per penulis per judul.
CREATE UNIQUE INDEX IF NOT EXISTS uq_manuscript_contracts_author_book
    ON manuscript_contracts (author_id, book_id) WHERE status <> 'terminated' AND book_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manuscript_contracts_author ON manuscript_contracts (author_id);
CREATE INDEX IF NOT EXISTS idx_manuscript_contracts_book ON manuscript_contracts (book_id) WHERE book_id IS NOT NULL;
-- Pengingat hak akan kembali (12 bulan sebelum rights_revert_at).
CREATE INDEX IF NOT EXISTS idx_manuscript_contracts_revert ON manuscript_contracts (rights_revert_at) WHERE status = 'signed';

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_manuscript_contracts_modtime') THEN
        CREATE TRIGGER update_manuscript_contracts_modtime BEFORE UPDATE ON manuscript_contracts
            FOR EACH ROW EXECUTE FUNCTION update_modified_column();
    END IF;
END $$;

-- 2. JADWAL PEMBAYARAN HONOR -----------------------------------------------------
CREATE TABLE IF NOT EXISTS manuscript_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES manuscript_contracts(id) ON DELETE RESTRICT,
    sequence INTEGER NOT NULL CHECK (sequence >= 1),                        -- urutan tahap dalam kontrak
    stage TEXT NOT NULL,                                                    -- mis. "Tahap 1 — penandatanganan"
    kind TEXT NOT NULL DEFAULT 'honor' CHECK (kind IN ('honor', 'revision')),
    edition INTEGER,                                                        -- honor revisi: edisi ke-2, ke-3, ...
    amount BIGINT NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    paid_at DATE,
    payment_reference TEXT,                                                 -- catatan mutasi (tanpa nomor rekening)
    payment_proof_path TEXT,                                                -- bukti bayar, bucket privat
    tax_slip_path TEXT,                                                     -- bukti potong pajak, bucket privat
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT manuscript_payments_sequence_unique UNIQUE (contract_id, sequence),
    CONSTRAINT manuscript_payments_edition_check
        CHECK ((kind = 'revision' AND edition IS NOT NULL AND edition >= 2) OR (kind = 'honor' AND edition IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_manuscript_payments_contract ON manuscript_payments (contract_id);
-- Pengingat pembayaran jatuh tempo.
CREATE INDEX IF NOT EXISTS idx_manuscript_payments_unpaid_due ON manuscript_payments (due_date) WHERE paid_at IS NULL;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_manuscript_payments_modtime') THEN
        CREATE TRIGGER update_manuscript_payments_modtime BEFORE UPDATE ON manuscript_payments
            FOR EACH ROW EXECUTE FUNCTION update_modified_column();
    END IF;
END $$;

-- 3. KEAMANAN ------------------------------------------------------------------
-- Hanya server (service role); tidak ada policy untuk anon/authenticated. Penulis membaca kontraknya lewat server.
ALTER TABLE manuscript_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE manuscript_payments ENABLE ROW LEVEL SECURITY;
