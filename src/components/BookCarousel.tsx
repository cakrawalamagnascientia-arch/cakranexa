import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Book } from '../types';
import { BookCard } from './BookCard';
import { useCategoryLabel } from '../i18n/hooks';

interface BookCarouselProps {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  books: Book[];
  onSelectBook: (book: Book) => void;
  onAddToCart: (book: Book) => void;
  onQuickBuy: (book: Book) => void;
  onViewMore: () => void;
  viewMoreText?: string;
  categories?: string[];
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
}

export const BookCarousel: React.FC<BookCarouselProps> = ({
  id,
  title,
  subtitle,
  badge,
  books = [],
  onSelectBook,
  onAddToCart,
  onQuickBuy,
  onViewMore,
  viewMoreText,
  categories,
  selectedCategory,
  onSelectCategory
}) => {
  const { t } = useTranslation('home');
  const categoryLabel = useCategoryLabel();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Filter books if category is active
  const displayedBooks = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'all') return books;
    return (books || []).filter((b) => b?.category === selectedCategory);
  }, [books, selectedCategory]);

  const updateScrollState = () => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState);
    updateScrollState();
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [displayedBooks]);

  // "Stop-and-Go" 2-second interval timer auto-scroll
  useEffect(() => {
    if (isHovered || displayedBooks.length <= 2) return;

    const timer = setInterval(() => {
      const el = containerRef.current;
      if (!el) return;

      // Scroll amount roughly equal to 1-2 card widths
      const step = el.clientWidth < 640 ? el.clientWidth * 0.5 : el.clientWidth * 0.25;

      // If reached near end, smoothly wrap back to start
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 20) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: step, behavior: 'smooth' });
      }
    }, 2000); // Stop for 2 seconds then advance

    return () => clearInterval(timer);
  }, [isHovered, displayedBooks.length]);

  const scroll = (direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el) return;
    const step = el.clientWidth < 640 ? el.clientWidth * 0.7 : el.clientWidth * 0.5;
    el.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth'
    });
  };

  return (
    <section
      id={id}
      className="py-10 border-b border-slate-200 bg-white"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1 text-left">
            {badge && (
              <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-[#9A7B38] bg-[#D4AF37]/10 px-2.5 py-0.5 rounded">
                {badge}
              </span>
            )}
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                {subtitle}
              </p>
            )}
          </div>

          {/* Optional Category Pills if provided */}
          {categories && categories.length > 0 && onSelectCategory && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <button
                onClick={() => onSelectCategory('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                  selectedCategory === 'all' || !selectedCategory
                    ? 'bg-[#0F172A] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('carousel.all')}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => onSelectCategory(cat)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#0F172A] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {categoryLabel(cat)}
                </button>
              ))}
            </div>
          )}

          {/* Desktop Navigation Arrows on Header */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className={`p-2 rounded-lg border border-slate-200 transition-all cursor-pointer ${
                canScrollLeft
                  ? 'bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 shadow-xs'
                  : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
              }`}
              title={t('carousel.scrollLeft')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className={`p-2 rounded-lg border border-slate-200 transition-all cursor-pointer ${
                canScrollRight
                  ? 'bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 shadow-xs'
                  : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
              }`}
              title={t('carousel.scrollRight')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Carousel Viewport Container */}
        <div className="relative group">
          {/* Subtle Mobile/Hover Left Navigation Arrow */}
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-r-xl bg-white/95 text-slate-800 shadow-md border border-slate-200 hover:bg-white transition-all opacity-0 group-hover:opacity-100 cursor-pointer hidden md:flex items-center justify-center"
              title={t('carousel.scrollLeftHover')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Smooth Stop-and-Go Scrollable Track */}
          <div
            ref={containerRef}
            className="flex gap-4 sm:gap-5 overflow-x-auto scrollbar-none scroll-smooth pb-4 pt-1 px-1 -mx-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {(displayedBooks || []).map((book) => (
              <div
                key={book.id}
                className="w-[calc(100vw-2.5rem)] sm:w-[calc(50%-10px)] md:w-[calc(33.333%-14px)] lg:w-[calc(25%-15px)] xl:w-[calc(20%-16px)] shrink-0"
              >
                <BookCard
                  book={book}
                  onSelectBook={onSelectBook}
                  onAddToCart={onAddToCart}
                  onQuickBuy={onQuickBuy}
                />
              </div>
            ))}
          </div>

          {/* Subtle Mobile/Hover Right Navigation Arrow */}
          {canScrollRight && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-l-xl bg-white/95 text-slate-800 shadow-md border border-slate-200 hover:bg-white transition-all opacity-0 group-hover:opacity-100 cursor-pointer hidden md:flex items-center justify-center"
              title={t('carousel.scrollRightHover')}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Center View More CTA Button */}
        <div className="pt-2 flex justify-center">
          <button
            onClick={onViewMore}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border border-slate-300 hover:border-slate-900 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs tracking-wider uppercase transition-all shadow-xs group cursor-pointer"
          >
            <span>{viewMoreText ?? t('carousel.viewAllBooks')}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

      </div>
    </section>
  );
};
