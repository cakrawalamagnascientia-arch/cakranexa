import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  ChevronDown,
  ShoppingBag,
  Search,
  Menu,
  X,
  ShieldCheck,
  FileText,
  GraduationCap,
  BookMarked,
  Phone,
  Building2,
  Briefcase,
} from 'lucide-react';
import { ActivePage, SubSection, BookCategory } from '../types';
import { CakraNexaLogo } from './CakraNexaLogo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useCategoryLabel } from '../i18n/hooks';

interface NavbarProps {
  activePage: ActivePage;
  subSection?: SubSection;
  onNavigate: (page: ActivePage, subSection?: SubSection, categoryFilter?: BookCategory) => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenSearch: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activePage,
  subSection,
  onNavigate,
  cartCount,
  onOpenCart,
  onOpenSearch
}) => {
  const { t } = useTranslation('common');
  const categoryLabel = useCategoryLabel();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleMouseEnter = (menuName: string) => {
    if (dropdownTimeoutRef.current) clearTimeout(dropdownTimeoutRef.current);
    setOpenDropdown(menuName);
  };

  const handleMouseLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 150);
  };

  const categories: BookCategory[] = [
    'Akuntansi',
    'Perpajakan',
    'Hukum',
    'Ekonomi & Bisnis',
    'Filsafat',
    'Teologia'
  ];

  return (
    <header
      id="main-navigation"
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#0F172A]/95 backdrop-blur-md shadow-lg border-b border-[#D4AF37]/30 py-2.5'
          : 'bg-[#0F172A] border-b border-[#D4AF37]/30 py-3'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">

          {/* Left Brand Area: Brand Logo & Brand Name */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="brand-logo-btn"
              onClick={() => {
                onNavigate('home');
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2.5 sm:gap-3 text-left group transition-transform focus:outline-none cursor-pointer"
              aria-label={t('nav.homeAriaLabel')}
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-slate-900/90 border border-[#D4AF37]/50 p-1 shadow-sm flex items-center justify-center flex-shrink-0 group-hover:border-[#D4AF37] transition-all">
                <CakraNexaLogo className="w-full h-full group-hover:scale-105 transition-transform" />
              </div>
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans flex items-center">
                CAKRA<span className="text-[#DFBF64]">NEXA</span>
              </span>
            </button>
          </div>

          {/* Desktop Nav Items with Artistic Flair */}
          <nav className="hidden lg:flex flex-1 min-w-0 items-center justify-center gap-3 xl:gap-4 text-[10px] xl:text-[11px] uppercase tracking-wider font-semibold px-3">

            {/* 1. Home */}
            <button
              id="nav-link-home"
              onClick={() => onNavigate('home')}
              className={`relative py-1 transition-opacity ${
                activePage === 'home'
                  ? 'text-white opacity-100'
                  : 'text-white opacity-60 hover:opacity-100'
              }`}
            >
              <span className="whitespace-nowrap">{t('home')}</span>
              {activePage === 'home' && (
                <div className="absolute h-[1.5px] w-full bg-[#D4AF37] bottom-[-2px] left-0"></div>
              )}
            </button>

            {/* 2. Katalog Buku (Dropdown) */}
            <div
              className="relative"
              onMouseEnter={() => handleMouseEnter('katalog')}
              onMouseLeave={handleMouseLeave}
            >
              <button
                id="nav-link-katalog"
                onClick={() => onNavigate('katalog')}
                className={`relative py-1 flex items-center gap-1 transition-opacity ${
                  activePage === 'katalog'
                    ? 'text-white opacity-100'
                    : 'text-white opacity-60 hover:opacity-100'
                }`}
              >
                <span className="whitespace-nowrap">{t('catalog')}</span>
                <ChevronDown className="w-3 h-3 text-[#D4AF37]" />
                {activePage === 'katalog' && (
                  <div className="absolute h-[1.5px] w-full bg-[#D4AF37] bottom-[-2px] left-0"></div>
                )}
              </button>

              {openDropdown === 'katalog' && (
                <div
                  onMouseEnter={() => handleMouseEnter('katalog')}
                  onMouseLeave={handleMouseLeave}
                  className="absolute left-0 top-full pt-1.5 w-64 z-50 animate-in fade-in duration-150"
                >
                  <div className="rounded-xl bg-[#0F172A] border border-slate-700/80 shadow-2xl p-2">
                    <button
                      id="dropdown-katalog-semua"
                      onClick={() => {
                        onNavigate('katalog');
                        setOpenDropdown(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-white hover:bg-slate-800 hover:text-[#D4AF37] transition-colors flex items-center justify-between"
                    >
                      <span className="font-semibold tracking-wider">{t('allBooks')}</span>
                      <span className="text-[10px] text-[#D4AF37] bg-white/10 px-1.5 py-0.5 rounded font-mono">{t('nav.catalogMenu.bookCount', { count: 23 })}</span>
                    </button>

                    <button
                      id="dropdown-katalog-terbaru"
                      onClick={() => {
                        onNavigate('katalog', 'terbaru');
                        setOpenDropdown(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-white hover:bg-slate-800 hover:text-[#D4AF37] transition-colors flex items-center justify-between"
                    >
                      <span className="font-semibold tracking-wider">{t('nav.catalogMenu.latestBooks')}</span>
                    </button>

                    <div className="my-1 border-t border-white/10"></div>
                    <div className="px-3 py-1 text-[9px] font-bold tracking-widest text-[#D4AF37] uppercase">
                      {t('nav.catalogMenu.categoriesHeading')}
                    </div>

                    <div className="grid grid-cols-1 gap-0.5">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          id={`dropdown-category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                          onClick={() => {
                            onNavigate('katalog', 'kategori', cat);
                            setOpenDropdown(null);
                          }}
                          className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 hover:text-[#D4AF37] transition-colors flex items-center justify-between"
                        >
                          <span>{categoryLabel(cat)}</span>
                        </button>
                      ))}
                    </div>

                    <div className="my-1 border-t border-white/10"></div>
                    <button
                      id="dropdown-katalog-penulis"
                      onClick={() => {
                        onNavigate('katalog', 'penulis');
                        setOpenDropdown(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800 hover:text-[#D4AF37] transition-colors"
                    >
                      {t('authors')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Penerbitan (Dropdown) */}
            <div
              className="relative"
              onMouseEnter={() => handleMouseEnter('penerbitan')}
              onMouseLeave={handleMouseLeave}
            >
              <button
                id="nav-link-penerbitan"
                onClick={() => onNavigate('penerbitan', 'layanan')}
                className={`relative py-1 flex items-center gap-1 transition-opacity ${
                  activePage === 'penerbitan'
                    ? 'text-white opacity-100'
                    : 'text-white opacity-60 hover:opacity-100'
                }`}
              >
                <span className="whitespace-nowrap">{t('publishing')}</span>
                <ChevronDown className="w-3 h-3 text-[#D4AF37]" />
                {activePage === 'penerbitan' && (
                  <div className="absolute h-[1.5px] w-full bg-[#D4AF37] bottom-[-2px] left-0"></div>
                )}
              </button>

              {openDropdown === 'penerbitan' && (
                <div
                  onMouseEnter={() => handleMouseEnter('penerbitan')}
                  onMouseLeave={handleMouseLeave}
                  className="absolute left-0 top-full pt-1.5 w-60 z-50 animate-in fade-in duration-150"
                >
                  <div className="rounded-xl bg-[#0F172A] border border-slate-700/80 shadow-2xl p-2 space-y-0.5">
                    <button
                      id="dropdown-penerbitan-layanan"
                      onClick={() => {
                        onNavigate('penerbitan', 'layanan');
                        setOpenDropdown(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-white hover:bg-slate-800 hover:text-[#D4AF37] transition-colors flex items-center justify-between"
                    >
                      <span>{t('nav.publishingMenu.services')}</span>
                    </button>
                    <button
                      id="dropdown-penerbitan-kirim"
                      onClick={() => {
                        onNavigate('penerbitan', 'kirim-naskah');
                        setOpenDropdown(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-white hover:bg-slate-800 hover:text-[#D4AF37] transition-colors flex items-center justify-between"
                    >
                      <span>{t('nav.publishingMenu.submitManuscript')}</span>
                      <span className="text-[9px] bg-[#D4AF37] text-[#0F172A] px-1.5 py-0.5 font-bold rounded">{t('nav.publishingMenu.openBadge')}</span>
                    </button>
                    <button
                      id="dropdown-penerbitan-panduan"
                      onClick={() => {
                        onNavigate('penerbitan', 'panduan-penulis');
                        setOpenDropdown(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800 hover:text-[#D4AF37] transition-colors"
                    >
                      {t('nav.publishingMenu.authorGuide')}
                    </button>
                    <button
                      id="dropdown-penerbitan-proses"
                      onClick={() => {
                        onNavigate('penerbitan', 'proses');
                        setOpenDropdown(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800 hover:text-[#D4AF37] transition-colors"
                    >
                      {t('nav.publishingMenu.process')}
                    </button>
                    <button
                      id="dropdown-penerbitan-faq"
                      onClick={() => {
                        onNavigate('penerbitan', 'faq');
                        setOpenDropdown(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800 hover:text-[#D4AF37] transition-colors"
                    >
                      {t('nav.publishingMenu.faq')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Pelatihan */}
            <button
              id="nav-link-pelatihan"
              onClick={() => onNavigate('pelatihan')}
              className={`relative py-1 transition-opacity ${
                activePage === 'pelatihan'
                  ? 'text-white opacity-100'
                  : 'text-white opacity-60 hover:opacity-100'
              }`}
            >
              <span className="whitespace-nowrap">{t('training')}</span>
              {activePage === 'pelatihan' && (
                <div className="absolute h-[1.5px] w-full bg-[#D4AF37] bottom-[-2px] left-0"></div>
              )}
            </button>

            {/* 5. Jurnal */}
            <button
              id="nav-link-jurnal"
              onClick={() => onNavigate('jurnal')}
              className={`relative py-1 transition-opacity ${
                activePage === 'jurnal'
                  ? 'text-white opacity-100'
                  : 'text-white opacity-60 hover:opacity-100'
              }`}
            >
              <span className="whitespace-nowrap">{t('journal')}</span>
              {activePage === 'jurnal' && (
                <div className="absolute h-[1.5px] w-full bg-[#D4AF37] bottom-[-2px] left-0"></div>
              )}
            </button>

            {/* 6. Tentang Kami (Dropdown) */}
            <div
              className="relative"
              onMouseEnter={() => handleMouseEnter('tentang')}
              onMouseLeave={handleMouseLeave}
            >
              <button
                id="nav-link-tentang-kami"
                onClick={() => onNavigate('tentang-kami')}
                className={`relative py-1 flex items-center gap-1 transition-opacity ${
                  activePage === 'tentang-kami'
                    ? 'text-white opacity-100'
                    : 'text-white opacity-60 hover:opacity-100'
                }`}
              >
                <span className="whitespace-nowrap">{t('about')}</span>
                <ChevronDown className="w-3 h-3 text-[#D4AF37]" />
                {activePage === 'tentang-kami' && (
                  <div className="absolute h-[1.5px] w-full bg-[#D4AF37] bottom-[-2px] left-0"></div>
                )}
              </button>

              {openDropdown === 'tentang' && (
                <div className="absolute left-0 mt-1 w-52 rounded bg-[#0F172A] border border-[#D4AF37]/40 shadow-2xl p-2 z-50 animate-in fade-in duration-150">
                  <button
                    id="dropdown-tentang-profil"
                    onClick={() => {
                      onNavigate('tentang-kami', 'profil');
                      setOpenDropdown(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded text-xs text-white hover:bg-[#D4AF37]/15 hover:text-[#D4AF37] transition-colors"
                  >
                    {t('nav.aboutMenu.profile')}
                  </button>
                  <button
                    id="dropdown-tentang-visi"
                    onClick={() => {
                      onNavigate('tentang-kami', 'visi-misi');
                      setOpenDropdown(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded text-xs text-slate-300 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] transition-colors"
                  >
                    {t('nav.aboutMenu.visionMission')}
                  </button>
                  <button
                    id="dropdown-tentang-tim"
                    onClick={() => {
                      onNavigate('tentang-kami', 'tim');
                      setOpenDropdown(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded text-xs text-slate-300 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] transition-colors"
                  >
                    {t('nav.aboutMenu.editorialTeam')}
                  </button>
                  <button
                    id="dropdown-tentang-legalitas"
                    onClick={() => {
                      onNavigate('tentang-kami', 'legalitas');
                      setOpenDropdown(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded text-xs text-slate-300 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] transition-colors flex items-center justify-between"
                  >
                    <span>{t('nav.aboutMenu.legality')}</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                  </button>
                </div>
              )}
            </div>

            {/* 7. Blog */}
            <button
              id="nav-link-blog"
              onClick={() => onNavigate('blog')}
              className={`relative py-1 transition-opacity ${
                activePage === 'blog'
                  ? 'text-white opacity-100'
                  : 'text-white opacity-60 hover:opacity-100'
              }`}
            >
              <span className="whitespace-nowrap">{t('blog')}</span>
              {activePage === 'blog' && (
                <div className="absolute h-[1.5px] w-full bg-[#D4AF37] bottom-[-2px] left-0"></div>
              )}
            </button>

            {/* 8. Career */}
            <button
              id="nav-link-career"
              onClick={() => onNavigate('career')}
              className={`relative py-1 transition-opacity ${
                activePage === 'career'
                  ? 'text-white opacity-100'
                  : 'text-white opacity-60 hover:opacity-100'
              }`}
            >
              <span className="whitespace-nowrap">{t('career')}</span>
              {activePage === 'career' && (
                <div className="absolute h-[1.5px] w-full bg-[#D4AF37] bottom-[-2px] left-0"></div>
              )}
            </button>

            {/* 9. Kontak */}
            <button
              id="nav-link-kontak"
              onClick={() => onNavigate('kontak')}
              className={`relative py-1 transition-opacity ${
                activePage === 'kontak'
                  ? 'text-white opacity-100'
                  : 'text-white opacity-60 hover:opacity-100'
              }`}
            >
              <span className="whitespace-nowrap">{t('contact')}</span>
              {activePage === 'kontak' && (
                <div className="absolute h-[1.5px] w-full bg-[#D4AF37] bottom-[-2px] left-0"></div>
              )}
            </button>
          </nav>

          {/* Action Buttons: Search and Artistic Gold Cart */}
          <div className="flex shrink-0 items-center space-x-2 sm:space-x-3">
            {/* Pilihan bahasa (desktop/tablet); di layar kecil tersedia di menu mobile */}
            <LanguageSwitcher className="hidden sm:flex" />
            {/* Quick Search */}
            <button
              id="btn-search-trigger"
              onClick={onOpenSearch}
              className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
              title={t('nav.searchTitle')}
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Artistic Flair Cart Button */}
            <button
              id="btn-cart-trigger"
              onClick={onOpenCart}
              className="bg-[#D4AF37] text-[#0F172A] p-2 px-4 rounded-sm text-[10px] uppercase font-black tracking-wider hover:bg-[#c5a059] transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              title={t('nav.cartTitle')}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{t('nav.cartButton', { quantity: cartCount })}</span>
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              id="btn-mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-md text-slate-300 hover:text-white hover:bg-white/10 focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#0F172A] border-b border-[#DFBF64]/30 px-4 pt-3 pb-6 max-h-[85vh] overflow-y-auto">
          <div className="flex flex-col space-y-2">
            {/* Pilihan bahasa (menu mobile) */}
            <div className="flex items-center justify-between px-3 pb-2 border-b border-white/10">
              <span className="text-xs font-semibold text-slate-400">{t('language')}</span>
              <LanguageSwitcher className="flex" />
            </div>

            <button
              onClick={() => {
                onNavigate('home');
                setMobileMenuOpen(false);
              }}
              className={`text-left px-3 py-2 rounded text-sm font-medium ${
                activePage === 'home' ? 'bg-[#DFBF64]/15 text-[#DFBF64]' : 'text-slate-200'
              }`}
            >
              {t('home')}
            </button>

            {/* Katalog Section Mobile */}
            <div className="border-t border-white/10 pt-2">
              <button
                onClick={() => {
                  onNavigate('katalog');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm font-semibold text-[#DFBF64] flex items-center justify-between"
              >
                <span>{t('nav.mobile.catalogAll')}</span>
              </button>
              <div className="pl-4 space-y-1 mt-1">
                <button
                  onClick={() => {
                    onNavigate('katalog', 'terbaru');
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left py-1 text-xs text-slate-300 hover:text-white"
                >
                  • {t('latest')}
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      onNavigate('katalog', 'kategori', cat);
                      setMobileMenuOpen(false);
                    }}
                    className="block w-full text-left py-1 text-xs text-slate-400 hover:text-white"
                  >
                    • {categoryLabel(cat)}
                  </button>
                ))}
              </div>
            </div>

            {/* Penerbitan Section Mobile */}
            <div className="border-t border-white/10 pt-2">
              <div className="px-3 py-1 text-xs font-semibold text-[#DFBF64]">{t('publishing')}</div>
              <div className="pl-4 space-y-1 mt-1">
                <button
                  onClick={() => {
                    onNavigate('penerbitan', 'layanan');
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left py-1 text-xs text-slate-300"
                >
                  • {t('nav.mobile.publishingServices')}
                </button>
                <button
                  onClick={() => {
                    onNavigate('penerbitan', 'kirim-naskah');
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left py-1 text-xs text-emerald-400 font-medium"
                >
                  • {t('nav.mobile.submitManuscript')}
                </button>
                <button
                  onClick={() => {
                    onNavigate('penerbitan', 'panduan-penulis');
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left py-1 text-xs text-slate-300"
                >
                  • {t('nav.mobile.authorGuide')}
                </button>
                <button
                  onClick={() => {
                    onNavigate('penerbitan', 'proses');
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left py-1 text-xs text-slate-300"
                >
                  • {t('nav.mobile.process')}
                </button>
                <button
                  onClick={() => {
                    onNavigate('penerbitan', 'faq');
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left py-1 text-xs text-slate-300"
                >
                  • {t('nav.mobile.faq')}
                </button>
              </div>
            </div>

            <div className="border-t border-white/10 pt-2 flex flex-col space-y-1">
              <button
                onClick={() => {
                  onNavigate('pelatihan');
                  setMobileMenuOpen(false);
                }}
                className="text-left px-3 py-1.5 text-sm text-slate-200"
              >
                {t('training')}
              </button>
              <button
                onClick={() => {
                  onNavigate('jurnal');
                  setMobileMenuOpen(false);
                }}
                className="text-left px-3 py-1.5 text-sm text-slate-200"
              >
                {t('journal')}
              </button>
              <button
                onClick={() => {
                  onNavigate('tentang-kami');
                  setMobileMenuOpen(false);
                }}
                className="text-left px-3 py-1.5 text-sm text-slate-200"
              >
                {t('about')}
              </button>
              <button
                onClick={() => {
                  onNavigate('blog');
                  setMobileMenuOpen(false);
                }}
                className="text-left px-3 py-1.5 text-sm text-slate-200"
              >
                {t('blog')}
              </button>
              <button
                onClick={() => {
                  onNavigate('career');
                  setMobileMenuOpen(false);
                }}
                className="text-left px-3 py-1.5 text-sm text-slate-200"
              >
                {t('career')}
              </button>
              <button
                onClick={() => {
                  onNavigate('kontak');
                  setMobileMenuOpen(false);
                }}
                className="text-left px-3 py-1.5 text-sm text-slate-200"
              >
                {t('contact')}
              </button>
            </div>

          </div>
        </div>
      )}
    </header>
  );
};
