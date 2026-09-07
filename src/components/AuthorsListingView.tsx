import React from 'react';
import { Author } from '../types';
import { ExternalLink, GraduationCap, User } from 'lucide-react';
import { toTitleCase } from '../utils/formatters';

export interface AuthorsListingViewProps {
  authors: Author[];
  onSelectAuthor: (author: Author) => void;
}

export const AuthorsListingView: React.FC<AuthorsListingViewProps> = ({ authors, onSelectAuthor }) => {
  const safeAuthors = Array.isArray(authors) ? authors : [];
  const sliceAuthors = safeAuthors.slice(0, 6);

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* HERO MINI */}
      <section
        className="relative w-full overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse at top left, rgba(212,175,55,0.18), transparent 60%), radial-gradient(ellipse at bottom right, rgba(223,191,100,0.12), transparent 55%), linear-gradient(180deg, #0B1120 0%, #0F172A 55%, #0E1732 100%)'
        }}
      >
        <div className="absolute inset-0 opacity-[0.12] pointer-events-none"
             style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #D4AF37 1px, transparent 1px), radial-gradient(circle at 80% 70%, #DFBF64 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-[#DFBF64]" />
            </div>
            <div className="text-xs font-bold tracking-[0.25em] text-[#DFBF64] uppercase">
              CakraNexa Knowledge Hub
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight max-w-4xl">
            Para <span className="text-[#DFBF64]">Penulis &amp; Kontributor</span>
            <br className="hidden sm:block" /> Monografi Ilmiah CakraNexa
          </h1>
          <p className="mt-5 text-sm sm:text-base lg:text-lg text-slate-200/85 max-w-3xl leading-relaxed">
            Profil para akademisi, dosen, peneliti, dan praktisi ahli di bidang perpajakan, akuntansi, hukum,
            ekonomi &amp; bisnis yang turut berkontribusi membangun ekosistem pengetahuan berkelanjutan CakraNexa.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-xs sm:text-sm">
            <div className="px-4 py-2 rounded-full bg-white/8 border border-white/15 text-white/90 backdrop-blur-sm">
              <span className="font-bold text-[#DFBF64]">{sliceAuthors.length}+</span> Penulis Terdaftar
            </div>
            <div className="px-4 py-2 rounded-full bg-white/5 border border-[#D4AF37]/30 text-white/85 backdrop-blur-sm">
              <User className="inline w-4 h-4 mr-1.5 -mt-0.5 text-[#D4AF37]" />
              Dosen &amp; Peneliti Indonesia
            </div>
          </div>
        </div>
      </section>

      {/* GRID CARD PENULIS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14 lg:py-16">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8 sm:mb-10">
          <div>
            <div className="text-xs font-bold tracking-[0.2em] text-[#9A7B00] uppercase mb-2">
              Daftar Kontributor
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A]">
              Profil Penulis CakraNexa
            </h2>
            <p className="mt-2 text-sm text-slate-600 max-w-xl">
              Jelajahi profil lengkap, pendidikan, pengalaman, serta karya ilmiah para penulis.
            </p>
          </div>
        </div>

        {sliceAuthors.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-slate-300 rounded-2xl bg-white">
            <User className="w-14 h-14 mx-auto text-slate-300 mb-3" />
            <div className="text-slate-500 text-sm">Data penulis belum tersedia.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7 lg:gap-8">
            {sliceAuthors.map((author) => {
              const gelar = author.academic_titles?.trim();
              return (
                <article
                  key={author.id}
                  className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-2xl hover:-translate-y-1 hover:border-[#D4AF37]/50 transition-all duration-300 overflow-hidden flex flex-col"
                >
                  {/* PHOTO HEAD */}
                  <div className="relative h-40 bg-gradient-to-br from-[#0F172A] via-[#0E1A38] to-[#172554] overflow-hidden">
                    <div className="absolute inset-0 opacity-20"
                         style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, #D4AF37 1px, transparent 1px), radial-gradient(circle at 70% 80%, #DFBF64 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
                    <div className="absolute left-1/2 top-[62%] -translate-x-1/2 -translate-y-1/2">
                      <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-2xl border-2 border-[#D4AF37]/60 shadow-xl overflow-hidden bg-slate-100 ring-4 ring-white/20 group-hover:ring-[#D4AF37]/30 transition flex items-center justify-center">
                        <User className="w-16 h-16 text-slate-300" aria-label="Foto belum diunggah" />
                      </div>
                    </div>
                  </div>

                  {/* BODY */}
                  <div className="pt-16 sm:pt-20 px-5 sm:px-6 pb-6 sm:pb-7 flex flex-col flex-1">
                    <div className="text-center">
                      <h3 className="text-lg sm:text-xl font-bold text-[#0F172A] leading-tight">
                        {author.name}
                      </h3>
                      {gelar && (
                        <div className="mt-1.5 text-xs sm:text-sm font-semibold text-[#A9850C]"
                             dangerouslySetInnerHTML={{ __html: gelar }} />
                      )}
                      {gelar && <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0F172A]/5 border border-[#0F172A]/10 text-[11px] sm:text-xs font-semibold text-[#0F172A]/80">
                        <GraduationCap className="w-3.5 h-3.5 text-[#A9850C]" />
                        <span>Gelar/Profesi</span>
                      </div>}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] sm:text-xs">
                      {author.scopus_id ? (
                        <div className="px-2 py-1.5 rounded-lg bg-[#0F172A] text-[#DFBF64] font-bold text-center truncate">
                          Scopus: {author.scopus_id}
                        </div>
                      ) : (
                        <div className="px-2 py-1.5 rounded-lg bg-slate-50 text-slate-400 text-center">
                          Scopus —
                        </div>
                      )}
                      {author.orcid_id ? (
                        <div className="px-2 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-center truncate border border-emerald-200/60">
                          ORCID: {author.orcid_id}
                        </div>
                      ) : (
                        <div className="px-2 py-1.5 rounded-lg bg-slate-50 text-slate-400 text-center">
                          ORCID —
                        </div>
                      )}
                    </div>

                    <div className="mt-6 pt-5 border-t border-slate-100 flex-1 flex items-end">
                      <button
                        type="button"
                        onClick={() => onSelectAuthor(author)}
                        className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-[#0F172A] text-[#DFBF64] hover:bg-[#0B1120] hover:text-[#F4E4A0] active:scale-[0.98] transition shadow-sm border border-[#D4AF37]/25"
                      >
                        Lihat Profil &amp; Karya
                        <ExternalLink className="w-4 h-4 -mr-0.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default AuthorsListingView;
