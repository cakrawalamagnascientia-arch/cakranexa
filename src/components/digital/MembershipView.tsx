import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Building2, Check, ChevronDown, Library } from 'lucide-react';
import type { ActivePage, SubSection } from '../../types';
import { useFormatters } from '../../i18n/hooks';
import {
  FOUNDING_MEMBER_PROGRAM,
  MEMBERSHIP_FAQ_KEYS,
  MEMBERSHIP_PLANS,
  annualPlanPrice
} from '../../data/membership';
import { ComingSoonButton } from './ComingSoonButton';

type BillingPeriod = 'monthly' | 'annual';

interface MembershipViewProps {
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
}

/**
 * Halaman /membership: 4 paket individu (data: src/data/membership.ts), toggle bulanan/tahunan (default tahunan),
 * kebijakan frontlist, FAQ, dan tautan ke Institution & Library Network.
 */
export const MembershipView: React.FC<MembershipViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation('digital');
  const { currency } = useFormatters();
  const [billing, setBilling] = useState<BillingPeriod>('annual');

  return (
    <div id="membership-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">
      <section className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#9A7B38]">
          {t('membership.badge')}
        </span>
        <h1 className="mt-3 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl md:text-4xl">{t('membership.title')}</h1>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">{t('membership.subtitle')}</p>

        <div
          role="radiogroup"
          aria-label={t('membership.billing.label')}
          className="mt-6 inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-xs"
        >
          {(['monthly', 'annual'] as const).map((period) => (
            <button
              key={period}
              id={`billing-${period}`}
              type="button"
              role="radio"
              aria-checked={billing === period}
              onClick={() => setBilling(period)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                billing === period ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t(`membership.billing.${period}`)}
              {period === 'annual' && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{t('membership.billing.save')}</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Paket individu */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MEMBERSHIP_PLANS.map((plan) => {
          const isFree = plan.monthlyPrice === 0;
          const showFounding = FOUNDING_MEMBER_PROGRAM.active && plan.foundingEligible;
          const price = isFree ? t('membership.free') : currency(billing === 'annual' ? annualPlanPrice(plan) : plan.monthlyPrice);
          return (
            <article
              key={plan.key}
              id={`membership-plan-${plan.key}`}
              className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-xs ${
                plan.highlighted ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30' : 'border-slate-200'
              }`}
            >
              <div className="flex min-h-6 flex-wrap gap-1.5">
                {plan.highlighted && (
                  <span className="rounded-full bg-[#D4AF37] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-950">
                    {t('membership.recommended')}
                  </span>
                )}
                {showFounding && (
                  <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#DFBF64]">
                    {t('membership.foundingMember')}
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-lg font-bold leading-snug text-slate-900 [overflow-wrap:anywhere]">{t(`membership.plans.${plan.key}.name`)}</h2>
              <p className="mt-1 text-xs text-slate-500">{t(`membership.plans.${plan.key}.tagline`)}</p>

              <div className="mt-4">
                <span className="text-2xl font-bold text-slate-900">{price}</span>
                {!isFree && (
                  <span className="ml-1 text-xs text-slate-500">{billing === 'annual' ? t('membership.perYear') : t('membership.perMonth')}</span>
                )}
                {!isFree && billing === 'annual' && (
                  <p className="mt-0.5 text-[11px] text-emerald-700">
                    {t('membership.annualEquivalent', { price: currency(Math.round(annualPlanPrice(plan) / 12)) })}
                  </p>
                )}
              </div>

              {plan.includesDigitalShelf && (
                <p className="mt-3 inline-flex items-center gap-1.5 self-start rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-[#DFBF64]">
                  <Library className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t('membership.includesShelf')}
                </p>
              )}

              <ul className="mt-4 flex-1 space-y-2 text-xs text-slate-700">
                {plan.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>{t(`membership.benefits.${benefit}`)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                <ComingSoonButton
                  id={`btn-choose-${plan.key}`}
                  size="md"
                  label={isFree ? t('membership.joinFree') : t('membership.choosePlan')}
                />
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">{t('membership.phase2Note')}</p>

      {/* Kebijakan frontlist */}
      <section id="membership-frontlist" className="mt-12 rounded-2xl border border-slate-800 bg-[#0F172A] p-6 text-white sm:p-8">
        <h2 className="text-xl font-bold">{t('membership.frontlist.title')}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">{t('membership.frontlist.body')}</p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {(['step1', 'step2', 'step3'] as const).map((step, index) => (
            <li key={step} className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-xs font-bold text-slate-950">{index + 1}</span>
              <span className="text-sm text-slate-200">{t(`membership.frontlist.${step}`)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ */}
      <section id="membership-faq" className="mt-12">
        <h2 className="text-xl font-bold text-slate-900">{t('membership.faq.title')}</h2>
        <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {MEMBERSHIP_FAQ_KEYS.map((key) => (
            <details key={key} className="group p-4 sm:p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                <span>{t(`membership.faq.items.${key}.q`)}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{t(`membership.faq.items.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Institution & Library Network */}
      <section className="mt-12 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Building2 className="mt-0.5 h-6 w-6 shrink-0 text-[#9A7B38]" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">{t('membership.institutionsCta.title')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('membership.institutionsCta.description')}</p>
          </div>
        </div>
        <button
          type="button"
          id="btn-membership-institutions"
          onClick={() => onNavigate('institutions')}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 cursor-pointer"
        >
          {t('membership.institutionsCta.link')}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>
    </div>
  );
};
