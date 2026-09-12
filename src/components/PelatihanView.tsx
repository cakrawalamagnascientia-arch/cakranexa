import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, 
  Calendar, 
  Clock, 
  Award, 
  Users, 
  CheckCircle2, 
  ArrowRight, 
  ChevronDown, 
  FileText, 
  ShieldCheck, 
  BookOpen, 
  Check, 
  ExternalLink,
  X
} from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { AcademicModule, SiteContentSettings } from '../types';
import { DEFAULT_SITE_CONTENT, getStoredSiteContent } from '../services/siteContentService';
import { useCmsText } from '../i18n/hooks';

const defaultAcademicModules: AcademicModule[] = [
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
    ]
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
    ]
  },
  {
    id: 'mod-3',
    number: '03',
    title: 'Pelatihan Metodologi Riset & Analisis Data Terapan',
    subtitle: 'Penguasaan alat analisis data kuantitatif dan kualitatif untuk karya ilmiah.',
    category: 'riset',
    badge: 'Praktikum Hands-on',
    duration: '3 Hari Praktikum Intensif (24 Jam Pelatihan)',
    format: 'Laboratorium Komputer & Hybrid Zoom',
    schedule: 'Angkatan IV: 11 - 13 November 2026',
    investment: 'Rp 3.250.000 / Peserta',
    targetAudience: 'Peneliti Sosial, Dosen Akuntansi/Manajemen/Hukum, Analis Kebijakan Fiskal, dan Konsultan Riset.',
    curriculum: [
      'Desain Riset Empiris Bidang Akuntansi, Perpajakan, Hukum Ekonomi, dan Tata Kelola Bisnis',
      'Analisis Multivariat Kuantitatif dengan SmartPLS 4, SPSS 29, dan Stata 18',
      'Analisis Kualitatif Tematik Berbantuan NVivo 14 & Pemetaan Bibliometrik (VOSviewer)',
      'Teknik Penulisan Bab Pembahasan (Discussion) yang Mengaitkan Temuan Data dengan Teori Induk'
    ],
    facilities: [
      'Dataset Riil Terverifikasi untuk Simulasi Praktik',
      'Lisensi Software Praktik Selama Pelatihan Berlangsung',
      'Modul Panduan Step-by-Step Olah Data Kuantitatif & Kualitatif',
      'Sertifikat Kompetensi Analisis Data Terapan 32 JP'
    ]
  },
  {
    id: 'mod-4',
    number: '04',
    title: 'Pelatihan Tata Kelola Hak Cipta & Lisensi Karya',
    subtitle: 'Manajemen HAKI dan perlindungan hukum bagi penulis dan lembaga.',
    category: 'hukum',
    badge: 'Legalitas & Hak Moral',
    duration: '1 Hari Masterclass (8 Jam Pelatihan)',
    format: 'Hybrid (Hotel Aryaduta Jakarta & Zoom HD)',
    schedule: 'Angkatan III: 18 November 2026',
    investment: 'Rp 1.850.000 / Peserta',
    targetAudience: 'Penulis Buku, Pimpinan LPPM Universitas, Pengelola Penerbitan Kampus, dan In-House Legal.',
    curriculum: [
      'Prinsip Pokok UU No. 28 Tahun 2014 tentang Hak Cipta dalam Perlindungan Karya Akademik',
      'Simulasi dan Prosedur Pendaftaran Mandiri melalui Portal e-Hakcipta DJKI Kemenkumham RI',
      'Negosiasi Klausul Perjanjian Lisensi Penerbitan, Hak Royalti, dan Hak Terjemahan Lintas Negara',
      'Mitigasi Risiko Pelanggaran Digital serta Kebijakan Pemanfaatan Karya untuk Pelatihan Model AI'
    ],
    facilities: [
      'Template Akta Perjanjian Lisensi Hak Cipta Siap Pakai',
      'Bimbingan Langsung Pendaftaran 1 Karya ke e-Hakcipta DJKI',
      'Konsultasi Hukum HAKI Bersama Dewan Pakar Hukum CakraNexa',
      'Sertifikat Kompetensi Tata Kelola HAKI 16 JP'
    ]
  },
  {
    id: 'mod-5',
    number: '05',
    title: 'Pelatihan Penyusunan Modul Ajar Digital',
    subtitle: 'Mengembangkan bahan ajar interaktif untuk perguruan tinggi dan lembaga pelatihan.',
    category: 'penulisan',
    badge: 'Outcome-Based Education',
    duration: '2 Hari Workshop (16 Jam Pelatihan)',
    format: 'Daring Interaktif via Zoom & Learning Management System',
    schedule: 'Angkatan V: 25 - 26 November 2026',
    investment: 'Rp 2.500.000 / Peserta',
    targetAudience: 'Dosen Pengampu Mata Kuliah, Instruktur Pelatihan Vokasi, dan Tim Pengembang Kurikulum.',
    curriculum: [
      'Penyelarasan Bahan Ajar dengan Rencana Pembelajaran Semester (RPS) Berbasis OBE',
      'Desain Modul Ajar Digital Interaktif (Format ePub3, Multimedia Terintegrasi, dan SCORM Package)',
      'Penyusunan Lembar Kerja Mahasiswa (LKM) Berbasis Kasus Riil (Case Method & Project-Based Learning)',
      'Rubrik Penilaian Capaian Pembelajaran Lulusan (CPL) Standar Akreditasi Unggul BAN-PT / LAM'
    ],
    facilities: [
      'Template Dokumen RPS dan Desain Bahan Ajar Interaktif',
      'Akses LMS Sandbox CakraNexa Academy Selama 1 Bulan',
      'Panduan Konversi Diktat Konvensional ke E-Modul Interaktif',
      'Sertifikat Penyusun Bahan Ajar Terakreditasi 32 JP'
    ]
  },
  {
    id: 'mod-6',
    number: '06',
    title: 'Lokakarya Sertifikasi & Praktik Perpajakan Terapan',
    subtitle: 'Pendampingan komprehensif bagi praktisi dan akademisi bidang hukum pajak.',
    category: 'hukum',
    badge: 'Akreditasi Fiskal',
    duration: '4 Hari Intensif Akhir Pekan (32 Jam Pelatihan)',
    format: 'Hotel Mulia Senayan, Jakarta & Live Streaming Hybrid',
    schedule: 'Angkatan VIII: 6 - 9 Desember 2026',
    investment: 'Rp 4.850.000 / Peserta',
    targetAudience: 'Konsultan Pajak, Tax Manager Korporasi, Auditor Forensik, Advokat Pajak, dan Dosen Hukum Fiskal.',
    curriculum: [
      'Analisis Implementasi PMK 172/2023 dan Praktik Penyusunan Transfer Pricing Documentation (Local/Master File)',
      'Strategi Penanganan Sengketa Pajak: Proses Keberatan, Banding, hingga Gugatan di Pengadilan Pajak',
      'Mitigasi Risiko Pemeriksaan Bukti Permulaan (Bukper) dan Penerapan Asas Ultimum Remedium UU HPP',
      'Simulasi Ujian Sertifikasi Konsultan Pajak (USKP) Tingkat A & B dengan Pembahasan Kasus Riil'
    ],
    facilities: [
      'Buku Rujukan Monografi Pajak Hardcover Terbitan CakraNexa',
      'Kompilasi Putusan Pengadilan Pajak Terpilih sebagai Bahan Kajian',
      'Makan Siang & Coffee Break di Hotel Berbintang (Khusus Tatap Muka)',
      'Sertifikat Keahlian Praktik Perpajakan Terapan 48 JP'
    ]
  }
];

// Field modul yang ditampilkan dan punya terjemahan (training.json: modules.<id> dan cmsModules.<id>).
type ModuleTextField = 'title' | 'subtitle' | 'badge' | 'duration' | 'format' | 'schedule' | 'investment' | 'targetAudience';
type ModuleListField = 'curriculum' | 'facilities';
type ModuleCopy = Partial<Pick<AcademicModule, ModuleTextField | ModuleListField>>;
type ModuleCopyMap = Record<string, ModuleCopy | undefined>;

const MODULE_TEXT_FIELDS: ModuleTextField[] = ['title', 'subtitle', 'badge', 'duration', 'format', 'schedule', 'investment', 'targetAudience'];
const MODULE_LIST_FIELDS: ModuleListField[] = ['curriculum', 'facilities'];

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

interface PelatihanViewProps {
  siteContent?: SiteContentSettings;
}

export const PelatihanView: React.FC<PelatihanViewProps> = ({ siteContent: propContent }) => {
  const { t } = useTranslation('training');
  const cmsText = useCmsText();
  const [content, setContent] = useState<SiteContentSettings>(() => propContent || getStoredSiteContent());

  useEffect(() => {
    if (propContent) setContent(propContent);
  }, [propContent]);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) setContent(e.detail);
    };
    window.addEventListener('cakranexa_content_updated', handleUpdate);
    return () => window.removeEventListener('cakranexa_content_updated', handleUpdate);
  }, []);

  const [expandedModule, setExpandedModule] = useState<string | null>('mod-1');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedModuleForReg, setSelectedModuleForReg] = useState<AcademicModule | null>(null);

  // Registration Form State
  const [regForm, setRegForm] = useState({
    fullName: '',
    institution: '',
    email: '',
    phoneWhatsApp: '',
    participationFormat: 'Hybrid (Tatap Muka & Zoom)',
    notes: ''
  });
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  const academicModules: AcademicModule[] = (content.academicModules && content.academicModules.length > 0)
    ? content.academicModules
    : defaultAcademicModules;

  const filteredModules = academicModules.filter(m => {
    if (activeCategory === 'all') return true;
    return m.category === activeCategory;
  });

  // Konten modul berasal dari CMS (bawaan Bahasa Indonesia). Teks yang masih sama dengan bawaan komponen
  // atau DEFAULT_SITE_CONTENT ditampilkan dari file terjemahan; teks yang sudah diubah admin tampil apa adanya.
  const moduleCopy = t('modules', { returnObjects: true }) as ModuleCopyMap;
  const cmsModuleCopy = t('cmsModules', { returnObjects: true }) as ModuleCopyMap;

  const localizeModule = (item: AcademicModule): AcademicModule => {
    const variants: Array<[AcademicModule | undefined, ModuleCopy | undefined]> = [
      [defaultAcademicModules.find((m) => m.id === item.id), moduleCopy?.[item.id]],
      [DEFAULT_SITE_CONTENT.academicModules?.find((m) => m.id === item.id), cmsModuleCopy?.[item.id]]
    ];
    const localized: AcademicModule = { ...item };
    for (const field of MODULE_TEXT_FIELDS) {
      const value = item[field];
      if (!value) continue;
      const match = variants.find(([source, copy]) => source?.[field] === value && typeof copy?.[field] === 'string');
      if (match) localized[field] = cmsText(value, value, match[1]![field]!);
    }
    for (const field of MODULE_LIST_FIELDS) {
      const value = item[field];
      if (!Array.isArray(value) || value.length === 0) continue;
      const match = variants.find(([source, copy]) => {
        const defaults = source?.[field];
        const translated = copy?.[field];
        return !!defaults && Array.isArray(translated) && sameList(value, defaults) && translated.length === value.length;
      });
      if (match) localized[field] = value.map((entry, i) => cmsText(entry, entry, match[1]![field]![i]));
    }
    return localized;
  };

  const selectedModuleView = selectedModuleForReg ? localizeModule(selectedModuleForReg) : null;

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModuleForReg) return;

    const regId = `REG-ACAD-${Date.now().toString().slice(-6)}`;
    setRegSuccess(regId);

    // Save to localStorage
    try {
      const existing = JSON.parse(localStorage.getItem('cakranexa_academy_regs_v1') || '[]');
      existing.unshift({
        regId,
        moduleTitle: selectedModuleForReg.title,
        ...regForm,
        registeredAt: new Date().toISOString()
      });
      localStorage.setItem('cakranexa_academy_regs_v1', JSON.stringify(existing));
    } catch (err) {
      console.warn('Storage notice:', err);
    }
  };

  return (
    <div id="pelatihan-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-14 text-left font-sans space-y-10">
      
      {/* =================================================================== */}
      {/* A. HERO SECTION                                                    */}
      {/* =================================================================== */}
      <div className="bg-[#0F172A] text-white rounded-2xl p-6 sm:p-12 relative overflow-hidden border border-slate-800 shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[#D4AF37] text-xs font-semibold tracking-wider uppercase">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>{t('hero.eyebrow')}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            {t('hero.title')}
          </h1>

          <p className="text-slate-300 text-xs sm:text-sm font-normal leading-relaxed">
            {t('hero.subtitle')}
          </p>

          <div className="pt-3 flex flex-wrap items-center gap-4 text-xs text-slate-300">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
              <span>{t('hero.highlights.certificate')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#D4AF37]" />
              <span>{t('hero.highlights.instructors')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[#D4AF37]" />
              <span>{t('hero.highlights.curriculum')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 gap-3">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('catalog.eyebrow')}</span>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('catalog.title')}</h2>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: t('categories.all') },
            { id: 'penulisan', label: t('categories.penulisan') },
            { id: 'riset', label: t('categories.riset') },
            { id: 'hukum', label: t('categories.hukum') }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-[#0F172A] text-[#DFBF64]'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* =================================================================== */}
      {/* B. INTERACTIVE ACCORDION / EXPANDABLE LIST                          */}
      {/* =================================================================== */}
      <div className="space-y-4">
        {filteredModules.map((rawItem) => {
          const item = localizeModule(rawItem);
          const isExpanded = expandedModule === item.id;

          return (
            <div
              key={item.id}
              id={`accordion-module-${item.id}`}
              className={`bg-white rounded-xl border transition-all overflow-hidden ${
                isExpanded 
                  ? 'border-[#D4AF37] shadow-md ring-1 ring-[#D4AF37]/30' 
                  : 'border-slate-200 shadow-xs hover:border-slate-300'
              }`}
            >
              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => setExpandedModule(isExpanded ? null : item.id)}
                className="w-full text-left p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer focus:outline-none"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm flex-shrink-0 transition-colors ${
                    isExpanded ? 'bg-[#0F172A] text-[#DFBF64]' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {item.number}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-base sm:text-lg text-slate-900 leading-snug">
                        {item.title}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right hidden md:block">
                    <span className="text-[10px] text-slate-400 block font-medium">{t('module.investmentLabel')}</span>
                    <span className="text-xs font-mono font-bold text-emerald-600">{item.investment}</span>
                  </div>

                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${
                    isExpanded
                      ? 'bg-[#0F172A] border-[#0F172A] text-white rotate-180'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </button>

              {/* Accordion Expanded Content */}
              {isExpanded && (
                <div className="px-5 sm:px-6 pb-6 pt-2 border-t border-slate-100 bg-slate-50/50 space-y-6 animate-in fade-in duration-150">

                  {/* Meta Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">{t('module.nextSchedule')}</span>
                      <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>{item.schedule}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">{t('module.duration')}</span>
                      <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                        <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>{item.duration}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">{t('module.format')}</span>
                      <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                        <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span className="truncate">{item.format}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">{t('module.fee')}</span>
                      <div className="text-emerald-600 font-mono font-bold">
                        {item.investment}
                      </div>
                    </div>
                  </div>

                  {/* Target Audience */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
                    <span className="font-bold text-slate-900 block mb-0.5">{t('module.targetAudience')}</span>
                    <p className="text-slate-600">{item.targetAudience}</p>
                  </div>

                  {/* Curriculum & Facilities Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    
                    {/* Pokok Bahasan Kurikulum */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                        <BookOpen className="w-4 h-4 text-[#D4AF37]" />
                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 uppercase tracking-wide">
                          {t('module.curriculumTitle')}
                        </h4>
                      </div>
                      <ul className="text-xs text-slate-600 space-y-2.5">
                        {item.curriculum.map((c, cIdx) => (
                          <li key={cIdx} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Fasilitas & Sertifikasi */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                        <Award className="w-4 h-4 text-[#D4AF37]" />
                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 uppercase tracking-wide">
                          {t('module.facilitiesTitle')}
                        </h4>
                      </div>
                      <ul className="text-xs text-slate-600 space-y-2.5">
                        {item.facilities.map((f, fIdx) => (
                          <li key={fIdx} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-[#0F172A] flex-shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                  </div>

                  {/* Action Footer */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200">
                    <p className="text-xs text-slate-500">
                      {t('module.discountNote')}
                    </p>

                    <button
                      id={`btn-daftar-pelatihan-${item.id}`}
                      onClick={() => {
                        setSelectedModuleForReg(rawItem);
                        setRegSuccess(null);
                      }}
                      className="w-full sm:w-auto py-2.5 px-5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-[#DFBF64] font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shadow-xs"
                    >
                      <span>{t('module.register')}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Institutional Partnership Box */}
      <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1 text-center md:text-left">
          <span className="text-[10px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('inHouse.eyebrow')}</span>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900">{t('inHouse.title')}</h3>
          <p className="text-xs text-slate-600 max-w-2xl">
            {t('inHouse.description')}
          </p>
        </div>

        <a
          href={`https://wa.me/6285286146806?text=${encodeURIComponent(t('inHouse.whatsappMessage'))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-xs"
        >
          <ExternalLink className="w-4 h-4" />
          <span>{t('inHouse.cta')}</span>
        </a>
      </div>

      {/* =================================================================== */}
      {/* REGISTRATION MODAL DIALOG                                           */}
      {/* =================================================================== */}
      {selectedModuleView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
            
            <button
              onClick={() => setSelectedModuleForReg(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {regSuccess ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7" />
                </div>

                <div className="space-y-1">
                  <span className="px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 text-xs font-mono font-bold">
                    {t('registration.success.code', { code: regSuccess })}
                  </span>
                  <h3 className="text-xl font-bold text-slate-900">
                    {t('registration.success.title')}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <Trans t={t} i18nKey="registration.success.message" values={{ name: regForm.fullName, program: selectedModuleView.title }} components={{ strong: <strong /> }} />
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-left space-y-1">
                  <p className="font-semibold text-slate-900">{t('registration.success.nextTitle')}</p>
                  <p><Trans t={t} i18nKey="registration.success.nextBody" values={{ phone: regForm.phoneWhatsApp }} components={{ strong: <strong /> }} /></p>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <a
                    href={`https://wa.me/6285286146806?text=${encodeURIComponent(t('registration.success.whatsappMessage', { program: selectedModuleView.title, code: regSuccess }))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{t('registration.success.whatsappCta')}</span>
                  </a>

                  <button
                    onClick={() => {
                      setSelectedModuleForReg(null);
                      setRegSuccess(null);
                    }}
                    className="py-2 px-4 rounded-lg border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
                  >
                    {t('registration.success.close')}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="border-b border-slate-200 pb-3 mb-4 space-y-1">
                  <span className="text-[10px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('registration.form.eyebrow')}</span>
                  <h3 className="text-lg font-bold text-slate-900">{t('registration.form.title')}</h3>
                  <p className="text-xs text-slate-600 font-medium truncate">{selectedModuleView.title}</p>
                </div>

                <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      {t('registration.form.fullName')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={regForm.fullName}
                      onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                      placeholder={t('registration.form.fullNamePlaceholder')}
                      className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      {t('registration.form.institution')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={regForm.institution}
                      onChange={(e) => setRegForm({ ...regForm, institution: e.target.value })}
                      placeholder={t('registration.form.institutionPlaceholder')}
                      className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        {t('registration.form.email')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={regForm.email}
                        onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                        placeholder={t('registration.form.emailPlaceholder')}
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        {t('registration.form.whatsapp')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={regForm.phoneWhatsApp}
                        onChange={(e) => setRegForm({ ...regForm, phoneWhatsApp: e.target.value })}
                        placeholder="0812xxxxxxxx"
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      {t('registration.form.attendance')}
                    </label>
                    <select
                      value={regForm.participationFormat}
                      onChange={(e) => setRegForm({ ...regForm, participationFormat: e.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] bg-white text-slate-900 text-xs"
                    >
                      <option value="Hybrid (Tatap Muka di Lokasi)">{t('registration.form.attendanceOnsite')}</option>
                      <option value="Online Zoom Interactive">{t('registration.form.attendanceOnline')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      {t('registration.form.notes')}
                    </label>
                    <textarea
                      rows={2}
                      value={regForm.notes}
                      onChange={(e) => setRegForm({ ...regForm, notes: e.target.value })}
                      placeholder={t('registration.form.notesPlaceholder')}
                      className="w-full p-2 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full py-3 px-4 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-[#DFBF64] font-bold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t('registration.form.submit')}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
