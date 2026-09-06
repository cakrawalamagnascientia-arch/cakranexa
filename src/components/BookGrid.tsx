import React, { useState, useMemo } from 'react';
import { LayoutGrid, List, Search, ArrowUpDown, BookOpen } from 'lucide-react';
import { Book } from '../types';
import { BookCard } from './BookCard';
import { FilterSidebar } from './FilterSidebar';
import { toTitleCase } from '../utils/formatters';

interface BookGridProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  onAddToCart: (book: Book) => void;
  onQuickBuy: (book: Book) => void;
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy?: string;
  onSortChange?: (sort: string) => void;
  onNavigateToPenerbitan?: () => void;
}

export const BookGrid: React.FC<BookGridProps> = ({
  books = [],
  onSelectBook,
  onAddToCart,
  onQuickBuy,
  selectedCategory = 'all',
  onSelectCategory,
  searchQuery,
  onSearchChange,
  sortBy: externalSort,
  onSortChange: externalOnSortChange,
  onNavigateToPenerbitan
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [internalSort, setInternalSort] = useState<string>('terbaru');
  const [onlyNew, setOnlyNew] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [maxPrice, setMaxPrice] = useState<number>(300000);

  const activeSort = externalSort || internalSort;
  const handleSortChange = (newSort: string) => {
    if (externalOnSortChange) {
      externalOnSortChange(newSort);
    } else {
      setInternalSort(newSort);
    }
  };

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (books || []).forEach((b) => {
      if (b?.category) {
        counts[b.category] = (counts[b.category] || 0) + 1;
      }
    });
    return counts;
  }, [books]);

  // Filtered & Sorted books
  const filteredBooks = useMemo(() => {
    return (books || [])
      .filter((b) => {
        if (!b) return false;
        if (selectedCategory && selectedCategory !== 'all' && b.category !== selectedCategory) {
          return false;
        }
        if (onlyNew && !b.bukuTerbaru) {
          return false;
        }
        if (selectedYear !== 'all' && b.tahunTerbit !== Number(selectedYear)) {
          return false;
        }
        if (typeof b.harga === 'number' && b.harga > maxPrice) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = b.name?.toLowerCase().includes(q);
          const matchAuthor = b.author?.toLowerCase().includes(q);
          const matchIsbn = b.isbn?.toLowerCase().includes(q);
          const matchCat = b.category?.toLowerCase().includes(q);
          if (!matchTitle && !matchAuthor && !matchIsbn && !matchCat) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (activeSort === 'harga-rendah') return a.harga - b.harga;
        if (activeSort === 'harga-tinggi') return b.harga - a.harga;
        if (activeSort === 'judul') return a.name.localeCompare(b.name);
        if (activeSort === 'terbaru') return b.tahunTerbit - a.tahunTerbit;
        return 0;
      });
  }, [books, selectedCategory, onlyNew, selectedYear, maxPrice, searchQuery, activeSort]);

  const handleResetFilters = () => {
    if (onSelectCategory) onSelectCategory('all');
    setOnlyNew(false);
    setSelectedYear('all');
    setMaxPrice(300000);
    onSearchChange('');
  };

  const categoryDisplayTitle = 
    selectedCategory && selectedCategory !== 'all' 
      ? selectedCategory 
      : 'Literatur Akademik';

  return (
    <div id="book-catalog-container" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Sub-header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-3 pb-5 border-b border-slate-200">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A]">
            Katalog <span className="text-[#9A7B38] font-bold">{categoryDisplayTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal">
            Menampilkan monografi dan buku referensi akademik terverifikasi ber-ISBN resmi.
          </p>
        </div>
        <div className="text-xs text-slate-400 font-mono">
          Menampilkan {filteredBooks.length} dari {books.length} Judul
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar Kategori (Artistic Flair) */}
        <aside className="w-full lg:w-56 shrink-0">
          <FilterSidebar
            selectedCategory={selectedCategory}
            onSelectCategory={(cat) => onSelectCategory && onSelectCategory(cat)}
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
            onlyNew={onlyNew}
            onToggleOnlyNew={() => setOnlyNew(!onlyNew)}
            maxPrice={maxPrice}
            onMaxPriceChange={setMaxPrice}
            categoryCounts={categoryCounts}
            onResetFilters={handleResetFilters}
            onPublishClick={onNavigateToPenerbitan}
          />
        </aside>

        {/* Content Catalog Area */}
        <section className="flex-1 min-w-0 space-y-6 w-full">
          {/* Catalog Control Bar */}
          <div className="bg-white rounded border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="catalog-search-input"
                type="text"
                placeholder="Cari judul buku, topik PPN/Audit, ISBN, atau penulis..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded border border-slate-200 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Hapus
                </button>
              )}
            </div>

            {/* Sort & View Options */}
            <div className="flex items-center justify-between sm:justify-end gap-3">
              
              {/* Result Count */}
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                <strong className="text-slate-900 font-mono">{filteredBooks.length}</strong> buku
              </span>

              {/* Sort Selector */}
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
                <select
                  id="catalog-sort-select"
                  value={activeSort}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="text-xs py-2 px-2.5 rounded border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:border-[#D4AF37] cursor-pointer"
                >
                  <option value="terbaru">Buku Terbaru</option>
                  <option value="rekomendasi">Rekomendasi Utama</option>
                  <option value="harga-rendah">Harga: Rendah ke Tinggi</option>
                  <option value="harga-tinggi">Harga: Tinggi ke Rendah</option>
                  <option value="judul">Judul (A - Z)</option>
                </select>
              </div>

              {/* View Toggle */}
              <div className="hidden md:flex items-center border border-slate-200 rounded p-0.5 bg-slate-50">
                <button
                  id="btn-view-grid"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-xs transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-[#0F172A] text-[#D4AF37] shadow-xs' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  id="btn-view-list"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-xs transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-[#0F172A] text-[#D4AF37] shadow-xs' : 'text-slate-400 hover:text-slate-600'}`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>

          {/* Book Grid / Empty State */}
          {filteredBooks.length === 0 ? (
            <div className="bg-white rounded border border-dashed border-slate-300 p-12 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded bg-slate-100 flex items-center justify-center text-slate-400">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="font-serif font-bold text-slate-800 text-base">
                Tidak ada buku yang sesuai dengan kriteria pencarian
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Coba sesuaikan kata kunci pencarian, ubah filter kategori, atau reset batas harga untuk melihat koleksi lengkap kami.
              </p>
              <button
                onClick={handleResetFilters}
                className="px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded bg-[#D4AF37] text-[#0F172A] hover:bg-[#c5a059] transition-colors cursor-pointer"
              >
                Reset Semua Filter
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3.5 sm:gap-4">
              {filteredBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onSelectBook={onSelectBook}
                  onAddToCart={onAddToCart}
                  onQuickBuy={onQuickBuy}
                />
              ))}
            </div>
          ) : (
            /* Compact List View */
            <div className="space-y-4">
              {filteredBooks.map((book) => (
                <div
                  key={book.id}
                  id={`book-row-${book.id}`}
                  className="bg-white rounded-xl border border-slate-200 hover:border-[#D4AF37] p-4 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row gap-5 items-center text-left"
                >
                  <div 
                    onClick={() => onSelectBook(book)}
                    className="w-24 h-32 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer bg-[#0F172A] shadow-sm hover:shadow-md transition-shadow"
                  >
                    <img src={book.coverBuku} alt={book.name} className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 text-left space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#0F172A] text-[#D4AF37]">
                        {book.category}
                      </span>
                      {book.bukuTerbaru && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                          Terbaru
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-mono">ISBN: {book.isbn}</span>
                    </div>
                    <h3 
                      onClick={() => onSelectBook(book)}
                      className="font-semibold text-sm sm:text-base text-[#0F172A] hover:text-[#9A7B38] cursor-pointer transition-colors leading-snug"
                    >
                      {toTitleCase(book.title || book.name)}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-2 font-normal">
                      {book.sinopsis}
                    </p>
                    <div className="text-xs text-slate-500 font-medium">
                      Author: <span className="font-semibold text-slate-800">{book.author}</span> • {book.jumlahHalaman} hlm • {book.tahunTerbit}
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end justify-between self-stretch sm:self-auto gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      {book.originalHarga && book.originalHarga > book.harga ? (
                        <span className="text-[10px] text-slate-400 line-through font-mono block">
                          Rp {book.originalHarga.toLocaleString('id-ID')}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Harga Resmi</span>
                      )}
                      <span className="text-base sm:text-lg font-bold text-[#0F172A]">
                        Rp {book.harga.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onSelectBook(book)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
                      >
                        Detail
                      </button>
                      <button
                        onClick={() => onAddToCart(book)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-[#D4AF37] hover:bg-[#c5a059] text-[#0F172A] transition-colors cursor-pointer"
                      >
                        + Keranjang
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

    </div>
  );
};
