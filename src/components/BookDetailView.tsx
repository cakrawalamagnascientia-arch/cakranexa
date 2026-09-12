import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ShoppingCart,
  ShieldCheck,
  Star,
  BookOpen,
  User,
  ListOrdered,
  Share2,
  BookmarkCheck,
  Building,
  CheckCircle2
} from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Book } from '../types';
import { trackViewContent } from '../services/trackingService';
import { resolveImageUrl, handleImageError } from '../utils/imageUtils';
import { toTitleCase } from '../utils/formatters';
import { useBookText, useCategoryLabel, useFormatters, useLocalized } from '../i18n/hooks';

interface BookDetailViewProps {
  book: Book;
  onBack: () => void;
  onAddToCart: (book: Book) => void;
  onQuickBuy?: (book: Book) => void;
  onBuyNow?: (book: Book) => void;
  relatedBooks?: Book[];
  onSelectRelatedBook?: (book: Book) => void;
}

export const BookDetailView: React.FC<BookDetailViewProps> = ({
  book,
  onBack,
  onAddToCart,
  onQuickBuy,
  onBuyNow,
  relatedBooks = [],
  onSelectRelatedBook
}) => {
  const { t } = useTranslation(['book', 'common']);
  const { currency } = useFormatters();
  const categoryLabel = useCategoryLabel();
  const bookText = useBookText();
  const localized = useLocalized();
  const categoryName = categoryLabel(book?.category ?? '');
  const isPurchasable = Number(book?.harga) > 0;
  const hasReviews = Boolean(book?.rating && book?.reviewsCount);
  const [activeTab, setActiveTab] = useState<'sinopsis' | 'penulis' | 'daftar-isi' | 'review'>('sinopsis');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (book) {
      trackViewContent(book);
    }
  }, [book?.id]);

  const handlePurchase = () => {
    if (onBuyNow) {
      onBuyNow(book);
    } else if (onQuickBuy) {
      onQuickBuy(book);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!book) {
    return (
      <div id="book-detail-loading" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-4">
          <BookOpen className="w-12 h-12 text-slate-800 mx-auto opacity-70 animate-pulse" />
          <h2 className="text-lg font-bold text-slate-800">{t('loading.title')}</h2>
          <p className="text-xs text-slate-500 font-medium">{t('loading.hint')}</p>
          <button
            onClick={onBack}
            className="px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('nav.backToPrevious')}</span>
          </button>
        </div>
      </div>
    );
  }

  const bookTitle = bookText.title(book);
  const displayTitle = toTitleCase(bookTitle);
  const bookSubtitle = bookText.subtitle(book);

  return (
    <div id="book-detail-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">

      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 mb-8">
        <button
          id="btn-back-catalog"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700 hover:text-[#0F172A] bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-lg border border-slate-200 transition-all cursor-pointer group shadow-xs"
          title={t('nav.backTitle')}
        >
          <ArrowLeft className="w-4 h-4 text-[#DFBF64] group-hover:-translate-x-1 transition-transform" />
          <span>{t('nav.backToPrevious')}</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{copied ? t('common:save') : t('common:viewDetails')}</span>
          </button>
        </div>
      </div>

      {/* Main Top Section: Cover + Book Meta (Figma Grade Luxury Corporate) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12 items-start mb-12">

        {/* Col 1: Book Cover with Clean Line Frame */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="relative w-full max-w-sm aspect-[3/4] bg-slate-900 rounded-2xl p-6 sm:p-8 flex items-center justify-center border border-slate-800 shadow-sm">

            {/* 3D Realistic Spine Effect */}
            <div className="relative w-full h-full book-shadow book-spine-effect rounded-r overflow-hidden">
              <img
                src={resolveImageUrl(book?.coverBuku, 'book', book?.id)}
                alt={bookTitle || t('cover.alt')}
                onError={(e) => handleImageError(e, {
                  title: bookTitle,
                  author: book?.author,
                  category: book?.category,
                  isbn: book?.isbn,
                  year: book?.tahunTerbit
                }, 'book')}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/40 p-4 flex flex-col justify-between pointer-events-none">
                <div className="flex justify-between items-start">
                  <span className="text-[9px] uppercase tracking-wider text-[#DFBF64] font-mono font-bold">
                    {t('cover.officialEdition')}
                  </span>
                  <span className="text-[9px] text-slate-300 font-mono">
                    {book?.tahunTerbit}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-white text-xs sm:text-sm line-clamp-3 leading-snug">
                    {displayTitle}
                  </h3>
                  <p className="text-[10px] text-slate-300 mt-1 font-medium">{book?.author}</p>
                </div>
              </div>
            </div>

            {/* Badges */}
            <div className="absolute top-4 left-4 z-20">
              <span className="px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-slate-900 text-[#DFBF64] border border-slate-700 shadow-sm">
                {categoryName}
              </span>
            </div>
          </div>

          {/* Quick Assurance Badges */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm mt-4 text-left">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5 min-w-0">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800">{t('assurance.officialIsbn')}</div>
                <div className="text-[11px] text-slate-500 font-mono">{book?.isbn || t('assurance.isbnPending')}</div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5 min-w-0">
              <Building className="w-4 h-4 text-slate-700 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800">{t('common:officialSeller')}</div>
                <div className="text-[11px] text-slate-500 truncate">PT CAKRAWALA MAGNA SCIENTIA</div>
              </div>
            </div>
          </div>
        </div>

        {/* Col 2: Title, Author, Pricing, CTA & Technical Specs Grid */}
        <div className="lg:col-span-7 space-y-6">

          {/* Header Info */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                {categoryName} • {t('meta.academicMonograph')}
              </span>
              {book?.bukuTerbaru && (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {t('meta.newRelease')}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
              {displayTitle}
            </h1>
            {bookSubtitle && (
              <p className="mt-2 text-sm sm:text-base text-slate-500 italic">{bookSubtitle}</p>
            )}
            {book?.coverQuote && (
              <blockquote className="mt-4 border-l-2 border-[#D4AF37] pl-4 text-sm text-slate-600 italic">
                “{bookText.coverQuote(book)}”
              </blockquote>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-600">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-400" />
                <span className="font-medium">
                  <Trans
                    t={t}
                    i18nKey="meta.labeledValue"
                    values={{ label: t('common:authors'), value: book?.author ?? '' }}
                    components={{ strong: <strong className="text-slate-900 font-semibold" /> }}
                  />
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Building className="w-4 h-4 text-slate-400" />
                <span className="font-medium">
                  <Trans
                    t={t}
                    i18nKey="meta.labeledValue"
                    values={{ label: t('common:publisher'), value: book?.penerbit ?? '' }}
                    components={{ strong: <strong className="text-slate-900 font-semibold" /> }}
                  />
                </span>
              </div>
              {hasReviews && (
                <div className="flex items-center gap-1 text-[#DFBF64]">
                  <Star className="w-4 h-4 fill-[#DFBF64]" />
                  <span className="font-bold text-slate-900">{book.rating}</span>
                  <span className="text-slate-400 font-medium">{t('meta.verifiedReviews', { count: book.reviewsCount })}</span>
                </div>
              )}
            </div>
          </div>

          {/* Pricing & CTA Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 uppercase font-medium tracking-wider">{t('pricing.officialPrintPrice')}</span>
                  {book?.originalHarga && book.originalHarga > book.harga && (
                    <span className="text-xs text-slate-400 line-through font-mono">
                      {currency(book.originalHarga)}
                    </span>
                  )}
                  {book?.discountPercentage ? (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-700/60 px-1.5 py-0.5 rounded">
                      {t('pricing.save', { percent: book.discountPercentage })}
                    </span>
                  ) : null}
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-[#DFBF64] tracking-tight mt-0.5">
                  {isPurchasable ? currency(book.harga) : t('common:priceComingSoon')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isPurchasable ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-xs text-emerald-300 font-medium">
                      {typeof book?.stock === 'number' ? t('pricing.inStock', { count: book.stock }) : t('pricing.availableOnDemand')}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-xs text-amber-300 font-medium">{t('pricing.forthcoming')}</span>
                  </>
                )}
              </div>
            </div>

            {isPurchasable ? (
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  id="btn-detail-quick-buy"
                  onClick={handlePurchase}
                  className="w-full py-3 px-4 rounded-lg bg-[#D4AF37] hover:bg-[#c5a059] text-slate-950 font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{t('actions.buyNow')}</span>
                </button>

                <button
                  id="btn-detail-add-cart"
                  onClick={() => onAddToCart(book)}
                  className="w-full py-3 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>{t('actions.addToCart')}</span>
                </button>
              </div>
            ) : (
              <div className="pt-2">
                <a
                  id="btn-detail-notify"
                  href={`https://wa.me/6285286146806?text=${encodeURIComponent(t('whatsapp.notifyMessage', { title: book?.name }))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3 px-4 rounded-lg bg-[#D4AF37] hover:bg-[#c5a059] text-slate-950 font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{t('actions.notifyOnRelease')}</span>
                </a>
              </div>
            )}

            <p className="text-[11px] text-slate-400 text-center sm:text-left flex items-center gap-1.5 justify-center sm:justify-start font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('pricing.paymentNote')}</span>
            </p>
          </div>

          {/* Technical Specifications Grid */}
          <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <BookmarkCheck className="w-4 h-4 text-slate-800" />
              <span>{t('specs.title')}</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 text-xs font-medium">
              <div>
                <span className="text-slate-400 block mb-0.5 font-normal">{t('specs.isbn')}</span>
                <span className="font-semibold text-slate-900 font-mono">{book?.isbn || t('specs.isbnUnavailable')}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-normal">{t('specs.publicationYear')}</span>
                <span className="font-semibold text-slate-900">{book?.tahunTerbit}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-normal">{t('specs.pageCount')}</span>
                <span className="font-semibold text-slate-900">{book?.jumlahHalaman ? t('specs.pages', { count: book.jumlahHalaman }) : t('specs.pagesPending')}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-normal">{t('specs.dimensions')}</span>
                <span className="font-semibold text-slate-900">{book?.ukuranBuku || '155 x 230 mm'}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-normal">{t('specs.category')}</span>
                <span className="font-semibold text-slate-900">{categoryName}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-normal">{t('specs.estimatedWeight')}</span>
                <span className="font-semibold text-slate-900">{t('specs.weight', { weight: book?.beratGram || 520 })}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-normal">{t('specs.language')}</span>
                <span className="font-semibold text-slate-900">{t('specs.languageValue')}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-normal">{t('common:publisher')}</span>
                <span className="font-semibold text-slate-900">{book?.penerbit}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-normal">{t('specs.physicalCondition')}</span>
                <span className="font-semibold text-emerald-700">{t('specs.conditionValue')}</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Interactive Tabs Section: Sinopsis, Penulis, Daftar Isi, Review */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-12">

        {/* Tab Headers */}
        <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto">
          <button
            id="tab-btn-sinopsis"
            onClick={() => setActiveTab('sinopsis')}
            className={`py-3.5 px-6 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'sinopsis'
                ? 'border-slate-900 text-slate-900 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4 text-slate-800" />
            <span>{t('tabs.synopsis')}</span>
          </button>

          <button
            id="tab-btn-penulis"
            onClick={() => setActiveTab('penulis')}
            className={`py-3.5 px-6 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'penulis'
                ? 'border-slate-900 text-slate-900 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4 text-slate-800" />
            <span>{t('tabs.aboutAuthor')}</span>
          </button>

          <button
            id="tab-btn-daftar-isi"
            onClick={() => setActiveTab('daftar-isi')}
            className={`py-3.5 px-6 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'daftar-isi'
                ? 'border-slate-900 text-slate-900 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ListOrdered className="w-4 h-4 text-slate-800" />
            <span>{t('tabs.contents')}</span>
          </button>

          <button
            id="tab-btn-review"
            onClick={() => setActiveTab('review')}
            className={`py-3.5 px-6 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'review'
                ? 'border-slate-900 text-slate-900 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Star className="w-4 h-4 text-slate-800" />
            <span>{hasReviews ? t('tabs.reviewsWithTotal', { total: book.reviewsCount }) : t('tabs.reviews')}</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 sm:p-8">

          {/* 1. Sinopsis */}
          {activeTab === 'sinopsis' && (
            <div className="space-y-4 max-w-4xl text-slate-700 leading-relaxed text-sm sm:text-base">
              <h4 className="font-bold text-slate-900 text-lg sm:text-xl">
                {t('synopsis.heading')}
              </h4>
              <p className="font-normal text-slate-800 leading-relaxed">
                {bookText.sinopsis(book)}
              </p>
              <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs font-bold text-slate-900 uppercase block mb-1">{t('synopsis.audienceTitle')}</span>
                  <p className="text-xs text-slate-600 font-medium">
                    {t('synopsis.audienceText')}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs font-bold text-slate-900 uppercase block mb-1">{t('synopsis.valueTitle')}</span>
                  <p className="text-xs text-slate-600 font-medium">
                    {t('synopsis.valueText')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. Tentang Penulis */}
          {activeTab === 'penulis' && (
            <div className="space-y-6 max-w-4xl">
              <div className="flex flex-col sm:flex-row items-start gap-5">
                <div className="w-16 h-16 rounded-full bg-slate-900 text-[#DFBF64] font-bold text-xl flex items-center justify-center border-2 border-slate-700 flex-shrink-0">
                  {(book?.author || 'SI').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-lg">
                    {book?.author}
                  </h4>
                  <p className="text-xs text-slate-600 font-medium mb-3">
                    {t('aboutAuthor.byline')}
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed font-normal">
                    {book?.tentangPenulis || t('aboutAuthor.fallbackBio')}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <span className="font-bold text-slate-800">{t('aboutAuthor.affiliationLabel')}</span>
                <p className="font-medium">{t('aboutAuthor.affiliationValue')}</p>
              </div>
            </div>
          )}

          {/* 3. Daftar Isi */}
          {activeTab === 'daftar-isi' && (
            <div className="max-w-4xl space-y-4">
              <h4 className="font-bold text-slate-900 text-lg">
                {t('contents.heading')}
              </h4>
              <div className="space-y-2.5">
                {(book?.daftarIsi && book.daftarIsi.length > 0
                  ? book.daftarIsi
                  : []
                ).map((chap, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 transition-all flex items-center justify-between text-xs sm:text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded bg-slate-900 text-[#DFBF64] text-[11px] font-mono font-bold flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-slate-800">{chap}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono font-medium">{t('contents.verifiedChapter')}</span>
                  </div>
                ))}
                {(!book?.daftarIsi || book.daftarIsi.length === 0) && (
                  <div className="p-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-600">
                    <Trans t={t} i18nKey="contents.empty" components={{ strong: <strong /> }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. Review */}
          {activeTab === 'review' && (
            <div className="max-w-4xl space-y-6">
              {hasReviews ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <div className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                      <span>{book.rating?.toFixed(1)}</span>
                      <span className="text-sm font-normal text-slate-500">{t('reviews.outOf')}</span>
                    </div>
                    <div className="flex text-[#DFBF64] mt-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < Math.round(book.rating || 0) ? 'fill-[#DFBF64]' : ''}`} />
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-1">{t('reviews.basedOn', { count: book.reviewsCount })}</p>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center">
                  <Star className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">{t('reviews.emptyTitle')}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t('reviews.emptyText')}
                  </p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Related Books in Same Category */}
      {(relatedBooks || []).length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="font-bold text-slate-900 text-base sm:text-lg">
              {t('related.heading', { category: categoryName })}
            </h3>
            <span className="text-xs text-slate-500 font-medium">{t('related.curated')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(relatedBooks || []).map((relBook) => (
              <div
                key={relBook?.id || relBook?.slug}
                onClick={() => onSelectRelatedBook?.(relBook)}
                className="bg-white rounded-xl border border-slate-200 hover:border-slate-400 p-3.5 flex flex-col justify-between hover:shadow-sm transition-all cursor-pointer group"
              >
                <div className="space-y-2.5">
                  <div className="aspect-[3/4] bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center">
                    <img
                      src={resolveImageUrl(relBook?.coverBuku, 'book', relBook?.id)}
                      alt={(relBook && bookText.title(relBook)) || t('cover.alt')}
                      onError={(e) => handleImageError(e, {
                        title: relBook && bookText.title(relBook),
                        author: relBook?.author,
                        category: relBook?.category,
                        isbn: relBook?.isbn,
                        year: relBook?.tahunTerbit
                      }, 'book')}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-600 block">
                    {categoryLabel(relBook?.category ?? '')}
                  </span>
                  <h4 className="font-semibold text-xs text-slate-900 line-clamp-2 group-hover:text-[#9A7B38] transition-colors">
                    {/* Tanpa toTitleCase seperti sebelumnya: nama asli (Indonesia) atau terjemahannya. */}
                    {relBook && localized(relBook, 'name')}
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium truncate">
                    {relBook?.author}
                  </p>
                </div>
                <div className="pt-2.5 mt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900">
                    {relBook?.harga ? currency(relBook.harga) : t('common:priceComingSoon')}
                  </span>
                  <span className="text-[10px] text-slate-700 font-bold group-hover:underline">
                    {t('related.view')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
