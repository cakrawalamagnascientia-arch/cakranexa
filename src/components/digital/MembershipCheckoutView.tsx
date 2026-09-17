import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Lock, ShieldCheck } from 'lucide-react';
import type { ActivePage, SubSection } from '../../types';
import { useAppLanguage, useFormatters } from '../../i18n/hooks';
import { useMemberSession } from '../../services/memberSession';
import { openSnapPayment } from '../../services/midtransSnap';
import { useMembershipPlans } from '../../hooks/useMembershipPlans';
import { PLAN_KEY_BY_CODE } from '../../data/membership';
import {
  PAYMENT_METHODS,
  isPaidStatus,
  isValidWhatsAppNumber,
  membershipErrorCode,
  refreshMembershipInvoice,
  subscribeMembership,
  type BillingCycle,
  type MembershipInvoice,
  type PaymentMethod,
  type PlanCode
} from '../../services/membershipApi';
import { goToAccountMembership, goToLibrary, goToLibraryWelcome, goToLogin, goToMembership, goToMembershipTerms } from '../../services/digitalNavigation';

interface MembershipCheckoutViewProps {
  /** Query mentah: plan=<kode>&cycle=monthly|yearly. */
  query: string;
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
}

const PLAN_CODES: PlanCode[] = ['silver', 'gold', 'platinum'];
const ERROR_CODES = [
  'terms_required', 'license_required', 'already_subscribed', 'plan_unavailable', 'payment_unavailable', 'payment_error',
  'subscription_in_progress', 'email_required', 'snap_unavailable', 'digital_disabled', 'network', 'invalid_whatsapp', 'order_not_saved', 'method_unavailable'
];

const newIdempotencyKey = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

/**
 * Halaman /membership/checkout: ringkasan paket & harga (Founding bila berhak), pilihan cara bayar dengan penjelasan
 * jujur tentang perpanjangan, persetujuan ketentuan keanggotaan + lisensi digital, lalu Midtrans Snap.
 * Keanggotaan hanya aktif dari notifikasi Midtrans yang terverifikasi di server.
 */
export const MembershipCheckoutView: React.FC<MembershipCheckoutViewProps> = ({ query }) => {
  const { t } = useTranslation('digital');
  const language = useAppLanguage();
  const { currency, number } = useFormatters();
  const member = useMemberSession();
  const { data, loading, live } = useMembershipPlans();
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const planCode = (PLAN_CODES.includes(params.get('plan') as PlanCode) ? params.get('plan') : 'gold') as PlanCode;
  const [cycle, setCycle] = useState<BillingCycle>(params.get('cycle') === 'monthly' ? 'monthly' : 'yearly');
  const [method, setMethod] = useState<PaymentMethod>('va');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pendingInvoice, setPendingInvoice] = useState<MembershipInvoice | null>(null);
  const [popupClosed, setPopupClosed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const idempotencyKey = useRef(newIdempotencyKey());

  // Kunci baru bila isi pendaftaran berubah; klik ganda pada pilihan yang sama memakai kunci yang sama.
  useEffect(() => {
    idempotencyKey.current = newIdempotencyKey();
    setPendingInvoice(null);
  }, [planCode, cycle, method, whatsappOptIn, whatsappNumber]);

  const plan = data.plans.find((p) => p.code === planCode) ?? null;
  const planName = t(`membership.plans.${PLAN_KEY_BY_CODE[planCode]}.name`);
  const founding = plan?.founding ?? null;
  const foundingApplies = Boolean(founding) && cycle === 'yearly' && data.foundingEligible && (founding?.remaining ?? 1) > 0;
  const regular = plan ? (cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly) : 0;
  const total = foundingApplies && founding ? founding.priceYearly : regular;
  const autodebit = data.flags.autodebit;
  const errorText = (code: string) => (ERROR_CODES.includes(code) ? t(`membershipCheckout.errors.${code as 'unknown'}`) : t('membershipCheckout.errors.unknown'));
  const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

  const openPayment = async (invoice: MembershipInvoice) => {
    if (!invoice.snapToken) {
      goToAccountMembership(`invoice=${encodeURIComponent(invoice.orderRef)}`);
      return;
    }
    setPopupClosed(false);
    const opened = await openSnapPayment(invoice.snapToken, {
      onSuccess: () => {
        setConfirming(true);
        // Notifikasi Midtrans bisa tiba beberapa detik kemudian: cocokkan dulu, lalu ke Pustaka Saya.
        void refreshMembershipInvoice(invoice.id).catch(() => undefined).finally(goToLibraryWelcome);
      },
      onPending: () => goToAccountMembership(`invoice=${encodeURIComponent(invoice.orderRef)}`),
      onError: () => setErrorCode('payment_error'),
      onClose: () => setPopupClosed(true)
    });
    if (!opened) {
      if (invoice.redirectUrl) window.location.assign(invoice.redirectUrl);
      else setErrorCode('snap_unavailable');
    }
  };

  const pay = async () => {
    if (!termsAccepted) return setErrorCode('terms_required');
    if (!licenseAccepted) return setErrorCode('license_required');
    const sendWhatsApp = data.flags.whatsapp && whatsappOptIn;
    if (sendWhatsApp && !isValidWhatsAppNumber(whatsappNumber)) return setErrorCode('invalid_whatsapp');
    setWorking(true);
    setErrorCode(null);
    try {
      const result = await subscribeMembership({
        planCode,
        cycle,
        method,
        idempotencyKey: idempotencyKey.current,
        language,
        ...(sendWhatsApp ? { whatsappOptIn: true, whatsappNumber } : {})
      });
      if (!result.invoice || result.invoice.status !== 'issued') {
        goToAccountMembership();
        return;
      }
      setPendingInvoice(result.invoice);
      await openPayment(result.invoice);
    } catch (err) {
      setErrorCode(membershipErrorCode(err));
    } finally {
      setWorking(false);
    }
  };

  const wrap = (content: React.ReactNode, id: string) => (
    <div id={id} className="max-w-xl mx-auto px-4 sm:px-6 py-10 md:py-14 text-left">
      <div className={card}>{content}</div>
    </div>
  );

  if (!member.isLoading && !member.isLoggedIn) {
    return wrap(
      <>
        <Lock className="h-6 w-6 text-[#9A7B38]" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{t('membershipCheckout.loginTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('membershipCheckout.loginDescription')}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="button" id="btn-membership-login" onClick={() => goToLogin()} className="rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#c5a059] cursor-pointer">{t('account.loginCta')}</button>
          <button type="button" onClick={() => goToLogin(undefined, 'register')} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">{t('account.registerCta')}</button>
        </div>
      </>,
      'membership-checkout-login'
    );
  }

  if (loading || member.isLoading) {
    return wrap(<p role="status" className="text-sm text-slate-500">{t('myLibrary.loading')}</p>, 'membership-checkout-loading');
  }

  if (confirming) {
    return wrap(
      <>
        <Clock className="h-7 w-7 animate-pulse text-[#9A7B38]" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{t('membershipCheckout.confirmingTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('membershipCheckout.confirmingDescription')}</p>
      </>,
      'membership-checkout-confirming'
    );
  }

  if (data.current && isPaidStatus(data.current.status)) {
    return wrap(
      <>
        <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{t('membershipCheckout.alreadyMemberTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('membershipCheckout.errors.already_subscribed')}</p>
        <button type="button" onClick={() => goToAccountMembership()} className="mt-5 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#c5a059] cursor-pointer">{t('membershipCheckout.manage')}</button>
      </>,
      'membership-checkout-member'
    );
  }

  if (planCode === 'free') {
    return wrap(
      <>
        <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{t('membershipCheckout.freeTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('membershipCheckout.freeDescription')}</p>
        <button type="button" onClick={goToLibrary} className="mt-5 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#c5a059] cursor-pointer">{t('checkout.openLibrary')}</button>
      </>,
      'membership-checkout-free'
    );
  }

  if (!live || !data.purchaseEnabled || !data.paymentAvailable || !plan) {
    return wrap(
      <>
        <h1 className="text-xl font-bold text-slate-900">{t('membershipCheckout.unavailableTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('membershipCheckout.unavailable')}</p>
        <button type="button" onClick={goToMembership} className="mt-5 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">{t('membershipCheckout.back')}</button>
      </>,
      'membership-checkout-unavailable'
    );
  }

  const methodDescription = (m: PaymentMethod) => {
    if (m === 'va' || m === 'qris') return t(`membershipCheckout.methods.${m}.description`);
    return autodebit ? t(`membershipCheckout.methods.${m}.descriptionAuto`) : t(`membershipCheckout.methods.${m}.descriptionManual`);
  };

  return (
    <div id="membership-checkout-page" className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12 text-left">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('membershipCheckout.title')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('membershipCheckout.subtitle')}</p>

      <section className={`${card} mt-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('membershipCheckout.plan')}</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">{planName}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t('membership.devices', { n: plan.maxDevices })}</p>
          </div>
          <button type="button" onClick={goToMembership} className="text-xs font-semibold text-[#9A7B38] hover:underline cursor-pointer">{t('membershipCheckout.change')}</button>
        </div>

        <div role="radiogroup" aria-label={t('membershipCheckout.cycle')} className="mt-4 grid gap-2 sm:grid-cols-2">
          {(['yearly', 'monthly'] as const).map((value) => (
            <label key={value} className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${cycle === value ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-slate-200'}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="membership-cycle" id={`cycle-${value}`} checked={cycle === value} onChange={() => setCycle(value)} />
                {t(`membership.billing.${value === 'yearly' ? 'annual' : 'monthly'}`)}
              </span>
              <span className="font-mono text-xs text-slate-700">{currency(value === 'yearly' ? plan.priceYearly : plan.priceMonthly)}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          {foundingApplies && founding && (
            <p className="mb-2 inline-flex rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#DFBF64]">
              {founding.remaining === null ? t('membership.foundingMember') : t('membership.foundingSeats', { count: number(founding.remaining) })}
            </p>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">{t('membershipCheckout.totalToday')}</span>
            <span className="flex items-baseline gap-2">
              {foundingApplies && <s className="text-xs text-slate-400">{currency(regular)}</s>}
              <span id="membership-checkout-total" className="text-xl font-bold text-slate-900">{currency(total)}</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t('membershipCheckout.renewalNote', {
              price: currency(regular),
              cycle: cycle === 'yearly' ? t('membershipCheckout.perYear') : t('membershipCheckout.perMonth')
            })}
          </p>
        </div>
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('membershipCheckout.methodTitle')}</h2>
        <p className="mt-1 text-xs text-slate-600">{autodebit ? t('membershipCheckout.honestNote') : t('membershipCheckout.honestNoteManual')}</p>
        <div role="radiogroup" aria-label={t('membershipCheckout.methodTitle')} className="mt-3 space-y-2">
          {PAYMENT_METHODS.map((m) => (
            <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${method === m ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-slate-200'}`}>
              <input type="radio" name="membership-method" id={`method-${m}`} className="mt-1" checked={method === m} onChange={() => setMethod(m)} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{t(`membershipCheckout.methods.${m}.label`)}</span>
                <span className="block text-xs text-slate-600">{methodDescription(m)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {data.flags.whatsapp && (
        <section id="membership-whatsapp-section" className={`${card} mt-4`}>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('membershipCheckout.whatsapp.title')}</h2>
          <p className="mt-1 text-xs text-slate-600">{t('membershipCheckout.whatsapp.description', { sender: data.flags.whatsappSender ?? '' })}</p>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              id="membership-whatsapp-optin"
              className="mt-1"
              checked={whatsappOptIn}
              onChange={(e) => { setWhatsappOptIn(e.target.checked); if (errorCode === 'invalid_whatsapp') setErrorCode(null); }}
            />
            <span>{t('membershipCheckout.whatsapp.optIn')}</span>
          </label>
          {whatsappOptIn && (
            <label className="mt-3 block text-xs text-slate-600">
              {t('membershipCheckout.whatsapp.number')}
              <input
                type="tel"
                id="membership-whatsapp"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t('membershipCheckout.whatsapp.placeholder')}
                value={whatsappNumber}
                onChange={(e) => { setWhatsappNumber(e.target.value); if (errorCode === 'invalid_whatsapp') setErrorCode(null); }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 sm:max-w-xs"
              />
            </label>
          )}
        </section>
      )}

      <section className={`${card} mt-4 space-y-3`}>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
          <input type="checkbox" id="membership-terms" className="mt-1" checked={termsAccepted} onChange={(e) => { setTermsAccepted(e.target.checked); if (e.target.checked && errorCode === 'terms_required') setErrorCode(null); }} />
          <span>
            {t('membershipCheckout.termsAccept')}{' '}
            <button type="button" onClick={goToMembershipTerms} className="font-semibold text-[#9A7B38] underline-offset-2 hover:underline cursor-pointer">{t('membership.termsLink')}</button>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
          <input type="checkbox" id="membership-license" className="mt-1" checked={licenseAccepted} onChange={(e) => { setLicenseAccepted(e.target.checked); if (e.target.checked && errorCode === 'license_required') setErrorCode(null); }} />
          <span>{t('membershipCheckout.licenseAccept')}</span>
        </label>
      </section>

      {errorCode && (
        <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p>{errorText(errorCode)}</p>
          {errorCode === 'already_subscribed' && (
            <button type="button" onClick={() => goToAccountMembership()} className="mt-2 font-semibold underline cursor-pointer">{t('membershipCheckout.manage')}</button>
          )}
        </div>
      )}
      {popupClosed && pendingInvoice && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{t('membershipCheckout.popupClosed')}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" onClick={() => void openPayment(pendingInvoice)} className="font-semibold underline cursor-pointer">{t('membershipCheckout.resume')}</button>
            <button type="button" onClick={() => goToAccountMembership()} className="font-semibold underline cursor-pointer">{t('membershipCheckout.manage')}</button>
          </div>
        </div>
      )}

      <button
        type="button"
        id="btn-membership-pay"
        onClick={() => void pay()}
        disabled={working}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-3 text-base font-bold text-slate-950 transition-colors hover:bg-[#c5a059] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
      >
        {working ? t('membershipCheckout.paying') : t('membershipCheckout.pay', { total: currency(total) })}
      </button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
        {t('checkout.secureNote')}
      </p>
    </div>
  );
};
