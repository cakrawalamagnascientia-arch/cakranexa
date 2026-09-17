import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Award, Building2, Check, ChevronDown, Library, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import type { ActivePage, SubSection } from '../../types';
import { useFormatters } from '../../i18n/hooks';
import { DIGITAL_SAMPLE_LIMITS, FRONTLIST_DAYS } from '../../data/digitalProducts';
import {
  BENEFIT_PARAMS,
  FOUNDING_MEMBER_PROGRAM,
  INSTITUTION_PROGRAM,
  INSTITUTION_TIERS,
  LOYALTY_STATUSES,
  MAGNA_POINTS,
  MEMBERSHIP_BILLING_POLICY,
  MEMBERSHIP_FAQ_KEYS,
  MEMBERSHIP_WALLETS,
  PLAN_KEY_BY_CODE,
  PROFESSIONAL_ANNUAL_CREDIT,
  isMembershipBenefitKey,
  planBenefitValues,
  type MembershipBenefitKey
} from '../../data/membership';
import { useMembershipPlans } from '../../hooks/useMembershipPlans';
import { useMemberSession } from '../../services/memberSession';
import { isLegacyPlanCode, isPaidStatus, type BillingCycle, type PlanCode, type PublicPlan } from '../../services/membershipApi';
import { goToAccountMembership, goToLibrary, goToLogin, goToMembershipCheckout, goToMembershipTerms } from '../../services/digitalNavigation';
import { ComingSoonButton } from './ComingSoonButton';

type AccessColumn = PlanCode | 'institution';
type AccessRow = 'ebook' | 'audiobook' | 'frontlist' | 'devices' | 'printDiscount' | 'wallet';

interface MembershipViewProps {
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
}

const primaryButton = 'inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-[#c5a059] cursor-pointer';
const secondaryButton = 'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer';

/**
 * Halaman /membership (Cakrawala Magna Society): paket dari server (tabel plans), toggle bulanan/tahunan (default tahunan),
 * sisa kursi Founding, manfaat yang bisa dipenuhi saat peluncuran, perbandingan akses digital, dan FAQ penagihan.
 */
export const MembershipView: React.FC<MembershipViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation('digital');
  const { currency, number } = useFormatters();
  const member = useMemberSession();
  const { data } = useMembershipPlans();
  const [cycle, setCycle] = useState<BillingCycle>('yearly');

  const plans = data.plans;
  const current = data.current && isPaidStatus(data.current.status) ? data.current : null;
  const lowestPaidMonthly = Math.min(...plans.filter((p) => p.priceMonthly > 0).map((p) => p.priceMonthly));
  const [reminder1, reminder2, reminder3] = MEMBERSHIP_BILLING_POLICY.reminderDaysBeforeDue;
  const planByCode = (code: PlanCode) => plans.find((p) => p.code === code);
  const planName = (code: PlanCode) => t(`membership.plans.${PLAN_KEY_BY_CODE[code]}.name`);

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

  const accessCell = (row: AccessRow, column: AccessColumn): string => {
    if (column === 'institution') {
      switch (row) {
        case 'devices': return t('membership.access.institution.devices');
        case 'printDiscount': return INSTITUTION_TIERS.flatMap((tier) => (tier.printDiscountPercent === null ? [] : [`${tier.printDiscountPercent}%`])).join(' / ');
        case 'wallet': return t('membership.access.institution.wallet', { percent: INSTITUTION_PROGRAM.acquisitionWalletPercent });
        default: return t(`membership.access.institution.${row}`);
      }
    }
    const plan = planByCode(column);
    if (!plan) return t('membership.access.none');
    const sample = t('membership.access.ebook.sample', DIGITAL_SAMPLE_LIMITS.recommendedPagePercent);
    switch (row) {
      case 'ebook':
        if (plan.shelfAccess === 'full') return t('membership.access.ebook.shelf');
        if (plan.shelfAccess === 'pick' && plan.ebookTitlesPerPeriod !== null) return t('membership.access.ebook.quota', { n: plan.ebookTitlesPerPeriod });
        return plan.shelfAccess === 'pick' ? `${sample} + ${t('membership.access.ebook.pick')}` : sample;
      case 'audiobook':
        if (plan.shelfAccess !== 'none' && plan.audioHoursPerPeriod !== null) return t('membership.access.audiobook.hours', { hours: plan.audioHoursPerPeriod });
        return plan.shelfAccess === 'full'
          ? t('membership.access.audiobook.shelf')
          : t('membership.access.audiobook.sample', { minutes: DIGITAL_SAMPLE_LIMITS.defaultAudioSeconds / 60 });
      case 'frontlist':
        if (!isLegacyPlanCode(plan.code) && plan.frontlistDays !== null) {
          return plan.frontlistDays === 0 ? t('membership.access.frontlist.firstDay') : t('membership.access.frontlist.afterDays', { days: plan.frontlistDays });
        }
        return plan.shelfAccess === 'full' ? t('membership.access.frontlist.shelf', FRONTLIST_DAYS) : t('membership.access.frontlist.sample');
      case 'devices':
        return plan.shelfAccess === 'none' ? t('membership.access.none') : t('membership.access.devices', { n: plan.maxDevices });
      case 'printDiscount':
        return plan.printDiscountPercent > 0 ? `${plan.printDiscountPercent}%` : t('membership.access.none');
      case 'wallet': {
        if (column === 'free' || !isLegacyPlanCode(column)) return t('membership.access.none');
        const wallet = MEMBERSHIP_WALLETS[column];
        const base = t(`membership.access.wallet.${wallet.period}`, { amount: currency(wallet.amount), min: currency(wallet.minPurchase) });
        return column === 'professional'
          ? `${base}; ${t('membership.access.wallet.annualCredit', { amount: currency(PROFESSIONAL_ANNUAL_CREDIT.amount), min: currency(PROFESSIONAL_ANNUAL_CREDIT.minPurchase) })}`
          : base;
      }
    }
  };

  const accessColumns: AccessColumn[] = [...plans.map((p) => p.code), 'institution'];
  const accessRows: AccessRow[] = [
    'ebook', 'audiobook', 'frontlist', 'devices',
    ...(data.flags.printDiscount ? ['printDiscount' as const] : []),
    ...(data.flags.extendedBenefits ? ['wallet' as const] : [])
  ];
  const columnName = (column: AccessColumn) => (column === 'institution' ? t('institutions.badge') : planName(column));

  const renderCta = (plan: PublicPlan) => {
    const id = `btn-choose-${PLAN_KEY_BY_CODE[plan.code]}`;
    if (current?.planCode === plan.code) {
      return <button type="button" id={id} onClick={() => goToAccountMembership()} className={secondaryButton}>{t('membership.currentPlan')}</button>;
    }
    if (!data.purchaseEnabled) {
      return <ComingSoonButton id={id} size="md" label={plan.priceMonthly === 0 ? t('membership.joinFree') : t('membership.choosePlan')} />;
    }
    if (plan.priceMonthly === 0) {
      if (!member.isLoggedIn) {
        return <button type="button" id={id} onClick={() => goToLogin(undefined, 'register')} className={secondaryButton}>{t('membership.joinFree')}</button>;
      }
      return current
        ? <button type="button" id={id} onClick={() => goToAccountMembership()} className={secondaryButton}>{t('membership.changePlan')}</button>
        : <button type="button" id={id} onClick={goToLibrary} className={secondaryButton}>{t('membership.currentPlan')}</button>;
    }
    if (current) {
      return <button type="button" id={id} onClick={() => goToAccountMembership()} className={secondaryButton}>{t('membership.changePlan')}</button>;
    }
    if (!data.paymentAvailable) return <ComingSoonButton id={id} size="md" label={t('membership.choosePlan')} />;
    return (
      <button type="button" id={id} onClick={() => goToMembershipCheckout(plan.code, cycle)} className={primaryButton}>
        {t('membership.choosePlan')}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    );
  };

  const paymentAnswer = data.flags.autodebit ? 'membership.faq.items.payment.a' : 'membership.faq.items.payment.aManual';

  return (
    <div id="membership-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">
      <section className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#9A7B38]">
          {t('membership.badge')}
        </span>
        <h1 className="mt-3 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl md:text-4xl">{t('membership.title')}</h1>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">{t('membership.subtitle', { price: currency(lowestPaidMonthly) })}</p>

        <div
          role="radiogroup"
          aria-label={t('membership.billing.label')}
          className="mt-6 inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-xs"
        >
          {(['monthly', 'yearly'] as const).map((value) => (
            <button
              key={value}
              id={`billing-${value === 'yearly' ? 'annual' : 'monthly'}`}
              type="button"
              role="radio"
              aria-checked={cycle === value}
              onClick={() => setCycle(value)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                cycle === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t(`membership.billing.${value === 'yearly' ? 'annual' : 'monthly'}`)}
              {value === 'yearly' && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{t('membership.billing.save')}</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Paket individu */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const key = PLAN_KEY_BY_CODE[plan.code];
          const isFree = plan.priceMonthly === 0;
          const highlighted = plan.code === 'gold' || plan.code === 'professional';
          const founding = plan.founding;
          const seatsLeft = founding ? (founding.remaining === null || founding.remaining > 0) : false;
          const showFoundingPrice = Boolean(founding) && cycle === 'yearly' && seatsLeft && data.foundingEligible;
          const regularPrice = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
          const benefits = plan.benefits.filter(isMembershipBenefitKey);
          return (
            <article
              key={plan.code}
              id={`membership-plan-${key}`}
              className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-xs ${
                highlighted ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30' : 'border-slate-200'
              }`}
            >
              <div className="flex min-h-6 flex-wrap gap-1.5">
                {highlighted && (
                  <span className="rounded-full bg-[#D4AF37] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-950">
                    {t('membership.recommended')}
                  </span>
                )}
                {founding && (
                  <span
                    id={`founding-badge-${key}`}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${seatsLeft ? 'bg-slate-900 text-[#DFBF64]' : 'bg-slate-200 text-slate-600'}`}
                  >
                    {!seatsLeft
                      ? t('membership.foundingSoldOut')
                      : founding.remaining === null
                        ? t('membership.foundingMember')
                        : t('membership.foundingSeats', { count: number(founding.remaining) })}
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-lg font-bold leading-snug text-slate-900 [overflow-wrap:anywhere]">{t(`membership.plans.${key}.name`)}</h2>
              <p className="mt-1 text-xs text-slate-500">{t(`membership.plans.${key}.tagline`)}</p>

              <div className="mt-4">
                {isFree ? (
                  <span className="text-2xl font-bold text-slate-900">{t('membership.free')}</span>
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span id={`price-${key}`} className="text-2xl font-bold text-slate-900">
                        {currency(showFoundingPrice && founding ? founding.priceYearly : regularPrice)}
                      </span>
                      <span className="text-xs text-slate-500">{cycle === 'yearly' ? t('membership.perYear') : t('membership.perMonth')}</span>
                      {showFoundingPrice && <s className="text-xs text-slate-400">{currency(regularPrice)}</s>}
                    </div>
                    {showFoundingPrice && founding ? (
                      <div className="mt-1.5 space-y-0.5 text-[11px]">
                        <p className="font-semibold text-[#9A7B38]">{t('membership.founding.firstYear', { cap: number(founding.cap) })}</p>
                        <p className="text-slate-500">{t('membership.founding.renewal', { price: currency(plan.priceYearly) })}</p>
                      </div>
                    ) : cycle === 'yearly' ? (
                      <>
                        <p className="mt-0.5 text-[11px] text-emerald-700">{t('membership.annualEquivalent', { price: currency(Math.round(regularPrice / 12)) })}</p>
                        {founding && seatsLeft && !data.foundingEligible && <p className="mt-1 text-[11px] text-slate-500">{t('membership.foundingNotEligible')}</p>}
                      </>
                    ) : founding && seatsLeft ? (
                      <p className="mt-1.5 text-[11px] text-[#9A7B38]">{t('membership.founding.annualOnly', { price: currency(founding.priceYearly) })}</p>
                    ) : null}
                  </>
                )}
              </div>

              {plan.shelfAccess === 'full' && (
                <p className="mt-3 inline-flex items-center gap-1.5 self-start rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-[#DFBF64]">
                  <Library className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t('membership.includesShelf')}
                </p>
              )}
              {plan.shelfAccess === 'pick' && (
                <p className="mt-3 inline-flex items-center gap-1.5 self-start rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-800">
                  <Library className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {plan.ebookTitlesPerPeriod !== null
                    ? t('membership.access.ebook.quota', { n: plan.ebookTitlesPerPeriod })
                    : t('membership.includesPick')}
                </p>
              )}
              {plan.shelfAccess !== 'none' && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t('membership.devices', { n: plan.maxDevices })}
                </p>
              )}

              <ul id={`membership-benefits-${key}`} className="mt-4 space-y-2 text-xs text-slate-700">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>{benefitText(benefit, plan)}</span>
                  </li>
                ))}
              </ul>
              {plan.code === 'author' && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">{t('membership.authorDisclaimer')}</p>
              )}

              <div className="mt-auto pt-5">{renderCta(plan)}</div>
            </article>
          );
        })}
      </div>
      <div className="mt-4 flex flex-col items-center gap-1 text-center text-xs text-slate-500">
        {!data.purchaseEnabled && <p>{t('membership.phase2Note')}</p>}
        <button type="button" id="btn-membership-terms" onClick={goToMembershipTerms} className="font-semibold text-[#9A7B38] underline-offset-2 hover:underline cursor-pointer">
          {t('membership.termsLink')}
        </button>
      </div>

      {/* Akses e-book & audiobook per paket */}
      <section id="membership-digital-access" className="mt-12">
        <h2 className="text-xl font-bold text-slate-900">{t('membership.access.title')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{t('membership.access.subtitle')}</p>
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th scope="col" className="w-36 px-3 py-3 font-semibold">{t('membership.access.feature')}</th>
                {accessColumns.map((column) => (
                  <th key={column} scope="col" className={`px-3 py-3 font-semibold ${column === 'professional' ? 'bg-[#D4AF37] text-slate-950' : ''}`}>
                    {columnName(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accessRows.map((row) => (
                <tr key={row} className="border-t border-slate-200 align-top">
                  <th scope="row" className="bg-slate-50 px-3 py-3 font-semibold text-slate-900">{t(`membership.access.rows.${row}`)}</th>
                  {accessColumns.map((column) => (
                    <td key={column} className={`px-3 py-3 text-slate-700 ${column === 'professional' ? 'bg-[#D4AF37]/5 font-medium text-slate-900' : ''}`}>
                      {accessCell(row, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs text-slate-500">
          {(['audioHours', 'unitPurchase', 'security'] as const).map((note) => (
            <li key={note} className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span>{t(`membership.access.notes.${note}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Kebijakan frontlist */}
      <section id="membership-frontlist" className="mt-12 rounded-2xl border border-slate-800 bg-[#0F172A] p-6 text-white sm:p-8">
        <h2 className="text-xl font-bold">{t('membership.frontlist.title')}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">{t('membership.frontlist.body', FRONTLIST_DAYS)}</p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {(['step1', 'step2', 'step3'] as const).map((step, index) => (
            <li key={step} className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-xs font-bold text-slate-950">{index + 1}</span>
              <span className="text-sm text-slate-200">{t(`membership.frontlist.${step}`, FRONTLIST_DAYS)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Status loyalitas & Magna Points: manfaat lanjutan, hanya bila flag server aktif */}
      {data.flags.extendedBenefits && (
        <section id="membership-loyalty" className="mt-12">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Award className="h-5 w-5 shrink-0 text-[#9A7B38]" aria-hidden="true" />
            {t('membership.loyalty.title')}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{t('membership.loyalty.subtitle')}</p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LOYALTY_STATUSES.map((status) => (
              <li key={status.key} id={`loyalty-${status.key}`} className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-bold text-slate-900">{t(`membership.loyalty.statuses.${status.key}.name`)}</h3>
                <p className="mt-1 text-xs font-semibold text-[#9A7B38]">
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

      {/* FAQ */}
      <section id="membership-faq" className="mt-12">
        <h2 className="text-xl font-bold text-slate-900">{t('membership.faq.title')}</h2>
        <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {MEMBERSHIP_FAQ_KEYS.map((key) => {
            const params = {
              ...FRONTLIST_DAYS,
              reader: currency(planByCode('reader')?.founding?.priceYearly ?? 0),
              readerCap: number(planByCode('reader')?.founding?.cap ?? 0),
              professional: currency(planByCode('professional')?.founding?.priceYearly ?? 0),
              professionalCap: number(planByCode('professional')?.founding?.cap ?? 0),
              author: currency(planByCode('author')?.founding?.priceYearly ?? 0),
              authorCap: number(planByCode('author')?.founding?.cap ?? 0),
              noticeDays: FOUNDING_MEMBER_PROGRAM.renewalNoticeDays,
              d1: reminder1,
              d2: reminder2,
              d3: reminder3,
              graceDays: data.flags.graceDays,
              retentionMonths: MEMBERSHIP_BILLING_POLICY.lockedDataRetentionMonths,
              devices: planByCode('professional')?.maxDevices ?? 2,
              releaseDays: MEMBERSHIP_BILLING_POLICY.deviceReleaseDays
            };
            return (
              <details key={key} id={`membership-faq-${key}`} className="group p-4 sm:p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>{t(`membership.faq.items.${key}.q`)}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {key === 'payment' ? t(paymentAnswer, params) : t(`membership.faq.items.${key}.a`, params)}
                </p>
              </details>
            );
          })}
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
