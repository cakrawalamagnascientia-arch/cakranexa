import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Book, ActivePage, SubSection, HeroSlide as HeroSlideType, HeroBrandingSettings } from '../types';
import { DEFAULT_SITE_CONTENT } from '../services/siteContentService';
import { useCmsText } from '../i18n/hooks';

interface HeroProps {
  featuredBook?: Book;
  books?: Book[];
  slides?: HeroSlideType[];
  branding?: HeroBrandingSettings;
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
    bgImageUrl: '/images/banners/hero-literatur.png',
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
    bgImageUrl: '/images/banners/hero-hukum-pajak.png',
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
    bgImageUrl: '/images/banners/hero-buku-teks.png',
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
    bgImageUrl: '/images/banners/hero-peer-review.png',
    order: 4
  }
];

const LOCAL_HERO_BANNERS = [
  '/images/banners/hero-literatur.png',
  '/images/banners/hero-hukum-pajak.png',
  '/images/banners/hero-buku-teks.png',
  '/images/banners/hero-peer-review.png'
];

/*
 * Terjemahan slide bawaan (CMS DEFAULT_SITE_CONTENT & DEFAULT_HERO_SLIDES) ada di home:hero.slides.<kunci>.
 * Teks slide yang sudah diubah admin (berbeda dari bawaan Bahasa Indonesia) tetap tampil apa adanya.
 */
type SlideTranslationKey = 'literature' | 'vatTrilogy' | 'isbnService' | 'taxLegal' | 'textbooks' | 'peerReview';
type SlideTextField = 'badge' | 'title' | 'subtitle' | 'primaryCtaText' | 'secondaryCtaText';
const SLIDE_TEXT_FIELDS: SlideTextField[] = ['badge', 'title', 'subtitle', 'primaryCtaText', 'secondaryCtaText'];
const SLIDE_TRANSLATION_KEYS: Record<string, SlideTranslationKey> = {
  'slide-1': 'literature',
  'slide-2': 'vatTrilogy',
  'slide-3': 'isbnService',
  'monographs-academic': 'literature',
  'tax-legal-literature': 'taxLegal',
  'university-textbooks': 'textbooks',
  'journal-publishing': 'peerReview'
};
const INDONESIAN_DEFAULT_SLIDES: HeroSlideType[] = [...DEFAULT_SITE_CONTENT.heroSlides, ...DEFAULT_HERO_SLIDES];

type PillarTranslationKey = 'books' | 'journals' | 'research' | 'education' | 'seminars' | 'digitalKnowledge';
const PILLAR_TRANSLATION_KEYS: Record<string, PillarTranslationKey> = {
  'pillar-books': 'books',
  'pillar-journals': 'journals',
  'pillar-research': 'research',
  'pillar-education': 'education',
  'pillar-seminars': 'seminars',
  'pillar-digital-knowledge': 'digitalKnowledge'
};

export const Hero: React.FC<HeroProps> = ({
  slides,
  branding = DEFAULT_SITE_CONTENT.heroBranding,
  onNavigate,
  onExploreCatalog,
  onPublishBook,
}) => {
  const { t } = useTranslation('home');
  const cmsText = useCmsText();

  const localizeSlide = (slide: HeroSlideType): HeroSlideType => {
    const key = SLIDE_TRANSLATION_KEYS[slide.id];
    const defaults = INDONESIAN_DEFAULT_SLIDES.find((item) => item.id === slide.id);
    if (!key || !defaults) return slide;
    const localized = { ...slide };
    SLIDE_TEXT_FIELDS.forEach((field) => {
      const value = slide[field];
      if (value) localized[field] = cmsText(value, defaults[field], t(`hero.slides.${key}.${field}` as const));
    });
    return localized;
  };

  const sourceSlides = slides && slides.length > 0 ? slides : DEFAULT_HERO_SLIDES;
  const activeSlides = sourceSlides.map((slide, index) => ({
    ...localizeSlide(slide),
    bgImageUrl: slide.bgImageUrl?.includes('unsplash.com')
      ? LOCAL_HERO_BANNERS[index % LOCAL_HERO_BANNERS.length]
      : slide.bgImageUrl || LOCAL_HERO_BANNERS[index % LOCAL_HERO_BANNERS.length]
  }));
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

  const companyName = branding.companyName?.trim() || '';
  const rawTagline = branding.tagline?.trim() || '';
  const brandTagline = rawTagline
    ? cmsText(rawTagline, DEFAULT_SITE_CONTENT.heroBranding.tagline, t('hero.branding.tagline'))
    : '';
  const brandPillars = [...(branding.pillars || [])]
    .sort((a, b) => a.order - b.order)
    .filter((pillar) => pillar.label?.trim())
    .map((pillar) => {
      const key = PILLAR_TRANSLATION_KEYS[pillar.id];
      if (!key) return pillar;
      const defaultLabel = DEFAULT_SITE_CONTENT.heroBranding.pillars.find((item) => item.id === pillar.id)?.label;
      return { ...pillar, label: cmsText(pillar.label, defaultLabel, t(`hero.branding.pillars.${key}` as const)) };
    });
  const showBranding = branding.isEnabled !== false && Boolean(companyName || brandTagline || brandPillars.length);

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
      aria-label={t('hero.ariaLabel')}
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

        {/* Company Identity & Ecosystem Tagline */}
        {showBranding && (
          <div className="flex flex-col items-center">
            {companyName && (
              <p className="text-sm sm:text-2xl md:text-3xl font-semibold uppercase tracking-[0.12em] sm:tracking-[0.18em] text-white leading-tight">
                {companyName}
              </p>
            )}

            {companyName && (brandTagline || brandPillars.length > 0) && (
              <div className="mt-3 flex items-center gap-3 w-full max-w-xs sm:max-w-sm" aria-hidden="true">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#D4AF37]" />
                <span className="w-1.5 h-1.5 rotate-45 bg-[#D4AF37]" />
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#D4AF37]" />
              </div>
            )}

            {brandTagline && (
              <p className="mt-3 text-sm sm:text-base md:text-lg font-semibold tracking-wide text-[#DFBF64]">
                {brandTagline}
              </p>
            )}
            {brandPillars.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11px] sm:text-sm text-slate-300 font-medium max-w-2xl">
                {brandPillars.map((pillar, index) => (
                  <li key={pillar.id} className="flex items-center gap-2.5">
                    {index > 0 && <span className="w-1 h-1 rounded-full bg-[#D4AF37]" aria-hidden="true" />}
                    <span>{pillar.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Tagline Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700 text-[#DFBF64] text-[10px] sm:text-xs uppercase tracking-wider font-semibold shadow-xs">
          <IconComponent className="w-3.5 h-3.5 text-[#DFBF64] shrink-0" />
          <span>{activeSlide.badge || t('hero.fallback.badge')}</span>
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
            <span>{activeSlide.primaryCtaText || t('hero.fallback.primaryCta')}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            id="hero-btn-kirim-naskah"
            onClick={handleSecondaryClick}
            className="px-6 py-3.5 rounded-lg bg-slate-900/90 border border-slate-700 hover:border-[#DFBF64] text-white font-semibold text-sm tracking-wide transition-all hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileCheck className="w-4 h-4 text-[#DFBF64]" />
            <span>{activeSlide.secondaryCtaText || t('hero.fallback.secondaryCta')}</span>
          </button>
        </div>

        {/* Key Trust Statistics */}
        <div className="pt-6 border-t border-slate-800/80 grid grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div>
            <div className="text-xl sm:text-2xl font-bold text-[#DFBF64]">21+</div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium uppercase tracking-wider mt-0.5">{t('hero.stats.references')}</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-white">100%</div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium uppercase tracking-wider mt-0.5">{t('hero.stats.isbn')}</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-[#DFBF64]">IKAPI</div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium uppercase tracking-wider mt-0.5">{t('hero.stats.ikapi')}</div>
          </div>
        </div>

      </div>

      {/* Previous & Next Slide Arrow Buttons */}
      <button
        type="button"
        onClick={handlePrev}
        aria-label={t('hero.prevSlide')}
        className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/80 border border-slate-700 text-white hover:text-[#DFBF64] hover:border-[#DFBF64] flex items-center justify-center transition-all cursor-pointer shadow-md"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={handleNext}
        aria-label={t('hero.nextSlide')}
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
            aria-label={t('hero.goToSlide', { number: idx + 1 })}
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
