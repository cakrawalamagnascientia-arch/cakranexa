import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, ListOrdered } from 'lucide-react';
import type { ActivePage, Book, DigitalFormat, SubSection } from '../../types';
import { useDigitalCatalog, type DigitalEntry } from '../../hooks/useDigitalCatalog';
import { useBookText, useCategoryLabel } from '../../i18n/hooks';
import { resolveImageUrl, handleImageError } from '../../utils/imageUtils';
import { toTitleCase } from '../../utils/formatters';
import { FormatIcon } from './FormatIcon';
import { TitleAccessPanel } from './TitleAccessPanel';
import { DigitalShelfCard } from './DigitalShelfCard';
import { useShelfRules } from '../../hooks/useShelfRules';
import { INSTITUTION_FRONTLIST_DAYS, inclusionBadge } from '../../data/digitalShelf';
import { availabilityByPlan } from '../../data/titleAccess';
import { getPublicChapters, type PublicChapter } from '../../services/digitalApi';
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

const CHAPTER_PREVIEW = 8;

/** Posisi bab audio sebagai jam:menit:detik. */
const clock = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

/**
 * Halaman /digital/<format>/<slug> (fase 6 Langkah 3): tombol utama sesuai status pengguna (tanpa pembelian satuan),
 * deskripsi, daftar bab, informasi format (durasi, narator), ketersediaan per paket, versi cetak, dan judul terkait.
 */
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
  const shelfRules = useShelfRules();
  const productId = entry?.product.id ?? null;
  const [chapters, setChapters] = useState<PublicChapter[]>([]);
  const [showAllChapters, setShowAllChapters] = useState(false);

  useEffect(() => {
    setChapters([]);
    setShowAllChapters(false);
    if (!productId) return;
    let cancelled = false;
    void getPublicChapters(productId).then((list) => { if (!cancelled) setChapters(list); });
    return () => { cancelled = true; };
  }, [productId]);

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
  const hasSample = product.format === 'ebook' || Boolean(product.sampleAudioUrl);
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

  const availability = availabilityByPlan(product.shelfEntryDate, shelfRules.frontlist, INSTITUTION_FRONTLIST_DAYS);
  const visibleChapters = showAllChapters ? chapters : chapters.slice(0, CHAPTER_PREVIEW);

  return (
    <div id="digital-detail-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">
      <button
        type="button"
        id="btn-digital-back-listing"
        onClick={() => onNavigate('digital', product.format)}
        className="mb-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-200/80 hover:text-navy-900 sm:text-sm cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4 text-gold-400" />
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
        </div>

        <div className="space-y-6 lg:col-span-8">
          {/* Judul (skema langganan: harga satuan tidak ditampilkan) */}
          <header>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <span>{categoryLabel(book.category)}</span>
              <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 text-[10px] text-gold-400">
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
          </header>

          {isAvailable || hasSample ? (
            <TitleAccessPanel product={product} hasSample={hasSample} onOpenSample={() => onOpenSample(entry)} />
          ) : (
            <p id="digital-access-coming-soon" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t('detail.access.notices.comingSoon')}
            </p>
          )}

          {/* Deskripsi */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-900">{t('detail.description')}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{bookText.sinopsis(book)}</p>
          </section>

          {chapters.length > 0 && (
            <section id="digital-chapters" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900">
                <ListOrdered className="h-4 w-4 text-gold-700" aria-hidden="true" />
                {t('detail.chapters.title', { count: chapters.length })}
              </h2>
              <ol className="divide-y divide-slate-100 text-sm">
                {visibleChapters.map((chapter) => (
                  <li key={chapter.number} className="flex items-baseline gap-3 py-2">
                    <span className="w-7 shrink-0 text-right text-xs font-semibold text-slate-400">{chapter.number}</span>
                    <span className="min-w-0 flex-1 text-slate-800 [overflow-wrap:anywhere]">{chapter.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      {product.format === 'audiobook' && chapter.startSeconds !== null
                        ? clock(chapter.startSeconds)
                        : chapter.startPage !== null
                          ? t('detail.chapters.page', { page: chapter.startPage })
                          : ''}
                    </span>
                  </li>
                ))}
              </ol>
              {chapters.length > CHAPTER_PREVIEW && (
                <button
                  type="button"
                  id="btn-digital-chapters-toggle"
                  onClick={() => setShowAllChapters((v) => !v)}
                  className="mt-2 text-xs font-semibold text-gold-700 hover:underline cursor-pointer"
                >
                  {showAllChapters ? t('detail.chapters.showLess') : t('detail.chapters.showAll', { count: chapters.length })}
                </button>
              )}
            </section>
          )}

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

          {/* Ketersediaan per paket (tanpa penjualan satuan) */}
          <section id="digital-availability" aria-labelledby="digital-availability-title" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 id="digital-availability-title" className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('detail.availability.title')}</h2>
            <p className="mt-1 text-xs text-slate-600">{t('detail.availability.description')}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[18rem] text-left text-xs">
                <tbody className="divide-y divide-slate-100">
                  {availability.map((row) => {
                    const open = row.openDate !== null && row.openDate <= shelfRules.today;
                    const mine = row.plan === shelfRules.memberPlan;
                    const how = row.plan === 'blue'
                      ? t('detail.availability.sampleOnly')
                      : row.plan === 'institution' || row.plan === 'platinum'
                        ? t('detail.availability.fullShelf')
                        : product.format === 'ebook'
                          ? t('detail.availability.withQuota')
                          : t('detail.availability.withAudioHours');
                    return (
                      <tr key={row.plan} data-plan={row.plan} className={mine ? 'bg-gold-500/10' : undefined}>
                        <th scope="row" className="py-2 pr-3 font-semibold text-slate-900">
                          {row.plan === 'institution' ? t('detail.availability.institution') : t(`membership.plans.${row.plan}.name`)}
                          {mine && <span className="ml-1.5 rounded bg-gold-500 px-1.5 py-0.5 text-[10px] font-bold text-navy-950">{t('detail.availability.yourPlan')}</span>}
                        </th>
                        <td className="py-2 pr-3 text-slate-600">{how}</td>
                        <td className="py-2 text-right font-semibold text-slate-800">
                          {row.plan === 'blue'
                            ? '—'
                            : row.openDate === null
                              ? t('detail.availability.dateTbd')
                              : open
                                ? t('detail.availability.openNow')
                                : t('detail.availability.opensOn', { date: fmt.isoDate(row.openDate) })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              id="btn-digital-view-plans"
              onClick={() => onNavigate('membership')}
              className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer"
            >
              {t('detail.availability.comparePlans')}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
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
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 lg:grid-cols-5">
            {related.map((item) => (
              <DigitalShelfCard
                key={item.product.id}
                layout="grid"
                entry={item}
                badge={inclusionBadge(item.product, shelfRules.today, shelfRules.frontlist)}
                onOpen={onOpenProduct}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
