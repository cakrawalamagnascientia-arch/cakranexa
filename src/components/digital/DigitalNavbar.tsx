import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Headphones, Library, LogOut, Menu, Search, ShoppingBag, TabletSmartphone, X } from 'lucide-react';
import type { ActivePage, BookCategory, SubSection } from '../../types';
import { CakraNexaLogo } from '../CakraNexaLogo';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { useCategoryLabel } from '../../i18n/hooks';
import { signOut, useMemberSession } from '../../services/memberSession';
import { goToDigitalHome, goToDigitalListing, goToLibrary, goToLogin, goToMembership } from '../../services/digitalNavigation';

const CATEGORIES: BookCategory[] = ['Perpajakan', 'Akuntansi', 'Hukum', 'Ekonomi & Bisnis', 'Filsafat', 'Teologia'];

/** Menu situs lama (tetap tersedia di "Lainnya" dan footer). */
const SITE_LINKS: Array<{ key: string; page: ActivePage }> = [
  { key: 'home', page: 'home' },
  { key: 'catalog', page: 'katalog' },
  { key: 'publishing', page: 'penerbitan' },
  { key: 'training', page: 'pelatihan' },
  { key: 'journal', page: 'jurnal' },
  { key: 'about', page: 'tentang-kami' },
  { key: 'blog', page: 'blog' },
  { key: 'career', page: 'career' },
  { key: 'contact', page: 'kontak' }
];

interface DigitalNavbarProps {
  activePage: ActivePage;
  subSection?: SubSection | null;
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenSearch: () => void;
}

/**
 * Navbar area digital fase 6: Audiobook · E-book · Kategori · Gabung · Mulai gratis · cari. Menu situs lama ada di
 * "Lainnya" (dan footer). Keranjang buku cetak tetap tersedia.
 */
export const DigitalNavbar: React.FC<DigitalNavbarProps> = ({ activePage, subSection, onNavigate, cartCount, onOpenCart, onOpenSearch }) => {
  const { t } = useTranslation(['digital', 'common']);
  const categoryLabel = useCategoryLabel();
  const member = useMemberSession();
  const [open, setOpen] = useState<'categories' | 'more' | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const hover = (menu: 'categories' | 'more' | null) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (menu) setOpen(menu);
    else closeTimer.current = setTimeout(() => setOpen(null), 150);
  };
  const run = (action: () => void) => {
    action();
    setOpen(null);
    setMobileOpen(false);
  };
  const startFree = () => (member.isLoggedIn ? goToLibrary() : goToLogin('/digital', 'register'));
  const isActive = (format: 'ebook' | 'audiobook') => activePage === 'digital' && subSection === format;
  const linkClass = (active: boolean) =>
    `relative inline-flex items-center gap-1.5 whitespace-nowrap px-1 py-1 text-[13px] font-semibold transition-colors cursor-pointer ${active ? 'text-gold-400' : 'text-cream-100 hover:text-white'}`;

  const categoryMenu = (
    <div className="grid gap-0.5 sm:grid-cols-2">
      <button type="button" onClick={() => run(() => goToDigitalListing('ebook'))} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-navy-900 hover:bg-cream-100 cursor-pointer">
        {t('digitalNav.allCategories')}
      </button>
      {CATEGORIES.map((category) => (
        <button key={category} type="button" onClick={() => run(() => goToDigitalListing('ebook', category))} className="rounded-md px-3 py-2 text-left text-sm text-navy-800 hover:bg-cream-100 cursor-pointer">
          {categoryLabel(category)}
        </button>
      ))}
    </div>
  );

  const moreMenu = (
    <div className="grid gap-0.5">
      <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('digitalNav.moreSite')}</p>
      {SITE_LINKS.map((link) => (
        <button key={link.key} type="button" onClick={() => run(() => onNavigate(link.page))} className="rounded-md px-3 py-1.5 text-left text-sm text-navy-800 hover:bg-cream-100 cursor-pointer">
          {t(`common:${link.key}` as 'common:home')}
        </button>
      ))}
      {member.isLoggedIn && (
        <button type="button" onClick={() => run(() => void signOut())} className="mt-1 flex items-center gap-2 rounded-md border-t border-cream-200 px-3 pb-1.5 pt-2.5 text-left text-sm text-slate-600 hover:bg-cream-100 cursor-pointer">
          <LogOut className="h-3.5 w-3.5" />
          {t('digitalNav.signOut')}
        </button>
      )}
    </div>
  );

  return (
    <header id="main-navigation" data-variant="digital" className="fixed left-0 right-0 top-0 z-40 border-b border-gold-500/30 bg-navy-900/95 py-2.5 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <button
          id="brand-logo-btn"
          type="button"
          onClick={() => run(goToDigitalHome)}
          className="flex min-w-0 items-center gap-2.5 text-left cursor-pointer"
          aria-label={t('digitalNav.home')}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold-500/50 bg-navy-950 p-1 sm:h-10 sm:w-10">
            <CakraNexaLogo className="h-full w-full" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight text-white sm:text-xl">CAKRA<span className="text-gold-400">NEXA</span></span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-gold-400/90">Digital</span>
          </span>
        </button>

        <nav aria-label={t('digitalNav.label')} className="hidden flex-1 items-center justify-center gap-5 lg:flex">
          <button type="button" id="dnav-audiobook" onClick={() => run(() => goToDigitalListing('audiobook'))} className={linkClass(isActive('audiobook'))}>
            <Headphones className="h-4 w-4" />
            {t('digitalNav.audiobook')}
          </button>
          <button type="button" id="dnav-ebook" onClick={() => run(() => goToDigitalListing('ebook'))} className={linkClass(isActive('ebook'))}>
            <TabletSmartphone className="h-4 w-4" />
            {t('digitalNav.ebook')}
          </button>
          <div className="relative" onMouseEnter={() => hover('categories')} onMouseLeave={() => hover(null)}>
            <button type="button" id="dnav-categories" aria-expanded={open === 'categories'} onClick={() => setOpen(open === 'categories' ? null : 'categories')} className={linkClass(false)}>
              {t('digitalNav.categories')}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {open === 'categories' && (
              <div className="absolute left-1/2 top-full z-50 mt-2 w-80 -translate-x-1/2 rounded-xl border border-cream-200 bg-white p-2 shadow-xl">{categoryMenu}</div>
            )}
          </div>
          <button type="button" id="dnav-join" onClick={() => run(goToMembership)} className={linkClass(activePage === 'membership')}>
            {t('digitalNav.join')}
          </button>
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageSwitcher className="hidden sm:flex" />
          <button type="button" id="btn-search-trigger" onClick={onOpenSearch} title={t('common:nav.searchTitle')} aria-label={t('common:nav.searchTitle')} className="rounded-full p-2 text-cream-100 hover:bg-white/10 hover:text-white cursor-pointer">
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            id="btn-cart-trigger"
            onClick={onOpenCart}
            title={t('common:nav.cartTitle')}
            aria-label={t('common:nav.cartButton', { quantity: cartCount })}
            className="relative rounded-full p-2 text-cream-100 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <ShoppingBag className="h-4 w-4" />
            {cartCount > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-gold-500 px-1 text-[9px] font-bold text-navy-950">{cartCount}</span>}
          </button>
          <div className="relative hidden lg:block" onMouseEnter={() => hover('more')} onMouseLeave={() => hover(null)}>
            <button type="button" id="dnav-more" aria-expanded={open === 'more'} onClick={() => setOpen(open === 'more' ? null : 'more')} className={linkClass(false)}>
              {t('digitalNav.more')}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {open === 'more' && <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-cream-200 bg-white p-2 shadow-xl">{moreMenu}</div>}
          </div>
          <button
            type="button"
            id="dnav-start-free"
            onClick={() => run(startFree)}
            className="hidden items-center gap-1.5 rounded-lg bg-gold-500 px-3 py-2 text-xs font-bold text-navy-950 hover:bg-gold-400 sm:inline-flex cursor-pointer"
          >
            {member.isLoggedIn ? <><Library className="h-3.5 w-3.5" />{t('digitalNav.myLibrary')}</> : t('digitalNav.startFree')}
          </button>
          <button
            type="button"
            id="btn-mobile-menu-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
            className="rounded-md p-2 text-cream-100 hover:bg-white/10 lg:hidden cursor-pointer"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="max-h-[85vh] overflow-y-auto border-t border-gold-500/20 bg-navy-900 px-4 pb-6 pt-3 lg:hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-semibold text-slate-400">{t('common:language')}</span>
            <LanguageSwitcher className="flex" />
          </div>
          <div className="mt-2 grid gap-1">
            <button type="button" onClick={() => run(() => goToDigitalListing('audiobook'))} className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-cream-50">
              <Headphones className="h-4 w-4 text-gold-400" />
              {t('digitalNav.audiobook')}
            </button>
            <button type="button" onClick={() => run(() => goToDigitalListing('ebook'))} className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-cream-50">
              <TabletSmartphone className="h-4 w-4 text-gold-400" />
              {t('digitalNav.ebook')}
            </button>
            <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wider text-gold-400">{t('digitalNav.categories')}</p>
            <div className="rounded-lg bg-white p-1">{categoryMenu}</div>
            <button type="button" onClick={() => run(goToMembership)} className="rounded px-3 py-2 text-left text-sm font-semibold text-cream-50">
              {t('digitalNav.join')}
            </button>
            <button type="button" onClick={() => run(startFree)} className="mt-1 rounded-lg bg-gold-500 px-3 py-2.5 text-center text-sm font-bold text-navy-950">
              {member.isLoggedIn ? t('digitalNav.myLibrary') : t('digitalNav.startFree')}
            </button>
            <p className="px-3 pt-3 text-[10px] font-bold uppercase tracking-wider text-gold-400">{t('digitalNav.more')}</p>
            <div className="rounded-lg bg-white p-1">{moreMenu}</div>
          </div>
        </div>
      )}
    </header>
  );
};
