import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DigitalEntry } from '../../hooks/useDigitalCatalog';
import { useBookText } from '../../i18n/hooks';
import { resolveImageUrl, handleImageError } from '../../utils/imageUtils';
import { toTitleCase } from '../../utils/formatters';
import type { InclusionBadge } from '../../data/digitalShelf';
import { FormatIcon } from './FormatIcon';
import { useDigitalFormatters } from './useDigitalFormatters';

interface DigitalShelfCardProps {
  entry: DigitalEntry;
  badge: InclusionBadge;
  onOpen: (entry: DigitalEntry) => void;
  /** Rak "Lanjutkan membaca": persen progres. */
  progress?: number | null;
  /** Rak "Segera masuk rak": tanggal buka untuk paket pengguna (YYYY-MM-DD). */
  openDate?: string | null;
  /** 'shelf' = lebar tetap untuk rak horizontal; 'grid' = mengikuti kolom. */
  layout?: 'shelf' | 'grid';
}

/**
 * Kartu buku area digital fase 6: sampul 2:3, ikon format, badge "Termasuk Silver/Gold/Platinum" atau "Sampel",
 * judul serif. Tanpa harga, tanpa tombol beli, tanpa bintang rating.
 */
export const DigitalShelfCard: React.FC<DigitalShelfCardProps> = ({ entry, badge, onOpen, progress = null, openDate = null, layout = 'shelf' }) => {
  const { t } = useTranslation('digital');
  const bookText = useBookText();
  const fmt = useDigitalFormatters();
  const { product, book } = entry;
  const title = toTitleCase(bookText.title(book));
  const badgeText = badge.kind === 'plan'
    ? t('card.includedIn', { plan: t(`membership.plans.${badge.plan}.name`) })
    : badge.kind === 'sample' ? t('card.sample') : t('card.soon');
  const badgeClass = badge.kind === 'plan'
    ? 'bg-gold-500 text-navy-950'
    : badge.kind === 'sample' ? 'bg-cream-100 text-navy-900 ring-1 ring-cream-200' : 'bg-navy-800 text-cream-100';

  return (
    <article
      id={`shelf-card-${product.id}`}
      data-format={product.format}
      className={`group flex flex-col text-left ${layout === 'shelf' ? 'w-36 shrink-0 snap-start sm:w-40 lg:w-44' : 'w-full'}`}
    >
      <button
        type="button"
        onClick={() => onOpen(entry)}
        aria-label={t('card.open', { title })}
        className="relative block aspect-[2/3] w-full cursor-pointer overflow-hidden rounded-lg bg-navy-900 shadow-md ring-1 ring-navy-900/10 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg"
      >
        <img
          src={resolveImageUrl(book.coverBuku, 'book', book.id)}
          alt={t('common.coverAlt', { title })}
          onError={(e) => handleImageError(e, { title, author: book.author, category: book.category, isbn: book.isbn, year: book.tahunTerbit }, 'book')}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <span
          className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-navy-900/85 text-gold-400 backdrop-blur-sm"
          title={fmt.formatLabel(product.format)}
        >
          <FormatIcon format={product.format} className="h-3.5 w-3.5" label={fmt.formatLabel(product.format)} />
        </span>
        {progress !== null && (
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-navy-950/60" aria-hidden="true">
            <span className="block h-full bg-gold-500" style={{ width: `${Math.max(2, Math.min(100, progress))}%` }} />
          </span>
        )}
      </button>

      <span className={`mt-2 inline-flex self-start rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`} data-badge={badge.kind === 'plan' ? badge.plan : badge.kind}>
        {badgeText}
      </span>
      <h3
        onClick={() => onOpen(entry)}
        title={title}
        className="font-heading mt-1.5 line-clamp-2 cursor-pointer text-sm font-semibold leading-snug text-navy-900 transition-colors group-hover:text-gold-700 [overflow-wrap:anywhere]"
      >
        {title}
      </h3>
      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{book.author}</p>
      {progress !== null && <p className="mt-0.5 text-[11px] font-medium text-gold-700">{t('card.progress', { percent: Math.round(progress) })}</p>}
      {openDate && <p className="mt-0.5 text-[11px] font-medium text-navy-700">{t('card.opensOn', { date: fmt.isoDate(openDate) })}</p>}
    </article>
  );
};
