import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, Star, ArrowRight } from 'lucide-react';
import { Book } from '../types';
import { resolveImageUrl, handleImageError } from '../utils/imageUtils';
import { toTitleCase } from '../utils/formatters';
import { useBookText, useCategoryLabel, useFormatters } from '../i18n/hooks';

interface BookCardProps {
  book: Book;
  onSelectBook: (book: Book) => void;
  onAddToCart: (book: Book) => void;
  onQuickBuy: (book: Book) => void;
  className?: string;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  onSelectBook,
  onAddToCart,
  onQuickBuy,
  className = ''
}) => {
  const { t } = useTranslation(['catalog', 'common']);
  const categoryLabel = useCategoryLabel();
  const { currency } = useFormatters();
  const bookText = useBookText();
  const isPurchasable = Number(book?.harga) > 0;
  if (!book) return null;
  const bookTitle = bookText.title(book);
  const displayTitle = toTitleCase(bookTitle);

  return (
    <article
      id={`book-card-${book?.id || 'item'}`}
      className={`group flex h-full flex-col justify-between bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 transition-all duration-200 shadow-xs hover:shadow-md text-left ${className}`}
    >
      {/* Top Part: Cover & Metadata */}
      <div className="flex flex-1 flex-col">
        {/* Clean Cover Presentation Container - No text or badge overlays */}
        <div
          onClick={() => onSelectBook(book)}
          className="aspect-[3/4] bg-slate-50 overflow-hidden mb-3.5 relative rounded-lg cursor-pointer border border-slate-100 flex items-center justify-center shadow-xs group-hover:border-slate-200 transition-colors"
        >
          <img
            src={resolveImageUrl(book?.coverBuku, 'book', book?.id)}
            alt={bookTitle || t('card.coverAlt')}
            onError={(e) => handleImageError(e, {
              title: bookTitle,
              author: book?.author,
              category: book?.category,
              isbn: book?.isbn,
              year: book?.tahunTerbit
            }, 'book')}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
        </div>

        {/* Category & Status Line */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 font-mono truncate">
            {book?.category ? categoryLabel(book.category) : t('card.categoryFallback')}
          </span>
          {book?.bukuTerbaru && (
            <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded shrink-0">
              {t('common:latest')}
            </span>
          )}
        </div>

        {/* Title */}
        <h4
          onClick={() => onSelectBook(book)}
          className="h-[5.5rem] line-clamp-4 text-xs sm:text-sm font-semibold leading-snug text-slate-900 group-hover:text-[#9A7B38] transition-colors mb-1 cursor-pointer [overflow-wrap:anywhere]"
          title={displayTitle}
        >
          {displayTitle || t('card.titleFallback')}
        </h4>

        {/* Author */}
        <p className="min-h-4 text-xs text-slate-500 mb-2 font-normal line-clamp-1">
          {book?.author || '-'}
        </p>

        {/* Rating (hanya jika ada ulasan nyata) & Jumlah Halaman (hanya jika sudah diisi) */}
        <div className="flex min-h-[16px] items-center justify-between text-[11px] text-slate-400 mb-3 font-mono">
          {book?.rating && book?.reviewsCount ? (
            <div className="flex items-center gap-1 text-amber-500">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-slate-700">{book.rating.toFixed(1)}</span>
              <span className="text-slate-400 text-[10px]">({book.reviewsCount})</span>
            </div>
          ) : (
            <span className="text-slate-400">{book?.tahunTerbit || ''}{book?.ukuranBuku ? ` • ${book.ukuranBuku.split(' (')[0]}` : ''}</span>
          )}
          {book?.jumlahHalaman ? <span>{t('card.pages', { pages: book.jumlahHalaman })}</span> : null}
        </div>
      </div>

      {/* Price & Action Row */}
      <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
        {/* Price Information */}
        <div className="flex min-h-[2.25rem] items-baseline justify-between gap-1 w-full">
          <div>
            {book?.originalHarga && book.originalHarga > book.harga ? (
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] text-slate-400 line-through font-mono">
                  {currency(book.originalHarga)}
                </span>
                {book?.discountPercentage ? (
                  <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1 rounded">
                    -{book.discountPercentage}%
                  </span>
                ) : null}
              </div>
            ) : null}
            {isPurchasable ? (
              <span className="font-bold text-slate-900 text-sm sm:text-base leading-tight block whitespace-nowrap font-mono">
                {currency(book.harga)}
              </span>
            ) : (
              <span className="font-semibold text-amber-700 text-xs leading-tight block whitespace-nowrap">
                {t('common:priceComingSoon')}
              </span>
            )}
          </div>

          <span className="text-[10px] text-slate-400 font-mono truncate" title={book?.isbn || undefined}>
            {book?.isbn ? (/^\d/.test(book.isbn) ? t('isbn.short', { suffix: book.isbn.slice(-6) }) : t('isbn.inSubmission')) : t('isbn.toFollow')}
          </span>
        </div>

        {/* Action Buttons */}
        {!isPurchasable ? (
          <button
            id={`btn-preorder-${book?.id}`}
            onClick={() => onSelectBook(book)}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 h-8.5 px-3 text-xs font-semibold transition-colors rounded-lg cursor-pointer border border-slate-200 flex items-center justify-center gap-1.5"
            title={t('common:viewDetails')}
          >
            <span>{t('common:viewDetails')}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        ) : (
        <div className="grid grid-cols-[38px_minmax(0,1fr)] gap-2 w-full">
          <button
            id={`btn-cart-${book?.id}`}
            onClick={() => onAddToCart(book)}
            className="bg-slate-900 hover:bg-slate-800 text-white h-8.5 transition-colors flex items-center justify-center rounded-lg cursor-pointer shadow-xs"
            title={t('common:actions.addToCart')}
            aria-label={t('common:actions.addToCart')}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
          </button>
          <button
            id={`btn-buy-now-${book?.id}`}
            onClick={() => onQuickBuy(book)}
            className="min-w-0 bg-[#D4AF37] hover:bg-[#c5a059] text-slate-950 h-8.5 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold transition-colors rounded-lg cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 shadow-xs"
            title={t('common:actions.buyNow')}
          >
            {/* Kartu sempit (2 kolom di ponsel): teks dipotong rapi, ikon panah disembunyikan */}
            <span className="min-w-0 truncate">{t('common:actions.buyNow')}</span>
            <ArrowRight className="hidden sm:block w-3 h-3 shrink-0 text-slate-950" />
          </button>
        </div>
        )}
      </div>
    </article>
  );
};
