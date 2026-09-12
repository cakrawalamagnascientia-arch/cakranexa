import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Library, LogIn } from 'lucide-react';
import type { ActivePage, Book, DigitalProduct, SubSection } from '../../types';
import { useMemberSession } from '../../services/memberSession';
import { useBookText } from '../../i18n/hooks';
import { toTitleCase } from '../../utils/formatters';
import { ComingSoonButton } from './ComingSoonButton';
import { FormatIcon } from './FormatIcon';
import { useDigitalFormatters } from './useDigitalFormatters';

/** Satu judul di Pustaka Saya. Fase 2 mengisi daftar ini dari hak akses anggota (pembelian satuan & keanggotaan). */
export interface LibraryItem {
  product: DigitalProduct;
  book: Book;
  source: 'purchase' | 'membership';
}

type NavigateFn = (page: ActivePage, subSection?: SubSection) => void;

/** Daftar koleksi anggota; di fase 1 selalu kosong sehingga menampilkan empty state. */
const LibraryItemList: React.FC<{ items: LibraryItem[]; onNavigate: NavigateFn }> = ({ items, onNavigate }) => {
  const { t } = useTranslation('digital');
  const bookText = useBookText();
  const fmt = useDigitalFormatters();

  if (items.length === 0) {
    return (
      <div id="library-empty" className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <Library className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
        <h2 className="mt-3 text-base font-bold text-slate-900">{t('library.emptyTitle')}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t('library.emptyDescription')}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('digital', 'ebook')}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            {t('library.browseEbooks')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('digital', 'audiobook')}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {t('library.browseAudiobooks')}
          </button>
        </div>
      </div>
    );
  }

  // TODO: phase-2 — tiap judul dibuka di reader/player terproteksi.
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ product, book }) => (
        <li key={product.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <FormatIcon format={product.format} className="h-5 w-5 text-[#9A7B38]" label={fmt.formatLabel(product.format)} />
          <span className="min-w-0 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{toTitleCase(bookText.title(book))}</span>
        </li>
      ))}
    </ul>
  );
};

interface LibraryViewProps {
  onNavigate: NavigateFn;
}

/** Halaman /library (Pustaka Saya). Fase 1: placeholder — belum ada akun anggota. */
export const LibraryView: React.FC<LibraryViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation('digital');
  const member = useMemberSession();
  // TODO: phase-2 — ambil daftar akses anggota dari server (pembelian satuan + Digital Reading Shelf).
  const items: LibraryItem[] = [];

  return (
    <div id="library-page" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#9A7B38]">
          <Library className="h-3.5 w-3.5" aria-hidden="true" />
          {t('library.badge')}
        </span>
        <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{t('library.title')}</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">{t('library.subtitle')}</p>
      </header>

      {!member.isLoggedIn && (
        <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <LogIn className="mt-0.5 h-5 w-5 shrink-0 text-[#9A7B38]" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">{t('library.signInTitle')}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('library.signInDescription')}</p>
            </div>
          </div>
          <div className="w-full sm:w-56 sm:shrink-0">
            <ComingSoonButton id="btn-library-sign-in" size="md" label={t('library.signInButton')} />
          </div>
        </section>
      )}

      <section className="mt-6">
        <LibraryItemList items={items} onNavigate={onNavigate} />
      </section>

      {/* Promosi keanggotaan */}
      <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#0F172A] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{t('library.promoTitle')}</h2>
          <p className="mt-1 text-sm text-slate-300">{t('library.promoDescription')}</p>
        </div>
        <button
          type="button"
          id="btn-library-membership"
          onClick={() => onNavigate('membership')}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-[#c5a059] cursor-pointer"
        >
          {t('library.promoCta')}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>
    </div>
  );
};
