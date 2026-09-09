# PT CAKRAWALA MAGNA SCIENTIA (CakraNexa)
> **Platform E-Commerce & Portal Penerbitan Buku Akademik, Monografi Ilmiah, Perpajakan, Hukum, dan Riset Terapan Ber-ISBN**

---

## 📖 Daftar Isi

1. [Tentang Platform](#-tentang-platform)
2. [Arsitektur & Tech Stack](#-arsitektur--tech-stack)
3. [Daftar Fitur Lengkap Aplikasi](#-daftar-fitur-lengkap-aplikasi)
   - [A. Frontend Publik & Pengalaman Pengguna (Storefront)](#a-frontend-publik--pengalaman-pengguna-storefront)
   - [B. Modul E-Commerce & Checkout Cerdas](#b-modul-e-commerce--checkout-cerdas)
   - [C. Layanan Penerbitan, Pelatihan & Jurnal](#c-layanan-penerbitan-pelatihan--jurnal)
   - [D. Portal Administrator Redaksi & Toko (`/admin`)](#d-portal-administrator-redaksi--toko-admin)
   - [E. Infrastruktur Digital Marketing & Tracking (Meta & Google Ads)](#e-infrastruktur-digital-marketing--tracking-meta--google-ads)
   - [F. Mesin SEO Dinamis, JSON-LD Schema & Sitemap XML](#f-mesin-seo-dinamis-json-ld-schema--sitemap-xml)
4. [Struktur Direktori Proyek](#-struktur-direktori-proyek)
5. [Daftar Endpoint API Backend (REST API)](#-daftar-endpoint-api-backend-rest-api)
6. [Skema Database PostgreSQL (Supabase)](#-skema-database-postgresql-supabase)
7. [Variabel Lingkungan (.env)](#-variabel-lingkungan-env)
8. [Panduan Menjalankan Aplikasi Secara Lokal](#-panduan-menjalankan-aplikasi-secara-lokal)
9. [Dokumentasi Pendukung](#-dokumentasi-pendukung)

---

## 🏛️ Tentang Platform

**PT CAKRAWALA MAGNA SCIENTIA** (Brand Publikasi: **CakraNexa**) adalah platform e-commerce dan portal penerbitan buku akademik resmi berstandar **IKAPI** & **Perpustakaan Nasional RI**. Platform ini dirancang khusus untuk memenuhi kebutuhan diseminasi literatur ilmiah, buku teks perguruan tinggi standar UNESCO B5, serta monografi otoritatif di bidang **Hukum Perpajakan**, **Standar Akuntansi Keuangan**, **Hukum Bisnis**, **Filsafat**, dan **Teologia**.

Platform ini dibangun secara *decoupled full-stack*:
- **Frontend**: React 19 SPA berkecepatan tinggi dengan Tailwind CSS, responsif di seluruh perangkat (Mobile, Tablet, Desktop).
- **Backend API**: Node.js Express server yang menangani proxy Midtrans Snap, kalkulator logistik multi-kurir, manajemen pesanan, dan SEO generator.
- **Database & Storage**: PostgreSQL via Supabase dengan Row Level Security (RLS) serta fallback cache in-memory.

---

## ⚡ Arsitektur & Tech Stack

| Layer | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 + Vite 6 + TypeScript | Single Page Application (SPA) responsif & ultra-cepat |
| **Styling & UI** | Tailwind CSS + Lucide Icons | Desain tema *Deep Navy & Metallic Gold* berwibawa khas akademik |
| **State Management** | React Hooks + Custom Events | Manajemen reaktif keranjang belanja, filter katalog, & modal checkout |
| **Backend API** | Node.js + Express + TypeScript | REST API untuk produk, order, kalkulasi ongkir, & webhook pembayaran |
| **Database** | Supabase (PostgreSQL 15) | Tabel `books`, `orders`, `order_items`, `seo_settings`, `site_content` (+ modul `shipping_methods`, `admin_bank_accounts`, `payment_settings`) dengan RLS ketat |
| **Payment Gateway** | Midtrans Snap & Transfer Manual | Mendukung QRIS, Virtual Account (BCA, Mandiri, BNI, BRI), Kartu Kredit, & Bukti Transfer |
| **Ekspedisi / Logistik**| JNE, SiCepat, POS Indonesia, J&T | Kalkulator berat volumetrik otomatis & zonasi wilayah Indonesia |
| **Tracking & Analytics**| Meta Pixel, GA4, GTM, Google Ads | Pelacakan otomatis `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase` |

---

## 🚀 Daftar Fitur Lengkap Aplikasi

### A. Frontend Publik & Pengalaman Pengguna (Storefront)

1. **Header & Navigasi Interaktif (`Navbar.tsx`)**:
   - Logo vektor emas CakraNexa dengan tipografi modern.
   - Menu dropdown kategori buku instan (*Akuntansi, Perpajakan, Hukum, Ekonomi & Bisnis, Filsafat, Teologia*).
   - Menu layanan redaksi (*Penerbitan, Pelatihan, Jurnal, Tentang Kami, Blog, Karir, Kontak*).
   - Tombol pencarian instan (Modal Quick Search) & ikon keranjang belanja dengan badge jumlah barang dinamis.
   - Menu mobile drawer responsif dengan animasi mulus.

2. **Hero Section Dinamis (`Hero.tsx`)**:
   - Slider otomatis 4 banner bertema keilmuan dengan transisi visual elegan.
   - Navigasi tombol CTA langsung ke katalog 17 buku atau pengajuan naskah ilmiah.
   - Badge keunggulan penerbit: *Resmi IKAPI, Standar UNESCO B5, ISBN Perpusnas*.

3. **Promo & Highlights Banner Carousel (`PromoBannerCarousel.tsx`)**:
   - Banner sorotan publikasi utama tahun berjalan (contoh: *Trilogi Reformulasi PPN Digital*).
   - Tumpukan visual 3D cover buku terlaris dengan badge status edisi khusus.

4. **Katalog Buku & Filter Multidimensi (`BookGrid.tsx` & `FilterSidebar.tsx`)**:
   - **Koleksi Lengkap 21 Buku Akademik**: Setiap buku memuat metadata lengkap (ISBN, Halaman, Tahun, Ukuran, Harga, Diskon, Sinopsis, Daftar Isi, Profil Penulis).
   - **Filter Kategori**: Menyaring buku berdasarkan disiplin ilmu dengan sekali klik.
   - **Filter Buku Terbaru**: Menampilkan hanya judul berstatus *Featured / Buku Terbaru*.
   - **Sortir Fleksibel**: Berdasarkan Terpopuler, Rating Tertinggi, Harga Terendah, dan Harga Tertinggi.
   - **Live Search Bar**: Pencarian instan berdasarkan judul buku, nama penulis, atau nomor ISBN.

5. **Tampilan Rincian Buku Mendalam (`BookDetailView.tsx`)**:
   - Preview visual cover buku resolusi tinggi dengan efek bayangan buku realistis (*book spine*).
   - Tab navigasi detail: **Sinopsis Ilmiah**, **Tentang Penulis & Dewan Pakar**, **Daftar Isi (Bab per Bab)**, dan **Ulasan Pembaca**.
   - Kalkulator kuantitas dinamis dan tombol ganda: **+ Keranjang Belanja** dan **Beli Sekarang (Instant Checkout)**.
   - Rekomendasi 4 buku terkait dalam kategori keilmuan yang sama.
   - Tombol bagikan ke WhatsApp, LinkedIn, dan Salin Tautan (Copy Link).

6. **Modal Pencarian Cepat (`QuickSearchModal.tsx`)**:
   - Shortcut keyboard `Ctrl+K` atau klik ikon pencarian di navbar.
   - Menampilkan hasil pencarian seketika beserta thumbnail, harga, dan kategori.

---

### B. Modul E-Commerce & Checkout Cerdas

1. **Keranjang Belanja Geser (`CartDrawer.tsx`)**:
   - Drawer slide-over sisi kanan dengan ringkasan item, kontrol jumlah kuantitas (+/-), dan hapus item.
   - Subtotal harga otomatis dan estimasi berat buku dalam gram.
   - Tombol *Lanjutkan ke Pembayaran* yang langsung membuka alur checkout.

2. **Formulir & Modal Checkout 2 Tahap (`CheckoutModal.tsx` & `CheckoutForm.tsx`)**:
   - **Input Data Pengiriman**: Nama lengkap, Nomor WhatsApp aktif, Email (untuk pengiriman faktur otomatis), Alamat lengkap, Provinsi, Kota/Kabupaten, dan Kode Pos.
   - **Kalkulator Ekspedisi Logistik**:
     * Kurir: **JNE (REG/YES)**, **SiCepat (SIUNT/BEST)**, **POS Indonesia (Kilat Khusus)**, **J&T Express (EZ)**.
     * Perhitungan ongkos kirim otomatis berdasarkan bobot total pesanan dan zonasi kode pos (Jawa vs Luar Jawa).
     * Dukungan promo gratis ongkir jika nominal pesanan memenuhi syarat.
   - **Pilihan Metode Pembayaran**:
     * **Payment Gateway Midtrans**: Snap popup untuk QRIS (GoPay, OVO, ShopeePay), Virtual Account (BCA, Mandiri, BNI, BRI, Permata), dan Kartu Kredit.
     * **Transfer Bank Manual**: Rekening resmi PT Cakrawala Magna Scientia (BCA / Mandiri) dengan fitur unggah bukti transfer.
     * **COD (Cash on Delivery)**: Bayar tunai saat kurir tiba.
   - **Penerbitan Faktur & Notifikasi Otomatis (`NotificationService.ts`)**:
     * Pembuatan nomor invoice unik (contoh: `INV/2024/CKR-8921`).
     * Trigger pesan konfirmasi pemesanan dan resi otomatis via WhatsApp API.
     * Pengiriman salinan rincian pesanan ke email pelanggan dan administrator redaksi.

---

### C. Layanan Penerbitan, Pelatihan & Jurnal

1. **Layanan Penerbitan Buku (`PenerbitanView.tsx`)**:
   - 3 Paket Penerbitan: **Paket Dasar (ISBN & Layout)**, **Paket Akademik Standar (UNESCO B5 + Mitra Bestari)**, dan **Paket Eksklusif Hardcover (Distribusi Nasional & Promosi)**.
   - Alur penerbitan dari pengiriman draft naskah, peer-review, layouting, pengurusan ISBN Perpusnas, hingga cetak & distribusi.
   - Formulir kirim naskah interaktif terhubung langsung ke WhatsApp redaksi.

2. **Layanan Pelatihan & Workshop Akademik (`PelatihanView.tsx`)**:
   - Program pelatihan penulisan monografi doktoral, teknik sitasi Scopus/SINTA, dan workshop perpajakan terapan.
   - Rincian kurikulum, profil instruktur pakar, dan pendaftaran peserta.

3. **Publikasi Jurnal Ilmiah (`JurnalView.tsx`)**:
   - Informasi berkala jurnal ilmiah terindeks SINTA & Garuda binaan PT Cakrawala Magna Scientia.
   - Panduan *Call for Papers*, fokus & scope, serta pedoman penulisan artikel jurnal.

4. **Halaman Profil Perusahaan (`TentangKamiView.tsx`)**:
   - Visi, Misi, Sejarah, Struktur Dewan Redaksi/Tim Pakar, serta Legalitas & Perizinan perseroan terbatas.

5. **Blog & Wawasan Fiskal (`BlogView.tsx`)**:
   - Artikel editorial berkala mengenai analisis perpajakan, audit forensik, dan ulasan hukum bisnis terbaru.

6. **Karir & Kontributor Naskah (`CareerView.tsx`)**:
   - Informasi lowongan editor akademik, reviewer independen, dan desainer tata letak.

7. **Kontak & Lokasi Kantor (`KontakView.tsx`)**:
   - Formulir pesan, alamat kantor di Jakarta, nomor WhatsApp resmi, email redaksi, dan jam operasional.

---

### D. Portal Administrator Redaksi & Toko (`/admin`)

Akses portal admin melalui menu footer atau navigasi `/admin`.

1. **Tab 1: Executive Analytics (`ExecutiveAnalyticsDashboard.tsx`)**:
   - Kartu metrik utama: Total Pendapatan (IDR), Total Buku Terjual, Jumlah Pesanan Masuk, Rata-rata Nilai Transaksi (AOV).
   - Grafik tren penjualan mingguan/bulanan, distribusi penjualan per kategori keilmuan, dan daftar 5 buku terlaris (*Top 5 Best Sellers*).
   - Peringatan stok buku menipis (*Low Stock Alert*).

2. **Tab 2: Katalog & Inventaris Buku**:
   - Tabel manajemen seluruh buku dengan pencarian & filter kategori.
   - **Tombol Tambah Buku Baru (CRUD)**: Modal input lengkap dengan judul, penulis, ISBN, harga, diskon, halaman, ukuran, sinopsis, daftar isi, jadwal rilis, dan unggah cover buku.
   - **Upload Cover Gambar**: Mendukung pengisian URL gambar langsung atau upload file gambar dari komputer (otomatis dikonversi ke format gambar/Base64).
   - **Toggle Buku Terbaru**: Mengaktifkan atau menonaktifkan badge *Buku Terbaru* di etalase toko.
   - **Tombol Reset Data Seed**: Mengembalikan katalog ke 17 buku standar awal jika diperlukan.

3. **Tab 3: Pesanan & Dispatcher Penjualan**:
   - Tabel seluruh pesanan masuk dengan pencarian nomor invoice, nama pembeli, atau nomor WhatsApp.
   - Filter status pesanan: `PENDING`, `PAID`, `PROCESSING`, `SHIPPED`, `CANCELLED`.
   - **Modal Bukti Transfer**: Melihat foto bukti transfer yang diunggah pembeli dan memvalidasi status ke `PAID` dengan satu klik.
   - **Input Nomor Resi Kurir (Tracking Number)**: Form inline untuk mengisi resi pengiriman (misal: `JNE-88219481`).
   - **Dispatcher WhatsApp & Email**: Tombol sekali klik untuk mengirim notifikasi nomor resi ke nomor WhatsApp dan email pembeli.

4. **Tab 4: Management Pengiriman & Ekspedisi (`ShippingManagementTab.tsx`)**:
   - Konfigurasi status aktif/non-aktif kurir (JNE, SiCepat, POS, J&T).
   - Pengaturan tarif dasar per kilogram dan estimasi waktu sampai (ETD).
   - Pengaturan batas minimal belanja untuk promo gratis ongkir (*Free Shipping Threshold*).

5. **Tab 5: Management Pembayaran & Rekening Bank (`PaymentManagementTab.tsx`)**:
   - Pengaturan rekening bank resmi perusahaan (Nomor rekening BCA, Mandiri, BNI, BRI, atas nama PT Cakrawala Magna Scientia).
   - Konfigurasi QRIS statis dan kredensial Midtrans Client & Server Key.

6. **Tab 6: Pengaturan SEO & Meta Tags Google (`SeoSettingsTab.tsx`)**:
   - Pengaturan judul website (*Site Title*), slogan penerbit, target kata kunci (*Keywords*), dan meta deskripsi.
   - Kustomisasi gambar Open Graph (*Social Share Image*) untuk tampilan pratinjau di WhatsApp, Facebook, dan Twitter.
   - Pratinjau visual langsung hasil pencarian di Google Search (*SERP Preview*).
   - Konfigurasi ID Google Analytics (GA4), Meta Pixel, Google Tag Manager, dan Google Ads Conversion.

7. **Tab 7: Audit On-Page SEO (`SeoAnalysisTab.tsx`)**:
   - Skor kesehatan SEO keseluruhan (0-100%).
   - Checklist otomatis: Title tag length, Meta description density, Open Graph tags, Canonical URL, JSON-LD Structured Data, Robots.txt, dan Sitemap.xml.

---

### E. Infrastruktur Digital Marketing & Tracking (Meta & Google Ads)

Platform telah dilengkapi modul pelacakan terpadu (`src/services/trackingService.ts`) yang otomatis menginjeksi skrip dan memicu event e-commerce standar:

1. **Meta Pixel (Facebook & Instagram Ads)**:
   - Event `PageView`: Dipicu di setiap perpindahan halaman SPA.
   - Event `ViewContent`: Dipicu saat pengguna membuka rincian buku akademik, menyertakan parameter `content_name`, `content_ids`, `content_type: 'product'`, `value`, dan `currency: 'IDR'`.
   - Event `AddToCart`: Dipicu saat buku dimasukkan ke keranjang belanja atau memilih opsi *Beli Sekarang*.
   - Event `InitiateCheckout`: Dipicu saat formulir checkout dibuka.
   - Event `Purchase`: Dipicu saat pembayaran berhasil diverifikasi (Midtrans settlement / manual transfer terkonfirmasi).

2. **Google Analytics 4 (GA4)**:
   - Event `page_view`: Pelacakan halaman dinamis.
   - Event `view_item`: Pengiriman data produk dan harga.
   - Event `add_to_cart`: Pengiriman item dan kuantitas.
   - Event `begin_checkout`: Pengiriman daftar barang dan total nilai keranjang.
   - Event `purchase`: Pengiriman ID transaksi, mata uang IDR, dan rincian item belanja.

3. **Google Tag Manager (GTM)**:
   - Skrip GTM container otomatis diinjeksi ke `<head>` dan `dataLayer.push({...})` aktif untuk setiap event e-commerce.

4. **Google Ads Conversion Tracking**:
   - Terpicu saat event `Purchase` selesai untuk mencatat konversi iklan Google Ads dengan ID dan Conversion Label resmi.

---

### F. Mesin SEO Dinamis, JSON-LD Schema & Sitemap XML

1. **Dynamic Meta Tags (`useSeoMetadata.ts`)**:
   - Otomatis memperbarui tag `<title>`, `<meta name="description">`, `<meta name="keywords">`, `<link rel="canonical">`, serta tag Open Graph (`og:title`, `og:description`, `og:image`, `og:url`) sesuai halaman atau buku yang sedang dibuka.

2. **Book Structured Data (JSON-LD Schema.org)**:
   - Otomatis menginjeksi skrip `@type: "Book"` dengan parameter `name`, `isbn`, `author`, `publisher`, `offers (Price & Availability)`, dan `workExample` agar terindeks sempurna di Google Rich Results.

3. **Sitemap XML & Robots.txt Otomatis**:
   - Endpoint `/sitemap.xml`: Menghasilkan peta situs XML dinamis mencakup seluruh 21 URL buku akademik dan halaman statis.
   - Endpoint `/robots.txt`: Mengatur crawling bot mesin pencari dan memproteksi rute privat seperti `/admin` dan `/checkout`.

---

## 📁 Struktur Direktori Proyek

```text
├── .env.example                 # Template variabel konfigurasi lingkungan
├── index.html                   # Entry point HTML frontend dengan meta tags
├── metadata.json                # Metadata AI Studio & permission konfig
├── package.json                 # Daftar dependensi npm & build scripts
├── schema.sql                   # Skrip DDL PostgreSQL untuk migrasi database Supabase
├── server.ts                    # Backend server Express (API, Midtrans, Shipping, SEO)
├── vite.config.ts               # Konfigurasi bundler Vite
├── public/                      # Folder file publik & aset statis
│   ├── assets/                  # Sub-aset
│   ├── images/                  # Direktori utama aset gambar website
│   │   ├── books/               # Cover 17 buku akademik
│   │   ├── banners/             # Background banner Hero & Promo
│   │   ├── blog/                # Cover artikel blog & analisis hukum
│   │   └── logo/                # Logo resmi PT Cakrawala Magna Scientia
│   ├── logo.jpg                 # Logo default CakraNexa
│   ├── robots.txt               # Fallback robots file
│   └── sitemap.xml              # Fallback sitemap file
└── src/
    ├── App.tsx                  # Root component & router state manajemen
    ├── main.tsx                 # React DOM mount point
    ├── index.css                # Global CSS Tailwind directives
    ├── types.ts                 # Definisi tipe TypeScript utama (Book, Order, dll)
    ├── components/              # Komponen antarmuka pengguna (UI Components)
    │   ├── AdminDashboard.tsx   # Portal utama Administrator Redaksi
    │   ├── BlogView.tsx         # Tampilan artikel & opini hukum
    │   ├── BookCard.tsx         # Kartu etalase produk buku
    │   ├── BookCarousel.tsx     # Slider buku terlaris
    │   ├── BookDetailView.tsx   # Halaman rincian buku akademik
    │   ├── BookGrid.tsx         # Grid katalog 17 buku
    │   ├── CakraNexaLogo.tsx    # Komponen vektor SVG logo resmi
    │   ├── CareerView.tsx       # Halaman karir & kontributor naskah
    │   ├── CartDrawer.tsx       # Drawer keranjang belanja geser
    │   ├── CheckoutForm.tsx     # Formulir input data pengiriman & pembayaran
    │   ├── CheckoutModal.tsx    # Modal container alur checkout
    │   ├── ExecutiveAnalyticsDashboard.tsx # Dasbor grafik analitik penjualan
    │   ├── FilterSidebar.tsx    # Sidebar filter kategori & harga
    │   ├── Footer.tsx           # Footer navigasi, kontak, & legalitas
    │   ├── Hero.tsx             # Hero section slider utama beranda
    │   ├── JurnalView.tsx       # Tampilan publikasi jurnal ilmiah
    │   ├── KontakView.tsx       # Formulir kontak & alamat redaksi
    │   ├── Navbar.tsx           # Header navigasi & dropdown kategori
    │   ├── PaymentManagementTab.tsx  # Tab admin pengaturan bank & QRIS
    │   ├── PaymentMethods.tsx   # Komponen pilihan metode pembayaran
    │   ├── PelatihanView.tsx    # Tampilan workshop & pelatihan akademik
    │   ├── PenerbitanView.tsx   # Tampilan paket penerbitan buku ber-ISBN
    │   ├── PromoBannerCarousel.tsx   # Carousel banner promo terbitan
    │   ├── PublisherShowcase.tsx     # Komponen showcase tumpukan buku 3D
    │   ├── QuickSearchModal.tsx # Modal pencarian cepat (Ctrl+K)
    │   ├── SeoAnalysisTab.tsx   # Tab admin audit kesehatan SEO
    │   ├── SeoSettingsTab.tsx   # Tab admin konfigurasi meta & tracking
    │   ├── ShippingCalculator.tsx    # Komponen kalkulator ongkir checkout
    │   ├── ShippingManagementTab.tsx # Tab admin pengaturan tarif ekspedisi
    │   └── TentangKamiView.tsx  # Halaman profil, visi misi, & dewan pakar
    ├── data/
    │   ├── analyticsData.ts     # Data seed analitik dan metrik penjualan
    │   └── booksData.ts         # Database 17 buku akademik karya dewan pakar
    ├── hooks/
    │   └── useSeoMetadata.ts    # Custom hook untuk manipulasi dynamic meta tags
    └── services/
        ├── NotificationService.ts # Service dispatch notifikasi WhatsApp & Email
        ├── apiClient.ts          # Axios / Fetch client untuk backend API
        ├── paymentService.ts     # Service manajemen metode pembayaran & Midtrans
        ├── seoService.ts         # Service penyimpanan konfigurasi SEO
        ├── shippingService.ts    # Service kalkulasi ongkir & manajemen kurir
        ├── supabaseClient.ts     # Inisialisasi koneksi Supabase client
        └── trackingService.ts    # Inisialisasi & trigger event Meta Pixel, GA4, GTM, Google Ads
```

---

## 🌐 Daftar Endpoint API Backend (REST API)

Backend Express (`server.ts`) melayani endpoint REST berikut:

| Method | Endpoint | Deskripsi | Akses |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Healthcheck: status Supabase, Midtrans, konfigurasi admin | Publik |
| `POST` | `/api/admin/login` | Login admin (`{ password }`) → token sesi 12 jam. Rate-limit 10x/15 menit | Publik |
| `GET` | `/api/admin/me` | Verifikasi token sesi admin | Admin |
| `POST` | `/api/admin/logout` | Mencabut token sesi | Admin |
| `GET` | `/api/books` | Seluruh katalog buku (Supabase → fallback memory) | Publik |
| `GET` | `/api/books/:id` | Rincian 1 buku berdasarkan ID atau slug | Publik |
| `POST` | `/api/books` | Tambah / perbarui buku (upsert ke Supabase) | **Admin** |
| `DELETE`| `/api/books/:id` | Hapus buku | **Admin** |
| `GET` | `/api/orders` | Seluruh pesanan beserta item (berisi PII pelanggan) | **Admin** |
| `GET` | `/api/orders/:id/status` | Status bayar & resi satu pesanan (tanpa data pribadi) | Publik |
| `POST` | `/api/orders` | Buat pesanan. Server **menghitung ulang total dari harga katalog**, memeriksa stok, mengurangi stok, dan membuat Snap token Midtrans | Publik |
| `PATCH`| `/api/orders/:id` | Update status pembayaran (`pending/paid/processing/shipped/failed/cancelled`) & nomor resi | **Admin** |
| `POST` | `/api/shipping/calculate` | Estimasi ongkir multi-kurir (tarif internal; RajaOngkir belum terintegrasi) | Publik |
| `POST` | `/api/payment/midtrans-webhook` | Notifikasi Midtrans — **signature SHA-512 diverifikasi**, status disimpan ke Supabase | Midtrans |
| `GET` | `/api/seo` | Konfigurasi SEO, meta tags, & tracking ID | Publik |
| `POST` | `/api/seo` | Simpan konfigurasi SEO | **Admin** |
| `GET` | `/api/site-content` | Konten CMS (menu, hero, footer, dst). `204` jika belum ada | Publik |
| `POST` | `/api/site-content` | Simpan konten CMS | **Admin** |
| `GET` | `/sitemap.xml` | Sitemap dinamis dari katalog aktual | Publik |
| `GET` | `/robots.txt` | Robots.txt dinamis (mengikuti flag `noindex`) | Publik |

**Autentikasi Admin:** endpoint bertanda **Admin** memerlukan header `Authorization: Bearer <token>` (token dari `/api/admin/login`) atau `X-Admin-Key: <ADMIN_API_KEY>`. Frontend menyertakannya otomatis lewat `apiClient` setelah login di `/admin`.

---

## 🗄️ Skema Database PostgreSQL (Supabase)

Tabel database telah dirancang dan tersedia di file `schema.sql`:

1. **Tabel `books`**: Menyimpan data 17 judul buku (sesuai dokumen resmi redaksi), slug, ISBN, harga, diskon, spesifikasi buku, sinopsis, dan URL cover.
2. **Tabel `orders`**: Menyimpan riwayat checkout, data identitas pembeli, alamat pengiriman, kurir, ongkir, total tagihan, metode bayar, bukti transfer, dan nomor resi.
3. **Tabel `order_items`**: Menyimpan relasi item buku dan kuantitas untuk setiap transaksi pesanan.
4. **Tabel `seo_settings`** (singleton `id=1`): metadata situs, GA4, Meta Pixel, GTM, Google Ads.
5. **Tabel `site_content`** (singleton `id=1`, JSONB): seluruh konten CMS (navigasi, hero, footer, paket penerbitan, dll).
6. **Fungsi `decrement_book_stock(book_id, qty)`**: pengurangan stok atomik saat checkout.
7. **Modul logistik & pembayaran** (`src/db/shipping_and_payments_schema.sql`): `shipping_methods`, `admin_bank_accounts`, `payment_settings`.

**Kebijakan RLS:** browser (anon key) hanya boleh *membaca* `books`, `seo_settings`, `site_content`, `shipping_methods`, `admin_bank_accounts`, `payment_settings`. Tabel `orders`/`order_items` **tidak dapat dibaca publik** — hanya server (service role) yang mengaksesnya.

---

## ⚙️ Variabel Lingkungan (.env)

Contoh isi file `.env` (lihat `.env.example` untuk referensi lengkap):

```env
# ---- Frontend (Vite, aman dipublikasikan) ----
VITE_API_BASE_URL=""                      # kosong = same-origin; produksi: https://cakranexa-api.onrender.com
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="..."
VITE_MIDTRANS_CLIENT_KEY="SB-Mid-client-xxxx"

# ---- Backend (Express, RAHASIA) ----
NODE_ENV="development"
PORT=3000
SITE_URL="https://cakranexa.com"
ALLOWED_ORIGINS="https://cakranexa.com,https://cakranexa.vercel.app"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="..."
ADMIN_PASSWORD="ganti-dengan-password-kuat"   # WAJIB — tanpa ini /admin tidak bisa diakses
ADMIN_API_KEY=""                               # opsional, untuk integrasi server-to-server
MIDTRANS_SERVER_KEY="SB-Mid-server-xxxx"
MIDTRANS_IS_PRODUCTION="false"
```

> Jika `MIDTRANS_SERVER_KEY` belum diisi atau Snap gagal menghasilkan token, pembayaran online ditolak sebagai **tidak tersedia**. Tidak ada status lunas yang dapat dibuat dari simulasi; status pembayaran final di produksi selalu ditentukan oleh webhook Midtrans.

---

## 💻 Panduan Menjalankan Aplikasi Secara Lokal

1. **Clone repositori dan pasang dependensi**:
   ```bash
   git clone <repo-url>
   cd cakranexa-platform
   npm install
   ```

2. **Siapkan `.env`** (salin dari `.env.example`, minimal isi `ADMIN_PASSWORD`).

3. **Jalankan dalam mode Development** (Express + Vite middleware, satu port):
   ```bash
   npm run dev
   ```
   Aplikasi berjalan di `http://localhost:3000`. Alternatif: `npm run dev:client` (Vite di :5173 dengan proxy `/api` ke :3000).

4. **Build untuk Production** (klien → `dist/`, server → `dist/server.cjs`):
   ```bash
   npm run build
   ```

5. **Jalankan Server Production**:
   ```bash
   npm start
   ```

---

## 📚 Dokumentasi Pendukung

- **`CHANGELOG_PERBAIKAN.md`**: Hasil audit kode, daftar masalah kritis yang diperbaiki, dan pekerjaan lanjutan yang masih perlu dilakukan sebelum go-live.

Untuk panduan teknis lanjutan, silakan baca dokumentasi berikut:
- **`GAMBAR_DAN_ASSETS.md`**: Panduan ukuran piksel seluruh gambar (banner, logo, cover buku), lokasi folder, nama file, dan cara mengganti aset dummy dengan gambar asli.
- **`PANDUAN_DEPLOY_DAN_VSCODE.md`**: Panduan langkah-demi-langkah deploy ke Vercel, Render, integrasi Supabase, dan hal-hal yang dapat disempurnakan di VS Code lokal.

---

**PT CAKRAWALA MAGNA SCIENTIA (CakraNexa)**  
*Membangun Peradaban Melalui Keunggulan Literatur Ilmiah dan Otoritas Keilmuan.*
