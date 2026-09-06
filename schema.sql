-- ==============================================================================
-- PT CAKRAWALA MAGNA SCIENTIA (CakraNexa) - SUPABASE POSTGRESQL MIGRATION SCHEMA
-- Production Schema for Decoupled Deployment (Vite/React SPA on Vercel + Express on Render + Supabase)
-- Jalankan file ini SEKALI di Supabase SQL Editor. Untuk modul ongkir & rekening bank, jalankan juga
-- src/db/shipping_and_payments_schema.sql.
-- PERINGATAN: Blok DROP TABLE di bawah menghapus data lama. Komentari blok tersebut jika DB sudah berisi
-- pesanan produksi.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. DROP TABLES IF EXISTS (CASCADE FOR CLEAN RE-RUN)
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS books CASCADE;
DROP TABLE IF EXISTS seo_settings CASCADE;
DROP TABLE IF EXISTS site_content CASCADE;

-- Fungsi umum untuk auto-update kolom updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. BOOKS TABLE
CREATE TABLE books (
    id VARCHAR(50) PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    author TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    isbn VARCHAR(50) NOT NULL,
    tahun_terbit INT NOT NULL,
    jumlah_halaman INT NOT NULL,
    ukuran_buku VARCHAR(100) NOT NULL,
    harga BIGINT NOT NULL,
    sinopsis TEXT NOT NULL,
    link_pembelian TEXT NOT NULL DEFAULT '#',
    buku_terbaru BOOLEAN NOT NULL DEFAULT false,
    penerbit TEXT NOT NULL DEFAULT 'PT Cakrawala Magna Scientia',
    cover_buku TEXT NOT NULL,
    badge VARCHAR(50) DEFAULT 'Karya Ilmiah',
    rating NUMERIC(2,1),
    reviews_count INT,
    stock INT,
    berat_gram INT DEFAULT 500,
    original_harga BIGINT,
    discount_percentage INT,
    release_date DATE,
    daftar_isi JSONB,
    tentang_penulis TEXT,
    is_best_seller BOOLEAN NOT NULL DEFAULT false,
    featured BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT books_stock_non_negative CHECK (stock IS NULL OR stock >= 0)
);

CREATE OR REPLACE TRIGGER update_books_modtime
    BEFORE UPDATE ON books FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 4. ORDERS TABLE
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(64) UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    shipping_address TEXT NOT NULL,
    courier VARCHAR(100) NOT NULL,
    shipping_fee BIGINT NOT NULL DEFAULT 0,
    total_amount BIGINT NOT NULL DEFAULT 0,
    payment_method VARCHAR(50) NOT NULL,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    tracking_number VARCHAR(100),
    payment_proof_url TEXT,
    va_number VARCHAR(100),
    customer_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT orders_payment_status_check CHECK (
        payment_status IN ('pending', 'paid', 'processing', 'shipped', 'failed', 'cancelled')
    )
);

CREATE OR REPLACE TRIGGER update_orders_modtime
    BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 5. ORDER ITEMS TABLE
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(64) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    book_id VARCHAR(50) NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 1,
    unit_price BIGINT NOT NULL,
    subtotal BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5b. SEO SETTINGS (singleton, id = 1) — dipakai oleh GET/POST /api/seo
CREATE TABLE seo_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    site_title TEXT,
    slogan TEXT,
    target_keywords TEXT,
    meta_description TEXT,
    site_url TEXT,
    og_image TEXT,
    noindex BOOLEAN NOT NULL DEFAULT false,
    responsive_viewport BOOLEAN NOT NULL DEFAULT true,
    custom_header_tags TEXT,
    google_analytics_id VARCHAR(64),
    google_maps_api_key TEXT,
    meta_pixel_id VARCHAR(64),
    gtm_id VARCHAR(64),
    google_ads_conversion_id VARCHAR(64),
    google_ads_conversion_label VARCHAR(128),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5c. SITE CONTENT / CMS (singleton, id = 1) — dipakai oleh GET/POST /api/site-content
CREATE TABLE site_content (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    content_data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5d. FUNGSI PENGURANGAN STOK ATOMIK (dipanggil server via supabase.rpc)
CREATE OR REPLACE FUNCTION decrement_book_stock(p_book_id VARCHAR, p_qty INT)
RETURNS VOID AS $$
BEGIN
    UPDATE books
       SET stock = GREATEST(0, COALESCE(stock, 0) - p_qty)
     WHERE id = p_book_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. INDEXES FOR HIGH-TRAFFIC QUERY OPTIMIZATION
CREATE INDEX IF NOT EXISTS idx_books_slug ON books(slug);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_buku_terbaru ON books(buku_terbaru);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- Prinsip: browser (anon key) hanya boleh MEMBACA katalog & konten publik.
-- Semua penulisan (buku, pesanan, SEO, CMS) dilakukan lewat Express API yang memakai
-- SERVICE_ROLE_KEY (bypass RLS) dan dilindungi login admin. Data pesanan berisi PII
-- pelanggan, sehingga TIDAK boleh bisa dibaca publik.
ALTER TABLE books        ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

-- Katalog buku: publik boleh baca
CREATE POLICY "Public Read Access on Books"
ON books FOR SELECT USING (true);

-- Konten publik (SEO & CMS): publik boleh baca
CREATE POLICY "Public Read SEO Settings"
ON seo_settings FOR SELECT USING (true);

CREATE POLICY "Public Read Site Content"
ON site_content FOR SELECT USING (true);

-- Pesanan: TIDAK ada policy untuk anon/authenticated.
-- Hanya service_role (server) yang dapat membaca/menulis orders & order_items.
-- (service_role otomatis melewati RLS, jadi tidak perlu policy tambahan.)

-- 8. PRE-POPULATE 17 JUDUL (sumber: Judul_buku_Cakranexa.pdf — identik dengan src/data/booksData.ts)
-- isbn '' = belum tersedia; harga 0 = belum ditetapkan (Segera Terbit); jumlah_halaman 0 = belum diisi
INSERT INTO books (
    id, name, slug, author, category, isbn, tahun_terbit, jumlah_halaman,
    ukuran_buku, harga, sinopsis, link_pembelian, buku_terbaru, penerbit, cover_buku, badge, rating, reviews_count, stock, berat_gram
) VALUES
(
    'book-1',
    'REFORMULASI SUBJEK PAJAK PERTAMBAHAN NILAI (PPN) DI ERA DIGITALISASI DI INDONESIA',
    'reformulasi-subjek-pajak-pertambahan-nilai-ppn-di-era-digitalisasi-di-indonesia',
    'Bonarsius Sipayung',
    'Perpajakan',
    'Dalam Pengajuan',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    185000,
    'Buku ini disusun untuk menjawab perubahan mendasar dalam Pajak Pertambahan Nilai (PPN) ketika penyerahan, pembayaran, data pelanggan, dan kendali transaksi tidak lagi berada pada satu pelaku. Ekonomi digital tidak menghapus prinsip PPN sebagai pajak atas konsumsi akhir, tetapi mengubah pihak yang paling mampu mengidentifikasi lokasi konsumsi, memungut pajak, menerbitkan bukti, melakukan koreksi, dan mempertanggungjawabkan transaksi.

Pembahasan diarahkan pada reformulasi subjek PPN secara fungsional, sehingga perlu membedakan pemasok material, pemasok yang dianggap, pemungut administratif, perantara pelaporan, pelanggan yang memenuhi kewajiban secara mandiri, pihak yang bertanggung jawab secara renteng, serta konsumen sebagai penanggung ekonomis. Pembedaan tersebut dimaksudkan untuk mencegah kekosongan, duplikasi pemungutan, putusnya hak kredit Pajak Masukan, dan pembebanan kewajiban kepada pihak yang tidak menguasai data atau kendali yang diperlukan.

Analisis memadukan pendekatan hukum normatif, komparatif, ekonomi, institusional, administrasi pajak, dan teknologi. Pengalaman OECD dan beberapa yurisdiksi lain digunakan sebagai pembanding fungsional, bukan sebagai model yang dipindahkan secara mekanis. Fokus akhirnya tetap pada konteks Indonesia dan prinsip legalitas.',
    '#',
    true,
    'PT Cakrawala Magna Scientia',
    '/images/books/7. reformulasi-subjek-pajak-pertambahan-nilai-ppn-di-era-digitalisasi-di-indonesia.png',
    'Trilogi PPN Digital',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-2',
    'REFORMULASI OBJEK PAJAK PERTAMBAHAN NILAI (PPN) DI ERA DIGITALISASI DI INDONESIA',
    'reformulasi-objek-pajak-pertambahan-nilai-ppn-di-era-digitalisasi-di-indonesia',
    'Bonarsius Sipayung',
    'Perpajakan',
    'Dalam Pengajuan',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    185000,
    'Perubahan ekonomi digital telah menggeser cara masyarakat memperoleh, menggunakan, dan membayar manfaat ekonomi. Perangkat lunak tidak lagi selalu dibeli sebagai salinan; konten dikonsumsi melalui langganan; kapasitas komputasi diperoleh sesuai penggunaan; dan platform mempertemukan banyak pihak dalam satu rangkaian transaksi. Perubahan ini menuntut hukum PPN yang tetap berpegang pada legalitas, tetapi mampu membaca substansi konsumsi secara tepat.

Buku ini membahas reformulasi objek PPN di Indonesia melalui perpaduan kajian hukum, ekonomi pajak konsumsi, model bisnis digital, administrasi, dan perbandingan internasional. Tujuannya bukan memperluas pajak tanpa batas, melainkan membangun kriteria yang netral, dapat dibuktikan, dapat dilaksanakan, serta melindungi hak wajib pajak. Pembaca diharapkan memperoleh kerangka untuk menilai manfaat yang dikonsumsi, lokasi konsumsi, pihak yang bertanggung jawab, dan bukti yang diperlukan.',
    '#',
    true,
    'PT Cakrawala Magna Scientia',
    '/images/books/8. reformulasi-objek-pajak-pertambahan-nilai-ppn-di-era-digitalisasi-di-indonesia.png',
    'Trilogi PPN Digital',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-3',
    'REFORMULASI MEKANISME PAJAK PERTAMBAHAN NILAI (PPN) DALAM PENANGANAN TANTANGAN DIGITALISASI DI INDONESIA',
    'reformulasi-mekanisme-pajak-pertambahan-nilai-ppn-dalam-penanganan-tantangan-digitalisasi-di-indonesia',
    'Bonarsius Sipayung',
    'Perpajakan',
    'Dalam Pengajuan',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    185000,
    'Di tengah pesatnya transformasi digital yang terjadi di seluruh dunia, Indonesia tidak terkecuali. Ekonomi digital semakin berkembang dengan pesat, mencakup berbagai sektor, dari e-commerce, fintech, hingga ekonomi berbasis platform digital yang sangat luas jangkauannya. Perubahan ini memunculkan kebutuhan mendesak untuk melakukan reformulasi terhadap mekanisme perpajakan, agar sistem yang ada tetap relevan, efektif, dan mampu mengakomodasi transaksi digital yang kian kompleks. Salah satu aspek penting yang harus segera diperhatikan adalah mekanisme PPN, yang merupakan salah satu sumber utama penerimaan negara. PPN yang diterapkan di dunia fisik sudah tentu tidak sepenuhnya bisa dipakai dalam dunia digital tanpa penyesuaian. Oleh karena itu, buku ini mengupas secara rinci mengenai tantangan yang dihadapi sistem PPN dalam dunia digital, serta langkah-langkah reformulasi mekanisme yang diperlukan untuk menjawab tantangan tersebut.

Penulisan buku ini bertujuan untuk memberikan perspektif yang lebih jelas mengenai dinamika PPN dalam era digitalisasi di Indonesia, serta memberikan saran-saran konkret untuk memperbaharui kebijakan dan mekanisme perpajakan yang ada. Harapannya, buku ini dapat memberikan wawasan yang berguna bagi para pemangku kepentingan, baik di kalangan pemerintah, pelaku usaha, akademisi, maupun masyarakat umum, mengenai bagaimana kita dapat beradaptasi dengan perkembangan ekonomi digital tanpa mengorbankan prinsip-prinsip keadilan dan keberlanjutan dalam pengelolaan perpajakan.',
    '#',
    true,
    'PT Cakrawala Magna Scientia',
    '/images/books/book-3.jpg',
    'Trilogi PPN Digital',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-4',
    'PRINSIP-PRINSIP TRANSFER PRICING: KONSEP DAN APLIKASI DI INDONESIA',
    'prinsip-prinsip-transfer-pricing-konsep-dan-aplikasi-di-indonesia',
    'Henry Dianto P. Sinaga & Andi Banua Adams',
    'Perpajakan',
    'Dalam Pengajuan',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    175000,
    'Buku ini disusun dengan tujuan memberikan pemahaman yang menyeluruh, mulai dari konsep dasar, kerangka regulasi dan praktik yang relevan di Indonesia, hingga aplikasi dan langkah-langkah analisis yang sering ditemui dalam penyusunan kebijakan harga transfer dan dokumentasi transfer pricing. Kami berupaya menyajikan materi secara sistematis, dengan penekanan pada keterkaitan antara teori dan praktik. Pembaca akan diajak memahami analisis fungsional (fungsi–aset–risiko), pilihan metode transfer pricing, analisis kesebandingan, pemilihan pembanding, serta isu-isu yang kerap muncul pada transaksi tertentu, seperti jasa intragrup, barang berwujud, pembiayaan, dan pemanfaatan aset tak berwujud.

Transfer pricing kerap menjadi area yang menantang bagi banyak pihak, baik perusahaan, konsultan, akademisi, maupun aparat pajak, karena memadukan aspek ekonomi, akuntansi, dan hukum. Karena itu, buku ini kami rancang untuk dapat digunakan oleh beragam pembaca: mahasiswa yang memerlukan pengantar konseptual, praktisi yang membutuhkan panduan aplikasi, serta peneliti yang memerlukan kerangka berpikir dan rujukan untuk memperdalam kajian. Harapan kami, buku ini dapat membantu pembaca membangun “cara berpikir transfer pricing” yang runtut: memahami transaksi, menilai peran masing-masing pihak, memilih metode yang tepat, dan mendokumentasikan prosesnya secara memadai.',
    '#',
    true,
    'PT Cakrawala Magna Scientia',
    '/images/books/10. prinsip-prinsip-transfer-pricing-konsep-dan-aplikasi-di-indonesia.png',
    'Pajak Internasional',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-5',
    'PRINSIP DAN KONSEP AUDIT DALAM AKUNTANSI DAN PELAKSANAAN KEWAJIBAN PERPAJAKAN DI INDONESIA',
    'prinsip-dan-konsep-audit-dalam-akuntansi-dan-pelaksanaan-kewajiban-perpajakan-di-indonesia',
    'Yudha Pramana & Joko Purnomo Raharjo',
    'Akuntansi',
    '978-634-04-8341-3',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    150000,
    'Buku ini berangkat dari satu premis yang sederhana namun menentukan, yaitu integritas angka adalah bahasa kepercayaan. Dalam bahasa itulah audit dan perpajakan berdiri bukan sekadar berdampingan, melainkan saling menopang. Audit memberi keyakinan atas kewajaran laporan keuangan, sedangkan perpajakan, melalui rezim self-assessment, menuntut kedisiplinan untuk menghitung, melaporkan, dan membayar pajak secara baik, benar, lengkap, dan jelas. Di titik temu keduanya, akurasi angka bukan tujuan antara, melainkan prasyarat bagi tata kelola yang sehat, kepastian hukum, dan keputusan ekonomi yang bernilai.

Benang merah buku ini menegaskan hubungan dua arah yang kuat: keandalan laporan keuangan adalah fondasi akurasi SPT, sementara kesiapan perpajakan menjadi kaca pembesar bagi kualitas proses akuntansi dan pengendalian internal. Temuan audit dapat memicu penyesuaian fiskal. Hasil pemeriksaan pajak dapat mengubah cara entitas melakukan pengukuran, pengakuan, dan pengungkapan.

Buku ini juga menempatkan praktik modern sebagai realitas yang tak terpisahkan: e-Faktur, e-Bupot, e-Filing, e-Meterai, integrasi NIK-NPWP, hingga modernisasi Sistem Inti Administrasi Perpajakan membentuk lingkungan kepatuhan yang menuntut kualitas data dan jejak audit yang utuh. Dari perencanaan audit yang tajam, pemahaman entitas dan teknologi, penilaian risiko dan pengendalian, hingga dokumentasi yang inspection-ready, pembaca diajak melihat bagaimana audit yang baik selaras dengan realitas fiskal, agar SPT mencerminkan substansi ekonomi, bukan sekadar bentuk transaksi.

Ditujukan bagi mahasiswa, calon auditor, akuntan, praktisi pajak, manajemen, hingga aparat pemeriksa, buku ini membantu pembaca melompati jurang antara prinsip dan implementasi, dengan peta regulasi, kerangka berpikir berbasis risiko, serta agenda praktis membangun tax control framework yang hidup, strategi insentif yang disiplin dokumen, dan pengelolaan sengketa yang sadar nilai. Pada akhirnya, pesan buku ini tegas, yakni bangun sistem, bukan momen, karena audit yang bernilai dan kepatuhan pajak yang tangguh lahir dari desain, disiplin, dan dokumentasi yang siap dipertanggungjawabkan.',
    '#',
    false,
    'PT Cakrawala Magna Scientia',
    '/images/books/17. prinsip-dan-konsep-audit-dalam-akuntansi-dan-pelaksanaan-kewajiban-perpajakan-di-indonesia.png',
    'Audit & Perpajakan',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-10',
    'PERANAN HUKUM DALAM PENANGANAN TANTANGAN PAJAK E-COMMERCE DI INDONESIA',
    'peranan-hukum-dalam-penanganan-tantangan-pajak-e-commerce-di-indonesia',
    'Henry Dianto P. Sinaga',
    'Hukum',
    '978-623-10-4266-8',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    219000,
    'Dalam menjawab tantangan pajak e-commerce tersebut, buku ini membahas dan menganalisis permasalahan yang ada berdasarkan telaah filosofis, yuridis, dan paradigmatik, sehingga dapat menghasilkan konsepsi hukum yang ideal di Indonesia. Hal ini didasarkan pada konstruksi paham neo-kantianisme, empat maksim pajak, dan model bekerjanya hukum dalam masyarakat, sebagaimana gagasannya telah menjangkau pada komponen-komponen pembentuk nilai hukum yang ideal, yakni keadilan, kepastian hukum, dan kemanfaatan publik. Hasil telaah filosofis, yuridis, dan paradigmatik menunjukkan masih terdapat ketentuan-ketentuan tertentu yang belum selaras dengan komponen-komponen pembentuk nilai hukum berupa keadilan, kepastian hukum, dan kemanfaatan publik. Konsep-konsep hukum dan pajak tersebut menghasilkan komponen-komponen yang berperan dalam penanganan tantangan pajak e-commerce di Indonesia, yakni: a) fairness, netralitas dan equity sebagai komponen pembentuk keadilan, b) kenyamanan atau kemudahan, efisiensi, dan fleksibilitas sebagai komponen pembentuk kemanfaatan publik, serta c) equality before the law, kepastian dan kesederhanaan, dan due process of law sebagai komponen pembentuk kepastian hukum.',
    '#',
    false,
    'PT Cakrawala Magna Scientia',
    '/images/books/14. peranan-hukum-dalam-penanganan-tantangan-pajak-e-commerce-di-indonesia.png',
    'Hukum Pajak Digital',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-11',
    'HUKUM PIDANA DI BIDANG PERPAJAKAN DI INDONESIA',
    'hukum-pidana-di-bidang-perpajakan-di-indonesia',
    'Bonarsius Sipayung, Henry Dianto P. Sinaga, & Anton Hartanto',
    'Hukum',
    '978-623-10-6631-2',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    179000,
    'Tindak pidana di bidang perpajakan yang terjadi di Indonesia harus ditangani dengan baik dan secara patut, agar tidak menimbulkan multi efek yang merugikan terhadap masyarakat, para pemangku kepentingan yang terkait, pemerintah dan negara. Memang, praktik tindak pidana di bidang perpajakan, yang pada dasarnya kompleks dan kasuistik, dapat berpotensi menyulitkan beberapa hal, antara lain tidak selalu tercapainya pemidanaan yang konsisten dan atau belum tercapai konsistensi pendekatan terhadap pemidanaan di bidang perpajakan, sebagaimana bukti-bukti empiris dan putusan-putusan pengadilan yang ada menunjukkan faktanya. Namun, kompleksitas dan permasalahan yang terdapat dalam tax evasion atau tax fraud tidak dapat menjadi justifikasi untuk mengabaikan nilai-nilai hukum yang ada dalam menangani kasus atau perkara pidana di bidang perpajakan di Indonesia, mengingat tujuan hukum pidana pada akhirnya adalah untuk memenuhi rasa keadilan.',
    '#',
    false,
    'PT Cakrawala Magna Scientia',
    '/images/books/13. hukum-pidana-di-bidang-perpajakan-di-indonesia.png',
    'Hukum Pidana Pajak',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-12',
    'PIDANA BADAN DAN PERTANGGUNGJAWABANNYA DI BIDANG PERPAJAKAN DI INDONESIA',
    'pidana-badan-dan-pertanggungjawabannya-di-bidang-perpajakan-di-indonesia',
    'Henry Dianto P. Sinaga & Edy Edwin P. Ginting',
    'Hukum',
    '978-623-10-4267-5',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    199000,
    'Sifat hukum pajak dan hukum korporasi yang rumit dan kompleks, teknologi yang canggih, strategi pajak yang beragam dan moderat, dan telah umumnya transaksi lintas batas di era digital saat ini menjadi beberapa tantangan penting dalam penegakan hukum pidana di bidang perpajakan dalam lingkup Badan. Meskipun menghadapi rintangan yang signifikan, tetapi penerapan hukum pidana Badan dalam perpajakan sangat penting untuk mendorong kepatuhan dan keadilan. Kendala dan tantangan yang ada tidak boleh menjadi pembenaran atas terhambatnya penegakan hukum di bidang perpajakan terhadap Badan yang melakukan tax evasion, tax fraud, dan/atau pelanggaran delik pidana perpajakan lainnya.',
    '#',
    false,
    'PT Cakrawala Magna Scientia',
    '/images/books/12. pidana-badan-dan-pertanggungjawabannya-di-bidang-perpajakan-di-indonesia.png',
    'Hukum Pidana Korporasi',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-13',
    'ALTERNATIVE DISPUTE RESOLUTION DALAM PIDANA PAJAK DI INDONESIA',
    'alternative-dispute-resolution-dalam-pidana-pajak-di-indonesia',
    'Wahyu Widodo',
    'Hukum',
    '978-6340-41-191-1',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    95000,
    'Buku ini menyuguhkan telaah komprehensif terhadap tantangan penegakan hukum dalam bidang perpajakan Indonesia, khususnya dalam menangani tindak pidana pajak yang merugikan pendapatan negara. Di tengah kompleksitas sistem self-assessment dan keterbatasan pendekatan litigasi konvensional, penulis mengusulkan penerapan Alternative Dispute Resolution (ADR) sebagai pendekatan strategis berbasis restorative justice yang lebih efisien, adil, dan fungsional.

Melalui kerangka teoritis yang kuat dan studi komparatif terhadap yurisdiksi seperti Amerika Serikat, Inggris, dan Australia, buku ini membuktikan bahwa ADR, meliputi mediasi, negosiasi, konsiliasi, dan arbitrase, dapat menjadi alat penyelesaian sengketa yang tidak hanya berorientasi pada pemulihan kerugian negara, tetapi juga membangun budaya kepatuhan sukarela. Penulis juga menyoroti urgensi penguatan regulasi, reformasi kelembagaan, pelatihan mediator bersertifikat, serta sosialisasi kepada wajib pajak dan aparat penegak hukum sebagai fondasi implementasi ADR yang berkelanjutan.

Ditujukan bagi akademisi, praktisi hukum, pembuat kebijakan, serta otoritas perpajakan, buku ini bukan hanya menawarkan gagasan konseptual, tetapi juga membangun peta jalan (roadmap) konkret menuju sistem keadilan pajak yang lebih restoratif, adaptif, dan manusiawi. Dalam konteks hukum pidana perpajakan, ADR tidak lagi dipandang sebagai alternatif sekunder, melainkan sebagai paradigma baru penegakan hukum fiskal yang mengutamakan pemulihan atas hukuman, dialog atas konfrontasi, dan partisipasi atas dominasi.',
    '#',
    false,
    'PT Cakrawala Magna Scientia',
    '/images/books/11. alternative-dispute-resolution-dalam-pidana-pajak-di-indonesia.png',
    'Restorative Justice',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-14',
    'AKUNTANSI PAJAK: TEORI DAN PRAKTIK DI INDONESIA',
    'akuntansi-pajak-teori-dan-praktik-di-indonesia',
    'Yudha Pramana',
    'Akuntansi',
    '978-634-05-3785-7',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    185000,
    'Buku ini mengajak pembaca melihat akuntansi pajak bukan sebagai pekerjaan “mengisi SPT”, melainkan sebagai sistem end-to-end yang menautkan transaksi harian, pencatatan, rekonsiliasi, hingga pelaporan fiskal dan penyajian pajak dalam laporan keuangan. Titik berangkatnya sederhana namun krusial: angka akuntansi komersial dan angka fiskal kerap berbeda bukan karena “rekayasa”, melainkan karena dua rezim memiliki tujuan yang berbeda, SAK/IFRS mengejar penyajian wajar, sementara hukum pajak mengejar pemajakan, kepastian hukum, dan administrasi penerimaan. Dari sinilah akuntansi pajak berperan sebagai jembatan: menerjemahkan laba akuntansi menjadi laba kena pajak melalui rekonsiliasi fiskal, sekaligus memastikan pajak kini dan pajak tangguhan disajikan memadai (PSAK 46/IAS 12), termasuk saat muncul ketidakpastian perlakuan pajak (ISAK 34/IFRIC 23).

Dengan konteks Indonesia yang menganut self-assessment dan bergerak menuju kepatuhan yang makin data-driven, buku ini menekankan bahwa kualitas proses, klasifikasi, dokumentasi, keterlacakan, dan control, sama pentingnya dengan hasil angka. Pembaca diajak membangun fondasi praktis, berupa COA yang “berbicara pajak”, tax tagging per transaksi, register pajak (PPN, bukti potong, penyusutan fiskal, nominatif), rekonsiliasi bulanan, hingga kontrol kunci agar sistem menjadi preventif, bukan reaktif. Pembahasan meluas dari PPh badan dan deferred tax sampai PPN, withholding taxes, kepabeanan/cukai/meterai, serta PPh Pasal 21 ditutup dengan perspektif internasional tentang treaty, BEPS/CbCR, dan dinamika global yang menuntut data semakin granular. Hasil akhirnya bukan hanya kepatuhan, melainkan angka pajak yang defensible, yang dapat dijelaskan sebagai cerita bisnis yang wajar, dapat ditelusuri sampai bukti, dan bermakna bagi manajemen, auditor, investor, dan publik.',
    '#',
    false,
    'PT Cakrawala Magna Scientia',
    '/images/books/16. akuntansi-pajak-teori-dan-praktik-di-indonesia.png',
    'Buku Teks',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-15',
    'PAJAK MERGER DAN AKUISISI (M&A) DI INDONESIA: PRINSIP DAN KONSEP',
    'pajak-merger-dan-akuisisi-m-dan-a-di-indonesia-prinsip-dan-konsep',
    'Andi Banua Adams & Joko Purnomo Raharjo',
    'Perpajakan',
    '978-634-05-3605-8',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    145000,
    'Merger & Acquisition (M&A) merupakan fenomena multidimensi yang berdiri di persimpangan hukum korporasi, akuntansi, keuangan, dan terutama perpajakan. Jika secara bisnis M&A dijual sebagai mesin pencipta nilai dan sinergi, maka dari sudut fiskal M&A hampir selalu dibaca sebagai peristiwa pengalihan harta dan perubahan pengendalian yang berpotensi memunculkan pajak. Ketegangan inilah yang membuat satu transaksi bisa melibatkan banyak pemangku kepentingan dengan agenda yang tidak selalu sejalan.

Buku ini menuntun pembaca memahami bentuk-bentuk M&A, pilihan struktur transaksi (share deal vs asset deal), hingga isu lintas negara seperti tax treaty dan beneficial ownership. Dalam hal ini, pajak tidak lagi tampil sebagai “biaya tambahan”, melainkan variabel desain yang bisa mengarahkan struktur pembiayaan, pemanfaatan rugi fiskal, akses fasilitas nilai buku, hingga manajemen risiko pajak historis target. Buku ini menyederhanakan labirin aturan menjadi peta jalan yang logis, yakni bagaimana satu transaksi bisa sekaligus menyentuh PPh, PPN, BPHTB, aturan administrasi/penegakan, hingga rezim perjanjian pajak internasional, lalu bagaimana membaca hierarki norma (UUD, UU, PP, PMK, PER) saat aturan tampak bertabrakan. Buku ini menanamkan fondasi penting, bahwa prinsip legalitas, fungsi budgetair-regulerend, serta asas domisili-sumber pada restrukturisasi adalah fasilitas bersyarat yang harus diupayakan. Pembaca juga diperkenalkan pada spektrum konsep kunci, berupa tax neutrality, tax efficiency, dan tax arbitrage, lengkap dengan “radar” pengujian substansi seperti substance over form dan business purpose test, serta pagar anti-penghindaran (SAAR/GAAR) yang makin menentukan struktur M&A modern. Buku ini juga membedah dilema klasik asset deal vs share deal, antara fleksibilitas dan step-up basis versus beban pajak di muka dan kompleksitas administratif, serta memperluas cakupan ke joint venture (JV), termasuk memilih bungkus hukum (PT/PMA vs KSO), mengelola kontrol dan hubungan istimewa, hingga memahami kapan setoran aset, share swap, atau pengalihan fungsi-risiko memicu pajak dan koreksi.

Semoga buku ini dapat menjadi panduan bagi praktisi, akademisi, dan eksekutif yang ingin merancang restrukturisasi yang masuk akal secara bisnis, aman secara hukum, dan efisien secara pajak, tanpa terjebak pada skema artifisial. Buku ini menunjukkan bahwa pajak bukan untuk “mematikan” M&A, melainkan untuk memastikan transaksi benar-benar menghasilkan nilai ekonomi riil, bukan sekadar permainan struktur untuk mengecilkan setoran ke kas negara.',
    '#',
    false,
    'PT Cakrawala Magna Scientia',
    '/images/books/15. pajak-merger-dan-akuisisi-m-dan-a-di-indonesia-prinsip-dan-konsep.png',
    'Pajak Korporasi',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-16',
    'Pajak Pertambangan di Indonesia: Dari Rente Mineral ke Kesejahteraan Publik',
    'pajak-pertambangan-di-indonesia-dari-rente-mineral-ke-kesejahteraan-publik',
    'Henry Dianto P. Sinaga; Yuli Teguh Hidayat',
    'Perpajakan',
    '',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    0,
    'Mineral dan batubara bukan sekadar komoditas ekonomi, melainkan kekayaan publik yang tidak terbarukan. Buku ini membahas bagaimana pajak pertambangan dapat berfungsi sebagai instrumen untuk menyeimbangkan kedaulatan negara, keadilan fiskal, kepastian investasi, pembangunan daerah, dan keberlanjutan lingkungan. Pembaca diajak menelaah royalti, PPh Badan, pajak rente sumber daya, windfall tax, BEPS, transfer pricing, dana reklamasi, desentralisasi fiskal, transparansi, pajak minimum global, serta tekanan dekarbonisasi. Pendekatan tersebut menempatkan pertanyaan distribusi di pusat analisis: siapa memperoleh manfaat, siapa menanggung risiko, dan bagaimana nilai mineral dikembalikan kepada masyarakat. Buku ini relevan bagi pembuat kebijakan, aparatur pajak, pelaku industri, akademisi, mahasiswa, konsultan, dan pembaca yang ingin memahami masa depan tata kelola fiskal pertambangan Indonesia.',
    '#',
    true,
    'PT Cakrawala Magna Scientia',
    '',
    'Segera Terbit',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-17',
    'Jejak Audit Pajak Pertambahan Nilai (PPN): Teknologi, Invoicing, dan Pencegahan Fraud di Indonesia',
    'jejak-audit-pajak-pertambahan-nilai-ppn-teknologi-invoicing-dan-pencegahan-fraud-di-indonesia',
    'Liza Khoironi; Sigit Haryoko',
    'Perpajakan',
    '',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    0,
    'PPN modern tidak lagi hanya berbicara tentang tarif, faktur, atau pelaporan pada akhir masa pajak. Tantangan utamanya adalah menjaga kesinambungan informasi di sepanjang rantai transaksi agar data dapat diverifikasi dan risiko fraud dapat dideteksi lebih dini. Buku ini menjelaskan bagaimana jejak audit PPN menjadi tulang punggung pengawasan; bagaimana perubahan dari faktur kertas menuju e-invoicing mengubah faktur menjadi objek data; serta bagaimana integrasi sistem, prepopulated return, analitik risiko, dan audit berbasis data dapat memperkuat kepatuhan. Pembahasan juga menyoroti faktur fiktif, klaim pajak masukan yang tidak sah, restitusi palsu, kualitas data, dasar hukum, perlindungan wajib pajak, dan kapasitas institusi. Buku ini ditujukan bagi aparatur pajak, akademisi, konsultan, pelaku usaha, auditor, mahasiswa, dan pembaca yang ingin memahami arah transformasi PPN di era digital.',
    '#',
    true,
    'PT Cakrawala Magna Scientia',
    '/images/books/2. jejak-audit-pajak-pertambahan-nilai-ppn-teknologi-invoicing-dan-pencegahan-fraud-di-indonesia.png',
    'Segera Terbit',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-18',
    'Treaty Shopping dan Anti-Abuse: Hukum, Kebijakan, dan Penegakan Hukum',
    'treaty-shopping-dan-anti-abuse-hukum-kebijakan-dan-penegakan-hukum',
    'Sigit Haryoko; Naufal Akbarsyah Gunawan',
    'Hukum',
    '',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    0,
    'Tax treaty dirancang untuk mengurangi pajak berganda dan mendukung kegiatan ekonomi lintas negara, tetapi struktur yang direkayasa dapat menggeser manfaat treaty kepada pihak yang tidak semestinya. Buku ini menjelaskan treaty shopping sekaligus evolusi pendekatan anti-abuse dari formalisme menuju perhatian yang lebih besar pada substansi ekonomi, tujuan transaksi, dan legitimasi manfaat treaty. Pembaca diperkenalkan pada berbagai instrumen seperti BEPS, Multilateral Instrument, Principal Purpose Test, Limitation on Benefits, beneficial ownership, serta relasi antarinstrumen dalam penegakan. Perspektif Indonesia diperkaya dengan pengalaman Jepang, Amerika Serikat, India, dan yurisdiksi lain untuk menunjukkan bahwa tidak ada satu solusi tunggal terhadap penyalahgunaan treaty. Buku ini menekankan keseimbangan: basis pajak perlu dilindungi secara tegas, tetapi kepastian hukum, due process, dan iklim investasi tetap harus dijaga.',
    '#',
    true,
    'PT Cakrawala Magna Scientia',
    '/images/books/3. treaty-shopping-dan-anti-abuse-hukum-kebijakan-dan-penegakan-hukum.png',
    'Segera Terbit',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-19',
    'Actus Reus dalam Tindak Pidana Perpajakan: Teori Delik, Unsur Objektif, dan Perbandingan Internasional',
    'actus-reus-dalam-tindak-pidana-perpajakan-teori-delik-unsur-objektif-dan-perbandingan-internasional',
    'Wahyu Widodo',
    'Hukum',
    '',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    0,
    'Penegakan pidana pajak membutuhkan kejelasan mengenai apa sebenarnya perbuatan terlarang yang harus dibuktikan sebelum menilai kesalahan batin pelaku. Buku ini menempatkan actus reus sebagai pintu masuk untuk memetakan unsur objektif tindak pidana perpajakan: subjek, tindakan atau kelalaian, dokumen dan transaksi, akibat fiskal, hubungan kausal, serta konteks administratif yang melatarinya. Pembahasan menghubungkan teori delik dengan realitas administrasi pajak, bukti, proses pemeriksaan, dan pertanggungjawaban, sekaligus memperkaya analisis melalui perspektif perbandingan internasional. Pendekatan ini membantu membedakan kekeliruan administratif, sengketa interpretasi, dan perbuatan yang benar-benar memenuhi unsur pidana. Buku ini relevan bagi penyidik, jaksa, hakim, konsultan, advokat, akademisi, mahasiswa, aparatur pajak, dan pelaku usaha yang membutuhkan kerangka objektif dan terukur dalam membaca tindak pidana perpajakan.',
    '#',
    true,
    'PT Cakrawala Magna Scientia',
    '/images/books/4. actus-reus-dalam-tindak-pidana-perpajakan-teori-delik-unsur-objektif-dan-perbandingan-internasional.png',
    'Segera Terbit',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-20',
    'Rekayasa Keuangan untuk Siklus Publik yang Volatil di Indonesia',
    'rekayasa-keuangan-untuk-siklus-publik-yang-volatil-di-indonesia',
    'Yuli Teguh Hidayat; Henry Dianto P. Sinaga',
    'Akuntansi',
    '',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    0,
    'Volatilitas membuat pengelolaan keuangan publik tidak cukup hanya mengandalkan proyeksi tunggal. Buku ini menawarkan cara berpikir rekayasa keuangan untuk membaca ketidakpastian, membangun ketahanan fiskal, dan menyusun pilihan pembiayaan yang lebih adaptif bagi Indonesia. Pembahasan diarahkan pada hubungan antara siklus ekonomi, risiko pasar, penerimaan dan belanja, kebutuhan likuiditas, struktur pembiayaan, serta konsekuensi keputusan fiskal lintas waktu. Alih-alih menjanjikan prediksi sempurna, buku ini menekankan desain portofolio kebijakan, skenario, buffer, disiplin pengukuran risiko, dan tata kelola keputusan sehingga guncangan tidak otomatis berubah menjadi krisis. Ditulis untuk pembuat kebijakan, pengelola keuangan publik, akademisi, mahasiswa, analis ekonomi, dan praktisi keuangan, buku ini membantu pembaca melihat keuangan negara sebagai sistem dinamis yang perlu diuji terhadap berbagai kondisi, bukan sekadar angka dalam satu tahun anggaran.',
    '#',
    true,
    'PT Cakrawala Magna Scientia',
    '/images/books/1. rekayasa-keuangan-untuk-siklus-publik-yang-volatil-di-indonesia.png',
    'Segera Terbit',
    NULL,
    NULL,
    NULL,
    500
),
(
    'book-21',
    'Bukti dan Pembuktian dalam Administrasi Perpajakan di Indonesia',
    'bukti-dan-pembuktian-dalam-administrasi-perpajakan-di-indonesia',
    'Sigit Haryoko; Liza Khoironi',
    'Hukum',
    '',
    2026,
    0,
    '155 x 230 mm (UNESCO B5)',
    0,
    'Bagaimana sebuah fakta pajak berubah menjadi bukti yang dapat dipercaya? Buku ini memetakan hukum pembuktian dalam administrasi perpajakan Indonesia sejak pemeriksaan, keberatan, banding di Pengadilan Pajak, hingga penagihan dan pelaksanaan putusan. Pembaca diajak memahami hubungan antara dasar konstitusional, UU KUP, UU Pengadilan Pajak, aturan informasi elektronik, administrasi pemerintahan, dan regulasi teknis dalam proses pembuktian. Uraiannya membahas siapa yang memikul beban pembuktian, bagaimana kualitas dan relevansi bukti dinilai, serta bagaimana dokumen, keterangan, saksi, ahli, dan bukti digital digunakan secara proporsional. Perspektif Indonesia diperkaya dengan perbandingan Belanda dan Amerika Serikat. Buku ini relevan bagi aparatur pajak, hakim, konsultan, advokat, akademisi, mahasiswa, dan wajib pajak yang membutuhkan kerangka berpikir sistematis mengenai pembuktian yang adil dalam sistem self-assessment.',
    '#',
    true,
    'PT Cakrawala Magna Scientia',
    '/images/books/6. bukti-dan-pembuktian-dalam-administrasi-perpajakan-di-indonesia.png',
    'Segera Terbit',
    NULL,
    NULL,
    NULL,
    500
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    author = EXCLUDED.author,
    category = EXCLUDED.category,
    isbn = EXCLUDED.isbn,
    tahun_terbit = EXCLUDED.tahun_terbit,
    ukuran_buku = EXCLUDED.ukuran_buku,
    harga = EXCLUDED.harga,
    sinopsis = EXCLUDED.sinopsis,
    buku_terbaru = EXCLUDED.buku_terbaru,
    penerbit = EXCLUDED.penerbit,
    badge = EXCLUDED.badge,
    updated_at = NOW();
