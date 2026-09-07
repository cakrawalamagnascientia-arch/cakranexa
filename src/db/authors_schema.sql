-- ==============================================================================
-- PT CAKRAWALA MAGNA SCIENTIA (CakraNexa) - AUTHORS & BOOK_AUTHORS MIGRATION
-- Author / Penulis & Kontributor Module Schema
-- Jalankan file ini di Supabase SQL Editor SETELAH schema.sql utama berhasil.
-- Idempotent: menggunakan CREATE TABLE IF NOT EXISTS pattern (dimungkinkan).
-- ==============================================================================

-- 0. Pastikan extension uuid-ossp aktif
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. TABEL UTAMA: authors
-- ==============================================================================
CREATE TABLE IF NOT EXISTS authors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    academic_titles TEXT,
    photo_url TEXT,
    scopus_id TEXT,
    orcid_id TEXT,
    linkedin_url TEXT,
    email TEXT,
    profile_education TEXT,
    work_experience TEXT,
    organization_seminar TEXT,
    publications TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger auto-update authors.updated_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_authors_modtime'
    ) THEN
        CREATE TRIGGER update_authors_modtime
        BEFORE UPDATE ON authors
        FOR EACH ROW
        EXECUTE FUNCTION update_modified_column();
    END IF;
END $$;

-- Index pencarian berdasarkan nama
CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name);
CREATE INDEX IF NOT EXISTS idx_authors_scopus ON authors(scopus_id) WHERE scopus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_authors_orcid ON authors(orcid_id) WHERE orcid_id IS NOT NULL;

-- ==============================================================================
-- 2. TABEL JUNCTION (MANY-TO-MANY): book_authors
--    Menghubungkan books.id (VARCHAR(50)) ↔ authors.id (UUID)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS book_authors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id VARCHAR(50) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    author_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT book_authors_unique_pair UNIQUE (book_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_book_authors_book ON book_authors(book_id);
CREATE INDEX IF NOT EXISTS idx_book_authors_author ON book_authors(author_id);

-- ==============================================================================
-- 3. (OPSIONAL) Row Level Security - Enable jika ingin RLS aktif
--    (Secara default Supabase Anon Key bisa membaca public table jika RLS off).
--    Aktifkan hanya jika Anda paham kebijakan RLS.
-- ==============================================================================
-- ALTER TABLE authors ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE book_authors ENABLE ROW LEVEL SECURITY;
--
-- -- Bolehkan SELECT publik ke tabel penulis
-- CREATE POLICY "Authors are viewable by everyone" ON authors
--   FOR SELECT USING (true);
-- CREATE POLICY "Book authors rel viewable by everyone" ON book_authors
--   FOR SELECT USING (true);
-- -- Tulis (INSERT/UPDATE/DELETE) hanya via Service Role di Express, tidak via anon key
-- -- Tidak perlu policy INSERT/UPDATE untuk role anon (ditolak default jika RLS on).

-- ==============================================================================
-- 4. (OPSIONAL) Sample Seed 6 Penulis - HANYA jika tabel authors kosong.
--    CATATAN: Sebaiknya seed via aplikasi (INITIAL_AUTHORS di authorsData.ts) +
--    endpoint POST /api/authors admin agar id konsisten dengan frontend.
-- ==============================================================================

-- ==============================================================================
-- 5. SUPABASE STORAGE BUCKET SETUP (opsional untuk foto penulis)
--    Jalankan di dashboard Supabase > SQL Editor, atau buat manual:
-- ==============================================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('authors', 'authors', true)
--   ON CONFLICT (id) DO NOTHING;
