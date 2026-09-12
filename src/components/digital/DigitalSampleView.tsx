import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import type { ActivePage, SubSection } from '../../types';
import type { DigitalEntry } from '../../hooks/useDigitalCatalog';
import { useBookText } from '../../i18n/hooks';
import { toTitleCase } from '../../utils/formatters';
import { FormatIcon } from './FormatIcon';
import { ComingSoonButton } from './ComingSoonButton';
import { useDigitalFormatters } from './useDigitalFormatters';

/** Pratinjau statis selama halaman sampel asli belum diunggah ke bucket digital-samples. */
const PLACEHOLDER_PAGES = [
  '/images/digital/sample-page-placeholder.svg',
  '/images/digital/sample-page-placeholder.svg',
  '/images/digital/sample-page-placeholder.svg'
];

interface DigitalSampleViewProps {
  entry: DigitalEntry | undefined;
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
  onBackToDetail: (entry: DigitalEntry) => void;
}

/**
 * Halaman /digital/sample/<id>: gambar halaman sampel e-book atau pemutar audio sampel (maks. 5–6 menit).
 *
 * TODO: phase-2 — ganti pratinjau ini dengan reader/player terproteksi (streaming bertoken, tanpa URL file
 * langsung) untuk pemilik lisensi. Halaman ini hanya boleh memuat file SAMPEL dari bucket publik.
 */
export const DigitalSampleView: React.FC<DigitalSampleViewProps> = ({ entry, onNavigate, onBackToDetail }) => {
  const { t } = useTranslation('digital');
  const bookText = useBookText();
  const fmt = useDigitalFormatters();

  if (!entry) {
    return (
      <div id="digital-sample-not-found" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-600">{t('sample.notFound')}</p>
          <button
            type="button"
            onClick={() => onNavigate('digital', 'ebook')}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            {t('library.browseEbooks')}
          </button>
        </div>
      </div>
    );
  }

  const { product, book } = entry;
  const title = toTitleCase(bookText.title(book));
  const formatLabel = fmt.formatLabel(product.format);
  const usingPlaceholders = product.sampleImageUrls.length === 0;
  const pages = usingPlaceholders ? PLACEHOLDER_PAGES : product.sampleImageUrls;
  const hasRange = Boolean(product.samplePageStart && product.samplePageEnd && product.pageCount);

  return (
    <div id="digital-sample-page" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">
      <button
        type="button"
        id="btn-sample-back-detail"
        onClick={() => onBackToDetail(entry)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-200/80 hover:text-[#0F172A] sm:text-sm cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4 text-[#DFBF64]" />
        <span>{t('sample.backToDetail')}</span>
      </button>

      <header className="mt-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#9A7B38]">
          <FormatIcon format={product.format} className="h-3.5 w-3.5" />
          {t('sample.badge')}
        </span>
        <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
          {product.format === 'ebook' ? t('sample.titleEbook') : t('sample.titleAudiobook')}
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-800 [overflow-wrap:anywhere]">{title}</p>
        <p className="text-sm text-slate-500">{book.author}</p>
      </header>

      {product.format === 'ebook' ? (
        <section className="mt-6 space-y-4">
          {usingPlaceholders && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">{t('sample.placeholderNote')}</p>
          )}
          {hasRange && (
            <p className="text-xs text-slate-500">
              {t('sample.rangeNote', { start: product.samplePageStart, end: product.samplePageEnd, total: product.pageCount })}
            </p>
          )}
          <div className="space-y-6">
            {pages.map((src, index) => (
              <figure key={`${src}-${index}`} className="mx-auto max-w-2xl">
                <img
                  src={src}
                  alt={t('sample.pageAlt', { number: index + 1, title })}
                  loading="lazy"
                  className="w-full rounded-lg border border-slate-200 bg-white shadow-sm"
                />
                <figcaption className="mt-2 text-center text-xs text-slate-500">{t('sample.pageLabel', { number: index + 1 })}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white">
          {product.sampleAudioUrl ? (
            <>
              <p className="text-sm text-slate-300">{t('sample.audioNote', { minutes: Math.round(product.sampleAudioSeconds / 60) })}</p>
              <audio
                id="digital-sample-audio"
                className="mt-4 w-full"
                controls
                preload="none"
                controlsList="nodownload"
                src={product.sampleAudioUrl}
              >
                {t('sample.audioUnsupported')}
              </audio>
            </>
          ) : (
            <p className="text-sm text-slate-300">{t('sample.audioUnavailable')}</p>
          )}
        </section>
      )}

      <section className="mt-8 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{t('sample.ctaTitle')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('sample.ctaDescription')}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-64 sm:shrink-0">
          {product.availabilityStatus === 'available' && (
            <ComingSoonButton id="btn-sample-buy" label={t('common.buyFormat', { format: formatLabel })} size="md" />
          )}
          <button
            type="button"
            id="btn-sample-membership"
            onClick={() => onNavigate('membership')}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 cursor-pointer"
          >
            {t('detail.howToGet.viewPlans')}
          </button>
        </div>
      </section>
    </div>
  );
};
