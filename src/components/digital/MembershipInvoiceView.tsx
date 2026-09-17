import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, CheckCircle2, Clock, Copy, Loader2, MessageCircle, TriangleAlert } from 'lucide-react';
import { useAppLanguage, useFormatters } from '../../i18n/hooks';
import { useMemberSession } from '../../services/memberSession';
import {
  getMembershipInvoice,
  membershipErrorCode,
  uploadMembershipProof,
  type MembershipInvoiceDetail
} from '../../services/membershipApi';
import { goToAccountMembership, goToLibraryWelcome, goToLogin, goToMembership, goToPickScreen } from '../../services/digitalNavigation';
import { formatWib, ProofUploader } from '../TransferInstructions';

interface MembershipInvoiceViewProps {
  invoiceId: string;
}

const POLL_MS = 30_000;
const PICK_PLANS = ['silver', 'gold'];

/**
 * /membership/invoice/<id> (fase 6 Langkah 4): instruksi transfer keanggotaan — nominal PERSIS berkode unik, rekening
 * PT, batas waktu, WhatsApp Finance, unggah bukti — lalu status sampai Finance mengonfirmasi (dicek ulang tiap 30 detik).
 * Setelah lunas: ajakan "Pilih buku bulan ini" (Silver/Gold) atau Pustaka Saya.
 */
export const MembershipInvoiceView: React.FC<MembershipInvoiceViewProps> = ({ invoiceId }) => {
  const { t } = useTranslation('digital');
  const language = useAppLanguage();
  const { currency } = useFormatters();
  const member = useMemberSession();
  const [detail, setDetail] = useState<MembershipInvoiceDetail | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await getMembershipInvoice(invoiceId));
      setErrorCode(null);
    } catch (err) {
      setErrorCode(membershipErrorCode(err));
    }
  }, [invoiceId]);

  useEffect(() => {
    if (member.isLoading || !member.isLoggedIn) return;
    void load();
  }, [load, member.isLoading, member.isLoggedIn]);

  const waiting = detail?.invoice.status === 'issued';
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  const copy = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
    }).catch(() => undefined);
  };

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const { invoice } = await uploadMembershipProof(invoiceId, file);
      setDetail((current) => (current ? { ...current, invoice } : current));
    } catch (err) {
      const code = membershipErrorCode(err);
      setUploadError(t(`membershipInvoice.proofErrors.${code}`, { defaultValue: t('membershipInvoice.proofErrors.default') }));
    } finally {
      setUploading(false);
    }
  };

  const shell = (children: React.ReactNode, id: string) => (
    <div id={id} className="mx-auto max-w-2xl px-4 py-8 text-left sm:px-6 md:py-12">{children}</div>
  );
  const card = 'rounded-2xl border border-cream-200 bg-white p-5 shadow-sm sm:p-6';
  const copyButton = (key: string, value: string) => (
    <button
      type="button"
      onClick={() => copy(key, value)}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-cream-50 cursor-pointer"
    >
      {copied === key ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied === key ? t('membershipInvoice.copied') : t('membershipInvoice.copy')}
    </button>
  );

  if (!member.isLoading && !member.isLoggedIn) {
    return shell(
      <div className={card}>
        <h1 className="text-xl font-bold text-slate-900">{t('membershipCheckout.loginTitle')}</h1>
        <button type="button" onClick={() => goToLogin()} className="mt-4 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-bold text-navy-950 cursor-pointer">{t('account.loginCta')}</button>
      </div>,
      'membership-invoice-login'
    );
  }
  if (errorCode) {
    return shell(
      <div className={card} role="alert">
        <h1 className="text-xl font-bold text-slate-900">{t('membershipInvoice.notFound')}</h1>
        <button type="button" onClick={() => goToAccountMembership()} className="mt-4 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold cursor-pointer">{t('membershipCheckout.manage')}</button>
      </div>,
      'membership-invoice-error'
    );
  }
  if (!detail) {
    return shell(
      <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('myLibrary.loading')}</p>,
      'membership-invoice-loading'
    );
  }

  const { invoice } = detail;
  const planName = detail.planName ? (language === 'id' ? detail.planName.id : detail.planName.en) : '';
  const transfer = invoice.transfer;

  if (invoice.status === 'paid') {
    const pick = invoice.planCode !== null && PICK_PLANS.includes(invoice.planCode);
    return shell(
      <div className={card} id="membership-invoice-paid">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold text-slate-900">{t('membershipInvoice.paidTitle', { plan: planName })}</h1>
        <p className="mt-1 text-sm text-slate-600">{pick ? t('membershipInvoice.paidPick') : t('membershipInvoice.paidOpen')}</p>
        <button
          type="button"
          id={pick ? 'btn-invoice-pick' : 'btn-invoice-library'}
          onClick={pick ? goToPickScreen : goToLibraryWelcome}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-bold text-navy-950 hover:bg-gold-400 cursor-pointer"
        >
          {pick ? t('membershipInvoice.pickCta') : t('membershipInvoice.libraryCta')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>,
      'membership-invoice-page'
    );
  }

  if (invoice.status !== 'issued') {
    return shell(
      <div className={card} id="membership-invoice-closed">
        <TriangleAlert className="h-7 w-7 text-amber-600" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{detail.expired ? t('membershipInvoice.expiredTitle') : t('membershipInvoice.closedTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{detail.expired ? t('membershipInvoice.expiredBody') : t('membershipInvoice.closedBody')}</p>
        <button type="button" onClick={goToMembership} className="mt-5 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-bold text-navy-950 cursor-pointer">{t('membershipInvoice.choosePlan')}</button>
      </div>,
      'membership-invoice-page'
    );
  }

  const hoursLeft = invoice.dueAt ? Math.max(0, Math.ceil((Date.parse(invoice.dueAt) - Date.now()) / 3_600_000)) : null;
  const steps = [
    { key: 'transfer', done: false },
    { key: 'proof', done: Boolean(transfer?.hasProof) },
    { key: 'confirm', done: false }
  ] as const;

  return shell(
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">{t('membershipInvoice.eyebrow', { ref: invoice.orderRef })}</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{t('membershipInvoice.title')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('membershipInvoice.subtitle', { plan: planName })}</p>

      <ol className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold sm:text-xs">
        {steps.map((step, index) => (
          <li key={step.key} className={`rounded-lg border px-2 py-2 ${step.done ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-cream-200 bg-white text-slate-700'}`}>
            <span className="mr-1 font-bold">{index + 1}.</span>{t(`membershipInvoice.steps.${step.key}`)}
          </li>
        ))}
      </ol>

      <section className={`${card} mt-4`} aria-labelledby="invoice-amount-label">
        <p id="invoice-amount-label" className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('membershipInvoice.amountLabel')}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <span id="membership-invoice-amount" className="font-mono text-3xl font-bold text-slate-900">{currency(invoice.amount)}</span>
          {copyButton('amount', String(invoice.amount))}
        </div>
        {transfer?.uniqueCode && (
          <p className="mt-2 rounded-lg bg-gold-500/10 px-3 py-2 text-xs text-slate-700">
            {t('membershipInvoice.uniqueCodeNote', { code: transfer.uniqueCode, base: currency(transfer.baseAmount), discount: currency(transfer.uniqueDiscount) })}
          </p>
        )}
        {invoice.dueAt && (
          <p id="membership-invoice-deadline" className="mt-3 flex items-start gap-2 text-sm text-slate-700">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" aria-hidden="true" />
            <span>
              {t('membershipInvoice.deadline', { date: formatWib(invoice.dueAt, language) })}
              {hoursLeft !== null && invoice.kind !== 'renewal' && <span className="ml-1 font-semibold">({t('membershipInvoice.hoursLeft', { count: hoursLeft })})</span>}
            </span>
          </p>
        )}
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('membershipInvoice.accountsTitle')}</h2>
        <ul className="mt-3 space-y-2">
          {detail.bankAccounts.map((account) => (
            <li key={`${account.bankName}-${account.accountNumber}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-600">{account.bankName}{account.branch ? ` · ${account.branch}` : ''}</p>
                <p className="font-mono text-lg font-bold text-slate-900">{account.accountNumber}</p>
                <p className="text-xs text-slate-500">{t('membershipInvoice.accountHolder', { name: account.accountHolder })}</p>
              </div>
              {copyButton(`acc-${account.accountNumber}`, account.accountNumber.replace(/[^0-9]/g, ''))}
            </li>
          ))}
          {detail.bankAccounts.length === 0 && <li className="text-sm text-slate-600">{t('membershipInvoice.noAccounts')}</li>}
        </ul>
        <p className="mt-3 text-xs text-slate-500">{t('membershipInvoice.safety')}</p>
      </section>

      <section className={`${card} mt-4 space-y-4`}>
        <ProofUploader
          language={language}
          hasProof={Boolean(transfer?.hasProof)}
          proofUploadedAt={transfer?.proofUploadedAt ?? null}
          uploading={uploading}
          error={uploadError}
          onUpload={(file) => void upload(file)}
        />
        {detail.financeWhatsappUrl && (
          <a
            id="btn-invoice-whatsapp"
            href={detail.financeWhatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            {t('membershipInvoice.whatsapp')}
          </a>
        )}
        <p id="membership-invoice-waiting" className="flex items-start gap-2 text-xs text-slate-600">
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-gold-700" aria-hidden="true" />
          {t('membershipInvoice.waiting')}
        </p>
      </section>
    </>,
    'membership-invoice-page'
  );
};
