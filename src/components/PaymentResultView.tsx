import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BookOpen, CheckCircle2, Clock, Loader2, MessageCircle, RefreshCw, XCircle } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { buildPath } from '../utils/router';
import { FAILED_ORDER_STATUSES, PAID_ORDER_STATUSES, parsePaymentQuery } from '../utils/paymentResult';
import type { ActivePage, SubSection } from '../types';

/**
 * Halaman /payment/success dan /payment/failed: tujuan Finish/Unfinish/Error Redirect URL di dashboard Midtrans
 * (Midtrans menambahkan ?order_id=&status_code=&transaction_status=). Parameter URL tidak dipercaya sebagai bukti
 * bayar: status pesanan buku cetak dibaca dari server (GET /api/orders/:id/status, tanpa data pribadi) dan diperbarui
 * berkala selama masih menunggu. Pesanan digital (DIG-), keanggotaan (SUB-), dan invoice institusi (INST-) diarahkan
 * ke halaman statusnya masing-masing.
 */

type Variant = 'success' | 'failed';
type PrintState = 'checking' | 'paid' | 'pending' | 'failed' | 'unknown';
type Outcome = 'checking' | 'paid' | 'pending' | 'verifying' | 'failed' | 'alreadyPaid';

const POLL_MS = 5000;
const MAX_POLLS = 12;
const WHATSAPP_NUMBER = '6285286146806';

interface PaymentResultViewProps {
  variant: Variant;
  query: string;
  onNavigate: (page: ActivePage, subSection?: SubSection) => void;
  onNavigatePath: (path: string) => void;
}

export const PaymentResultView: React.FC<PaymentResultViewProps> = ({ variant, query, onNavigate, onNavigatePath }) => {
  const { t } = useTranslation('checkout');
  const { orderId, kind, transactionStatus } = useMemo(() => parsePaymentQuery(query), [query]);
  const [printState, setPrintState] = useState<PrintState>(kind === 'print' ? 'checking' : 'unknown');
  const [tracking, setTracking] = useState<string | null>(null);
  const [checks, setChecks] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const polls = useRef(0);

  const check = useCallback(async () => {
    if (kind !== 'print' || !orderId) return;
    const status = await apiClient.getOrderStatus(orderId);
    if (!status) {
      setPrintState('unknown');
    } else {
      const value = String(status.paymentStatus);
      setTracking(status.trackingNumber || null);
      setPrintState(PAID_ORDER_STATUSES.has(value) ? 'paid' : FAILED_ORDER_STATUSES.has(value) ? 'failed' : 'pending');
    }
    setChecks((n) => n + 1);
  }, [kind, orderId]);

  useEffect(() => {
    polls.current = 0;
    void check();
  }, [check]);

  // Pembayaran VA/QRIS bisa terkonfirmasi beberapa saat setelah redirect: periksa ulang berkala selama masih menunggu.
  useEffect(() => {
    if (kind !== 'print' || variant !== 'success' || printState !== 'pending' || polls.current >= MAX_POLLS) return;
    const timer = window.setTimeout(() => {
      polls.current += 1;
      void check();
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [kind, variant, printState, checks, check]);

  const refresh = async () => {
    setRefreshing(true);
    polls.current = 0;
    await check();
    setRefreshing(false);
  };

  let outcome: Outcome;
  if (kind === 'print' && printState === 'checking') outcome = 'checking';
  else if (kind === 'print' && printState === 'paid') outcome = variant === 'failed' ? 'alreadyPaid' : 'paid';
  else if (variant === 'failed' || printState === 'failed') outcome = 'failed';
  else if (kind === 'print' && printState === 'pending') outcome = 'pending';
  else outcome = 'verifying';

  const verifyingDescription = {
    digital: t('paymentResult.success.digitalDescription'),
    membership: t('paymentResult.success.membershipDescription'),
    institution: t('paymentResult.success.institutionDescription'),
    print: t('paymentResult.success.verifyingDescription'),
    unknown: t('paymentResult.success.verifyingDescription')
  }[kind];
  const failureReason = ({
    deny: t('paymentResult.failed.reasons.deny'),
    cancel: t('paymentResult.failed.reasons.cancel'),
    expire: t('paymentResult.failed.reasons.expire'),
    failure: t('paymentResult.failed.reasons.failure')
  } as Record<string, string>)[transactionStatus] ?? null;

  const copy: Record<Outcome, { title: string; description: string }> = {
    checking: { title: t('paymentResult.checking'), description: '' },
    paid: { title: t('paymentResult.success.paidTitle'), description: t('paymentResult.success.paidDescription') },
    alreadyPaid: { title: t('paymentResult.failed.alreadyPaidTitle'), description: t('paymentResult.failed.alreadyPaidDescription') },
    pending: { title: t('paymentResult.success.pendingTitle'), description: t('paymentResult.success.pendingDescription') },
    verifying: { title: t('paymentResult.success.verifyingTitle'), description: verifyingDescription },
    failed: { title: t('paymentResult.failed.title'), description: t('paymentResult.failed.description') }
  };
  const isPaid = outcome === 'paid' || outcome === 'alreadyPaid';
  const Icon = outcome === 'checking' ? Loader2 : isPaid ? CheckCircle2 : outcome === 'failed' ? XCircle : Clock;
  const iconClass = outcome === 'checking'
    ? 'text-slate-400 animate-spin'
    : isPaid ? 'text-emerald-600' : outcome === 'failed' ? 'text-rose-600' : 'text-amber-500';
  const ringClass = isPaid ? 'bg-emerald-50' : outcome === 'failed' ? 'bg-rose-50' : 'bg-amber-50';

  const whatsappText = orderId ? t('paymentResult.whatsappMessage', { order: orderId }) : t('paymentResult.whatsappMessageNoOrder');
  const digitalOrderPath = orderId ? buildPath({ page: 'digital', subSection: 'checkout', query: `order=${encodeURIComponent(orderId)}` }) : null;

  const primary = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2.5 text-sm font-bold text-[#DFBF64] hover:bg-[#1E293B] transition-colors cursor-pointer';
  const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60';

  return (
    <div className="bg-[#F8FAFC] py-12 sm:py-16">
      <div className="mx-auto max-w-xl px-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${ringClass}`}>
            <Icon className={`h-9 w-9 ${iconClass}`} aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-[#0F172A]" aria-live="polite">{copy[outcome].title}</h1>
          {copy[outcome].description && <p className="mt-3 text-sm leading-relaxed text-slate-600">{copy[outcome].description}</p>}
          {outcome === 'failed' && failureReason && <p className="mt-2 text-sm font-medium text-rose-700">{failureReason}</p>}
          {outcome === 'failed' && kind === 'institution' && <p className="mt-2 text-sm text-slate-600">{t('paymentResult.failed.institutionHelp')}</p>}
          {outcome === 'failed' && orderId && kind !== 'institution' && (
            <p className="mt-2 text-sm text-slate-600">{t('paymentResult.failed.orderKept', { order: orderId })}</p>
          )}

          {orderId && (
            <dl className="mx-auto mt-6 max-w-sm space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-left text-sm">
              {/* Ponsel: label di atas nilai agar nomor pesanan tidak terpotong di tengah. */}
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <dt className="shrink-0 text-slate-500">{t('paymentResult.orderLabel')}</dt>
                <dd className="font-mono font-semibold text-slate-900 break-all sm:text-right">{orderId}</dd>
              </div>
              {tracking && (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <dt className="shrink-0 text-slate-500">{t('paymentResult.trackingLabel')}</dt>
                  <dd className="font-mono font-semibold text-slate-900 break-all sm:text-right">{tracking}</dd>
                </div>
              )}
            </dl>
          )}

          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {kind === 'digital' && digitalOrderPath && (
              <button type="button" className={primary} onClick={() => onNavigatePath(digitalOrderPath)}>
                {outcome === 'failed' ? t('paymentResult.failed.retryDigital') : t('paymentResult.success.viewDigitalOrder')}
              </button>
            )}
            {kind === 'digital' && outcome !== 'failed' && (
              <button type="button" className={secondary} onClick={() => onNavigate('library')}>
                <BookOpen className="h-4 w-4" /> {t('paymentResult.success.openLibrary')}
              </button>
            )}
            {kind === 'membership' && (
              <button type="button" className={primary} onClick={() => onNavigate('account', 'membership')}>
                {outcome === 'failed' ? t('paymentResult.failed.retryMembership') : t('paymentResult.success.manageMembership')}
              </button>
            )}
            {kind === 'print' && outcome === 'pending' && (
              <button type="button" className={secondary} onClick={() => void refresh()} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> {t('paymentResult.checkAgain')}
              </button>
            )}
            {(kind === 'print' || kind === 'unknown') && (
              <button type="button" className={kind === 'print' && outcome !== 'pending' ? primary : secondary} onClick={() => onNavigate('katalog')}>
                <ArrowLeft className="h-4 w-4" /> {outcome === 'failed' ? t('paymentResult.failed.retryPrint') : t('paymentResult.backToCatalog')}
              </button>
            )}
            {kind === 'institution' && (
              <button type="button" className={primary} onClick={() => onNavigate('beranda')}>
                <ArrowLeft className="h-4 w-4" /> {t('paymentResult.backToHome')}
              </button>
            )}
            <a
              className={secondary}
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappText)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="h-4 w-4 text-emerald-600" /> {t('paymentResult.contactWhatsApp')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
