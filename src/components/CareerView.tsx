import React, { useState } from 'react';
import {
  Briefcase,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Building2,
  Calendar,
  Mail,
  Copy,
  Check,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Printer,
  TrendingUp,
  BookOpen,
  Award,
  Search,
  Users,
  ShieldCheck
} from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { CareerItem, SiteContentSettings } from '../types';
import { DEFAULT_SITE_CONTENT } from '../services/siteContentService';
import { useCmsText } from '../i18n/hooks';

interface CareerViewProps {
  siteContent?: SiteContentSettings;
  onNavigate?: (page: string) => void;
}

// Fallback high-fidelity data with the 3 top managerial vacancies in exact order
const DEFAULT_TOP_CAREERS: CareerItem[] = [
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
    description: 'Memimpin strategi marketing omnichannel, ekspansi kanal D2C, marketplace, kemitraan institusi perpustakaan/universitas, serta peluncuran produk pengetahuan PT Cakrawala Magna Scientia.',
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
    badge: 'EDITORIAL TEAM',
    department: 'Divisi Penerbitan Ilmiah',
    type: 'Penuh Waktu (Full-time)',
    location: 'Jakarta Pusat / Hybrid',
    deadline: '31 Oktober 2026',
    description: 'Menyunting naskah monografi akademik bidang perpajakan, keuangan negara, dan hukum tata kelola.',
    requirements: [
      'Minimal S2 Ilmu Hukum, Perpajakan, atau Akuntansi.',
      'Pengalaman minimal 3 tahun sebagai editor buku monografi atau jurnal terakreditasi SINTA/Scopus.',
      'Menguasai gaya selingkung APA 7th, Chicago Manual, dan sitasi digital (Zotero/Mendeley).'
    ],
    email: 'hrd@cakranexa.com',
    emailSubject: 'Lamaran Senior Editor – [Nama Anda]',
    isActive: true,
    order: 4
  },
  {
    id: 'car-2',
    title: 'Book Production Specialist & Typographer (InDesign UNESCO B5)',
    badge: 'CREATIVE & GRAPHIC',
    department: 'Divisi Desain & Produksi Grafis',
    type: 'Penuh Waktu (Full-time)',
    location: 'Jakarta Pusat / Remote',
    deadline: '15 November 2026',
    description: 'Merancang tata letak interior buku akademik dan desain sampul 3D berstandar peradaban literasi.',
    requirements: [
      'Keahlian tingkat mahir dalam Adobe InDesign, Photoshop, dan Illustrator.',
      'Portofolio desain cover buku 3D mewah dan layout buku teks minimal 200 halaman.',
      'Memahami standar pracetak cetak offset dan digital bookpaper.'
    ],
    email: 'hrd@cakranexa.com',
    emailSubject: 'Lamaran Typographer & Layout Specialist – [Nama Anda]',
    isActive: true,
    order: 5
  },
  {
    id: 'car-3',
    title: 'Academic Community & Institutional Sales Specialist',
    badge: 'PARTNERSHIP',
    department: 'Divisi Kemitraan & Perpustakaan',
    type: 'Penuh Waktu (Full-time)',
    location: 'Jabodetabek',
    deadline: '30 November 2026',
    description: 'Menjalin kolaborasi strategis dengan perpustakaan universitas dan institusi riset nasional.',
    requirements: [
      'Pengalaman menjalin kemitraan pengadaan buku dengan perpustakaan universitas dan lembaga negara.',
      'Komunikasi persuasif, pemahaman tentang katalog ISBN nasional dan e-Katalog LKPP.'
    ],
    email: 'hrd@cakranexa.com',
    emailSubject: 'Lamaran Institutional Sales – [Nama Anda]',
    isActive: true,
    order: 6
  }
];

// Field lowongan yang ditampilkan dan punya terjemahan (career.json: jobs.<id> dan cmsJobs.<id>).
type JobTextField = 'title' | 'badge' | 'department' | 'type' | 'location' | 'deadline' | 'tagline' | 'quote' | 'description' | 'emailSubject';
type JobListField = 'responsibilities' | 'requirements' | 'benefits';
type JobCopy = Partial<Pick<CareerItem, JobTextField | JobListField>>;
type JobCopyMap = Record<string, JobCopy | undefined>;

const JOB_TEXT_FIELDS: JobTextField[] = ['title', 'badge', 'department', 'type', 'location', 'deadline', 'tagline', 'quote', 'description', 'emailSubject'];
const JOB_LIST_FIELDS: JobListField[] = ['responsibilities', 'requirements', 'benefits'];

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

export const CareerView: React.FC<CareerViewProps> = ({ siteContent: initialContent }) => {
  const { t } = useTranslation('career');
  const cmsText = useCmsText();
  const [currentContent, setCurrentContent] = useState<SiteContentSettings | undefined>(initialContent);

  React.useEffect(() => {
    setCurrentContent(initialContent);
  }, [initialContent]);

  React.useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) {
        setCurrentContent(e.detail);
      }
    };
    window.addEventListener('cakranexa_content_updated', handleUpdate);
    window.addEventListener('cakranexa_site_content_updated', handleUpdate);
    return () => {
      window.removeEventListener('cakranexa_content_updated', handleUpdate);
      window.removeEventListener('cakranexa_site_content_updated', handleUpdate);
    };
  }, []);

  // Combine careers from currentContent with fallback enrichment for the top managerial positions
  const jobs: CareerItem[] = React.useMemo(() => {
    const raw = currentContent?.careers || [];
    if (raw.length === 0) return DEFAULT_TOP_CAREERS;

    // Merge each item from raw with default fields if matching
    const enriched = raw.map((item) => {
      const defaultMatch = DEFAULT_TOP_CAREERS.find((d) => d.id === item.id);
      return defaultMatch ? { ...defaultMatch, ...item } : item;
    });

    // Ensure all 3 top managerial positions are present
    const topIds = ['car-mgr-publishing', 'car-mgr-marketing', 'car-mgr-percetakan'];
    const missingTop = DEFAULT_TOP_CAREERS.filter(
      (d) => topIds.includes(d.id) && !enriched.some((item) => item.id === d.id)
    );

    return [...missingTop, ...enriched];
  }, [currentContent?.careers]);

  const [activeFilter, setActiveFilter] = useState<'all' | 'managerial' | 'editorial' | 'marketing' | 'percetakan'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>('car-mgr-publishing'); // Expand the first by default

  const handleCopyEmail = (email: string, jobId: string) => {
    navigator.clipboard.writeText(email);
    setCopiedId(jobId);
    setTimeout(() => {
      setCopiedId(null);
    }, 2500);
  };

  const filteredJobs = jobs.filter((job) => {
    // Only display active jobs on public page
    if (job.isActive === false) return false;

    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (job.location && job.location.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFilter === 'managerial') {
      return job.id.startsWith('car-mgr') || job.title.toLowerCase().includes('manajer') || job.title.toLowerCase().includes('manager');
    }
    if (activeFilter === 'editorial') {
      return job.department.toLowerCase().includes('editorial') || job.department.toLowerCase().includes('penerbitan') || job.title.toLowerCase().includes('editor');
    }
    if (activeFilter === 'marketing') {
      return job.department.toLowerCase().includes('marketing') || job.department.toLowerCase().includes('pemasaran') || job.department.toLowerCase().includes('kemitraan');
    }
    if (activeFilter === 'percetakan') {
      return job.department.toLowerCase().includes('percetakan') || job.department.toLowerCase().includes('produksi') || job.department.toLowerCase().includes('desain');
    }
    return true;
  });

  // Filter & pencarian di atas tetap memakai data asli (Bahasa Indonesia). Untuk tampilan: teks yang masih sama
  // dengan bawaan (DEFAULT_TOP_CAREERS / DEFAULT_SITE_CONTENT) diambil dari file terjemahan; teks ubahan admin apa adanya.
  const jobCopy = t('jobs', { returnObjects: true }) as JobCopyMap;
  const cmsJobCopy = t('cmsJobs', { returnObjects: true }) as JobCopyMap;

  const localizeJob = (job: CareerItem): CareerItem => {
    const variants: Array<[CareerItem | undefined, JobCopy | undefined]> = [
      [DEFAULT_TOP_CAREERS.find((d) => d.id === job.id), jobCopy?.[job.id]],
      [DEFAULT_SITE_CONTENT.careers.find((d) => d.id === job.id), cmsJobCopy?.[job.id]]
    ];
    const localized: CareerItem = { ...job };
    for (const field of JOB_TEXT_FIELDS) {
      const value = job[field];
      if (!value) continue;
      const match = variants.find(([source, copy]) => source?.[field] === value && typeof copy?.[field] === 'string');
      if (match) localized[field] = cmsText(value, value, match[1]![field]!);
    }
    for (const field of JOB_LIST_FIELDS) {
      const value = job[field];
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

  return (
    <div id="career-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 text-left space-y-12">
      {/* 1. Header Banner */}
      <div className="bg-[#0F172A] text-white rounded-3xl p-8 sm:p-12 relative overflow-hidden border border-[#DFBF64]/30 shadow-2xl">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#DFBF64]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DFBF64]/20 border border-[#DFBF64]/40 text-[#DFBF64] text-xs font-semibold tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('hero.eyebrow')}</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight tracking-tight text-slate-100">
            <Trans t={t} i18nKey="hero.title" components={{ accent: <span className="text-[#DFBF64]" /> }} />
          </h1>

          <p className="text-slate-300 text-sm sm:text-base font-light leading-relaxed">
            {t('hero.description')}
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-300">
            <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <Building2 className="w-3.5 h-3.5 text-[#DFBF64]" />
              <span>PT Cakrawala Magna Scientia</span>
            </span>
            <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('hero.deadline')}</span>
            </span>
            <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
              <span>hrd@cakranexa.com</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Top 3 Highlight Announcement Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-slate-50 border border-[#DFBF64]/30 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-[#0F172A] text-[#DFBF64] rounded-xl flex-shrink-0 mt-0.5">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span>{t('highlight.title')}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#DFBF64] text-slate-950 uppercase">
                {t('highlight.priority')}
              </span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              <Trans t={t} i18nKey="highlight.positions" components={{ strong: <strong /> }} />
            </p>
          </div>
        </div>
        <a
          href="#job-car-mgr-publishing"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F172A] hover:bg-slate-800 text-[#DFBF64] text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <span>{t('highlight.cta')}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-[#0F172A] text-[#DFBF64] shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t('filters.all', { total: jobs.length })}
          </button>
          <button
            onClick={() => setActiveFilter('managerial')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'managerial'
                ? 'bg-[#0F172A] text-[#DFBF64] shadow-xs'
                : 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100'
            }`}
          >
            <Sparkles className="w-3 h-3 text-[#DFBF64]" />
            <span>{t('filters.managerial')}</span>
          </button>
          <button
            onClick={() => setActiveFilter('editorial')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === 'editorial'
                ? 'bg-[#0F172A] text-[#DFBF64] shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t('filters.editorial')}
          </button>
          <button
            onClick={() => setActiveFilter('marketing')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === 'marketing'
                ? 'bg-[#0F172A] text-[#DFBF64] shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t('filters.marketing')}
          </button>
          <button
            onClick={() => setActiveFilter('percetakan')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === 'percetakan'
                ? 'bg-[#0F172A] text-[#DFBF64] shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t('filters.printing')}
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('filters.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#0F172A]"
          />
        </div>
      </div>

      {/* 4. Job Listings Stack */}
      <div className="space-y-6">
        {filteredJobs.map((rawJob, idx) => {
          const job = localizeJob(rawJob);
          const isTop3 = idx < 3 && (job.id.startsWith('car-mgr') || job.id === 'car-mgr-publishing' || job.id === 'car-mgr-marketing' || job.id === 'car-mgr-percetakan');
          const isExpanded = expandedId === job.id;
          const emailTarget = job.email || 'hrd@cakranexa.com';
          const emailSubject = job.emailSubject || t('apply.defaultSubject', { title: job.title });
          const mailtoLink = `mailto:${emailTarget}?subject=${encodeURIComponent(emailSubject)}`;

          return (
            <div
              key={job.id}
              id={`job-${job.id}`}
              className={`rounded-2xl transition-all text-left overflow-hidden ${
                isTop3
                  ? 'bg-white border-2 border-[#DFBF64]/70 shadow-md hover:shadow-lg'
                  : 'bg-white border border-slate-200 shadow-xs hover:border-slate-300'
              }`}
            >
              {/* Top Accent Ribbon for Top 3 Jobs */}
              {isTop3 && (
                <div className="bg-[#0F172A] text-[#DFBF64] px-5 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-[#DFBF64]/30">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#DFBF64] text-[#0F172A] text-[11px] font-black flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {job.badge || t('job.fallbackBadge')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-slate-300">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      <span><Trans t={t} i18nKey="job.deadlineHighlighted" values={{ date: job.deadline }} components={{ strong: <strong className="text-[#DFBF64]" /> }} /></span>
                    </span>
                  </div>
                </div>
              )}

              <div className="p-6 sm:p-8 space-y-6">
                {/* Header Row */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${
                        isTop3 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {job.type}
                      </span>
                      <span className="text-xs text-slate-600 font-semibold flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {job.department}
                      </span>
                    </div>

                    <h2 className="font-serif font-bold text-xl sm:text-2xl text-slate-900">
                      {job.title}
                    </h2>

                    {job.tagline && (
                      <p className="text-xs sm:text-sm font-medium text-[#B89230] italic">
                        "{job.tagline}"
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#B89230]" />
                        <span>{job.location}</span>
                      </span>
                      {!isTop3 && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{t('job.deadline', { date: job.deadline })}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Primary CTA Button on Right */}
                  <div className="flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-2.5 flex-shrink-0">
                    <a
                      href={mailtoLink}
                      className="px-5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-[#DFBF64] font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer group"
                    >
                      <span>{t('job.apply')}</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : job.id)}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>{isExpanded ? t('job.hideDetails') : t('job.showDetails')}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Company Quote / Mission Statement from Poster */}
                {job.quote && (
                  <div className="p-4 rounded-xl bg-slate-50 border-l-4 border-[#DFBF64] text-xs sm:text-sm text-slate-700 italic leading-relaxed">
                    "{job.quote}"
                  </div>
                )}

                {/* Role Description */}
                {job.description && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block">
                      {t('job.about')}
                    </span>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {job.description}
                    </p>
                  </div>
                )}

                {/* Detailed Responsibilities & Requirements Grid (Expandable or always visible for Top 3) */}
                <div className={`${isExpanded ? 'block' : 'hidden md:block'} pt-2 space-y-6`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                    {/* Responsibilities Column (if available) */}
                    {job.responsibilities && job.responsibilities.length > 0 && (
                      <div className="space-y-3 bg-slate-50/70 p-4 sm:p-5 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2 text-slate-900">
                          <div className="p-1.5 bg-[#0F172A] text-[#DFBF64] rounded-md">
                            <Briefcase className="w-4 h-4" />
                          </div>
                          <h3 className="font-serif font-bold text-sm">{t('job.responsibilities')}</h3>
                        </div>
                        <ul className="space-y-2 text-xs text-slate-700">
                          {job.responsibilities.map((resp, rIdx) => (
                            <li key={rIdx} className="flex items-start gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-[#B89230] flex-shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{resp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Requirements Column */}
                    <div className="space-y-3 bg-slate-50/70 p-4 sm:p-5 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2 text-slate-900">
                        <div className="p-1.5 bg-[#0F172A] text-[#DFBF64] rounded-md">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <h3 className="font-serif font-bold text-sm">{t('job.requirements')}</h3>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-700">
                        {(job.requirements || []).map((req, rIdx) => (
                          <li key={rIdx} className="flex items-start gap-2.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Benefits Column (if available, e.g. for Percetakan) */}
                  {job.benefits && job.benefits.length > 0 && (
                    <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-r from-amber-500/10 to-slate-50 border border-amber-200/80 space-y-3">
                      <div className="flex items-center gap-2 text-slate-900">
                        <Award className="w-4 h-4 text-[#B89230]" />
                        <h4 className="font-serif font-bold text-xs sm:text-sm uppercase tracking-wider text-slate-900">
                          {t('job.benefits')}
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                        {job.benefits.map((ben, bIdx) => (
                          <div key={bIdx} className="flex items-center gap-2 bg-white/80 px-3 py-2 rounded-lg border border-amber-200/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#B89230]"></span>
                            <span className="font-medium">{ben}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* How to Apply Section */}
                  <div className="p-5 rounded-xl bg-[#0F172A] text-white border border-[#DFBF64]/40 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[#DFBF64]" />
                        <span className="text-xs font-bold tracking-wider uppercase text-[#DFBF64]">
                          {t('apply.title')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">
                        {t('apply.instructions')}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <span className="text-sm font-mono font-bold text-white bg-slate-800/90 px-3 py-1 rounded-md border border-slate-700">
                          {emailTarget}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyEmail(emailTarget, job.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
                        >
                          {copiedId === job.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">{t('apply.copied')}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>{t('apply.copy')}</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        <Trans t={t} i18nKey="apply.suggestedSubject" values={{ subject: emailSubject }} components={{ strong: <strong className="text-slate-200 font-mono" /> }} />
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto flex-shrink-0">
                      <a
                        href={mailtoLink}
                        className="px-5 py-2.5 rounded-xl bg-[#DFBF64] hover:bg-[#C5A059] text-slate-950 font-bold text-xs transition-all text-center flex items-center justify-center gap-2 shadow-md cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>{t('apply.sendEmail')}</span>
                      </a>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 italic text-center sm:text-left">
                    <Trans t={t} i18nKey="apply.note" values={{ date: job.deadline }} components={{ strong: <strong /> }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. General Candidate Contact & Submission Note */}
      <div className="bg-slate-100 rounded-2xl p-6 sm:p-8 border border-slate-300/80 text-center space-y-3">
        <h3 className="font-serif font-bold text-base sm:text-lg text-slate-900">
          {t('footer.title')}
        </h3>
        <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed">
          <Trans
            t={t}
            i18nKey="footer.body"
            components={{ email: <a href="mailto:hrd@cakranexa.com" className="text-[#0F172A] font-bold underline hover:text-[#B89230]" /> }}
          />
        </p>
      </div>
    </div>
  );
};
