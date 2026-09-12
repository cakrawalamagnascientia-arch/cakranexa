import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, BookOpen, ArrowRight, CornerDownLeft } from 'lucide-react';
import { Book } from '../types';
import { toTitleCase } from '../utils/formatters';
import { useBookText, useCategoryLabel, useFormatters } from '../i18n/hooks';

interface QuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: Book[];
  onSelectBook: (book: Book) => void;
}

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  isOpen,
  onClose,
  books,
  onSelectBook
}) => {
  const { t } = useTranslation(['catalog', 'common']);
  const categoryLabel = useCategoryLabel();
  const { currency } = useFormatters();
  const bookText = useBookText();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // toggle search modal
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const results = query.trim() === ''
    ? books.slice(0, 6)
    : books.filter((b) => {
        // Judul & sinopsis terjemahan ikut dicari bila diisi admin (judul Indonesia tetap dicari).
        const shownTitle = bookText.title(b);
        const shownSinopsis = bookText.sinopsis(b);
        return b.name.toLowerCase().includes(query.toLowerCase()) ||
          (shownTitle !== (b.title || b.name) && shownTitle?.toLowerCase().includes(query.toLowerCase())) ||
          (shownSinopsis !== b.sinopsis && shownSinopsis?.toLowerCase().includes(query.toLowerCase())) ||
          b.isbn.toLowerCase().includes(query.toLowerCase()) ||
          b.author.toLowerCase().includes(query.toLowerCase()) ||
          b.category.toLowerCase().includes(query.toLowerCase());
      });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0F172A]/75 backdrop-blur-xs flex items-start justify-center pt-20 p-4 text-left">
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Bar Input */}
        <div className="relative p-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50/70">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            id="quick-search-input"
            autoFocus
            type="text"
            placeholder={t('quickSearch.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-slate-400 hover:text-slate-600 p-1"
            >
              {t('quickSearch.clear')}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-3 space-y-1">
          <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400 flex justify-between items-center">
            <span>{query ? t('quickSearch.results', { total: results.length }) : t('quickSearch.recommended')}</span>
            <span className="font-mono text-[9px] text-slate-400">{t('quickSearch.escHint')}</span>
          </div>

          {results.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              {t('quickSearch.noResults', { query })}
            </div>
          ) : (
            results.map((book) => (
              <div
                key={book.id}
                onClick={() => {
                  onSelectBook(book);
                  onClose();
                }}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100/80 cursor-pointer group transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 pr-3">
                  <div className="w-9 h-13 rounded book-shadow overflow-hidden bg-slate-800 flex-shrink-0">
                    <img src={book.coverBuku} alt={bookText.title(book)} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[#C5A059] uppercase">
                        {categoryLabel(book.category)}
                      </span>
                      {book.bukuTerbaru && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                          {t('common:latest')}
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-xs text-slate-900 truncate group-hover:text-[#C5A059] transition-colors">
                      {toTitleCase(bookText.title(book))}
                    </h4>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {t('isbn.labelWithAuthor', { isbn: book.isbn, author: book.author })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono font-bold text-xs text-slate-900">
                    {currency(book.harga)}
                  </span>
                  <CornerDownLeft className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 transition-colors" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-400 flex items-center justify-between px-4">
          <span>{t('quickSearch.footer', { count: books.length })}</span>
          <span className="font-mono">PT Cakrawala Magna Scientia</span>
        </div>
      </div>
    </div>
  );
};
