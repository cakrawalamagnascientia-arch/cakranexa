-- Tambahkan dua buku Teologia tanpa menghapus data katalog yang sudah ada.
-- Jalankan setelah schema.sql pada Supabase SQL Editor.

ALTER TABLE books
  ADD COLUMN IF NOT EXISTS subtitle TEXT,
  ADD COLUMN IF NOT EXISTS cover_quote TEXT;

INSERT INTO books (
  id, name, subtitle, cover_quote, slug, author, category, isbn,
  tahun_terbit, jumlah_halaman, ukuran_buku, harga, sinopsis,
  link_pembelian, buku_terbaru, penerbit, cover_buku, badge,
  stock, berat_gram
)
VALUES
(
  'book-22',
  'Alkitab Yang Membaca Kita',
  'Menjadi Manusia Penafsir dari Taurat hingga Para Nabi',
  NULL,
  'alkitab-yang-membaca-kita',
  'Henry Dianto P. Sinaga',
  'Teologia',
  '',
  2026,
  0,
  '155 x 230 mm (UNESCO B5)',
  0,
  'Buku ini mengajak pembaca memasuki sebuah pembalikan penting dalam penafsiran Kitab Suci: kita bukan hanya membaca Alkitab, tetapi juga dibaca olehnya. Dari fondasi hermeneutika, manusia penafsir, wahyu dan teks, Taurat, narasi sejarah, puisi dan hikmat, hingga para nabi, pembaca diajak menyadari bahwa dirinya tidak pernah netral di hadapan firman.\n\nDengan ketelitian akademik dan kepekaan rohani, buku ini menegaskan bahwa iman dan ketelitian bukanlah lawan. Bahasa, sejarah, genre, kanon, dan tradisi perlu dipelajari dengan rendah hati, sambil terus menguji motif, struktur kuasa, dan buah etis dari setiap penafsiran.\n\nMelalui empat gerak—amati, kenali, uji, dan tanggapi—pembaca diarahkan kepada ketaatan yang konkret, korektif, dan bertumbuh di dalam komunitas. Buku ini juga menempatkan pembacaan Alkitab dalam tanggung jawab publik Indonesia: pluralitas, keadilan, martabat sesama, kerentanan, dan pengharapan.\n\nPada akhirnya, tujuan buku ini bukan menghasilkan orang yang paling cepat menjawab, melainkan manusia yang paling dapat dipercaya ketika berbicara tentang Allah: berani karena telah mendengar, lembut karena sadar keterbatasan, kritis karena mencintai, dan berharap karena percaya bahwa Allah belum selesai bekerja.',
  '#',
  TRUE,
  'PT Cakrawala Magna Scientia',
  '/images/books/book-22.png',
  'Teologia',
  0,
  500
),
(
  'book-23',
  'Diutus Dalam Kuasa',
  'Mengalir dalam Karunia, Memimpin dengan Integritas, dan Menyalakan Dunia',
  'Kuasa Roh Kudus tidak diberikan untuk membangun panggung pribadi, tetapi untuk membangun tubuh Kristus dan melayani dunia.',
  'diutus-dalam-kuasa',
  'Henry Dianto P. Sinaga',
  'Teologia',
  '',
  2026,
  0,
  '155 x 230 mm (UNESCO B5)',
  0,
  'Buku ini mengajak pembaca memahami bahwa kuasa Roh Kudus tidak diberikan untuk membangun panggung pribadi, melainkan untuk membangun tubuh Kristus dan melayani dunia. Karunia-karunia Roh bukan sekadar fenomena rohani yang mengagumkan, tetapi sarana anugerah yang harus dipakai dengan kasih, ketertiban, kerendahan hati, dan tanggung jawab.\n\nDengan bahasa yang jernih dan landasan Alkitab yang kuat, buku ini menolong pembaca memahami, menguji, dan mempraktikkan karunia Roh secara sehat. Pembahasan kemudian dihubungkan secara konkret dengan penginjilan, pelayanan sosial, kepemimpinan, peperangan rohani, serta pembentukan gereja yang berdampak bagi masyarakat.\n\nBuku ini juga menegaskan bahwa integritas adalah wadah bagi kuasa. Karunia tanpa karakter dapat melukai, sedangkan kuasa yang dipimpin oleh kasih, kekudusan, dan kebenaran akan menyalakan dunia dengan kesaksian yang hidup. Karena itu, pembaca diajak bukan hanya untuk menerima kuasa, tetapi juga untuk diproses menjadi pribadi yang dapat dipercaya dalam pelayanan.\n\nSangat cocok bagi pelayan Tuhan, pemimpin gereja, mentor, penginjil, aktivis pelayanan, tim doa, komunitas misi, sekolah pelayanan, dan jemaat yang ingin bertumbuh dalam karunia Roh dengan aman, sehat, dan bertanggung jawab.',
  '#',
  TRUE,
  'PT Cakrawala Magna Scientia',
  '/images/books/book-23.png',
  'Teologia',
  0,
  500
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  subtitle = EXCLUDED.subtitle,
  cover_quote = EXCLUDED.cover_quote,
  slug = EXCLUDED.slug,
  author = EXCLUDED.author,
  category = EXCLUDED.category,
  sinopsis = EXCLUDED.sinopsis,
  penerbit = EXCLUDED.penerbit,
  cover_buku = EXCLUDED.cover_buku,
  badge = EXCLUDED.badge,
  buku_terbaru = EXCLUDED.buku_terbaru;
