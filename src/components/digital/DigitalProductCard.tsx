import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Mic } from 'lucide-react';
import type { DigitalEntry } from '../../hooks/useDigitalCatalog';
import { useBookText, useCategoryLabel } from '../../i18n/hooks';
import { resolveImageUrl, handleImageError } from '../../utils/imageUtils';
import { toTitleCase } from '../../utils/formatters';
import { getShelfStatus } from '../../data/digitalProducts';
import { FormatIcon } from './FormatIcon';
import { ComingSoonButton } from './ComingSoonButton';
import { useDigitalFormatters } from './useDigitalFormatters';

interface DigitalProductCardProps {
  entry: DigitalEntry;
  onOpen: (entry: DigitalEntry) => void;
  onOpenSample: (entry: DigitalEntry) => void;
}

/**
 * Kartu produk digital. Produk "Tersedia": tombol beli (placeholder fase 2) + tautan sampel.
 * Produk "Segera": label tanggal masuk rak digital (atau "Segera tersedia").
 */
export const DigitalProductCard: React.FC<DigitalProductCardProps> = ({ entry, onOpen, onOpenSample }) => {
  const { t } = useTranslation('digital');
  const bookText = useBookText();
  const categoryLabel = useCategoryLabel();
  const fmt = useDigitalFormatters();
  const { product, book } = entry;
  const title = toTitleCase(bookText.title(book));
  const formatLabel = fmt.formatLabel(product.format);
  const isAvailable = product.availabilityStatus === 'available';
  const hasSample = product.format === 'ebook' || Boolean(product.sampleAudioUrl);
  const shelfDate = product.shelfEntryDate ? fmt.isoDate(product.shelfEntryDate) : null;
  const duration = product.format === 'audiobook' ? fmt.duration(product.durationSeconds) : null;
  const narrator = product.format === 'audiobook' ? product.narrator : null;

  return (
    <article
      id={`digital-card-${product.id}`}
      className="group flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md sm:p-4"
    >
      <div className="flex flex-1 flex-col">
        <button
          type="button"
          onClick={() => onOpen(entry)}
          aria-label={`${t('common.viewDetails')}: ${title}`}
          className="mb-3 flex aspect-[3/4] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 shadow-xs transition-colors group-hover:border-slate-200"
        >
          <img
            src={resolveImageUrl(book.coverBuku, 'book', book.id)}
            alt={t('common.coverAlt', { title })}
            onError={(e) => handleImageError(e, {
              title,
              author: book.author,
              category: book.category,
              isbn: book.isbn,
              year: book.tahunTerbit
            }, 'book')}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </button>

        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {categoryLabel(book.category)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-semibold text-[#DFBF64]">
            <FormatIcon format={product.format} className="h-3 w-3" />
            {formatLabel}
          </span>
        </div>

        <h3
          onClick={() => onOpen(entry)}
          title={title}
          className="line-clamp-3 cursor-pointer text-[12px] font-semibold leading-snug text-slate-900 transition-colors group-hover:text-[#9A7B38] sm:text-[13px] [overflow-wrap:anywhere]"
        >
          {title}
        </h3>
        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{book.author}</p>

        {(duration || narrator) && (
          <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
            {duration && (
              <p className="flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{duration}</span>
              </p>
            )}
            {narrator && (
              <p className="flex items-center gap-1">
                <Mic className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="line-clamp-1">{t('common.narratedBy', { name: narrator })}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="text-[10px] text-slate-400">{t('common.unitPrice')}</span>
          <span className={product.price > 0 ? 'font-mono text-sm font-bold text-slate-900' : 'text-xs font-semibold text-amber-700'}>
            {fmt.unitPrice(product)}
          </span>
        </div>

        {isAvailable ? (
          <>
            <ComingSoonButton id={`btn-buy-digital-${product.id}`} label={t('common.buyFormat', { format: formatLabel })} />
            {hasSample && (
              <button
                type="button"
                onClick={() => onOpenSample(entry)}
                className="text-center text-xs font-semibold text-[#9A7B38] hover:underline cursor-pointer"
              >
                {product.format === 'ebook' ? t('common.readSample') : t('common.listenSample')}
              </button>
            )}
            {shelfDate && getShelfStatus(product) === 'scheduled' && (
              <p className="text-center text-[10px] text-slate-500">{t('common.shelfEntry', { date: shelfDate })}</p>
            )}
          </>
        ) : (
          <p className="rounded-lg bg-slate-50 px-2 py-1.5 text-center text-[11px] font-medium text-slate-600">
            {shelfDate ? t('common.shelfEntry', { date: shelfDate }) : t('common.comingSoonLabel')}
          </p>
        )}
      </div>
    </article>
  );
};
