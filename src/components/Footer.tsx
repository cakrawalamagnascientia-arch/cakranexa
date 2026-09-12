import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  ShieldCheck,
  BookOpen,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Award,
  CheckCircle2,
  Lock,
  Clock
} from 'lucide-react';
import { ActivePage, ContactSettings, FooterSettings, SubSection, SiteContentSettings } from '../types';
import { CakraNexaLogo } from './CakraNexaLogo';
import { DEFAULT_SITE_CONTENT, getStoredSiteContent } from '../services/siteContentService';
import { useCmsText } from '../i18n/hooks';

interface FooterProps {
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
  siteContent?: SiteContentSettings;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, siteContent }) => {
  const { t } = useTranslation('common');
  const cmsText = useCmsText();
  const content = siteContent || getStoredSiteContent();
  const footerData: Partial<FooterSettings> = content?.footer || {};
  const contactData: ContactSettings = content?.contact || {};

  // Deskripsi kosong / versi lama memakai teks bawaan (terjemahan footer.about).
  const isDefaultDescription = !footerData.description || footerData.description.includes('Penerbit monografi ilmiah, buku teks akademik');
  const aboutCompanyText = isDefaultDescription
    ? t('footer.about')
    : cmsText(footerData.description, DEFAULT_SITE_CONTENT.footer.description, t('footer.about'));

  return (
    <footer className="bg-[#0B1120] text-slate-400 border-t border-slate-800 text-left">
      {/* Top Banner / Trust Badges */}
      <div className="border-b border-slate-800/80 py-8 bg-[#0F172A]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-slate-800 text-[#D4AF37] flex items-center justify-center flex-shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <strong className="text-slate-200 block text-xs">{t('footer.trust.ikapiMember')}</strong>
              <span className="text-[11px] text-slate-400">
                {siteContent?.companyCredentials?.keanggotaanPenerbit || footerData.trustBadges?.[0]?.subtitle || '-'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-slate-800 text-[#D4AF37] flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <strong className="text-slate-200 block text-xs">{t('footer.trust.isbnPerpusnas')}</strong>
              <span className="text-[11px] text-slate-400">{t('footer.trust.nationalCatalog')}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-slate-800 text-[#D4AF37] flex items-center justify-center flex-shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <strong className="text-slate-200 block text-xs">{t('footer.trust.paymentGateway')}</strong>
              <span className="text-[11px] text-slate-400">{t('footer.trust.sslEncryption')}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-slate-800 text-[#D4AF37] flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <strong className="text-slate-200 block text-xs">{t('footer.trust.legalEntity')}</strong>
              <span className="text-[11px] text-slate-400">
                {siteContent?.companyCredentials?.kemenkumham || footerData.trustBadges?.[3]?.subtitle || '-'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">

        {/* Brand Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 border border-[#D4AF37]/50 p-1 flex items-center justify-center shadow-md shrink-0">
              <CakraNexaLogo className="w-full h-full" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white flex items-center leading-none">
              CAKRA<span className="text-[#DFBF64]">NEXA</span>
            </span>
          </div>

          <div className="text-xs leading-relaxed text-slate-400 max-w-md font-light space-y-2.5">
            {aboutCompanyText.split('\n\n').map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>

          <div className="pt-2 text-xs space-y-2 text-slate-400">
            {(footerData.address || contactData.address) && (
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#D4AF37] flex-shrink-0 mt-0.5" />
                <span>{footerData.address || contactData.address}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <Phone className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />
              <span className="font-mono">{footerData.phone || contactData.phone || '+62 852 8614 6806'}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />
              <span className="font-mono">{footerData.email || contactData.email || 'info@cakranexa.com'}</span>
            </div>
            {contactData.workingHours && (
              <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
                <Clock className="w-3.5 h-3.5 text-[#D4AF37] flex-shrink-0" />
                <span>{contactData.workingHours}</span>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Katalog Buku */}
        <div className="space-y-3 text-xs">
          <h4 className="font-serif font-bold text-sm text-white uppercase tracking-wider">
            {t('catalog')}
          </h4>
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => onNavigate('katalog', 'all')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('allBooks')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('katalog', 'Perpajakan')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.catalogLinks.taxation')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('katalog', 'Akuntansi')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.catalogLinks.accounting')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('katalog', 'Hukum')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.catalogLinks.law')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('katalog', 'Ekonomi & Bisnis')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.catalogLinks.economics')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('katalog', 'all')}
                className="text-[#DFBF64] font-semibold hover:underline flex items-center gap-1 mt-1"
              >
                <span>{t('latest')}</span>
              </button>
            </li>
          </ul>
        </div>

        {/* Column 3: Layanan & Jurnal */}
        <div className="space-y-3 text-xs">
          <h4 className="font-serif font-bold text-sm text-white uppercase tracking-wider">
            {t('footer.servicesHeading')}
          </h4>
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => onNavigate('penerbitan', 'layanan')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.servicesLinks.publishing')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('penerbitan', 'kirim-naskah')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.servicesLinks.submit')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('penerbitan', 'panduan')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.servicesLinks.guidelines')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('pelatihan')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.servicesLinks.taxWorkshop')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('jurnal')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.servicesLinks.journal')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('penerbitan', 'faq')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.servicesLinks.isbnFaq')}
              </button>
            </li>
          </ul>
        </div>

        {/* Column 4: Perusahaan */}
        <div className="space-y-3 text-xs">
          <h4 className="font-serif font-bold text-sm text-white uppercase tracking-wider">
            {t('footer.companyHeading')}
          </h4>
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => onNavigate('tentang-kami', 'profil')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.companyLinks.profile')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('tentang-kami', 'visi-misi')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.companyLinks.visionMission')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('tentang-kami', 'legalitas')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.companyLinks.legality')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('blog')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.companyLinks.blog')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('karir')}
                className="hover:text-[#DFBF64] transition-colors"
              >
                {t('footer.companyLinks.careers')}
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate('kontak')}
                className="hover:text-[#D4AF37] transition-colors cursor-pointer"
              >
                {t('contact')}
              </button>
            </li>
          </ul>
        </div>

      </div>

      {/* Bottom Legal & Copyright Bar with Artistic Flair links */}
      <div className="border-t border-slate-800/80 py-8 bg-[#080D18]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex flex-wrap justify-center sm:justify-start gap-6 font-medium text-slate-400">
            <button onClick={() => onNavigate('tentang-kami', 'legalitas')} className="hover:text-[#D4AF37] transition-colors cursor-pointer">
              {t('footer.legal.privacy')}
            </button>
            <button onClick={() => onNavigate('tentang-kami', 'legalitas')} className="hover:text-[#D4AF37] transition-colors cursor-pointer">
              {t('footer.legal.terms')}
            </button>
            <button onClick={() => onNavigate('penerbitan', 'isbn')} className="hover:text-[#D4AF37] transition-colors cursor-pointer">
              {t('footer.legal.isbnVerification')}
            </button>
            <button onClick={() => onNavigate('tentang-kami', 'dewan-redaksi')} className="hover:text-[#D4AF37] transition-colors cursor-pointer">
              {t('footer.legal.editorialBoard')}
            </button>
          </div>
          <p className="text-slate-500 text-[11px] text-center sm:text-right">
            {footerData.copyrightText
              ? cmsText(footerData.copyrightText, DEFAULT_SITE_CONTENT.footer.copyrightText, t('footer.copyright'))
              : t('footer.copyrightFallback', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
};
