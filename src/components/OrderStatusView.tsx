import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, Clock, Loader2, MessageCircle, Package, XCircle } from 'lucide-react';
import type { ActivePage } from '../types';
import { ApiError } from '../services/apiClient';
import { getOrderDetail, uploadOrderProof, type PrintOrderDetail } from '../services/printCheckoutApi';
import { useOrderLabels } from '../i18n/orderLabels';
import { getCurrentLanguage } from '../i18n/index';
import { formatRupiahPlain, whatsappLink } from '../utils/transferConfirmation';
import { formatWib, ProofUploader, TransferInstructions } from './TransferInstructions';

/**
 * Halaman pesanan buku cetak untuk pembeli (/pesanan/<nomor>?t=<token>, tautan dari checkout dan email):
 * instruksi transfer selama menunggu transfer, lalu status (menunggu ongkir, lunas, dikirim, kedaluwarsa).
 * Status diperbarui otomatis tiap 30 detik selama menunggu transfer.
 */
export const OrderStatusView: React.FC<{
  orderNumber: string | null;
  query: string;
  onNavigate: (page: ActivePage) => void;
}> = ({ orderNumber, query, onNavigate }) => {
  const { t } = useTranslation('checkout');
  const { statusLabel } = useOrderLabels();
  const language = getCurrentLanguage();
  const token = new URLSearchParams(query).get('t') || '';
  const [detail, setDetail] = useState<PrintOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderNumber || !token) {
      setError(t('orderPage.notFound'));
      setLoading(false);
      return;
    }
    try {
      setDetail(await getOrderDetail(orderNumber, token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? t('orderPage.notFound') : err instanceof Error ? err.message : t('orderPage.notFound'));
    } finally {
      setLoading(false);
    }
  }, [orderNumber, token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (detail?.status !== 'awaiting_transfer' && detail?.status !== 'pending') return;
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [detail?.status, load]);

  const copy = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 2000);
  };

  const upload = async (file: File) => {
    if (!orderNumber) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadOrderProof(orderNumber, token, file);
      await load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : t('orderPage.proof.failed'));
    } finally {
      setUploading(false);
    }
  };

  const card = 'mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8';

  if (loading) {
    return (
      <div className="px-4 py-16">
        <div className={`${card} flex items-center gap-2 text-sm text-slate-600`}><Loader2 className="h-4 w-4 animate-spin" />{t('orderPage.loading')}</div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="px-4 py-16">
        <div className={card}>
          <p className="text-sm text-rose-700">{error}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => { setLoading(true); void load(); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('orderPage.retry')}</button>
            <button type="button" onClick={() => onNavigate('katalog')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">{t('orderPage.backToCatalog')}</button>
          </div>
        </div>
      </div>
    );
  }

  const status = detail.status;
  const whatsapp = whatsappLink(detail.financeWhatsapp, detail.whatsappText);
  const notice = (icon: React.ReactNode, title: string, description: string, tone: string) => (
    <div className={`flex gap-3 rounded-xl border p-4 ${tone}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <h2 className="text-sm font-bold">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed">{description}</p>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-50 px-4 py-10">
      <div className={card}>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h1 className="font-serif text-xl font-bold text-slate-900">{t('orderPage.title', { orderNumber: detail.orderNumber })}</h1>
            {detail.createdAt && <p className="text-xs text-slate-500">{formatWib(detail.createdAt, language)}</p>}
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-700">{statusLabel(status)}</span>
        </div>

        {status === 'awaiting_transfer' && (
          <TransferInstructions detail={detail} language={language} copied={copied} onCopy={copy}>
            {detail.canUploadProof && (
              <ProofUploader
                language={language}
                hasProof={detail.hasProof}
                proofUploadedAt={detail.proofUploadedAt}
                uploading={uploading}
                error={uploadError}
                onUpload={(file) => void upload(file)}
              />
            )}
          </TransferInstructions>
        )}
        {status === 'awaiting_shipping_quote' && notice(<Clock className="h-5 w-5 text-sky-700" />, t('orderPage.awaitingQuote.title'), detail.manualQuoteReason === 'rates' ? t('orderPage.awaitingQuote.descriptionRates') : t('orderPage.awaitingQuote.description', { min: detail.manualQuoteMinCopies }), 'border-sky-200 bg-sky-50 text-sky-900')}
        {status === 'pending' && notice(<Clock className="h-5 w-5 text-amber-700" />, t('orderPage.pending.title'), t('orderPage.pending.description'), 'border-amber-200 bg-amber-50 text-amber-900')}
        {(status === 'paid' || status === 'processing') && notice(<CheckCircle2 className="h-5 w-5 text-emerald-700" />, t('orderPage.paid.title'), t('orderPage.paid.description'), 'border-emerald-200 bg-emerald-50 text-emerald-900')}
        {status === 'shipped' && notice(<Package className="h-5 w-5 text-blue-700" />, t('orderPage.shipped.title'), detail.trackingNumber ? t('orderPage.shipped.tracking', { tracking: detail.trackingNumber }) : t('orderPage.paid.description'), 'border-blue-200 bg-blue-50 text-blue-900')}
        {status === 'expired' && (
          <div className="space-y-3">
            {notice(<XCircle className="h-5 w-5 text-rose-700" />, t('orderPage.expired.title'), t('orderPage.expired.description'), 'border-rose-200 bg-rose-50 text-rose-900')}
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">
              <MessageCircle className="h-4 w-4" />{t('orderPage.contactWhatsApp')}
            </a>
          </div>
        )}
        {(status === 'cancelled' || status === 'failed') && notice(<XCircle className="h-5 w-5 text-slate-600" />, t('orderPage.closed.title'), t('orderPage.closed.description'), 'border-slate-200 bg-slate-50 text-slate-800')}

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{t('orderPage.items')}</h3>
            <ul className="space-y-1 text-sm">
              {detail.items.map((item) => (
                <li key={item.bookId} className="flex justify-between gap-3">
                  <span>{item.quantity}× {item.title}</span>
                  <span className="font-mono">{formatRupiahPlain(item.subtotal)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{t('orderPage.shippingAddress')}</h3>
            <p className="text-sm text-slate-700">{detail.buyerName}<br />{detail.shippingAddress}</p>
          </div>
        </div>

        <button type="button" onClick={() => onNavigate('katalog')} className="mt-8 inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />{t('orderPage.backToCatalog')}
        </button>
      </div>
    </div>
  );
};
