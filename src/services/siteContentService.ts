import { apiClient } from './apiClient';
import { HeroBrandingSettings, SiteContentSettings } from '../types';

export const DEFAULT_SITE_CONTENT: SiteContentSettings = {
  brandName: 'CAKRA',
  brandSubname: 'NEXA',
  companyFullName: 'PT CAKRAWALA MAGNA SCIENTIA',

  // Kredensial Legalitas & Perizinan Perusahaan (Dikosongkan secara default untuk diisi via Admin Dashboard)
  companyCredentials: {
    kemenkumham: '',
    kemenkumhamNote: 'Akta Notaris & SK Pengesahan Menkumham RI',
    nib: '',
    nibNote: 'KBLI 58111 (Penerbitan Buku) & KBLI 58130',
    npwp: '',
    npwpNote: 'KPP Pratama Jakarta Pusat • PKP Terdaftar',
    keanggotaanPenerbit: '',
    keanggotaanPenerbitNote: 'Ikatan Penerbit Indonesia (IKAPI) & Afiliasi Perpusnas RI'
  },

  // 1. Navigation Menu & Submenus
  navigation: [
    {
      id: 'nav-home',
      label: 'Home',
      page: 'home',
      order: 1,
      isEnabled: true,
      hasDropdown: false
    },
    {
      id: 'nav-katalog',
      label: 'Katalog',
      page: 'katalog',
      order: 2,
      isEnabled: true,
      hasDropdown: true,
      submenus: [
        { id: 'sub-kat-all', label: 'SEMUA BUKU', subSection: 'all', badge: '23 Buku', order: 1 },
        { id: 'sub-kat-terbaru', label: 'BUKU TERBARU', subSection: 'terbaru', order: 2 },
        { id: 'sub-kat-pajak', label: 'Perpajakan', categoryParam: 'Perpajakan', order: 3 },
        { id: 'sub-kat-akuntansi', label: 'Akuntansi', categoryParam: 'Akuntansi', order: 4 },
        { id: 'sub-kat-hukum', label: 'Hukum', categoryParam: 'Hukum', order: 5 },
        { id: 'sub-kat-ekonomi', label: 'Ekonomi & Bisnis', categoryParam: 'Ekonomi & Bisnis', order: 6 },
        { id: 'sub-kat-filsafat', label: 'Filsafat', categoryParam: 'Filsafat', order: 7 },
        { id: 'sub-kat-teologia', label: 'Teologia', categoryParam: 'Teologia', order: 8 },
        { id: 'sub-kat-penulis', label: 'PENULIS & KONTRIBUTOR', subSection: 'penulis', order: 9 }
      ]
    },
    {
      id: 'nav-penerbitan',
      label: 'Penerbitan',
      page: 'penerbitan',
      order: 3,
      isEnabled: true,
      hasDropdown: true,
      submenus: [
        { id: 'sub-pen-layanan', label: 'LAYANAN PENERBITAN', subSection: 'layanan', order: 1 },
        { id: 'sub-pen-kirim', label: 'KIRIM NASKAH', subSection: 'kirim-naskah', badge: 'Open', order: 2 },
        { id: 'sub-pen-panduan', label: 'PANDUAN PENULIS', subSection: 'panduan-penulis', order: 3 },
        { id: 'sub-pen-proses', label: 'PROSES PENERBITAN', subSection: 'proses', order: 4 },
        { id: 'sub-pen-faq', label: 'FAQ PENERBITAN', subSection: 'faq', order: 5 }
      ]
    },
    {
      id: 'nav-pelatihan',
      label: 'Pelatihan',
      page: 'pelatihan',
      order: 4,
      isEnabled: true,
      hasDropdown: false
    },
    {
      id: 'nav-jurnal',
      label: 'Jurnal',
      page: 'jurnal',
      order: 5,
      isEnabled: true,
      hasDropdown: false
    },
    {
      id: 'nav-tentang',
      label: 'Tentang Kami',
      page: 'tentang-kami',
      order: 6,
      isEnabled: true,
      hasDropdown: true,
      submenus: [
        { id: 'sub-tentang-profil', label: 'PROFIL PERUSAHAAN', subSection: 'profil', order: 1 },
        { id: 'sub-tentang-visi', label: 'VISI & MISI', subSection: 'visi-misi', order: 2 },
        { id: 'sub-tentang-tim', label: 'STRUKTUR ORGANISASI', subSection: 'tim', order: 3 },
        { id: 'sub-tentang-legalitas', label: 'LEGALITAS PERUSAHAAN', subSection: 'legalitas', badge: 'Resmi', order: 4 }
      ]
    },
    {
      id: 'nav-blog',
      label: 'Blog',
      page: 'blog',
      order: 7,
      isEnabled: true,
      hasDropdown: false
    },
    {
      id: 'nav-career',
      label: 'Career',
      page: 'career',
      order: 8,
      isEnabled: true,
      hasDropdown: false
    },
    {
      id: 'nav-kontak',
      label: 'Kontak',
      page: 'kontak',
      order: 9,
      isEnabled: true,
      hasDropdown: false
    }
  ],

  // 2. Hero Slider Slides
  heroSlides: [
    {
      id: 'slide-1',
      badge: 'PENERBIT LITERATUR AKADEMIK & PROFESIONAL',
      title: 'Menerbitkan Pengetahuan, Membangun Warisan Keilmuan.',
      subtitle: 'Melalui ekosistem CakraNexa, kami menghubungkan penulis, akademisi, dan profesional dalam platform pengetahuan berkelanjutan—dirancang untuk berkembang melampaui satu buku, satu format, dan satu generasi.',
      primaryCtaText: 'Jelajahi Katalog Buku',
      primaryCtaPage: 'katalog',
      secondaryCtaText: 'Kirim Naskah',
      secondaryCtaPage: 'penerbitan',
      secondaryCtaSubSection: 'kirim-naskah',
      bgImageUrl: '/images/banners/hero-literatur.png',
      order: 1
    },
    {
      id: 'slide-2',
      badge: 'Trilogi Reformulasi PPN Digital Indonesia',
      title: 'Koleksi Monografi Hukum Pajak Terlengkap & Terkini',
      subtitle: 'Analisis mendalam restrukturisasi subjek, objek, dan kepatuhan administrasi sistem pajak digital era Core Tax Administration System.',
      primaryCtaText: 'Lihat Trilogi PPN',
      primaryCtaPage: 'katalog',
      secondaryCtaText: 'Beli Paket Monografi',
      secondaryCtaPage: 'katalog',
      bgImageUrl: '/images/banners/hero-hukum-pajak.png',
      order: 2
    },
    {
      id: 'slide-3',
      badge: 'Layanan Penerbitan Buku Ber-ISBN Cepat & Profesional',
      title: 'Wujudkan Naskah Disertasi, Tesis, & Diktat Ajar Anda Menjadi Buku Referensi Nasional',
      subtitle: 'Fasilitas peer-review mitra bestari, tata letak standar internasional, pengurusan ISBN Perpusnas, hingga hak cipta HKI.',
      primaryCtaText: 'Konsultasi Penerbitan',
      primaryCtaPage: 'penerbitan',
      secondaryCtaText: 'Panduan Penulisan',
      secondaryCtaPage: 'penerbitan',
      secondaryCtaSubSection: 'panduan',
      bgImageUrl: '/images/banners/hero-buku-teks.png',
      order: 3
    }
  ],

  // 2b. Hero Company Identity & Ecosystem Tagline (tampil di atas slide hero)
  heroBranding: {
    isEnabled: true,
    companyName: 'PT CAKRAWALA MAGNA SCIENTIA',
    tagline: 'Knowledge Ecosystem',
    pillars: [
      { id: 'pillar-books', label: 'Books', order: 1 },
      { id: 'pillar-journals', label: 'Journals', order: 2 },
      { id: 'pillar-research', label: 'Research', order: 3 },
      { id: 'pillar-education', label: 'Education', order: 4 },
      { id: 'pillar-seminars', label: 'Seminars', order: 5 },
      { id: 'pillar-digital-knowledge', label: 'Digital Knowledge', order: 6 }
    ]
  },

  // 3. Section 2: Best Seller Smooth Running Listing Ticker
  bestSellerSection: {
    isEnabled: true,
    badge: 'MONOGRAFI BEST SELLER AKADEMIK',
    title: 'Koleksi Buku Terlaris Rujukan Pakar, Dosen, & Praktisi',
    subtitle: 'Deretan monografi ilmiah ber-ISBN dengan tingkat adopsi kurikulum dan sitasi tertinggi.',
    speed: 'normal',
    autoScroll: true,
    pauseOnHover: true,
    showRankNumber: true,
    showRating: true,
    showIsbn: true,
    showQuickBuy: true,
    customBookIds: [] // Will default to books where isBestSeller is true or badge is Best Seller
  },

  // 4. Homepage Sections Configuration
  homeSections: [
    {
      id: 'sec-hero',
      name: 'Hero Slider & Branding Narrative',
      isEnabled: true,
      order: 1,
      title: 'Hero Beranda'
    },
    {
      id: 'sec-bestseller-ticker',
      name: 'Section 2: Smooth Running Best Seller Listing',
      isEnabled: true,
      order: 2,
      badge: 'MONOGRAFI BEST SELLER AKADEMIK',
      title: 'Koleksi Buku Terlaris Rujukan Pakar, Dosen, & Praktisi',
      subtitle: 'Deretan monografi ilmiah ber-ISBN dengan tingkat adopsi kurikulum dan sitasi tertinggi.'
    },
    {
      id: 'sec-publisher-showcase',
      name: 'Section 3: Layanan Penerbitan & Ekosistem Riset',
      isEnabled: true,
      order: 3,
      badge: 'STANDAR UNESCO B5',
      title: 'Ekosistem Publikasi Akademik Berintegritas',
      subtitle: 'Dari draf naskah hingga distribusi nasional terindeks Perpusnas.'
    },
    {
      id: 'sec-carousel-kategori',
      name: 'Section 4: Carousel Preview Kategori Buku',
      isEnabled: true,
      order: 4,
      badge: 'Preview Kategori',
      title: 'Kategori Monografi Akademik',
      subtitle: 'Eksplorasi literatur hukum, perpajakan, dan akuntansi berdasarkan disiplin ilmu.'
    },
    {
      id: 'sec-carousel-terbaru',
      name: 'Section 5: Carousel Preview Buku Terbaru',
      isEnabled: true,
      order: 5,
      badge: 'Rilis Terkini',
      title: 'Preview Buku Terbaru',
      subtitle: 'Monografi akademik dan buku teks terbaru dengan telaah riset terkini.'
    },
    {
      id: 'sec-carousel-semua',
      name: 'Section 6: Carousel Preview Semua Buku Terbitan',
      isEnabled: true,
      order: 6,
      badge: 'Katalog Lengkap',
      title: 'Preview Semua Buku Terbitan',
      subtitle: 'Seluruh 21 monografi akademik dan buku teks ber-ISBN resmi Perpustakaan Nasional.'
    }
  ],

  // 5. Global Footer Settings
  footer: {
    companyName: 'PT CAKRAWALA MAGNA SCIENTIA',
    brandTagline: 'PT CAKRAWALA MAGNA SCIENTIA',
    description: 'PT CAKRAWALA MAGNA SCIENTIA - PT Cakrawala Magna Scientia adalah perusahaan pengetahuan yang membangun ekosistem untuk menerbitkan, memperbarui, mengembangkan, mengajarkan, melindungi, melisensikan, dan mewariskan pengetahuan kepada generasi mendatang.\n\nMelalui CakraNexa, kami menghubungkan penulis, pembaca, akademisi, profesional, institusi, perpustakaan, dan mitra dalam sebuah ekosistem pengetahuan yang dirancang untuk bertumbuh melampaui satu buku, satu format, satu platform, dan satu generasi.',
    address: '',
    phone: '+62 852 8614 6806',
    whatsapp: '+62 852 8614 6806',
    email: 'info@cakranexa.com',
    workingHours: 'Senin - Jumat: 08:30 - 17:30 WIB | Sabtu & Minggu: Tutup',
    mapsEmbedUrl: 'https://maps.google.com/?q=Jakarta',
    copyrightText: 'Hak Cipta Dilindungi Undang-Undang. Seluruh monografi dan buku teks terdaftar ISBN resmi Perpustakaan Nasional RI.',
    trustBadges: [
      {
        id: 'tb-1',
        title: 'Penerbit Anggota IKAPI',
        subtitle: '',
        iconName: 'Award',
        order: 1
      },
      {
        id: 'tb-2',
        title: 'ISBN Resmi Perpusnas RI',
        subtitle: 'Terindeks Katalog Nasional',
        iconName: 'BookOpen',
        order: 2
      },
      {
        id: 'tb-3',
        title: 'Payment Gateway Resmi',
        subtitle: 'Enkripsi 256-Bit SSL Terverifikasi',
        iconName: 'Lock',
        order: 3
      },
      {
        id: 'tb-4',
        title: 'Badan Hukum PT Resmi',
        subtitle: '',
        iconName: 'ShieldCheck',
        order: 4
      }
    ],
    columns: [
      {
        id: 'col-katalog',
        title: 'Katalog Buku',
        order: 1,
        links: [
          { id: 'fl-1', label: 'Semua Koleksi (23 Buku)', page: 'katalog', category: 'all' },
          { id: 'fl-2', label: 'Buku Perpajakan & Fiskal', page: 'katalog', category: 'Perpajakan' },
          { id: 'fl-3', label: 'Buku Akuntansi & Audit Forensik', page: 'katalog', category: 'Akuntansi' },
          { id: 'fl-4', label: 'Buku Hukum Acara & Pidana', page: 'katalog', category: 'Hukum' },
          { id: 'fl-5', label: 'Ekonomi & Manajemen Korporasi', page: 'katalog', category: 'Ekonomi & Bisnis' },
          { id: 'fl-6', label: 'Buku Terbaru', page: 'katalog', subSection: 'terbaru' }
        ]
      },
      {
        id: 'col-layanan',
        title: 'Layanan & Riset',
        order: 2,
        links: [
          { id: 'fl-7', label: 'Layanan Penerbitan Buku', page: 'penerbitan', subSection: 'layanan' },
          { id: 'fl-8', label: 'Kirim Naskah / Proposal Buku', page: 'penerbitan', subSection: 'kirim-naskah' },
          { id: 'fl-9', label: 'Panduan Penulisan & Format', page: 'penerbitan', subSection: 'panduan' },
          { id: 'fl-10', label: 'Executive Workshop Pajak', page: 'pelatihan' },
          { id: 'fl-11', label: 'Call for Papers Jurnal', page: 'jurnal' }
        ]
      },
      {
        id: 'col-profil',
        title: 'Profil & Kebijakan',
        order: 3,
        links: [
          { id: 'fl-12', label: 'Tentang CakraNexa', page: 'tentang-kami', subSection: 'profil' },
          { id: 'fl-13', label: 'Visi, Misi & Kode Etik', page: 'tentang-kami', subSection: 'visi-misi' },
          { id: 'fl-14', label: 'Struktur Organisasi', page: 'tentang-kami', subSection: 'tim' },
          { id: 'fl-15', label: 'Legalitas & Izin Usaha', page: 'tentang-kami', subSection: 'legalitas' },
          { id: 'fl-16', label: 'Blog & Analisis Hukum', page: 'blog' },
          { id: 'fl-17', label: 'Karir & Kontributor Naskah', page: 'career' }
        ]
      }
    ]
  },

  // 6. Packages Penerbitan
  penerbitanPackages: [
    {
      id: 'pkg-monografi',
      name: 'Buku Monografi',
      badge: 'Standar DIKTI & BKD',
      priceFormatted: 'Mulai Rp 5.000.000',
      priceNumber: 5000000,
      description: 'Layanan terpadu penerbitan buku monografi dan referensi ilmiah berbasis riset mandiri atau konversi disertasi.',
      features: [
        'Pengurusan ISBN & Barcode Resmi Perpustakaan Nasional RI',
        'Proses Peer-Review Berita Acara Kelayakan Naskah Akademik',
        'Tata Letak (Layouting) Standar UNESCO (B5/A5) & Tipografi Akademis',
        'Desain Sampul Depan, Punggung, & Belakang Eksklusif',
        'Pengiriman Bukti Terbit 25 Eksemplar Ber-Hardcover/Softcover',
        'Surat Keterangan Penerbitan Resmi untuk BKD & Angka Kredit KUM'
      ],
      isPopular: true,
      order: 1
    },
    {
      id: 'pkg-jurnal',
      name: 'Jurnal Akademik',
      badge: 'Akreditasi Sinta',
      priceFormatted: 'Mulai Rp 3.000.000',
      priceNumber: 3000000,
      description: 'Fasilitasi publikasi manuskrip ilmiah dan prosiding konferensi menuju jurnal terakreditasi nasional.',
      features: [
        'Uji Kemiripan Naskah (Turnitin Similarity Check)',
        'Formatting Naskah Sesuai Template Gaya Selingkung Jurnal Target',
        'Registrasi Digital Object Identifier (DOI Crossref)',
        'Pendampingan Komunikasi Editorial & Revisi Peer Reviewer',
        'Penerbitan Versi Elektronik (Open Access Repository)',
        'Metadata Indexing Google Scholar, Garuda, & Dimensions'
      ],
      isPopular: false,
      order: 2
    },
    {
      id: 'pkg-ebook',
      name: 'E-Book & Distribusi Digital',
      badge: 'Multi-Platform',
      priceFormatted: 'Mulai Rp 3.000.000',
      priceNumber: 3000000,
      description: 'Penerbitan monografi format digital interaktif dengan proteksi hak cipta dan jangkauan perpustakaan digital.',
      features: [
        'Pengurusan e-ISBN Resmi Perpustakaan Nasional RI',
        'Konversi Master File ke Format ePub3 Interaktif & Secure PDF',
        'Integrasi Digital Rights Management (DRM) Proteksi Pembajakan',
        'Distribusi ke Google Play Books & Gramedia Digital',
        'Dashboard Royalti Penjualan Digital Transparan',
        'Layanan Pengadaan Koleksi e-Library Kampus & Institusi'
      ],
      isPopular: false,
      order: 3
    },
    {
      id: 'pkg-periodikal',
      name: 'Periodikal & Serial',
      badge: 'Kontrak Institusi',
      priceFormatted: 'Mulai Rp 10.000.000',
      priceNumber: 10000000,
      description: 'Kemitraan jangka panjang pengelolaan berkala terbitan jurnal institusi, fakultas, dan asosiasi profesi.',
      features: [
        'Pengelolaan 2 hingga 4 Nomor Terbitan Per Tahun',
        'Setup & Manajemen Sistem Open Journal Systems (OJS 3)',
        'Pelatihan Tim Editor, Reviewer, & Section Editor Institusi',
        'Pengurusan ISSN Cetak & Elektronik ke BRIN/Perpusnas',
        'Roadmap Terstruktur Menuju Akreditasi SINTA 2 & Scopus',
        'Distribusi Fisik Koleksi Berkala ke Jaringan Perpustakaan Mitra'
      ],
      isPopular: false,
      order: 4
    }
  ],

  // 7. Academic Training & Workshop Modules
  academicModules: [
    {
      id: 'mod-1',
      number: '01',
      title: 'Pelatihan Penulisan Buku Teks & Monografi Akademik',
      subtitle: 'Teknik menyusun naskah bernilai tambah, bebas plagiarisme, dan sesuai standar DIKTI.',
      category: 'penulisan',
      badge: 'Standar DIKTI & BKD',
      duration: '2 Hari Intensif (16 Jam Pelatihan)',
      format: 'Hybrid (Hotel Berbintang di Jakarta & Live Streaming Zoom)',
      schedule: 'Angkatan IX: 21 - 22 Oktober 2026',
      investment: 'Rp 2.750.000 / Peserta',
      targetAudience: 'Dosen Perguruan Tinggi, Peneliti BRIN/Lembaga Riset, dan Mahasiswa Pascasarjana (S2/S3).',
      curriculum: [
        'Standar Gaya Selingkung dan Pedoman Operasional BKD DIKTI untuk Monografi & Buku Ajar',
        'Teknik Konversi Laporan Penelitian, Tesis, dan Disertasi menjadi Naskah Monografi Komersial Berbobot',
        'Penyusunan Argumentasi Akademik, Peta Konsep Bab, dan Penulisan Glosarium Tematik Terpadu',
        'Strategi Lolos Penilaian Angka Kredit (KUM) Guru Besar dan Lektor Kepala'
      ],
      facilities: [
        'Buku Pedoman Cetak Gaya Selingkung CakraNexa',
        'Template Penulisan Monografi Format UNESCO B5 (.docx)',
        'Sertifikat Pelatihan Resmi 32 JP (Bernilai KUM)',
        'Voucher Penerbitan Buku di CakraNexa Senilai Rp 1.000.000'
      ],
      order: 1
    },
    {
      id: 'mod-2',
      number: '02',
      title: 'Workshop Publikasi Jurnal Internasional Bereputasi',
      subtitle: 'Strategi menembus jurnal terindeks Scopus & Sinta 1-2.',
      category: 'penulisan',
      badge: 'Scopus Q1-Q4 & Sinta',
      duration: '2 Hari Workshop + 3 Bulan Mentoring Pendampingan Naskah',
      format: 'Daring Interaktif via Zoom HD & Cloud Classroom',
      schedule: 'Angkatan VI: 28 - 29 Oktober 2026',
      investment: 'Rp 3.500.000 / Peserta',
      targetAudience: 'Dosen, Peneliti Utama, dan Calon Doktor yang Membutuhkan Syarat Kelulusan Publikasi Internasional.',
      curriculum: [
        'Analisis Kriteria Editorial Jurnal Q1-Q2 Scopus dan Web of Science (WoS)',
        'Bedah Struktur IMRaD (Introduction, Methods, Results, Discussion) yang Memikat Reviewer',
        'Teknik Menjawab Komentar Reviewer (Menyusun Rebuttal Letter & Response Matrix)',
        'Identifikasi dan Strategi Menghindari Jurnal Predator, Hijacked Journals, serta Paper Mills'
      ],
      facilities: [
        'Diagnostic Review Naskah oleh Mitra Bestari Senior',
        'Akses Komunitas Peneliti CakraNexa & Mendeley Shared Library',
        'Sertifikat Workshop Internasional 32 JP',
        'Pendampingan Submit Naskah hingga Tahap Under Review'
      ],
      order: 2
    },
    {
      id: 'mod-3',
      number: '03',
      title: 'Pelatihan Metodologi Riset & Analisis Data Terapan',
      subtitle: 'Kuantitatif, kualitatif, dan mixed method dengan tools mutakhir.',
      category: 'riset',
      badge: 'SmartPLS, SPSS & NVivo',
      duration: '3 Hari Pelatihan Praktik Komputer (24 Jam Pelatihan)',
      format: 'Tatap Muka di Laboratorium Komputer Jakarta & Daring',
      schedule: 'Angkatan IV: 04 - 06 November 2026',
      investment: 'Rp 2.500.000 / Peserta',
      targetAudience: 'Peneliti, Dosen Pembimbing, Konsultan Analisis Data, dan Mahasiswa Akhir.',
      curriculum: [
        'Formulasi Kerangka Konseptual & Uji Hipotesis Struktural (SEM-PLS)',
        'Pengolahan Data Kuantitatif Kompleks Menggunakan SmartPLS 4 & IBM SPSS',
        'Analisis Data Kualitatif & Triangulasi Tematik dengan NVivo 14',
        'Penyusunan Visualisasi Data Statistik Standar Publikasi Internasional'
      ],
      facilities: [
        'Lisensi Pembelajaran Software & Dataset Latihan Komprehensif',
        'Modul Praktikum Berwarna & Video Tutorial Langkah-demi-Langkah',
        'Sertifikat Kompetensi Analisis Data 32 JP',
        'Konsultasi Olah Data 1-on-1 Pasca Pelatihan'
      ],
      order: 3
    },
    {
      id: 'mod-4',
      number: '04',
      title: 'Pelatihan Tata Kelola Hak Cipta & Lisensi Karya',
      subtitle: 'Perlindungan hukum karya akademik, royalti, dan pendaftaran HAKI.',
      category: 'hukum',
      badge: 'HAKI & Lisensi DJKI',
      duration: '1 Hari Workshop Eksekutif (8 Jam Pelatihan)',
      format: 'Hybrid (Ballroom Jakarta Pusat & Zoom Webinar)',
      schedule: 'Angkatan III: 12 November 2026',
      investment: 'Rp 2.250.000 / Peserta',
      targetAudience: 'Sentra KI Perguruan Tinggi, Penulis Buku, Konsultan Hukum, dan Manajemen Penerbit.',
      curriculum: [
        'Prinsip Deklaratif Hak Cipta berdasarkan UU No. 28 Tahun 2014',
        'Klausul Krusial Perjanjian Lisensi Penerbitan dan Skema Royalti Adil',
        'Simulasi Prosedur Pendaftaran Mandiri melalui Portal e-Hakcipta DJKI',
        'Mitigasi Sengketa Pembajakan Buku dan Pelanggaran Hak Moral/Ekonomi di Ranah Digital'
      ],
      facilities: [
        'Draf Kontrak Standar Lisensi Penerbitan Buku Akademik',
        'Panduan Teknis e-Hakcipta DJKI Step-by-Step',
        'Sertifikat Workshop Regulasi HAKI 16 JP',
        'Pendampingan 1 Pengajuan Pendaftaran Hak Cipta'
      ],
      order: 4
    },
    {
      id: 'mod-5',
      number: '05',
      title: 'Pelatihan Penyusunan Modul Ajar Digital Berbasis OBE',
      subtitle: 'Pengembangan bahan ajar interaktif dan kurikulum Outcome-Based Education.',
      category: 'penulisan',
      badge: 'Kurikulum OBE & MBKM',
      duration: '2 Hari Pelatihan Terstruktur (16 Jam Pelatihan)',
      format: 'Daring Interaktif via Learning Management System (LMS)',
      schedule: 'Angkatan V: 18 - 19 November 2026',
      investment: 'Rp 2.000.000 / Peserta',
      targetAudience: 'Dosen Pengampu Mata Kuliah, Tim Pengembang Kurikulum Program Studi, dan Guru Penggerak.',
      curriculum: [
        'Penyelarasan Capaian Pembelajaran Lulusan (CPL) dan CPMK ke dalam Modul Pembelajaran',
        'Penyusunan Rubrik Penilaian Autentik dan Aktivitas Asinkronus Terukur',
        'Integrasi Media Pembelajaran Interaktif (Audio-Visual & Studi Kasus Realitas)',
        'Standardisasi Format ePub3 untuk Aksesibilitas Perangkat Bergerak Mahasiswa'
      ],
      facilities: [
        'Template RPS & Modul Ajar Berbasis Kurikulum OBE',
        'Akses Sandbox LMS Selama 6 Bulan',
        'Sertifikat Pengembangan Pembelajaran 32 JP',
        'Review Modul Ajar oleh Pakar Kurikulum Perguruan Tinggi'
      ],
      order: 5
    },
    {
      id: 'mod-6',
      number: '06',
      title: 'Lokakarya Sertifikasi & Praktik Perpajakan Terapan',
      subtitle: 'Bedah kasus sengketa pajak, transfer pricing, dan persiapan ujian sertifikasi.',
      category: 'hukum',
      badge: 'PMK 172/2023 & CoreTax',
      duration: '3 Hari Intensif Diskusi Kasus (24 Jam Pelatihan)',
      format: 'Tatap Muka Eksklusif di Hotel Bintang 5 Jakarta Pusat',
      schedule: 'Angkatan VII: 25 - 27 November 2026',
      investment: 'Rp 3.250.000 / Peserta',
      targetAudience: 'Konsultan Pajak, Kuasa Hukum Pengadilan Pajak, Tax Manager Perusahaan, dan Dosen Pajak.',
      curriculum: [
        'Harmonisasi Regulasi Transfer Pricing Pasca Terbitnya PMK 172/2023',
        'Strategi Penyusunan Local File, Master File, & CbCR yang Tahan Uji Pemeriksaan Pajak',
        'Bedah Kasus Gugatan dan Banding di Pengadilan Pajak hingga Peninjauan Kembali',
        'Simulasi Kesiapan Implementasi Core Tax Administration System (CTAS)'
      ],
      facilities: [
        'Buku Monografi Perpajakan Kontemporer Terbitan CakraNexa',
        'Kumpulan Putusan Pengadilan Pajak Terpilih & Kertas Kerja Fiskal',
        'Sertifikat Pelatihan Keahlian Pajak Terapan 32 JP',
        'Keanggotaan Tax Research Forum CakraNexa'
      ],
      order: 6
    }
  ],

  // 8. Workshop Pelatihan Singkat
  workshops: [
    {
      id: 'ws-1',
      title: 'Masterclass: Restrukturisasi PPN Digital & Kesiapan Core Tax System',
      speaker: 'Dr. Henry Dianto P. Sinaga, S.H., M.Kn. & Tim Pakar Fiskal',
      dateFormatted: 'Sabtu, 28 September 2026 (09:00 - 15:30 WIB)',
      priceFormatted: 'Rp 750.000',
      badge: 'Sertifikat 8 SKP',
      description: 'Bedah tuntas regulasi PPN terkini, studi kasus sengketa faktur pajak, dan strategi mitigasi koreksi fiskal.',
      benefits: [
        'E-Certificate Resmi Terverifikasi SKP',
        'Buku Fisik Monografi PPN Digital CakraNexa',
        'Modul Lengkap & Kertas Kerja Rekonsiliasi Fiskal Excel',
        'Akses Rekaman Video Sepanjang Waktu'
      ],
      order: 1
    },
    {
      id: 'ws-2',
      title: 'Workshop Penulisan Buku Ajar & Monografi Ilmiah Standar B5 Tembus Angka Kredit',
      speaker: 'Prof. Yuli Teguh Hidayat & Dewan Redaksi CakraNexa',
      dateFormatted: 'Sabtu, 12 Oktober 2026 (09:00 - 16:00 WIB)',
      priceFormatted: 'Rp 500.000',
      badge: 'Praktik Langsung',
      description: 'Bimbingan intensif dari draf riset/disertasi menjadi buku referensi ber-ISBN dengan struktur bab berbobot.',
      benefits: [
        'Template Layout Standar UNESCO B5 InDesign/Word',
        'Voucher Diskon Penerbitan Paket Akademik Rp 500.000',
        'Konsultasi 1-on-1 bersama Editor Ahli'
      ],
      order: 2
    }
  ],

  // 8. Jurnal Ilmiah
  journals: [
    {
      id: 'jrn-1',
      title: 'Jurnal Riset Perpajakan & Hukum Bisnis Indonesia (JRPHI)',
      abbreviation: 'JRPHI',
      issn: 'e-ISSN: 2988-1240 | p-ISSN: 2988-1232',
      sintaRank: 'SINTA 3 Terakreditasi',
      description: 'Publikasi ilmiah berkala memuat artikel hasil riset orisinal di bidang kebijakan perpajakan, kepatuhan wajib pajak, dan hukum ekonomi.',
      frequency: 'Terbit 3 Kali Setahun (April, Agustus, Desember)',
      focusScope: ['Hukum Pajak Materiil & Formil', 'Transfer Pricing & Pajak Internasional', 'Audit Forensik', 'Tax Avoidance & Governance'],
      order: 1
    },
    {
      id: 'jrn-2',
      title: 'Jurnal Akuntansi Forensik & Tata Kelola Korporasi (JAFG)',
      abbreviation: 'JAFG',
      issn: 'e-ISSN: 3025-8812',
      sintaRank: 'Dalam Proses Akreditasi Nasional',
      description: 'Media diseminasi riset empiris mengenai pendeteksian fraud, audit investigatif, dan etika profesi akuntan.',
      frequency: 'Terbit 2 Kali Setahun (Juni & November)',
      focusScope: ['Fraud Examination', 'Forensic Accounting', 'Corporate Governance', 'Internal Control Systems'],
      order: 2
    }
  ],

  // 9. Tim & Dewan Pakar
  teamMembers: [
    {
      id: 'tm-1',
      name: 'Dr. Henry Dianto P. Sinaga, S.H., M.Kn.',
      role: 'Ketua Dewan Redaksi & Pakar Hukum Pajak',
      affiliation: 'Universitas Indonesia & CakraNexa Advisory Board',
      expertise: 'Hukum Pajak Internasional, PPN Digital, Sengketa Fiskal',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      order: 1
    },
    {
      id: 'tm-2',
      name: 'Prof. Yuli Teguh Hidayat, M.Si., Ak., CA.',
      role: 'Pakar Akuntansi Sektor Publik & Monografi',
      affiliation: 'Dewan Pakar Akuntansi Keuangan Negara',
      expertise: 'Rekayasa Keuangan Publik, SAK Entitas Privat, Audit Sektor Publik',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      order: 2
    },
    {
      id: 'tm-3',
      name: 'Sigit Haryoko, S.H., LL.M.',
      role: 'Editor Ahli Hukum Acara Peradilan Pajak',
      affiliation: 'Praktisi Litigasi & Konsultan Hukum Fiskal',
      expertise: 'Hukum Acara Peradilan Pajak, Pembuktian Administrasi Perpajakan',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      order: 3
    }
  ],

  // 10. Dokumen Legalitas
  legalDocs: [
    {
      id: 'leg-1',
      title: 'Keputusan Pengesahan Badan Hukum PT',
      number: '',
      issuer: 'Kementerian Hukum dan Hak Asasi Manusia Republik Indonesia',
      description: 'Pengesahan PT Cakrawala Magna Scientia sebagai badan hukum penerbitan resmi perseroan terbatas.',
      order: 1
    },
    {
      id: 'leg-2',
      title: 'Sertifikat Keanggotaan IKAPI',
      number: '',
      issuer: 'Ikatan Penerbit Indonesia (IKAPI)',
      description: 'Pengakuan resmi sebagai penerbit profesional yang mematuhi standar etika dan mutu perbukuan nasional.',
      order: 2
    },
    {
      id: 'leg-3',
      title: 'Nomor Induk Berusaha (NIB)',
      number: '',
      issuer: 'Kementerian Investasi / Badan Koordinasi Penanaman Modal (BKPM)',
      description: 'Izin operasional penerbitan buku, jurnal ilmiah, dan aktivitas pelatihan profesional.',
      order: 3
    }
  ],

  // 11. Karir
  careers: [
    {
      id: 'car-mgr-publishing',
      title: 'Manager Publishing',
      badge: 'WE ARE HIRING!',
      department: 'Divisi Penerbitan & Operasional Editorial',
      type: 'Penuh Waktu (Full-time) • Level Manajerial',
      location: 'Kantor Pusat Jakarta / Hybrid',
      deadline: '1 September 2026',
      tagline: 'Membangun Perusahaan Pengetahuan Lintas Generasi',
      quote: 'PT Cakrawala Magna Scientia sedang membangun perusahaan pengetahuan yang mampu menerbitkan, memperbarui, melisensikan, mengajarkan, melindungi, dan mewariskan pengetahuan selama beberapa generasi.',
      description: 'Manajer Publishing bertanggung jawab memimpin strategi dan operasional penerbitan perusahaan, mulai dari perencanaan naskah, pengembangan produk, pengelolaan editorial, produksi, distribusi, hingga penguatan portofolio pengetahuan perusahaan.',
      responsibilities: [
        'Menyusun strategi penerbitan yang sejalan dengan visi perusahaan.',
        'Memimpin proses akuisisi naskah, editorial, desain, produksi, dan distribusi.',
        'Mengembangkan portofolio buku, jurnal, modul, dan produk pengetahuan lainnya.',
        'Menjaga kualitas konten, ketepatan waktu, dan standar mutu penerbitan.',
        'Membangun jejaring dengan penulis, editor, reviewer, akademisi, dan mitra strategis.',
        'Memimpin, membina, dan mengembangkan tim publishing secara profesional.'
      ],
      requirements: [
        'Pendidikan minimal S1; diutamakan S2 pada bidang Penerbitan, Bahasa, Sastra, Komunikasi, Pendidikan, atau bidang terkait.',
        'Berpengalaman minimal 5 tahun di bidang publishing/penerbitan.',
        'Memiliki pengalaman kepemimpinan minimal 2 tahun pada level manajerial atau setara.',
        'Memahami alur penerbitan secara menyeluruh: editorial, desain, produksi, distribusi, dan pemasaran.',
        'Memiliki kemampuan leadership, komunikasi, negosiasi, dan manajemen tim yang sangat baik.',
        'Berorientasi pada kualitas, detail, inovasi, dan hasil.',
        'Mampu menganalisis pasar dan peluang pengembangan produk pengetahuan.',
        'Adaptif, kolaboratif, dan memiliki integritas tinggi.'
      ],
      email: 'hrd@cakranexa.com',
      emailSubject: 'MANAGER PUBLISHING_NAMA ANDA',
      isActive: true,
      isFeatured: true,
      order: 1
    },
    {
      id: 'car-mgr-marketing',
      title: 'Manajer Marketing',
      badge: "WE'RE HIRING",
      department: 'Divisi Pemasaran & Penjualan Omnichannel',
      type: 'Penuh Waktu (Full-time) • Level Manajerial',
      location: 'Kantor Pusat Jakarta / Hybrid',
      deadline: '1 September 2026',
      tagline: 'Membangun pasar. Menguatkan merek. Memperluas dampak pengetahuan.',
      quote: 'PT Cakrawala Magna Scientia sedang membangun perusahaan pengetahuan yang mampu menerbitkan, memperbarui, melisensikan, mengajarkan, melindungi, dan mewariskan pengetahuan selama beberapa generasi.',
      description: 'Memimpin perencanaan strategi pemasaran terpadu omnichannel, pengembangan kanal D2C, kemitraan institusi, dan peluncuran produk pengetahuan di seluruh lini.',
      responsibilities: [
        'Menyusun strategi marketing dan penjualan omnichannel.',
        'Mengembangkan kanal D2C, marketplace, reseller, institusi, dan kemitraan.',
        'Memimpin kampanye digital, peluncuran buku, CRM, serta analisis kinerja.',
        'Membangun tim marketing yang berorientasi target dan reputasi merek.'
      ],
      requirements: [
        'S1 Marketing, Manajemen, Komunikasi, atau bidang relevan.',
        'Pengalaman minimal 5 tahun di marketing dan 2 tahun memimpin tim.',
        'Terbukti mencapai target pendapatan dan mengelola anggaran kampanye.',
        'Menguasai digital marketing, SEO, content, CRM, marketplace, dan analytics.',
        'Kuat dalam leadership, komunikasi, negosiasi, dan networking.',
        'Berintegritas, kreatif, data-driven, dan tertarik pada industri pengetahuan.',
        'Pengalaman di penerbitan, edutech, atau media menjadi nilai tambah.'
      ],
      email: 'hrd@cakranexa.com',
      emailSubject: 'Lamaran Manajer Marketing – [Nama]',
      isActive: true,
      isFeatured: true,
      order: 2
    },
    {
      id: 'car-mgr-percetakan',
      title: 'Manajer Percetakan',
      badge: 'LOWONGAN KERJA',
      department: 'Divisi Operasional Percetakan & Produksi',
      type: 'Penuh Waktu (Full-time) • Level Manajerial',
      location: 'Lokasi Operasional Perusahaan (Unit Percetakan)',
      deadline: '1 September 2026',
      tagline: 'Memimpin, mengelola, dan mengoptimalkan seluruh operasional percetakan untuk menghasilkan produk berkualitas, tepat waktu, dan efisien.',
      quote: 'Excellence in printing, innovation in every solution. PT Cakrawala Magna Scientia sedang membangun perusahaan pengetahuan yang mampu menerbitkan, memperbarui, melisensikan, mengajarkan, melindungi, dan mewariskan pengetahuan selama beberapa generasi.',
      description: 'Bertanggung jawab penuh mengendalikan alur operasional cetak (prepress, press, finishing), pemeliharaan armada mesin cetak, serta optimalisasi biaya dan efisiensi produksi.',
      responsibilities: [
        'Merencanakan, mengarahkan, dan mengendalikan seluruh kegiatan operasional percetakan.',
        'Memastikan kualitas produk sesuai standar perusahaan dan kepuasan pelanggan.',
        'Mengelola SDM, termasuk rekrutmen, pelatihan, evaluasi kinerja, dan pengembangan tim.',
        'Mengelola anggaran, biaya produksi, dan meningkatkan efisiensi untuk mencapai target.',
        'Mengelola perawatan mesin dan memastikan ketersediaan serta kinerja peralatan.',
        'Mengembangkan proses kerja dan menerapkan inovasi untuk peningkatan produktivitas.',
        'Berkoordinasi dengan departemen terkait (penjualan, desain, prepress, gudang, keuangan) untuk kelancaran operasional.'
      ],
      requirements: [
        'Pendidikan minimal S1 (Teknik Industri, Teknik Grafika, Manajemen atau bidang terkait).',
        'Minimal 5 tahun pengalaman di bidang percetakan, dengan minimal 2 tahun pada posisi manajerial.',
        'Memahami proses cetak (prepress, press, finishing) dan jenis-jenis mesin cetak.',
        'Mampu memimpin tim, berkomunikasi dengan baik, dan berorientasi pada hasil.',
        'Menguasai perencanaan produksi, pengendalian biaya, dan manajemen kualitas.',
        'Mampu bekerja di bawah tekanan dan memenuhi target.',
        'Menguasai Microsoft Office (Excel, Word, PowerPoint) dan sistem produksi (lebih disukai).',
        'Bersedia ditempatkan di lokasi operasional perusahaan.'
      ],
      benefits: [
        'Kesempatan berkembang bersama perusahaan',
        'Lingkungan kerja profesional dan kolaboratif',
        'Kompensasi kompetitif sesuai pengalaman dan kinerja',
        'Jaminan kesehatan dan tunjangan lainnya'
      ],
      email: 'hrd@cakranexa.com',
      emailSubject: 'Lamaran Manajer Percetakan – Nama Anda',
      isActive: true,
      isFeatured: true,
      order: 3
    },
    {
      id: 'car-1',
      title: 'Senior Managing Academic Editor (Hukum & Fiskal)',
      department: 'Divisi Penerbitan Ilmiah',
      type: 'Penuh Waktu (Full-time)',
      location: 'Jakarta Pusat / Hybrid',
      deadline: '31 Oktober 2026',
      requirements: [
        'Pendidikan min. S1/S2 Hukum, Akuntansi, atau Perpajakan',
        'Pengalaman menyunting buku ilmiah atau jurnal terakreditasi min. 2 tahun',
        'Memahami format sitasi APA/Chicago style dan standar penulisan UNESCO',
        'Memiliki ketelitian tinggi dalam tata bahasa baku PUEBI'
      ],
      isActive: true,
      order: 4
    },
    {
      id: 'car-2',
      title: 'Book Production Specialist & Typographer (InDesign UNESCO B5)',
      department: 'Divisi Desain & Produksi Grafis',
      type: 'Penuh Waktu (Full-time)',
      location: 'Jakarta Pusat / Remote',
      deadline: '15 November 2026',
      requirements: [
        'Mahir Adobe InDesign, Photoshop, dan Illustrator',
        'Berpengalaman menata layout buku teks ukuran B5/Royal sesuai standar percetakan',
        'Portofolio desain sampul buku akademik dan buku fiksi/non-fiksi yang menarik'
      ],
      isActive: true,
      order: 5
    }
  ],

  // 12. Blog & Wawasan Hukum Fiskal
  blogArticles: [
    {
      id: 'art-1',
      title: 'Penerapan Global Minimum Tax Pillar Two: Implikasi Terhadap Insentif Tax Holiday di Indonesia',
      slug: 'penerapan-global-minimum-tax-pillar-two',
      author: 'Dr. Henry Dianto P. Sinaga, S.H., M.Kn.',
      category: 'Perpajakan Internasional',
      publishDate: '24 Agustus 2026',
      readTime: '6 Menit Baca',
      excerpt: 'Analisis komparatif penerapan aturan GloBE 15% terhadap efektivitas insentif perpajakan bagi penanaman modal asing di sektor strategis nasional.',
      content: 'Penerapan Pilar Dua OECD/G20 yang menetapkan tarif pajak minimum global 15% menjadi tantangan besar bagi negara berkembang seperti Indonesia dalam mempertahankan daya tarik insentif fiskal...',
      coverImage: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
      order: 1
    },
    {
      id: 'art-2',
      title: 'Audit Forensik Pengadaan Barang & Jasa di Lingkungan BUMN: Perspektif Hukum Pembuktian',
      slug: 'audit-forensik-pengadaan-bumn',
      author: 'Prof. Yuli Teguh Hidayat, M.Si., Ak.',
      category: 'Audit & Akuntansi Forensik',
      publishDate: '15 Agustus 2026',
      readTime: '8 Menit Baca',
      excerpt: 'Mendeteksi modus operandi fraud pengadaan dan teknik rekonstruksi bukti digital yang memenuhi kriteria pro justitia di persidangan Tipikor.',
      content: 'Dalam era keterbukaan informasi, metode audit konvensional sering kali tidak memadai untuk mengungkap skema rekayasa penawaran (bid rigging) yang tersembunyi...',
      coverImage: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80',
      order: 2
    },
    {
      id: 'art-3',
      title: 'Dinamika Sengketa Pembuktian Faktur Pajak Fiktif dalam Yurisprudensi Pengadilan Pajak',
      slug: 'dinamika-sengketa-faktur-pajak-fiktif',
      author: 'Sigit Haryoko, S.H., LL.M.',
      category: 'Hukum Acara Pajak',
      publishDate: '02 Agustus 2026',
      readTime: '7 Menit Baca',
      excerpt: 'Telaah kritis terhadap beban pembuktian iktikad baik (good faith) bagi pembeli Barang Kena Pajak dalam menghadapi koreksi PPN masukan.',
      content: 'Sengketa faktur pajak yang tidak berdasarkan transaksi sebenarnya (TBTS) terus mendominasi perkara di Pengadilan Pajak dan Mahkamah Agung...',
      coverImage: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80',
      order: 3
    }
  ],

  updatedAt: new Date().toISOString()
};

const SITE_CONTENT_STORAGE_KEY = 'cakranexa_dynamic_site_content_v1';

// Konten lama (cache/server) belum punya heroBranding; daftar pilar kosong tetap dihormati.
function normalizeHeroBranding(raw: any): HeroBrandingSettings {
  const defaults = DEFAULT_SITE_CONTENT.heroBranding;
  if (!raw || typeof raw !== 'object') return defaults;
  return {
    isEnabled: raw.isEnabled !== false,
    companyName: typeof raw.companyName === 'string' ? raw.companyName : defaults.companyName,
    tagline: typeof raw.tagline === 'string' ? raw.tagline : defaults.tagline,
    pillars: Array.isArray(raw.pillars) ? raw.pillars : defaults.pillars
  };
}

export function getStoredSiteContent(): SiteContentSettings {
  try {
    const raw = localStorage.getItem(SITE_CONTENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      
      const isKnownDummy = (val?: string): boolean => {
        if (!val) return true;
        const normalized = val.trim().toLowerCase();
        return (
          normalized.includes('ahu-0042891') ||
          normalized.includes('1204891028472') ||
          normalized.includes('1903230089142') ||
          normalized.includes('01.889.324.5-021.000') ||
          normalized.includes('492/dki/2023') ||
          normalized.includes('623/dki/2023')
        );
      };

      const rawCreds = parsed.companyCredentials || {};
      const sanitizedCompanyCredentials = {
        kemenkumham: isKnownDummy(rawCreds.kemenkumham) ? '' : (rawCreds.kemenkumham || ''),
        kemenkumhamNote: rawCreds.kemenkumhamNote || DEFAULT_SITE_CONTENT.companyCredentials.kemenkumhamNote,
        nib: isKnownDummy(rawCreds.nib) ? '' : (rawCreds.nib || ''),
        nibNote: rawCreds.nibNote || DEFAULT_SITE_CONTENT.companyCredentials.nibNote,
        npwp: isKnownDummy(rawCreds.npwp) ? '' : (rawCreds.npwp || ''),
        npwpNote: rawCreds.npwpNote || DEFAULT_SITE_CONTENT.companyCredentials.npwpNote,
        keanggotaanPenerbit: isKnownDummy(rawCreds.keanggotaanPenerbit) ? '' : (rawCreds.keanggotaanPenerbit || ''),
        keanggotaanPenerbitNote: rawCreds.keanggotaanPenerbitNote || DEFAULT_SITE_CONTENT.companyCredentials.keanggotaanPenerbitNote,
      };

      const sanitizedLegalDocs = (parsed.legalDocs || DEFAULT_SITE_CONTENT.legalDocs).map((doc: any) => ({
        ...doc,
        number: isKnownDummy(doc.number) ? '' : (doc.number || '')
      }));

      const sanitizedTrustBadges = (parsed.footer?.trustBadges || DEFAULT_SITE_CONTENT.footer.trustBadges).map((badge: any) => ({
        ...badge,
        subtitle: isKnownDummy(badge.subtitle) ? '' : (badge.subtitle || '')
      }));

      const storedFooter = parsed.footer || {};
      const legacyAddress = 'Gedung Graha Scientia Lt. 4, Jl. Salemba Raya No. 18, Jakarta Pusat 10430';
      const oldContactNumbers = [
        '+62 21 3912 8841',
        '+62 812 8899 2341',
        '+62 812-8888-9999',
        '081288992341'
      ];
      const normalizeContactNumber = (value?: string): string =>
        value && !oldContactNumbers.some((oldNumber) => value.includes(oldNumber))
          ? value
          : '+62 852 8614 6806';
      const normalizedFooterEmail = storedFooter.email && storedFooter.email !== 'redaksi@cakranexa.com' && storedFooter.email !== 'pemasaran@cakranexa.com'
        ? storedFooter.email
        : 'info@cakranexa.com';

      // Merge with default to guarantee all keys exist
      return {
        ...DEFAULT_SITE_CONTENT,
        ...parsed,
        companyCredentials: sanitizedCompanyCredentials,
        bestSellerSection: { ...DEFAULT_SITE_CONTENT.bestSellerSection, ...(parsed.bestSellerSection || {}) },
        footer: { 
          ...DEFAULT_SITE_CONTENT.footer, 
          ...(parsed.footer || {}),
          address: storedFooter.address === legacyAddress ? '' : (storedFooter.address || ''),
          phone: normalizeContactNumber(storedFooter.phone),
          whatsapp: normalizeContactNumber(storedFooter.whatsapp),
          email: normalizedFooterEmail,
          description: (!parsed.footer?.description || parsed.footer?.description.includes('Penerbit monografi ilmiah, buku teks akademik'))
            ? DEFAULT_SITE_CONTENT.footer.description
            : parsed.footer.description,
          trustBadges: sanitizedTrustBadges,
          columns: parsed.footer?.columns || DEFAULT_SITE_CONTENT.footer.columns
        },
        navigation: (parsed.navigation || DEFAULT_SITE_CONTENT.navigation).map((item: any) => ({
          ...item,
          submenus: item.submenus?.map((sub: any) => ({
            ...sub,
            badge: sub.badge === '2024' ? undefined : sub.badge
          }))
        })),
        heroSlides: (() => {
          if (!parsed.heroSlides || !Array.isArray(parsed.heroSlides) || parsed.heroSlides.length === 0) {
            return DEFAULT_SITE_CONTENT.heroSlides;
          }
          const slides = [...parsed.heroSlides];
          if (slides[0] && (!slides[0].title || slides[0].title.includes('Penerbit Monografi Ilmiah') || slides[0].title.includes('Integritas Ilmiah'))) {
            slides[0] = {
              ...slides[0],
              ...DEFAULT_SITE_CONTENT.heroSlides[0]
            };
          }
          return slides;
        })(),
        heroBranding: normalizeHeroBranding(parsed.heroBranding),
        homeSections: parsed.homeSections || DEFAULT_SITE_CONTENT.homeSections,
        penerbitanPackages: parsed.penerbitanPackages || DEFAULT_SITE_CONTENT.penerbitanPackages,
        academicModules: parsed.academicModules || DEFAULT_SITE_CONTENT.academicModules,
        workshops: parsed.workshops || DEFAULT_SITE_CONTENT.workshops,
        journals: parsed.journals || DEFAULT_SITE_CONTENT.journals,
        teamMembers: parsed.teamMembers || DEFAULT_SITE_CONTENT.teamMembers,
        legalDocs: sanitizedLegalDocs,
        careers: (() => {
          const defaultCareers = DEFAULT_SITE_CONTENT.careers;
          if (!parsed.careers || !Array.isArray(parsed.careers) || parsed.careers.length === 0) {
            return defaultCareers;
          }
          // Enrich parsed items with any missing default properties (tagline, quote, etc.)
          const enrichedParsed = parsed.careers.map((c: any) => {
            const def = defaultCareers.find((d) => d.id === c.id);
            return def ? { ...def, ...c } : c;
          });
          // Ensure top 3 managerial positions exist even if user wiped them from old cache
          const topIds = ['car-mgr-publishing', 'car-mgr-marketing', 'car-mgr-percetakan'];
          const missingTop = defaultCareers.filter(
            (d) => topIds.includes(d.id) && !enrichedParsed.some((c: any) => c.id === d.id)
          );
          return [...missingTop, ...enrichedParsed];
        })(),
        blogArticles: parsed.blogArticles || DEFAULT_SITE_CONTENT.blogArticles
      };
    }
  } catch (e) {
    console.warn('Error reading stored site content from localStorage:', e);
  }
  return DEFAULT_SITE_CONTENT;
}

export function saveStoredSiteContent(settings: SiteContentSettings): void {
  try {
    const dataToSave = {
      ...settings,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(SITE_CONTENT_STORAGE_KEY, JSON.stringify(dataToSave));
    
    // Broadcast custom event so all components react immediately without page reload
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cakranexa_content_updated', { detail: dataToSave }));
      window.dispatchEvent(new CustomEvent('cakranexa_site_content_updated', { detail: dataToSave }));
    }

  } catch (e) {
    console.error('Error saving site content to localStorage:', e);
  }
}

export async function fetchSiteContentApi(): Promise<SiteContentSettings | null> {
  const data = await apiClient.getSiteContent();
  if (data && typeof data === 'object' && Array.isArray((data as any).navigation)) {
    const legacyAddress = 'Gedung Graha Scientia Lt. 4, Jl. Salemba Raya No. 18, Jakarta Pusat 10430';
    const stored = getStoredSiteContent();
    const merged = {
      ...stored,
      ...data,
      heroBranding: normalizeHeroBranding(data.heroBranding ?? stored.heroBranding),
      footer: {
        ...getStoredSiteContent().footer,
        ...(data.footer || {}),
        address: data.footer?.address === legacyAddress ? '' : (data.footer?.address ?? '')
      }
    } as SiteContentSettings;
    try {
      localStorage.setItem(SITE_CONTENT_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
    return merged;
  }
  return null; // belum ada konten di server -> pakai default/cache lokal
}

export async function saveSiteContentApi(settings: SiteContentSettings): Promise<boolean> {
  return apiClient.saveSiteContent(settings); // melempar ApiError jika 401/500
}

export function resetSiteContentToDefault(): SiteContentSettings {
  saveStoredSiteContent(DEFAULT_SITE_CONTENT);
  return DEFAULT_SITE_CONTENT;
}
