import React, { useState, useEffect, useRef } from 'react';
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

interface PenerbitanViewProps {
  initialSubSection?: SubSection;
  onNavigateSubSection?: (sub: SubSection) => void;
}

export const PenerbitanView: React.FC<PenerbitanViewProps> = ({ 
  initialSubSection,
  onNavigateSubSection 
}) => {
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
        alert('Mohon unggah dokumen berformat PDF atau DOCX.');
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
        alert('Mohon unggah dokumen berformat PDF atau DOCX.');
      }
    }
  };

  const handleSubmitNaskah = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agreeTerms) {
      alert('Anda harus menyetujui pernyataan orisinalitas naskah.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const ticketId = `CNX-NSK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      setSubmittedTicket(ticketId);
      setSubmissionRecap({
        ticketId,
        ...formData,
        synopsisFileName: synopsisFile ? synopsisFile.name : 'Ringkasan Langsung pada Formulir',
        manuscriptFileName: manuscriptFile ? manuscriptFile.name : 'Terkirim via Formulir Digital',
        submittedAt: new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })
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

  const faqs = [
    {
      q: 'Apakah seluruh buku terbitan CakraNexa mendapatkan ISBN resmi dari Perpusnas RI?',
      a: 'Ya. Sebagai penerbit resmi anggota IKAPI (Ikatan Penerbit Indonesia) dan tercatat di Perpustakaan Nasional Republik Indonesia, setiap judul buku yang lolos uji kelayakan redaksi diterbitkan dengan nomor ISBN dan Barcode EAN resmi. Data bibliografi buku juga didaftarkan pada Katalog Dalam Terbitan (KDT) Perpusnas RI.'
    },
    {
      q: 'Berapa lama estimasi waktu proses dari naskah diserahkan hingga buku terbit?',
      a: 'Durasi standar penerbitan berkisar antara 14 hingga 30 hari kerja setelah naskah dinyatakan lengkap dan disetujui. Rinciannya: proses peer-review substantif (7-14 hari), penyuntingan tata bahasa & perwajahan layout B5 (5-7 hari), pengurusan ISBN resmi Perpusnas (3-7 hari kerja), serta produksi cetak dan katalogisasi digital.'
    },
    {
      q: 'Bagaimana sistem royalti dan hak cipta buku bagi penulis?',
      a: 'Hak Cipta (Copyright) dan Hak Moral atas karya ilmiah tetap sepenuhnya menjadi milik penulis. Royalti diberikan secara transparan sebesar 10% hingga 15% dari harga jual buku bersih dengan laporan berkala setiap semester. Untuk institusi atau korporasi, tersedia pula skema penerbitan beli putus (outright purchase) sesuai kesepakatan tertulis.'
    },
    {
      q: 'Apakah CakraNexa melayani penerbitan buku konversi dari Disertasi atau Tesis S2/S3?',
      a: 'Ya, kami menyediakan pendampingan konversi disertasi/tesis menjadi buku monografi berangka kredit (KUM BKD) DIKTI. Tim "Book Doctors" dan editor spesialis kami akan membantu merestrukturisasi bahasa laporan kaku menjadi monografi ilmiah yang mengalir, komunikatif, dan berbobot akademis tinggi.'
    },
    {
      q: 'Berapa jumlah minimal eksemplar cetak (oplah) yang bisa dipesan?',
      a: 'Kami mengadopsi teknologi Print-on-Demand (POD) modern sehingga penulis dapat mencetak mulai dari 10 eksemplar untuk kebutuhan terbatas (seperti sidang guru besar, promosi doktor, atau akreditasi prodi). Kami juga melayani cetak masal ribuan eksemplar menggunakan mesin cetak offset profesional.'
    },
    {
      q: 'Bagaimana jangkauan distribusi dan pemasaran buku yang telah diterbitkan?',
      a: 'Buku didistribusikan melalui portal resmi CakraNexa Store, saluran toko online resmi (marketplace), katalog perpustakaan perguruan tinggi, serta jaringan toko buku rekanan fisik di seluruh Indonesia. Kami juga mendistribusikan versi E-Book digital ber-DRM untuk pembaca global.'
    }
  ];

  return (
    <div id="penerbitan-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-14 text-left font-sans">
      
      {/* Header Banner */}
      <div className="bg-[#0F172A] text-white rounded-2xl p-6 sm:p-10 relative overflow-hidden border border-slate-800 shadow-xl mb-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[#D4AF37] text-xs font-semibold tracking-wider uppercase">
            <BookOpen className="w-3.5 h-3.5" />
            <span>DIVISI PENERBITAN RESMI PT CAKRAWALA MAGNA SCIENTIA</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            Publikasikan Karya Ilmiah Anda Bersama Standar Otoritas Tertinggi
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm font-normal leading-relaxed">
            Mulai dari manuskrip akademik hingga buku ber-ISBN terdistribusi nasional. Kami menyediakan layanan editorial komprehensif, peer-review akademik, layout standar UNESCO, hingga cetak bookpaper lux hardcover.
          </p>
        </div>
      </div>

      {/* Sub-menu Tabs Navigation */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl p-1.5 overflow-x-auto gap-1 mb-8 shadow-xs">
        {[
          { id: 'layanan', label: 'Layanan Penerbitan' },
          { id: 'kirim-naskah', label: 'Kirim Naskah' },
          { id: 'panduan-penulis', label: 'Panduan Penulis' },
          { id: 'proses', label: 'Proses Penerbitan' },
          { id: 'faq', label: 'FAQ Penerbitan' },
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
                <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">Kategori 01</span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Paket Penerbitan Utama</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 sm:mt-0">Solusi terpadu publikasi buku referensi, monografi, dan terbitan berkala.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Monografi */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between hover:border-[#D4AF37] transition-colors">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#0F172A] text-[#DFBF64]">
                      Standar DIKTI
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-600">Mulai Rp 5.000.000</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Buku Monografi</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Dikhususkan bagi akademisi dan dosen untuk mempublikasikan hasil riset tunggal berangka kredit (KUM).
                  </p>
                  <ul className="text-xs text-slate-600 space-y-2 pt-2 border-t border-slate-100">
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Pengurusan ISBN & Barcode Perpusnas</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Peer-review Dewan Mitra Bestari</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Layout standar UNESCO B5 & Cover 3D</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Pencatatan KDT Katalog Nasional</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-5 mt-4 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setFormData({ ...formData, targetCategory: 'Monografi' });
                      handleTabChange('kirim-naskah');
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-[#0F172A] text-[#DFBF64] hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer text-center block"
                  >
                    Pilih Paket Monografi
                  </button>
                </div>
              </div>

              {/* Jurnal Akademik */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between hover:border-[#D4AF37] transition-colors">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                      OJS 3 & DOI
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-600">Mulai Rp 3.000.000</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Jurnal Akademik</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Pengelolaan dan penerbitan berkala ilmiah terakreditasi dengan standar sistem Open Journal Systems.
                  </p>
                  <ul className="text-xs text-slate-600 space-y-2 pt-2 border-t border-slate-100">
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Setup & Konfigurasi OJS 3 Institusi</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Integrasi DOI CrossRef Resmi</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Workflow Peer-Review Terstruktur</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Pendampingan Indeksasi Garuda & Sinta</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-5 mt-4 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setFormData({ ...formData, targetCategory: 'Jurnal' });
                      handleTabChange('kirim-naskah');
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-[#0F172A] text-[#DFBF64] hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer text-center block"
                  >
                    Pilih Paket Jurnal
                  </button>
                </div>
              </div>

              {/* E-Book */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between hover:border-[#D4AF37] transition-colors">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                      Digital & DRM
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-600">Mulai Rp 3.000.000</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">E-Book</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Penerbitan format digital ePub3 dan PDF terenkripsi dengan proteksi hak cipta DRM terintegrasi.
                  </p>
                  <ul className="text-xs text-slate-600 space-y-2 pt-2 border-t border-slate-100">
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Konversi Format ePub3 & Interactive PDF</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Proteksi Hak Cipta Digital (DRM)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Distribusi Google Play Books & CakraNexa</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Dashboard Analitik Pembaca Realtime</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-5 mt-4 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setFormData({ ...formData, targetCategory: 'Buku Teks' });
                      handleTabChange('kirim-naskah');
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-[#0F172A] text-[#DFBF64] hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer text-center block"
                  >
                    Pilih Paket E-Book
                  </button>
                </div>
              </div>

              {/* Periodikal */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between hover:border-[#D4AF37] transition-colors">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                      Korporasi / Lembaga
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-600">Mulai Rp 10.000.000</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Periodikal</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Penerbitan buletin riset tahunan, prosiding seminar nasional/internasional, dan majalah korporat.
                  </p>
                  <ul className="text-xs text-slate-600 space-y-2 pt-2 border-t border-slate-100">
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Penerbitan Berkala Cetak & Digital</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Pengurusan ISSN Resmi Perpusnas</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Desain Editorial Majalah Ilmiah Lux</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>Distribusi Stakeholder & Perpustakaan</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-5 mt-4 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setFormData({ ...formData, targetCategory: 'Hukum' });
                      handleTabChange('kirim-naskah');
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-[#0F172A] text-[#DFBF64] hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer text-center block"
                  >
                    Pilih Paket Periodikal
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Category 2: Editorial & Produksi */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">Kategori 02</span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Editorial & Produksi</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 sm:mt-0">Penyempurnaan naskah ilmiah, desain cover artistik, dan modul bahan ajar.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Editing/Proofreading */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <span className="text-xs font-mono font-bold text-emerald-600 block">Mulai Rp 750.000</span>
                  <h3 className="font-bold text-base text-slate-900">Editing / Proofreading</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Pemeriksaan tata bahasa baku PUEBI/EYD, terminologi hukum & perpajakan, konsistensi istilah, dan penyelarasan alur argumen tanpa mengubah esensi keilmuan.
                  </p>
                </div>
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Estimasi: 3 - 5 Hari Kerja</span>
                </div>
              </div>

              {/* Desain Cover */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <span className="text-xs font-mono font-bold text-emerald-600 block">Mulai Rp 1.000.000</span>
                  <h3 className="font-bold text-base text-slate-900">Desain Cover</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Perancangan visual 3D editorial bernilai estetika tinggi, pemilihan tipografi monografi berwibawa, mockup visual resolusi tinggi, siap cetak offset (CMYK 300 DPI).
                  </p>
                </div>
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Revisi: 3x Putaran Desain</span>
                </div>
              </div>

              {/* Ghostwriting */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <span className="text-xs font-mono font-bold text-emerald-600 block">Mulai Rp 800.000 / Bab</span>
                  <h3 className="font-bold text-base text-slate-900">Ghostwriting</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Pendampingan intensif bagi pakar dan praktisi sibuk, wawancara mendalam, perumusan gagasan praktis menjadi bab naskah ilmiah yang tersusun sistematis.
                  </p>
                </div>
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Didampingi Editor Senior</span>
                </div>
              </div>

              {/* Modul Ajar */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <span className="text-xs font-mono font-bold text-emerald-600 block">Mulai Rp 4.000.000</span>
                  <h3 className="font-bold text-base text-slate-900">Modul Ajar</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Penyusunan format buku ajar perguruan tinggi, keselarasan dengan RPS (Rencana Pembelajaran Semester), integrasi latihan kasus dan rubrik asesmen mahasiswa.
                  </p>
                </div>
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Standar OBE & BKD Dikti</span>
                </div>
              </div>
            </div>
          </div>

          {/* Category 3: Lisensi & HAKI */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">Kategori 03</span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Lisensi & HAKI</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 sm:mt-0">Perlindungan hak cipta, legalitas royalti, dan monetisasi karya intelektual.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Lisensi Karya */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <span className="text-xs font-mono font-bold text-emerald-600 block">Mulai Rp 1.500.000</span>
                  <h3 className="font-bold text-base text-slate-900">Lisensi Karya</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Pengelolaan kontrak lisensi institusional, adopsi kurikulum universitas, hak cetak ulang rekanan, dan pembagian royalti transparan.
                  </p>
                </div>
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Akta Perjanjian Formal</span>
                </div>
              </div>

              {/* Sertifikasi Karya */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <span className="text-xs font-mono font-bold text-emerald-600 block">Mulai Rp 500.000</span>
                  <h3 className="font-bold text-base text-slate-900">Sertifikasi Karya (HAKI)</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Pengurusan resmi Surat Pencatatan Ciptaan ke Direktorat Jenderal Kekayaan Intelektual (DJKI) Kemenkumham RI hingga sertifikat e-HakCipta terbit.
                  </p>
                </div>
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Sertifikat Resmi DJKI</span>
                </div>
              </div>

              {/* Edisi Revisi */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <span className="text-xs font-mono font-bold text-emerald-600 block">Mulai Rp 2.000.000</span>
                  <h3 className="font-bold text-base text-slate-900">Edisi Revisi</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Pembaruan regulasi perundang-undangan baru, pemutakhiran data statistik, penambahan bab telaah mutakhir, dan pendaftaran ISBN revisi baru.
                  </p>
                </div>
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Perpanjangan Siklus Buku</span>
                </div>
              </div>

              {/* Adaptasi Format */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <span className="text-xs font-mono font-bold text-emerald-600 block">Mulai Rp 5.000.000</span>
                  <h3 className="font-bold text-base text-slate-900">Adaptasi Format</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Transformasi naskah menjadi ringkasan eksekutif (whitepaper), audiobook, modul microlearning digital, atau pangkalan data ilmiah institusional.
                  </p>
                </div>
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Multi-Platform Ready</span>
                </div>
              </div>
            </div>
          </div>

          {/* Category 4: Distribusi & Pemasaran */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">Kategori 04</span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Distribusi & Pemasaran</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 sm:mt-0">Jangkauan pembaca nasional melalui toko buku fisik, marketplace, dan bedah buku.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Distribusi Toko Buku */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-mono font-bold text-emerald-600">Mulai Rp 1.500.000</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                      Jejaring Nasional
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Distribusi Toko Buku</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Penempatan buku di jaringan toko buku rekanan fisik, sistem konsinyasi terjadwal, etalase resmi di e-Commerce CakraNexa Store, serta marketplace official Tokopedia dan Shopee.
                  </p>
                  <ul className="text-xs text-slate-600 space-y-1.5 pt-2 border-t border-slate-100">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Integrasi Pergudangan & Logistik CakraNexa</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Pelaporan Penjualan Transparan Berkala</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Jangkauan 38 Provinsi</span>
                </div>
              </div>

              {/* Strategi Promosi */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-mono font-bold text-emerald-600">Mulai Rp 2.000.000</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                      Publikasi & Media
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Strategi Promosi</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Penyelenggaraan webinar bedah buku ilmiah bersama narasumber pakar, siaran pers media nasional terpercaya, kampanye sitasi akademik, serta katalogisasi ke perpustakaan perguruan tinggi.
                  </p>
                  <ul className="text-xs text-slate-600 space-y-1.5 pt-2 border-t border-slate-100">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Publikasi Siaran Pers Media Nasional</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Sirkulasi Katalog ke LPPM & Perpustakaan Universitas</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Kampanye Branding Penulis</span>
                </div>
              </div>
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
                  KODE TRACKING: {submittedTicket}
                </span>
                <h2 className="text-2xl font-bold text-slate-900">
                  Naskah Berhasil Diajukan ke Dewan Redaksi
                </h2>
                <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
                  Terima kasih atas kepercayaan Anda kepada PT Cakrawala Magna Scientia. Naskah Anda telah masuk dalam antrean screening administratif dan peer-review akademik.
                </p>
              </div>

              {submissionRecap && (
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 text-left text-xs space-y-2.5">
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Judul Naskah:</span>
                    <span className="font-bold text-slate-900 text-right max-w-xs truncate">{submissionRecap.bookTitle}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Nama Penulis:</span>
                    <span className="font-semibold text-slate-900">{submissionRecap.fullName}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Kategori:</span>
                    <span className="font-semibold text-[#0F172A]">{submissionRecap.targetCategory}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">File Manuskrip:</span>
                    <span className="font-mono text-slate-700">{submissionRecap.manuscriptFileName}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-500">Waktu Pengajuan:</span>
                    <span className="text-slate-700">{submissionRecap.submittedAt}</span>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-[#0F172A]/5 border border-[#D4AF37]/30 text-xs text-slate-700 space-y-1">
                <p className="font-semibold text-[#0F172A]">Langkah Selanjutnya:</p>
                <p>Tim Redaksi Ilmiah akan mengirimkan lembar evaluasi awal dan Peer-Review Matrix ke WhatsApp/Email Anda dalam 3-5 hari kerja.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <a
                  href={`https://wa.me/6285286146806?text=Halo%20Dewan%20Redaksi%20CakraNexa,%20saya%20telah%20mengajukan%20naskah%20dengan%20Kode%20Tracking%20${submittedTicket}.%20Mohon%20informasi%20tahapan%20selanjutnya.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Konfirmasi via WhatsApp Redaksi</span>
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
                  Ajukan Naskah Lain
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs">
              <div className="border-b border-slate-200 pb-5 mb-6 space-y-1">
                <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">Formulir Resmi Pengajuan</span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Kirim Naskah Buku Akademik</h2>
                <p className="text-xs text-slate-500">
                  Lengkapi data penulis dan unggah draft manuskrip Anda untuk dievaluasi oleh Dewan Redaksi PT Cakrawala Magna Scientia.
                </p>
              </div>

              <form onSubmit={handleSubmitNaskah} className="space-y-6 text-xs">
                
                {/* Author Details */}
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#D4AF37]" />
                    <span>1. Data Identitas Penulis</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        Nama Lengkap & Gelar Akademik <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        placeholder="Prof. Dr. Ir. Nama Penulis, S.E., M.Ak."
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        NIDN / NIP / Institusi Lembaga <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.nidnOrInstitution}
                        onChange={(e) => setFormData({ ...formData, nidnOrInstitution: e.target.value })}
                        placeholder="Contoh: NIDN 0312048501 / Universitas Indonesia"
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        Email Resmi / Akademik <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="penulis@kampus.ac.id"
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        Nomor WhatsApp Aktif <span className="text-red-500">*</span>
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
                    <span>2. Informasi Naskah Buku</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        Usulan Judul Buku / Monografi <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.bookTitle}
                        onChange={(e) => setFormData({ ...formData, bookTitle: e.target.value })}
                        placeholder="Judul lengkap beserta anak judul jika ada..."
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        Kategori Target <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.targetCategory}
                        onChange={(e) => setFormData({ ...formData, targetCategory: e.target.value })}
                        className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] bg-white text-slate-900 text-xs"
                      >
                        <option value="Monografi">Buku Monografi</option>
                        <option value="Buku Teks">Buku Teks / Ajar</option>
                        <option value="Jurnal">Jurnal Akademik</option>
                        <option value="Perpajakan">Perpajakan</option>
                        <option value="Hukum">Hukum & Kebijakan</option>
                        <option value="Ekonomi">Ekonomi & Bisnis</option>
                        <option value="Akuntansi">Akuntansi & Audit</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1.5">
                      Sinopsis Singkat & Kebaruan Ilmiah (Novelty) <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={formData.synopsisText}
                      onChange={(e) => setFormData({ ...formData, synopsisText: e.target.value })}
                      placeholder="Jelaskan secara ringkas latar belakang riset, fokus kebaruan temuan, perkiraan jumlah halaman, dan target sasaran pembaca..."
                      className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#D4AF37] text-slate-900 text-xs leading-relaxed"
                    />
                  </div>
                </div>

                {/* Document Upload */}
                <div className="space-y-4 pt-4 border-t border-slate-200">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-[#D4AF37]" />
                    <span>3. Unggah Dokumen Pendukung (PDF / DOCX)</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Upload Sinopsis */}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        File Sinopsis & Proposal Naskah <span className="text-slate-400 font-normal">(.pdf/.docx)</span>
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
                            <p className="text-slate-600 font-medium text-[11px]">Tarik file atau klik untuk unggah</p>
                            <p className="text-[10px] text-slate-400">PDF atau DOCX (Maks 10 MB)</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Upload Draft Lengkap */}
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        File Draf Lengkap Manuskrip <span className="text-slate-400 font-normal">(.pdf/.docx)</span>
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
                            <p className="text-slate-600 font-medium text-[11px]">Tarik draf naskah atau klik</p>
                            <p className="text-[10px] text-slate-400">PDF atau DOCX (Maks 50 MB)</p>
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
                      Saya menyatakan dengan sebenar-benarnya bahwa naskah yang diajukan merupakan karya orisinal, bebas dari unsur plagiarisme (similarity index Turnitin &lt; 20%), belum pernah diterbitkan di penerbit lain, dan siap menjalani proses peer-review oleh Dewan Redaksi CakraNexa.
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
                    <span>Mengirimkan Naskah ke Dewan Redaksi...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Kirim Naskah ke Dewan Redaksi CakraNexa</span>
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
              <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">Standar Selingkung Resmi</span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Panduan & Format Penulisan Naskah</h2>
              <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
                Pedoman format pengetikan, struktur bab, gaya sitasi, serta standar integritas ilmiah untuk pengajuan buku monografi dan buku teks.
              </p>
            </div>

            <button
              id="btn-download-author-template"
              onClick={handleDownloadTemplate}
              className="py-3 px-5 rounded-xl bg-[#0F172A] text-[#DFBF64] hover:bg-slate-800 text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Template Naskah (.DOCX)</span>
            </button>
          </div>

          {/* Guidelines Checklist */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* 1. Format Pengetikan */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <FileText className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-bold text-sm text-slate-900">1. Ukuran Kertas, Font & Spasi</h3>
              </div>
              <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-900 min-w-[90px]">Ukuran Kertas:</span>
                  <span>UNESCO B5 (15.5 x 23 cm) atau A4 standar.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-900 min-w-[90px]">Batas Margin:</span>
                  <span>Kiri 3.0 cm, Kanan 2.5 cm, Atas 2.5 cm, Bawah 2.5 cm.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-900 min-w-[90px]">Jenis Huruf:</span>
                  <span>Times New Roman atau Palatino Linotype 12 pt.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-900 min-w-[90px]">Spasi & Indent:</span>
                  <span>1.5 spasi baris, indentasi alinea pertama 1.27 cm.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-900 min-w-[90px]">Tebal Naskah:</span>
                  <span>Minimal 150 halaman untuk monografi ilmiah.</span>
                </li>
              </ul>
            </div>

            {/* 2. Gaya Sitasi & Referensi */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <BookOpen className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-bold text-sm text-slate-900">2. Gaya Sitasi & Reference Manager</h3>
              </div>
              <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-900 min-w-[90px]">Standar Sitasi:</span>
                  <span>APA Style 7th Edition (Ekonomi & Bisnis, Akuntansi).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-900 min-w-[90px]">Bidang Hukum:</span>
                  <span>Chicago Manual of Style (Footnote / Catatan Kaki).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-900 min-w-[90px]">Software Wajib:</span>
                  <span>Mendeley, Zotero, atau EndNote untuk konsistensi meta data.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-900 min-w-[90px]">Sumber Pustaka:</span>
                  <span>Minimal 80% rujukan bersumber dari jurnal bereputasi 10 tahun terakhir.</span>
                </li>
              </ul>
            </div>

            {/* 3. Struktur Anatomi Naskah */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <Layers className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-bold text-sm text-slate-900">3. Struktur Anatomi Buku Lengkap</h3>
              </div>
              <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li><span className="font-semibold text-slate-800">Bagian Awal:</span> Halaman Judul Dalam, Halaman Hak Cipta, Prakata, Daftar Isi, Daftar Tabel & Gambar.</li>
                <li><span className="font-semibold text-slate-800">Bagian Isi:</span> Bab I (Pendahuluan & Konteks Riset), Bab Telaah Teoretis, Bab Pembahasan & Analisis Kritis, Bab Kesimpulan & Arah Kebijakan.</li>
                <li><span className="font-semibold text-slate-800">Bagian Akhir:</span> Glosarium Istilah Kunci, Daftar Pustaka Lengkap, Indeks Subjek/Nama, Biodata Ringkas Penulis.</li>
              </ol>
            </div>

            {/* 4. Kebijakan Plagiarisme */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">4. Kebijakan Anti-Plagiarisme & Turnitin</h3>
              </div>
              <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
                  <span className="font-bold text-emerald-800 block mb-1">Ambang Batas Turnitin &lt; 20%</span>
                  <p className="text-slate-700">
                    Naskah wajib memiliki skor kesamaan (similarity index) maksimal 20% dengan filter Turnitin resmi: <em>Exclude Bibliography On</em> dan <em>Exclude Matches &lt; 3 Words</em>.
                  </p>
                </div>
                <p>
                  Bebas dari fabrikasi data penelitian, falsifikasi temuan, dan self-plagiarism tanpa penyebutan sitasi sumber karya terdahulu yang sah.
                </p>
              </div>
            </div>

          </div>

          {/* Quick CTA to Submission */}
          <div className="bg-[#0F172A] text-white rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800">
            <div className="space-y-1">
              <h3 className="font-bold text-base text-white">Naskah Anda Sudah Sesuai Panduan?</h3>
              <p className="text-xs text-slate-300">Ajukan sekarang melalui portal online untuk evaluasi langsung oleh Dewan Redaksi.</p>
            </div>
            <button
              onClick={() => handleTabChange('kirim-naskah')}
              className="py-2.5 px-5 rounded-lg bg-[#DFBF64] hover:bg-[#c5a059] text-[#0F172A] font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span>Kirim Naskah Sekarang</span>
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
            <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">Alur Kerja Baku</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">5 Tahap Alur Proses Penerbitan</h2>
            <p className="text-xs text-slate-600">Transparan, terukur, berstandar akademik tinggi, dan didampingi tim editorial profesional.</p>
          </div>

          {/* Flowchart Timeline */}
          <div className="space-y-4 relative">
            {[
              {
                step: '01',
                title: 'Pengajuan & Peer Review',
                badge: '7 - 14 Hari Kerja',
                desc: 'Penulis mengirimkan draf lengkap dan sinopsis melalui portal resmi. Tim in-house melakukan verifikasi administratif dan uji plagiarisme Turnitin, dilanjutkan penelaahan substantif oleh Dewan Mitra Bestari untuk memastikan bobot keilmuan.',
                deliverables: ['Lembar Evaluasi Naskah', 'Peer-Review Matrix', 'Catatan Perbaikan Substantif']
              },
              {
                step: '02',
                title: 'Kontrak & HAKI',
                badge: '2 - 3 Hari Kerja',
                desc: 'Penandatanganan Perjanjian Penerbitan Buku resmi antara penulis dan PT Cakrawala Magna Scientia. Penetapan skema royalti (10-15%) atau hibah institusional, serta pendaftaran Surat Pencatatan Ciptaan ke e-Hakcipta DJKI Kemenkumham.',
                deliverables: ['Surat Perjanjian Penerbitan Formal', 'Pendaftaran e-Hakcipta DJKI', 'Perlindungan Hak Moral Penulis']
              },
              {
                step: '03',
                title: 'Editorial & Layout',
                badge: '5 - 7 Hari Kerja',
                desc: 'Editor ahli melaksanakan penyuntingan kebahasaan baku PUEBI, pengecekan istilah hukum dan perpajakan, serta typesetting format buku standar UNESCO B5. Tim grafis merancang desain cover 3D editorial berwibawa.',
                deliverables: ['Draf Layout Final (B5)', 'Desain Cover 3D Hardcover/Softcover', 'Author Proofing Approval']
              },
              {
                step: '04',
                title: 'Pengurusan ISBN & Metadata',
                badge: '3 - 7 Hari Kerja',
                desc: 'Pengajuan nomor registrasi ISBN resmi dan Barcode EAN ke Perpustakaan Nasional RI (Perpusnas). Pendaftaran Katalog Dalam Terbitan (KDT) dan metadata nasional sebagai bukti legalitas karya ilmiah terakreditasi.',
                deliverables: ['Nomor ISBN & Barcode Resmi', 'Katalog Dalam Terbitan (KDT)', 'Surat Keterangan Penerbitan']
              },
              {
                step: '05',
                title: 'Cetak & Digital Distro',
                badge: '4 - 7 Hari Kerja',
                desc: 'Produksi cetak fisik menggunakan kertas bookpaper premium 72 gsm dan jilid lux hardcover/softcover doff. Penyerahan 2 eksemplar wajib simpan ke Perpusnas sesuai UU No. 13/2018, serta peluncuran distribusi nasional.',
                deliverables: ['Buku Fisik Mutu Percetakan Tinggi', 'Versi E-Book Digital Ber-DRM', 'Distribusi CakraNexa Store & Toko Buku']
              }
            ].map((item, idx) => (
              <div 
                key={item.step} 
                className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs hover:border-[#D4AF37] transition-all relative overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#0F172A] text-[#DFBF64] flex items-center justify-center font-mono font-bold text-base flex-shrink-0">
                      {item.step}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-base text-slate-900">{item.title}</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">{item.desc}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px] text-slate-700">
                  <span className="font-semibold text-slate-900">Output Tahap Ini:</span>
                  {item.deliverables.map((d, dIdx) => (
                    <span key={dIdx} className="inline-flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 text-slate-700">
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>{d}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center pt-2">
            <button
              onClick={() => handleTabChange('kirim-naskah')}
              className="py-3 px-6 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-[#DFBF64] font-bold text-xs tracking-wide transition-all shadow-md inline-flex items-center gap-2 cursor-pointer"
            >
              <span>Mulai Tahap 1: Ajukan Naskah Anda</span>
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
            <span className="text-[11px] font-bold tracking-widest text-[#D4AF37] uppercase">Tanya Jawab</span>
            <h2 className="text-2xl font-bold text-slate-900">Frequently Asked Questions</h2>
            <p className="text-xs text-slate-600">Pertanyaan umum seputar ISBN, royalti, durasi penerbitan, dan hak cipta karya ilmiah.</p>
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
                  <span className="leading-snug">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${openFaq === idx ? 'rotate-180 text-[#0F172A]' : ''}`} />
                </button>
                {openFaq === idx && (
                  <div className="px-4 sm:px-5 pb-5 pt-0 text-xs text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/50">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Contact Support Helpbox */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-8">
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-slate-900">Punya Pertanyaan Spesifik Lainnya?</h4>
              <p className="text-xs text-slate-600">Konsultasikan naskah atau kebutuhan kelembagaan Anda langsung dengan Redaksi Ilmiah.</p>
            </div>
            <a
              href="https://wa.me/6285286146806?text=Halo%20Redaksi%20CakraNexa,%20saya%20ingin%20berkonsultasi%20mengenai%20layanan%20penerbitan%20buku."
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors whitespace-nowrap flex items-center justify-center gap-2"
            >
              <span>Chat WhatsApp Redaksi</span>
            </a>
          </div>

        </div>
      )}

    </div>
  );
};
