import React, { useMemo, useState } from 'react';
import { Author, Book } from '../types';
import {
  GraduationCap,
  Building2,
  Award,
  FileText,
  Mail,
  Linkedin,
  ExternalLink,
  BookOpen,
  User
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toTitleCase } from '../utils/formatters';
import { resolveImageUrl } from '../utils/imageUtils';
import { useBookText, useCategoryLabel, useLocalized } from '../i18n/hooks';

export interface AuthorDetailViewProps {
  author: Author;
  allBooks: Book[];
  onBack: () => void;
  onSelectBook: (book: Book) => void;
}

type AuthorTabKey = 1 | 2 | 3 | 4;

// Label tab diambil dari author.json (detail.tabs.*) di dalam komponen.
const TABS = [
  { key: 1, labelKey: 'detail.tabs.profileEducation', icon: GraduationCap, hint: 'profile_education' },
  { key: 2, labelKey: 'detail.tabs.workExperience',    icon: Building2,    hint: 'work_experience' },
  { key: 3, labelKey: 'detail.tabs.organizationSeminar', icon: Award,  hint: 'organization_seminar' },
  { key: 4, labelKey: 'detail.tabs.publications', icon: FileText, hint: 'publications' }
] as const satisfies readonly { key: AuthorTabKey; labelKey: string; icon: typeof GraduationCap; hint: string }[];

// Field bio per tab; isinya dibaca dalam bahasa aktif (fallback Bahasa Indonesia) lewat useLocalized.
const BIO_FIELD_BY_TAB: Record<AuthorTabKey, 'profile_education' | 'work_experience' | 'organization_seminar' | 'publications'> = {
  1: 'profile_education',
  2: 'work_experience',
  3: 'organization_seminar',
  4: 'publications'
};

const renderBioContent = (value: any, emptyText: string): React.ReactNode => {
  if (value === null || value === undefined) {
    return <div className="text-slate-500 text-sm italic">{emptyText}</div>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <div className="text-slate-500 text-sm italic">{emptyText}</div>;
    }
    return (
      <ul className="space-y-3 list-disc pl-5 marker:text-[#A9850C] text-[15px] leading-relaxed text-slate-700">
        {value.map((v, i) => (
          <li
            key={i}
            dangerouslySetInnerHTML={{ __html: String(v).replace(/\n/g, '<br/>') }}
          />
        ))}
      </ul>
    );
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return <div className="text-slate-500 text-sm italic">{emptyText}</div>;
    }
    // Jika string mengandung karakter bullet atau line break, coba split dengan newline agar menjadi paragraf
    const paragraphs = trimmed.split(/\n{2,}/).filter(Boolean);
    if (paragraphs.length <= 1) {
      const lines = trimmed.split('\n').filter(Boolean);
      if (lines.length <= 1) {
        return (
          <p
            className="text-[15px] leading-8 text-slate-700 whitespace-pre-line"
            dangerouslySetInnerHTML={{ __html: trimmed }}
          />
        );
      }
      return (
        <div className="space-y-1 text-[15px] leading-8 text-slate-700">
          {lines.map((l, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: l }} />
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-4 text-[15px] leading-8 text-slate-700">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-justify" dangerouslySetInnerHTML={{ __html: p.trim() }} />
        ))}
      </div>
    );
  }
  return (
    <div
      className="text-[15px] leading-8 text-slate-700 whitespace-pre-line"
      dangerouslySetInnerHTML={{ __html: String(value) }}
    />
  );
};

const resolveBookCover = (b: Book): string => b.coverBuku || '/images/books/placeholder.svg';

export const AuthorDetailView: React.FC<AuthorDetailViewProps> = ({ author, allBooks, onSelectBook }) => {
  const { t } = useTranslation('author');
  const categoryLabel = useCategoryLabel();
  const bookText = useBookText();
  const localized = useLocalized();
  const [tab, setTab] = useState<AuthorTabKey>(1);

  const authorBooks: Book[] = useMemo(() => {
    if (Array.isArray(author.books) && author.books.length > 0) return author.books;
    // Fallback berdasarkan author.name cocok dengan field author buku (kasus offline-mode)
    const lower = author.name.toLowerCase().trim();
    return allBooks.filter((b) => {
      const a = String(b.author || '').toLowerCase();
      return a.includes(lower) || lower.split(/\s+/).slice(0, 2).every((w) => a.includes(w));
    });
  }, [author, allBooks]);

  const scopusLink = author.scopus_id?.trim()
    ? `https://www.scopus.com/authid/detail.uri?authorId=${encodeURIComponent(author.scopus_id.trim())}`
    : null;
  const orcidLink = author.orcid_id?.trim()
    ? `https://orcid.org/${encodeURIComponent(author.orcid_id.trim())}`
    : null;
  const linkedinLink = author.linkedin_url?.trim()
    ? (author.linkedin_url.startsWith('http') ? author.linkedin_url : `https://www.linkedin.com/in/${encodeURIComponent(author.linkedin_url.trim())}`)
    : null;
  const mailtoLink = author.email?.trim() ? `mailto:${encodeURIComponent(author.email.trim())}` : null;

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 pb-24">
      {/* TOP BANNER ACCENT */}
      <div className="w-full h-36 sm:h-40 bg-gradient-to-br from-[#0B1120] via-[#0F172A] to-[#172554] relative overflow-hidden">
        <div className="absolute inset-0 opacity-15"
             style={{ backgroundImage: 'radial-gradient(circle at 15% 30%, #D4AF37 1px, transparent 1px), radial-gradient(circle at 85% 75%, #DFBF64 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-28 sm:-mt-32">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* ==================== SIDEBAR KIRI (PROFILE CARD) ==================== */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 self-start">
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                {/* FOTO */}
                <div className="p-5 sm:p-6 pb-0">
                  <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-inner aspect-square">
                    <div className="w-full h-full flex items-center justify-center">
                      {author.photo_url ? (
                        <img src={resolveImageUrl(author.photo_url)} alt={t('photo.alt', { name: author.name })} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-24 h-24 text-slate-300" aria-label={t('photo.missing')} />
                      )}
                    </div>
                  </div>
                </div>

                {/* IDENTITAS */}
                <div className="px-5 sm:px-6 py-5 sm:py-6 text-center">
                  <h1 className="text-2xl sm:text-[26px] font-extrabold text-[#0F172A] leading-tight">
                    {author.name}
                  </h1>
                  {author.academic_titles && (
                    <div
                      className="mt-2 text-sm font-bold text-[#A9850C]"
                      dangerouslySetInnerHTML={{ __html: author.academic_titles }}
                    />
                  )}
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0F172A]/5 border border-[#0F172A]/10 text-xs font-semibold text-[#0F172A]/80">
                    <User className="w-3.5 h-3.5 text-[#A9850C]" />
                    {t('detail.badge')}
                  </div>
                </div>

                {/* AKADEMIK BADGES */}
                <div className="px-5 sm:px-6 pb-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-[11px] sm:text-xs">
                      {scopusLink ? (
                        <a
                          href={scopusLink}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="group px-3 py-2 rounded-xl bg-[#0F172A] hover:bg-[#0B1120] text-[#DFBF64] font-bold flex items-center justify-center gap-1.5 transition"
                        >
                          <span>Scopus: {author.scopus_id}</span>
                          <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                        </a>
                      ) : (
                        <div className="px-3 py-2 rounded-xl bg-slate-50 text-slate-400 text-center">
                          Scopus —
                        </div>
                      )}
                      {orcidLink ? (
                        <a
                          href={orcidLink}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="group px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition"
                        >
                          <span>ORCID: {author.orcid_id}</span>
                          <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                        </a>
                      ) : (
                        <div className="px-3 py-2 rounded-xl bg-slate-50 text-slate-400 text-center">
                          ORCID —
                        </div>
                      )}
                    </div>
                </div>

                {/* KONTAK */}
                <div className="px-5 sm:px-6 pb-6">
                  <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center gap-3 text-[13px]">
                    {mailtoLink ? (
                      <a
                        href={mailtoLink}
                        title={t('detail.emailTitle', { email: author.email })}
                        className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-[#0F172A] hover:border-[#D4AF37]/60 transition shadow-sm"
                      >
                        <Mail className="w-4.5 h-4.5" />
                      </a>
                    ) : (
                      <div className="p-2 rounded-lg bg-white border border-slate-200 text-slate-300 shadow-sm">
                        <Mail className="w-4.5 h-4.5" />
                      </div>
                    )}
                    {linkedinLink ? (
                      <a
                        href={linkedinLink}
                        target="_blank"
                        rel="noreferrer noopener"
                        title="LinkedIn"
                        className="p-2 rounded-lg bg-white border border-slate-200 text-[#0A66C2] hover:border-[#0A66C2] transition shadow-sm"
                      >
                        <Linkedin className="w-4.5 h-4.5" />
                      </a>
                    ) : (
                      <div className="p-2 rounded-lg bg-white border border-slate-200 text-slate-300 shadow-sm">
                        <Linkedin className="w-4.5 h-4.5" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* ==================== MAIN AREA KANAN (TAB + KARYA) ==================== */}
          <section className="lg:col-span-2 space-y-6 sm:space-y-8">
            {/* TAB HEAD */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 sm:px-6 pt-5 sm:pt-6 border-b border-slate-100">
                <h2 className="text-lg sm:text-xl font-extrabold text-[#0F172A] mb-4">
                  {t('detail.heading')}
                </h2>
                <div className="-mb-px flex gap-1 sm:gap-2 overflow-x-auto pb-px scrollbar-thin">
                  {TABS.map((tabItem) => {
                    const active = tab === tabItem.key;
                    const Icon = tabItem.icon;
                    return (
                      <button
                        key={tabItem.key}
                        type="button"
                        onClick={() => setTab(tabItem.key)}
                        className={[
                          'shrink-0 group relative px-3 sm:px-4 py-3 text-xs sm:text-sm font-bold transition-all border-b-2 whitespace-nowrap',
                          active
                            ? 'border-[#D4AF37] text-[#0F172A]'
                            : 'border-transparent text-slate-500 hover:text-[#0F172A]/80 hover:border-slate-200'
                        ].join(' ')}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Icon className={active ? 'w-4 h-4 text-[#A9850C]' : 'w-4 h-4 text-slate-400'} />
                          <span>{t(tabItem.labelKey)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="p-5 sm:p-7">
                {renderBioContent(localized(author, BIO_FIELD_BY_TAB[tab]), t('detail.contentEmpty'))}
              </div>
            </div>

            {/* KARYA BUKU CAKRANEXA */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 sm:px-6 py-5 sm:py-6 flex items-center justify-between flex-wrap gap-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0F172A] flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-[#DFBF64]" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-extrabold text-[#0F172A]">
                      {t('detail.books.title')}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      {t('detail.books.total', { count: authorBooks.length })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                {authorBooks.length === 0 ? (
                  <div className="py-12 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200">
                    <BookOpen className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <div className="text-sm text-slate-500">
                      {t('detail.books.empty')}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                    {authorBooks.map((book) => {
                      const cover = resolveBookCover(book);
                      return (
                        <button
                          key={book.id}
                          type="button"
                          onClick={() => onSelectBook(book)}
                          className="group text-left rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-[#D4AF37]/60 hover:shadow-xl transition-all"
                        >
                          <div className="flex gap-4 p-4">
                            <div className="w-20 sm:w-24 shrink-0">
                              <div className="aspect-[3/4] rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shadow-sm group-hover:shadow-md transition">
                                <img
                                  src={cover}
                                  alt={bookText.title(book)}
                                  loading="lazy"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0 py-1">
                              <div className="text-[10px] sm:text-[11px] font-bold tracking-widest uppercase text-[#A9850C] mb-1.5">
                                {categoryLabel(book.category)}
                              </div>
                              <div className="text-xs sm:text-[13px] font-extrabold text-[#0F172A] leading-snug [overflow-wrap:anywhere] group-hover:text-[#0B1120]">
                                {toTitleCase(bookText.title(book))}
                              </div>
                              <div className="mt-2 text-[11px] sm:text-xs text-slate-500 line-clamp-2">
                                ISBN · {book.isbn || '—'}
                              </div>
                              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0F172A]/5 text-[11px] sm:text-xs font-bold text-[#0F172A]/80 group-hover:bg-[#D4AF37]/15 group-hover:text-[#0F172A] transition border border-transparent group-hover:border-[#D4AF37]/30">
                                {t('detail.books.viewDetail')}
                                <ExternalLink className="w-3 h-3 text-[#A9850C]" />
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AuthorDetailView;
