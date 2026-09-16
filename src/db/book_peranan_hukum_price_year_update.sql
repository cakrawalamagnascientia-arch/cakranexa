-- Harga dan tahun terbit buku cetak "Peranan Hukum dalam Penanganan Tantangan Pajak E-Commerce di Indonesia" (book-10):
-- Rp149.000, terbit 2024. Katalog live dibaca dari tabel books, jadi jalankan manual di Supabase SQL Editor
-- (atau ubah lewat admin Katalog & Inventaris). Aman diulang; hanya mengubah satu baris.

UPDATE public.books
SET harga = 149000,
    tahun_terbit = 2024
WHERE id = 'book-10';

-- Periksa hasilnya:
-- SELECT id, name, harga, tahun_terbit FROM public.books WHERE id = 'book-10';
