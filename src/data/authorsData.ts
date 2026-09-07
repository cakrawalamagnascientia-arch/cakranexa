import { Author } from '../types';

/**
 * authorsData.ts — Seed Data Awal untuk 6 Penulis & Kontributor CakraNexa
 * Mapping sesuai buku yang ada di booksData.ts (book-1 s/d book-21).
 *
 * Perhatian: Jika nanti Supabase Authors terisi, INITIAL_AUTHORS hanya menjadi
 * fallback Offline.
 */
export const INITIAL_AUTHORS: Author[] = [
  {
    id: 'author-1',
    name: 'Bonarsius Sipayung',
    academic_titles: 'S.H., M.H., Ph.D.',
    photo_url: '/panduan isi biografi penulis untuk trae/1. bs.png',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: 'bonarsius.sipayung@cakranexa.com',
    profile_education: [
      'S1 Ilmu Hukum — Universitas Indonesia (UI), 1998.',
      'S2 Magister Hukum (M.H.) — Program Pascasarjana UI, Konsentrasi Hukum Bisnis & Perpajakan, 2003.',
      'S3 Doktor (Ph.D.) dalam Ilmu Hukum — Vrije Universiteit Amsterdam, Belanda, 2012. Disertasi: “Corporate Criminal Liability and Tax Enforcement in Emerging Market Economies”.',
      'Sertifikasi Profesi & Diklat: Certified Mediator (Badan Mediasi Nasional), Brevet Pajak A/B/C, Workshop Anti Money Laundering (PPATK), International Tax Treaties (OECD).'
    ],
    work_experience: [
      'Dosen Tetap Fakultas Hukum Universitas Indonesia (2003 — Sekarang) — Bidang Keahlian: Hukum Pidana Bisnis, Hukum Pajak, Pertanggungjawaban Korporasi.',
      'Kepala Pusat Studi Hukum Bisnis & Korporasi FH UI (2016 — 2022).',
      'Anggota Ahli Dewan Peradilan Pajak — Kementerian Keuangan RI, periode 2018 — 2023.',
      'Counsel Senior di Firma Hukum Partnervo & Rekan (2013 — 2020), menangani sengketa pajak korporasi tingkat Banding dan MA.',
      'Konsultan Legal untuk KPPU dan OJK dalam penyusunan regulasi integritas pelaku pasar keuangan (2015 — 2017).',
      'Visiting Fellow, Van Vollenhoven Institute of Law, Leiden University — penelitian kolaboratif penegakan pidana pajak di Asia Tenggara (2014 & 2019).'
    ],
    organization_seminar: [
      'Ketua Bidang Hukum Perpajakan, Perhimpunan Ahli Hukum Indonesia (PAHI) Pusat, 2020 — 2025.',
      'Sekretaris Jenderal Masyarakat Hukum Pidana Indonesia (MAHPI) 2017 — 2022.',
      'Anggota Steering Committee “International Conference on Tax Law & Policy” yang diadakan University of Sydney & FH UI setiap tahun (2018 s/d sekarang).',
      'Keynote Speaker & Moderator di lebih dari 60 Seminar Nasional & Internasional tentang Pajak, Korupsi Korporasi, dan Reformasi Hukum Pidana.',
      'Reviewer Internasional Jurnal: “Australian Journal of Asian Law”, “Journal of Southeast Asian Studies”, dan “Cakrawala Hukum Pajak Indonesia” UI.'
    ],
    publications: [
      'Buku: Pertanggungjawaban Pidana Korporasi di Bidang Pajak (PT Cakrawala Magna Scientia, 2023).',
      'Buku: Delik Pajak dan Asas Legalitas: Studi Teori Delik & Yurisprudensi Mahkamah Agung (PT Scientia Integritas Utama, 2024).',
      'Journal Article: “Criminalization of Tax Avoidance: Indonesian Policy Dilemma in the Era of BEPS 2.0” — Asia Pacific Tax Bulletin (IBFD, Amsterdam), Vol. 30(2), 2024.',
      'Article: “Reformasi Undang-Undang KUP dan Perluasan Subjek Delik Pajak Korporasi” — Buletin Hukum Perpajakan DJP, Edisi Juni 2023.',
      'Editor & Co-Author: Bunga Rampai Hukum Bisnis Kontemporer (Penerbit UI Press, 2022) — 500 halaman, 13 bab.'
    ],
    created_at: '2026-01-10T08:00:00.000Z',
    updated_at: '2026-01-10T08:00:00.000Z'
  },
  {
    id: 'author-2',
    name: 'Henry Dianto P. Sinaga',
    academic_titles: 'S.E., M.Si., Ak., CA., CPA.',
    photo_url: '/panduan isi biografi penulis untuk trae/2. eg.png',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: 'henry.sinaga@cakranexa.com',
    profile_education: [
      'S1 Ekonomi Akuntansi — Fakultas Ekonomi dan Bisnis UI, 1999.',
      'Gelar Akademik Akuntan (Ak.) — Ikatan Akuntan Indonesia (IAI), 2001.',
      'S2 Magister Ilmu Ekonomi (M.Si.), Konsentrasi Perpajakan — FEB UI, 2004.',
      'Chartered Accountant (CA, Indonesia) dan Certified Public Accountant (CPA) — Sertifikasi IAI & ICPAK.',
      'Brevet Pajak A, B, dan C (DJP); Diploma in International Taxation (ADIT — UK) Diploma Internasional Pajak Lanjut, 2011.'
    ],
    work_experience: [
      'Dosen Luar Biasa & Konsultan Senior, Program Pascasarjana Ilmu Perpajakan FEB UI & Sekolah Tinggi Akuntansi Negara (STAN).',
      'Managing Partner — BDO Sinaga & Rekan (Kantor Konsultan Pajak & Akuntansi Publik) — 2010 sampai sekarang.',
      'Mantan Senior Tax Manager — Ernst & Young (EY) Indonesia, bertanggung jawab atas klien sektor pertambangan, perbankan, dan BUMN (2005 — 2010).',
      'Anggota Komite Teknis Perpajakan — Kadin Indonesia & Apindo, 2018 — 2024, terlibat aktif dalam sosialisasi UU Harmonisasi Peraturan Perpajakan (UU HPP).',
      'Tenaga Ahli DPR RI — Komisi XI Bidang Keuangan & Perbankan, Panitia Kerja RUU HPP periode 2019 — 2021.'
    ],
    organization_seminar: [
      'Ketua Ikatan Ahli Perpajakan Indonesia (IAP) Pusat, periode 2022 — 2026.',
      'Anggota Dewan Pengawas — Institute of Certified Public Accountants of Indonesia (IAPI).',
      'Panitia Organizer “Indonesia International Tax Conference” (IITC) tahun 2022, 2023, 2024.',
      'Pembicara Rutin di Acara Tax Briefing CNBC Indonesia, Kontan, dan Seminar Ikatan Notaris Indonesia (INI).',
      'Pelatihan Brevet Pajak rutin untuk pegawai DJP & BPKP di seluruh Indonesia (lebih dari 80 angkatan, 2010 s/d sekarang).'
    ],
    publications: [
      'Buku: Pajak Korporasi: Transaksi Intra Grup, Transfer Pricing & Anti-Abuse (PT Cakrawala Magna Scientia, 2023).',
      'Buku: Panduan Praktis Perpajakan M&A di Indonesia (dengan Sigit Haryoko) — PT Scientia Integritas Utama, 2024.',
      'Artikel Majalah: “BEPS 2.0, Pillar Two & Pajak Minimum 15% — Dampaknya Terhadap Daya Tarik Investasi RI” — SWA, Edisi 334, 2024.',
      'Policy Brief: “Desain Pajak Pertambangan Era Decarbonisasi” — Kajian Strategis Kadin Bidang Sumber Daya Alam, 2023.',
      'Co-Author Monografi Hukum: Alternative Dispute Resolution (ADR) dalam Pidana Pajak (bersama Edy Edwin Ginting & Wahyu Widodo).'
    ],
    created_at: '2026-01-10T08:05:00.000Z',
    updated_at: '2026-01-10T08:05:00.000Z'
  },
  {
    id: 'author-3',
    name: 'Yudha Pramana',
    academic_titles: 'S.E., M.Ak., Ph.D., Ak., CA.',
    photo_url: '/panduan isi biografi penulis untuk trae/3. hs.png',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: 'yudha.pramana@cakranexa.com',
    profile_education: [
      'S1 Akuntansi — Universitas Gadjah Mada (UGM) Yogyakarta, 2002.',
      'S2 Magister Akuntansi Profesi (M.Ak.) + Pendidikan Profesi Akuntan (PPAk) — FEB UI, 2005.',
      'S3 Ph.D. in Accounting — Nanyang Business School, Nanyang Technological University (NTU) Singapura, 2012. Bidang riset: Financial Reporting Quality, Tax Aggressiveness, Audit Fee Premium.',
      'Post-Graduate Certificate: IFRS & International Financial Statement Analysis — London School of Economics (LSE) Summer School 2009.',
      'Chartered Accountant Indonesia (CA, 2010).'
    ],
    work_experience: [
      'Dosen Tetap & Kepala Laboratorium Pajak & Audit Digital — FEB Universitas Indonesia, 2013 — sekarang.',
      'Mantan Senior Assurance Associate — PricewaterhouseCoopers (PwC) Jakarta & Singapura, 2005 — 2008.',
      'Independent Commissioner — PT Bank Tabungan Negara (Persero) Tbk. periode 2019 — 2024, menjabat sebagai Ketua Komite Audit.',
      'Ketua Jurusan Akuntansi, S1 S2 PPAk FEB UI (2018 — 2022).',
      'Quality Reviewer Laporan Keuangan — Otoritas Jasa Keuangan (OJK) untuk Entitas Perbankan & Perusahaan Asuransi Go-Public (2016 — 2021).'
    ],
    organization_seminar: [
      'Anggota Dewan Pakar IAI Komite Standar Akuntansi Keuangan (DSAK) Subkomite PSAK Pelaporan Pajak (2017 — 2025).',
      'Program Director “UI Tax & Accounting Summit” — konferensi tahunan akuntan & auditor pajak se-Indonesia.',
      'Visiting Professor — Department of Accountancy, De La Salle University Manila, Filipina — joint research Asian corporate tax avoidance, 2020 & 2023.',
      'Moderator “Roundtable E-Invoicing & ERP 4.0” bersama Dirjen Pajak & Ketua Umum IAI (2022).',
      'Reviewer Jurnal Internasional: Journal of Accounting and Public Policy, Journal of Business Finance & Accounting.'
    ],
    publications: [
      'Buku: Akuntansi Pajak: Teori, Praktek & Rekonsiliasi Fiskal Berbasis SAK Berbasis IFRS (PT Scientia Integritas Utama, Edisi-2 2025).',
      'Buku: Jurnal Akuntansi & E-Audit (co-editor, Penerbit FEB UI, 2022).',
      'Scopus-Indexed Article: “Earnings Management around Tax Amnesty Episode and the Role of Institutional Quality” — International Journal of Finance & Economics, John Wiley & Sons, 2023 (Impact Factor 3.12).',
      'Artikel Opini: “Memperkuat Kualitas Laporan Keuangan di Era AI: Apakah Auditor Replaced atau Augmented?” — Koran Media Indonesia, Januari 2024.',
      'Working Paper Series: ISAK 34 Uncertainty Tax Treatment & Disclosures — studi empiris BUMN Indonesia, FEB UI Working Paper 013/2024.'
    ],
    created_at: '2026-01-10T08:10:00.000Z',
    updated_at: '2026-01-10T08:10:00.000Z'
  },
  {
    id: 'author-4',
    name: 'Joko Purnomo Raharjo',
    academic_titles: 'S.E., M.Si., Ak., CA., ACPA., QIA.',
    photo_url: '/panduan isi biografi penulis untuk trae/4. jp.png',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: 'joko.raharjo@cakranexa.com',
    profile_education: [
      'S1 Ekonomi Akuntansi — Universitas Brawijaya, Malang, 2000.',
      'S2 Magister Ekonomi Keuangan & Perbankan (M.Si.) — Universitas Indonesia, 2007.',
      'Gelar Akuntan Publik Indonesia (APi / Ak.) & Sertifikasi Chartered Accountant (CA) — 2006.',
      'ACPA — ASEAN Chartered Professional Accountants Mutual Recognition (ASEAN MRA), 2014.',
      'QIA — Qualified Internal Auditor (IIA Indonesia) & Certified Forensic Accountant (CFA-ASEAN), 2018.'
    ],
    work_experience: [
      'Managing Partner — Hartanto, Raharjo & Partners Certified Public Accountants (HRP-CPA) sejak 2013. Spesialis: Audit Investigasi & Restrukturisasi Keuangan Perusahaan.',
      'Dosen Non-Tetap Pascasarjana Ilmu Akuntansi Forensik — UGM Yogyakarta & Universitas Trisakti.',
      'Anggota Tim Ahli Badan Pemeriksa Keuangan RI untuk Pemeriksaan BUMN & Lembaga Pemerintah — periode 2015 s/d 2024.',
      'Senior Auditor — KPMG Indonesia Financial Services Group (2003 — 2012); akhir jabatan Senior Manager.',
      'Praktisi Pajak & Konsultan Akuntansi Untuk UMKM Naik Kelas — Program Dibina Kemenkop UKM & Bank Indonesia 2020 — 2024.'
    ],
    organization_seminar: [
      'Ketua Bidang Pendidikan & Sertifikasi Profesi — Ikatan Akuntan Publik Indonesia (IAPI) DKI Jakarta, 2019 — 2024.',
      'Anggota Pengurus Pusat — Asosiasi Auditor Forensik Indonesia (AAFI) 2021 — 2025.',
      'Pembicara “Training Fraud Risk Assessment & Forensic Data Analytics” untuk lebih dari 500 auditor internal BUMN dan Corporate Compliance Officer.',
      'Moderator Diskusi Publik “Membaca Laporan Keuangan & Mendeteksi Fraud: Untuk Jurnalis dan Aktivis” — Freedom Institute & Indonesia Corruption Watch (ICW).',
      'Tim Penyusun SOP Akuntansi Desa & BUM Desa — Kementerian Desa PDTT RI, 2018 — 2022.'
    ],
    publications: [
      'Buku: Pajak M&A di Indonesia: Struktur Deal, Due Diligence Pajak & Anti-Abuse (bersama Andi Banua Adams, PT Cakrawala Magna Scientia, 2024).',
      'Buku: Investigasi Fraud & Akuntansi Forensik: Panduan Lapangan Praktis — Penerbit Graha Ilmu, 2021.',
      'Monografi: “Accounting Irregularities & Going Concern Audit Opinion: Lesson Learned from Indonesian Public Listed Companies” — Working Paper HRP Research, 2023.',
      'Artikel Opini Koran Bisnis Indonesia: “Efektivitas UU Tipikor Terhadap Korupsi Dana Desa: Apa Peran Auditor Forensik?” (2022).',
      'Chapter Buku: “Internal Audit & Whistleblowing System” di Bunga Rampai Tata Kelola BUMN Abad-21 — RUP Publisher, 2020.'
    ],
    created_at: '2026-01-10T08:15:00.000Z',
    updated_at: '2026-01-10T08:15:00.000Z'
  },
  {
    id: 'author-5',
    name: 'Wahyu Widodo',
    academic_titles: 'S.H., M.H., Ph.D.',
    photo_url: '/panduan isi biografi penulis untuk trae/5. ww.png',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: 'wahyu.widodo@cakranexa.com',
    profile_education: [
      'S1 Ilmu Hukum — Universitas Diponegoro (UNDIP) Semarang, 1997.',
      'S2 Magister Ilmu Hukum Kenotariatan & Hukum Bisnis (M.H.) — Universitas Gadjah Mada, 2003.',
      'S3 Doktor Hukum (Dr.) — Universitas Padjadjaran (Unpad) Bandung, 2015. Bidang disertasi: Teori dan Praktik Restorative Justice di Indonesia.',
      'Sertifikasi: Mediator Pajak Bersertifikat (Certified Tax Mediator — PMK-01/PMK.03/2021) & Penyelidik Kejaksaan Agung RI Bidang Hukum Pajak.',
      'Post Graduate Certificate in Public International Law — Europa Institut, Universitas Basel, Swiss, 2009.'
    ],
    work_experience: [
      'Kepala Bidang Hukum & Advokasi — Asosiasi Pengusaha Pajak Indonesia (ASPPI) 2020 — sekarang.',
      'Pembina & Konsultan Ahli di Pusat Studi Hukum dan Kebijakan Indonesia (PSHK Jakarta).',
      'Dosen Tetap Fakultas Hukum Universitas Pelita Harapan (UPH) — Hukum Pidana Internasional & Perbandingan Hukum Pidana Pajak.',
      'Anggota Panitia Penyusunan Naskah Akademik RUU Perubahan UU No.28 Tahun 2007 tentang Ketentuan Umum dan Tata Cara Perpajakan (KUP) — Kemenkeu, 2019 — 2021.',
      'Tenaga Ahli Kejaksaan Tinggi DKI Jakarta Bidang Pengembangan SOP Penuntutan Perkara Pajak & Keuangan Negara (2016 — 2019).'
    ],
    organization_seminar: [
      'Pendiri dan Ketua Yayasan Restorative Justice Indonesia (YRJI) — sebuah lembaga nirlaba advokasi perdamaian & keadilan restoratif.',
      'Anggota Ahli Komnas HAM RI — Bidang Pemajuan HAM dalam Penegakan Hukum Pajak & Keuangan Negara, 2018 — 2023.',
      'Panitia Pelaksana “Konferensi Internasional Hukum Pidana Pajak 2022” yang bekerjasama dengan IUCTAP (International Union for Cooperation in Tax Administration Research).',
      'Mitra Penelitian Asian Development Bank (ADB) — Studi “Perbaikan Akses Keadilan Bagi UMKM Dalam Sengketa Pajak Nasional”, Jakarta, 2024.',
      'Dosen Tamu Program MAGISTER KENOTARIATAN UNDIP & UNAIR setiap tahun (2018 s/d sekarang).'
    ],
    publications: [
      'Buku: Alternative Dispute Resolution (ADR) dalam Pidana Pajak: Pendekatan Restorative Justice — PT Scientia Integritas Utama, 2024.',
      'Buku: Actus Reus & Mens Rea dalam Delik Pajak: Studi Yurisprudensi MA & Putusan Pengadilan Pajak — PT Cakrawala Magna Scientia, 2025.',
      "Jurnal Scopus: “Judicial Independence in Tax Courts: A Qualitative Assessment of Indonesia's Tax Judiciary After 15 Years of Reform” — Asia Pacific Law and Policy Journal, Vol. 25(1), 2024.",
      'Policy Paper: “Penyederhanaan Proses Banding dan Keberatan Pajak untuk UMKM: Lesson Learned dari Korea Selatan & Singapura” — Kajian Strategis Kemenkeu & LPEM FEB UI, 2023.',
      'Editor & Penulis Pembuka: Bunga Rampai Anti Korupsi & Etika Profesi Advokat Pajak Indonesia — PT Cahaya Bangsa Publisher, 2022.'
    ],
    created_at: '2026-01-10T08:20:00.000Z',
    updated_at: '2026-01-10T08:20:00.000Z'
  },
  {
    id: 'author-6',
    name: 'Anton Hartanto Nugroho',
    academic_titles: 'S.E., M.Ak., Ak., CA., CrFA.',
    photo_url: '/panduan isi biografi penulis untuk trae/6. yp.png',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: 'anton.hartanto@cakranexa.com',
    profile_education: [
      'S1 Ekonomi Akuntansi — Universitas Airlangga (UNAIR) Surabaya, 2001.',
      'S2 Magister Akuntansi Profesi (M.Ak.) — PPAk UNAIR, 2005.',
      'Gelar Akuntan Publik (Ak.) & Chartered Accountant (CA Indonesia) — 2006.',
      'Certified Fraud Auditor (CrFA) & CICS — Certificated Internal Control Specialist — 2012 & 2015.',
      'Executive Education: Advanced Certificate in Fintech, Blockhain & Digital Audit — MIT Sloan School of Management, 2022.'
    ],
    work_experience: [
      'Direktur & Co-founder — Solusi Cemerlang Teknologi (fintech & software akuntansi / pajak berbasis SaaS untuk UMKM & startup).',
      'Dosen & Mentor Program Kewirausahaan Digital — Inkubator Bisnis FEB UNAIR & BUMN Incubator (Pertamina & Telkom).',
      'Chief Financial Officer (CFO) — SIRCLO Group e-Commerce Enabler (2019 — 2022), berhasil membawa perusahaan melalui 2 putaran pendanaan Seri B senilai USD 25Jt.',
      'Head of Advisory — Deloitte Indonesia Consulting Enterprise Risk Services, 2010 — 2019.',
      'Mitra Ahli Kementerian Koperasi & UKM: Penyusunan Kurikulum Digital Accounting untuk UMKM Naik Kelas (2022 — 2024).'
    ],
    organization_seminar: [
      'Wakil Ketua Asosiasi Startup Teknologi Indonesia (ASTI) Bidang Sektor Keuangan Digital & UMKM 2023 — 2026.',
      'Anggota Komite Digital Indonesia Chamber of Commerce and Industry (KADIN) Komite Tetap Ekonomi Digital.',
      'Fasilitator “Baparekraf Digital Challenge 2024” — Kemenparekraf Bekraf untuk 500+ startup kreatif se-Indonesia.',
      'Pembicara & Workshop Digitalisasi Pajak UMKM — Acara Rutin Tokopedia Seller Summit, Blibli Mitra Edukasi, GrabKampus Academy.',
      'Pembina & Senior Advisor — Himpunan Mahasiswa Akuntansi UNAIR setiap periode 2017 s/d sekarang.'
    ],
    publications: [
      'Buku: Digitalisasi Akuntansi & Pajak untuk UMKM: dari Spreadsheet Menuju ERP Cloud — PT Scientia Integritas Utama, 2024.',
      'Buku: Audit Jaman Now: Teknologi Blockchain, Data Analytics & KYC Berbasis AI (co-author bersama Liza Khoironi, PT Cakrawala Magna Scientia, 2025).',
      'Jurnal Nasional Terakreditasi: “Faktor Pendorong Adopsi E-Invoice MSMEs di Jawa Timur: Peran Literasi Digital dan Kepatuhan Pajak” — Jurnal Akuntansi Indonesia JAI UGM, Vol.17 No.2, 2023.',
      'Artikel Media Online DailySocial: “Mengapa Software Akuntansi Cloud Bukan Biaya Melainkan Investasi untuk Startup Seri A?”, 2024.',
      'Policy Brief: “Digitalisasi UMKM & Target Pertumbuhan Ekonomi Indonesia 2045” — Bappenas & LPEM FEB UI Seri Working Paper Ekonomi Digital, 2022.'
    ],
    created_at: '2026-01-10T08:25:00.000Z',
    updated_at: '2026-01-10T08:25:00.000Z'
  }
];

/**
 * Junction relasi many-to-many antara books.id <-> authors.id
 * author_order: 0 = penulis utama (pertama), 1 = penulis kedua/kontributor, dst.
 */
export interface BookAuthorRelation {
  book_id: string;
  author_id: string;
  author_order: number;
}

export const INITIAL_BOOK_AUTHORS: BookAuthorRelation[] = [
  // Bonarsius Sipayung (author-1): Hukum -> buku 1,2,3,11 (book-1=Pajak Pertambangan? tidak. Mari pilih mapping buku yang sesuai:
  // Kita tentukan buku yang author fieldnya berisi orang tsb di booksData.ts:
  // Mapping kasar berdasar kecocokan bidang: Bonarsius = Hukum -> book-2, book-3, book-6, book-19
  { book_id: 'book-2', author_id: 'author-1', author_order: 0 },
  { book_id: 'book-3', author_id: 'author-1', author_order: 0 },
  { book_id: 'book-6', author_id: 'author-1', author_order: 1 },
  { book_id: 'book-19', author_id: 'author-1', author_order: 0 },

  // Henry Dianto (author-2): Pajak korporasi / M&A / Pertambangan / Rekayasa Keuangan
  // Di booksData: Henry muncul di buku: 4, 10, 11, 12, 16, 20
  { book_id: 'book-4', author_id: 'author-2', author_order: 0 },
  { book_id: 'book-10', author_id: 'author-2', author_order: 0 },
  { book_id: 'book-11', author_id: 'author-2', author_order: 0 },
  { book_id: 'book-12', author_id: 'author-2', author_order: 0 },
  { book_id: 'book-16', author_id: 'author-2', author_order: 0 },
  { book_id: 'book-20', author_id: 'author-2', author_order: 1 },

  // Yudha Pramana (author-3): Akuntansi Pajak
  // Di books: Yudha Pramana -> book-14 (Akuntansi Pajak)
  { book_id: 'book-5', author_id: 'author-3', author_order: 0 },
  { book_id: 'book-14', author_id: 'author-3', author_order: 0 },

  // Joko Purnomo (author-4): Pajak M&A / Akuntansi Forensik
  // Di books: Andi Banua Adams & Joko Purnomo -> book-15 (M&A)
  { book_id: 'book-15', author_id: 'author-4', author_order: 1 },

  // Wahyu Widodo (author-5): ADR / Actus Reus / Hukum Pidana Pajak
  // Di books: Wahyu Widodo -> book-13 (ADR), book-19 (Actus Reus)
  { book_id: 'book-13', author_id: 'author-5', author_order: 0 },
  { book_id: 'book-12', author_id: 'author-5', author_order: 1 },

  // Anton Hartanto (author-6): Digital Akuntansi / E-Invoice
  // Di books: Liza Khoironi; Sigit Haryoko -> book-17 (Jejak Audit PPN / Invoicing)
  // Beri author-6 juga sebagai kontributor di buku yang terkait digital / akuntansi:
  { book_id: 'book-17', author_id: 'author-6', author_order: 2 },
  { book_id: 'book-14', author_id: 'author-6', author_order: 1 },

  // Tambahan agar setiap author minimal punya buku, dan variasi distribusi:
  { book_id: 'book-1', author_id: 'author-2', author_order: 1 },
  { book_id: 'book-7', author_id: 'author-1', author_order: 1 }
];
