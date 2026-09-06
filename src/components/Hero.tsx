import React, { useState, useEffect, useRef } from 'react';
import { 
  Award, 
  ArrowRight, 
  FileCheck, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Scale, 
  GraduationCap, 
  FileText
} from 'lucide-react';
import { Book, ActivePage, SubSection, HeroSlide as HeroSlideType } from '../types';

interface HeroProps {
  featuredBook?: Book;
  books?: Book[];
  slides?: HeroSlideType[];
  onNavigate?: (page: ActivePage, subSection?: SubSection) => void;
  onSelectBook?: (book: Book) => void;
  onExploreCatalog?: () => void;
  onPublishBook?: () => void;
  onViewBookDetail?: (book: Book) => void;
}

const DEFAULT_HERO_SLIDES: HeroSlideType[] = [
  {
    id: 'monographs-academic',
    badge: 'PENERBIT LITERATUR AKADEMIK & PROFESIONAL',
    title: 'Menerbitkan Pengetahuan, Membangun Warisan Keilmuan.',
    subtitle: 'Melalui ekosistem CakraNexa, kami menghubungkan penulis, akademisi, dan profesional dalam platform pengetahuan berkelanjutan—dirancang untuk berkembang melampaui satu buku, satu format, dan satu generasi.',
    primaryCtaText: 'Jelajahi Katalog Buku',
    primaryCtaPage: 'katalog',
    secondaryCtaText: 'Kirim Naskah',
    secondaryCtaPage: 'penerbitan',
    secondaryCtaSubSection: 'kirim-naskah',
    bgImageUrl: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?q=80&w=1200',
    order: 1
  },
  {
    id: 'tax-legal-literature',
    badge: 'LITERATUR HUKUM & PERPAJAKAN STRATEGIS',
    title: 'Kepastian Hukum & Diskursus Regulasi Perpajakan Terapan',
    subtitle: 'Rujukan otoritatif bagi praktisi, akademisi, dan hakim pengadilan pajak karya Dr. Prianto Budi Saptono, Ak., CA, M.B.A. dan dewan pakar nasional.',
    primaryCtaText: 'LIHAT BUKU PERPAJAKAN',
    primaryCtaPage: 'katalog',
    secondaryCtaText: 'KONSULTASI REDAKSI',
    secondaryCtaPage: 'kontak',
    bgImageUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=1200',
    order: 2
  },
  {
    id: 'university-textbooks',
    badge: 'BUKU TEKS & MONOGRAFI PERGURUAN TINGGI',
    title: 'Kurikulum Vokasi & Sarjana Berbasis Riset Kontekstual',
    subtitle: 'Buku teks terstruktur dengan studi kasus komprehensif, ditelaah oleh mitra bestari independen dan terdaftar resmi di Perpustakaan Nasional RI.',
    primaryCtaText: 'EKSPLORASI BUKU TEKS',
    primaryCtaPage: 'katalog',
    secondaryCtaText: 'PANDUAN PENULIS',
    secondaryCtaPage: 'penerbitan',
    secondaryCtaSubSection: 'panduan',
    bgImageUrl: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?q=80&w=1200',
    order: 3
  },
  {
    id: 'journal-publishing',
    badge: 'LAYANAN PENERBITAN & PEER-REVIEW BERKUALITAS',
    title: 'Fasilitasi Publikasi Cepat & Berstandar Global',
    subtitle: 'Pendampingan komprehensif dari konversi disertasi/tesis, layouting tipografi ilmiah, pengurusan ISBN, hingga distribusi nasional.',
    primaryCtaText: 'KIRIM NASKAH BUKU',
    primaryCtaPage: 'penerbitan',
    primaryCtaSubSection: 'kirim-naskah',
    secondaryCtaText: 'LAYANAN PENERBITAN',
    secondaryCtaPage: 'penerbitan',
    bgImageUrl: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?q=80&w=1200',
    order: 4
  }
];

export const Hero: React.FC<HeroProps> = ({ 
  slides,
  onNavigate, 
  onExploreCatalog,
  onPublishBook,
}) => {
  const activeSlides = slides && slides.length > 0 ? slides : DEFAULT_HERO_SLIDES;
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset slide index if slides count change
  useEffect(() => {
    if (currentSlide >= activeSlides.length) {
      setCurrentSlide(0);
    }
  }, [activeSlides.length, currentSlide]);

  // Automated 3.5-second auto-slide carousel with stop-and-go behavior
  useEffect(() => {
    if (isHovered || activeSlides.length <= 1) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % activeSlides.length);
    }, 3500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isHovered, activeSlides.length]);

  const activeSlide = activeSlides[currentSlide] || activeSlides[0];

  const getSlideIcon = (id: string) => {
    switch (id) {
      case 'tax-legal-literature': return Scale;
      case 'university-textbooks': return GraduationCap;
      case 'journal-publishing': return FileText;
      default: return BookOpen;
    }
  };

  const IconComponent = getSlideIcon(activeSlide.id);

  const handleNext = () => {
    setCurrentSlide((prev) => (prev + 1) % activeSlides.length);
  };

  const handlePrev = () => {
    setCurrentSlide((prev) => (prev - 1 + activeSlides.length) % activeSlides.length);
  };

  const handlePrimaryClick = () => {
    const page = activeSlide.primaryCtaPage || 'katalog';
    if (page === 'katalog' && onExploreCatalog) {
      onExploreCatalog();
    } else if (page === 'penerbitan' && onPublishBook) {
      onPublishBook();
    } else if (onNavigate) {
      onNavigate(page, activeSlide.primaryCtaSubSection);
    }
  };

  const handleSecondaryClick = () => {
    const page = activeSlide.secondaryCtaPage || 'penerbitan';
    if (page === 'penerbitan' && onPublishBook) {
      onPublishBook();
    } else if (onNavigate) {
      onNavigate(page, activeSlide.secondaryCtaSubSection);
    }
  };

  return (
    <section 
      id="hero-section" 
      aria-label="Carousel Banner Beranda CakraNexa"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative bg-[#0F172A] text-white pt-24 pb-14 sm:pb-16 md:pt-32 md:pb-20 border-b border-slate-800 overflow-hidden select-none"
    >
      {/* Background Images with smooth opacity crossfade */}
      {activeSlides.map((slide, index) => (
        <div 
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out pointer-events-none ${
            index === currentSlide ? 'opacity-35 scale-100' : 'opacity-0 scale-105'
          }`}
          style={{
            backgroundImage: `url(${slide.bgImageUrl || 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?q=80&w=1200'})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            transition: 'opacity 1000ms ease-in-out, transform 8000ms ease-out'
          }}
        />
      ))}

      {/* Subtle navy overlay keeps the background visible while preserving text contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/55 via-[#0F172A]/42 to-[#0F172A]/35 pointer-events-none" />
      
      {/* Subtle Architectural Grid Accent */}
      <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:32px_32px] opacity-25 pointer-events-none" />

      {/* Main Content Container */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-6">
        
        {/* Tagline Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700 text-[#DFBF64] text-[10px] sm:text-xs uppercase tracking-wider font-semibold shadow-xs">
          <IconComponent className="w-3.5 h-3.5 text-[#DFBF64] shrink-0" />
          <span>{activeSlide.badge || 'PENERBIT RESMI IKAPI'}</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold leading-[1.25] tracking-tight text-white font-sans max-w-4xl mx-auto min-h-[72px] sm:min-h-[100px] flex items-center justify-center">
          <span>
            {activeSlide.title}
          </span>
        </h1>

        {/* Subtitle Description */}
        <p className="text-slate-300 text-xs sm:text-sm md:text-base max-w-3xl mx-auto font-normal leading-relaxed min-h-[48px] sm:min-h-[56px]">
          {activeSlide.subtitle}
        </p>

        {/* Primary & Secondary Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3.5 pt-1">
          <button
            id="hero-btn-katalog"
            onClick={handlePrimaryClick}
            className="px-6 py-3.5 rounded-lg bg-[#D4AF37] text-[#0F172A] font-bold text-sm tracking-wide hover:bg-[#c5a059] transition-all shadow-sm flex items-center justify-center gap-2 group cursor-pointer"
          >
            <span>{activeSlide.primaryCtaText || 'Jelajahi Katalog Buku'}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            id="hero-btn-kirim-naskah"
            onClick={handleSecondaryClick}
            className="px-6 py-3.5 rounded-lg bg-slate-900/90 border border-slate-700 hover:border-[#DFBF64] text-white font-semibold text-sm tracking-wide transition-all hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileCheck className="w-4 h-4 text-[#DFBF64]" />
            <span>{activeSlide.secondaryCtaText || 'Kirim Naskah'}</span>
          </button>
        </div>

        {/* Key Trust Statistics */}
        <div className="pt-6 border-t border-slate-800/80 grid grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div>
            <div className="text-xl sm:text-2xl font-bold text-[#DFBF64]">21+</div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium uppercase tracking-wider mt-0.5">Buku Referensi Utama</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-white">100%</div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium uppercase tracking-wider mt-0.5">Ber-ISBN Resmi Perpusnas</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-[#DFBF64]">IKAPI</div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium uppercase tracking-wider mt-0.5">Penerbit Anggota Resmi</div>
          </div>
        </div>

      </div>

      {/* Previous & Next Slide Arrow Buttons */}
      <button
        type="button"
        onClick={handlePrev}
        aria-label="Slide sebelumnya"
        className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/80 border border-slate-700 text-white hover:text-[#DFBF64] hover:border-[#DFBF64] flex items-center justify-center transition-all cursor-pointer shadow-md"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={handleNext}
        aria-label="Slide berikutnya"
        className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/80 border border-slate-700 text-white hover:text-[#DFBF64] hover:border-[#DFBF64] flex items-center justify-center transition-all cursor-pointer shadow-md"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Smooth Transition Pagination Dots */}
      <div className="absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center gap-2">
        {activeSlides.map((slide, idx) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => setCurrentSlide(idx)}
            aria-label={`Pindah ke banner ${idx + 1}`}
            className={`transition-all rounded-full cursor-pointer ${
              idx === currentSlide
                ? 'w-7 h-2 bg-[#D4AF37]'
                : 'w-2 h-2 bg-slate-600 hover:bg-slate-400'
            }`}
          />
        ))}
      </div>
    </section>
  );
};
