import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import {
  Building2,
  ShieldCheck,
  Target,
  Users,
  Award,
  CheckCircle2,
  FileCheck,
  BookOpen,
  GraduationCap,
  KeyRound,
  Building,
  Cpu,
  UserCheck,
  Sparkles,
  ArrowRight,
  ArrowDown,
  RefreshCw,
  Scale,
  Database,
  FileSpreadsheet,
  Compass,
  Layers,
  Search,
  HeartHandshake,
  Shield,
  BookMarked,
  Eye,
  Briefcase
} from 'lucide-react';
import { SubSection, SiteContentSettings } from '../types';
import { DEFAULT_SITE_CONTENT, getStoredSiteContent } from '../services/siteContentService';
import { useCmsText } from '../i18n/hooks';

interface TentangKamiViewProps {
  initialSubSection?: SubSection;
  siteContent?: SiteContentSettings;
}

const SCOPE_ITEMS = [
  { key: 'publishing', icon: BookOpen },
  { key: 'academy', icon: GraduationCap },
  { key: 'rights', icon: KeyRound },
  { key: 'institutional', icon: Building },
  { key: 'technology', icon: Cpu },
  { key: 'authorDevelopment', icon: UserCheck }
] as const;

// Baris 1 maju 01 -> 04, baris 2 kembali 08 <- 05.
const LIFECYCLE_FORWARD = [
  { num: '01', key: 'idea' },
  { num: '02', key: 'selection' },
  { num: '03', key: 'editorial' },
  { num: '04', key: 'production' }
] as const;

const LIFECYCLE_RETURN = [
  { num: '08', key: 'renewal' },
  { num: '07', key: 'licensing' },
  { num: '06', key: 'distribution' },
  { num: '05', key: 'publication' }
] as const;

const GOVERNANCE_ITEMS = [
  { key: 'copyright', icon: Scale },
  { key: 'editorial', icon: FileCheck },
  { key: 'continuity', icon: Database }
] as const;

const PILLARS = [
  { key: 'publishing', icon: BookOpen },
  { key: 'lifecycle', icon: RefreshCw },
  { key: 'discoverability', icon: Search },
  { key: 'community', icon: Users },
  { key: 'rights', icon: KeyRound },
  { key: 'continuity', icon: Building2 }
] as const;

const MANAGER_ROLES = ['generalHr', 'finance', 'it', 'publishing', 'printing'] as const;

const DUTY_ROLES = ['commissioner', 'director', 'expertBoard', 'generalHr', 'finance', 'it', 'publishing', 'printing'] as const;

export const TentangKamiView: React.FC<TentangKamiViewProps> = ({ initialSubSection, siteContent: propContent }) => {
  const { t } = useTranslation('about');
  const cmsText = useCmsText();
  const [content, setContent] = useState<SiteContentSettings>(() => propContent || getStoredSiteContent());

  useEffect(() => {
    if (propContent) {
      setContent(propContent);
    }
  }, [propContent]);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) {
        setContent(e.detail);
      }
    };
    window.addEventListener('cakranexa_content_updated', handleUpdate);
    return () => window.removeEventListener('cakranexa_content_updated', handleUpdate);
  }, []);

  const defaultCreds = DEFAULT_SITE_CONTENT.companyCredentials;
  const creds = content.companyCredentials || defaultCreds;

  // Catatan kredensial dari CMS: nilai bawaan diterjemahkan; nilai kosong memakai catatan cadangan komponen.
  const credentialNote = (value: string | undefined, indonesianDefault: string, translatedDefault: string, fallback: string): string =>
    value ? cmsText(value, indonesianDefault, translatedDefault) : fallback;

  const [activeTab, setActiveTab] = useState<string>(
    initialSubSection === 'visi-misi' ? 'visi'
    : initialSubSection === 'tim' ? 'tim'
    : initialSubSection === 'legalitas' ? 'legalitas'
    : 'profil'
  );

  const missions = t('vision.missions.items', { returnObjects: true });
  const values = t('vision.values.items', { returnObjects: true });

  return (
    <div id="tentang-kami-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 text-left space-y-12">

      {/* SECTION 1: HERO COMPANY PROFILE */}
      <div className="bg-[#0F172A] text-white rounded-3xl p-8 sm:p-12 lg:p-14 relative overflow-hidden border border-[#DFBF64]/30 shadow-2xl">
        {/* Subtle geometric gold accent */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-gradient-to-br from-[#DFBF64]/10 via-[#D4AF37]/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 bg-slate-800/40 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DFBF64]/15 border border-[#DFBF64]/30 text-[#DFBF64] text-[11px] font-bold tracking-widest uppercase">
            <Building2 className="w-3.5 h-3.5" />
            <span>{t('hero.badge')}</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight tracking-tight text-white">
            <Trans
              t={t}
              i18nKey="hero.title"
              components={{
                break: <br className="hidden sm:inline" />,
                highlight: <span className="text-[#DFBF64]" />
              }}
            />
          </h1>

          <p className="text-slate-300 text-sm sm:text-base md:text-lg font-light leading-relaxed max-w-3xl">
            <Trans t={t} i18nKey="hero.description" components={{ em: <em />, strong: <strong /> }} />
          </p>

          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-3xl">
            {t('hero.subdescription')}
          </p>

          {/* Social Proof & Metrics Anchor */}
          <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 border-t border-slate-800/80">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] block uppercase tracking-wider font-semibold">{t('metrics.portfolio.label')}</span>
              <strong className="text-white font-serif text-lg sm:text-xl block text-[#DFBF64]">{t('metrics.portfolio.value')}</strong>
              <span className="text-slate-400 text-[10px]">{t('metrics.portfolio.note')}</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] block uppercase tracking-wider font-semibold">{t('metrics.status.label')}</span>
              <strong className="text-white font-serif text-lg sm:text-xl block text-[#DFBF64]">
                {creds.keanggotaanPenerbit ? t('metrics.status.member') : t('metrics.status.official')}
              </strong>
              <span className="text-slate-400 text-[10px]">
                {creds.keanggotaanPenerbit || '-'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] block uppercase tracking-wider font-semibold">{t('metrics.ethics.label')}</span>
              <strong className="text-white font-serif text-lg sm:text-xl block text-[#DFBF64]">{t('metrics.ethics.value')}</strong>
              <span className="text-slate-400 text-[10px]">{t('metrics.ethics.note')}</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 text-[10px] block uppercase tracking-wider font-semibold">{t('metrics.ecosystem.label')}</span>
              <strong className="text-white font-serif text-lg sm:text-xl block text-[#DFBF64]">{t('metrics.ecosystem.value')}</strong>
              <span className="text-slate-400 text-[10px]">{t('metrics.ecosystem.note')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 bg-slate-50 rounded-xl p-1.5 overflow-x-auto gap-1 shadow-2xs">
        {[
          { id: 'profil', label: t('tabs.profile') },
          { id: 'visi', label: t('tabs.vision') },
          { id: 'tim', label: t('tabs.team') },
          { id: 'legalitas', label: t('tabs.legal') },
        ].map((tab) => (
          <button
            key={tab.id}
            id={`tentang-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`py-2.5 px-5 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#0F172A] text-[#DFBF64] shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. PROFIL PERUSAHAAN & EKOSISTEM (MAIN COMPREHENSIVE VIEW) */}
      {activeTab === 'profil' && (
        <div className="space-y-12">

          {/* SECTION 2: VISI ELEVATOR & DIFFERENTIATOR */}
          <section className="bg-gradient-to-r from-amber-50/70 via-white to-slate-50 rounded-3xl border border-amber-200/70 p-8 sm:p-12 shadow-xs">
            <div className="max-w-4xl space-y-4">
              <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                {t('differentiator.eyebrow')}
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 leading-snug">
                {t('differentiator.title')}
              </h2>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-normal">
                {t('differentiator.description')}
              </p>
              <div className="p-5 rounded-2xl bg-white border border-amber-200/90 shadow-2xs">
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                  <Trans t={t} i18nKey="differentiator.highlight" components={{ strong: <strong /> }} />
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 3: RUANG LINGKUP KEGIATAN (GRID 3x2) */}
          <section className="space-y-6">
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                {t('scope.eyebrow')}
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
                {t('scope.title')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
                {t('scope.description')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {SCOPE_ITEMS.map((item) => {
                const IconComponent = item.icon;
                return (
                  <div key={item.key} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center">
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <h3 className="font-serif font-bold text-slate-900 text-base">
                      {t(`scope.items.${item.key}.title`)}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {t(`scope.items.${item.key}.description`)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 4: SIKLUS HIDUP KARYA (STEPPER PROCESS) */}
          <section className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 border border-slate-800 shadow-xl space-y-8">
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-widest text-[#DFBF64] font-bold block">
                {t('lifecycle.eyebrow')}
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white">
                {t('lifecycle.title')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                {t('lifecycle.description')}
              </p>
            </div>

            {/* Stepper Diagram (Loop: 01-04 Forward, 05-08 Backward/Return) */}
            <div className="space-y-4">
              {/* Row 1: Forward 01 -> 04 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {LIFECYCLE_FORWARD.map((step, idx) => (
                  <div key={idx} className="relative p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-[#DFBF64] block mb-1">{step.num}</span>
                      <strong className="text-white text-sm block font-serif">{t(`lifecycle.steps.${step.key}.name`)}</strong>
                      <span className="text-[11px] text-slate-400 block mt-1">{t(`lifecycle.steps.${step.key}.description`)}</span>
                    </div>
                    {idx < 3 && (
                      <div className="hidden sm:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-4 h-4 rounded-full bg-[#DFBF64] text-slate-950 items-center justify-center text-[10px]">
                        ➔
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Loop connector */}
              <div className="flex justify-end pr-8 sm:pr-14 text-[#DFBF64]">
                <div className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-slate-800 border border-slate-700">
                  <span>{t('lifecycle.continued')}</span>
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Row 2: Continued Loop 08 <- 07 <- 06 <- 05 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {LIFECYCLE_RETURN.map((step, idx) => (
                  <div key={idx} className="relative p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-[#DFBF64] block mb-1">{step.num}</span>
                      <strong className="text-white text-sm block font-serif">{t(`lifecycle.steps.${step.key}.name`)}</strong>
                      <span className="text-[11px] text-slate-400 block mt-1">{t(`lifecycle.steps.${step.key}.description`)}</span>
                    </div>
                    {idx > 0 && (
                      <div className="hidden sm:flex absolute -left-2 top-1/2 -translate-y-1/2 z-10 w-4 h-4 rounded-full bg-[#DFBF64] text-slate-950 items-center justify-center text-[10px]">
                        ◄
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Stepper Summary Quote */}
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-[#DFBF64] shrink-0" />
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                <Trans t={t} i18nKey="lifecycle.summary" components={{ strong: <strong /> }} />
              </p>
            </div>
          </section>

          {/* SECTION 5: INTEGRITAS, HAKI, DAN TATA KELOLA */}
          <section className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-xs space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-widest text-emerald-700 font-bold block">
                  {t('governance.eyebrow')}
                </span>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">
                  {t('governance.title')}
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              {GOVERNANCE_ITEMS.map((item) => {
                const IconComponent = item.icon;
                return (
                  <div key={item.key} className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                    <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                      <IconComponent className="w-4 h-4 text-[#B89628]" />
                      <h4>{t(`governance.items.${item.key}.title`)}</h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-normal">
                      {t(`governance.items.${item.key}.description`)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Legal Entity Anchor Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">{t('entity.legalName.label')}</span>
              <strong className="text-slate-900 font-serif text-sm block mt-0.5">PT CAKRAWALA MAGNA SCIENTIA</strong>
              <span className="text-slate-500 text-[11px]">{t('entity.legalName.note')}</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">{t('entity.brand.label')}</span>
              <strong className="text-[#B89628] font-serif text-sm block mt-0.5">CakraNexa Publishing</strong>
              <span className="text-slate-500 text-[11px]">{t('entity.brand.note')}</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">{t('entity.location.label')}</span>
              <strong className="text-slate-900 text-sm block mt-0.5">{t('entity.location.value')}</strong>
              <span className="text-slate-500 text-[11px]">{t('entity.location.note')}</span>
            </div>
          </div>

        </div>
      )}

      {/* 2. VISI & MISI */}
      {activeTab === 'visi' && (
        <div className="space-y-12">

          {/* Header Card: Menerbitkan Pengetahuan, Membangun Warisan */}
          <section className="bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white rounded-3xl p-8 sm:p-12 border border-[#DFBF64]/40 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-[#DFBF64]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-4xl space-y-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DFBF64]/15 border border-[#DFBF64]/30 text-[#DFBF64] text-[11px] font-bold tracking-widest uppercase">
                <Compass className="w-3.5 h-3.5" />
                <span>{t('vision.header.eyebrow')}</span>
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
                {t('vision.header.title')}
              </h2>
              <p className="text-sm sm:text-base text-slate-300 font-light leading-relaxed">
                {t('vision.header.description')}
              </p>
            </div>
          </section>

          {/* Visi Kami */}
          <section className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center shrink-0">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                  {t('vision.statement.eyebrow')}
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
                  {t('vision.statement.title')}
                </h3>
              </div>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl bg-slate-50 border border-slate-200/90 text-slate-800 shadow-2xs">
              <p className="font-serif text-base sm:text-lg lg:text-xl text-slate-900 leading-relaxed italic font-medium">
                &ldquo;{t('vision.statement.text')}&rdquo;
              </p>
            </div>
          </section>

          {/* Misi Kami (01 s.d 08) */}
          <section className="space-y-6">
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                {t('vision.missions.eyebrow')}
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
                {t('vision.missions.title')}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
                {t('vision.missions.description')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {missions.map((misi, idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-[#B89628] font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h4 className="font-serif font-bold text-slate-900 text-base">
                      {misi.title}
                    </h4>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal pl-10">
                    {misi.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Nilai yang Menuntun Kami */}
          <section className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 border border-slate-800 shadow-xl space-y-8">
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-widest text-[#DFBF64] font-bold block">
                {t('vision.values.eyebrow')}
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-white">
                {t('vision.values.title')}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                {t('vision.values.description')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {values.map((val, idx) => (
                <div key={idx} className="p-5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#DFBF64] shrink-0" />
                    <strong className="text-white text-sm font-serif">{val.name}</strong>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-light pl-6">
                    {val.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Pilar Strategis CakraNexa */}
          <section className="space-y-6">
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                {t('vision.pillars.eyebrow')}
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
                {t('vision.pillars.title')}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
                {t('vision.pillars.description')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {PILLARS.map((pilar, idx) => {
                const IconComponent = pilar.icon;
                return (
                  <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-amber-300 hover:shadow-sm transition-all space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#B89628] flex items-center justify-center">
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <h4 className="font-serif font-bold text-slate-900 text-base">
                      {t(`vision.pillars.items.${pilar.key}.title`)}
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {t(`vision.pillars.items.${pilar.key}.description`)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Closing Highlight Cards: Pengetahuan Bukan Sekadar Produk & Bersama Membangun Warisan Pengetahuan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="bg-gradient-to-br from-amber-50/80 to-white rounded-3xl border border-amber-200/90 p-7 sm:p-9 shadow-xs space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#B89628] block">
                {t('vision.manifesto.eyebrow')}
              </span>
              <h4 className="font-serif font-bold text-slate-900 text-lg sm:text-xl">
                {t('vision.manifesto.title')}
              </h4>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
                {t('vision.manifesto.text')}
              </p>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl border border-slate-700/80 p-7 sm:p-9 shadow-md space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#DFBF64] block">
                  {t('vision.collaboration.eyebrow')}
                </span>
                <h4 className="font-serif font-bold text-white text-lg sm:text-xl">
                  {t('vision.collaboration.title')}
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-light">
                  {t('vision.collaboration.text')}
                </p>
              </div>

              <div className="pt-2">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#DFBF64]/15 border border-[#DFBF64]/30 text-[#DFBF64] text-xs font-semibold">
                  <HeartHandshake className="w-4 h-4" />
                  <span>{t('vision.collaboration.badge')}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 3. STRUKTUR ORGANISASI */}
      {activeTab === 'tim' && (
        <div className="space-y-10">

          {/* Canvas Bagan Struktur Organisasi */}
          <section className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-10 lg:p-12 shadow-xs">

            {/* Header Judul Diagram */}
            <div className="text-center space-y-2 mb-10">
              <h3 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#0B1528] tracking-tight">
                {t('organization.title')}
              </h3>
              <div className="flex items-center justify-center gap-3 pt-1">
                <div className="h-[1.5px] w-12 sm:w-20 bg-[#D4AF37]" />
                <span className="text-xs sm:text-sm font-serif tracking-widest text-slate-700 font-medium uppercase">
                  PT Cakrawala Magna Scientia
                </span>
                <div className="h-[1.5px] w-12 sm:w-20 bg-[#D4AF37]" />
              </div>
            </div>

            {/* Diagram Tree (Scrollable di layar kecil agar rasio dan jalur garis tetap presisi) */}
            <div className="overflow-x-auto pb-6">
              <div className="min-w-[760px] max-w-5xl mx-auto flex flex-col items-center">

                {/* LEVEL 1: KOMISARIS */}
                <div className="flex flex-col items-center">
                  <div className="w-64 sm:w-72 bg-[#0B1528] border-2 border-[#D4AF37] rounded-2xl px-6 py-4 text-center shadow-md">
                    <h4 className="font-serif font-bold text-lg text-white tracking-wide">
                      {t('organization.roles.commissioner')}
                    </h4>
                    <div className="w-10 h-0.5 bg-[#D4AF37] mx-auto mt-2 rounded-full" />
                  </div>

                  {/* Garis Vertikal ke Direktur */}
                  <div className="w-0.5 h-8 bg-[#0B1528]" />
                </div>

                {/* LEVEL 2: DIREKTUR & DEWAN PAKAR */}
                <div className="relative flex items-center justify-center w-full">
                  {/* Direktur (Posisi Tengah) */}
                  <div className="flex flex-col items-center">
                    <div className="w-64 sm:w-72 bg-[#0B1528] border-2 border-[#D4AF37] rounded-2xl px-6 py-4 text-center shadow-md relative z-10">
                      <h4 className="font-serif font-bold text-lg text-white tracking-wide">
                        {t('organization.roles.director')}
                      </h4>
                      <div className="w-10 h-0.5 bg-[#D4AF37] mx-auto mt-2 rounded-full" />
                    </div>
                  </div>

                  {/* Dewan Pakar (Garis Koordinasi / Staf Penasihat di Sebelah Kanan) */}
                  <div className="absolute left-[calc(50%+136px)] sm:left-[calc(50%+148px)] flex items-center">
                    <div className="w-8 sm:w-16 border-t-2 border-dashed border-[#0A3E48]" />
                    <div className="w-40 sm:w-48 bg-[#0A3E48] border-2 border-[#D4AF37] rounded-2xl px-4 py-3.5 text-center shadow-md">
                      <h4 className="font-serif font-bold text-sm sm:text-base text-white tracking-wide">
                        {t('organization.roles.expertBoard')}
                      </h4>
                      <div className="w-8 h-0.5 bg-[#D4AF37] mx-auto mt-1.5 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Garis Vertikal dari Direktur ke Jalur Cabang Manajer */}
                <div className="w-0.5 h-8 bg-[#0B1528]" />

                {/* LEVEL 3: 5 MANAJER */}
                <div className="w-full max-w-4xl">
                  {/* Garis Horizontal Cabang (Menghubungkan kolom 1 hingga kolom 5 secara presisi) */}
                  <div className="relative w-full px-[10%]">
                    <div className="h-0.5 bg-[#0B1528] w-full" />
                  </div>

                  {/* 5 Kolom Manajer */}
                  <div className="grid grid-cols-5 gap-3 sm:gap-4">
                    {MANAGER_ROLES.map((role, idx) => (
                      <div key={idx} className="flex flex-col items-center">
                        {/* Garis Cabang Turun ke Masing-Masing Kotak */}
                        <div className="w-0.5 h-6 bg-[#0B1528]" />

                        {/* Kotak Manajer */}
                        <div className="w-full bg-white border-2 border-[#0A3E48] rounded-2xl p-3 sm:p-4 min-h-[96px] sm:min-h-[104px] flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md transition-shadow">
                          <h5 className="font-serif font-bold text-xs sm:text-sm text-[#0B1528] leading-snug">
                            {t(`organization.roles.${role}`)}
                          </h5>
                          <div className="w-6 h-0.5 bg-[#D4AF37] mx-auto mt-2 rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 text-center">
              <span className="text-[11px] text-slate-500 font-sans tracking-wide">
                {t('organization.caption')}
              </span>
            </div>
          </section>

          {/* Rincian Tanggung Jawab & Fungsi Organisasi */}
          <section className="space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] uppercase tracking-widest text-[#B89628] font-bold block">
                {t('organization.duties.eyebrow')}
              </span>
              <h4 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">
                {t('organization.duties.title')}
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {DUTY_ROLES.map((role, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
                  <div className="border-b border-slate-100 pb-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#B89628] block">
                      {t(`organization.duties.items.${role}.scope`)}
                    </span>
                    <h5 className="font-serif font-bold text-slate-900 text-sm mt-0.5">
                      {t(`organization.roles.${role}`)}
                    </h5>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-normal">
                    {t(`organization.duties.items.${role}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </section>

        </div>
      )}

      {/* 4. LEGALITAS */}
      {activeTab === 'legalitas' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm space-y-6 max-w-4xl">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <div>
              <h3 className="font-serif font-bold text-xl text-slate-900">
                {t('legal.title')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('legal.description')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 text-[10px] uppercase font-bold">{t('legal.kemenkumham.label')}</span>
              <strong className="text-slate-900 block font-mono text-sm">
                {creds.kemenkumham || '-'}
              </strong>
              <span className="text-slate-500 text-[11px]">
                {credentialNote(creds.kemenkumhamNote, defaultCreds.kemenkumhamNote, t('legal.kemenkumham.defaultNote'), t('legal.kemenkumham.fallbackNote'))}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 text-[10px] uppercase font-bold">{t('legal.nib.label')}</span>
              <strong className="text-slate-900 block font-mono text-sm">
                {creds.nib || '-'}
              </strong>
              <span className="text-slate-500 text-[11px]">
                {credentialNote(creds.nibNote, defaultCreds.nibNote, t('legal.nib.defaultNote'), t('legal.nib.fallbackNote'))}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 text-[10px] uppercase font-bold">{t('legal.npwp.label')}</span>
              <strong className="text-slate-900 block font-mono text-sm">
                {creds.npwp || '-'}
              </strong>
              <span className="text-slate-500 text-[11px]">
                {credentialNote(creds.npwpNote, defaultCreds.npwpNote, t('legal.npwp.defaultNote'), t('legal.npwp.fallbackNote'))}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-400 text-[10px] uppercase font-bold">{t('legal.membership.label')}</span>
              <strong className="text-slate-900 block font-mono text-sm">
                {creds.keanggotaanPenerbit || '-'}
              </strong>
              <span className="text-slate-500 text-[11px]">
                {credentialNote(creds.keanggotaanPenerbitNote, defaultCreds.keanggotaanPenerbitNote, t('legal.membership.defaultNote'), t('legal.membership.fallbackNote'))}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
