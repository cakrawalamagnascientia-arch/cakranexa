import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { ActivePage, BookCategory, DigitalAvailability, DigitalFormat, SubSection } from '../../types';
import { useDigitalCatalog, type DigitalEntry } from '../../hooks/useDigitalCatalog';
import { useBookText, useCategoryLabel } from '../../i18n/hooks';
import { DIGITAL_FORMATS } from '../../data/digitalProducts';
import { FormatIcon } from './FormatIcon';
import { DigitalShelfCard } from './DigitalShelfCard';
import { useShelfRules } from '../../hooks/useShelfRules';
import { inclusionBadge } from '../../data/digitalShelf';

const CATEGORIES: BookCategory[] = ['Akuntansi', 'Perpajakan', 'Hukum', 'Ekonomi & Bisnis', 'Filsafat', 'Teologia'];
type AvailabilityFilter = 'all' | DigitalAvailability;

interface DigitalListingViewProps {
  format: DigitalFormat;
  /** Kategori awal dari URL (?kategori=), mis. dari menu Kategori atau "Lihat semua" di beranda digital. */
  initialCategory?: string | null;
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
  onOpenProduct: (entry: DigitalEntry) => void;
  /** Tidak dipakai kartu fase 6 (sampel dibuka dari halaman buku); dipertahankan untuk kompatibilitas pemanggil. */
  onOpenSample?: (entry: DigitalEntry) => void;
}

/** Halaman /digital/ebook dan /digital/audiobook: hero, filter kategori & ketersediaan, pencarian, grid kartu rak (2:3). */
export const DigitalListingView: React.FC<DigitalListingViewProps> = ({ format, initialCategory = null, onNavigate, onOpenProduct }) => {
  const { t } = useTranslation('digital');
  const categoryLabel = useCategoryLabel();
  const bookText = useBookText();
  const { entries } = useDigitalCatalog();
  const rules = useShelfRules();
  const [category, setCategory] = useState<string>(initialCategory && (CATEGORIES as string[]).includes(initialCategory) ? initialCategory : 'all');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [query, setQuery] = useState('');

  const formatEntries = useMemo(() => entries.filter((entry) => entry.product.format === format), [entries, format]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    formatEntries.forEach((entry) => counts.set(entry.book.category, (counts.get(entry.book.category) || 0) + 1));
    return counts;
  }, [formatEntries]);

  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => formatEntries
    .filter(({ product, book }) =>
      (category === 'all' || book.category === category)
      && (availability === 'all' || product.availabilityStatus === availability)
      && (!normalizedQuery || [bookText.title(book), book.name, book.author].some((value) => (value || '').toLowerCase().includes(normalizedQuery)))
    )
    // Judul yang sudah tersedia tampil lebih dulu; urutan katalog dipertahankan (sort stabil).
    .sort((a, b) => Number(b.product.availabilityStatus === 'available') - Number(a.product.availabilityStatus === 'available')),
  [formatEntries, category, availability, normalizedQuery, bookText]);

  const hasFilters = category !== 'all' || availability !== 'all' || normalizedQuery !== '';
  const resetFilters = () => {
    setCategory('all');
    setAvailability('all');
    setQuery('');
  };

  const chipClass = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
      active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
    }`;

  return (
    <div id={`digital-listing-${format}`} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-navy-900 p-6 text-white shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold-400">
            <FormatIcon format={format} className="h-3.5 w-3.5" />
            {t(`listing.${format}.badge`)}
          </span>
          <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">{t(`listing.${format}.title`)}</h1>
          <p className="mt-2 text-sm text-slate-300 sm:text-base">{t(`listing.${format}.subtitle`)}</p>
        </div>
        <div className="relative mt-5 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label={t('listing.formatSwitch')} className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
            {DIGITAL_FORMATS.map((item) => (
              <button
                key={item}
                id={`digital-format-tab-${item}`}
                type="button"
                role="tab"
                aria-selected={item === format}
                onClick={() => item !== format && onNavigate('digital', item)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  item === format ? 'bg-gold-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                <FormatIcon format={item} className="h-3.5 w-3.5" />
                {t(`formats.${item}`)}
              </button>
            ))}
          </div>
          <p className="min-w-0 flex-1 basis-60 text-xs text-slate-400">
            {t('listing.membershipHint')}{' '}
            <button
              type="button"
              onClick={() => onNavigate('membership')}
              className="font-semibold text-gold-400 hover:underline cursor-pointer"
            >
              {t('listing.membershipLink')}
            </button>
          </p>
        </div>
      </section>

      {/* Filter & pencarian */}
      <div className="mt-6 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="relative block w-full md:max-w-sm">
            <span className="sr-only">{t('listing.filters.searchLabel')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="digital-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('listing.filters.searchPlaceholder')}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
            />
          </label>
          <div role="radiogroup" aria-label={t('listing.filters.availability')} className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-1 md:self-auto">
            {(['all', 'available', 'coming_soon'] as const).map((value) => (
              <button
                key={value}
                id={`digital-availability-${value}`}
                type="button"
                role="radio"
                aria-checked={availability === value}
                onClick={() => setAvailability(value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  availability === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {value === 'all' ? t('listing.filters.all') : value === 'available' ? t('listing.filters.available') : t('listing.filters.comingSoon')}
              </button>
            ))}
          </div>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="group" aria-label={t('listing.filters.category')} className="flex gap-2 pb-1">
            <button type="button" onClick={() => setCategory('all')} aria-pressed={category === 'all'} className={chipClass(category === 'all')}>
              {t('listing.filters.allCategories')}
              <span className="font-mono text-[10px] opacity-70">{formatEntries.length}</span>
            </button>
            {CATEGORIES.filter((cat) => categoryCounts.has(cat)).map((cat) => (
              <button key={cat} type="button" onClick={() => setCategory(cat)} aria-pressed={category === cat} className={chipClass(category === cat)}>
                {categoryLabel(cat)}
                <span className="font-mono text-[10px] opacity-70">{categoryCounts.get(cat)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <span id="digital-result-count">{t('listing.resultCount', { count: visible.length })}</span>
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="font-semibold text-gold-700 hover:underline cursor-pointer">
              {t('listing.filters.reset')}
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {visible.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((entry) => (
            <DigitalShelfCard
              key={entry.product.id}
              layout="grid"
              entry={entry}
              badge={inclusionBadge(entry.product, rules.today, rules.frontlist)}
              onOpen={onOpenProduct}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <div className="flex justify-center text-slate-300">
            <FormatIcon format={format} className="h-10 w-10" />
          </div>
          {formatEntries.length === 0 && format === 'audiobook' ? (
            <>
              <p className="mt-3 text-sm text-slate-600">{t('listing.empty.noAudiobooks')}</p>
              <button
                type="button"
                onClick={() => onNavigate('digital', 'ebook')}
                className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                {t('listing.empty.browseEbooks')}
              </button>
            </>
          ) : (
            <>
              <h2 className="mt-3 text-base font-bold text-slate-900">{t('listing.empty.title')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('listing.empty.description')}</p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {t('listing.filters.reset')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
