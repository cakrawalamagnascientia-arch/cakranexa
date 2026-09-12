import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import type { BookFormat, DigitalProduct } from '../../types';
import { useDigitalCatalog } from '../../hooks/useDigitalCatalog';
import { FormatIcon } from './FormatIcon';
import { ComingSoonButton } from './ComingSoonButton';
import { useDigitalFormatters } from './useDigitalFormatters';

const FORMAT_ORDER: BookFormat[] = ['print', 'ebook', 'audiobook'];

interface FormatSelectorProps {
  bookId: string;
  selected: BookFormat;
  onSelect: (format: BookFormat) => void;
}

/**
 * Pemilih format "Cetak | E-Book | Audiobook" di kartu harga halaman buku.
 * Format digital yang belum tersedia nonaktif dengan label "Segera" (produk ada) atau "Tidak tersedia".
 */
export const FormatSelector: React.FC<FormatSelectorProps> = ({ bookId, selected, onSelect }) => {
  const { t } = useTranslation('digital');
  const products = useDigitalCatalog().forBook(bookId);
  const labelId = `format-selector-label-${bookId}`;

  return (
    <div id="book-format-selector">
      <span id={labelId} className="text-xs text-slate-400 uppercase font-medium tracking-wider">{t('formatSelector.label')}</span>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-2 grid grid-cols-3 gap-2">
        {FORMAT_ORDER.map((format) => {
          const product = format === 'print' ? undefined : products[format];
          const enabled = format === 'print' || product?.availabilityStatus === 'available';
          const note = enabled ? null : product ? t('status.comingSoon') : t('status.unavailable');
          const isSelected = selected === format;
          return (
            <button
              key={format}
              id={`format-option-${format}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={!enabled}
              onClick={() => onSelect(format)}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-2 text-[11px] font-semibold transition-colors sm:text-xs ${
                isSelected
                  ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#DFBF64]'
                  : enabled
                    ? 'cursor-pointer border-slate-700 bg-slate-800 text-white hover:border-slate-500'
                    : 'cursor-not-allowed border-slate-800 bg-slate-900/60 text-slate-500'
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <FormatIcon format={format} className="h-3.5 w-3.5" />
                <span className="truncate">{t(`formats.${format}`)}</span>
              </span>
              {note && <span className="text-[10px] font-medium">{note}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface DigitalFormatPanelProps {
  product: DigitalProduct;
  onViewDetail: () => void;
}

/** Harga & aksi format digital di kartu harga halaman buku; alur pembelian cetak tidak disentuh. */
export const DigitalFormatPanel: React.FC<DigitalFormatPanelProps> = ({ product, onViewDetail }) => {
  const { t } = useTranslation('digital');
  const fmt = useDigitalFormatters();
  const formatLabel = fmt.formatLabel(product.format);

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs text-slate-400 uppercase font-medium tracking-wider">{t('formatSelector.digitalPrice', { format: formatLabel })}</span>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-[#DFBF64] sm:text-3xl">{fmt.unitPrice(product)}</div>
        <p className="mt-1 text-[11px] text-slate-400">{t('formatSelector.digitalNote')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
        <ComingSoonButton id="btn-detail-buy-digital" tone="dark" size="md" label={t('common.buyFormat', { format: formatLabel })} />
        <button
          type="button"
          id="btn-detail-view-digital"
          onClick={onViewDetail}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-slate-700 cursor-pointer"
        >
          <span>{t('formatSelector.viewDigitalDetail', { format: formatLabel })}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
