-- Set penerbit utama untuk buku pada cover 7 sampai 17.
-- Jalankan setelah schema.sql pada Supabase SQL Editor.

UPDATE books
SET penerbit = 'PT Scientia Integritas Utama'
WHERE cover_buku ~ '^/images/books/(7|8|9|10|11|12|13|14|15|16|17)\\.';