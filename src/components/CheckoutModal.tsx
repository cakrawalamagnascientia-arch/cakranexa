import React, { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  X,
  ShieldCheck,
  CreditCard,
  QrCode,
  Building,
  Copy,
  Check,
  ArrowRight,
  Clock,
  Truck,
  Printer,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Receipt,
  MessageSquare
} from 'lucide-react';
import { CartItem, CustomerDetails, PaymentMethod, Order, PaymentSettings } from '../types';
import { generateCakraNexaTrackingNumber } from '../services/shippingService';
import { usePrintCheckoutConfig } from '../hooks/usePrintCheckoutConfig';
import { PrintPaymentMethodPicker } from './PrintPaymentMethodPicker';
import { CourierRateList, DestinationSearch, usePrintShipping } from './ShippingDestinationPicker';
import { regionName, type SignedShippingDestination } from '../data/shippingRates';
import { INDONESIA_PROVINCES } from '../data/shippingZones';
import { getStoredPaymentSettings } from '../services/paymentService';
import { usePublicBankAccounts } from '../hooks/usePublicBankAccounts';
import { resolveCheckoutBankAccounts } from '../utils/checkoutBankAccounts';
import { CheckoutBankAccountList } from './CheckoutBankAccountList';
import { trackInitiateCheckout, trackPurchase } from '../services/trackingService';
import { toTitleCase } from '../utils/formatters';
import { apiClient, ApiError } from '../services/apiClient';
import { openSnapPayment } from '../services/midtransSnap';
import { generateOrderNumber, generateOrderId, nowIso } from '../utils/orderUtils';
import { useBookText, useFormatters } from '../i18n/hooks';
import { getCurrentLanguage } from '../i18n/index';
import { formatCurrency } from '../i18n/format';
import { useManualTransferInstructions, useOrderLabels } from '../i18n/orderLabels';
import { getAccessToken } from '../services/memberSession';
import { useMemberPrintDiscount } from '../hooks/useMemberPrintDiscount';
import { memberPrintPrice, printSubtotal, printUnitPrice } from '../utils/memberPrice';
import { MembershipOfferCard } from './MembershipOfferCard';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onOrderSuccess: (order: Order) => void;
  directBookBuy?: CartItem | null;
  /** Buka halaman /membership dari tawaran keanggotaan setelah pesanan sukses (fase 3 Langkah 6). */
  onOpenMembership?: () => void;
  /** Transfer bank: buka halaman pesanan (/pesanan/<nomor>?t=...) berisi instruksi transfer setelah pesanan dibuat. */
  onOpenOrderPage?: (path: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  onOrderSuccess,
  directBookBuy,
  onOpenMembership,
  onOpenOrderPage
}) => {
  const { t } = useTranslation(['checkout', 'common']);
  const { currency } = useFormatters();
  const bookText = useBookText();
  const { paymentMethodLabel } = useOrderLabels();
  const manualTransferInstructions = useManualTransferInstructions();
  const activeItems = directBookBuy ? [directBookBuy] : items;

  // Stages: 'customer_details' | 'midtrans_snap' | 'order_complete'
  const [step, setStep] = useState<'customer_details' | 'midtrans_snap' | 'order_complete'>('customer_details');

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(() =>
    getStoredPaymentSettings()
  );
  // Rekening transfer manual dari server (CMS → admin_bank_accounts); rekening bawaan dipakai sampai server menjawab.
  const serverBankAccounts = usePublicBankAccounts(isOpen);
  const bankAccounts = resolveCheckoutBankAccounts(serverBankAccounts, paymentSettings.bankAccounts);

  useEffect(() => {
    if (isOpen) {
      setPaymentSettings(getStoredPaymentSettings());

      // Trigger InitiateCheckout tracking event
      if (activeItems.length > 0) {
        trackInitiateCheckout(activeItems, total);
      }
    }
  }, [isOpen]);

  const totalWeightGram = activeItems.reduce(
    (sum, item) => sum + ((item.book.beratGram || 500) * item.quantity),
    0
  );

  const subtotal = activeItems.reduce((sum, item) => sum + (item.book.harga * item.quantity), 0);
  // Harga member buku cetak (fase 3 Langkah 7). Tidak berlaku -> payableSubtotal === subtotal, alur persis seperti biasa.
  // Ongkir tetap dihitung dari subtotal katalog (tidak terpengaruh harga member).
  const memberPricing = useMemberPrintDiscount();
  const payableSubtotal = memberPricing.applies ? printSubtotal(activeItems, memberPricing.percent) : subtotal;
  const hasMemberPrice = payableSubtotal < subtotal;
  const memberUnitPrice = (item: CartItem) =>
    memberPricing.applies ? memberPrintPrice(item.book.harga, item.book.originalHarga, memberPricing.percent) : null;

  // Customer Details Form State — tanpa data contoh (isian bawaan dulu ikut tercatat sebagai pesanan).
  // customer.courier disimpan di data pesanan dan dibaca admin: tetap Bahasa Indonesia ('id').
  const [customer, setCustomer] = useState<CustomerDetails>({
    name: '',
    email: '',
    phone: '',
    address: '',
    province: '',
    city: '',
    district: '',
    postalCode: '',
    courier: '',
    notes: ''
  });

  // Ongkir (server menghitung ulang dan menolak angka yang berbeda): tarif kurir RajaOngkir untuk kecamatan tujuan;
  // saat tidak tersedia, cadangan tabel zona (ongkir estimasi) atau diisi admin. Pesanan besar selalu diisi admin.
  const { config: checkoutConfig, loaded: checkoutConfigLoaded } = usePrintCheckoutConfig(isOpen);
  const shipping = usePrintShipping(checkoutConfig, activeItems, customer, isOpen);
  const {
    courierMode,
    courier: courierShipping,
    manual: manualShipping,
    estimate: shippingEstimate,
    cost: shippingCost,
    label: shippingLabel,
    display: shippingDisplay
  } = shipping;
  const total = payableSubtotal + shippingCost;
  const chooseDestination = (destination: SignedShippingDestination | null) => {
    courierShipping.setDestination(destination);
    setCustomer((prev) => ({
      ...prev,
      destination,
      province: destination ? regionName(destination.province) : '',
      city: destination ? regionName(destination.city) : '',
      district: destination ? regionName(destination.district) : '',
      postalCode: destination?.zipCode ?? ''
    }));
  };

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('bank_transfer');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [copiedVA, setCopiedVA] = useState(false);
  const [copiedBankAcc, setCopiedBankAcc] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  // Metode yang dimatikan admin (payment_routing) tidak bisa dipilih: kembali ke metode aktif pertama.
  useEffect(() => {
    if (!checkoutConfig.methods.includes(selectedMethod)) setSelectedMethod(checkoutConfig.methods[0] ?? 'bank_transfer');
  }, [checkoutConfig.methods, selectedMethod]);

  if (!isOpen) return null;

  const showToast = (type: 'success' | 'info' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer.name || !customer.email || !customer.phone || !customer.address || (!courierMode && (!customer.city || !customer.postalCode))) {
      showToast('error', t('modal.toast.incompleteAddress'));
      return;
    }
    if (courierMode && !courierShipping.destination) {
      showToast('error', t('printCheckout.destination.required'));
      return;
    }
    if (courierMode && courierShipping.state.status === 'ok' && !courierShipping.selected) {
      showToast('error', t('printCheckout.rates.required'));
      return;
    }
    if (!courierMode && !customer.province) {
      showToast('error', t('printCheckout.province.required'));
      return;
    }
    if (isCreatingOrder) return;
    setIsCreatingOrder(true);

    const draftOrder: Order = {
      id: generateOrderId(),
      orderNumber: generateOrderNumber(),
      trackingNumber: generateCakraNexaTrackingNumber(),
      items: activeItems,
      subtotal: payableSubtotal,
      shippingCost,
      total,
      // Tarif kurir: layanan yang dipilih ikut dikirim; server menghitung ulang dan menolak tarif yang berbeda.
      customer: courierMode
        ? {
          ...customer,
          destination: courierShipping.destination,
          courier: courierShipping.selected?.courierName ?? '',
          courierCode: courierShipping.selected?.courier ?? '',
          shippingService: courierShipping.selected?.service ?? ''
        }
        : customer,
      paymentMethod: selectedMethod,
      paymentStatus: selectedMethod === 'bank_transfer' ? 'awaiting_transfer' : 'pending',
      createdAt: nowIso()
    };

    // Harga member: token login hanya dikirim bila harga member berlaku; selain itu permintaan identik seperti biasa.
    const accessToken = memberPricing.applies ? await getAccessToken().catch(() => null) : null;

    // Catat pesanan di backend terlebih dahulu (validasi harga & stok, Snap token asli jika Midtrans aktif)
    let result;
    try {
      result = await apiClient.createOrder(draftOrder, { accessToken });
    } catch (err) {
      setIsCreatingOrder(false);
      showToast('error', err instanceof ApiError ? err.message : t('modal.toast.orderFailed'));
      // Tarif kurir berubah (409): muat ulang tarif agar pembeli memilih ulang.
      if (courierMode && (err as { status?: number }).status === 409) courierShipping.reload();
      return;
    }
    // Pesanan hanya sah bila tercatat di server (instruksi transfer & kode unik dibuat server).
    if (result.paymentMode === 'offline') {
      setIsCreatingOrder(false);
      showToast('error', t('printCheckout.offline'));
      return;
    }

    const newOrder: Order = {
      ...draftOrder,
      subtotal: result.subtotal ?? draftOrder.subtotal,
      shippingCost: result.shippingCost ?? draftOrder.shippingCost,
      total: result.total ?? draftOrder.total,
      paymentMethod: (result.paymentMethod as PaymentMethod | undefined) ?? draftOrder.paymentMethod,
      paymentStatus: result.paymentStatus ?? draftOrder.paymentStatus,
      uniqueCode: result.uniqueCode ?? null,
      uniqueDiscount: result.uniqueDiscount ?? 0,
      paymentDueAt: result.paymentDueAt ?? null,
      orderPath: result.orderPath,
      snapToken: result.snapToken || undefined,
      serverSynced: true,
      paymentMode: result.paymentMode,
      // Bahasa pelanggan: konfirmasi WhatsApp ke pelanggan ditulis dalam bahasa ini.
      language: getCurrentLanguage(),
      ...(result.memberDiscount ? { memberDiscount: result.memberDiscount } : {})
    };
    setCreatedOrder(newOrder);
    setIsCreatingOrder(false);

    // Transfer bank / menunggu ongkir: instruksi ada di halaman pesanan (juga dikirim ke email pembeli).
    if (result.orderPath && !newOrder.snapToken) {
      onOrderSuccess(newOrder);
      onOpenOrderPage?.(result.orderPath);
      return;
    }

    if (newOrder.snapToken) {
      const opened = await openSnapPayment(newOrder.snapToken, {
        onSuccess: () => completeOrder(newOrder, 'pending'),
        onPending: () => completeOrder(newOrder, 'pending'),
        onError: () => showToast('error', t('modal.toast.midtransFailed')),
        onClose: () => showToast('info', t('modal.toast.popupClosed'))
      });
      if (opened) return;
    }

    setStep('customer_details');
    showToast('error', t('modal.toast.onlineUnavailable'));
  };

  const completeOrder = (order: Order, status: 'paid' | 'pending') => {
    const updatedOrder: Order = { ...order, paymentStatus: status };
    setCreatedOrder(updatedOrder);
    onOrderSuccess(updatedOrder);
    if (status === 'paid') trackPurchase(updatedOrder);
    setStep('order_complete');
    showToast('success', status === 'paid'
      ? t('modal.toast.paymentVerified')
      : t('modal.toast.orderRecorded'));
  };

  // Pembayaran simulasi tidak diizinkan untuk pesanan nyata.
  const handleSimulatePayment = (status: 'success' | 'pending' | 'failed') => {
    void status;
    showToast('error', t('modal.toast.simulationDisabled'));
    setStep('customer_details');
  };

  const handleCopyVA = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedVA(true);
    setTimeout(() => setCopiedVA(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0F172A]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 text-left">

      {/* Sleek Notification Toast */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 border animate-in slide-in-from-top-3 ${
          toastMessage.type === 'success'
            ? 'bg-emerald-900 text-emerald-100 border-emerald-500'
            : toastMessage.type === 'error'
            ? 'bg-rose-900 text-rose-100 border-rose-500'
            : 'bg-slate-900 text-[#DFBF64] border-[#DFBF64]/40'
        }`}>
          {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">

        {/* Modal Top Bar */}
        <div className="bg-[#0F172A] text-white px-6 py-4 flex items-center justify-between border-b border-[#DFBF64]/30">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-gradient-to-br from-[#DFBF64] to-[#9A7B38] flex items-center justify-center text-[#0F172A] font-bold text-xs">
              CN
            </div>
            <div>
              <h3 className="font-serif font-bold text-sm sm:text-base text-white">
                {step === 'customer_details' && t('modal.title.customerDetails')}
                {step === 'midtrans_snap' && t('modal.title.midtransSnap')}
                {step === 'order_complete' && t('modal.title.orderComplete')}
              </h3>
              <p className="text-[10px] text-slate-400">
                PT CAKRAWALA MAGNA SCIENTIA
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: CUSTOMER DETAILS FORM */}
        {step === 'customer_details' && (
          <form onSubmit={handleProceedToPayment} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">

            {/* Order Items Preview */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                {t('modal.orderedItems', { itemCount: activeItems.length })}
              </span>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {activeItems.map((item) => (
                  <div key={item.book.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 last:border-0">
                    <div className="flex items-center gap-2 max-w-[70%]">
                      <span className="w-5 h-5 rounded bg-slate-200 text-slate-700 font-mono font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                        {item.quantity}x
                      </span>
                      <span className="font-semibold text-slate-800 truncate" title={toTitleCase(bookText.title(item.book))}>
                        {toTitleCase(bookText.title(item.book))}
                      </span>
                    </div>
                    {memberUnitPrice(item) !== null ? (
                      <span className="text-right">
                        <span className="block font-mono text-[10px] text-slate-400 line-through">{currency(item.book.harga * item.quantity)}</span>
                        <span className="font-mono text-slate-900 font-bold">{currency((memberUnitPrice(item) ?? item.book.harga) * item.quantity)}</span>
                        <span className="block text-[9px] font-semibold text-[#9A7B38]">{t('common:memberPrice')}</span>
                      </span>
                    ) : (
                      <span className="font-mono text-slate-900 font-bold">
                        {currency(item.book.harga * item.quantity)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Input Form Fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {t('modal.form.fullName.label')}
                  </label>
                  <input
                    type="text"
                    required
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder={t('modal.form.fullName.placeholder')}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {t('modal.form.email.label')}
                  </label>
                  <input
                    type="email"
                    required
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder={t('modal.form.email.placeholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {t('modal.form.phone.label')}
                  </label>
                  <input
                    type="tel"
                    required
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder="0812xxxxxxxx"
                  />
                </div>
                {!courierMode && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {t('modal.form.city.label')}
                  </label>
                  <input
                    type="text"
                    required
                    value={customer.city}
                    onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder="Jakarta Pusat"
                  />
                </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {t('modal.form.address.label')}
                </label>
                <textarea
                  required
                  rows={2}
                  value={customer.address}
                  onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                  placeholder={t('modal.form.address.placeholder')}
                />
              </div>

              {courierMode ? (
                <div className="space-y-3">
                  <DestinationSearch
                    value={courierShipping.destination}
                    onChange={chooseDestination}
                    onUnavailable={shipping.useManualAddress}
                    labelClassName="text-xs font-semibold text-slate-700 block mb-1"
                    inputClassName="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                  />
                  {courierShipping.destination && (
                    <CourierRateList
                      state={courierShipping.state}
                      selected={courierShipping.selected}
                      onSelect={courierShipping.select}
                      onRetry={courierShipping.reload}
                      minCopies={checkoutConfig.manualQuoteMinCopies}
                    />
                  )}
                </div>
              ) : (<>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {t('printCheckout.province.label')}
                  </label>
                  <select
                    required
                    value={customer.province}
                    onChange={(e) => setCustomer({ ...customer, province: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059] bg-white font-medium"
                  >
                    <option value="">{t('printCheckout.province.placeholder')}</option>
                    {INDONESIA_PROVINCES.map((province) => (
                      <option key={province} value={province}>{province}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {t('modal.form.postalCode.label')} *
                  </label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    value={customer.postalCode}
                    onChange={(e) => setCustomer({ ...customer, postalCode: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder="10430"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Kurir belum ditetapkan karena tarif RajaOngkir belum tersedia. Admin akan menentukan ekspedisi dan ongkir sebelum tagihan dikirim.</p>
              </>)}
            </div>

            {/* Total Summary */}
            <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2 text-xs">
              {hasMemberPrice ? (
                <div className="flex justify-between text-slate-400">
                  <span>
                    {t('modal.summary.subtotal')}
                    <span className="ml-1.5 text-[9px] font-semibold text-[#DFBF64] bg-[#DFBF64]/10 border border-[#DFBF64]/40 px-1 rounded">{t('common:memberPrice')}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[10px] text-slate-500 line-through">{currency(subtotal)}</span>
                    <span className="font-mono text-white">{currency(payableSubtotal)}</span>
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-slate-400">
                  <span>{t('modal.summary.subtotal')}</span>
                  <span className="font-mono text-white">{currency(subtotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>
                  {t('modal.summary.shippingCost')}
                  {shippingLabel && <span className="block text-[10px] text-slate-500">{shippingLabel}</span>}
                </span>
                <span className="font-mono text-white">
                  {shippingDisplay}
                </span>
              </div>
              {manualShipping && !courierMode && (
                <p className="text-[10px] text-slate-400">{shipping.manualNote}</p>
              )}
              {shippingEstimate && !courierMode && (
                <p className="text-[10px] text-amber-300" data-shipping-estimate>{t('printCheckout.estimateNote')}</p>
              )}
              <div className="pt-2 border-t border-white/20 flex justify-between text-sm font-bold text-[#DFBF64]">
                <span>{selectedMethod === 'bank_transfer' && checkoutConfig.uniqueCodeEnabled && !manualShipping ? t('printCheckout.totalBeforeCode') : t('modal.summary.total')}</span>
                <span className="font-mono text-base">{currency(total)}</span>
              </div>
              {selectedMethod === 'bank_transfer' && checkoutConfig.uniqueCodeEnabled && !manualShipping && (
                <p className="text-[10px] text-slate-400">{t('printCheckout.uniqueCodeNote')}</p>
              )}
            </div>

            <PrintPaymentMethodPicker
              methods={checkoutConfig.methods}
              selected={selectedMethod}
              onSelect={setSelectedMethod}
              transferDueHours={checkoutConfig.transferDueHours}
            />

            {/* Submit CTA */}
            <button
              id="btn-submit-order-snap"
              type="submit"
              disabled={isCreatingOrder || !checkoutConfigLoaded || (courierMode && courierShipping.state.status === 'loading')}
              className="disabled:opacity-60 disabled:cursor-wait w-full py-3.5 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#c5a059] text-[#0F172A] font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{selectedMethod === 'bank_transfer' ? t('printCheckout.submit') : t('modal.buyNow')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* STEP 2: MIDTRANS SNAP POPUP SIMULATOR */}
        {step === 'midtrans_snap' && createdOrder && (
          <div className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">

            {/* Midtrans Header Bar */}
            <div className="flex items-center justify-between bg-gradient-to-r from-[#002D62] to-[#0A4D9A] text-white p-4 rounded-xl shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-white text-[#002D62] font-black text-xs flex items-center justify-center font-mono">
                  M
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">{t('modal.snap.header')}</div>
                  <div className="text-[10px] text-slate-200 font-mono">{t('modal.snap.token', { token: createdOrder.snapToken })}</div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-300 block">{t('modal.snap.totalDue')}</span>
                <span className="text-base font-bold text-[#DFBF64] font-mono">
                  {currency(createdOrder.total)}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                {t('modal.snap.chooseMethod')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  ...(paymentSettings.enableMidtransVA ? [
                    { id: 'bca_va', label: paymentMethodLabel('bca_va'), icon: Building },
                    { id: 'mandiri_bill', label: paymentMethodLabel('mandiri_bill', 'short'), icon: Building },
                    { id: 'bni_va', label: paymentMethodLabel('bni_va'), icon: Building },
                    { id: 'bri_va', label: paymentMethodLabel('bri_va'), icon: Building },
                  ] : []),
                  ...(paymentSettings.enableQris ? [
                    { id: 'qris', label: paymentMethodLabel('qris'), icon: QrCode },
                  ] : []),
                  ...(paymentSettings.enableManualTransfer ? [
                    { id: 'manual_mandiri', label: paymentMethodLabel('manual_mandiri'), icon: Building },
                  ] : []),
                  ...(paymentSettings.enableCreditCard ? [
                    { id: 'credit_card', label: paymentMethodLabel('credit_card'), icon: CreditCard },
                  ] : []),
                ].map((m) => {
                  const Icon = m.icon;
                  const isSelected = selectedMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMethod(m.id as PaymentMethod)}
                      className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#002D62] bg-[#002D62]/5 text-[#002D62] font-semibold ring-1 ring-[#002D62]'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-[#C5A059]" />
                      <span className="text-xs">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Method Details */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 text-xs space-y-4">

              {/* If Manual Bank Transfer */}
              {selectedMethod === 'manual_mandiri' ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-slate-500 uppercase font-bold text-[10px] block">{t('bank.officialAccount')}</span>
                      <span className="text-xs font-bold text-slate-900">PT CAKRAWALA MAGNA SCIENTIA</span>
                    </div>
                    <span className="text-[10px] text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-semibold">
                      {t('modal.snap.companyAccount')}
                    </span>
                  </div>
                  <CheckoutBankAccountList
                    accounts={bankAccounts}
                    copiedId={copiedBankAcc}
                    onCopy={(acc) => {
                      navigator.clipboard?.writeText(acc.accountNumber.replace(/[^0-9]/g, ''));
                      setCopiedBankAcc(acc.id);
                      setTimeout(() => setCopiedBankAcc(null), 2000);
                    }}
                  />
                  <div className="text-slate-700 text-[11px] bg-white p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                    <strong className="text-slate-900 font-semibold block mb-0.5">{t('modal.snap.instructionsLabel')}</strong>
                    {manualTransferInstructions(paymentSettings.manualTransferInstructions)}
                  </div>
                  {paymentSettings.adminNotificationWhatsapp && (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        <Trans
                          t={t}
                          i18nKey="bank.whatsappFinance"
                          values={{ phone: paymentSettings.adminNotificationWhatsapp }}
                          components={{ strong: <strong /> }}
                        />
                      </span>
                    </div>
                  )}
                </div>
              ) : selectedMethod.includes('va') || selectedMethod === 'mandiri_bill' ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 uppercase font-medium text-[11px]">{t('modal.snap.vaNumber')}</span>
                    <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-mono">
                      {t('modal.snap.vaDeadline')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-300 font-mono text-base font-bold text-[#0F172A]">
                    <span>{createdOrder.vaNumber}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyVA(createdOrder.vaNumber || '')}
                      className="text-xs text-[#002D62] font-sans font-medium flex items-center gap-1 hover:underline"
                    >
                      {copiedVA ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedVA ? t('bank.copied') : t('modal.snap.copyNumber')}</span>
                    </button>
                  </div>
                  <p className="text-slate-500 leading-relaxed text-[11px]">
                    {t('modal.snap.vaSteps')}
                  </p>
                </div>
              ) : selectedMethod === 'qris' ? (
                /* QRIS Mode */
                <div className="text-center space-y-3 py-2">
                  <span className="text-[11px] font-bold text-slate-700 block uppercase">
                    {t('modal.snap.qrisScan', { merchant: paymentSettings.qrisMerchantName })}
                  </span>
                  <div className="w-44 h-44 mx-auto bg-white p-3 rounded-xl border-2 border-slate-800 shadow-md flex items-center justify-center">
                    <div className="w-full h-full bg-slate-900 rounded flex flex-col items-center justify-center text-white p-2">
                      <QrCode className="w-24 h-24 text-[#DFBF64]" />
                      <span className="text-[8px] font-mono mt-1 text-slate-300">NMID: {paymentSettings.qrisNmid}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {t('modal.snap.qrisExpiry')}
                  </p>
                </div>
              ) : (
                /* Credit Card Mode */
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">{t('modal.snap.cardNumber')}</label>
                    <input
                      type="text"
                      readOnly
                      value="4111 2222 3333 4444"
                      className="w-full p-2 bg-white rounded border border-slate-300 font-mono text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">{t('modal.snap.cardExpiry')}</label>
                      <input
                        type="text"
                        readOnly
                        value="12/28"
                        className="w-full p-2 bg-white rounded border border-slate-300 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">CVV</label>
                      <input
                        type="text"
                        readOnly
                        value="889"
                        className="w-full p-2 bg-white rounded border border-slate-300 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Sandbox Simulation Buttons */}
            <div className="pt-2 space-y-2 border-t border-slate-200">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                {t('modal.snap.simulatorActions')}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  id="btn-simulate-success"
                  type="button"
                  onClick={() => handleSimulatePayment('success')}
                  className="py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t('modal.snap.simulateSuccess')}</span>
                </button>

                <button
                  id="btn-simulate-pending"
                  type="button"
                  onClick={() => handleSimulatePayment('pending')}
                  className="py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t('modal.snap.simulatePending')}</span>
                </button>

                <button
                  id="btn-simulate-failed"
                  type="button"
                  onClick={() => handleSimulatePayment('failed')}
                  className="py-2.5 px-3 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{t('modal.snap.simulateCancel')}</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* STEP 3: OFFICIAL INVOICE & RECEIPT */}
        {step === 'order_complete' && createdOrder && (
          <div className="p-6 space-y-6 max-h-[85vh] overflow-y-auto text-xs">

            {/* Success Banner */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 stroke-[3]" />
              </div>
              <div>
                <h4 className="font-bold text-emerald-900 text-sm">
                  {t('modal.complete.successTitle')}
                </h4>
                <p className="text-emerald-700 text-[11px]">
                  {t('modal.complete.successDescription')}
                </p>
              </div>
            </div>

            {/* Official Tax Invoice Sheet (PT Cakrawala Magna Scientia) */}
            <div className="border border-slate-300 rounded-xl p-5 bg-white space-y-4 shadow-sm print:m-0 print:border-none">

              {/* Invoice Header */}
              <div className="flex justify-between items-start pb-4 border-b border-slate-200">
                <div>
                  <h3 className="font-serif font-bold text-base text-slate-900">
                    PT CAKRAWALA MAGNA SCIENTIA
                  </h3>
                  <p className="text-slate-500 text-[11px]">
                    {t('modal.complete.brand')}
                  </p>
                  <p className="text-slate-400 text-[10px]">
                    {t('modal.complete.companyInfo', { npwp: '01.889.324.5-021.000' })}
                  </p>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold uppercase text-[10px]">
                    {t('modal.complete.paidBadge')}
                  </span>
                  <div className="font-mono font-bold text-slate-900 text-xs mt-1">
                    {createdOrder.orderNumber}
                  </div>
                  <div className="text-slate-400 text-[10px]">
                    {createdOrder.createdAt}
                  </div>
                </div>
              </div>

              {/* Customer & Shipping Summary */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200 text-[11px]">
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">{t('modal.complete.buyer')}</span>
                  <strong className="text-slate-900 block">{createdOrder.customer.name}</strong>
                  <span className="text-slate-600 block">{createdOrder.customer.email}</span>
                  <span className="text-slate-600 block">{createdOrder.customer.phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">{t('modal.complete.shippingAddress')}</span>
                  <span className="text-slate-700 block">{createdOrder.customer.address}</span>
                  <span className="text-slate-700 block">{createdOrder.customer.city}, {createdOrder.customer.postalCode}</span>
                  <span className="text-emerald-700 font-medium block mt-0.5">{createdOrder.customer.courier}</span>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                      <th className="py-2">{t('modal.complete.table.title')}</th>
                      <th className="py-2 text-center">{t('modal.complete.table.qty')}</th>
                      <th className="py-2 text-right">{t('modal.complete.table.unitPrice')}</th>
                      <th className="py-2 text-right">{t('modal.complete.table.amount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {createdOrder.items.map((item) => (
                      <tr key={item.book.id}>
                        <td className="py-2.5 font-medium text-slate-900 pr-2">
                          <div>{toTitleCase(bookText.title(item.book))}</div>
                          <span className="text-[10px] text-slate-400 font-mono">ISBN: {item.book.isbn}</span>
                        </td>
                        <td className="py-2.5 text-center font-mono">{item.quantity}</td>
                        {/* Harga satuan dari persen yang dikonfirmasi server; tanpa memberDiscount = harga katalog. */}
                        <td className="py-2.5 text-right font-mono">
                          {currency(printUnitPrice(item.book, createdOrder.memberDiscount?.percent ?? 0))}
                          {printUnitPrice(item.book, createdOrder.memberDiscount?.percent ?? 0) < item.book.harga ? (
                            <span className="block text-[9px] font-sans font-semibold text-[#9A7B38]">{t('common:memberPrice')}</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-slate-900">
                          {currency(printUnitPrice(item.book, createdOrder.memberDiscount?.percent ?? 0) * item.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-right">
                <div className="flex justify-between text-slate-500">
                  <span>{t('modal.complete.subtotal')}</span>
                  <span className="font-mono">{currency(createdOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>{t('modal.complete.shippingCost')}</span>
                  <span className="font-mono">{currency(createdOrder.shippingCost)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-100">
                  <span>{t('modal.complete.total')}</span>
                  <span className="font-mono text-[#9A7B38]">{currency(createdOrder.total)}</span>
                </div>
              </div>

            </div>

            {/* Tawaran keanggotaan (fase 3 Langkah 6): maks. sekali per 30 hari, tidak untuk anggota aktif. */}
            {onOpenMembership && <MembershipOfferCard onOpenMembership={onOpenMembership} />}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>{t('modal.complete.printInvoice')}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-[#DFBF64] font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>{t('modal.complete.backToCatalog')}</span>
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
