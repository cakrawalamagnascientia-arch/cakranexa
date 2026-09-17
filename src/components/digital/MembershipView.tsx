import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Award, Building2, Check, ChevronDown, Minus, ShieldCheck, Sparkles } from 'lucide-react';
import type { ActivePage, SubSection } from '../../types';
import { useFormatters } from '../../i18n/hooks';
import { DIGITAL_SAMPLE_LIMITS } from '../../data/digitalProducts';
import {
  BENEFIT_PARAMS,
  LOYALTY_STATUSES,
  MAGNA_POINTS,
  MEMBERSHIP_BILLING_POLICY,
  MEMBERSHIP_FAQ_KEYS,
  PLAN_KEY_BY_CODE,
  isMembershipBenefitKey,
  planBenefitValues,
  type MembershipBenefitKey
} from '../../data/membership';
import { INSTITUTION_FRONTLIST_DAYS } from '../../data/digitalShelf';
import { useMembershipPlans } from '../../hooks/useMembershipPlans';
import { useMemberSession } from '../../services/memberSession';
import { isPaidStatus, type BillingCycle, type PublicPlan } from '../../services/membershipApi';
import { goToAccountMembership, goToLibrary, goToLogin, goToMembershipCheckout, goToMembershipTerms } from '../../services/digitalNavigation';
import { ComingSoonButton } from './ComingSoonButton';

type CompareRow = 'price' | 'ebook' | 'audiobook' | 'newTitles' | 'offline' | 'notes' | 'formatSync' | 'family' | 'devices' | 'printDiscount';

interface MembershipViewProps {
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
}

const MOST_POPULAR = 'gold';
const primaryButton = 'inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-bold text-navy-950 transition-colors hover:bg-gold-400 cursor-pointer';
const secondaryButton = 'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-cream-50 cursor-pointer';

/**
 * Halaman /membership (fase 6 Langkah 3): empat paket dari server (Blue, Silver, Gold, Platinum), toggle
 * bulanan/tahunan (tahunan bawaan, "hemat 2 bulan"), Gold "Paling populer", tabel perbandingan, jadwal buka judul
 * baru per paket, dan FAQ jatah & perangkat. Tanpa uji coba gratis dan tanpa penjualan satuan: Blue adalah sampel.
 */
export const MembershipView: React.FC<MembershipViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation('digital');
  const { currency, number } = useFormatters();
  const member = useMemberSession();
  const { data } = useMembershipPlans();
  const [cycle, setCycle] = useState<BillingCycle>('yearly');

  const plans = data.plans;
  const current = data.current && isPaidStatus(data.current.status) ? data.current : null;
  const paidPlans = plans.filter((p) => p.priceMonthly > 0);
  const lowestPaidMonthly = paidPlans.length > 0 ? Math.min(...paidPlans.map((p) => p.priceMonthly)) : 0;
  const planName = (plan: PublicPlan) => t(`membership.plans.${PLAN_KEY_BY_CODE[plan.code]}.name`);
  const planByCode = (code: string) => plans.find((p) => p.code === code);

  // Kunci & parameter manfaat berasal dari data server; kelengkapan teks dijaga npm run i18n:check.
  const translateBenefit = t as unknown as (key: `membership.benefits.${MembershipBenefitKey}`, options: Record<string, string>) => string;
  const benefitText = (key: MembershipBenefitKey, plan: PublicPlan) => {
    const params = BENEFIT_PARAMS[key] ?? {};
    return translateBenefit(`membership.benefits.${key}`, {
      ...Object.fromEntries(Object.entries(params.amounts ?? {}).map(([name, value]) => [name, currency(value)])),
      ...Object.fromEntries(Object.entries(params.values ?? {}).map(([name, value]) => [name, number(value)])),
      ...Object.fromEntries(Object.entries(planBenefitValues(key, plan)).map(([name, value]) => [name, number(value)])),
      ...(key === 'memberPrintDiscount' ? { percent: number(plan.printDiscountPercent) } : {})
    });
  };

  // Sel tabel: teks, atau true/false untuk ikon centang/strip.
  const compareCell = (row: CompareRow, plan: PublicPlan): string | boolean => {
    const free = plan.priceMonthly === 0;
    switch (row) {
      case 'price':
        if (free) return t('membership.free');
        return cycle === 'yearly'
          ? `${currency(plan.priceYearly)}${t('membership.perYear')}`
          : `${currency(plan.priceMonthly)}${t('membership.perMonth')}`;
      case 'ebook':
        if (plan.shelfAccess === 'full') return t('membership.page.compare.cells.fullShelf');
        if (plan.ebookTitlesPerPeriod !== null && plan.shelfAccess !== 'none') return t('membership.access.ebook.quota', { n: plan.ebookTitlesPerPeriod });
        return t('membership.access.ebook.sample', DIGITAL_SAMPLE_LIMITS.recommendedPagePercent);
      case 'audiobook':
        if (plan.shelfAccess !== 'none' && plan.audioHoursPerPeriod !== null) return t('membership.access.audiobook.hours', { hours: plan.audioHoursPerPeriod });
        return t('membership.access.audiobook.sample', { minutes: DIGITAL_SAMPLE_LIMITS.defaultAudioSeconds / 60 });
      case 'newTitles':
        if (plan.frontlistDays === null || plan.shelfAccess === 'none') return t('membership.page.compare.cells.samplesOnly');
        return plan.frontlistDays === 0 ? t('membership.access.frontlist.firstDay') : t('membership.access.frontlist.afterDays', { days: plan.frontlistDays });
      case 'offline':
        return plan.offlineTitles > 0 ? t('membership.page.compare.cells.offline', { n: plan.offlineTitles }) : false;
      case 'notes':
        return plan.benefits.includes('notesHighlights');
      case 'formatSync':
        return plan.benefits.includes('formatSync');
      case 'family':
        return plan.familyAccounts > 0 ? t('membership.page.compare.cells.family', { n: plan.familyAccounts }) : false;
      case 'devices':
        return t('membership.page.compare.cells.devices', { n: plan.maxDevices });
      case 'printDiscount':
        return plan.printDiscountPercent > 0 ? `${plan.printDiscountPercent}%` : false;
    }
  };
  // Offline dan sinkron format tampil setelah fiturnya aktif (flag server, fase 6 Langkah 5).
  const compareRows: CompareRow[] = [
    'price', 'ebook', 'audiobook', 'newTitles',
    ...(data.flags.offline ? ['offline' as const] : []),
    'notes',
    ...(data.flags.crossFormatSync ? ['formatSync' as const] : []),
    'family', 'devices',
    ...(data.flags.printDiscount ? ['printDiscount' as const] : [])
  ];

  // Jadwal buka judul baru: paket berbayar + instansi, diurutkan dari yang paling awal.
  const schedule = [
    ...paidPlans.filter((p) => p.frontlistDays !== null).map((p) => ({ key: p.code, label: planName(p), days: p.frontlistDays as number })),
    { key: 'institution', label: t('detail.availability.institution'), days: INSTITUTION_FRONTLIST_DAYS }
  ]
    .sort((a, b) => a.days - b.days)
    .reduce<Array<{ days: number; labels: string[] }>>((groups, item) => {
      const group = groups.find((g) => g.days === item.days);
      if (group) group.labels.push(item.label);
      else groups.push({ days: item.days, labels: [item.label] });
      return groups;
    }, []);

  const renderCta = (plan: PublicPlan) => {
    const id = `btn-choose-${PLAN_KEY_BY_CODE[plan.code]}`;
    const name = planName(plan);
    if (current?.planCode === plan.code) {
      return <button type="button" id={id} onClick={() => goToAccountMembership()} className={secondaryButton}>{t('membership.currentPlan')}</button>;
    }
    if (plan.priceMonthly === 0) {
      if (!member.isLoggedIn) {
        return <button type="button" id={id} onClick={() => goToLogin(undefined, 'register')} className={secondaryButton}>{t('membership.page.startFree')}</button>;
      }
      return current
        ? <button type="button" id={id} onClick={() => goToAccountMembership()} className={secondaryButton}>{t('membership.changePlan')}</button>
        : <button type="button" id={id} onClick={goToLibrary} className={secondaryButton}>{t('membership.currentPlan')}</button>;
    }
    if (!data.purchaseEnabled) return <ComingSoonButton id={id} size="md" label={t('membership.page.choose', { plan: name })} />;
    if (current) {
      return <button type="button" id={id} onClick={() => goToAccountMembership()} className={secondaryButton}>{t('membership.changePlan')}</button>;
    }
    if (!data.paymentAvailable) return <ComingSoonButton id={id} size="md" label={t('membership.page.choose', { plan: name })} />;
    const highlighted = plan.code === MOST_POPULAR;
    return (
      <button type="button" id={id} onClick={() => goToMembershipCheckout(plan.code, cycle)} className={highlighted ? primaryButton : secondaryButton}>
        {t('membership.page.choose', { plan: name })}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    );
  };

  const faqParams = {
    silverTitles: planByCode('silver')?.ebookTitlesPerPeriod ?? 2,
    goldTitles: planByCode('gold')?.ebookTitlesPerPeriod ?? 6,
    silverDays: planByCode('silver')?.frontlistDays ?? 90,
    goldDays: planByCode('gold')?.frontlistDays ?? 45,
    institutionDays: INSTITUTION_FRONTLIST_DAYS,
    familyAccounts: planByCode('platinum')?.familyAccounts ?? 2,
    platinumHours: planByCode('platinum')?.audioHoursPerPeriod ?? 60,
    graceDays: data.flags.graceDays,
    retentionMonths: MEMBERSHIP_BILLING_POLICY.lockedDataRetentionMonths,
    devices: planByCode('gold')?.maxDevices ?? 2,
    releaseDays: MEMBERSHIP_BILLING_POLICY.deviceReleaseDays,
    sampleMin: DIGITAL_SAMPLE_LIMITS.recommendedPagePercent.min,
    sampleMax: DIGITAL_SAMPLE_LIMITS.recommendedPagePercent.max,
    sampleMinutes: DIGITAL_SAMPLE_LIMITS.defaultAudioSeconds / 60
  };

  return (
    <div id="membership-page" className="text-left">
      {/* Pembuka */}
      <section className="bg-navy-950 text-cream-50">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6 md:py-16">
          <span className="inline-flex items-center rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold-400">
            {t('membership.badge')}
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">{t('membership.page.title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-cream-200 sm:text-base">
            {t('membership.subtitle', { price: currency(lowestPaidMonthly) })}
          </p>
          <div
            role="radiogroup"
            aria-label={t('membership.billing.label')}
            className="mt-7 inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-white/15 bg-white/5 p-1"
          >
            {(['monthly', 'yearly'] as const).map((value) => (
              <button
                key={value}
                id={`billing-${value === 'yearly' ? 'annual' : 'monthly'}`}
                type="button"
                role="radio"
                aria-checked={cycle === value}
                onClick={() => setCycle(value)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  cycle === value ? 'bg-gold-500 text-navy-950' : 'text-cream-200 hover:text-white'
                }`}
              >
                {t(`membership.billing.${value === 'yearly' ? 'annual' : 'monthly'}`)}
                {value === 'yearly' && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cycle === value ? 'bg-navy-950 text-gold-400' : 'bg-emerald-400/15 text-emerald-300'}`}>
                    {t('membership.billing.save')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        {/* Empat paket */}
        <div className="-mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const key = PLAN_KEY_BY_CODE[plan.code];
            const isFree = plan.priceMonthly === 0;
            const highlighted = plan.code === MOST_POPULAR;
            const price = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
            const benefits = plan.benefits.filter(isMembershipBenefitKey);
            return (
              <article
                key={plan.code}
                id={`membership-plan-${key}`}
                className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${
                  highlighted ? 'border-gold-500 ring-2 ring-gold-500/40 xl:-translate-y-2' : 'border-cream-200'
                }`}
              >
                {highlighted && (
                  <span id="membership-most-popular" className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-gold-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-navy-950 shadow-sm">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    {t('membership.page.mostPopular')}
                  </span>
                )}
                <h2 className="mt-2 text-2xl font-bold text-slate-900">{planName(plan)}</h2>
                <p className="mt-1 min-h-10 text-xs text-slate-500">{t(`membership.plans.${key}.tagline`)}</p>

                <div className="mt-4 min-h-16">
                  {isFree ? (
                    <>
                      <span id={`price-${key}`} className="text-3xl font-bold text-slate-900">{t('membership.free')}</span>
                      <p className="mt-1 text-[11px] text-slate-500">{t('membership.page.freeNote')}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-1">
                        <span id={`price-${key}`} className="text-3xl font-bold text-slate-900">{currency(price)}</span>
                        <span className="text-xs text-slate-500">{cycle === 'yearly' ? t('membership.perYear') : t('membership.perMonth')}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-emerald-700">
                        {cycle === 'yearly'
                          ? t('membership.annualEquivalent', { price: currency(Math.round(plan.priceYearly / 12)) })
                          : t('membership.page.orYearly', { price: currency(plan.priceYearly) })}
                      </p>
                    </>
                  )}
                </div>

                <ul id={`membership-benefits-${key}`} className="mt-4 space-y-2 border-t border-cream-100 pt-4 text-xs text-slate-700">
                  {benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-700" aria-hidden="true" />
                      <span>{benefitText(benefit, plan)}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-5">{renderCta(plan)}</div>
              </article>
            );
          })}
        </div>
        <div className="mt-5 flex flex-col items-center gap-1 text-center text-xs text-slate-500">
          <p id="membership-no-trial">{t('membership.page.noTrial')}</p>
          {!data.purchaseEnabled && <p>{t('membership.phase2Note')}</p>}
          <button type="button" id="btn-membership-terms" onClick={goToMembershipTerms} className="font-semibold text-gold-700 underline-offset-2 hover:underline cursor-pointer">
            {t('membership.termsLink')}
          </button>
        </div>

        {/* Tabel perbandingan */}
        <section id="membership-compare" className="mt-14">
          <h2 className="text-2xl font-bold text-slate-900">{t('membership.page.compare.title')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{t('membership.page.compare.subtitle')}</p>
          {/* relative: teks sr-only (absolute) tetap di dalam area gulir tabel di layar sempit. */}
          <div className="relative mt-5 overflow-x-auto rounded-xl border border-cream-200 bg-white">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="bg-navy-950 text-cream-50">
                  <th scope="col" className="w-44 px-3 py-3 font-semibold">{t('membership.access.feature')}</th>
                  {plans.map((plan) => (
                    <th
                      key={plan.code}
                      scope="col"
                      className={`px-3 py-3 font-semibold ${plan.code === MOST_POPULAR ? 'bg-gold-500 text-navy-950' : ''}`}
                    >
                      {planName(plan)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row} id={`compare-row-${row}`} className="border-t border-cream-100 align-top">
                    <th scope="row" className="bg-cream-50 px-3 py-3 font-semibold text-slate-900">{t(`membership.page.compare.rows.${row}`)}</th>
                    {plans.map((plan) => {
                      const cell = compareCell(row, plan);
                      return (
                        <td key={plan.code} className={`px-3 py-3 text-slate-700 ${plan.code === MOST_POPULAR ? 'bg-gold-500/5 font-medium text-slate-900' : ''}`}>
                          {cell === true ? (
                            <>
                              <Check className="h-4 w-4 text-gold-700" aria-hidden="true" />
                              <span className="sr-only">{t('membership.page.compare.included')}</span>
                            </>
                          ) : cell === false ? (
                            <>
                              <Minus className="h-4 w-4 text-slate-300" aria-hidden="true" />
                              <span className="sr-only">{t('membership.page.compare.notIncluded')}</span>
                            </>
                          ) : (
                            cell
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-500">
            {(['audioHours', 'noUnitSales', 'security'] as const).map((note) => (
              <li key={note} className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{t(`membership.access.notes.${note}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Jadwal buka judul baru */}
        <section id="membership-frontlist" className="mt-14 rounded-2xl bg-navy-950 p-6 text-cream-50 sm:p-8">
          <h2 className="text-2xl font-bold">{t('membership.frontlist.title')}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-cream-200">{t('membership.frontlist.body')}</p>
          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {schedule.map((group) => (
              <li key={group.days} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-400">
                  {group.days === 0 ? t('membership.frontlist.dayZero') : t('membership.frontlist.afterDays', { days: group.days })}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">{group.labels.join(' · ')}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-cream-200">{t('membership.frontlist.blueNote')}</p>
        </section>

        {/* Status loyalitas & Magna Points: manfaat lanjutan, hanya bila flag server aktif */}
        {data.flags.extendedBenefits && (
          <section id="membership-loyalty" className="mt-14">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Award className="h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
              {t('membership.loyalty.title')}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">{t('membership.loyalty.subtitle')}</p>
            <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {LOYALTY_STATUSES.map((status) => (
                <li key={status.key} id={`loyalty-${status.key}`} className="rounded-xl border border-cream-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-900">{t(`membership.loyalty.statuses.${status.key}.name`)}</h3>
                  <p className="mt-1 text-xs font-semibold text-gold-700">
                    {status.minAnnualSpend > 0 ? t('membership.loyalty.spend', { amount: currency(status.minAnnualSpend) }) : t('membership.loyalty.joined')}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">{t(`membership.loyalty.statuses.${status.key}.benefit`)}</p>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              {t('membership.loyalty.points', { percent: MAGNA_POINTS.percent, campaign: MAGNA_POINTS.campaignMaxPercent, months: MAGNA_POINTS.validityMonths })}
            </p>
          </section>
        )}

        {/* FAQ jatah, perangkat, dan penagihan */}
        <section id="membership-faq" className="mt-14">
          <h2 className="text-2xl font-bold text-slate-900">{t('membership.faq.title')}</h2>
          <div className="mt-4 divide-y divide-cream-100 rounded-xl border border-cream-200 bg-white">
            {MEMBERSHIP_FAQ_KEYS.map((key) => (
              <details key={key} id={`membership-faq-${key}`} className="group p-4 sm:p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>{t(`membership.faq.items.${key}.q`)}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {t(`membership.faq.items.${key}.a`, faqParams)}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Institution & Library Network */}
        <section className="mt-14 flex flex-col gap-4 rounded-2xl border border-cream-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Building2 className="mt-0.5 h-6 w-6 shrink-0 text-gold-700" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">{t('membership.institutionsCta.title')}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('membership.institutionsCta.description')}</p>
            </div>
          </div>
          <button
            type="button"
            id="btn-membership-institutions"
            onClick={() => onNavigate('institutions')}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-navy-950 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-navy-900 cursor-pointer"
          >
            {t('membership.institutionsCta.link')}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      </div>
    </div>
  );
};
