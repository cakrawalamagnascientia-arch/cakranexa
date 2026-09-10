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
    academic_titles: '',
    photo_url: '',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: '',
    profile_education: [
      'Saat ini merupakan pegawai Direktorat Jenderal Pajak, Kementerian Keuangan Republik Indonesia.',
      'Lulus Sarjana di Jurusan Akuntansi Universitas Sumatera Utara.',
      'Lulus Pascasarjana di Jurusan Akuntansi Universitas Indonesia.',
      'Lulus Doktor di Fakultas Ekonomi dan Bisnis, Jurusan Ilmu Ekonomi Universitas Trisakti.'
    ],
    work_experience: [
      'Pegawai Direktorat Jenderal Pajak, Kementerian Keuangan Republik Indonesia.',
      'Berperan aktif dalam penyusunan Undang-Undang Bea Meterai (2020).',
      'Berperan aktif dalam penyusunan Undang-Undang Cipta Kerja (2020).',
      'Berperan aktif dalam penyusunan Undang-Undang Harmonisasi Peraturan Perpajakan (2021) serta beberapa peraturan perpajakan lainnya.'
    ],
    organization_seminar: [
      'Berpartisipasi dalam kegiatan seminar internasional, di antaranya Multilateral Partner Program Workshop di Australia (2020).',
      'Berpartisipasi dalam Tax Reform for a Better DGT Workshop di Korea (2019).',
      'Aktif mengikuti seminar internasional sebagai presenter, antara lain ICLGG di Fakultas Hukum Universitas Airlangga (2–3 Agustus 2023).',
      'Presenter TRAILS pada 25 September 2023 di Jakarta dan ICTC pada 25–26 Oktober 2023 di Fakultas Hukum Universitas Brawijaya.'
    ],
    publications: [
      'Aktif sebagai penulis di beberapa buku yang telah terbit.',
      'Aktif sebagai penulis di beberapa jurnal ilmiah.'
    ],
    created_at: '2026-01-10T08:00:00.000Z',
    updated_at: '2026-01-10T08:00:00.000Z'
  },
  {
    id: 'author-2',
    name: 'Dr. Edy Gunawan',
    academic_titles: 'S.E., Ak., S.H., M.Ak., M.H., M.Kn., BKP., CLA., Mediator., CertDa., CIISA',
    photo_url: '',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: '',
    profile_education: [
      'Penulis merupakan akademisi dan praktisi perpajakan dengan pengalaman lebih dari 35 tahun.',
      'Magister Kenotariatan, Universitas Pelita Harapan, Jakarta.',
      'Magister Hukum, Universitas Islam Syekh Yusuf Tangerang.',
      'Doktor Ilmu Hukum, Universitas Pelita Harapan, Jakarta.',
      'Magister Akuntansi, Universitas Mercu Buana, Jakarta.',
      'Sarjana Hukum, Universitas Bung Karno, Jakarta.',
      'Sarjana Ekonomi, Universitas Tridinanti, Palembang.'
    ],
    work_experience: [
      'Associate Professor Universitas Pelita Harapan Jakarta.',
      'Mengajar perpajakan lebih dari 8 tahun di Universitas Pelita Harapan, Universitas Multimedia Nusantara, dan Universitas Mercu Buana.',
      'Chief Cost Accounting PT Dexa Medica (1989–1992).',
      'Senior Auditor KAP Utoyo (1992–1993).',
      'Chief Cost Accounting PT Cometa Can Corp (1994–1996).',
      'EDP Manager PT Kuperin Mutu Utama (1996–1999).',
      'Tax Corporate Coordinator Manager Indofood Group (1999–2015).',
      'Senior Partner & Advocate PT Ofisi Prima Konsultindo (2016–sekarang).'
    ],
    organization_seminar: [
      'Memiliki sertifikasi Advocate member from Peradi.',
      'Register Kuasa Hukum (Tax Advocate) Pengadilan Pajak.',
      'Certified Legal Auditor.',
      'Certification of Tax Consultant USKP C.',
      'Tax Consultant License from Directorate General Tax.',
      'Certified Mediator (Pusat Mediasi Indonesia UGM).',
      'Certificate in Data Analytics (CertDA).',
      'Certified International Information System Auditor (CIISA).',
      'Certified Risk Management Professional (CRMP).'
    ],
    publications: [
      'Buku: Keadilan Bagi Wajib Pajak Yang Patuh Pasca Berlakunya Undang-Undang Nomor 11 Tahun 2016 Tentang Pengampunan Pajak.',
      'Buku: Hukum Kepailitan (2021).',
      'Buku: Hukum Perbankan (2022).',
      'Buku: Telaah Kritis Atas Pemidanaan Pajak Dalam Penegakan Hukum Pidana Ekonomi Nasional — Penerbit PT Scientia Integritas Utama, 2025.'
    ],
    created_at: '2026-01-10T08:05:00.000Z',
    updated_at: '2026-01-10T08:05:00.000Z'
  },
  {
    id: 'author-3',
    name: 'Henry Dianto P. Sinaga',
    academic_titles: '',
    photo_url: '/images/authors/henry-dianto-p-sinaga.png',
    scopus_id: '57213170349',
    orcid_id: '0000-0002-4533-6283',
    linkedin_url: '',
    email: '',
    profile_education: [
      'Pegawai Direktorat Jenderal Pajak, Kementerian Keuangan Republik Indonesia.',
      'Diploma III Perpajakan STAN Prodip di Jakarta (2000).',
      'Sarjana Akuntansi Universitas Sumatera Utara (2005).',
      'Program Pendidikan Profesi Akuntan Universitas Sriwijaya (2009).',
      'Magister Ilmu Manajemen Universitas Sumatera Utara (2007).',
      'Magister Ilmu Hukum Universitas Sriwijaya (2009).',
      'Sarjana Hukum Universitas Mpu Tantular (2016).',
      'Program Doktor Hukum Universitas Diponegoro (2023).'
    ],
    work_experience: [
      'Pegawai Direktorat Jenderal Pajak, Kementerian Keuangan Republik Indonesia.',
      'Mengikuti pendidikan dan pelatihan kedinasan: Diklat Juru Sita Pajak, Diklat Keuangan Medan, Diklat Penyidik Pegawai Negeri Sipil di Pusdik Reskrim Polri Bogor, Diklat Audit Kecurangan, Diklat Penyegaran Pemeriksaan Bukti Permulaan dan Penyidikan, serta Diklat Ekspor dan Impor.',
      'Mengikuti Workshop Taxation/Money Laundering Investigations di Jakarta Centre for Law Enforcement Cooperation, Diklat Fungsional Pemeriksa Pajak, In-House Training Training of Trainer, dan Diklat Pencucian Uang.'
    ],
    organization_seminar: [
      'Aktif mengikuti seminar internasional dan aktif menulis buku serta artikel ilmiah yang dimuat dalam jurnal internasional bereputasi yang terindeks Scopus dan jurnal nasional yang terindeks Sinta 2.',
      'Sertifikasi Anti-Corruption in the Context of the 2030 Agenda for Sustainable Development (UNDP & United Nations System Staff College, 2019).',
      'Sertifikasi Circular economy and the 2030 Agenda (United Nations System Staff College, 2020).',
      'Sertifikasi Policy Coherence for Sustainable Development (United Nations System Staff College, 2021).'
    ],
    publications: [
      'Aktif menulis buku dan artikel ilmiah yang telah dimuat dalam jurnal internasional bereputasi terindeks Scopus dan jurnal nasional terindeks Sinta 2.'
    ],
    created_at: '2026-01-10T08:10:00.000Z',
    updated_at: '2026-01-10T08:10:00.000Z'
  },
  {
    id: 'author-4',
    name: 'Joko Purnomo Raharjo',
    academic_titles: '',
    photo_url: '',
    scopus_id: '57855623900',
    orcid_id: '0000-0003-0761-9327',
    linkedin_url: '',
    email: 'jokopurnomo.jpr@gmail.com',
    profile_education: [
      'Pegawai Direktorat Jenderal Pajak, Kementerian Keuangan Republik Indonesia.',
      'Diploma III STAN (1996) di Jakarta.',
      'Diploma IV STAN (2002) di Jakarta.',
      'Master of Economics, Yokohama National University (2011) di Jepang.',
      'Ph.D dari Queensland University of Technology (2022) di Australia.'
    ],
    work_experience: [
      'Pegawai Direktorat Jenderal Pajak, Kementerian Keuangan Republik Indonesia.',
      'Mengikuti Internship Program pada National Tax College, Japan (April 2009–Maret 2010).',
      'Mengikuti Benchmarking Behavioral Model Training (2012), Risk Management Training for Executive (2013), Coaching and Mentoring Leadership Course (2013), dan Data & Information Management Training (2013).'
    ],
    organization_seminar: [
      'Mengikuti Annual CEPA International Workshop (2017), Productivity and Efficiency Analysis Using R (2019), The 1st Behavioral Economics Science and Technology Conference (2019), dan The 12nd Australasian Public Choice Conference.',
      'Presenter pada Tax Clinic for Expatriat (2021) dan Transfer Pricing (2022).',
      'Aktif menulis forum ilmiah dan berbagai kajian ilmiah yang dimuat dalam jurnal internasional.'
    ],
    publications: [
      'Aktif menulis berbagai kajian ilmiah yang telah dimuat dalam jurnal internasional dan prosiding ilmiah.',
      'Publikasi meliputi analisis produktivitas, efisiensi perusahaan, pasar modal, dan interaksi antara harga saham serta nilai tukar.'
    ],
    created_at: '2026-01-10T08:15:00.000Z',
    updated_at: '2026-01-10T08:15:00.000Z'
  },
  {
    id: 'author-5',
    name: 'Dr. Wahyu Widodo, Ak., CA., S.H., M.Si.',
    academic_titles: '',
    photo_url: '',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: '',
    profile_education: [
      'Praktisi perpajakan dengan pengalaman di bidang perpajakan dan hukum pidana pajak.',
      'Program Diploma IV, Sekolah Tinggi Akuntansi Negara, Jakarta.',
      'Sarjana Hukum, Universitas Mpu Tantular, Jakarta.',
      'Magister Akuntansi, Universitas Diponegoro, Semarang.',
      'Doktor Ilmu Hukum, Universitas Pelita Harapan, Jakarta.'
    ],
    work_experience: [
      'Fungsional Pemeriksa Pajak (1989–2008).',
      'Penyidik Pajak (2008–2016).',
      'Kepala Bidang Keberatan, Banding, dan Pengurangan Kanwil DJP Sumatera Utara I (2016–2018).',
      'Kepala Bidang Pemeriksaan, Penyidikan, dan Penagihan Pajak Kanwil DJP Sumatera Utara I (2018–2021).',
      'Kepala Subdirektorat Penyidikan Direktorat Jenderal Pajak (2021–2025).'
    ],
    organization_seminar: [
      'Aktif mengikuti diklat perpajakan, hukum pidana dan hukum perdata, termasuk Diklat Intelijen Dasar Manajemen Eksekutif Ditjen Pajak.',
      'Delegasi Indonesia dalam One on One Meeting assessment keanggotaan Indonesia dalam FATF, Paris (2022).',
      'Delegasi Indonesia pada Annual TFTC Meeting, Roma (2023).',
      'Anggota Tim Bersama Kemenko Polhukam dan Komnas HAM FATF.',
      'Delegasi Indonesia pada pertemuan Attorney-General’s Chamber of Singapore (2024).',
      'Peserta Benchmarking Asset Management ke HMRC England, London (2024).'
    ],
    publications: [
      'Buku: Telaah Kritis Atas Pemidanaan Pajak Dalam Penegakan Hukum Pidana Ekonomi Nasional — Penerbit PT Scientia Integritas Utama, 2025.',
      'Buku: Alternative Dispute Resolution dalam Pidana Pajak — Penerbit PT Scientia Integritas Utama, 2026.',
      'Jurnal: Perhitungan Proporsi Kerugian pada Pendapatan Negara berdasarkan Kualifikasi Kesengajaan dan Kualifikasi Perbuatan Pelaku Tindak Pidana di Bidang Perpajakan.',
      'Jurnal: The Criminal Liability of Tax Advisors and Intermediaries in Aggressive Tax Planning Schemes.',
      'Jurnal: Pendidikan Pajak yang Optimal Berbasis Pemulihan Kerugian pada Pendapatan Negara.',
      'Jurnal: Prosecuting Transnational Tax Evasion: Legal Challenges and International Cooperation.'
    ],
    created_at: '2026-01-10T08:20:00.000Z',
    updated_at: '2026-01-10T08:20:00.000Z'
  },
  {
    id: 'author-6',
    name: 'Yudha Pramana',
    academic_titles: '',
    photo_url: '',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: '',
    profile_education: [
      'Pegawai Direktorat Jenderal Pajak, Kementerian Keuangan Republik Indonesia.',
      'Diploma III STAN (2000) di Jakarta.',
      'Sarjana Ekonomi Jurusan Akuntansi Universitas Prof. Dr. Moestopo (Beragama) (2012) di Jakarta.',
      'Magister Sains Akuntansi Universitas Udayana (2019) di Denpasar.'
    ],
    work_experience: [
      'Pegawai Direktorat Jenderal Pajak, Kementerian Keuangan Republik Indonesia.',
      'Pendidikan dan pelatihan kedinasan: e-learning Pengantar e-Audit Perpajakan I (2024), Pelatihan Jarak Jauh Pemeriksaan Sektor Ekonomi Digital (2021), E-learning Probis Pemeriksaan (2023), dan pelatihan teknis pemeriksaan bukti permulaan (2018).',
      'Mengikuti Diklat PPNS (2017), Diklat Teknik Audit Berbantuan Komputer Tingkat Dasar (2015), Diklat Akuntansi Berbasis PSAK Konvergensi IFRS, serta Diklat Fungsional Pemeriksa Pajak.'
    ],
    organization_seminar: [
      'Aktif mengikuti pendidikan dan pelatihan kedinasan bidang perpajakan dan audit.',
      'Aktif menulis dalam beberapa jurnal ilmiah yang telah dimuat di jurnal terindeks Scopus dan Sinta-2.'
    ],
    publications: [
      'Aktif menulis dalam beberapa jurnal ilmiah yang telah dimuat di jurnal terindeks Scopus dan Sinta-2.'
    ],
    created_at: '2026-01-10T08:25:00.000Z',
    updated_at: '2026-01-10T08:25:00.000Z'
  },
  {
    id: 'author-7',
    name: 'Andi Banua Adams',
    academic_titles: '',
    photo_url: '/images/authors/andi-banua-adams.png',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: '',
    profile_education: [
      'Lahir di Surabaya pada 6 Agustus 1968.',
      'Menyelesaikan pendidikan dari SD hingga S2 di Jakarta.'
    ],
    work_experience: [
      'Masih aktif sebagai Aparatur Sipil Negara.',
      'Memiliki ketertarikan pada perpajakan internasional dan bidang transfer pricing.'
    ],
    organization_seminar: [
      'Di luar pekerjaan, memiliki ketertarikan pada penulisan kreatif.',
      'Senang berolahraga seperti sepak bola dan volley.',
      'Sering melakukan aktivitas outdoor seperti hiking dan tracking ke tempat-tempat tertentu dengan pemandangan alam yang indah dan sejuk.'
    ],
    publications: [
      'Tertarik menulis berbagai jenis buku tentang biografi dan autobiografi.',
      'Memiliki cita-cita menjadi manusia yang berguna bagi keluarga dan khalayak umum dalam jalan kebaikan untuk dunia dan akhirat kelak.'
    ],
    created_at: '2026-09-09T00:00:00.000Z',
    updated_at: '2026-09-09T00:00:00.000Z'
  },
  {
    id: 'author-8',
    name: 'Edy Edwin P. Ginting',
    academic_titles: '',
    photo_url: '',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: '',
    profile_education: '',
    work_experience: '',
    organization_seminar: '',
    publications: '',
    created_at: '2026-09-10T00:00:00.000Z',
    updated_at: '2026-09-10T00:00:00.000Z'
  },
  {
    id: 'author-9',
    name: 'Dr. Yuli Teguh Hidayat, SST., MM.',
    academic_titles: '',
    photo_url: '',
    scopus_id: '',
    orcid_id: '',
    linkedin_url: '',
    email: '',
    profile_education: [
      'Lahir di Semarang pada tahun 1979.',
      'Menyelesaikan pendidikan doctoral dalam bidang Manajemen Bisnis (Keuangan) di Universitas Padjadjaran Bandung tahun 2016.'
    ],
    work_experience: [
      'Praktisi pemerintahan di bidang Keuangan dan Perpajakan.',
      'Aktif sebagai Praktisi Pemerintahan, berbisnis, berorganisasi dan melakukan kegiatan sosial.',
      'Sebagai Tenaga Ahli (Expert), Penasehat, Dewan Pembina di sejumlah organisasi bisnis dan sosial.',
      'Aktif sebagai pembicara, penulis buku, jurnal dan kajian ilmiah.'
    ],
    organization_seminar: [
      'Pemilik Hak Atas Kekayaan Intelektual (HAKI) model bisnis “FM Model For Banking Sector”.',
      'Pada tahun 2019 mendirikan Forum Doktor Multidisiplin Indonesia (FDMI) yang beranggotakan akademisi dan praktisi dari berbagai disiplin ilmu, dalam dan luar negeri yang sudah memperoleh gelar Doktor/PhD.',
      'Forum ini melakukan berbagai macam kegiatan dan kajian ilmiah dalam rangka mencari solusi praktis berbagai permasalahan bisnis, sosial ekonomi, kebijakan public, permasalahan kehidupan bermasyarakat, berbangsa dan bernegara lainnya dengan model pendekatan Kolaborasi Pentahelix (Academician, Business, Government, Community and Media).'
    ],
    publications: [
      'Berkomitmen untuk terus belajar, berkarya dan memperbaiki diri agar menjadi Pribadi yang Sholeh Wal Muslikh (Sholeh buat diri sendiri dan lingkungannya).'
    ],
    created_at: '2026-09-10T00:00:00.000Z',
    updated_at: '2026-09-10T00:00:00.000Z'
  }
];

const AUTHOR_PHOTO_BY_NAME: Record<string, string> = {
  'andi banua adams': '/images/authors/andi-banua-adams.png',
  'henry dianto p sinaga': '/images/authors/henry-dianto-p-sinaga.png',
  'joko purnomo raharjo': '/images/authors/joko-purnomo-raharjo.png',
  'dr wahyu widodo ak ca s h m si': '/images/authors/wahyu-widodo.png'
};

const authorNameKey = (name: string): string => name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Hanya mempertahankan nama/gelar/kontak yang sudah diverifikasi dari referensi profil. */
export const normalizeAuthorProfile = (author: Author): Author => {
  const name = String(author.name || '').trim().toLowerCase();
  let normalized: Author = { ...author };
  if (name.includes('bonarsius')) normalized = { ...normalized, name: 'Bonarsius Sipayung', academic_titles: '', email: '' };
  else if (name.includes('edy gunawan')) normalized = { ...normalized, name: 'Dr. Edy Gunawan', academic_titles: 'S.E., Ak., S.H., M.Ak., M.H., M.Kn., BKP., CLA., Mediator., CertDa., CIISA', email: '' };
  else if (name.includes('henry dianto')) normalized = { ...normalized, name: 'Henry Dianto P. Sinaga', academic_titles: '' };
  else if (name.includes('joko purnomo')) normalized = { ...normalized, name: 'Joko Purnomo Raharjo', academic_titles: '', email: 'jokopurnomo.jpr@gmail.com' };
  else if (name.includes('wahyu widodo')) normalized = { ...normalized, name: 'Dr. Wahyu Widodo, Ak., CA., S.H., M.Si.', academic_titles: '', email: '' };
  else if (name.includes('yudha pramana')) normalized = { ...normalized, name: 'Yudha Pramana', academic_titles: '', email: '' };
  else if (name.includes('andi banua adams')) normalized = { ...normalized, name: 'Andi Banua Adams', academic_titles: '', email: '' };
  else if (name.includes('edy edwin') || name.includes('edy ewin')) normalized = { ...normalized, name: 'Edy Edwin P. Ginting', academic_titles: '', email: '' };
  else if (name.includes('yuli teguh')) normalized = { ...normalized, name: 'Dr. Yuli Teguh Hidayat, SST., MM.', academic_titles: '', email: '' };

  const canonicalPhoto = AUTHOR_PHOTO_BY_NAME[authorNameKey(normalized.name)];
  return { ...normalized, photo_url: canonicalPhoto || undefined };
};

/** Normalizes names/photos and collapses duplicate records from cache or API. */
export const normalizeAuthors = (authors: Author[]): Author[] => {
  const unique = new Map<string, Author>();
  authors.forEach((author) => {
    const normalized = normalizeAuthorProfile(author);
    const key = authorNameKey(normalized.name);
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, normalized);
      return;
    }
    unique.set(key, {
      ...existing,
      ...normalized,
      id: existing.id || normalized.id,
      books: [...(existing.books || []), ...(normalized.books || [])].filter(
        (book, index, allBooks) => allBooks.findIndex((candidate) => candidate.id === book.id) === index
      )
    });
  });
  return Array.from(unique.values());
};

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
  { book_id: 'book-1', author_id: 'author-1', author_order: 0 },
  { book_id: 'book-2', author_id: 'author-1', author_order: 0 },
  { book_id: 'book-3', author_id: 'author-1', author_order: 0 },
  { book_id: 'book-4', author_id: 'author-3', author_order: 0 },
  { book_id: 'book-4', author_id: 'author-7', author_order: 1 },
  { book_id: 'book-5', author_id: 'author-6', author_order: 0 },
  { book_id: 'book-5', author_id: 'author-4', author_order: 1 },
  { book_id: 'book-10', author_id: 'author-3', author_order: 0 },
  { book_id: 'book-11', author_id: 'author-1', author_order: 0 },
  { book_id: 'book-11', author_id: 'author-3', author_order: 1 },
  { book_id: 'book-12', author_id: 'author-3', author_order: 0 },
  { book_id: 'book-13', author_id: 'author-5', author_order: 0 },
  { book_id: 'book-14', author_id: 'author-6', author_order: 0 },
  { book_id: 'book-15', author_id: 'author-7', author_order: 0 },
  { book_id: 'book-15', author_id: 'author-4', author_order: 1 },
  { book_id: 'book-16', author_id: 'author-3', author_order: 0 },
  { book_id: 'book-19', author_id: 'author-5', author_order: 0 },
  { book_id: 'book-20', author_id: 'author-3', author_order: 0 }
  ,{ book_id: 'book-12', author_id: 'author-8', author_order: 1 }
  ,{ book_id: 'book-24', author_id: 'author-6', author_order: 0 }
  ,{ book_id: 'book-24', author_id: 'author-7', author_order: 1 }
  ,{ book_id: 'book-25', author_id: 'author-5', author_order: 0 }
  ,{ book_id: 'book-25', author_id: 'author-2', author_order: 1 }
  ,{ book_id: 'book-26', author_id: 'author-8', author_order: 0 }
  ,{ book_id: 'book-26', author_id: 'author-4', author_order: 1 }
  ,{ book_id: 'book-27', author_id: 'author-7', author_order: 0 }
  ,{ book_id: 'book-27', author_id: 'author-3', author_order: 1 }
  ,{ book_id: 'book-28', author_id: 'author-7', author_order: 0 }
  ,{ book_id: 'book-16', author_id: 'author-9', author_order: 1 }
  ,{ book_id: 'book-20', author_id: 'author-9', author_order: 0 }
];
