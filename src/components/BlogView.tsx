import React from 'react';
import { Calendar, User, ArrowRight, BookOpen } from 'lucide-react';

export const BlogView: React.FC = () => {
  const articles = [
    {
      id: 'art-1',
      title: 'Implikasi Yuridis Penerapan Global Minimum Tax (Pillar Two) bagi Konglomerasi Multinasional di Indonesia',
      date: '18 Agustus 2026',
      author: 'Dewan Riset Fiskal Magna Scientia',
      category: 'Analisis Perpajakan',
      readTime: '6 menit baca',
      excerpt: 'Menelaah aturan Qualified Domestic Minimum Top-up Tax (QDMTT) dan kesiapan DJP dalam mengantisipasi pelarian laba lintas batas negara.',
      cover: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'art-2',
      title: 'Audit Forensik atas Kecurangan Rekayasa Laba (Earnings Management) pada BUMN Pasca Putusan Mahkamah Agung',
      date: '02 Agustus 2026',
      author: 'Klinik Audit Investigasi CakraNexa',
      category: 'Akuntansi & Hukum',
      readTime: '8 menit baca',
      excerpt: 'Kajian mendalam terhadap batas pemisah antara diskresi akrual manajemen dengan perbuatan melawan hukum yang merugikan keuangan negara.',
      cover: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'art-3',
      title: 'Dinamika Pembuktian Beban Bukti Terbalik dalam Sengketa Faktur Pajak Tidak Sah di Pengadilan Pajak',
      date: '22 Juli 2026',
      author: 'Tim Penulis Monografi Hukum Acara',
      category: 'Hukum Acara Pajak',
      readTime: '5 menit baca',
      excerpt: 'Menjawab pertentangan antara iktikad baik pembeli (SE-27/PJ/2002) dan Pasal 39A UU KUP dalam praktik peradilan perpajakan teraktual.',
      cover: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80'
    }
  ];

  return (
    <div id="blog-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 text-left space-y-10">
      
      {/* Header */}
      <div className="bg-[#0F172A] text-white rounded-3xl p-8 sm:p-12 relative overflow-hidden border border-[#DFBF64]/30 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <span className="text-xs uppercase tracking-widest text-[#DFBF64] font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            MAGNA SCIENTIA LAW & TAX COMMENTARY
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
            Telaah Kritis, Opini Pakar & Kabar Literasi Akademik
          </h1>
          <p className="text-slate-300 text-sm sm:text-base font-light leading-relaxed">
            Artikel editorial mendalam yang membedah putusan pengadilan terbaru, reformasi regulasi fiskal, serta pemikiran mutakhir seputar akuntansi dan tata kelola korporasi.
          </p>
        </div>
      </div>

      {/* Articles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {articles.map((art) => (
          <article 
            key={art.id} 
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="h-44 overflow-hidden relative">
                <img 
                  src={art.cover} 
                  alt={art.title} 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                />
                <span className="absolute top-3 left-3 px-2.5 py-1 rounded bg-[#0F172A]/90 backdrop-blur-xs text-[#DFBF64] text-[10px] font-bold uppercase tracking-wider">
                  {art.category}
                </span>
              </div>

              <div className="p-5 space-y-3">
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {art.date}
                  </span>
                  <span>•</span>
                  <span>{art.readTime}</span>
                </div>

                <h3 className="font-serif font-bold text-base text-slate-900 leading-snug hover:text-[#C5A059] transition-colors cursor-pointer">
                  {art.title}
                </h3>

                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                  {art.excerpt}
                </p>
              </div>
            </div>

            <div className="p-5 pt-0">
              <button 
                onClick={() => alert(`Membuka artikel: "${art.title}"`)}
                className="w-full py-2.5 px-3 rounded-lg border border-slate-200 hover:border-[#0F172A] hover:bg-[#0F172A] hover:text-[#DFBF64] text-slate-800 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <span>Baca Selengkapnya</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>

    </div>
  );
};
