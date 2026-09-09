import React from 'react';
import { Filter, RotateCcw, Check, Clock, BookOpen } from 'lucide-react';
import { BookCategory } from '../types';

interface FilterSidebarProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onlyNew: boolean;
  onToggleOnlyNew: (val: boolean) => void;
  selectedYear: string;
  onSelectYear: (year: string) => void;
  maxPrice: number;
  onPriceChange: (price: number) => void;
  onResetFilters: () => void;
  categoryCounts: Record<string, number>;
  onPublishClick?: () => void;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  selectedCategory,
  onSelectCategory,
  onlyNew,
  onToggleOnlyNew,
  selectedYear,
  onSelectYear,
  maxPrice,
  onPriceChange,
  onResetFilters,
  categoryCounts,
  onPublishClick
}) => {
  const categories: BookCategory[] = [
    'Perpajakan',
    'Akuntansi',
    'Hukum',
    'Ekonomi & Bisnis',
    'Filsafat',
    'Teologia'
  ];

  return (
    <aside id="catalog-filter-sidebar" className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-6 text-left flex flex-col justify-between">
      <div className="space-y-6">
        {/* Header & Reset */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-[#0F172A] font-bold text-xs uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Filter Literatur</span>
          </div>
          <button
            id="btn-reset-filters"
            onClick={onResetFilters}
            className="text-[11px] text-slate-400 hover:text-[#D4AF37] flex items-center gap-1 font-semibold uppercase tracking-wider transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        {/* 1. Categories with Artistic Flair styling */}
        <div>
          <h3 className="text-[10px] font-black text-[#0F172A]/50 uppercase tracking-widest mb-3">
            Kategori Buku
          </h3>
          <ul className="flex flex-col gap-2.5 text-sm font-medium">
            <li>
              <button
                id="filter-cat-all"
                onClick={() => onSelectCategory('all')}
                className={`w-full text-left flex items-center justify-between py-1 transition-all cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'text-[#D4AF37] border-l-2 border-[#D4AF37] pl-3 font-semibold'
                    : 'pl-3 opacity-60 hover:opacity-100 text-slate-700'
                }`}
              >
                <span>Semua Kategori</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                  {Object.values(categoryCounts).reduce((a: number, b: number) => a + b, 0)}
                </span>
              </button>
            </li>

            {categories.map((cat) => {
              const count = categoryCounts[cat] || 0;
              const isSelected = selectedCategory === cat;
              return (
                <li key={cat}>
                  <button
                    id={`filter-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => onSelectCategory(cat)}
                    className={`w-full text-left flex items-center justify-between py-1 transition-all cursor-pointer ${
                      isSelected
                        ? 'text-[#D4AF37] border-l-2 border-[#D4AF37] pl-3 font-semibold'
                        : 'pl-3 opacity-60 hover:opacity-100 text-slate-700'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 2. Buku Terbaru Toggle */}
        <div>
          <label className="flex items-center justify-between p-2.5 rounded bg-slate-50 border border-slate-200 cursor-pointer hover:border-[#D4AF37]/50 transition-colors">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="text-xs font-semibold text-slate-800">Hanya Buku Terbaru</span>
            </div>
            <input
              id="filter-only-new-toggle"
              type="checkbox"
              checked={onlyNew}
              onChange={(e) => onToggleOnlyNew(e.target.checked)}
              className="w-4 h-4 accent-[#D4AF37] rounded cursor-pointer"
            />
          </label>
        </div>

        {/* 3. Tahun Terbit */}
        <div>
          <h4 className="text-[10px] font-black text-[#0F172A]/50 uppercase tracking-widest mb-2.5">
            Tahun Terbitan
          </h4>
          <div className="grid grid-cols-3 gap-1.5">
            {['all', '2026', '2025'].map((year) => (
              <button
                key={year}
                id={`filter-year-${year}`}
                onClick={() => onSelectYear(year)}
                className={`py-1.5 px-2 rounded-sm text-xs text-center font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                  selectedYear === year
                    ? 'bg-[#0F172A] text-[#D4AF37] border-[#0F172A]'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {year === 'all' ? 'Semua' : year}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Filter Range Harga Maksimum */}
        <div>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-[10px] font-black text-[#0F172A]/50 uppercase tracking-widest">Batas Harga</span>
            <span className="font-semibold text-slate-900 font-mono text-xs">
              s/d Rp {maxPrice.toLocaleString('id-ID')}
            </span>
          </div>
          <input
            id="filter-price-range"
            type="range"
            min={180000}
            max={300000}
            step={5000}
            value={maxPrice}
            onChange={(e) => onPriceChange(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
            <span>Rp 180.000</span>
            <span>Rp 300.000</span>
          </div>
        </div>
      </div>

      {/* Artistic Flair Author Publishing Box */}
      <div className="mt-6 p-4 bg-[#0F172A] rounded text-white text-left">
        <h4 className="text-[10px] uppercase text-[#D4AF37] mb-1 font-bold tracking-widest">Layanan Penulis</h4>
        <p className="text-[11px] opacity-70 leading-relaxed">
          Kirim naskah Anda hari ini dan jadilah bagian dari literasi bangsa.
        </p>
        <button
          id="btn-sidebar-mulai-publikasi"
          onClick={onPublishClick}
          className="mt-3 text-[9px] uppercase font-bold border border-white/30 px-3 py-1.5 w-full hover:bg-white hover:text-[#0F172A] transition-all rounded-sm cursor-pointer"
        >
          Mulai Publikasi
        </button>
      </div>

    </aside>
  );
};
