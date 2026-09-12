-- ==============================================================================
-- PT CAKRAWALA MAGNA SCIENTIA (CakraNexa) - MIGRATION: TERJEMAHAN KONTEN (i18n)
-- Jalankan di Supabase SQL Editor SETELAH schema.sql dan src/db/authors_schema.sql.
-- Idempotent: aman dijalankan ulang.
--
-- Terjemahan disimpan dalam satu kolom JSONB per tabel, contoh isi books.i18n:
--   { "en": { "name": "...", "subtitle": "...", "sinopsis": "..." },
--     "zh": { "name": "...", "subtitle": "...", "sinopsis": "..." } }
-- Bahasa Indonesia tetap di kolom aslinya. Field terjemahan yang kosong otomatis
-- memakai versi Bahasa Indonesia di website. Menambah bahasa baru (mis. "ja")
-- tidak memerlukan migration baru.
--
-- PENTING: jalankan migration ini SEBELUM server terhubung ke Supabase memakai
-- versi kode ini; server menyimpan kolom books.i18n, authors.i18n, dan orders.language.
-- ==============================================================================

-- 1. Buku: terjemahan judul, subjudul, sinopsis
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN books.i18n IS 'Terjemahan konten: {"en": {"name","subtitle","sinopsis"}, "zh": {...}}';

-- 2. Penulis: terjemahan bio (pendidikan, pengalaman, organisasi & seminar, publikasi)
ALTER TABLE authors
  ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN authors.i18n IS 'Terjemahan bio: {"en": {"profile_education","work_experience","organization_seminar","publications"}, "zh": {...}}';

-- 3. Pesanan: bahasa pelanggan saat checkout (untuk pesan WhatsApp ke pelanggan)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS language VARCHAR(8) NOT NULL DEFAULT 'id';
COMMENT ON COLUMN orders.language IS 'Bahasa pelanggan saat checkout: id | en | zh';

-- Artikel blog tersimpan di site_content.content_data (JSON CMS), sehingga tidak
-- memerlukan perubahan tabel: tiap artikel mendapat field "i18n" dengan pola yang sama.
