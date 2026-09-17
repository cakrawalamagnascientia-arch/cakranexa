import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText } from 'lucide-react';
import type { ActivePage, SubSection } from '../../types';
import { useFormatters } from '../../i18n/hooks';
import { FRONTLIST_DAYS } from '../../data/digitalProducts';
import { FALLBACK_MEMBERSHIP, FOUNDING_MEMBER_PROGRAM, MEMBERSHIP_BILLING_POLICY } from '../../data/membership';

const SECTIONS = ['plans', 'founding', 'billing', 'grace', 'changes', 'cancel', 'digital', 'frontlist', 'privacy', 'updates', 'contact'] as const;

interface MembershipTermsViewProps {
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
}

/** Halaman /membership/terms: DRAF ketentuan keanggotaan (menunggu tinjauan pemilik sebelum pendaftaran dibuka). */
export const MembershipTermsView: React.FC<MembershipTermsViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation('digital');
  const { currency, number } = useFormatters();
  const plan = (code: 'reader' | 'professional' | 'author') => FALLBACK_MEMBERSHIP.plans.find((p) => p.code === code)?.founding;
  const [d1, d2, d3] = MEMBERSHIP_BILLING_POLICY.reminderDaysBeforeDue;
  const params = {
    ...FRONTLIST_DAYS,
    reader: currency(plan('reader')?.priceYearly ?? 0),
    readerCap: number(plan('reader')?.cap ?? 0),
    professional: currency(plan('professional')?.priceYearly ?? 0),
    professionalCap: number(plan('professional')?.cap ?? 0),
    author: currency(plan('author')?.priceYearly ?? 0),
    authorCap: number(plan('author')?.cap ?? 0),
    noticeDays: FOUNDING_MEMBER_PROGRAM.renewalNoticeDays,
    d1,
    d2,
    d3,
    graceDays: MEMBERSHIP_BILLING_POLICY.graceDays,
    retentionMonths: MEMBERSHIP_BILLING_POLICY.lockedDataRetentionMonths,
    releaseDays: MEMBERSHIP_BILLING_POLICY.deviceReleaseDays
  };

  return (
    <div id="membership-terms-page" className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12 text-left">
      <button type="button" onClick={() => onNavigate('membership')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-700 hover:underline cursor-pointer">
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('membershipTerms.back')}
      </button>
      <span className="mt-4 flex w-fit items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800">
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        {t('membershipTerms.badge')}
      </span>
      <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{t('membershipTerms.title')}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{t('membershipTerms.intro')}</p>
      <div className="mt-8 space-y-6">
        {SECTIONS.map((key) => (
          <section key={key} id={`terms-${key}`}>
            <h2 className="text-base font-bold text-slate-900">{t(`membershipTerms.sections.${key}.title`)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{t(`membershipTerms.sections.${key}.body`, params)}</p>
          </section>
        ))}
      </div>
    </div>
  );
};
