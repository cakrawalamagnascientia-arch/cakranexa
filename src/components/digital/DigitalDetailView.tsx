import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { ActivePage, Book, DigitalFormat, SubSection } from '../../types';
import { useDigitalCatalog, type DigitalEntry } from '../../hooks/useDigitalCatalog';
import { useBookText, useCategoryLabel } from '../../i18n/hooks';
import { resolveImageUrl, handleImageError } from '../../utils/imageUtils';
import { toTitleCase } from '../../utils/formatters';
import { getShelfStatus } from '../../data/digitalProducts';
import { DIGITAL_SHELF_PLANS } from '../../data/membership';
import { FormatIcon } from './FormatIcon';
import { ComingSoonButton } from './ComingSoonButton';
import { DigitalProductCard } from './DigitalProductCard';
import { useDigitalFormatters } from './useDigitalFormatters';

interface DigitalDetailViewProps {
  /** undefined = produk tidak ditemukan (atau katalog belum termuat). */
  entry: DigitalEntry | undefined;
  format: DigitalFormat;
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
  onOpenProduct: (entry: DigitalEntry) => void;
  onOpenSample: (entry: DigitalEntry) => void;
  onOpenPrintBook: (book: Book) => void;
}

/** Halaman /digital/<format>/<slug>: detail, cara mendapatkan (satuan vs keanggotaan), sampel, versi cetak, judul terkait. */
export const DigitalDetailView: React.FC<DigitalDetailViewProps> = ({
  entry,
  format,
  onNavigate,
  onOpenProduct,
  onOpenSample,
  onOpenPrintBook
}) => {
  const { t } = useTranslation('digital');
  const bookText = useBookText();
  const categoryLabel = useCategoryLabel();
  const fmt = useDigitalFormatters();
  const { entries } = useDigitalCatalog();

  if (!entry) {
    return (
      <div id="digital-detail-not-found" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex justify-center text-slate-300">
            <FormatIcon format={format} className="h-10 w-10" />
          </div>
          <h1 className="mt-3 text-lg font-bold text-slate-900">{t('detail.notFound.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('detail.notFound.description')}</p>
          <button
            type="button"
            onClick={() => onNavigate('digital', format)}
            className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            {t('detail.notFound.back', { format: fmt.formatLabel(format) })}
          </button>
        </div>
      </div>
    );
  }

  const { product, book } = entry;
  const title = toTitleCase(bookText.title(book));
  const subtitle = bookText.subtitle(book);
  const formatLabel = fmt.formatLabel(product.format);
  const isAvailable = product.availabilityStatus === 'available';
  const shelf = getShelfStatus(product);
  const hasSample = product.format === 'ebook' || Boolean(product.sampleAudioUrl);
  const sampleLabel = product.format === 'ebook' ? t('common.readSample') : t('common.listenSample');
  const related = entries
    .filter((item) => item.product.format === product.format && item.book.category === book.category && item.product.id !== product.id)
    .slice(0, 4);

  const specs = [
    { label: t('detail.format'), value: formatLabel },
    product.format === 'ebook' && product.pageCount
      ? { label: t('detail.pageCount'), value: t('common.pages', { count: product.pageCount }) }
      : null,
    product.format === 'audiobook' && product.durationSeconds
      ? { label: t('detail.duration'), value: fmt.duration(product.durationSeconds) || '' }
      : null,
    product.format === 'audiobook' && product.narrator ? { label: t('detail.narrator'), value: product.narrator } : null,
    product.format === 'ebook' && product.samplePageStart && product.samplePageEnd
      ? { label: t('detail.sampleRange'), value: t('detail.sampleRangeValue', { start: product.samplePageStart, end: product.samplePageEnd }) }
      : null,
    product.format === 'audiobook' && product.sampleAudioUrl
      ? { label: t('detail.sampleAudio'), value: t('detail.sampleAudioValue', { minutes: Math.round(product.sampleAudioSeconds / 60) }) }
      : null,
    { label: t('detail.shelfDate'), value: product.shelfEntryDate ? fmt.isoDate(product.shelfEntryDate) : t('detail.notSet') }
  ].filter((spec): spec is { label: string; value: string } => spec !== null);

  const shelfNote = shelf === 'onShelf'
    ? t('detail.howToGet.shelfOnShelf')
    : shelf === 'scheduled' && product.shelfEntryDate
      ? t('detail.howToGet.shelfScheduled', { date: fmt.isoDate(product.shelfEntryDate) })
      : t('detail.howToGet.shelfUnscheduled');

  return (
    <div id="digital-detail-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">
      <button
        type="button"
        id="btn-digital-back-listing"
        onClick={() => onNavigate('digital', product.format)}
        className="mb-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-200/80 hover:text-[#0F172A] sm:text-sm cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4 text-[#DFBF64]" />
        <span>{t('detail.backToListing', { format: formatLabel })}</span>
      </button>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 xl:gap-12">
        {/* Sampul & sampel */}
        <div className="lg:col-span-4">
          <div className="mx-auto w-full max-w-xs rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
            <div className="aspect-[3/4] overflow-hidden rounded bg-slate-800">
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
                className="h-full w-full object-cover"
              />
            </div>
          </div>
          {hasSample && (
            <button
              type="button"
              id="btn-digital-open-sample"
              onClick={() => onOpenSample(entry)}
              className="mx-auto mt-4 flex w-full max-w-xs items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer"
            >
              <FormatIcon format={product.format} className="h-4 w-4 text-[#9A7B38]" />
              {sampleLabel}
            </button>
          )}
        </div>

        <div className="space-y-6 lg:col-span-8">
          {/* Judul & harga satuan */}
          <header>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <span>{categoryLabel(book.category)}</span>
              <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 text-[10px] text-[#DFBF64]">
                <FormatIcon format={product.format} className="h-3 w-3" />
                {formatLabel}
              </span>
              <span className={`rounded px-2 py-0.5 text-[10px] ${isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {isAvailable ? t('status.available') : t('status.comingSoon')}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl [overflow-wrap:anywhere]">{title}</h1>
            {subtitle && <p className="mt-2 text-sm italic text-slate-500 sm:text-base">{subtitle}</p>}
            <p className="mt-2 text-sm text-slate-600">{book.author}</p>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs uppercase tracking-wider text-slate-400">{t('common.unitPrice')}</span>
              <span className={product.price > 0 ? 'text-xl font-bold text-slate-900' : 'text-base font-semibold text-amber-700'}>
                {fmt.unitPrice(product)}
              </span>
            </p>
          </header>

          {/* Deskripsi */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-900">{t('detail.description')}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{bookText.sinopsis(book)}</p>
          </section>

          {/* Informasi format */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-900">{t('detail.formatInfo')}</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs sm:grid-cols-3">
              {specs.map((spec) => (
                <div key={spec.label} className="min-w-0">
                  <dt className="mb-0.5 text-slate-400">{spec.label}</dt>
                  <dd className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Cara mendapatkan */}
          <section aria-labelledby="digital-how-to-get">
            <h2 id="digital-how-to-get" className="mb-3 text-lg font-bold text-slate-900">{t('detail.howToGet.title')}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-5 text-white">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#DFBF64]">{t('detail.howToGet.buyTitle')}</h3>
                <div className={`mt-2 font-bold ${product.price > 0 ? 'text-2xl' : 'text-lg text-amber-300'}`}>{fmt.unitPrice(product)}</div>
                <p className="mt-2 flex-1 text-xs text-slate-300">{t('detail.howToGet.buyDescription')}</p>
                <div className="mt-4">
                  {isAvailable ? (
                    <ComingSoonButton id="btn-digital-buy" tone="dark" size="md" label={t('common.buyFormat', { format: formatLabel })} />
                  ) : (
                    <p className="rounded-lg bg-slate-800 px-3 py-2 text-center text-xs text-slate-300">{t('common.comingSoonLabel')}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('detail.howToGet.membershipTitle')}</h3>
                <p className="mt-2 text-xs text-slate-600">{t('detail.howToGet.membershipDescription')}</p>
                <ul className="mt-2 space-y-1.5 text-xs font-semibold text-slate-800">
                  {DIGITAL_SHELF_PLANS.map((plan) => (
                    <li key={plan.key} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                      <span>{t(`membership.plans.${plan.key}.name`)}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>{t('detail.howToGet.institutionPlan')}</span>
                  </li>
                </ul>
                <p className={`mt-3 flex-1 rounded-lg px-3 py-2 text-xs ${shelf === 'onShelf' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                  {shelfNote}
                </p>
                <button
                  type="button"
                  id="btn-digital-view-plans"
                  onClick={() => onNavigate('membership')}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  {t('detail.howToGet.viewPlans')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </section>

          {/* Versi cetak */}
          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FormatIcon format="print" className="h-4 w-4 text-slate-600" />
                {t('detail.printVersion')}
              </h2>
              <p className="mt-1 text-xs text-slate-600">{t('detail.printVersionDescription')}</p>
            </div>
            <button
              type="button"
              id="btn-digital-print-version"
              onClick={() => onOpenPrintBook(book)}
              className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 cursor-pointer"
            >
              {t('detail.printVersionLink')}
            </button>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold text-slate-900">{t('detail.related', { format: formatLabel })}</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {related.map((item) => (
              <DigitalProductCard key={item.product.id} entry={item} onOpen={onOpenProduct} onOpenSample={onOpenSample} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
