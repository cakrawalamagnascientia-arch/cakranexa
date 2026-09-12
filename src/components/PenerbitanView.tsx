import React, { useState, useEffect, useRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import {
  BookOpen,
  FileText,
  CheckCircle2,
  ArrowRight,
  Clock,
  ShieldCheck,
  Award,
  Download,
  Upload,
  HelpCircle,
  Send,
  Layers,
  ChevronDown,
  Building2,
  Check,
  FileCheck,
  BookMarked,
  Tag,
  Briefcase,
  AlertCircle,
  File,
  X,
  ExternalLink
} from 'lucide-react';
import { SubSection } from '../types';
import { useFormatters } from '../i18n/hooks';

interface PenerbitanViewProps {
  initialSubSection?: SubSection;
  onNavigateSubSection?: (sub: SubSection) => void;
}

// Nilai kategori formulir (data yang disimpan) -> kunci terjemahan label.
const CATEGORY_KEYS = {
  'Monografi': 'monograph',
  'Buku Teks': 'textbook',
  'Jurnal': 'journal',
  'Perpajakan': 'taxation',
  'Hukum': 'law',
  'Ekonomi': 'economics',
  'Akuntansi': 'accounting'
} as const;
type CategoryValue = keyof typeof CATEGORY_KEYS;
const CATEGORY_VALUES = Object.keys(CATEGORY_KEYS) as CategoryValue[];

// Paket utama: harga, kategori formulir yang dipilih tombol, dan gaya badge.
const MAIN_PACKAGES = [
  { key: 'monograph', price: 5000000, category: 'Monografi', badgeClass: 'bg-[#0F172A] text-[#DFBF64]' },
  { key: 'journal', price: 3000000, category: 'Jurnal', badgeClass: 'bg-slate-100 text-slate-800' },
  { key: 'ebook', price: 3000000, category: 'Buku Teks', badgeClass: 'bg-slate-100 text-slate-800' },
  { key: 'periodical', price: 10000000, category: 'Hukum', badgeClass: 'bg-slate-100 text-slate-800' }
] as const;

const EDITORIAL_SERVICES = [
  { key: 'editing', price: 750000, perChapter: false },
  { key: 'cover', price: 1000000, perChapter: false },
  { key: 'ghostwriting', price: 800000, perChapter: true },
  { key: 'teachingModule', price: 4000000, perChapter: false }
] as const;

const LICENSING_SERVICES = [
  { key: 'workLicensing', price: 1500000 },
  { key: 'certification', price: 500000 },
  { key: 'revisedEdition', price: 2000000 },
  { key: 'formatAdaptation', price: 5000000 }
] as const;

const DISTRIBUTION_SERVICES = [
  { key: 'bookstore', price: 1500000 },
  { key: 'promotion', price: 2000000 }
] as const;

export const PenerbitanView: React.FC<PenerbitanViewProps> = ({
  initialSubSection,
  onNavigateSubSection
}) => {
  const { t } = useTranslation('publishing');
  const { currency, date } = useFormatters();

  // Map incoming subSection prop to active tab
  const getTabFromSub = (sub?: SubSection): string => {
    if (sub === 'kirim-naskah') return 'kirim-naskah';
    if (sub === 'panduan' || sub === 'panduan-penulis') return 'panduan-penulis';
    if (sub === 'proses') return 'proses';
    if (sub === 'faq') return 'faq';
    return 'layanan';
  };

  const [activeTab, setActiveTab] = useState<string>(getTabFromSub(initialSubSection));

  // Keep activeTab in sync with prop changes (e.g. from navbar navigation)
  useEffect(() => {
    setActiveTab(getTabFromSub(initialSubSection));
  }, [initialSubSection]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (onNavigateSubSection) {
      onNavigateSubSection(tabId as SubSection);
    }
  };

  const categoryValueLabel = (value: string): string => {
    const key = CATEGORY_KEYS[value as CategoryValue];
    return key ? t(`form.categoryValues.${key}`) : value;
  };

  // ----------------------------------------------------
  // FORM STATE FOR "KIRIM NASKAH"
  // ----------------------------------------------------
  const [formData, setFormData] = useState({
    fullName: '',
    nidnOrInstitution: '',
    email: '',
    phoneWhatsApp: '',
    bookTitle: '',
    targetCategory: 'Monografi',
    synopsisText: '',
    agreeTerms: false
  });

  const [synopsisFile, setSynopsisFile] = useState<File | null>(null);
  const [manuscriptFile, setManuscriptFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null);
  const [submissionRecap, setSubmissionRecap] = useState<any>(null);

  const synopsisInputRef = useRef<HTMLInputElement>(null);
  const manuscriptInputRef = useRef<HTMLInputElement>(null);

  const handleSynopsisDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.pdf') || file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        setSynopsisFile(file);
      } else {
        alert(t('form.errors.invalidFileType'));
      }
    }
  };

  const handleManuscriptDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.pdf') || file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        setManuscriptFile(file);
      } else {
        alert(t('form.errors.invalidFileType'));
      }
    }
  };

  const handleSubmitNaskah = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agreeTerms) {
      alert(t('form.errors.termsRequired'));
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const ticketId = `CNX-NSK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      setSubmittedTicket(ticketId);
      // Nama file kosong & waktu pengajuan diformat saat render agar ikut bahasa aktif.
      setSubmissionRecap({
        ticketId,
        ...formData,
        synopsisFileName: synopsisFile ? synopsisFile.name : null,
        manuscriptFileName: manuscriptFile ? manuscriptFile.name : null,
        submittedAt: new Date()
      });
      setIsSubmitting(false);

      // Save into local submissions history
      try {
        const existing = JSON.parse(localStorage.getItem('cakranexa_submissions_v1') || '[]');
        existing.unshift({
          ticketId,
          ...formData,
          submittedAt: new Date().toISOString()
        });
        localStorage.setItem('cakranexa_submissions_v1', JSON.stringify(existing));
      } catch (err) {
        console.warn('Storage notice:', err);
      }
    }, 1200);
  };

  // ----------------------------------------------------
  // DOWNLOAD TEMPLATE ACTION (.DOCX)
  // ----------------------------------------------------
  // Dokumen resmi pengajuan naskah: sengaja tetap Bahasa Indonesia untuk semua bahasa tampilan.
  const handleDownloadTemplate = () => {
    // Generate valid text/rtf/doc structured buffer for download
    const content = `PT CAKRAWALA MAGNA SCIENTIA (CAKRANEXA ACADEMIC PUBLISHING)
TEMPLATE & PEDOMAN FORMAT PENULISAN NASKAH BUKU MONOGRAFI / BUKU TEKS

1. SPESIFIKASI FORMAT TATA LETAK
- Ukuran Naskah : UNESCO B5 (15.5 x 23 cm) atau A4
- Margin : Kiri 3.0 cm, Kanan 2.5 cm, Atas 2.5 cm, Bawah 2.5 cm
- Jenis Huruf : Times New Roman atau Palatino Linotype
- Ukuran Huruf : 12 pt (Teks Utama), 14 pt Bold (Judul Bab), 10 pt (Catatan Kaki/Tabel)
- Spasi Baris : 1.5 spasi
- Indentasi Paragraf : 1.27 cm (First Line Indent)
- Panjang Naskah : Minimal 150 halaman (Buku Monografi), 200 halaman (Buku Teks)

2. STRUKTUR STANDAR BUKU
- Halaman Judul Utama (Title Page)
- Prakata Penulis (Preface)
- Daftar Isi (Table of Contents)
- Daftar Tabel & Gambar (List of Tables & Figures)
- Batang Tubuh Buku (Bab I s/d Bab Penutup)
- Glosarium & Definisi Istilah Kunci (Glossary)
- Daftar Pustaka (APA 7th Edition atau Chicago Manual of Style Footnote)
- Indeks Subjek dan Nama
- Profil & Biodata Penulis

3. KEBIJAKAN ETIS & PLAGIARISME
- Batas ambang kesamaan (Similarity Index) Turnitin maksimal 20%
- Wajib menggunakan Reference Manager (Mendeley, Zotero, atau EndNote)
- Naskah belum pernah diterbitkan di penerbit mana pun.

Sekretariat Redaksi:
Email: redaksi@cakranexa.com
WhatsApp Dewan Redaksi: +62 852-8614-6806
PT Cakrawala Magna Scientia - Hak Cipta Dilindungi Undang-Undang`;

    const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Template_Naskah_Buku_CakraNexa.doc';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ----------------------------------------------------
  // FAQ ACCORDION STATE
  // ----------------------------------------------------
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = t('faq.items', { returnObjects: true });
  const processSteps = t('process.steps', { returnObjects: true });

  return (
    <div id="penerbitan-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-14 text-left font-sans">

      {/* Header Banner */}
      <div className="bg-[#0F172A] text-white rounded-2xl p-6 sm:p-10 relative overflow-hidden border border-slate-800 shadow-xl mb-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[#D4AF37] text-xs font-semibold tracking-wider uppercase">
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t('hero.badge')}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            {t('hero.title')}
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm font-normal leading-relaxed">
            {t('hero.description')}
          </p>
        </div>
      </div>

      {/* Sub-menu Tabs Navigation */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl p-1.5 overflow-x-auto gap-1 mb-8 shadow-xs">
        {[
          { id: 'layanan', label: t('tabs.services') },
          { id: 'kirim-naskah', label: t('tabs.submit') },
          { id: 'panduan-penulis', label: t('tabs.guidelines') },
          { id: 'proses', label: t('tabs.process') },
          { id: 'faq', label: t('tabs.faq') },
        ].map((tab) => (
          <button
            key={tab.id}
            id={`penerbitan-tab-${tab.id}`}
            onClick={() => handleTabChange(tab.id)}
            className={`py-2.5 px-4 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#0F172A] text-[#DFBF64] shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* =================================================================== */}
      {/* 1. LAYANAN PENERBITAN (`/penerbitan/layanan`)                        */}
      {/* =================================================================== */}
      {activeTab === 'layanan' && (
        <div className="space-y-12 animate-in fade-in duration-200">

          {/* Category 1: Paket Penerbitan Utama */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('services.categoryLabel', { number: '01' })}</span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('services.main.title')}</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 sm:mt-0">{t('services.main.description')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Monografi, Jurnal Akademik, E-Book, Periodikal */}
              {MAIN_PACKAGES.map((pkg) => (
                <div key={pkg.key} className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between hover:border-[#D4AF37] transition-colors">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${pkg.badgeClass}`}>
                        {t(`services.main.${pkg.key}.badge`)}
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-600">{t('services.priceFrom', { price: currency(pkg.price) })}</span>
                    </div>
                    <h3 className="font-bold text-base text-slate-900">{t(`services.main.${pkg.key}.title`)}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {t(`services.main.${pkg.key}.description`)}
                    </p>
                    <ul className="text-xs text-slate-600 space-y-2 pt-2 border-t border-slate-100">
                      {t(`services.main.${pkg.key}.features`, { returnObjects: true }).map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="pt-5 mt-4 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setFormData({ ...formData, targetCategory: pkg.category });
                        handleTabChange('kirim-naskah');
                      }}
                      className="w-full py-2 px-3 rounded-lg bg-[#0F172A] text-[#DFBF64] hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer text-center block"
                    >
                      {t(`services.main.${pkg.key}.cta`)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category 2: Editorial & Produksi */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('services.categoryLabel', { number: '02' })}</span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('services.editorial.title')}</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 sm:mt-0">{t('services.editorial.description')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Editing/Proofreading, Desain Cover, Ghostwriting, Modul Ajar */}
              {EDITORIAL_SERVICES.map((service) => (
                <div key={service.key} className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <span className="text-xs font-mono font-bold text-emerald-600 block">
                      {service.perChapter
                        ? t('services.priceFromPerChapter', { price: currency(service.price) })
                        : t('services.priceFrom', { price: currency(service.price) })}
                    </span>
                    <h3 className="font-bold text-base text-slate-900">{t(`services.editorial.${service.key}.title`)}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {t(`services.editorial.${service.key}.description`)}
                    </p>
                  </div>
                  <div className="pt-4 mt-3 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500 font-medium">{t(`services.editorial.${service.key}.note`)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category 3: Lisensi & HAKI */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('services.categoryLabel', { number: '03' })}</span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('services.licensing.title')}</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 sm:mt-0">{t('services.licensing.description')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Lisensi Karya, Sertifikasi Karya, Edisi Revisi, Adaptasi Format */}
              {LICENSING_SERVICES.map((service) => (
                <div key={service.key} className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <span className="text-xs font-mono font-bold text-emerald-600 block">{t('services.priceFrom', { price: currency(service.price) })}</span>
                    <h3 className="font-bold text-base text-slate-900">{t(`services.licensing.${service.key}.title`)}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {t(`services.licensing.${service.key}.description`)}
                    </p>
                  </div>
                  <div className="pt-4 mt-3 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500 font-medium">{t(`services.licensing.${service.key}.note`)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category 4: Distribusi & Pemasaran */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('services.categoryLabel', { number: '04' })}</span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('services.distribution.title')}</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 sm:mt-0">{t('services.distribution.description')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Distribusi Toko Buku, Strategi Promosi */}
              {DISTRIBUTION_SERVICES.map((service) => (
                <div key={service.key} className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-mono font-bold text-emerald-600">{t('services.priceFrom', { price: currency(service.price) })}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                        {t(`services.distribution.${service.key}.badge`)}
                      </span>
                    </div>
                    <h3 className="font-bold text-base text-slate-900">{t(`services.distribution.${service.key}.title`)}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {t(`services.distribution.${service.key}.description`)}
                    </p>
                    <ul className="text-xs text-slate-600 space-y-1.5 pt-2 border-t border-slate-100">
                      {t(`services.distribution.${service.key}.features`, { returnObjects: true }).map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="pt-4 mt-3 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500 font-medium">{t(`services.distribution.${service.key}.note`)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* =================================================================== */}
      {/* 2. KIRIM NASKAH (`/penerbitan/kirim-naskah`)                         */}
      {/* =================================================================== */}
      {activeTab === 'kirim-naskah' && (
        <div className="max-w-3xl mx-auto animate-in fade-in duration-200">
          {submittedTicket ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 shadow-sm text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-mono font-bold">
                  {t('form.success.trackingCode', { ticket: submittedTicket })}
                </span>
                <h2 className="text-2xl font-bold text-slate-900">
                  {t('form.success.title')}
                </h2>
                <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
                  {t('form.success.description')}
                </p>
              </div>

              {submissionRecap && (
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 text-left text-xs space-y-2.5">
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">{t('form.success.recap.bookTitle')}</span>
                    <span className="font-bold text-slate-900 text-right max-w-xs truncate">{submissionRecap.bookTitle}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">{t('form.success.recap.author')}</span>
                    <span className="font-semibold text-slate-900">{submissionRecap.fullName}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">{t('form.success.recap.category')}</span>
                    <span className="font-semibold text-[#0F172A]">{categoryValueLabel(submissionRecap.targetCategory)}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">{t('form.success.recap.manuscriptFile')}</span>
                    <span className="font-mono text-slate-700">{submissionRecap.manuscriptFileName || t('form.success.manuscriptViaForm')}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-500">{t('form.success.recap.submittedAt')}</span>
                    <span className="text-slate-700">{date(submissionRecap.submittedAt, { dateStyle: 'long', timeStyle: 'short' })}</span>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-[#0F172A]/5 border border-[#D4AF37]/30 text-xs text-slate-700 space-y-1">
                <p className="font-semibold text-[#0F172A]">{t('form.success.nextStepsTitle')}</p>
                <p>{t('form.success.nextStepsDescription')}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <a
                  href={`https://wa.me/6285286146806?text=${encodeURIComponent(t('form.success.whatsappMessage', { ticket: submittedTicket }))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{t('form.success.whatsappCta')}</span>
                </a>
                <button
                  onClick={() => {
                    setSubmittedTicket(null);
                    setSubmissionRecap(null);
                    setSynopsisFile(null);
                    setManuscriptFile(null);
                    setFormData({
                      fullName: '',
                      nidnOrInstitution: '',
                      email: '',
                      phoneWhatsApp: '',
                      bookTitle: '',
                      targetCategory: 'Monografi',
                      synopsisText: '',
                      agreeTerms: false
                    });
                  }}
                  className="py-2.5 px-5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors"
                >
                  {t('form.success.submitAnother')}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs">
              <div className="border-b border-slate-200 pb-5 mb-6 space-y-1">
                <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('form.eyebrow')}</span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('form.title')}</h2>
                <p className="text-xs text-slate-500">
                  {t('form.description')}
                </p>
              </div>

              <form onSubmit={handleSubmitNaskah} className="space-y-6 text-xs">

                {/* Author Details */}
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#D4AF37]" />
                    <span>{t('form.sections.author')}</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        {t('form.fields.fullName.label')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        placeholder={t('form.fields.fullName.placeholder')}
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        {t('form.fields.institution.label')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.nidnOrInstitution}
                        onChange={(e) => setFormData({ ...formData, nidnOrInstitution: e.target.value })}
                        placeholder={t('form.fields.institution.placeholder')}
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        {t('form.fields.email.label')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder={t('form.fields.email.placeholder')}
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        {t('form.fields.phone.label')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.phoneWhatsApp}
                        onChange={(e) => setFormData({ ...formData, phoneWhatsApp: e.target.value })}
                        placeholder="0812xxxxxxxx"
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Book Title & Category */}
                <div className="space-y-4 pt-4 border-t border-slate-200">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <BookMarked className="w-4 h-4 text-[#D4AF37]" />
                    <span>{t('form.sections.manuscript')}</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        {t('form.fields.bookTitle.label')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.bookTitle}
                        onChange={(e) => setFormData({ ...formData, bookTitle: e.target.value })}
                        placeholder={t('form.fields.bookTitle.placeholder')}
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        {t('form.fields.category.label')} <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.targetCategory}
                        onChange={(e) => setFormData({ ...formData, targetCategory: e.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] bg-white text-slate-900 text-xs"
                      >
                        {CATEGORY_VALUES.map((value) => (
                          <option key={value} value={value}>{t(`form.categoryOptions.${CATEGORY_KEYS[value]}`)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1.5">
                      {t('form.fields.synopsis.label')} <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={formData.synopsisText}
                      onChange={(e) => setFormData({ ...formData, synopsisText: e.target.value })}
                      placeholder={t('form.fields.synopsis.placeholder')}
                      className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs leading-relaxed"
                    />
                  </div>
                </div>

                {/* Document Upload */}
                <div className="space-y-4 pt-4 border-t border-slate-200">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-[#D4AF37]" />
                    <span>{t('form.sections.documents')}</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Upload Sinopsis */}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        {t('form.fields.synopsisFile.label')} <span className="text-slate-400 font-normal">(.pdf/.docx)</span>
                      </label>
                      <input
                        type="file"
                        ref={synopsisInputRef}
                        accept=".pdf,.docx,.doc"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setSynopsisFile(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />

                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleSynopsisDrop}
                        onClick={() => synopsisInputRef.current?.click()}
                        className="border border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-[#D4AF37] hover:bg-slate-50/50 transition-all cursor-pointer"
                      >
                        {synopsisFile ? (
                          <div className="flex items-center justify-between bg-slate-100 p-2 rounded-lg">
                            <div className="flex items-center gap-2 overflow-hidden text-left">
                              <FileText className="w-4 h-4 text-[#0F172A] flex-shrink-0" />
                              <span className="truncate font-mono text-[11px] text-slate-800">{synopsisFile.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSynopsisFile(null);
                              }}
                              className="text-slate-400 hover:text-red-500 p-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5 py-2">
                            <File className="w-5 h-5 text-slate-400 mx-auto" />
                            <p className="text-slate-600 font-medium text-[11px]">{t('form.upload.synopsisPrompt')}</p>
                            <p className="text-[10px] text-slate-400">{t('form.upload.synopsisHint')}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Upload Draft Lengkap */}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        {t('form.fields.manuscriptFile.label')} <span className="text-slate-400 font-normal">(.pdf/.docx)</span>
                      </label>
                      <input
                        type="file"
                        ref={manuscriptInputRef}
                        accept=".pdf,.docx,.doc"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setManuscriptFile(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />

                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleManuscriptDrop}
                        onClick={() => manuscriptInputRef.current?.click()}
                        className="border border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-[#D4AF37] hover:bg-slate-50/50 transition-all cursor-pointer"
                      >
                        {manuscriptFile ? (
                          <div className="flex items-center justify-between bg-slate-100 p-2 rounded-lg">
                            <div className="flex items-center gap-2 overflow-hidden text-left">
                              <FileCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                              <span className="truncate font-mono text-[11px] text-slate-800">{manuscriptFile.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setManuscriptFile(null);
                              }}
                              className="text-slate-400 hover:text-red-500 p-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5 py-2">
                            <Upload className="w-5 h-5 text-slate-400 mx-auto" />
                            <p className="text-slate-600 font-medium text-[11px]">{t('form.upload.manuscriptPrompt')}</p>
                            <p className="text-[10px] text-slate-400">{t('form.upload.manuscriptHint')}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Terms Checkbox */}
                <div className="pt-3">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={formData.agreeTerms}
                      onChange={(e) => setFormData({ ...formData, agreeTerms: e.target.checked })}
                      className="rounded border-slate-300 text-[#0F172A] focus:ring-[#D4AF37] mt-0.5"
                    />
                    <span className="text-[11px] text-slate-600 leading-relaxed">
                      {t('form.terms')}
                    </span>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-[#DFBF64] font-bold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>{t('form.submitting')}</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{t('form.submit')}</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. PANDUAN PENULIS (`/penerbitan/panduan-penulis`)                  */}
      {/* =================================================================== */}
      {activeTab === 'panduan-penulis' && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-200">

          {/* Header Action Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('guidelines.eyebrow')}</span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{t('guidelines.title')}</h2>
              <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
                {t('guidelines.description')}
              </p>
            </div>

            <button
              id="btn-download-author-template"
              onClick={handleDownloadTemplate}
              className="py-3 px-5 rounded-xl bg-[#0F172A] text-[#DFBF64] hover:bg-slate-800 text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{t('guidelines.downloadTemplate')}</span>
            </button>
          </div>

          {/* Guidelines Checklist */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* 1. Format Pengetikan */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <FileText className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-bold text-sm text-slate-900">{t('guidelines.layout.title')}</h3>
              </div>
              <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
                {t('guidelines.layout.items', { returnObjects: true }).map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-bold text-slate-900 min-w-[90px]">{item.label}</span>
                    <span>{item.value}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 2. Gaya Sitasi & Referensi */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <BookOpen className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-bold text-sm text-slate-900">{t('guidelines.citation.title')}</h3>
              </div>
              <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
                {t('guidelines.citation.items', { returnObjects: true }).map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-bold text-slate-900 min-w-[90px]">{item.label}</span>
                    <span>{item.value}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 3. Struktur Anatomi Naskah */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <Layers className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-bold text-sm text-slate-900">{t('guidelines.structure.title')}</h3>
              </div>
              <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
                {t('guidelines.structure.items', { returnObjects: true }).map((item, idx) => (
                  <li key={idx}><span className="font-semibold text-slate-800">{item.label}</span> {item.value}</li>
                ))}
              </ol>
            </div>

            {/* 4. Kebijakan Plagiarisme */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">{t('guidelines.plagiarism.title')}</h3>
              </div>
              <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
                  <span className="font-bold text-emerald-800 block mb-1">{t('guidelines.plagiarism.thresholdTitle')}</span>
                  <p className="text-slate-700">
                    <Trans
                      t={t}
                      i18nKey="guidelines.plagiarism.thresholdDescription"
                      components={{ em: <em /> }}
                      shouldUnescape
                    />
                  </p>
                </div>
                <p>
                  {t('guidelines.plagiarism.note')}
                </p>
              </div>
            </div>

          </div>

          {/* Quick CTA to Submission */}
          <div className="bg-[#0F172A] text-white rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800">
            <div className="space-y-1">
              <h3 className="font-bold text-base text-white">{t('guidelines.cta.title')}</h3>
              <p className="text-xs text-slate-300">{t('guidelines.cta.description')}</p>
            </div>
            <button
              onClick={() => handleTabChange('kirim-naskah')}
              className="py-2.5 px-5 rounded-lg bg-[#DFBF64] hover:bg-[#c5a059] text-[#0F172A] font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span>{t('guidelines.cta.button')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      )}

      {/* =================================================================== */}
      {/* 4. PROSES PENERBITAN (`/penerbitan/proses`)                          */}
      {/* =================================================================== */}
      {activeTab === 'proses' && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-200">

          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('process.eyebrow')}</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{t('process.title')}</h2>
            <p className="text-xs text-slate-600">{t('process.description')}</p>
          </div>

          {/* Flowchart Timeline */}
          <div className="space-y-4 relative">
            {processSteps.map((item, idx) => {
              const step = String(idx + 1).padStart(2, '0');
              return (
                <div
                  key={step}
                  className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs hover:border-[#D4AF37] transition-all relative overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-[#0F172A] text-[#DFBF64] flex items-center justify-center font-mono font-bold text-base flex-shrink-0">
                        {step}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-base text-slate-900">{item.title}</h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">{item.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px] text-slate-700">
                    <span className="font-semibold text-slate-900">{t('process.outputLabel')}</span>
                    {item.deliverables.map((d, dIdx) => (
                      <span key={dIdx} className="inline-flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 text-slate-700">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>{d}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center pt-2">
            <button
              onClick={() => handleTabChange('kirim-naskah')}
              className="py-3 px-6 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-[#DFBF64] font-bold text-xs tracking-wide transition-all shadow-md inline-flex items-center gap-2 cursor-pointer"
            >
              <span>{t('process.cta')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      )}

      {/* =================================================================== */}
      {/* 5. FAQ PENERBITAN (`/penerbitan/faq`)                                */}
      {/* =================================================================== */}
      {activeTab === 'faq' && (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">

          <div className="text-center max-w-lg mx-auto space-y-2 mb-6">
            <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">{t('faq.eyebrow')}</span>
            <h2 className="text-2xl font-bold text-slate-900">{t('faq.title')}</h2>
            <p className="text-xs text-slate-600">{t('faq.description')}</p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-xs transition-colors"
              >
                <button
                  id={`faq-toggle-${idx}`}
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full text-left p-4 sm:p-5 flex items-center justify-between font-semibold text-slate-900 text-xs sm:text-sm hover:bg-slate-50 transition-colors cursor-pointer gap-4"
                >
                  <span className="leading-snug">{faq.question}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${openFaq === idx ? 'rotate-180 text-[#0F172A]' : ''}`} />
                </button>
                {openFaq === idx && (
                  <div className="px-4 sm:px-5 pb-5 pt-0 text-xs text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/50">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Contact Support Helpbox */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-8">
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-slate-900">{t('faq.help.title')}</h4>
              <p className="text-xs text-slate-600">{t('faq.help.description')}</p>
            </div>
            <a
              href={`https://wa.me/6285286146806?text=${encodeURIComponent(t('faq.help.whatsappMessage'))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors whitespace-nowrap flex items-center justify-center gap-2"
            >
              <span>{t('faq.help.whatsappCta')}</span>
            </a>
          </div>

        </div>
      )}

    </div>
  );
};
