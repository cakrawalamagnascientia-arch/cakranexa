import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ShelfProps {
  id: string;
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  children: React.ReactNode;
}

/** Rak horizontal beranda digital: judul serif, "Lihat semua", geser dengan sentuhan atau tombol panah (md+). */
export const Shelf: React.FC<ShelfProps> = ({ id, title, subtitle, onSeeAll, children }) => {
  const { t } = useTranslation('digital');
  const track = useRef<HTMLDivElement>(null);
  const scroll = (direction: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="py-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-xl font-bold text-navy-900 sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onSeeAll && (
            <button type="button" onClick={onSeeAll} className="rounded-full px-3 py-1 text-xs font-semibold text-gold-700 hover:bg-cream-100 cursor-pointer">
              {t('home.shelves.seeAll')}
            </button>
          )}
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={t('home.shelves.previous')}
            className="hidden h-8 w-8 items-center justify-center rounded-full border border-cream-200 bg-white text-navy-800 hover:border-gold-500 md:inline-flex cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={t('home.shelves.next')}
            className="hidden h-8 w-8 items-center justify-center rounded-full border border-cream-200 bg-white text-navy-800 hover:border-gold-500 md:inline-flex cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={track} className="shelf-track -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0">
        {children}
      </div>
    </section>
  );
};
