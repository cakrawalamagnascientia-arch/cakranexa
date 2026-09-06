import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  Target, 
  Users, 
  Award, 
  CheckCircle2, 
  FileCheck,
  BookOpen,
  GraduationCap,
  KeyRound,
  Building,
  Cpu,
  UserCheck,
  Sparkles,
  ArrowRight,
  ArrowDown,
  RefreshCw,
  Scale,
  Database,
  FileSpreadsheet,
  Compass,
  Layers,
  Search,
  HeartHandshake,
  Shield,
  BookMarked,
  Eye,
  Briefcase
} from 'lucide-react';
import { SubSection, SiteContentSettings } from '../types';
import { getStoredSiteContent } from '../services/siteContentService';

interface TentangKamiViewProps {
  initialSubSection?: SubSection;
  siteContent?: SiteContentSettings;
}

export const TentangKamiView: React.FC<TentangKamiViewProps> = ({ initialSubSection, siteContent: propContent }) => {
  const [content, setContent] = useState<SiteContentSettings>(() => propContent || getStoredSiteContent());

  useEffect(() => {
    if (propContent) {
      setContent(propContent);
    }
  }, [propContent]);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) {
        setContent(e.detail);
      }
    };
    window.addEventListener('cakranexa_content_updated', handleUpdate);
    return () => window.removeEventListener('cakranexa_content_updated', handleUpdate);
  }, []);

  const creds = content.companyCredentials || {
    kemenkumham: '',
    kemenkumhamNote: 'Akta Notaris & SK Pengesahan Menkumham RI',
    nib: '',
    nibNote: 'KBLI 58111 (Penerbitan Buku) & KBLI 58130',
    npwp: '',
    npwpNote: 'KPP Pratama Jakarta Pusat • PKP Terdaftar',
    keanggotaanPenerbit: '',
    keanggotaanPenerbitNote: 'Ikatan Penerbit Indonesia (IKAPI) & Afiliasi Perpusnas RI'
  };

  const [activeTab, setActiveTab] = useState<string>(
    initialSubSection === 'visi-misi' ? 'visi'
    : initialSubSection === 'tim' ? 'tim'
    : initialSubSection === 'legalitas' ? 'legalitas'
    : 'profil'
  );

  return (
    <div id="tentang-kami-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 text-left space-y-12">
      
      {/* SECTION 1: HERO COMPANY PROFILE */}
      <div className="bg-[#0F172A] text-white rounded-3xl p-8 sm:p-12 lg:p-14 relative overflow-hidden border border-[#DFBF64]/30 shadow-2xl">
        {/* Subtle geometric gold accent */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-gradient-to-br from-[#DFBF64]/10 via-[#D4AF37]/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 bg-slate-800/40 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DFBF64]/15 border border-[#DFBF64]/30 text-[#DFBF64] text-[11px] font-bold tracking-widest uppercase">
            <Building2 className="w-3.5 h-3.5" />
            <span>TENTANG PT CAKRAWALA MAGNA SCIENTIA</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight tracking-tight text-white">
            Menerbitkan Pengetahuan, <br className="hidden sm:inline" />
            <span className="text-[#DFBF64]">Membangun Warisan Keilmuan.</span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base md:text-lg font-light leading-relaxed max-w-3xl">
            PT Cakrawala Magna Scientia adalah perusahaan pengetahuan (<em>knowledge enterprise</em>) Indonesia yang mengembangkan ekosistem penerbitan, pengelolaan karya, pembelajaran, dan pengembangan aset intelektual berbasis teknologi melalui <strong>CakraNexa</strong>.
          </p>

          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-3xl">
            Kami hadir untuk membangun siklus hidup pengetahuan yang berkelanjutan—mulai dari akuisisi gagasan, penerbitan, perlindungan hak cipta, hingga adaptasi lintas generasi.
          </p>

          {/* Social Proof & Metrics Anchor */}
          <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 border-t border-slate-800/80">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] block uppercase tracking-wider font-semibold">Portofolio Buku</span>
              <strong className="text-white font-serif text-lg sm:text-xl block text-[#DFBF64]">21+ Monografi</strong>
              <span className="text-slate-400 text-[10px]">ISBN Resmi Perpusnas RI</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] block uppercase tracking-wider font-semibold">Status Penerbit</span>
              <strong className="text-white font-serif text-lg sm:text-xl block text-[#DFBF64]">
                {creds.keanggotaanPenerbit ? 'Anggota IKAPI' : 'Penerbit Resmi'}
              </strong>
              <span className="text-slate-400 text-[10px]">
                {creds.keanggotaanPenerbit || '-'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] block uppercase tracking-wider font-semibold">Standar Etika</span>
              <strong className="text-white font-serif text-lg sm:text-xl block text-[#DFBF64]">COPE Standard</strong>
              <span className="text-slate-400 text-[10px]">Peer-Review Otoritatif</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] block uppercase tracking-wider font-semibold">Model Ekosistem</span>
              <strong className="text-white font-serif text-lg sm:text-xl block text-[#DFBF64]">IP Ecosystem</strong>
              <span className="text-slate-400 text-[10px]">Multi-Format & Digital</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 bg-slate-50 rounded-xl p-1.5 overflow-x-auto gap-1 shadow-2xs">
        {[
          { id: 'profil', label: 'Profil Perusahaan & Ekosistem' },
          { id: 'visi', label: 'Visi & Misi' },
          { id: 'tim', label: 'Struktur Organisasi' },
          { id: 'legalitas', label: 'Legalitas & Dokumen Resmi' },
        ].map((tab) => (
          <button
            key={tab.id}
            id={`tentang-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`py-2.5 px-5 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#0F172A] text-[#DFBF64] shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. PROFIL PERUSAHAAN & EKOSISTEM (MAIN COMPREHENSIVE VIEW) */}
      {activeTab === 'profil' && (
        <div className="space-y-12">
          
          {/* SECTION 2: VISI ELEVATOR & DIFFERENTIATOR */}
          <section className="bg-gradient-to-r from-amber-50/70 via-white to-slate-50 rounded-3xl border border-amber-200/70 p-8 sm:p-12 shadow-xs">
            <div className="max-w-4xl space-y-4">
              <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                VISI ELEVATOR &amp; DIFFERENTIATOR
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 leading-snug">
                Mengelola Karya sebagai Portofolio Jangka Panjang
              </h2>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-normal">
                Kami percaya bahwa nilai sebuah pengetahuan akan terus bertumbuh apabila dikelola dengan integritas, teknologi, dan tata kelola yang tepat.
              </p>
              <div className="p-5 rounded-2xl bg-white border border-amber-200/90 shadow-2xs">
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                  Melalui <strong>CakraNexa</strong>, satu buah karya tidak berhenti pada bentuk buku fisik—tetapi terus berkembang menjadi <strong>e-book, audiobook, modul pelatihan, toolkit, lisensi institusional, hingga database terintegrasi</strong>.
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 3: RUANG LINGKUP KEGIATAN (GRID 3x2) */}
          <section className="space-y-6">
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                PORTFOLIO OF CAPABILITIES
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
                Ruang Lingkup Kegiatan
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
                Enam pilar operasional CakraNexa dalam menyokong diseminasi dan monetisasi karya intelektual akademik maupun profesional.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Scope 1 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-slate-900 text-base">
                  Penerbitan &amp; Publikasi Digital
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Akuisisi naskah, editorial, desain, metadata bibliografis, publikasi cetak, e-book, dan pengelolaan katalog.
                </p>
              </div>

              {/* Scope 2 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-slate-900 text-base">
                  Pendidikan &amp; Pelatihan (Academy)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Pengembangan course, workshop, training, dan pembelajaran berbasis keahlian praktisi serta akademisi.
                </p>
              </div>

              {/* Scope 3 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-slate-900 text-base">
                  Rights &amp; IP Licensing
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Pengelolaan hak terjemahan, audio, adaptasi, lisensi perpustakaan, dan pemanfaatan karya secara sah.
                </p>
              </div>

              {/* Scope 4 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center">
                  <Building className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-slate-900 text-base">
                  Institutional Solutions
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Kemitraan strategis dengan institusi pendidikan, organisasi profesi, perusahaan, dan perpustakaan.
                </p>
              </div>

              {/* Scope 5 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-slate-900 text-base">
                  Knowledge Technology
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Penerapan structured data, keterlacakan (discoverability), analitik, dan kecerdasan buatan (AI) yang bertanggung jawab.
                </p>
              </div>

              {/* Scope 6 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-slate-900 text-base">
                  Author Development
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Pembinaan dan koordinasi jangka panjang bersama penulis untuk pengembangan karier ilmiah.
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 4: SIKLUS HIDUP KARYA (STEPPER PROCESS) */}
          <section className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 border border-slate-800 shadow-xl space-y-8">
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-widest text-[#DFBF64] font-bold block">
                CYCLICAL PUBLISHING PROCESS
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white">
                Siklus Hidup Karya (Lifecycle)
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                Alur sirkular terukur yang memastikan setiap karya tidak hanya berhenti setelah cetak, namun terus dirawat dan diperluas nilainya.
              </p>
            </div>

            {/* Stepper Diagram (Loop: 01-04 Forward, 05-08 Backward/Return) */}
            <div className="space-y-4">
              {/* Row 1: Forward 01 -> 04 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { num: '01', name: 'Gagasan', desc: 'Akuisisi ide & proposal riset' },
                  { num: '02', name: 'Seleksi', desc: 'Penelaahan dewan pakar' },
                  { num: '03', name: 'Editorial', desc: 'Proofreading & telaah sitasi' },
                  { num: '04', name: 'Produksi', desc: 'Tata letak B5 & ISBN resmi' },
                ].map((step, idx) => (
                  <div key={idx} className="relative p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-[#DFBF64] block mb-1">{step.num}</span>
                      <strong className="text-white text-sm block font-serif">{step.name}</strong>
                      <span className="text-[11px] text-slate-400 block mt-1">{step.desc}</span>
                    </div>
                    {idx < 3 && (
                      <div className="hidden sm:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-4 h-4 rounded-full bg-[#DFBF64] text-slate-950 items-center justify-center text-[10px]">
                        ➔
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Loop connector */}
              <div className="flex justify-end pr-8 sm:pr-14 text-[#DFBF64]">
                <div className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-slate-800 border border-slate-700">
                  <span>Alur Siklus Lanjutan</span>
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Row 2: Continued Loop 08 <- 07 <- 06 <- 05 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { num: '08', name: 'Pembaruan', desc: 'Edisi revisi & update riset' },
                  { num: '07', name: 'Lisensi', desc: 'Audio, transkrip & institusi' },
                  { num: '06', name: 'Distribusi', desc: 'E-Commerce, kampus & perpustakaan' },
                  { num: '05', name: 'Publikasi', desc: 'Rilis resmi & serah simpan' },
                ].map((step, idx) => (
                  <div key={idx} className="relative p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-[#DFBF64] block mb-1">{step.num}</span>
                      <strong className="text-white text-sm block font-serif">{step.name}</strong>
                      <span className="text-[11px] text-slate-400 block mt-1">{step.desc}</span>
                    </div>
                    {idx > 0 && (
                      <div className="hidden sm:flex absolute -left-2 top-1/2 -translate-y-1/2 z-10 w-4 h-4 rounded-full bg-[#DFBF64] text-slate-950 items-center justify-center text-[10px]">
                        ◄
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Stepper Summary Quote */}
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-[#DFBF64] shrink-0" />
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                <strong>CakraNexa</strong> merawat karya yang telah diterbitkan melalui pembaruan metadata, edisi revisi, lisensi baru, dan perluasan jangkauan pembaca lintas generasi.
              </p>
            </div>
          </section>

          {/* SECTION 5: INTEGRITAS, HAKI, DAN TATA KELOLA */}
          <section className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-xs space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-widest text-emerald-700 font-bold block">
                  GOVERNANCE &amp; ETHICS
                </span>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">
                  Perlindungan Hak Cipta &amp; Integritas Penerbitan
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Scale className="w-4 h-4 text-[#B89628]" />
                  <h4>Penghormatan Hak Cipta (HAKI)</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-normal">
                  Seluruh pemanfaatan karya untuk terjemahan, digitalisasi, maupun teknologi AI dilakukan secara transparan berdasarkan perjanjian legal yang sah.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <FileCheck className="w-4 h-4 text-[#B89628]" />
                  <h4>Integritas Editorial</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-normal">
                  Kami menyoroti orisinalitas karya, etika penulisan, dan verifikasi rujukan untuk menjaga standar publikasi akademik &amp; profesional.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Database className="w-4 h-4 text-[#B89628]" />
                  <h4>Keberlanjutan Institusional</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-normal">
                  Dokumentasi, file sumber, metadata, dan kontrak dikelola secara terpusat sebagai aset institusional agar karya terjamin ketersediaannya secara berkelanjutan.
                </p>
              </div>
            </div>
          </section>

          {/* Legal Entity Anchor Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">Nama Entitas Resmi</span>
              <strong className="text-slate-900 font-serif text-sm block mt-0.5">PT CAKRAWALA MAGNA SCIENTIA</strong>
              <span className="text-slate-500 text-[11px]">Badan Hukum Perseroan Terbatas</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">Brand Penerbitan &amp; Platform</span>
              <strong className="text-[#B89628] font-serif text-sm block mt-0.5">CakraNexa Publishing</strong>
              <span className="text-slate-500 text-[11px]">Knowledge Enterprise Ecosystem</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">Kedudukan Operasional</span>
              <strong className="text-slate-900 text-sm block mt-0.5">DKI Jakarta, Indonesia</strong>
              <span className="text-slate-500 text-[11px]">Salemba Raya, Jakarta Pusat</span>
            </div>
          </div>

        </div>
      )}

      {/* 2. VISI & MISI */}
      {activeTab === 'visi' && (
        <div className="space-y-12">
          
          {/* Header Card: Menerbitkan Pengetahuan, Membangun Warisan */}
          <section className="bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white rounded-3xl p-8 sm:p-12 border border-[#DFBF64]/40 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-[#DFBF64]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-4xl space-y-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DFBF64]/15 border border-[#DFBF64]/30 text-[#DFBF64] text-[11px] font-bold tracking-widest uppercase">
                <Compass className="w-3.5 h-3.5" />
                <span>ARAH &amp; FUNDAMEN KEILMUAN</span>
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
                Menerbitkan Pengetahuan, Membangun Warisan
              </h2>
              <p className="text-sm sm:text-base text-slate-300 font-light leading-relaxed">
                PT Cakrawala Magna Scientia membangun ekosistem pengetahuan yang tidak berhenti pada penerbitan. Kami mengelola pengetahuan sepanjang siklus hidupnya—dari gagasan, penerbitan, pembelajaran, pembaruan, perlindungan hak, pengembangan lintas format, hingga pewarisannya kepada generasi mendatang.
              </p>
            </div>
          </section>

          {/* Visi Kami */}
          <section className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center shrink-0">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                  PANDANGAN MASA DEPAN
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
                  Visi Kami
                </h3>
              </div>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl bg-slate-50 border border-slate-200/90 text-slate-800 shadow-2xs">
              <p className="font-serif text-base sm:text-lg lg:text-xl text-slate-900 leading-relaxed italic font-medium">
                &ldquo;Menjadi perusahaan pengetahuan Indonesia berkelas dunia yang membangun warisan intelektual lintas generasi dengan menjadikan setiap karya sebagai aset pengetahuan yang dapat ditemukan, dipercaya, dipelajari, diperbarui, dilindungi, dikembangkan, dilisensikan, dan diwariskan secara berkelanjutan.&rdquo;
              </p>
            </div>
          </section>

          {/* Misi Kami (01 s.d 08) */}
          <section className="space-y-6">
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                DELAPAN KOMITMEN STRATEGIS
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
                Misi
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
                Langkah-langkah operasional yang konsisten dijalankan untuk mengaktualisasikan visi keilmuan CakraNexa.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                {
                  num: '01',
                  title: 'Penerbitan Berkualitas',
                  desc: 'Menerbitkan karya yang bermutu, kredibel, relevan, dan berdampak melalui proses seleksi, penyuntingan, produksi, publikasi, dan penjaminan mutu yang profesional dan dapat dipertanggungjawabkan.'
                },
                {
                  num: '02',
                  title: 'Pengetahuan yang Terus Hidup',
                  desc: 'Memperbarui substansi, data, referensi, metadata, desain, dan format karya agar pengetahuan tetap relevan bagi perkembangan zaman dan generasi pembaca berikutnya.'
                },
                {
                  num: '03',
                  title: 'Pengembangan Multiformat',
                  desc: 'Mengembangkan setiap karya menjadi portofolio pengetahuan multiformat yang dapat mencakup buku cetak, e-book, audiobook, course, toolkit, database, terjemahan, adaptasi, serta lisensi institusional dan teknologi.'
                },
                {
                  num: '04',
                  title: 'Akses dan Discoverability',
                  desc: 'Memperluas keterlihatan serta keterjangkauan karya dan penulis melalui metadata berkualitas, structured data, sistem pencarian, kategori, seri, editorial content, semantic search, dan teknologi rekomendasi.'
                },
                {
                  num: '05',
                  title: 'Ekosistem Penulis, Pembaca, dan Institusi',
                  desc: 'Membangun hubungan jangka panjang dengan penulis, pembaca, profesional, akademisi, perpustakaan, lembaga pendidikan, korporasi, reseller, dan mitra strategis.'
                },
                {
                  num: '06',
                  title: 'Perlindungan Aset Intelektual',
                  desc: 'Melindungi dan mengelola hak cipta, hak penerbitan, hak terjemahan, audio, adaptasi, lisensi digital, lisensi AI, kontrak, provenance, metadata, file sumber, dan aset intelektual lainnya secara bertanggung jawab.'
                },
                {
                  num: '07',
                  title: 'Teknologi dan Data',
                  desc: 'Memanfaatkan teknologi, data, analitik, otomatisasi, dan kecerdasan buatan secara bertanggung jawab untuk meningkatkan kualitas, efisiensi, akses, pengambilan keputusan, dan keberlanjutan perusahaan.'
                },
                {
                  num: '08',
                  title: 'Tata Kelola dan Regenerasi',
                  desc: 'Membangun tata kelola, dokumentasi, sistem, regenerasi kepemimpinan, dan pengembangan talenta agar perusahaan dapat berkembang lintas generasi tanpa ketergantungan pada satu individu, vendor, platform, atau teknologi.'
                }
              ].map((misi, idx) => (
                <div 
                  key={idx} 
                  className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-[#B89628] font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      {misi.num}
                    </span>
                    <h4 className="font-serif font-bold text-slate-900 text-base">
                      {misi.title}
                    </h4>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal pl-10">
                    {misi.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Nilai yang Menuntun Kami */}
          <section className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 border border-slate-800 shadow-xl space-y-8">
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-widest text-[#DFBF64] font-bold block">
                CORE VALUES
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-white">
                Nilai yang Menuntun Kami
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                Prinsip yang menjadi dasar setiap keputusan, karya, kemitraan, dan inovasi CakraNexa.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  name: 'Integritas Intelektual',
                  desc: 'Menjunjung akurasi, kejujuran akademik, transparansi sumber, penghormatan terhadap hak cipta, dan tanggung jawab kepada pembaca.'
                },
                {
                  name: 'Keunggulan',
                  desc: 'Menetapkan standar tinggi dalam editorial, desain, produksi, teknologi, pemasaran, layanan penulis, dan pengalaman pembaca.'
                },
                {
                  name: 'Keberlanjutan Pengetahuan',
                  desc: 'Memperlakukan setiap karya sebagai aset intelektual yang dapat terus diperbarui, dikembangkan, dilisensikan, dan diwariskan.'
                },
                {
                  name: 'Keterjangkauan & Keterlihatan',
                  desc: 'Membuat pengetahuan yang bermutu semakin mudah ditemukan, diakses, dipahami, dan dimanfaatkan.'
                },
                {
                  name: 'Kolaborasi',
                  desc: 'Membangun hubungan jangka panjang yang adil dan produktif dengan seluruh pemangku kepentingan dalam ekosistem pengetahuan.'
                },
                {
                  name: 'Inovasi Bertanggung Jawab',
                  desc: 'Menggunakan teknologi, data, otomatisasi, dan AI untuk memperkuat kualitas dan akses tanpa mengurangi integritas karya.'
                },
                {
                  name: 'Tata Kelola & Akuntabilitas',
                  desc: 'Menjadikan proses penting terdokumentasi, terukur, dapat diaudit, serta dilaksanakan berdasarkan kewenangan dan tanggung jawab yang jelas.'
                },
                {
                  name: 'Regenerasi',
                  desc: 'Memastikan pengetahuan, kompetensi, kepemimpinan, dan sistem perusahaan dapat diteruskan kepada generasi berikutnya.'
                }
              ].map((val, idx) => (
                <div key={idx} className="p-5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#DFBF64] shrink-0" />
                    <strong className="text-white text-sm font-serif">{val.name}</strong>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-light pl-6">
                    {val.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Pilar Strategis CakraNexa */}
          <section className="space-y-6">
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                STRATEGIC PILLARS
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
                Pilar Strategis CakraNexa
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
                Enam pilar operasional penopang keberlanjutan dan keunggulan ekosistem.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  title: 'Publishing Excellence',
                  desc: 'Membangun proses penerbitan profesional dari akuisisi naskah, editorial, desain, produksi, distribusi hingga evaluasi kinerja setiap judul.',
                  icon: BookOpen
                },
                {
                  title: 'Knowledge Lifecycle',
                  desc: 'Mengelola karya sepanjang siklus hidupnya: diterbitkan, dipasarkan, diperbarui, dialihformatkan, diterjemahkan, diajarkan, dan dilisensikan.',
                  icon: RefreshCw
                },
                {
                  title: 'Discoverability & Commerce',
                  desc: 'Memastikan karya dapat ditemukan dan diperoleh melalui metadata, search, structured data, kategori, seri, editorial content, serta kanal penjualan terintegrasi.',
                  icon: Search
                },
                {
                  title: 'Community & Learning',
                  desc: 'Membangun hubungan berkelanjutan dengan pembaca, penulis, profesional, akademisi, institusi, dan perpustakaan melalui komunitas dan pembelajaran.',
                  icon: Users
                },
                {
                  title: 'Rights & Intellectual Assets',
                  desc: 'Mengelola hak, kontrak, provenance, backlist, metadata, file sumber, terjemahan, audio, adaptasi, dan lisensi sebagai aset jangka panjang.',
                  icon: KeyRound
                },
                {
                  title: 'Institutional Continuity',
                  desc: 'Membangun sistem, dokumentasi, kaderisasi, data, tata kelola, keamanan, dan diversifikasi pendapatan agar perusahaan dapat berkembang lintas generasi.',
                  icon: Building2
                }
              ].map((pilar, idx) => {
                const IconComponent = pilar.icon;
                return (
                  <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center">
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <h4 className="font-serif font-bold text-slate-900 text-base">
                      {pilar.title}
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {pilar.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Closing Highlight Cards: Pengetahuan Bukan Sekadar Produk & Bersama Membangun Warisan Pengetahuan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="bg-gradient-to-br from-amber-50/80 to-white rounded-3xl border border-amber-200/90 p-7 sm:p-9 shadow-xs space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#B89628] block">
                MANIFESTO KNOWLEDGE ENTERPRISE
              </span>
              <h4 className="font-serif font-bold text-slate-900 text-lg sm:text-xl">
                Pengetahuan Bukan Sekadar Produk
              </h4>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
                PT Cakrawala Magna Scientia memandang setiap karya bukan sebagai produk sekali jual, melainkan sebagai aset pengetahuan jangka panjang. Sebuah buku dapat terus bertumbuh menjadi edisi baru, e-book, audiobook, course, toolkit, database, terjemahan, lisensi institusional, adaptasi, dan bentuk pemanfaatan pengetahuan lainnya. Karena itu, kami membangun sistem yang menjaga tidak hanya karya yang diterbitkan, tetapi juga metadata, kontrak, provenance, file sumber, hak kekayaan intelektual, hubungan dengan penulis, dan pengetahuan institusional yang menyertainya.
              </p>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl border border-slate-700/80 p-7 sm:p-9 shadow-md space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#DFBF64] block">
                  KOLABORASI &amp; SINERGI
                </span>
                <h4 className="font-serif font-bold text-white text-lg sm:text-xl">
                  Bersama Membangun Warisan Pengetahuan
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-light">
                  PT Cakrawala Magna Scientia membuka ruang kolaborasi bagi penulis, akademisi, profesional, institusi, perpustakaan, dan mitra yang memiliki komitmen yang sama untuk menghasilkan dan mewariskan pengetahuan yang bermakna.
                </p>
              </div>

              <div className="pt-2">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#DFBF64]/15 border border-[#DFBF64]/30 text-[#DFBF64] text-xs font-semibold">
                  <HeartHandshake className="w-4 h-4" />
                  <span>Kemitraan Jangka Panjang CakraNexa</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 3. STRUKTUR ORGANISASI */}
      {activeTab === 'tim' && (
        <div className="space-y-10">

          {/* Canvas Bagan Struktur Organisasi */}
          <section className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-10 lg:p-12 shadow-xs">
            
            {/* Header Judul Diagram */}
            <div className="text-center space-y-2 mb-10">
              <h3 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#0B1528] tracking-tight">
                Struktur Organisasi
              </h3>
              <div className="flex items-center justify-center gap-3 pt-1">
                <div className="h-[1.5px] w-12 sm:w-20 bg-[#D4AF37]" />
                <span className="text-xs sm:text-sm font-serif tracking-widest text-slate-700 font-medium uppercase">
                  PT Cakrawala Magna Scientia
                </span>
                <div className="h-[1.5px] w-12 sm:w-20 bg-[#D4AF37]" />
              </div>
            </div>

            {/* Diagram Tree (Scrollable di layar kecil agar rasio dan jalur garis tetap presisi) */}
            <div className="overflow-x-auto pb-6">
              <div className="min-w-[760px] max-w-5xl mx-auto flex flex-col items-center">

                {/* LEVEL 1: KOMISARIS */}
                <div className="flex flex-col items-center">
                  <div className="w-64 sm:w-72 bg-[#0B1528] border-2 border-[#D4AF37] rounded-2xl px-6 py-4 text-center shadow-md">
                    <h4 className="font-serif font-bold text-lg text-white tracking-wide">
                      Komisaris
                    </h4>
                    <div className="w-10 h-0.5 bg-[#D4AF37] mx-auto mt-2 rounded-full" />
                  </div>

                  {/* Garis Vertikal ke Direktur */}
                  <div className="w-0.5 h-8 bg-[#0B1528]" />
                </div>

                {/* LEVEL 2: DIREKTUR & DEWAN PAKAR */}
                <div className="relative flex items-center justify-center w-full">
                  {/* Direktur (Posisi Tengah) */}
                  <div className="flex flex-col items-center">
                    <div className="w-64 sm:w-72 bg-[#0B1528] border-2 border-[#D4AF37] rounded-2xl px-6 py-4 text-center shadow-md relative z-10">
                      <h4 className="font-serif font-bold text-lg text-white tracking-wide">
                        Direktur
                      </h4>
                      <div className="w-10 h-0.5 bg-[#D4AF37] mx-auto mt-2 rounded-full" />
                    </div>
                  </div>

                  {/* Dewan Pakar (Garis Koordinasi / Staf Penasihat di Sebelah Kanan) */}
                  <div className="absolute left-[calc(50%+136px)] sm:left-[calc(50%+148px)] flex items-center">
                    <div className="w-8 sm:w-16 border-t-2 border-dashed border-[#0A3E48]" />
                    <div className="w-40 sm:w-48 bg-[#0A3E48] border-2 border-[#D4AF37] rounded-2xl px-4 py-3.5 text-center shadow-md">
                      <h4 className="font-serif font-bold text-sm sm:text-base text-white tracking-wide">
                        Dewan Pakar
                      </h4>
                      <div className="w-8 h-0.5 bg-[#D4AF37] mx-auto mt-1.5 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Garis Vertikal dari Direktur ke Jalur Cabang Manajer */}
                <div className="w-0.5 h-8 bg-[#0B1528]" />

                {/* LEVEL 3: 5 MANAJER */}
                <div className="w-full max-w-4xl">
                  {/* Garis Horizontal Cabang (Menghubungkan kolom 1 hingga kolom 5 secara presisi) */}
                  <div className="relative w-full px-[10%]">
                    <div className="h-0.5 bg-[#0B1528] w-full" />
                  </div>

                  {/* 5 Kolom Manajer */}
                  <div className="grid grid-cols-5 gap-3 sm:gap-4">
                    {[
                      { title: 'Manajer Umum dan SDM' },
                      { title: 'Manajer Keuangan' },
                      { title: 'Manajer IT' },
                      { title: 'Manajer Publishing' },
                      { title: 'Manajer Percetakan' },
                    ].map((m, idx) => (
                      <div key={idx} className="flex flex-col items-center">
                        {/* Garis Cabang Turun ke Masing-Masing Kotak */}
                        <div className="w-0.5 h-6 bg-[#0B1528]" />

                        {/* Kotak Manajer */}
                        <div className="w-full bg-white border-2 border-[#0A3E48] rounded-2xl p-3 sm:p-4 min-h-[96px] sm:min-h-[104px] flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md transition-shadow">
                          <h5 className="font-serif font-bold text-xs sm:text-sm text-[#0B1528] leading-snug">
                            {m.title}
                          </h5>
                          <div className="w-6 h-0.5 bg-[#D4AF37] mx-auto mt-2 rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 text-center">
              <span className="text-[11px] text-slate-500 font-sans tracking-wide">
                Bagan Kepengurusan dan Lini Manajerial Resmi PT Cakrawala Magna Scientia
              </span>
            </div>
          </section>

          {/* Rincian Tanggung Jawab & Fungsi Organisasi */}
          <section className="space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                FUNGSI &amp; TANGGUNG JAWAB ORGANISASI
              </span>
              <h4 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">
                Deskripsi Tugas Kepengurusan
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  jabatan: 'Komisaris',
                  lingkup: 'Pengawasan & Tata Kelola',
                  uraian: 'Menjalankan fungsi pengawasan umum, meninjau kepatuhan anggaran, serta memastikan perseroan konsisten menerapkan prinsip tata kelola yang baik (Good Corporate Governance).'
                },
                {
                  jabatan: 'Direktur',
                  lingkup: 'Eksekutif & Operasional',
                  uraian: 'Memimpin implementasi visi, menetapkan arah operasional dan komersial, serta mengkoordinasikan seluruh lini manajerial dalam ekosistem penerbitan CakraNexa.'
                },
                {
                  jabatan: 'Dewan Pakar',
                  lingkup: 'Pertimbangan Keilmuan',
                  uraian: 'Badan penasihat independen yang memberikan pertimbangan substansi ilmiah, etika publikasi, kelayakan metodologi riset, dan penguatan mutu terbitan monografi.'
                },
                {
                  jabatan: 'Manajer Umum dan SDM',
                  lingkup: 'SDM & Administrasi',
                  uraian: 'Mengelola pengembangan talenta, administrasi hukum korporasi, hubungan kelembagaan eksternal, dan pengelolaan sarana prasarana operasional kantor.'
                },
                {
                  jabatan: 'Manajer Keuangan',
                  lingkup: 'Keuangan & Fiskal',
                  uraian: 'Mengelola perencanaan anggaran, arus kas, transparansi royalti penulis, kepatuhan perpajakan, serta akuntabilitas pelaporan keuangan perseroan.'
                },
                {
                  jabatan: 'Manajer IT',
                  lingkup: 'Teknologi & Sistem Data',
                  uraian: 'Mengembangkan infrastruktur platform digital CakraNexa, arsitektur pencarian semantik, manajemen metadata terstruktur, dan keamanan data perseroan.'
                },
                {
                  jabatan: 'Manajer Publishing',
                  lingkup: 'Editorial & Hak Kekayaan Intelektual',
                  uraian: 'Mengawal siklus penerbitan naskah, proses editorial, penelaahan substansi (peer-review), penjaminan mutu ilmiah, administrasi ISBN Perpusnas, dan tata kelola hak cipta.'
                },
                {
                  jabatan: 'Manajer Percetakan',
                  lingkup: 'Produksi Fisik & Rantai Pasok',
                  uraian: 'Mengatur operasional pra-cetak, pencetakan fisik, penjaminan kualitas jilid dan kertas, serta logistik pergudangan dan pengiriman buku secara terukur.'
                }
              ].map((item, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
                  <div className="border-b border-slate-100 pb-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#B89628] block">
                      {item.lingkup}
                    </span>
                    <h5 className="font-serif font-bold text-slate-900 text-sm mt-0.5">
                      {item.jabatan}
                    </h5>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-normal">
                    {item.uraian}
                  </p>
                </div>
              ))}
            </div>
          </section>

        </div>
      )}

      {/* 4. LEGALITAS */}
      {activeTab === 'legalitas' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm space-y-6 max-w-4xl">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <div>
              <h3 className="font-serif font-bold text-xl text-slate-900">
                Dokumen Legalitas &amp; Status Badan Hukum Resmi
              </h3>
              <p className="text-xs text-slate-500">
                PT Cakrawala Magna Scientia beroperasi secara sah berdasarkan hukum Republik Indonesia.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Pengesahan Kemenkumham RI</span>
              <strong className="text-slate-900 block font-mono text-sm">
                {creds.kemenkumham || '-'}
              </strong>
              <span className="text-slate-500 text-[11px]">
                {creds.kemenkumhamNote || 'Akta Notaris Pendirian Perseroan Terbatas'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Nomor Induk Berusaha (NIB)</span>
              <strong className="text-slate-900 block font-mono text-sm">
                {creds.nib || '-'}
              </strong>
              <span className="text-slate-500 text-[11px]">
                {creds.nibNote || 'KBLI 58111 (Penerbitan Buku) & KBLI 58130'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 text-[10px] uppercase font-bold">NPWP Perusahaan</span>
              <strong className="text-slate-900 block font-mono text-sm">
                {creds.npwp || '-'}
              </strong>
              <span className="text-slate-500 text-[11px]">
                {creds.npwpNote || 'KPP Pratama Jakarta Pusat • PKP Terdaftar'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Keanggotaan Penerbit Resmi</span>
              <strong className="text-slate-900 block font-mono text-sm">
                {creds.keanggotaanPenerbit || '-'}
              </strong>
              <span className="text-slate-500 text-[11px]">
                {creds.keanggotaanPenerbitNote || 'Ikatan Penerbit Indonesia & Afiliasi Perpusnas RI'}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
