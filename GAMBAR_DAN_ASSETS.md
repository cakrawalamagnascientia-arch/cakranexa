# PANDUAN LENGKAP PENGGANTIAN GAMBAR & ASET ASLI (IMAGE REPLACEMENT GUIDE)
## PT CAKRAWALA MAGNA SCIENTIA (CakraNexa)

Panduan ini disusun secara rinci dan terstruktur untuk mempermudah Anda mengganti seluruh gambar dummy / placeholder yang ada di website dengan gambar asli beresolusi tinggi, baik secara langsung melalui folder proyek maupun melalui **Portal Admin Dashboard (CRUD)** tanpa perlu mengubah kode.

---

## 📁 1. Lokasi Folder Penyimpanan Gambar Proyek

Seluruh aset gambar statis disimpan di dalam direktori `public/`:

```text
public/
├── images/
│   ├── books/             # 📚 Cover 21 Buku Akademik & Monografi
│   ├── banners/           # 🖼️ Banner Hero Slider Beranda & Promo
│   ├── blog/              # 📰 Gambar Cover Artikel Blog & Opini Hukum
│   ├── logo/              # 🏛️ Logo Perusahaan & Ikon Web (PNG, SVG, JPG)
│   ├── team/              # 👨‍🏫 Foto Dewan Redaksi & Tim Pakar
│   └── payment/           # 💳 QRIS & Logo Metode Pembayaran
├── logo.jpg               # Logo default root
├── og-image.jpg           # Default Social Sharing Open Graph Image (1200x630)
└── favicon.ico            # Favicon tab browser
```

> **Tips Cepat:** Anda cukup menaruh file gambar asli Anda ke dalam subfolder yang sesuai dengan nama file yang sama (overwrite), dan gambar di website akan langsung berubah seketika!

---

## 📐 2. Tabel Lengkap Dimensi, Ukuran Piksel & Aspek Rasio Seluruh Gambar

Berikut adalah standar ukuran piksel (*width x height*), rasio aspek, format yang direkomendasikan, dan batas ukuran file untuk memastikan tampilan tajam tanpa memperlambat loading website:

| Jenis Aset | Dimensi Rekomendasi (W x H) | Rasio Aspek | Format Ideal | Batas Ukuran File | Lokasi Folder |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cover Buku Utama** | `600 x 900 px` s/d `800 x 1200 px` | 2:3 (Vertikal) | WebP / PNG / JPG | Max 300 KB | `/public/images/books/` |
| **Hero Slide Banner** | `1920 x 800 px` s/d `1920 x 1080 px` | 16:9 / 2.4:1 | WebP / JPG | Max 500 KB | `/public/images/banners/` |
| **Promo Highlights Banner**| `1200 x 600 px` s/d `1600 x 800 px` | 2:1 | WebP / JPG | Max 400 KB | `/public/images/banners/` |
| **Cover Artikel Blog** | `800 x 450 px` s/d `1200 x 675 px` | 16:9 | WebP / JPG | Max 250 KB | `/public/images/blog/` |
| **Foto Tim / Dewan Redaksi**| `400 x 400 px` s/d `600 x 600 px` | 1:1 (Persegi) | WebP / PNG | Max 150 KB | `/public/images/team/` |
| **QRIS Statis Pembayaran**| `600 x 600 px` s/d `800 x 800 px` | 1:1 (Persegi) | PNG / JPG | Max 200 KB | `/public/images/payment/` |
| **Logo Resmi Perusahaan** | `400 x 120 px` s/d `800 x 240 px` | ~ 3.3:1 (Horizontal) | PNG Transparent / SVG | Max 100 KB | `/public/images/logo/` |
| **Open Graph (Social Share)**| `1200 x 630 px` | 1.91:1 | JPG / PNG | Max 300 KB | `/public/og-image.jpg` |
| **Favicon Browser** | `32 x 32 px` & `64 x 64 px` | 1:1 | ICO / PNG | Max 50 KB | `/public/favicon.ico` |

---

## 📚 3. Daftar Nama File Cover 21 Buku Akademik

Berikut adalah daftar judul 21 buku yang terdaftar di aplikasi beserta nama file cover yang disiapkan:

| No | Judul Buku | ID / Slug | Rekomendasi Nama File di `/public/images/books/` |
| :---: | :--- | :--- | :--- |
| 1 | Reformulasi Konsep Pembuktian Sengketa Perpajakan di Era Digital | `buku-1` / `reformulasi-pembuktian-pajak` | `book-1-reformulasi-pembuktian.webp` |
| 2 | Trilogi Hukum Pajak Materiil: Rekonstruksi Subjek & Objek Pajak | `buku-2` / `trilogi-hukum-pajak-materiil` | `book-2-trilogi-pajak-materiil.webp` |
| 3 | Core Tax Administration System: Tata Kelola & Mitigasi Risiko | `buku-3` / `core-tax-administration-system` | `book-3-core-tax-system.webp` |
| 4 | Akuntansi Forensik & Audit Investigatif Keuangan Negara | `buku-4` / `akuntansi-forensik-audit` | `book-4-akuntansi-forensik.webp` |
| 5 | Hukum Acara Peradilan Pajak: Teori, Praktik, & Yurisprudensi | `buku-5` / `hukum-acara-peradilan-pajak` | `book-5-hukum-acara-pajak.webp` |
| 6 | Panduan Komprehensif Pajak Internasional & Transfer Pricing | `buku-6` / `panduan-pajak-internasional` | `book-6-pajak-internasional.webp` |
| 7 | Monografi Rekayasa Nilai & Manajemen Biaya Konstruksi | `buku-7` / `rekayasa-nilai-konstruksi` | `book-7-rekayasa-nilai.webp` |
| 8 | Standar Akuntansi Keuangan Entitas Privat (SAK EP) Terapan | `buku-8` / `sak-entitas-privat-terapan` | `book-8-sak-ep-terapan.webp` |
| 9 | Hukum Pidana Perpajakan: Dimensi Ultimum Remedium | `buku-9` / `hukum-pidana-perpajakan` | `book-9-pidana-pajak.webp` |
| 10 | Metodologi Riset Kualitatif Bidang Akuntansi & Bisnis | `buku-10` / `metodologi-riset-akuntansi` | `book-10-riset-kualitatif.webp` |
| 11 | Etika Profesi & Tanggung Jawab Hukum Akuntan Publik | `buku-11` / `etika-profesi-akuntan` | `book-11-etika-akuntan.webp` |
| 12 | Teori Portofolio & Manajemen Risiko Keuangan Modern | `buku-12` / `teori-portofolio-risiko` | `book-12-teori-portofolio.webp` |
| 13 | Hukum Kepailitan & PKPU dalam Perspektif Kepastian Usaha | `buku-13` / `hukum-kepailitan-pkpu` | `book-13-hukum-kepailitan.webp` |
| 14 | Sosiologi Hukum & Dinamika Pembentukan Regulasi Ekonomi | `buku-14` / `sosiologi-hukum-regulasi` | `book-14-sosiologi-hukum.webp` |
| 15 | Filsafat Hukum & Konstruksi Keadilan Fiskal Kontemporer | `buku-15` / `filsafat-hukum-fiskal` | `book-15-filsafat-hukum.webp` |
| 16 | Teologia Kerja & Etika Moral Pengelolaan Bisnis Korporasi | `buku-16` / `teologia-kerja-etika-bisnis` | `book-16-teologia-kerja.webp` |
| 17 | Analisis Laporan Keuangan Lanjutan & Deteksi Manipulasi | `buku-17` / `analisis-laporan-keuangan-lanjutan` | `book-17-analisis-lap-keu.webp` |
| 18 | Tata Kelola BUMN & Pertanggungjawaban Direksi Berintegritas | `buku-18` / `tata-kelola-bumn-direksi` | `book-18-tata-kelola-bumn.webp` |
| 19 | Hukum Pajak Daerah & Retribusi Daerah (PDRD) Terbaru | `buku-19` / `hukum-pajak-daerah-pdrd` | `book-19-pajak-daerah.webp` |
| 20 | Monografi Perpajakan Ekonomi Digital & Kripto Asset | `buku-20` / `pajak-ekonomi-digital-kripto` | `book-20-pajak-digital-kripto.webp` |
| 21 | Kapita Selekta Putusan Pengadilan Pajak & Mahkamah Agung | `buku-21` / `kapita-selekta-putusan-pajak` | `book-21-kapita-selekta-pajak.webp` |

---

## 🛠️ 4. Cara Mengganti Gambar Melalui Admin Dashboard (CRUD Real-Time)

Anda tidak perlu menyentuh kode untuk mengubah gambar. Semua gambar dapat diubah langsung dari **Admin Portal (`/admin`)**:

### A. Mengganti Cover Buku:
1. Buka halaman **Admin Portal** -> pilih tab **Katalog & Inventaris**.
2. Klik tombol **Edit** (ikon pensil) pada baris buku yang ingin Anda ganti gambarnya.
3. Di bagian **Cover Image / Gambar Buku**:
   - Anda dapat memasukkan URL gambar langsung (misal: CDN atau link hosting).
   - Atau klik tombol **Upload File dari Komputer** untuk memilih file gambar dari laptop/PC Anda.
4. Klik tombol **Simpan Perubahan Buku**. Cover akan langsung terupdate di seluruh beranda, katalog, dan halaman detail secara realtime.

### B. Mengganti Banner Hero & Konten Beranda:
1. Masuk ke **Admin Portal** -> pilih tab **Konten & Menu (CMS)**.
2. Di sub-tab **Hero Slider**:
   - Ganti URL gambar background masing-masing slide.
   - Ubah judul, subjudul, dan teks tombol CTA jika diperlukan.
3. Klik **Simpan Perubahan CMS**.

### C. Mengganti Gambar QRIS Pembayaran:
1. Masuk ke **Admin Portal** -> pilih tab **Pengaturan Pembayaran & Bank**.
2. Di bagian **Konfigurasi QRIS**:
   - Masukkan link gambar QRIS toko Anda atau upload file gambar QRIS resmi dari bank/e-wallet Anda.
3. Klik **Simpan Konfigurasi Pembayaran**.

### D. Mengganti Gambar Open Graph & Favicon (SEO):
1. Masuk ke **Admin Portal** -> pilih tab **SEO & Tracking**.
2. Masukkan URL gambar pada kolom **Open Graph Image URL (1200x630 px)**.
3. Klik **Simpan Pengaturan SEO**.

---

## ⚡ 5. Rekomendasi Format & Kompresi File

Untuk performa terbaik (Skor Google PageSpeed 95+):
1. **Gunakan format `.webp`**: Memiliki ukuran 30-50% lebih kecil dibanding JPEG tanpa mengurangi kualitas visual.
2. **Tools Kompresi Gratis**:
   - [Squoosh.app](https://squoosh.app) (Google Web-based compressor)
   - [TinyPNG](https://tinypng.com)
3. **Warna Standar**: Pastikan color profile gambar adalah **sRGB** agar warna terlihat konsisten di monitor dan layar ponsel.

---
*PT CAKRAWALA MAGNA SCIENTIA (CakraNexa) — Panduan Aset Media & Desain Grafis*
