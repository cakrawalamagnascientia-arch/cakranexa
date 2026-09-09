import React, { useRef, useState, useEffect } from 'react';
import { Book, BestSellerSectionSettings } from '../types';
import { resolveImageUrl, handleImageError } from '../utils/imageUtils';
import { toTitleCase } from '../utils/formatters';
import { 
  SlidersHorizontal,
  ShoppingCart, 
  ArrowRight,
  Star
} from 'lucide-react';

interface BestSellerTickerProps {
  books: Book[];
  settings?: BestSellerSectionSettings;
  badge?: string;
  title?: string;
  subtitle?: string;
  speedSeconds?: number;
  customBookIds?: string[];
  onSelectBook?: (book: Book) => void;
  onBookClick?: (book: Book) => void;
  onAddToCart: (book: Book, e?: React.MouseEvent) => void;
  onQuickBuy?: (book: Book, e?: React.MouseEvent) => void;
  onDirectBuy?: (book: Book, e?: React.MouseEvent) => void;
  onViewAll?: () => void;
  onNavigateToKatalog?: () => void;
}

export const BestSellerTicker: React.FC<BestSellerTickerProps> = ({
  books = [],
  settings,
  customBookIds,
  onSelectBook,
  onBookClick,
  onAddToCart,
  onQuickBuy,
  onDirectBuy
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>(settings?.speed || 'normal');
  const [isHovered, setIsHovered] = useState<boolean>(false);

  useEffect(() => {
    if (settings?.speed) {
      setSpeed(settings.speed);
    }
  }, [settings?.speed]);

  const handleBookClick = (book: Book) => {
    if (onSelectBook) onSelectBook(book);
    else if (onBookClick) onBookClick(book);
  };

  const handleBuy = (book: Book, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onQuickBuy) onQuickBuy(book, e);
    else if (onDirectBuy) onDirectBuy(book, e);
  };

  const effectiveCustomIds = settings?.customBookIds || customBookIds;

  // Determine Best Seller books
  const bestSellerBooks = React.useMemo(() => {
    if (!books || books.length === 0) return [];

    // 1. If custom IDs configured in CMS
    if (effectiveCustomIds && effectiveCustomIds.length > 0) {
      const customList = effectiveCustomIds
        .map(id => books.find(b => b.id === id || b.slug === id))
        .filter((b): b is Book => Boolean(b));
      if (customList.length > 0) return customList;
    }

    // 2. Best seller eksplisit (flag isBestSeller dari Admin / badge "Best Seller")
    const purchasable = books.filter((b) => Number(b.harga) > 0);
    const explicit = purchasable.filter((b) => b.isBestSeller === true || b.badge === 'Best Seller');
    if (explicit.length >= 4) {
      return explicit.sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));
    }

    // 3. Fallback: buku yang sudah bisa dipesan (ber-ISBN terlebih dahulu), urut berdasarkan ulasan nyata jika ada
    return [...purchasable].sort((a, b) => {
      const isbnA = /^\d/.test(a.isbn || '') ? 1 : 0;
      const isbnB = /^\d/.test(b.isbn || '') ? 1 : 0;
      if (isbnA !== isbnB) return isbnB - isbnA;
      return ((b.rating || 0) * 10 + (b.reviewsCount || 0)) - ((a.rating || 0) * 10 + (a.reviewsCount || 0));
    });
  }, [books, effectiveCustomIds]);

  // Continuous Marquee animation speed
  const getAnimationDuration = () => {
    const itemCount = Math.max(1, bestSellerBooks.length);
    switch (speed) {
      case 'slow': return `${itemCount * 12}s`;
      case 'fast': return `${itemCount * 4.5}s`;
      case 'normal':
      default: return `${itemCount * 7.5}s`;
    }
  };

  if (!settings?.isEnabled && settings !== undefined) {
    return null;
  }

  if (bestSellerBooks.length === 0) {
    return null;
  }

  // Duplicate items for infinite seamless looping
  const displayItems = [...bestSellerBooks, ...bestSellerBooks, ...bestSellerBooks];

  return (
    <section 
      id="section-2-bestseller-ticker" 
      className="relative py-6 md:py-8 bg-white text-slate-900 overflow-hidden border-y border-slate-200"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Clean right-aligned animation speed controls */}
        <div className="flex items-center justify-end mb-4">
          <div className="inline-flex items-center gap-1.5 p-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-xs shadow-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
            <span className="text-[11px] font-medium text-slate-600 pr-1 select-none">Kecepatan:</span>
            {(['slow', 'normal', 'fast'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  speed === s 
                    ? 'bg-[#D4AF37] text-slate-950 font-semibold shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
                }`}
                title={`Kecepatan ${s === 'slow' ? 'Lambat' : s === 'normal' ? 'Normal' : 'Cepat'}`}
              >
                {s === 'slow' ? 'Lambat' : s === 'normal' ? 'Normal' : 'Cepat'}
              </button>
            ))}
          </div>
        </div>

        {/* Running Listing Container */}
        <div 
          className="relative overflow-hidden group"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Continuous Ticker Track */}
          <div 
            ref={containerRef}
            className="flex gap-4 sm:gap-5 overflow-x-auto scrollbar-none py-2"
            style={{ scrollBehavior: 'smooth' }}
          >
            <div 
              className="flex gap-4 sm:gap-5 shrink-0"
              style={{
                animation: !isHovered
                  ? `marqueeListing ${getAnimationDuration()} linear infinite` 
                  : 'none'
              }}
            >
              {displayItems.map((book, idx) => {
                const rankNumber = (idx % bestSellerBooks.length) + 1;
                const formattedPrice = new Intl.NumberFormat('id-ID', {
                  style: 'currency',
                  currency: 'IDR',
                  maximumFractionDigits: 0
                }).format(book.harga);

                const originalFormattedPrice = book.originalHarga ? new Intl.NumberFormat('id-ID', {
                  style: 'currency',
                  currency: 'IDR',
                  maximumFractionDigits: 0
                }).format(book.originalHarga) : null;

                return (
                  <div
                    key={`${book.id}-marquee-${idx}`}
                    className="w-72 sm:w-80 shrink-0 bg-slate-900/95 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors duration-200 flex flex-col justify-between group/card shadow-sm relative cursor-pointer"
                    onClick={() => handleBookClick(book)}
                  >
                    {/* Top Meta Line: Rank & Category */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-[10px] font-mono font-medium text-slate-400">
                        #{String(rankNumber).padStart(2, '0')}
                      </span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60 font-mono">
                        {book.category}
                      </span>
                    </div>

                    {/* Book Cover and Content Flex */}
                    <div className="flex gap-3.5 mb-3.5">
                      {/* Book Cover Image - Clean, no text or overlays */}
                      <div className="w-24 sm:w-26 h-34 sm:h-38 shrink-0 rounded-lg overflow-hidden bg-slate-950 border border-slate-800 shadow-sm relative">
                        <img 
                          src={resolveImageUrl(book.coverBuku, 'book', book.id)} 
                          alt={book.name}
                          onError={(e) => handleImageError(e, {
                            title: book.name,
                            author: book.author,
                            category: book.category,
                            isbn: book.isbn,
                            year: book.tahunTerbit
                          }, 'book')}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover object-center"
                          loading="lazy"
                        />
                      </div>

                      {/* Info & Meta */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between text-left">
                        <div>
                          <h3 className="font-semibold text-xs sm:text-sm text-white line-clamp-2 leading-snug group-hover/card:text-[#DFBF64] transition-colors">
                            {toTitleCase(book.title || book.name)}
                          </h3>
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-1 font-normal">
                            {book.author}
                          </p>
                        </div>

                        {/* Rating & ISBN */}
                        <div className="space-y-0.5 my-1">
                          {book.rating && book.reviewsCount ? (
                            <div className="flex items-center gap-1 text-[11px] text-amber-400">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span className="font-semibold">{book.rating}</span>
                              <span className="text-slate-500 text-[10px]">({book.reviewsCount})</span>
                            </div>
                          ) : null}

                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            ISBN: {book.isbn || 'menyusul'}
                          </div>
                        </div>

                        {/* Price */}
                        <div>
                          {originalFormattedPrice && (
                            <span className="text-[10px] line-through text-slate-500 block font-mono">
                              {originalFormattedPrice}
                            </span>
                          )}
                          <div className="text-xs sm:text-sm font-bold text-[#DFBF64] tracking-tight font-mono">
                            {formattedPrice}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Buttons: Add to Cart & Buy Now */}
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToCart(book, e);
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 text-xs font-medium transition-colors cursor-pointer"
                        title="Tambah ke Keranjang"
                      >
                        <ShoppingCart className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-[11px]">Keranjang</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleBuy(book, e)}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-[#D4AF37] hover:bg-[#c5a059] text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
                        title="Beli Sekarang"
                      >
                        <span className="text-[11px]">Beli Sekarang</span>
                        <ArrowRight className="w-3 h-3 text-slate-950" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Global CSS for seamless infinite translate animation */}
      <style>{`
        @keyframes marqueeListing {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333333%);
          }
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </section>
  );
};
