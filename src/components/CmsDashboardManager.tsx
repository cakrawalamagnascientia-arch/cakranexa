import React, { useState } from 'react';
import { 
  Book, 
  SiteContentSettings, 
  SiteNavigationItem, 
  SiteSubmenuItem, 
  HeroSlide, 
  HomeSectionConfig, 
  PenerbitanPackage, 
  WorkshopItem, 
  JournalItem, 
  TeamMember, 
  LegalDoc, 
  CareerItem, 
  BlogArticleItem,
  CompanyCredentials,
  AcademicModule
} from '../types';
import { 
  Save, 
  RotateCcw, 
  Layers, 
  Menu as MenuIcon, 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  Trophy, 
  TrendingUp, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  EyeOff, 
  Award, 
  BookOpen, 
  GraduationCap, 
  FileText, 
  Users, 
  Briefcase, 
  Newspaper, 
  ShieldCheck,
  Check,
  Search,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';

interface CmsDashboardManagerProps {
  books: Book[];
  siteContent: SiteContentSettings;
  onSaveContent: (updated: SiteContentSettings) => void;
  onResetContent: () => void;
  onUpdateBook?: (book: Book) => void;
  onNavigateHome?: () => void;
}

export const CmsDashboardManager: React.FC<CmsDashboardManagerProps> = ({
  books = [],
  siteContent,
  onSaveContent,
  onResetContent,
  onUpdateBook,
  onNavigateHome
}) => {
  const [content, setContent] = useState<SiteContentSettings>(siteContent);
  const [subTab, setSubTab] = useState<'bestseller-home' | 'navigation' | 'footer-contact' | 'other-pages'>('bestseller-home');
  const [otherPageSubTab, setOtherPageSubTab] = useState<'penerbitan' | 'pelatihan' | 'jurnal' | 'tim' | 'legalitas' | 'karir' | 'blog'>('penerbitan');
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [expandedCareerId, setExpandedCareerId] = useState<string | null>('car-mgr-publishing');

  // Sync state if prop changes
  React.useEffect(() => {
    setContent(siteContent);
  }, [siteContent]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleFieldChange = <K extends keyof SiteContentSettings>(key: K, value: SiteContentSettings[K]) => {
    setContent(prev => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSaveAll = () => {
    onSaveContent(content);
    setHasUnsavedChanges(false);
    showToast('Seluruh perubahan CMS & Konten Website berhasil disimpan secara realtime!');
  };

  const handleReset = () => {
    if (window.confirm('Apakah Anda yakin ingin mengembalikan seluruh konten website, menu, dan footer ke pengaturan bawaan CakraNexa?')) {
      onResetContent();
      setHasUnsavedChanges(false);
      showToast('Konten website berhasil di-reset ke nilai default.');
    }
  };

  // Best Seller Toggle Helper
  const handleToggleBestSellerBook = (book: Book) => {
    const isCurrently = Boolean(book.isBestSeller || book.badge === 'Best Seller');
    const updatedBook: Book = {
      ...book,
      isBestSeller: !isCurrently,
      badge: !isCurrently ? 'Best Seller' : (book.bukuTerbaru ? 'Buku Terbaru' : 'Karya Ilmiah')
    };
    if (onUpdateBook) {
      onUpdateBook(updatedBook);
    }
    showToast(`Buku "${book.name.slice(0, 30)}..." ${!isCurrently ? 'dijadikan' : 'dihapus dari'} Best Seller.`);
  };

  return (
    <div id="cms-dashboard-root" className="space-y-6 text-left">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-lg bg-slate-900 text-[#DFBF64] border border-[#D4AF37]/50 shadow-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Save/Reset Bar */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#D4AF37]/15 text-[#D4AF37]">
              <Layers className="w-5 h-5 text-[#B89628]" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">Manajemen Konten & Menu (CMS Realtime)</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kelola Section Beranda, Listing Best Seller running ticker, Menu Navigasi, Submenu, Footer, Kontak, Alamat, dan Seluruh Konten Halaman.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2 shrink-0">
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
              title="Buka Halaman Depan"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Lihat Website</span>
            </button>
          )}

          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-medium transition-colors cursor-pointer"
            title="Reset ke Bawaan Sistem"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Bawaan</span>
          </button>

          <button
            onClick={handleSaveAll}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer ${
              hasUnsavedChanges
                ? 'bg-[#D4AF37] hover:bg-[#B89628] text-slate-950 ring-2 ring-[#D4AF37]/50 animate-pulse'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{hasUnsavedChanges ? 'Simpan Perubahan *' : 'Simpan Semua Perubahan'}</span>
          </button>
        </div>
      </div>

      {/* CMS Sub-navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        <button
          onClick={() => setSubTab('bestseller-home')}
          className={`px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all shrink-0 flex items-center gap-2 border-b-2 cursor-pointer ${
            subTab === 'bestseller-home'
              ? 'border-[#D4AF37] text-slate-900 bg-white shadow-xs font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <TrendingUp className={`w-4 h-4 ${subTab === 'bestseller-home' ? 'text-amber-500' : 'text-slate-400'}`} />
          <span>1. Beranda & Best Seller Section</span>
        </button>

        <button
          onClick={() => setSubTab('navigation')}
          className={`px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all shrink-0 flex items-center gap-2 border-b-2 cursor-pointer ${
            subTab === 'navigation'
              ? 'border-[#D4AF37] text-slate-900 bg-white shadow-xs font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MenuIcon className={`w-4 h-4 ${subTab === 'navigation' ? 'text-[#B89628]' : 'text-slate-400'}`} />
          <span>2. Menu & Submenu Navigasi</span>
        </button>

        <button
          onClick={() => setSubTab('footer-contact')}
          className={`px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all shrink-0 flex items-center gap-2 border-b-2 cursor-pointer ${
            subTab === 'footer-contact'
              ? 'border-[#D4AF37] text-slate-900 bg-white shadow-xs font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MapPin className={`w-4 h-4 ${subTab === 'footer-contact' ? 'text-[#B89628]' : 'text-slate-400'}`} />
          <span>3. Header, Footer, Kontak & Legalitas</span>
        </button>

        <button
          onClick={() => setSubTab('other-pages')}
          className={`px-4 py-2.5 rounded-t-lg text-xs font-bold transition-all shrink-0 flex items-center gap-2 border-b-2 cursor-pointer ${
            subTab === 'other-pages'
              ? 'border-[#D4AF37] text-slate-900 bg-white shadow-xs font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className={`w-4 h-4 ${subTab === 'other-pages' ? 'text-[#B89628]' : 'text-slate-400'}`} />
          <span>4. Konten Halaman Lainnya</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: BERANDA & BEST SELLER SECTION */}
      {/* ========================================================================= */}
      {subTab === 'bestseller-home' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Card A: Section 2 Running Best Seller Listing Configuration */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
                  <TrendingUp className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Pengaturan Section 2: Smooth Running Best Seller</h2>
                  <p className="text-xs text-slate-500">Kustomisasi teks judul, lencana, kecepatan marquee, dan status tampil section 2 beranda.</p>
                </div>
              </div>

              {/* Toggle Enable Section 2 */}
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={content.bestSellerSection?.isEnabled !== false}
                  onChange={(e) => {
                    handleFieldChange('bestSellerSection', {
                      ...content.bestSellerSection,
                      isEnabled: e.target.checked
                    });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D4AF37]"></div>
                <span className="text-xs font-bold text-slate-700">
                  {content.bestSellerSection?.isEnabled !== false ? 'Section Aktif' : 'Section Dinonaktifkan'}
                </span>
              </label>
            </div>

            {/* Form Fields for Section 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Badge / Lencana Section</label>
                <input
                  type="text"
                  value={content.bestSellerSection?.badge || ''}
                  onChange={(e) => {
                    handleFieldChange('bestSellerSection', {
                      ...content.bestSellerSection,
                      badge: e.target.value
                    });
                  }}
                  placeholder="MONOGRAFI BEST SELLER AKADEMIK"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kecepatan Gulir Running Ticker</label>
                <select
                  value={content.bestSellerSection?.speed || 'normal'}
                  onChange={(e) => {
                    handleFieldChange('bestSellerSection', {
                      ...content.bestSellerSection,
                      speed: e.target.value as any
                    });
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none bg-white"
                >
                  <option value="slow">Lambat (Halus & Santai)</option>
                  <option value="normal">Normal (Standar Direkomendasikan)</option>
                  <option value="fast">Cepat (Dinamis)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Utama Section 2</label>
                <input
                  type="text"
                  value={content.bestSellerSection?.title || ''}
                  onChange={(e) => {
                    handleFieldChange('bestSellerSection', {
                      ...content.bestSellerSection,
                      title: e.target.value
                    });
                  }}
                  placeholder="Koleksi Buku Terlaris Rujukan Pakar, Dosen, & Praktisi"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi / Subtitle Section 2</label>
                <textarea
                  rows={2}
                  value={content.bestSellerSection?.subtitle || ''}
                  onChange={(e) => {
                    handleFieldChange('bestSellerSection', {
                      ...content.bestSellerSection,
                      subtitle: e.target.value
                    });
                  }}
                  placeholder="Deretan monografi ilmiah ber-ISBN dengan tingkat adopsi kurikulum dan sitasi tertinggi..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                />
              </div>
            </div>

            {/* Checkbox Toggles for Features */}
            <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-100 text-xs text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={content.bestSellerSection?.autoScroll !== false}
                  onChange={(e) => {
                    handleFieldChange('bestSellerSection', {
                      ...content.bestSellerSection,
                      autoScroll: e.target.checked
                    });
                  }}
                  className="rounded text-[#D4AF37] focus:ring-[#D4AF37]"
                />
                <span>Auto-scroll Otomatis Aktif</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={content.bestSellerSection?.pauseOnHover !== false}
                  onChange={(e) => {
                    handleFieldChange('bestSellerSection', {
                      ...content.bestSellerSection,
                      pauseOnHover: e.target.checked
                    });
                  }}
                  className="rounded text-[#D4AF37] focus:ring-[#D4AF37]"
                />
                <span>Jeda Gulir Saat Kursor Di Atas Kartu (Pause on Hover)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={content.bestSellerSection?.showQuickBuy !== false}
                  onChange={(e) => {
                    handleFieldChange('bestSellerSection', {
                      ...content.bestSellerSection,
                      showQuickBuy: e.target.checked
                    });
                  }}
                  className="rounded text-[#D4AF37] focus:ring-[#D4AF37]"
                />
                <span>Tampilkan Tombol "+ Keranjang" & "Beli Langsung"</span>
              </label>
            </div>
          </div>

          {/* Card B: Interactive Best Seller Books Selector */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span>Penentuan & Seleksi Buku Best Seller ({books.filter(b => b.isBestSeller || b.badge === 'Best Seller').length} Aktif)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Klik tombol bintang pada buku di bawah untuk menjadikannya atau mencopotnya dari listing running Best Seller secara realtime.
                </p>
              </div>

              {/* Quick Search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari judul / ISBN..."
                  value={bookSearchQuery}
                  onChange={(e) => setBookSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>
            </div>

            {/* Books Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
              {books
                .filter(b => {
                  if (!bookSearchQuery) return true;
                  const q = bookSearchQuery.toLowerCase();
                  return b.name.toLowerCase().includes(q) || b.isbn.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
                })
                .map((book) => {
                  const isBestSeller = Boolean(book.isBestSeller || book.badge === 'Best Seller');
                  return (
                    <div
                      key={book.id}
                      className={`p-3 rounded-lg border flex items-center justify-between gap-3 transition-all ${
                        isBestSeller
                          ? 'border-amber-400 bg-amber-50/60 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={book.coverBuku}
                          alt={book.name}
                          className="w-10 h-14 object-cover rounded bg-slate-100 shrink-0 border border-slate-200"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
                            {book.name}
                          </h4>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {book.category} • Rp {book.harga.toLocaleString('id-ID')}
                          </div>
                        </div>
                      </div>

                      {/* Best Seller Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleBestSellerBook(book)}
                        className={`p-2 rounded-lg text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                          isBestSeller
                            ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                        title={isBestSeller ? 'Hapus dari Best Seller' : 'Jadikan Best Seller'}
                      >
                        {isBestSeller ? (
                          <span className="flex items-center gap-1 text-[11px]">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>Best Seller</span>
                          </span>
                        ) : (
                          <span className="text-[11px]">+ Jadikan</span>
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Card C: All Homepage Sections Configuration (Order & Visibility) */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#B89628]" />
                <span>Pengaturan Seluruh Section di Beranda (Homepage Layout)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Aktifkan, nonaktifkan, atau ubah judul dan teks pada setiap blok bagian halaman depan.
              </p>
            </div>

            <div className="space-y-3">
              {(content.homeSections || []).map((sec, idx) => (
                <div 
                  key={sec.id}
                  className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{sec.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {sec.title || 'Section Beranda'} {sec.badge ? `• [${sec.badge}]` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sec.isEnabled !== false}
                        onChange={(e) => {
                          const updated = [...(content.homeSections || [])];
                          updated[idx] = { ...updated[idx], isEnabled: e.target.checked };
                          handleFieldChange('homeSections', updated);
                        }}
                        className="rounded text-[#D4AF37] focus:ring-[#D4AF37]"
                      />
                      <span>{sec.isEnabled !== false ? 'Aktif Tampil' : 'Disembunyikan'}</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: NAVIGATION MENU & SUBMENUS */}
      {/* ========================================================================= */}
      {subTab === 'navigation' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MenuIcon className="w-5 h-5 text-[#B89628]" />
                  <span>Manajemen Menu Navigasi Utama & Submenu</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ubah label nama menu, aktifkan dropdown, atur submenu, atau sembunyikan menu tertentu di Navbar.
                </p>
              </div>

              {/* Add Menu Button */}
              <button
                type="button"
                onClick={() => {
                  const newNav: SiteNavigationItem = {
                    id: `nav-${Date.now()}`,
                    label: 'Menu Baru',
                    page: 'katalog',
                    order: (content.navigation || []).length + 1,
                    isEnabled: true,
                    hasDropdown: false
                  };
                  handleFieldChange('navigation', [...(content.navigation || []), newNav]);
                  showToast('Menu baru ditambahkan ke daftar navigasi.');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#B89628] text-slate-950 text-xs font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Menu Baru</span>
              </button>
            </div>

            {/* List of Menus */}
            <div className="space-y-4">
              {(content.navigation || []).map((item, navIdx) => (
                <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="w-6 h-6 rounded-md bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {navIdx + 1}
                      </span>
                      
                      {/* Edit Menu Label */}
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => {
                          const updated = [...(content.navigation || [])];
                          updated[navIdx] = { ...updated[navIdx], label: e.target.value };
                          handleFieldChange('navigation', updated);
                        }}
                        className="px-3 py-1 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#D4AF37] w-48"
                        placeholder="Label Menu"
                      />

                      {/* Select Page Target */}
                      <select
                        value={item.page}
                        onChange={(e) => {
                          const updated = [...(content.navigation || [])];
                          updated[navIdx] = { ...updated[navIdx], page: e.target.value as any };
                          handleFieldChange('navigation', updated);
                        }}
                        className="px-3 py-1 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#D4AF37]"
                      >
                        <option value="home">Home</option>
                        <option value="katalog">Katalog</option>
                        <option value="penerbitan">Penerbitan</option>
                        <option value="pelatihan">Pelatihan</option>
                        <option value="jurnal">Jurnal</option>
                        <option value="tentang-kami">Tentang Kami</option>
                        <option value="blog">Blog</option>
                        <option value="career">Career</option>
                        <option value="kontak">Kontak</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Dropdown Toggle */}
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.hasDropdown}
                          onChange={(e) => {
                            const updated = [...(content.navigation || [])];
                            updated[navIdx] = { 
                              ...updated[navIdx], 
                              hasDropdown: e.target.checked,
                              submenus: e.target.checked ? (updated[navIdx].submenus || []) : undefined
                            };
                            handleFieldChange('navigation', updated);
                          }}
                          className="rounded text-[#D4AF37] focus:ring-[#D4AF37]"
                        />
                        <span>Punya Submenu</span>
                      </label>

                      {/* Visible Toggle */}
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.isEnabled}
                          onChange={(e) => {
                            const updated = [...(content.navigation || [])];
                            updated[navIdx] = { ...updated[navIdx], isEnabled: e.target.checked };
                            handleFieldChange('navigation', updated);
                          }}
                          className="rounded text-[#D4AF37] focus:ring-[#D4AF37]"
                        />
                        <span>{item.isEnabled ? 'Tampil' : 'Sembunyi'}</span>
                      </label>

                      {/* Delete Menu */}
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (content.navigation || []).filter((_, i) => i !== navIdx);
                          handleFieldChange('navigation', updated);
                          showToast(`Menu "${item.label}" dihapus.`);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Hapus Menu"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Submenu Management if Dropdown Enabled */}
                  {item.hasDropdown && (
                    <div className="ml-8 mt-2 p-3 rounded-lg bg-white border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 pb-1 border-b border-slate-100">
                        <span>Daftar Submenu ({item.label}):</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...(content.navigation || [])];
                            const currentSubs = updated[navIdx].submenus || [];
                            updated[navIdx].submenus = [
                              ...currentSubs,
                              {
                                id: `sub-${Date.now()}`,
                                label: 'Submenu Baru',
                                subSection: 'all',
                                order: currentSubs.length + 1
                              }
                            ];
                            handleFieldChange('navigation', updated);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-[#B89628] hover:underline font-bold cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Tambah Submenu</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {(item.submenus || []).map((sub, subIdx) => (
                          <div key={sub.id} className="flex items-center gap-1.5 p-1.5 rounded bg-slate-50 border border-slate-200 text-xs">
                            <input
                              type="text"
                              value={sub.label}
                              onChange={(e) => {
                                const updated = [...(content.navigation || [])];
                                const subs = [...(updated[navIdx].submenus || [])];
                                subs[subIdx] = { ...subs[subIdx], label: e.target.value };
                                updated[navIdx].submenus = subs;
                                handleFieldChange('navigation', updated);
                              }}
                              className="flex-1 px-1.5 py-0.5 text-[11px] bg-white border border-slate-300 rounded"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...(content.navigation || [])];
                                updated[navIdx].submenus = (updated[navIdx].submenus || []).filter((_, i) => i !== subIdx);
                                handleFieldChange('navigation', updated);
                              }}
                              className="text-slate-400 hover:text-rose-600 p-0.5"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: HEADER, FOOTER, KONTAK & LEGALITAS */}
      {/* ========================================================================= */}
      {subTab === 'footer-contact' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Card: Brand & General Info */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#B89628]" />
              <span>Identitas Brand & Badan Hukum</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Brand Utama</label>
                <input
                  type="text"
                  value={content.brandName || ''}
                  onChange={(e) => handleFieldChange('brandName', e.target.value)}
                  placeholder="CAKRA"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sub-nama Brand</label>
                <input
                  type="text"
                  value={content.brandSubname || ''}
                  onChange={(e) => handleFieldChange('brandSubname', e.target.value)}
                  placeholder="NEXA"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap PT Perusahaan</label>
                <input
                  type="text"
                  value={content.companyFullName || ''}
                  onChange={(e) => handleFieldChange('companyFullName', e.target.value)}
                  placeholder="PT CAKRAWALA MAGNA SCIENTIA"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>
            </div>
          </div>

          {/* Card: Alamat, Telepon, Email, Jam Kerja */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#B89628]" />
              <span>Alamat Kantor, Kontak Resmi, & Jam Kerja</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Kantor Lengkap</label>
                <input
                  type="text"
                  value={content.footer?.address || ''}
                  onChange={(e) => {
                    handleFieldChange('footer', {
                      ...content.footer,
                      address: e.target.value
                    });
                  }}
                  placeholder="Gedung Graha Scientia Lt. 4, Jl. Salemba Raya No. 18, Jakarta Pusat"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Telepon Kantor</label>
                <input
                  type="text"
                  value={content.footer?.phone || ''}
                  onChange={(e) => {
                    handleFieldChange('footer', {
                      ...content.footer,
                      phone: e.target.value
                    });
                  }}
                  placeholder="+62 21 3912 8841"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Layanan & Redaksi</label>
                <input
                  type="text"
                  value={content.footer?.whatsapp || ''}
                  onChange={(e) => {
                    handleFieldChange('footer', {
                      ...content.footer,
                      whatsapp: e.target.value
                    });
                  }}
                  placeholder="+62 812 8899 2341"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Resmi Redaksi</label>
                <input
                  type="text"
                  value={content.footer?.email || ''}
                  onChange={(e) => {
                    handleFieldChange('footer', {
                      ...content.footer,
                      email: e.target.value
                    });
                  }}
                  placeholder="redaksi@cakranexa.com"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Operasional / Hari Kerja</label>
                <input
                  type="text"
                  value={content.footer?.workingHours || ''}
                  onChange={(e) => {
                    handleFieldChange('footer', {
                      ...content.footer,
                      workingHours: e.target.value
                    });
                  }}
                  placeholder="Senin - Jumat: 08:30 - 17:30 WIB"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Profil Footer</label>
                <textarea
                  rows={2}
                  value={content.footer?.description || ''}
                  onChange={(e) => {
                    handleFieldChange('footer', {
                      ...content.footer,
                      description: e.target.value
                    });
                  }}
                  placeholder="Penerbit monografi ilmiah, buku teks akademik..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Teks Hak Cipta (Copyright)</label>
                <input
                  type="text"
                  value={content.footer?.copyrightText || ''}
                  onChange={(e) => {
                    handleFieldChange('footer', {
                      ...content.footer,
                      copyrightText: e.target.value
                    });
                  }}
                  placeholder="Hak Cipta Dilindungi Undang-Undang..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>
            </div>
          </div>

          {/* Card: 4 Trust Badges in Footer */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-[#B89628]" />
              <span>4 Lencana Kredibilitas & Legalitas (Footer Trust Badges)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(content.footer?.trustBadges || []).map((badge, bIdx) => (
                <div key={badge.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Lencana #{bIdx + 1}</span>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Judul Lencana</label>
                    <input
                      type="text"
                      value={badge.title}
                      onChange={(e) => {
                        const updated = [...(content.footer?.trustBadges || [])];
                        updated[bIdx] = { ...updated[bIdx], title: e.target.value };
                        handleFieldChange('footer', { ...content.footer, trustBadges: updated });
                      }}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Sub-teks / Nomor Registrasi</label>
                    <input
                      type="text"
                      value={badge.subtitle}
                      onChange={(e) => {
                        const updated = [...(content.footer?.trustBadges || [])];
                        updated[bIdx] = { ...updated[bIdx], subtitle: e.target.value };
                        handleFieldChange('footer', { ...content.footer, trustBadges: updated });
                      }}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 bg-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 4: KONTEN HALAMAN LAINNYA (PENERBITAN, PELATIHAN, JURNAL, TIM, DLL) */}
      {/* ========================================================================= */}
      {subTab === 'other-pages' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Sub-bar for other pages */}
          <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto">
            {[
              { id: 'penerbitan', label: 'Paket Penerbitan', icon: BookOpen },
              { id: 'pelatihan', label: 'Pelatihan / Workshop', icon: GraduationCap },
              { id: 'jurnal', label: 'Jurnal Ilmiah', icon: FileText },
              { id: 'tim', label: 'Dewan Redaksi & Tim', icon: Users },
              { id: 'legalitas', label: 'Dokumen Legalitas', icon: ShieldCheck },
              { id: 'karir', label: 'Lowongan Karir', icon: Briefcase },
              { id: 'blog', label: 'Artikel Blog', icon: Newspaper }
            ].map((pg) => {
              const Icon = pg.icon;
              return (
                <button
                  key={pg.id}
                  onClick={() => setOtherPageSubTab(pg.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    otherPageSubTab === pg.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{pg.label}</span>
                </button>
              );
            })}
          </div>

          {/* 1. Paket Penerbitan CRUD */}
          {otherPageSubTab === 'penerbitan' && (
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Daftar Paket Layanan Penerbitan Buku</h3>
                <button
                  type="button"
                  onClick={() => {
                    const newPkg: PenerbitanPackage = {
                      id: `pkg-${Date.now()}`,
                      name: 'Paket Penerbitan Baru',
                      badge: 'Baru',
                      priceFormatted: 'Rp 3.000.000',
                      priceNumber: 3000000,
                      description: 'Deskripsi paket penerbitan buku ilmiah...',
                      features: ['ISBN Resmi', 'Layouting Standar B5', 'Master PDF'],
                      order: (content.penerbitanPackages || []).length + 1
                    };
                    handleFieldChange('penerbitanPackages', [...(content.penerbitanPackages || []), newPkg]);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#D4AF37] text-slate-950 rounded text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Paket</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(content.penerbitanPackages || []).map((pkg, idx) => (
                  <div key={pkg.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#B89628] uppercase">{pkg.badge}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (content.penerbitanPackages || []).filter((_, i) => i !== idx);
                          handleFieldChange('penerbitanPackages', updated);
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={pkg.name}
                      onChange={(e) => {
                        const updated = [...(content.penerbitanPackages || [])];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        handleFieldChange('penerbitanPackages', updated);
                      }}
                      className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded"
                    />

                    <input
                      type="text"
                      value={pkg.priceFormatted}
                      onChange={(e) => {
                        const updated = [...(content.penerbitanPackages || [])];
                        updated[idx] = { ...updated[idx], priceFormatted: e.target.value };
                        handleFieldChange('penerbitanPackages', updated);
                      }}
                      className="w-full px-2 py-1 text-xs font-semibold text-[#B89628] bg-white border border-slate-300 rounded"
                    />

                    <textarea
                      rows={2}
                      value={pkg.description}
                      onChange={(e) => {
                        const updated = [...(content.penerbitanPackages || [])];
                        updated[idx] = { ...updated[idx], description: e.target.value };
                        handleFieldChange('penerbitanPackages', updated);
                      }}
                      className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Pelatihan / Workshop CRUD */}
          {otherPageSubTab === 'pelatihan' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Daftar Jadwal Workshop & Pelatihan</h3>
                <button
                  type="button"
                  onClick={() => {
                    const newWs: WorkshopItem = {
                      id: `ws-${Date.now()}`,
                      title: 'Workshop Pajak & Akuntansi Baru',
                      speaker: 'Dr. Pakar Hukum & Fiskal',
                      dateFormatted: 'Sabtu, 30 November 2026',
                      priceFormatted: 'Rp 650.000',
                      badge: 'Sertifikat SKP',
                      description: 'Membahas regulasi dan studi kasus perpajakan...',
                      benefits: ['E-Sertifikat SKP', 'Buku Monografi', 'Modul Excel'],
                      order: (content.workshops || []).length + 1
                    };
                    handleFieldChange('workshops', [...(content.workshops || []), newWs]);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#D4AF37] text-slate-950 rounded text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Workshop</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(content.workshops || []).map((ws, idx) => (
                  <div key={ws.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-600 uppercase">{ws.badge}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (content.workshops || []).filter((_, i) => i !== idx);
                          handleFieldChange('workshops', updated);
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={ws.title}
                      onChange={(e) => {
                        const updated = [...(content.workshops || [])];
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        handleFieldChange('workshops', updated);
                      }}
                      className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded"
                    />

                    <input
                      type="text"
                      value={ws.speaker}
                      onChange={(e) => {
                        const updated = [...(content.workshops || [])];
                        updated[idx] = { ...updated[idx], speaker: e.target.value };
                        handleFieldChange('workshops', updated);
                      }}
                      placeholder="Nama Narasumber / Pembicara"
                      className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={ws.dateFormatted}
                        onChange={(e) => {
                          const updated = [...(content.workshops || [])];
                          updated[idx] = { ...updated[idx], dateFormatted: e.target.value };
                          handleFieldChange('workshops', updated);
                        }}
                        placeholder="Jadwal Tanggal"
                        className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded"
                      />
                      <input
                        type="text"
                        value={ws.priceFormatted}
                        onChange={(e) => {
                          const updated = [...(content.workshops || [])];
                          updated[idx] = { ...updated[idx], priceFormatted: e.target.value };
                          handleFieldChange('workshops', updated);
                        }}
                        placeholder="Biaya Investasi"
                        className="w-full px-2 py-1 text-[11px] font-bold text-[#B89628] bg-white border border-slate-300 rounded"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: 6 Modul Pelatihan Akademik Otoritatif */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-bold tracking-widest text-[#B89628] uppercase">Kurikulum Akademik</span>
                  <h3 className="text-sm font-bold text-slate-900">6 Modul Pelatihan Akademik Otoritatif (PelatihanView)</h3>
                  <p className="text-xs text-slate-500">Kelola judul modul, jadwal angkatan, biaya investasi, dan durasi pelatihan.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newMod: AcademicModule = {
                      id: `mod-${Date.now()}`,
                      number: `0${((content.academicModules || []).length + 1)}`,
                      title: 'Modul Pelatihan Akademik Baru',
                      subtitle: 'Deskripsi kompetensi dan hasil luaran pelatihan...',
                      category: 'penulisan',
                      badge: 'Standar DIKTI',
                      duration: '2 Hari Intensif (16 Jam Pelatihan)',
                      format: 'Hybrid (Tatap Muka & Live Zoom)',
                      schedule: 'Angkatan Baru: Tanggal Pelaksanaan',
                      investment: 'Rp 2.500.000 / Peserta',
                      targetAudience: 'Dosen, Peneliti, dan Mahasiswa Pascasarjana.',
                      curriculum: ['Materi 1', 'Materi 2'],
                      facilities: ['E-Sertifikat Bernilai KUM', 'Modul Panduan Lengkap']
                    };
                    handleFieldChange('academicModules', [...(content.academicModules || []), newMod]);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#D4AF37] text-slate-950 rounded text-xs font-bold hover:bg-[#c5a059] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Modul</span>
                </button>
              </div>

              <div className="space-y-3">
                {(content.academicModules || []).map((mod, mIdx) => (
                  <div key={mod.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-[#DFBF64] text-[10px] font-mono font-bold">
                          MODUL #{mod.number || mIdx + 1}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          Kategori: {mod.category}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (content.academicModules || []).filter((_, i) => i !== mIdx);
                          handleFieldChange('academicModules', updated);
                        }}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Judul Modul</label>
                        <input
                          type="text"
                          value={mod.title}
                          onChange={(e) => {
                            const updated = [...(content.academicModules || [])];
                            updated[mIdx] = { ...updated[mIdx], title: e.target.value };
                            handleFieldChange('academicModules', updated);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Biaya Investasi</label>
                        <input
                          type="text"
                          value={mod.investment}
                          onChange={(e) => {
                            const updated = [...(content.academicModules || [])];
                            updated[mIdx] = { ...updated[mIdx], investment: e.target.value };
                            handleFieldChange('academicModules', updated);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-bold text-emerald-600 bg-white border border-slate-300 rounded"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Jadwal Pelaksanaan</label>
                        <input
                          type="text"
                          value={mod.schedule}
                          onChange={(e) => {
                            const updated = [...(content.academicModules || [])];
                            updated[mIdx] = { ...updated[mIdx], schedule: e.target.value };
                            handleFieldChange('academicModules', updated);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Format & Lokasi</label>
                        <input
                          type="text"
                          value={mod.format}
                          onChange={(e) => {
                            const updated = [...(content.academicModules || [])];
                            updated[mIdx] = { ...updated[mIdx], format: e.target.value };
                            handleFieldChange('academicModules', updated);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Sub-Judul / Deskripsi Singkat</label>
                        <input
                          type="text"
                          value={mod.subtitle}
                          onChange={(e) => {
                            const updated = [...(content.academicModules || [])];
                            updated[mIdx] = { ...updated[mIdx], subtitle: e.target.value };
                            handleFieldChange('academicModules', updated);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

          {/* 3. Jurnal Ilmiah CRUD */}
          {otherPageSubTab === 'jurnal' && (
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Daftar Jurnal Ilmiah Terakreditasi</h3>
                <button
                  type="button"
                  onClick={() => {
                    const newJrn: JournalItem = {
                      id: `jrn-${Date.now()}`,
                      title: 'Jurnal Riset Ilmiah Baru',
                      abbreviation: 'JRIB',
                      issn: 'e-ISSN: 3000-0000',
                      sintaRank: 'SINTA Terakreditasi',
                      description: 'Publikasi ilmiah berkala hasil penelitian terkini...',
                      frequency: 'Terbit 2 Kali Setahun',
                      focusScope: ['Hukum Pajak', 'Akuntansi Forensik'],
                      order: (content.journals || []).length + 1
                    };
                    handleFieldChange('journals', [...(content.journals || []), newJrn]);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#D4AF37] text-slate-950 rounded text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Jurnal</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(content.journals || []).map((jrn, idx) => (
                  <div key={jrn.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase">{jrn.sintaRank}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (content.journals || []).filter((_, i) => i !== idx);
                          handleFieldChange('journals', updated);
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={jrn.title}
                      onChange={(e) => {
                        const updated = [...(content.journals || [])];
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        handleFieldChange('journals', updated);
                      }}
                      className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded"
                    />

                    <input
                      type="text"
                      value={jrn.issn}
                      onChange={(e) => {
                        const updated = [...(content.journals || [])];
                        updated[idx] = { ...updated[idx], issn: e.target.value };
                        handleFieldChange('journals', updated);
                      }}
                      className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Tim & Dewan Pakar CRUD */}
          {otherPageSubTab === 'tim' && (
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Dewan Redaksi & Tim Pakar</h3>
                <button
                  type="button"
                  onClick={() => {
                    const newTm: TeamMember = {
                      id: `tm-${Date.now()}`,
                      name: 'Nama Pakar / Gelar',
                      role: 'Editor Ahli Sebidang',
                      affiliation: 'Universitas Terkemuka',
                      expertise: 'Hukum / Akuntansi / Pajak',
                      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
                      order: (content.teamMembers || []).length + 1
                    };
                    handleFieldChange('teamMembers', [...(content.teamMembers || []), newTm]);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#D4AF37] text-slate-950 rounded text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Anggota Tim</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(content.teamMembers || []).map((tm, idx) => (
                  <div key={tm.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <img src={tm.avatarUrl} alt={tm.name} className="w-10 h-10 rounded-full object-cover border border-slate-300" />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (content.teamMembers || []).filter((_, i) => i !== idx);
                          handleFieldChange('teamMembers', updated);
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={tm.name}
                      onChange={(e) => {
                        const updated = [...(content.teamMembers || [])];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        handleFieldChange('teamMembers', updated);
                      }}
                      className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded"
                    />

                    <input
                      type="text"
                      value={tm.role}
                      onChange={(e) => {
                        const updated = [...(content.teamMembers || [])];
                        updated[idx] = { ...updated[idx], role: e.target.value };
                        handleFieldChange('teamMembers', updated);
                      }}
                      placeholder="Jabatan / Peran"
                      className="w-full px-2 py-1 text-[11px] font-semibold text-[#B89628] bg-white border border-slate-300 rounded"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Dokumen Legalitas & Kredensial Resmi Perusahaan */}
          {otherPageSubTab === 'legalitas' && (
            <div className="space-y-6">
              {/* Card 1: 4 Kredensial Utama Perusahaan */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <span className="text-[10px] font-bold tracking-widest text-[#B89628] uppercase">Legalitas & Kredibilitas Resmi</span>
                  <h3 className="text-base font-bold text-slate-900">4 Kredensial Legalitas & Izin Resmi PT</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Data ini ditampilkan secara dinamis di halaman <strong>Tentang Kami (Tab Legalitas & Hero Status)</strong> dan <strong>Footer Trust Badges</strong>. Jika dikosongkan, frontend akan otomatis menampilkan tanda strip (-).
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
                  {/* 1. Pengesahan Kemenkumham RI */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>1. Pengesahan Kemenkumham RI</span>
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono">SK Menkumham RI</span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Nomor Pengesahan / SK Menkumham</span>
                      <input
                        type="text"
                        value={content.companyCredentials?.kemenkumham || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updatedCreds = {
                            ...(content.companyCredentials || {
                              kemenkumham: '',
                              kemenkumhamNote: '',
                              nib: '',
                              nibNote: '',
                              npwp: '',
                              npwpNote: '',
                              keanggotaanPenerbit: '',
                              keanggotaanPenerbitNote: ''
                            }),
                            kemenkumham: val
                          };
                          const updatedBadges = [...(content.footer?.trustBadges || [])];
                          if (updatedBadges[3]) updatedBadges[3] = { ...updatedBadges[3], subtitle: val };
                          const updatedLegalDocs = [...(content.legalDocs || [])];
                          if (updatedLegalDocs[0]) updatedLegalDocs[0] = { ...updatedLegalDocs[0], number: val };

                          setContent(prev => ({
                            ...prev,
                            companyCredentials: updatedCreds,
                            footer: { ...prev.footer, trustBadges: updatedBadges },
                            legalDocs: updatedLegalDocs
                          }));
                          setHasUnsavedChanges(true);
                        }}
                        placeholder="Contoh: AHU-0042891.AH.01.01.TAHUN 2023"
                        className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Keterangan Dokumen</span>
                      <input
                        type="text"
                        value={content.companyCredentials?.kemenkumhamNote || ''}
                        onChange={(e) => {
                          const updatedCreds = {
                            ...(content.companyCredentials || {
                              kemenkumham: '',
                              kemenkumhamNote: '',
                              nib: '',
                              nibNote: '',
                              npwp: '',
                              npwpNote: '',
                              keanggotaanPenerbit: '',
                              keanggotaanPenerbitNote: ''
                            }),
                            kemenkumhamNote: e.target.value
                          };
                          handleFieldChange('companyCredentials', updatedCreds);
                        }}
                        placeholder="Akta Notaris & SK Pengesahan Menkumham RI"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* 2. Nomor Induk Berusaha (NIB) */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span>2. Nomor Induk Berusaha (NIB)</span>
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono">BKPM / OSS RBA</span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Nomor NIB</span>
                      <input
                        type="text"
                        value={content.companyCredentials?.nib || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updatedCreds = {
                            ...(content.companyCredentials || {
                              kemenkumham: '',
                              kemenkumhamNote: '',
                              nib: '',
                              nibNote: '',
                              npwp: '',
                              npwpNote: '',
                              keanggotaanPenerbit: '',
                              keanggotaanPenerbitNote: ''
                            }),
                            nib: val
                          };
                          const updatedLegalDocs = [...(content.legalDocs || [])];
                          if (updatedLegalDocs[2]) updatedLegalDocs[2] = { ...updatedLegalDocs[2], number: val };

                          setContent(prev => ({
                            ...prev,
                            companyCredentials: updatedCreds,
                            legalDocs: updatedLegalDocs
                          }));
                          setHasUnsavedChanges(true);
                        }}
                        placeholder="Contoh: 1903230089142"
                        className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Keterangan Klasifikasi KBLI</span>
                      <input
                        type="text"
                        value={content.companyCredentials?.nibNote || ''}
                        onChange={(e) => {
                          const updatedCreds = {
                            ...(content.companyCredentials || {
                              kemenkumham: '',
                              kemenkumhamNote: '',
                              nib: '',
                              nibNote: '',
                              npwp: '',
                              npwpNote: '',
                              keanggotaanPenerbit: '',
                              keanggotaanPenerbitNote: ''
                            }),
                            nibNote: e.target.value
                          };
                          handleFieldChange('companyCredentials', updatedCreds);
                        }}
                        placeholder="KBLI 58111 (Penerbitan Buku) & KBLI 58130"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* 3. NPWP Perusahaan */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-amber-600" />
                        <span>3. NPWP Perusahaan</span>
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono">DJP / Kemenkeu RI</span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Nomor Pokok Wajib Pajak</span>
                      <input
                        type="text"
                        value={content.companyCredentials?.npwp || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updatedCreds = {
                            ...(content.companyCredentials || {
                              kemenkumham: '',
                              kemenkumhamNote: '',
                              nib: '',
                              nibNote: '',
                              npwp: '',
                              npwpNote: '',
                              keanggotaanPenerbit: '',
                              keanggotaanPenerbitNote: ''
                            }),
                            npwp: val
                          };
                          handleFieldChange('companyCredentials', updatedCreds);
                        }}
                        placeholder="Contoh: 01.889.324.5-021.000"
                        className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Status KPP & PKP</span>
                      <input
                        type="text"
                        value={content.companyCredentials?.npwpNote || ''}
                        onChange={(e) => {
                          const updatedCreds = {
                            ...(content.companyCredentials || {
                              kemenkumham: '',
                              kemenkumhamNote: '',
                              nib: '',
                              nibNote: '',
                              npwp: '',
                              npwpNote: '',
                              keanggotaanPenerbit: '',
                              keanggotaanPenerbitNote: ''
                            }),
                            npwpNote: e.target.value
                          };
                          handleFieldChange('companyCredentials', updatedCreds);
                        }}
                        placeholder="KPP Pratama Jakarta Pusat • PKP Terdaftar"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* 4. Keanggotaan Penerbit Resmi */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-purple-600" />
                        <span>4. Keanggotaan Penerbit Resmi</span>
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono">IKAPI / Asosiasi</span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Nomor Anggota / Status</span>
                      <input
                        type="text"
                        value={content.companyCredentials?.keanggotaanPenerbit || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updatedCreds = {
                            ...(content.companyCredentials || {
                              kemenkumham: '',
                              kemenkumhamNote: '',
                              nib: '',
                              nibNote: '',
                              npwp: '',
                              npwpNote: '',
                              keanggotaanPenerbit: '',
                              keanggotaanPenerbitNote: ''
                            }),
                            keanggotaanPenerbit: val
                          };
                          const updatedBadges = [...(content.footer?.trustBadges || [])];
                          if (updatedBadges[0]) updatedBadges[0] = { ...updatedBadges[0], subtitle: val };
                          const updatedLegalDocs = [...(content.legalDocs || [])];
                          if (updatedLegalDocs[1]) updatedLegalDocs[1] = { ...updatedLegalDocs[1], number: val };

                          setContent(prev => ({
                            ...prev,
                            companyCredentials: updatedCreds,
                            footer: { ...prev.footer, trustBadges: updatedBadges },
                            legalDocs: updatedLegalDocs
                          }));
                          setHasUnsavedChanges(true);
                        }}
                        placeholder="Contoh: No. 492/DKI/2023"
                        className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Nama Asosiasi / Catatan</span>
                      <input
                        type="text"
                        value={content.companyCredentials?.keanggotaanPenerbitNote || ''}
                        onChange={(e) => {
                          const updatedCreds = {
                            ...(content.companyCredentials || {
                              kemenkumham: '',
                              kemenkumhamNote: '',
                              nib: '',
                              nibNote: '',
                              npwp: '',
                              npwpNote: '',
                              keanggotaanPenerbit: '',
                              keanggotaanPenerbitNote: ''
                            }),
                            keanggotaanPenerbitNote: e.target.value
                          };
                          handleFieldChange('companyCredentials', updatedCreds);
                        }}
                        placeholder="Ikatan Penerbit Indonesia (IKAPI) & Afiliasi Perpusnas RI"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Dokumen Legalitas & Perizinan Lainnya */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Daftar Dokumen Legalitas & Perizinan Usaha PT</h3>
                    <p className="text-xs text-slate-500">Kelola judul, nomor berkas, dan instansi penerbit.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newDoc: LegalDoc = {
                        id: `leg-${Date.now()}`,
                        title: 'Dokumen Perizinan Baru',
                        number: '',
                        issuer: 'Instansi Terkait',
                        description: 'Keterangan dokumen resmi...',
                        order: (content.legalDocs || []).length + 1
                      };
                      handleFieldChange('legalDocs', [...(content.legalDocs || []), newDoc]);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#D4AF37] text-slate-950 rounded-lg text-xs font-bold hover:bg-[#c5a059] transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Dokumen</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {(content.legalDocs || []).map((leg, idx) => (
                    <div key={leg.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Dokumen #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (content.legalDocs || []).filter((_, i) => i !== idx);
                            handleFieldChange('legalDocs', updated);
                          }}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nama Dokumen</label>
                          <input
                            type="text"
                            value={leg.title}
                            onChange={(e) => {
                              const updated = [...(content.legalDocs || [])];
                              updated[idx] = { ...updated[idx], title: e.target.value };
                              handleFieldChange('legalDocs', updated);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nomor Registrasi / SK</label>
                          <input
                            type="text"
                            value={leg.number}
                            placeholder="Nomor SK / Izin..."
                            onChange={(e) => {
                              const updated = [...(content.legalDocs || [])];
                              updated[idx] = { ...updated[idx], number: e.target.value };
                              handleFieldChange('legalDocs', updated);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 rounded font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Penerbit / Instansi</label>
                          <input
                            type="text"
                            value={leg.issuer}
                            onChange={(e) => {
                              const updated = [...(content.legalDocs || [])];
                              updated[idx] = { ...updated[idx], issuer: e.target.value };
                              handleFieldChange('legalDocs', updated);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs text-slate-500 bg-white border border-slate-300 rounded"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 6. Lowongan Karir */}
          {otherPageSubTab === 'karir' && (
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-[#B89230]" />
                    <h3 className="text-sm font-bold text-slate-900">Lowongan Pekerjaan & Posisi Manajerial</h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Realtime Terintegrasi
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Kelola 3 posisi manajerial teratas (Manager Publishing, Manajer Marketing, Manajer Percetakan) serta posisi karir lainnya secara langsung.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-[#DFBF64] rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan Karir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newCar: CareerItem = {
                        id: `car-${Date.now()}`,
                        title: 'Posisi Baru',
                        badge: 'LOWONGAN BARU',
                        department: 'Divisi Operasional',
                        type: 'Penuh Waktu (Full-time)',
                        location: 'Jakarta Pusat / Hybrid',
                        deadline: '31 Desember 2026',
                        tagline: 'Berkarya bersama ekosistem pengetahuan terdepan.',
                        quote: 'Membangun peradaban literasi dan riset berkualitas bersama CakraNexa.',
                        description: 'Deskripsi tugas dan tanggung jawab posisi ini...',
                        responsibilities: [
                          'Menjalankan tugas operasional sesuai standar mutu perusahaan.',
                          'Berkoordinasi dengan tim lintas divisi.',
                          'Menjaga ketepatan waktu dan akurasi hasil kerja.'
                        ],
                        requirements: [
                          'Pendidikan minimal S1 bidang relevan.',
                          'Pengalaman kerja minimal 2 tahun.',
                          'Memiliki integritas dan kemampuan komunikasi yang baik.'
                        ],
                        benefits: [
                          'Gaji pokok & tunjangan kompetitif.',
                          'BPJS Kesehatan & Ketenagakerjaan.',
                          'Peluang pengembangan karir profesional.'
                        ],
                        email: 'hrd@cakranexa.com',
                        emailSubject: 'Lamaran Posisi Baru – [Nama Anda]',
                        isActive: true,
                        isFeatured: false,
                        order: (content.careers || []).length + 1
                      };
                      const updated = [...(content.careers || []), newCar];
                      handleFieldChange('careers', updated);
                      setExpandedCareerId(newCar.id);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#D4AF37] hover:bg-[#c9a632] text-slate-950 rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Lowongan</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {(content.careers || []).map((car, idx) => {
                  const isTopManager = ['car-mgr-publishing', 'car-mgr-marketing', 'car-mgr-percetakan'].includes(car.id);
                  const isExpanded = expandedCareerId === car.id;

                  const handleMove = (direction: 'up' | 'down') => {
                    const list = [...(content.careers || [])];
                    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
                    if (targetIdx < 0 || targetIdx >= list.length) return;
                    const temp = list[idx];
                    list[idx] = list[targetIdx];
                    list[targetIdx] = temp;
                    const updated = list.map((item, i) => ({ ...item, order: i + 1 }));
                    handleFieldChange('careers', updated);
                  };

                  return (
                    <div
                      key={car.id}
                      className={`rounded-xl border transition-all ${
                        isExpanded ? 'border-[#DFBF64]/60 bg-amber-50/15 shadow-sm' : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
                      }`}
                    >
                      {/* Header bar */}
                      <div className="p-3 sm:p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Order Buttons */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMove('up')}
                              disabled={idx === 0}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                              title="Pindah ke Atas"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMove('down')}
                              disabled={idx === (content.careers || []).length - 1}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                              title="Pindah ke Bawah"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="w-6 text-center text-xs font-bold text-slate-400">
                            #{idx + 1}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                                {car.title || 'Posisi Tanpa Judul'}
                              </h4>
                              {isTopManager && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  3 Manajerial Utama
                                </span>
                              )}
                              {car.badge && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800">
                                  {car.badge}
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  car.isActive !== false
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                                }`}
                              >
                                {car.isActive !== false ? 'Aktif' : 'Tutup'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {car.department} • {car.location || 'Lokasi fleksibel'} • Batas: {car.deadline}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedCareerId(isExpanded ? null : car.id)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1"
                          >
                            <span>{isExpanded ? 'Tutup' : 'Edit Detail'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Hapus lowongan "${car.title}"?`)) {
                                const updated = (content.careers || []).filter((_, i) => i !== idx);
                                handleFieldChange('careers', updated);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Hapus Lowongan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expandable form fields */}
                      {isExpanded && (
                        <div className="p-4 pt-2 border-t border-slate-200/80 bg-white space-y-4 rounded-b-xl">
                          {/* Row 1: Title, Badge, Department */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Judul Posisi</label>
                              <input
                                type="text"
                                value={car.title}
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], title: e.target.value };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Badge Tag</label>
                              <input
                                type="text"
                                value={car.badge || ''}
                                placeholder="Misal: WE ARE HIRING!"
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], badge: e.target.value };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Departemen / Divisi</label>
                              <input
                                type="text"
                                value={car.department}
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], department: e.target.value };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              />
                            </div>
                          </div>

                          {/* Row 2: Type, Location, Deadline */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Tipe & Level Jabatan</label>
                              <input
                                type="text"
                                value={car.type}
                                placeholder="Penuh Waktu • Level Manajerial"
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], type: e.target.value };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Lokasi Penempatan</label>
                              <input
                                type="text"
                                value={car.location || ''}
                                placeholder="Kantor Pusat Jakarta / Hybrid"
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], location: e.target.value };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Batas Akhir Lamaran</label>
                              <input
                                type="text"
                                value={car.deadline}
                                placeholder="1 September 2026"
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], deadline: e.target.value };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              />
                            </div>
                          </div>

                          {/* Row 3: Tagline & Quote */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Tagline Posisi</label>
                              <input
                                type="text"
                                value={car.tagline || ''}
                                placeholder="Membangun Perusahaan Pengetahuan Lintas Generasi"
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], tagline: e.target.value };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Kutipan Visi / Quote</label>
                              <input
                                type="text"
                                value={car.quote || ''}
                                placeholder="Kutipan visi kepemimpinan..."
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], quote: e.target.value };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              />
                            </div>
                          </div>

                          {/* Row 4: Email & Email Subject */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Email Pengiriman Lamaran</label>
                              <input
                                type="text"
                                value={car.email || 'hrd@cakranexa.com'}
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], email: e.target.value };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">Format Subjek Email Otomatis</label>
                              <input
                                type="text"
                                value={car.emailSubject || ''}
                                placeholder="MANAGER PUBLISHING_NAMA ANDA"
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], emailSubject: e.target.value };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              />
                            </div>
                          </div>

                          {/* Row 5: Deskripsi */}
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">Deskripsi Ringkas Posisi</label>
                            <textarea
                              rows={2}
                              value={car.description || ''}
                              onChange={(e) => {
                                const updated = [...(content.careers || [])];
                                updated[idx] = { ...updated[idx], description: e.target.value };
                                handleFieldChange('careers', updated);
                              }}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              placeholder="Jelaskan peran dan lingkup tanggung jawab..."
                            />
                          </div>

                          {/* Row 6: Responsibilities, Requirements, Benefits (Textareas with 1 item per line) */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[11px] font-bold text-slate-700">Tanggung Jawab Utama</label>
                                <span className="text-[10px] text-slate-400">1 per baris</span>
                              </div>
                              <textarea
                                rows={5}
                                value={(car.responsibilities || []).join('\n')}
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = {
                                    ...updated[idx],
                                    responsibilities: e.target.value.split('\n').filter(Boolean)
                                  };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-mono"
                                placeholder="Contoh:&#10;Menyusun strategi penerbitan...&#10;Memimpin proses akuisisi..."
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[11px] font-bold text-slate-700">Kualifikasi & Syarat</label>
                                <span className="text-[10px] text-slate-400">1 per baris</span>
                              </div>
                              <textarea
                                rows={5}
                                value={(car.requirements || []).join('\n')}
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = {
                                    ...updated[idx],
                                    requirements: e.target.value.split('\n').filter(Boolean)
                                  };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-mono"
                                placeholder="Contoh:&#10;Pendidikan minimal S1...&#10;Pengalaman 5 tahun..."
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[11px] font-bold text-slate-700">Fasilitas & Benefit</label>
                                <span className="text-[10px] text-slate-400">1 per baris</span>
                              </div>
                              <textarea
                                rows={5}
                                value={(car.benefits || []).join('\n')}
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = {
                                    ...updated[idx],
                                    benefits: e.target.value.split('\n').filter(Boolean)
                                  };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-mono"
                                placeholder="Contoh:&#10;Gaji & tunjangan kompetitif&#10;Jaminan kesehatan BPJS"
                              />
                            </div>
                          </div>

                          {/* Row 7: Toggles */}
                          <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-100">
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={car.isActive !== false}
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], isActive: e.target.checked };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className="text-xs font-semibold text-slate-700">
                                Status: Lowongan Aktif (Tampilkan di Situs)
                              </span>
                            </label>

                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(car.isFeatured)}
                                onChange={(e) => {
                                  const updated = [...(content.careers || [])];
                                  updated[idx] = { ...updated[idx], isFeatured: e.target.checked };
                                  handleFieldChange('careers', updated);
                                }}
                                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                              />
                              <span className="text-xs font-semibold text-slate-700">
                                Tandai sebagai Sorotan Utama (Featured)
                              </span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 7. Artikel Blog */}
          {otherPageSubTab === 'blog' && (
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Artikel Blog & Analisis Hukum Fiskal</h3>
                <button
                  type="button"
                  onClick={() => {
                    const newArt: BlogArticleItem = {
                      id: `art-${Date.now()}`,
                      title: 'Judul Artikel Wawasan Baru',
                      slug: `artikel-baru-${Date.now()}`,
                      author: 'Dewan Redaksi CakraNexa',
                      category: 'Perpajakan',
                      publishDate: 'September 2026',
                      readTime: '5 Menit Baca',
                      excerpt: 'Ringkasan singkat artikel wawasan hukum fiskal...',
                      content: 'Isi lengkap analisis...',
                      coverImage: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
                      order: (content.blogArticles || []).length + 1
                    };
                    handleFieldChange('blogArticles', [...(content.blogArticles || []), newArt]);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#D4AF37] text-slate-950 rounded text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Artikel</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(content.blogArticles || []).map((art, idx) => (
                  <div key={art.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#B89628]">{art.category}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (content.blogArticles || []).filter((_, i) => i !== idx);
                          handleFieldChange('blogArticles', updated);
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={art.title}
                      onChange={(e) => {
                        const updated = [...(content.blogArticles || [])];
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        handleFieldChange('blogArticles', updated);
                      }}
                      className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded"
                    />
                    <textarea
                      rows={2}
                      value={art.excerpt}
                      onChange={(e) => {
                        const updated = [...(content.blogArticles || [])];
                        updated[idx] = { ...updated[idx], excerpt: e.target.value };
                        handleFieldChange('blogArticles', updated);
                      }}
                      className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Floating Bottom Bar if Unsaved Changes */}
      {hasUnsavedChanges && (
        <div className="sticky bottom-4 z-40 p-4 rounded-xl bg-slate-900 text-white border border-[#D4AF37] shadow-2xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
            <span className="font-semibold text-amber-300">Ada perubahan konten yang belum disimpan.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAll}
              className="px-4 py-2 rounded-lg bg-[#D4AF37] hover:bg-[#B89628] text-slate-950 text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              Simpan Perubahan Sekarang
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
