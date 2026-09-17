import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Library, Lock, Receipt, RefreshCw } from 'lucide-react';
import type { ActivePage, SubSection } from '../../types';
import { useAppLanguage, useFormatters } from '../../i18n/hooks';
import { useMemberSession } from '../../services/memberSession';
import { openSnapPayment } from '../../services/midtransSnap';
import { useMembershipPlans } from '../../hooks/useMembershipPlans';
import { MEMBERSHIP_BILLING_POLICY, PLAN_KEY_BY_CODE } from '../../data/membership';
import {
  cancelMembership,
  cancelMembershipChange,
  changeMembershipPlan,
  formatWhatsAppNumber,
  getMyMembership,
  isValidWhatsAppNumber,
  updateMembershipWhatsApp,
  membershipErrorCode,
  openMembershipReceipt,
  payMembershipInvoice,
  refreshMembershipInvoice,
  resumeMembership,
  type BillingCycle,
  type MembershipInvoice,
  type MyMembership,
  type PaymentMethod,
  type PlanCode
} from '../../services/membershipApi';
import { goToLibrary, goToLogin, goToMembership, goToMembershipInvoice } from '../../services/digitalNavigation';

interface AccountMembershipViewProps {
  /** Query mentah: invoice=<nomor tagihan> saat kembali dari Midtrans. */
  query: string;
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
}

const ERROR_CODES = [
  'payment_required', 'no_subscription', 'no_change', 'canceled', 'already_canceled', 'nothing_to_resume', 'period_ended',
  'state_changed', 'invoice_closed', 'invoice_not_found', 'plan_unavailable', 'payment_unavailable', 'payment_error',
  'no_pending_change', 'invalid_request', 'snap_unavailable', 'network', 'digital_disabled', 'invalid_whatsapp', 'order_not_saved'
];

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  past_due: 'bg-rose-100 text-rose-800',
  grace: 'bg-amber-100 text-amber-800',
  canceled: 'bg-slate-200 text-slate-700',
  expired: 'bg-slate-200 text-slate-700'
};

/**
 * Halaman /account/membership: paket, siklus, status, periode, metode bayar, status Founding, tagihan terbuka,
 * riwayat invoice (bukti bayar), ubah paket, ganti metode bayar, batal/batalkan pembatalan.
 */
export const AccountMembershipView: React.FC<AccountMembershipViewProps> = ({ query }) => {
  const { t } = useTranslation('digital');
  const language = useAppLanguage();
  const { currency, date } = useFormatters();
  const member = useMemberSession();
  const { data: plans } = useMembershipPlans();
  const [me, setMe] = useState<MyMembership | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [targetPlan, setTargetPlan] = useState<PlanCode>('gold');
  const [targetCycle, setTargetCycle] = useState<BillingCycle>('yearly');
  const [waOptIn, setWaOptIn] = useState(false);
  const [waNumber, setWaNumber] = useState('');
  const checkedInvoice = useRef(false);

  const fmtDate = (iso: string | null | undefined) => (iso ? date(new Date(iso)) : '—');
  const planName = (code: PlanCode | null) => (code ? t(`membership.plans.${PLAN_KEY_BY_CODE[code]}.name`) : '—');
  const cycleName = (cycle: BillingCycle) => t(`accountMembership.cycles.${cycle}`);
  const errorText = (code: string) => (ERROR_CODES.includes(code) ? t(`accountMembership.errors.${code as 'unknown'}`) : t('accountMembership.errors.unknown'));

  const apply = (res: MyMembership) => {
    setMe(res);
    const sub = res.subscription;
    if (sub) {
      if (sub.planCode && sub.planCode !== 'free') setTargetPlan(sub.planCode);
      setTargetCycle(sub.billingCycle);
      setWaOptIn(sub.whatsappOptIn);
      setWaNumber(formatWhatsAppNumber(sub.whatsappNumber));
    }
  };

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      apply(await getMyMembership());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (member.isLoggedIn) void load();
  }, [member.isLoggedIn, member.userId, load]);

  const refresh = async (invoice: MembershipInvoice) => {
    try {
      const res = await refreshMembershipInvoice(invoice.id);
      apply(res);
      setNotice(res.paid ? t('accountMembership.openInvoice.paidNow') : t('accountMembership.openInvoice.stillPending'));
    } catch (err) {
      setErrorCode(membershipErrorCode(err));
    }
  };

  // Kembali dari Snap (?invoice=<nomor tagihan>): cocokkan status ke Midtrans sekali.
  useEffect(() => {
    if (!me || checkedInvoice.current) return;
    const ref = new URLSearchParams(query).get('invoice');
    if (!ref) return;
    checkedInvoice.current = true;
    const invoice = me.invoices.find((i) => i.orderRef === ref);
    if (!invoice) return;
    if (invoice.status === 'paid') setNotice(t('accountMembership.openInvoice.paidNow'));
    else if (invoice.status === 'issued' || invoice.status === 'failed') void refresh(invoice);
  }, [me, query]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErrorCode(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setErrorCode(membershipErrorCode(err));
    } finally {
      setBusy(null);
    }
  };

  const payInvoice = async (invoice: MembershipInvoice) => {
    const { invoice: target } = await payMembershipInvoice(invoice.id);
    if (!target.snapToken) {
      setErrorCode('snap_unavailable');
      return;
    }
    const opened = await openSnapPayment(target.snapToken, {
      onSuccess: () => void refresh(target),
      onPending: () => void load(),
      onError: () => setErrorCode('payment_error'),
      onClose: () => void load()
    });
    if (!opened) {
      if (target.redirectUrl) window.location.assign(target.redirectUrl);
      else setErrorCode('snap_unavailable');
    }
  };

  const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-xs';
  const button = 'rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer';

  if (!member.isLoading && !member.isLoggedIn) {
    return (
      <div id="account-membership-login" className="max-w-xl mx-auto px-4 sm:px-6 py-10 md:py-14 text-left">
        <div className={card}>
          <Lock className="h-6 w-6 text-gold-700" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">{t('accountMembership.loginTitle')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('accountMembership.loginDescription')}</p>
          <button type="button" onClick={() => goToLogin()} className="mt-5 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-gold-600 cursor-pointer">{t('account.loginCta')}</button>
        </div>
      </div>
    );
  }

  const sub = me?.subscription ?? null;
  const ended = sub ? sub.status === 'canceled' || sub.status === 'expired' : false;
  const paidPlans = plans.plans.filter((p) => p.code !== 'free');
  const invoice = me?.openInvoice ?? null;

  return (
    <div id="account-membership-page" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 text-left">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('accountMembership.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('accountMembership.subtitle')}</p>
        </div>
        <button type="button" onClick={goToLibrary} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
          <Library className="h-3.5 w-3.5" />
          {t('accountMembership.openLibrary')}
        </button>
      </header>

      {notice && (
        <p role="status" className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      )}
      {errorCode && <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorText(errorCode)}</p>}

      {loadError ? (
        <div role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <p>{t('accountMembership.loadError')}</p>
          <button type="button" onClick={() => void load()} className="mt-2 font-semibold underline cursor-pointer">{t('myLibrary.retry')}</button>
        </div>
      ) : !me ? (
        <p role="status" className="mt-6 text-sm text-slate-500">{t('myLibrary.loading')}</p>
      ) : !sub ? (
        <section id="account-membership-none" className={`${card} mt-6`}>
          <h2 className="text-base font-bold text-slate-900">{t('accountMembership.none.title')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('accountMembership.none.description')}</p>
          <button type="button" onClick={goToMembership} className="mt-4 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-gold-600 cursor-pointer">{t('accountMembership.none.cta')}</button>
        </section>
      ) : (
        <>
          {/* Ringkasan */}
          <section id="account-membership-summary" className={`${card} mt-6`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">{planName(sub.planCode)}</h2>
              <span id="account-membership-status" data-status={sub.status} className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLASS[sub.status]}`}>
                {t(`accountMembership.status.${sub.status}`)}
              </span>
              {sub.isFounding && <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-400">{t('membership.foundingMember')}</span>}
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-slate-500">{t('accountMembership.fields.cycle')}</dt><dd className="font-semibold text-slate-900">{cycleName(sub.billingCycle)}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('accountMembership.fields.period')}</dt><dd className="font-semibold text-slate-900">{sub.currentPeriodStart ? `${fmtDate(sub.currentPeriodStart)} – ${fmtDate(sub.currentPeriodEnd)}` : '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('accountMembership.fields.accessUntil')}</dt><dd className="font-semibold text-slate-900">{fmtDate(sub.accessEndsAt)}</dd></div>
              <div>
                <dt className="text-xs text-slate-500">{t('accountMembership.fields.method')}</dt>
                <dd className="font-semibold text-slate-900">
                  {sub.paymentMethod === 'other' ? t('accountMembership.otherMethod') : t(`membershipCheckout.methods.${sub.paymentMethod}.label`)}
                </dd>
              </div>
              {sub.maxDevices !== null && sub.shelfAccess !== 'none' && (
                <div><dt className="text-xs text-slate-500">{t('accountMembership.fields.devices')}</dt><dd className="font-semibold text-slate-900">{sub.maxDevices}</dd></div>
              )}
              {sub.nextRenewal && (
                <div>
                  <dt className="text-xs text-slate-500">{t('accountMembership.fields.nextRenewal')}</dt>
                  <dd className="font-semibold text-slate-900">
                    {t('accountMembership.nextRenewal', { amount: currency(sub.nextRenewal.amount), date: fmtDate(sub.nextRenewal.date) })}
                    <span className="block text-xs font-normal text-slate-500">{t('accountMembership.renewalManual')}</span>
                  </dd>
                </div>
              )}
            </dl>
            {sub.isFounding && sub.foundingEndsAt && sub.regularYearlyPrice !== null && !ended && (
              <p className="mt-4 rounded-lg bg-gold-500/10 px-3 py-2 text-xs text-[#7A5F24]">
                {t('accountMembership.foundingUntil', { date: fmtDate(sub.foundingEndsAt), price: currency(sub.regularYearlyPrice) })}
              </p>
            )}
            {sub.pendingChange && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <span>{t('accountMembership.pendingChange', { date: fmtDate(sub.pendingChange.effectiveAt), plan: planName(sub.pendingChange.planCode), cycle: cycleName(sub.pendingChange.billingCycle) })}</span>
                <button type="button" disabled={busy !== null} onClick={() => void run('cancelChange', async () => { await cancelMembershipChange(); await load(); })} className="font-semibold text-gold-700 underline cursor-pointer">
                  {t('accountMembership.cancelChange')}
                </button>
              </div>
            )}
          </section>

          {/* Pemberitahuan status */}
          {(sub.status === 'grace' || sub.status === 'past_due' || sub.status === 'pending' || sub.cancelAtPeriodEnd || ended) && (
            <section className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p>
                  {sub.status === 'pending' ? t('accountMembership.pendingNotice')
                    : sub.status === 'grace' ? t('accountMembership.graceNotice', { date: fmtDate(sub.graceEndsAt) })
                      : sub.status === 'past_due' ? t('accountMembership.pastDueNotice')
                        : ended ? t('accountMembership.endedNotice', { date: fmtDate(sub.endedAt ?? sub.accessEndsAt), months: MEMBERSHIP_BILLING_POLICY.lockedDataRetentionMonths })
                          : t('accountMembership.canceledNotice', { date: fmtDate(sub.accessEndsAt) })}
                </p>
                {sub.cancelAtPeriodEnd && sub.status === 'active' && (
                  <button type="button" id="btn-membership-resume" disabled={busy !== null} onClick={() => void run('resume', async () => { await resumeMembership(); setNotice(t('accountMembership.resumed')); await load(); })} className={`${button} mt-2 bg-slate-900 text-white hover:bg-slate-800`}>
                    {t('accountMembership.resume')}
                  </button>
                )}
                {ended && (
                  <button type="button" onClick={goToMembership} className={`${button} mt-2 bg-slate-900 text-white hover:bg-slate-800`}>{t('accountMembership.subscribeAgain')}</button>
                )}
              </div>
            </section>
          )}

          {/* Tagihan terbuka */}
          {invoice && !ended && (
            <section id="account-membership-open-invoice" className={`${card} mt-4`}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('accountMembership.openInvoice.title')}</h2>
              <p className="mt-2 text-sm text-slate-700">
                {t(`accountMembership.invoiceKind.${invoice.kind}`)} · {planName(invoice.planCode)} · <span className="font-bold">{currency(invoice.amount)}</span>
              </p>
              {invoice.dueAt && <p className="text-xs text-slate-500">{t('accountMembership.openInvoice.due', { date: fmtDate(invoice.dueAt) })}</p>}
              {invoice.transfer && (
                <p className="mt-2 text-xs text-slate-600">
                  {t('accountMembership.openInvoice.transferNote', { code: invoice.transfer.uniqueCode ?? '—' })}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  id="btn-membership-pay-invoice"
                  disabled={busy !== null}
                  onClick={() => void run('pay', async () => {
                    // Transfer bank: buka instruksi (nominal berkode unik, rekening, unggah bukti). Snap: popup Midtrans.
                    const { invoice: target } = await payMembershipInvoice(invoice.id);
                    if (target.transfer) goToMembershipInvoice(target.id);
                    else await payInvoice(target);
                  })}
                  className={`${button} bg-gold-500 text-navy-950 hover:bg-gold-400`}
                >
                  {busy === 'pay' ? t('membershipCheckout.paying') : invoice.transfer ? t('accountMembership.openInvoice.transferCta') : t('accountMembership.openInvoice.pay')}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void run('refresh', () => refresh(invoice))} className={`${button} inline-flex items-center gap-1.5 border border-slate-300 text-slate-800 hover:bg-slate-50`}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('accountMembership.openInvoice.refresh')}
                </button>
              </div>
            </section>
          )}

          {sub.status === 'active' && !sub.cancelAtPeriodEnd && (
            <div className="mt-4 grid gap-4">
              {/* Ubah paket */}
              <section id="account-membership-change" className={card}>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('accountMembership.change.title')}</h2>
                <p className="mt-1 text-xs text-slate-600">{t('accountMembership.change.description')}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    {t('accountMembership.change.plan')}
                    <select value={targetPlan} onChange={(e) => setTargetPlan(e.target.value as PlanCode)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900">
                      {paidPlans.map((p) => <option key={p.code} value={p.code}>{planName(p.code)}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    {t('accountMembership.change.cycle')}
                    <select value={targetCycle} onChange={(e) => setTargetCycle(e.target.value as BillingCycle)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900">
                      {(['yearly', 'monthly'] as const).map((c) => <option key={c} value={c}>{cycleName(c)}</option>)}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  id="btn-membership-change"
                  disabled={busy !== null || (targetPlan === sub.planCode && targetCycle === sub.billingCycle)}
                  onClick={() => void run('change', async () => {
                    const res = await changeMembershipPlan(targetPlan, targetCycle);
                    if (res.mode === 'scheduled') setNotice(t('accountMembership.change.scheduledResult', { date: fmtDate(res.subscription.pendingChange?.effectiveAt) }));
                    else if (res.applied || !res.invoice) setNotice(t('accountMembership.change.appliedResult'));
                    else {
                      setNotice(t('accountMembership.change.immediateResult', { amount: currency(res.invoice.amount), credit: currency(res.credit) }));
                      await payInvoice(res.invoice);
                    }
                    await load();
                  })}
                  className={`${button} mt-3 bg-slate-900 text-white hover:bg-slate-800`}
                >
                  {t('accountMembership.change.submit')}
                </button>
              </section>

            </div>
          )}

          {/* Pengingat WhatsApp */}
          {plans.flags.whatsapp && !ended && (
            <section id="account-membership-whatsapp" className={`${card} mt-4`}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('accountMembership.whatsapp.title')}</h2>
              <p className="mt-1 text-xs text-slate-600">{t('accountMembership.whatsapp.description', { sender: plans.flags.whatsappSender ?? '' })}</p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                <input type="checkbox" id="account-whatsapp-optin" className="mt-1" checked={waOptIn} onChange={(e) => setWaOptIn(e.target.checked)} />
                <span>{t('accountMembership.whatsapp.optIn')}</span>
              </label>
              {waOptIn && (
                <label className="mt-3 block text-xs text-slate-600">
                  {t('accountMembership.whatsapp.number')}
                  <input
                    type="tel"
                    id="account-whatsapp-number"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={t('membershipCheckout.whatsapp.placeholder')}
                    value={waNumber}
                    onChange={(e) => setWaNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 sm:max-w-xs"
                  />
                </label>
              )}
              <button
                type="button"
                id="btn-account-whatsapp-save"
                disabled={busy !== null || (waOptIn === sub.whatsappOptIn && (!waOptIn || waNumber === formatWhatsAppNumber(sub.whatsappNumber)))}
                onClick={() => {
                  if (waOptIn && !isValidWhatsAppNumber(waNumber)) {
                    setErrorCode('invalid_whatsapp');
                    return;
                  }
                  void run('whatsapp', async () => {
                    await updateMembershipWhatsApp(waOptIn, waNumber);
                    setNotice(waOptIn ? t('accountMembership.whatsapp.saved') : t('accountMembership.whatsapp.off'));
                    await load();
                  });
                }}
                className={`${button} mt-3 border border-slate-300 text-slate-800 hover:bg-slate-50`}
              >
                {t('accountMembership.whatsapp.save')}
              </button>
            </section>
          )}

          {/* Batalkan */}
          {(sub.status === 'active' || sub.status === 'grace' || sub.status === 'past_due') && !sub.cancelAtPeriodEnd && (
            <section id="account-membership-cancel" className={`${card} mt-4`}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('accountMembership.cancel.title')}</h2>
              <p className="mt-1 text-xs text-slate-600">
                {sub.status === 'active' ? t('accountMembership.cancel.description', { date: fmtDate(sub.currentPeriodEnd) }) : t('accountMembership.cancel.descriptionNow')}
              </p>
              <button
                type="button"
                id="btn-membership-cancel"
                disabled={busy !== null}
                onClick={() => {
                  const endDate = sub.status === 'active' ? fmtDate(sub.currentPeriodEnd) : fmtDate(new Date().toISOString());
                  if (!window.confirm(t('accountMembership.cancel.confirm', { date: endDate }))) return;
                  void run('cancel', async () => { await cancelMembership(); setNotice(t('accountMembership.cancel.done', { date: endDate })); await load(); });
                }}
                className={`${button} mt-3 border border-rose-300 text-rose-700 hover:bg-rose-50`}
              >
                {t('accountMembership.cancel.button')}
              </button>
            </section>
          )}

          {/* Riwayat tagihan */}
          <section id="account-membership-invoices" className={`${card} mt-4`}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900">
              <Receipt className="h-4 w-4 text-gold-700" aria-hidden="true" />
              {t('accountMembership.invoices.title')}
            </h2>
            {me.invoices.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">{t('accountMembership.invoices.empty')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100 text-sm">
                {me.invoices.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-700">{inv.orderRef}</p>
                      <p className="text-xs text-slate-500">{t(`accountMembership.invoiceKind.${inv.kind}`)} · {planName(inv.planCode)} · {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-900">{currency(inv.amount)}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">{t(`accountMembership.invoiceStatus.${inv.status}`)}</span>
                      {inv.status === 'paid' && (
                        <button type="button" onClick={() => void run(`receipt-${inv.id}`, () => openMembershipReceipt(inv.id, language))} className="text-xs font-semibold text-gold-700 hover:underline cursor-pointer">
                          {t('accountMembership.invoices.receipt')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};
