-- ============================================================================
-- PRODUK DIGITAL (E-BOOK & AUDIOBOOK) & PERMINTAAN INSTITUSI — FASE 1
-- ============================================================================
-- JALANKAN MANUAL di Supabase SQL Editor (tidak dijalankan otomatis oleh aplikasi).
-- Urutan: schema.sql -> src/db/authors_schema.sql -> src/db/i18n_content_migration.sql -> file ini.
-- Aman dijalankan ulang (idempoten).
--
-- Isi:
--   1. Enum digital_format, digital_availability, institution_inquiry_status
--   2. Tabel digital_products       (satu baris per buku x format; UNIQUE(book_id, format))
--   3. Tabel institution_inquiries  (form permintaan penawaran di /institutions)
--   4. Bucket Storage PUBLIK "digital-samples" khusus file SAMPEL
--      (gambar halaman sampel maks. 10 per produk, audio sampel maks. 6 menit, maks. 8 MB per file).
--      File utuh e-book/audiobook TIDAK BOLEH diunggah ke bucket ini — fase 2 memakai bucket privat terpisah.
--      Jika env DIGITAL_SAMPLES_BUCKET diubah, ganti juga nama bucket di bagian 4.
--
-- Keamanan: RLS aktif TANPA policy publik. Browser tidak membaca tabel ini langsung; semua akses lewat
-- Express API (service role), yang hanya mengembalikan field katalog + URL sampel publik.
-- ============================================================================

-- Fungsi updated_at (sama dengan schema.sql; didefinisikan ulang agar file ini mandiri)
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. ENUM ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE digital_format AS ENUM ('ebook', 'audiobook');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE digital_availability AS ENUM ('coming_soon', 'available');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE institution_inquiry_status AS ENUM ('new', 'contacted', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. DIGITAL PRODUCTS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS digital_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id VARCHAR(50) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    format digital_format NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,                       -- harga satuan (Rupiah); 0 = belum ditetapkan
    is_active BOOLEAN NOT NULL DEFAULT true,
    availability_status digital_availability NOT NULL DEFAULT 'coming_soon',
    shelf_entry_date DATE,                                  -- tanggal masuk Digital Reading Shelf; NULL = belum ditetapkan
    page_count INTEGER,
    duration_seconds INTEGER,
    narrator TEXT,
    sample_page_start INTEGER,                              -- rentang halaman sampel (disarankan 10–15%)
    sample_page_end INTEGER,
    sample_audio_seconds INTEGER NOT NULL DEFAULT 300,
    sample_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,   -- URL publik gambar halaman sampel (bucket digital-samples)
    sample_audio_url TEXT,                                  -- URL publik audio sampel (bucket digital-samples)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT digital_products_book_format_key UNIQUE (book_id, format),
    CONSTRAINT digital_products_price_check CHECK (price >= 0),
    CONSTRAINT digital_products_page_count_check CHECK (page_count IS NULL OR page_count > 0),
    CONSTRAINT digital_products_duration_check CHECK (duration_seconds IS NULL OR duration_seconds > 0),
    CONSTRAINT digital_products_sample_range_check CHECK (
        (sample_page_start IS NULL AND sample_page_end IS NULL)
        OR (sample_page_start > 0 AND sample_page_end >= sample_page_start)
    ),
    CONSTRAINT digital_products_sample_audio_check CHECK (sample_audio_seconds BETWEEN 1 AND 360),
    CONSTRAINT digital_products_sample_images_check CHECK (
        jsonb_typeof(sample_image_urls) = 'array' AND jsonb_array_length(sample_image_urls) <= 10
    )
);

CREATE INDEX IF NOT EXISTS idx_digital_products_listing
    ON digital_products (format, availability_status) WHERE is_active;

DROP TRIGGER IF EXISTS update_digital_products_modtime ON digital_products;
CREATE TRIGGER update_digital_products_modtime
    BEFORE UPDATE ON digital_products FOR EACH ROW EXECUTE FUNCTION update_modified_column();

ALTER TABLE digital_products ENABLE ROW LEVEL SECURITY;
-- Sengaja tanpa policy: anon/authenticated tidak bisa membaca/menulis; service role (Express) melewati RLS.

-- 3. INSTITUTION INQUIRIES ----------------------------------------------------
CREATE TABLE IF NOT EXISTS institution_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_name TEXT NOT NULL,
    institution_type VARCHAR(30) NOT NULL,
    user_count INTEGER NOT NULL,
    email TEXT NOT NULL,
    contact_name TEXT,
    phone VARCHAR(40),
    message TEXT,
    language VARCHAR(5) NOT NULL DEFAULT 'id',
    status institution_inquiry_status NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT institution_inquiries_type_check CHECK (institution_type IN ('university', 'library', 'government', 'company', 'other')),
    CONSTRAINT institution_inquiries_user_count_check CHECK (user_count BETWEEN 1 AND 1000000),
    CONSTRAINT institution_inquiries_name_check CHECK (char_length(institution_name) BETWEEN 2 AND 200),
    CONSTRAINT institution_inquiries_message_check CHECK (message IS NULL OR char_length(message) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_institution_inquiries_created ON institution_inquiries (created_at DESC);

DROP TRIGGER IF EXISTS update_institution_inquiries_modtime ON institution_inquiries;
CREATE TRIGGER update_institution_inquiries_modtime
    BEFORE UPDATE ON institution_inquiries FOR EACH ROW EXECUTE FUNCTION update_modified_column();

ALTER TABLE institution_inquiries ENABLE ROW LEVEL SECURITY;
-- Tanpa policy: data kontak hanya bisa dibaca admin lewat Express API.

-- 4. STORAGE: BUCKET SAMPEL PUBLIK --------------------------------------------
-- Publik = file bisa diputar/dilihat tanpa login. Batas ukuran & tipe ditegakkan oleh Supabase.
-- Unggahan memakai signed upload URL yang dibuat server (service role), jadi tidak perlu policy INSERT.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'digital-samples',
    'digital-samples',
    true,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
