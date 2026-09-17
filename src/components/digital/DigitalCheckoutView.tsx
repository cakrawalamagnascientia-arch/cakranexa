import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Library, Lock, ShieldCheck, XCircle } from 'lucide-react';
import { useDigitalCatalog } from '../../hooks/useDigitalCatalog';
import { useAppLanguage, useBookText, useFormatters } from '../../i18n/hooks';
import { useMemberSession } from '../../services/memberSession';
import { createDigitalCheckout, DigitalApiError, getDigitalOrder, type DigitalOrder } from '../../services/digitalApi';
import { openSnapPayment } from '../../services/midtransSnap';
import { goToDigitalCheckout, goToDigitalOrder, goToLibrary, goToLogin } from '../../services/digitalNavigation';
import { resolveImageUrl, handleImageError } from '../../utils/imageUtils';
import { toTitleCase } from '../../utils/formatters';
import { FormatIcon } from './FormatIcon';
import { useDigitalFormatters } from './useDigitalFormatters';
import type { DigitalFormat } from '../../types';

interface DigitalCheckoutViewProps {
  /** Query mentah halaman: items=<id,id> atau order=<nomor pesanan>. */
  query: string;
}

const newIdempotencyKey = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

const FINAL_STATUSES = new Set(['paid', 'failed', 'cancelled', 'expired', 'refunded']);

/**
 * Halaman /digital/checkout: ringkasan pesanan (termasuk tawaran format lain judul yang sama), persetujuan
 * lisensi wajib, pembayaran Midtrans Snap, lalu status pesanan yang dipantau sampai webhook mengonfirmasi.
 * Hak akses dibuat server dari webhook — halaman ini hanya menampilkan statusnya.
 */
export const DigitalCheckoutView: React.FC<DigitalCheckoutViewProps> = ({ query }) => {
  const { t } = useTranslation('digital');
  const language = useAppLanguage();
  const member = useMemberSession();
  const catalog = useDigitalCatalog();
  const bookText = useBookText();
  const { currency } = useFormatters();
  const fmt = useDigitalFormatters();
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const orderNumber = params.get('order');
  const itemIds = useMemo(() => (params.get('items') || '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 10), [params]);

  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<DigitalOrder | null>(null);
  const [popupClosed, setPopupClosed] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const [order, setOrder] = useState<DigitalOrder | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const entries = itemIds.map((id) => catalog.findById(id)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  const allIds = [...itemIds, ...extraIds.filter((id) => !itemIds.includes(id))];
  const selected = allIds.map((id) => catalog.findById(id)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  const purchasable = selected.filter((e) => e.product.availabilityStatus === 'available' && e.product.price > 0);
  const total = purchasable.reduce((sum, e) => sum + e.product.price, 0);

  // Tawaran format lain dari judul yang sama (bundel = dua item dalam satu pesanan).
  const offers = entries.flatMap((entry) => {
    const other = (['ebook', 'audiobook'] as DigitalFormat[]).find((f) => f !== entry.product.format)!;
    const product = catalog.forBook(entry.book.id)[other];
    return product && product.availabilityStatus === 'available' && product.price > 0 && !itemIds.includes(product.id)
      ? [{ product, book: entry.book }]
      : [];
  });

  // Kunci idempotensi baru bila isi pesanan berubah (kunci lama tetap untuk klik ganda pada pesanan yang sama).
  useEffect(() => {
    idempotencyKey.current = newIdempotencyKey();
    setPendingOrder(null);
  }, [allIds.join(',')]);

  // Mode status: pantau pesanan sampai final (webhook Midtrans bisa tiba beberapa detik setelah pembayaran).
  useEffect(() => {
    if (!orderNumber || !member.isLoggedIn) return;
    let active = true;
    let attempts = 0;
    const poll = async () => {
      try {
        const result = await getDigitalOrder(orderNumber);
        if (!active) return;
        setOrder(result.order);
        if (FINAL_STATUSES.has(result.order.status) || attempts > 100) return;
      } catch (err) {
        if (!active) return;
        setOrderError(err instanceof DigitalApiError ? err.code : 'unknown');
        return;
      }
      attempts += 1;
      setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => {
      active = false;
    };
  }, [orderNumber, member.isLoggedIn]);

  const openPayment = async (target: DigitalOrder) => {
    if (!target.snapToken) {
      goToDigitalOrder(target.orderNumber);
      return;
    }
    setPopupClosed(false);
    const opened = await openSnapPayment(target.snapToken, {
      onSuccess: () => goToDigitalOrder(target.orderNumber),
      onPending: () => goToDigitalOrder(target.orderNumber),
      onError: () => setErrorCode('payment_error'),
      onClose: () => setPopupClosed(true)
    });
    if (!opened) {
      if (target.redirectUrl) window.location.assign(target.redirectUrl);
      else setErrorCode('snap_unavailable');
    }
  };

  const pay = async () => {
    if (!licenseAccepted) {
      setErrorCode('license_required');
      return;
    }
    setWorking(true);
    setErrorCode(null);
    try {
      const result = await createDigitalCheckout({ items: purchasable.map((e) => e.product.id), idempotencyKey: idempotencyKey.current, language });
      if (result.order.status !== 'pending') {
        goToDigitalOrder(result.order.orderNumber);
        return;
      }
      setPendingOrder(result.order);
      await openPayment(result.order);
    } catch (err) {
      setErrorCode(err instanceof DigitalApiError ? err.code : 'unknown');
    } finally {
      setWorking(false);
    }
  };

  const errorMessage = (code: string) => {
    const known = ['already_owned', 'product_unavailable', 'suspended', 'payment_unavailable', 'payment_error', 'license_required', 'snap_unavailable', 'order_not_found', 'order_not_saved'];
    return known.includes(code) ? t(`checkout.errors.${code as 'unknown'}`) : t('checkout.errors.unknown');
  };

  const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

  // --- Belum login
  if (!member.isLoading && !member.isLoggedIn) {
    return (
      <div id="digital-checkout-login" className="max-w-xl mx-auto px-4 sm:px-6 py-10 md:py-14 text-left">
        <div className={card}>
          <Lock className="h-6 w-6 text-[#9A7B38]" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">{t('checkout.loginTitle')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('checkout.loginDescription')}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button type="button" id="btn-checkout-login" onClick={() => goToLogin()} className="rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#c5a059] cursor-pointer">{t('account.loginCta')}</button>
            <button type="button" onClick={() => goToLogin(undefined, 'register')} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">{t('account.registerCta')}</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Status pesanan
  if (orderNumber) {
    const status = order?.status;
    const icon = status === 'paid'
      ? <CheckCircle2 className="h-7 w-7 text-emerald-600" />
      : status && ['failed', 'cancelled', 'expired', 'refunded'].includes(status)
        ? <XCircle className="h-7 w-7 text-rose-600" />
        : <Clock className="h-7 w-7 animate-pulse text-[#9A7B38]" />;
    return (
      <div id="digital-checkout-status" className="max-w-xl mx-auto px-4 sm:px-6 py-10 md:py-14 text-left">
        <div className={card}>
          {icon}
          <h1 className="mt-3 text-xl font-bold text-slate-900">{t('checkout.statusTitle')}</h1>
          <p className="mt-1 font-mono text-xs text-slate-500">{t('checkout.orderNumber', { number: orderNumber })}</p>
          {orderError ? (
            <p role="alert" className="mt-4 text-sm text-rose-700">{errorMessage(orderError)}</p>
          ) : (
            <p role="status" id="digital-order-status" data-status={status || 'loading'} className="mt-4 text-sm text-slate-700">
              {status ? t(`checkout.status.${status}`) : t('checkout.status.pending')}
            </p>
          )}
          {order && (
            <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100 text-sm">
              {order.items.map((item) => (
                <li key={item.productId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2"><FormatIcon format={item.format} className="h-4 w-4 text-slate-500" /><span className="[overflow-wrap:anywhere]">{item.title}</span></span>
                  <span className="shrink-0 font-mono text-xs">{currency(item.unitPrice)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {status === 'paid' && (
              <button type="button" id="btn-checkout-open-library" onClick={goToLibrary} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#c5a059] cursor-pointer">
                <Library className="h-4 w-4" />{t('checkout.openLibrary')}
              </button>
            )}
            {status === 'pending' && order?.snapToken && (
              <button type="button" onClick={() => void openPayment(order)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">{t('checkout.resumePayment')}</button>
            )}
            {status && ['failed', 'cancelled', 'expired'].includes(status) && order && (
              <button type="button" onClick={() => goToDigitalCheckout(order.items.map((i) => i.productId))} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">{t('checkout.tryAgain')}</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Keranjang kosong / produk tidak dikenal
  if (entries.length === 0) {
    return (
      <div id="digital-checkout-empty" className="max-w-xl mx-auto px-4 sm:px-6 py-10 md:py-14 text-left">
        <div className={card}>
          <h1 className="text-xl font-bold text-slate-900">{t('checkout.emptyTitle')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('checkout.emptyDescription')}</p>
        </div>
      </div>
    );
  }

  return (
    <div id="digital-checkout-page" className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12 text-left">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('checkout.title')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('checkout.subtitle')}</p>

      <section className={`${card} mt-6`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('checkout.items')}</h2>
        <ul className="mt-4 space-y-3">
          {selected.map(({ product, book }) => {
            const title = toTitleCase(bookText.title(book));
            const available = product.availabilityStatus === 'available' && product.price > 0;
            return (
              <li key={product.id} className="flex items-center gap-3">
                <img
                  src={resolveImageUrl(book.coverBuku, 'book', book.id)}
                  alt=""
                  onError={(e) => handleImageError(e, { title, author: book.author, category: book.category, isbn: book.isbn, year: book.tahunTerbit }, 'book')}
                  className="h-16 w-12 shrink-0 rounded border border-slate-200 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{title}</p>
                  <p className="flex items-center gap-1 text-xs text-slate-500"><FormatIcon format={product.format} className="h-3 w-3" />{fmt.formatLabel(product.format)} · {book.author}</p>
                </div>
                <span className={`shrink-0 font-mono text-sm ${available ? 'font-bold text-slate-900' : 'text-amber-700'}`}>
                  {available ? currency(product.price) : t('checkout.unavailableItem')}
                </span>
              </li>
            );
          })}
        </ul>

        {offers.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            {offers.map(({ product }) => (
              <label key={product.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  id={`checkout-offer-${product.id}`}
                  checked={extraIds.includes(product.id)}
                  onChange={(e) => setExtraIds((prev) => (e.target.checked ? [...prev, product.id] : prev.filter((id) => id !== product.id)))}
                />
                <FormatIcon format={product.format} className="h-4 w-4 text-[#9A7B38]" />
                <span>{t('checkout.bundleOffer', { format: fmt.formatLabel(product.format), price: currency(product.price) })}</span>
              </label>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
          <span className="text-sm font-semibold text-slate-700">{t('checkout.total')}</span>
          <span id="checkout-total" className="text-xl font-bold text-slate-900">{currency(total)}</span>
        </div>
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{t('checkout.licenseTitle')}</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{t('checkout.licenseText')}</p>
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            id="checkout-license"
            className="mt-1"
            checked={licenseAccepted}
            onChange={(e) => {
              setLicenseAccepted(e.target.checked);
              if (e.target.checked && errorCode === 'license_required') setErrorCode(null);
            }}
          />
          <span>{t('checkout.licenseAccept')}</span>
        </label>
      </section>

      {errorCode && (
        <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p>{errorMessage(errorCode)}</p>
          {errorCode === 'already_owned' && (
            <button type="button" onClick={goToLibrary} className="mt-2 font-semibold underline cursor-pointer">{t('checkout.openLibrary')}</button>
          )}
        </div>
      )}
      {popupClosed && pendingOrder && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{t('checkout.popupClosed')}</p>
          <button type="button" onClick={() => void openPayment(pendingOrder)} className="mt-2 font-semibold underline cursor-pointer">{t('checkout.resumePayment')}</button>
        </div>
      )}

      <button
        type="button"
        id="btn-checkout-pay"
        onClick={() => void pay()}
        disabled={working || purchasable.length === 0 || member.isLoading}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-3 text-base font-bold text-slate-950 transition-colors hover:bg-[#c5a059] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
      >
        {working ? t('checkout.paying') : t('checkout.pay', { total: currency(total) })}
      </button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
        {t('checkout.secureNote')}
      </p>
    </div>
  );
};
