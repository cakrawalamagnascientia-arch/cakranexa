import React, { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  CartItem,
  Order,
  CustomerDetails,
  PaymentMethod
} from '../types';
import { PrintPaymentMethodPicker } from './PrintPaymentMethodPicker';
import { CourierRateList, DestinationSearch, usePrintShipping } from './ShippingDestinationPicker';
import { regionName, type SignedShippingDestination } from '../data/shippingRates';
import { usePrintCheckoutConfig } from '../hooks/usePrintCheckoutConfig';
import { INDONESIA_PROVINCES } from '../data/shippingZones';
import { notificationService } from '../services/NotificationService';
import { trackInitiateCheckout, trackPurchase } from '../services/trackingService';
import { toTitleCase } from '../utils/formatters';
import { generateCakraNexaTrackingNumber, getStoredShippingMethods } from '../services/shippingService';
import { apiClient, ApiError } from '../services/apiClient';
import { openSnapPayment } from '../services/midtransSnap';
import { getStoredPaymentSettings } from '../services/paymentService';
import { generateOrderNumber, generateOrderId, nowIso } from '../utils/orderUtils';
import { useBookText, useCategoryLabel, useFormatters } from '../i18n/hooks';
import { getCurrentLanguage } from '../i18n/index';
import { useOrderLabels, useShippingMethodText } from '../i18n/orderLabels';
import { getAccessToken } from '../services/memberSession';
import { useMemberPrintDiscount } from '../hooks/useMemberPrintDiscount';
import { memberPrintPrice, printSubtotal } from '../utils/memberPrice';
import { MembershipOfferCard } from './MembershipOfferCard';
import {
  ArrowLeft,
  ShieldCheck,
  CreditCard,
  Truck,
  User,
  MapPin,
  FileText,
  CheckCircle2,
  ExternalLink,
  Printer,
  MessageSquare,
  Lock,
  Package,
  QrCode
} from 'lucide-react';

interface CheckoutFormProps {
  cartItems: CartItem[];
  onOrderCompleted: (order: Order) => void;
  onCancel: () => void;
  /** Buka halaman /membership dari tawaran keanggotaan setelah pesanan sukses (fase 3 Langkah 6). */
  onOpenMembership?: () => void;
  /** Transfer bank: buka halaman pesanan (/pesanan/<nomor>?t=...) berisi instruksi transfer setelah pesanan dibuat. */
  onOpenOrderPage?: (path: string) => void;
}

export const CheckoutForm: React.FC<CheckoutFormProps> = ({
  cartItems,
  onOrderCompleted,
  onCancel,
  onOpenMembership,
  onOpenOrderPage
}) => {
  const { t } = useTranslation(['checkout', 'common']);
  const { currency } = useFormatters();
  const bookText = useBookText();
  const categoryLabel = useCategoryLabel();
  const { statusLabel } = useOrderLabels();
  const shippingMethodText = useShippingMethodText();
  // Step state: 'form' | 'midtrans_simulation' | 'success'
  const [checkoutStep, setCheckoutStep] = useState<'form' | 'midtrans_simulation' | 'success'>('form');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const adminWhatsApp = getStoredPaymentSettings().adminNotificationWhatsapp;

  // Customer & Shipping Form state
  const [customer, setCustomer] = useState<CustomerDetails>({
    name: '',
    phone: '',
    email: '',
    address: '',
    province: '',
    city: '',
    district: '',
    postalCode: '',
    courier: '',
    notes: ''
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Shipping & Courier state
  const totalWeightGram = cartItems.reduce(
    (acc, item) => acc + (item.book.beratGram || 480) * item.quantity,
    0
  );
  // Tanpa tarif kurir (zona / ongkir diisi admin) ekspedisi pilihan hanya preferensi untuk admin.
  const courierOptions = getStoredShippingMethods().filter((m) => m.isActive);
  const [selectedCourierId, setSelectedCourierId] = useState<string>(() => courierOptions[0]?.id ?? '');
  const selectedCourier = courierOptions.find((m) => m.id === selectedCourierId) ?? courierOptions[0];
  const { config: checkoutConfig, loaded: checkoutConfigLoaded } = usePrintCheckoutConfig();
  const copies = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  // Ongkir (server menghitung ulang): tarif kurir RajaOngkir untuk kecamatan tujuan; saat tidak tersedia, cadangan
  // tabel zona (ongkir estimasi) atau diisi admin, sesuai pengaturan. Pesanan besar selalu diisi admin.
  const shipping = usePrintShipping(checkoutConfig, cartItems, customer);
  const {
    courierMode,
    courier: courierShipping,
    manual: manualShipping,
    estimate: shippingEstimate,
    cost: shippingCost,
    label: shippingLabel,
    display: shippingDisplay
  } = shipping;
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

  // Metode pembayaran dari payment_routing (bawaan: hanya transfer bank ke rekening PT).
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  useEffect(() => {
    if (!checkoutConfig.methods.includes(paymentMethod)) setPaymentMethod(checkoutConfig.methods[0] ?? 'bank_transfer');
  }, [checkoutConfig.methods, paymentMethod]);

  // Cart calculations
  const subtotal = cartItems.reduce(
    (acc, item) => acc + item.book.harga * item.quantity,
    0
  );
  // Harga member buku cetak (fase 3 Langkah 7). Tidak berlaku -> payableSubtotal === subtotal, alur persis seperti biasa.
  // Ongkir tetap dihitung dari subtotal katalog (tidak terpengaruh harga member).
  const memberPricing = useMemberPrintDiscount();
  const payableSubtotal = memberPricing.applies ? printSubtotal(cartItems, memberPricing.percent) : subtotal;
  const hasMemberPrice = payableSubtotal < subtotal;
  const memberUnitPrice = (item: CartItem) =>
    memberPricing.applies ? memberPrintPrice(item.book.harga, item.book.originalHarga, memberPricing.percent) : null;
  const grandTotal = payableSubtotal + shippingCost;

  // Fire InitiateCheckout tracking event on mount
  useEffect(() => {
    if (cartItems.length > 0) {
      trackInitiateCheckout(cartItems, grandTotal);
    }
  }, []);

  // Label kurir pilihan disimpan ke pesanan untuk admin: memakai data kurir apa adanya (Bahasa Indonesia).
  useEffect(() => {
    if (selectedCourier) setCustomer(prev => ({ ...prev, courier: `${selectedCourier.name} - ${selectedCourier.service}` }));
  }, [selectedCourier?.id]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!customer.name.trim()) errors.name = t('form.errors.nameRequired');
    if (!customer.phone.trim()) errors.phone = t('form.errors.phoneRequired');
    if (!customer.email.trim() || !customer.email.includes('@')) errors.email = t('form.errors.emailRequired');
    if (!customer.address.trim()) errors.address = t('form.errors.addressRequired');
    if (courierMode) {
      if (!courierShipping.destination) errors.destination = t('printCheckout.destination.required');
      else if (courierShipping.state.status === 'ok' && !courierShipping.selected) errors.courier = t('printCheckout.rates.required');
    } else {
      if (!customer.city.trim()) errors.city = t('form.errors.cityRequired');
      if (!customer.postalCode.trim()) errors.postalCode = t('form.errors.postalCodeRequired');
      if (!customer.province) errors.province = t('printCheckout.province.required');
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const orderNumber = generateOrderNumber();
    const autoTrackingNumber = generateCakraNexaTrackingNumber();

    const draftOrder: Order = {
      id: generateOrderId(),
      orderNumber,
      trackingNumber: autoTrackingNumber,
      items: [...cartItems],
      subtotal: payableSubtotal,
      shippingCost,
      total: grandTotal,
      totalWeightGram,
      // Tarif kurir: layanan yang dipilih ikut dikirim; server menghitung ulang dan menolak tarif yang berbeda.
      customer: courierMode
        ? {
          ...customer,
          destination: courierShipping.destination,
          courier: courierShipping.selected?.courierName ?? '',
          courierCode: courierShipping.selected?.courier ?? '',
          shippingService: courierShipping.selected?.service ?? ''
        }
        : { ...customer },
      paymentMethod,
      paymentStatus: paymentMethod === 'bank_transfer' ? 'awaiting_transfer' : 'pending',
      whatsappDispatched: false,
      emailDispatched: false,
      createdAt: nowIso()
    };

    // Harga member: token login hanya dikirim bila harga member berlaku; selain itu permintaan identik seperti biasa.
    const accessToken = memberPricing.applies ? await getAccessToken().catch(() => null) : null;

    // 1) Catat pesanan di backend: validasi harga/stok di server & (jika Midtrans aktif) buat Snap token asli
    let serverResult;
    try {
      serverResult = await apiClient.createOrder(draftOrder, { accessToken });
    } catch (err) {
      setIsSubmitting(false);
      setSubmitError(err instanceof ApiError ? err.message : t('form.errors.orderFailed'));
      // Tarif kurir berubah (409): muat ulang tarif agar pembeli memilih ulang.
      if (courierMode && (err as { status?: number }).status === 409) courierShipping.reload();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Pesanan hanya sah bila tercatat di server (instruksi transfer & kode unik dibuat server).
    if (serverResult.paymentMode === 'offline') {
      setIsSubmitting(false);
      setSubmitError(t('printCheckout.offline'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const newOrder: Order = {
      ...draftOrder,
      // total resmi dihitung server (harga, ongkir zona, kode unik)
      subtotal: serverResult.subtotal ?? draftOrder.subtotal,
      shippingCost: serverResult.shippingCost ?? draftOrder.shippingCost,
      total: serverResult.total ?? draftOrder.total,
      paymentMethod: (serverResult.paymentMethod as PaymentMethod | undefined) ?? draftOrder.paymentMethod,
      paymentStatus: serverResult.paymentStatus ?? draftOrder.paymentStatus,
      uniqueCode: serverResult.uniqueCode ?? null,
      uniqueDiscount: serverResult.uniqueDiscount ?? 0,
      paymentDueAt: serverResult.paymentDueAt ?? null,
      orderPath: serverResult.orderPath,
      snapToken: serverResult.snapToken || undefined,
      serverSynced: true,
      paymentMode: serverResult.paymentMode,
      // Bahasa pelanggan: konfirmasi WhatsApp ke pelanggan ditulis dalam bahasa ini.
      language: getCurrentLanguage(),
      ...(serverResult.memberDiscount ? { memberDiscount: serverResult.memberDiscount } : {})
    };
    setCreatedOrder(newOrder);

    // 2) Transfer bank / menunggu ongkir -> halaman pesanan berisi instruksi transfer (juga dikirim ke email pembeli).
    if (serverResult.orderPath && !newOrder.snapToken) {
      setIsSubmitting(false);
      onOrderCompleted(newOrder);
      onOpenOrderPage?.(serverResult.orderPath);
      return;
    }

    // 3) Midtrans hanya boleh dilanjutkan dengan Snap token dari backend.
    if (newOrder.snapToken && newOrder.snapToken !== 'SIMULATION') {
      const opened = await openSnapPayment(newOrder.snapToken, {
        onSuccess: () => finalizeOrder(newOrder, 'pending'),
        onPending: () => finalizeOrder(newOrder, 'pending'),
        onError: () => {
          setIsSubmitting(false);
          setSubmitError(t('form.errors.midtransFailed'));
        },
        onClose: () => setIsSubmitting(false)
      });
      if (opened) return;
    }

    setIsSubmitting(false);
    setSubmitError(t('form.errors.onlineUnavailable'));
    setCheckoutStep('form');
  };

  /** Status final pembayaran Midtrans tetap ditentukan oleh webhook server. */
  const finalizeOrder = async (order: Order, status: 'paid' | 'pending') => {
    const finalizedOrder: Order = { ...order, paymentStatus: status };
    await notificationService.dispatchWhatsAppToAdmin(finalizedOrder);
    if (status === 'paid') trackPurchase(finalizedOrder);
    setCreatedOrder(finalizedOrder);
    setIsSubmitting(false);
    setCheckoutStep('success');
    onOrderCompleted({ ...finalizedOrder, whatsappDispatched: true, emailDispatched: true });
  };

  // Tidak ada pembayaran simulasi di lingkungan produksi.
  const handleCompleteMidtransPayment = async () => {
    setSubmitError(t('form.errors.simulationDisabled'));
    setCheckoutStep('form');
  };

  return (
    <div className="bg-slate-50 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">

        {/* Header Navigation */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-[#0F172A] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#D4AF37]" />
            <span>{t('common:back')} - {t('common:cart')}</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-mono font-semibold text-slate-500">
              {t('form.secureSystem')}
            </span>
          </div>
        </div>

        {/* STEP 1: CHECKOUT FORM */}
        {submitError && checkoutStep === 'form' && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 text-red-700 text-sm font-semibold px-4 py-3 flex items-start gap-2">
            <span className="mt-0.5">⚠️</span>
            <span>{submitError}</span>
          </div>
        )}

        {checkoutStep === 'form' && (
          <form onSubmit={handleSubmitOrder} className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* LEFT COLUMN: Customer, Shipping & Payment (7 Cols) */}
            <div className="lg:col-span-7 space-y-8">

              {/* SECTION A: Customer & Shipping Details */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-lg bg-[#0F172A] text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      {t('form.sections.customer.title')}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t('form.sections.customer.subtitle')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {t('form.fields.name.label')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('form.fields.name.placeholder')}
                      value={customer.name}
                      onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37] ${
                        formErrors.name ? 'border-red-500 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.name && <p className="text-[11px] text-red-500 mt-1">{formErrors.name}</p>}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {t('form.fields.phone.label')}
                    </label>
                    <input
                      type="tel"
                      placeholder="081234567890"
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37] ${
                        formErrors.phone ? 'border-red-500 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.phone && <p className="text-[11px] text-red-500 mt-1">{formErrors.phone}</p>}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {t('form.fields.email.label')}
                    </label>
                    <input
                      type="email"
                      placeholder={t('form.fields.email.placeholder')}
                      value={customer.email}
                      onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37] ${
                        formErrors.email ? 'border-red-500 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.email && <p className="text-[11px] text-red-500 mt-1">{formErrors.email}</p>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {t('form.fields.address.label')}
                    </label>
                    <textarea
                      rows={2}
                      placeholder={t('form.fields.address.placeholder')}
                      value={customer.address}
                      onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37] ${
                        formErrors.address ? 'border-red-500 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.address && <p className="text-[11px] text-red-500 mt-1">{formErrors.address}</p>}
                  </div>

                  {courierMode ? (
                    <div className="sm:col-span-2">
                      <DestinationSearch
                        value={courierShipping.destination}
                        onChange={chooseDestination}
                        onUnavailable={shipping.useManualAddress}
                        error={formErrors.destination}
                        labelClassName="text-xs font-bold text-slate-700 block mb-1"
                        inputClassName="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      />
                    </div>
                  ) : (<>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {t('form.fields.province.label')}
                    </label>
                    <select
                      value={customer.province}
                      onChange={(e) => setCustomer({ ...customer, province: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37] ${
                        formErrors.province ? 'border-red-500 bg-red-50/20' : 'border-slate-200'
                      }`}
                    >
                      <option value="">{t('printCheckout.province.placeholder')}</option>
                      {INDONESIA_PROVINCES.map((province) => (
                        <option key={province} value={province}>{province}</option>
                      ))}
                    </select>
                    {formErrors.province && <p className="text-[11px] text-red-500 mt-1">{formErrors.province}</p>}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {t('form.fields.city.label')}
                    </label>
                    <input
                      type="text"
                      placeholder="Jakarta Pusat"
                      value={customer.city}
                      onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37] ${
                        formErrors.city ? 'border-red-500 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.city && <p className="text-[11px] text-red-500 mt-1">{formErrors.city}</p>}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {t('form.fields.district.label')}
                    </label>
                    <input
                      type="text"
                      placeholder="Senen"
                      value={customer.district}
                      onChange={(e) => setCustomer({ ...customer, district: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {t('form.fields.postalCode.label')}
                    </label>
                    <input
                      type="text"
                      placeholder="10410"
                      value={customer.postalCode}
                      onChange={(e) => setCustomer({ ...customer, postalCode: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37] font-mono ${
                        formErrors.postalCode ? 'border-red-500 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.postalCode && <p className="text-[11px] text-red-500 mt-1">{formErrors.postalCode}</p>}
                  </div>
                  </>)}

                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {t('form.fields.notes.label')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('form.fields.notes.placeholder')}
                      value={customer.notes}
                      onChange={(e) => setCustomer({ ...customer, notes: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION B: Logistics & Courier Selection */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-lg bg-[#0F172A] text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      {t('form.sections.shipping.title')}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t('form.sections.shipping.subtitle')}
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3 text-xs">
                  {courierMode ? (
                    <CourierRateList
                      state={courierShipping.state}
                      selected={courierShipping.selected}
                      onSelect={courierShipping.select}
                      onRetry={courierShipping.reload}
                      minCopies={checkoutConfig.manualQuoteMinCopies}
                    />
                  ) : (<>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <span className="font-semibold text-slate-700">
                      {shippingLabel ?? t('form.summary.shippingCost')}
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {shippingDisplay}
                    </span>
                  </div>
                  {manualShipping && <p className="text-slate-500">{shipping.manualNote}</p>}
                  {shippingEstimate && <p className="text-amber-700" data-shipping-estimate>{t('printCheckout.estimateNote')}</p>}
                  <label className="block">
                    <span className="mb-1 block font-bold text-slate-700">{t('printCheckout.courierPreference')}</span>
                    <select
                      value={selectedCourierId}
                      onChange={(e) => setSelectedCourierId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    >
                      {courierOptions.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({shippingMethodText(m).service})</option>
                      ))}
                    </select>
                  </label>
                  </>)}
                  {formErrors.courier && <p className="text-[11px] text-red-500">{formErrors.courier}</p>}
                </div>
              </div>

              {/* SECTION C: Payment Method Selection */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-lg bg-[#0F172A] text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                    3
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      {t('common:paymentMethod')}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t('form.sections.payment.subtitle')}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <PrintPaymentMethodPicker
                    methods={checkoutConfig.methods}
                    selected={paymentMethod}
                    onSelect={setPaymentMethod}
                    transferDueHours={checkoutConfig.transferDueHours}
                  />
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: Order Summary & Checkout Trigger (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs sticky top-24">
                <h3 className="font-serif font-bold text-lg text-slate-900 pb-3 border-b border-slate-100">
                  {t('form.summary.title')}
                </h3>

                {/* Book Items List */}
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto my-3 pr-1">
                  {cartItems.map((item) => (
                    <div key={item.book.id} className="py-3 flex gap-3">
                      <img
                        src={item.book.coverBuku}
                        alt={bookText.title(item.book)}
                        className="w-12 h-16 object-cover rounded shadow-xs flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] uppercase font-bold text-[#D4AF37]">
                          {categoryLabel(item.book.category)}
                        </span>
                        <h4 className="text-xs font-semibold text-slate-900 line-clamp-2 leading-snug">
                          {toTitleCase(bookText.title(item.book))}
                        </h4>
                        {memberUnitPrice(item) !== null ? (
                          <>
                            <div className="flex items-center justify-between mt-1 text-xs">
                              <span className="text-slate-500 font-mono">
                                {item.quantity} x <span className="line-through text-slate-400">{currency(item.book.harga)}</span> {currency(memberUnitPrice(item) ?? item.book.harga)}
                              </span>
                              <span className="font-mono font-bold text-[#0F172A]">
                                {currency((memberUnitPrice(item) ?? item.book.harga) * item.quantity)}
                              </span>
                            </div>
                            <span className="block text-[9px] font-semibold text-[#9A7B38] mt-0.5">{t('common:memberPrice')}</span>
                          </>
                        ) : (
                          <div className="flex items-center justify-between mt-1 text-xs">
                            <span className="text-slate-500 font-mono">
                              {item.quantity} x {currency(item.book.harga)}
                            </span>
                            <span className="font-mono font-bold text-[#0F172A]">
                              {currency(item.book.harga * item.quantity)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Price Breakdown */}
                <div className="space-y-2.5 pt-4 border-t border-slate-100 text-xs">
                  {hasMemberPrice ? (
                    <div className="flex justify-between text-slate-600">
                      <span>
                        {t('form.summary.subtotal', { count: cartItems.reduce((a, b) => a + b.quantity, 0) })}
                        <span className="ml-1.5 text-[9px] font-semibold text-[#9A7B38] bg-amber-50 px-1 rounded">{t('common:memberPrice')}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-[10px] text-slate-400 line-through">{currency(subtotal)}</span>
                        <span className="font-mono font-bold text-slate-900">{currency(payableSubtotal)}</span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-slate-600">
                      <span>{t('form.summary.subtotal', { count: cartItems.reduce((a, b) => a + b.quantity, 0) })}</span>
                      <span className="font-mono font-bold text-slate-900">
                        {currency(subtotal)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-600">
                    <div>
                      <span>{t('form.summary.shippingCost')}</span>
                      {shippingLabel && (
                        <span className="block text-[10px] text-slate-400">{shippingLabel}</span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-slate-900">
                      {shippingDisplay}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>{t('form.summary.serviceInsurance')}</span>
                    <span className="font-mono text-emerald-600 font-semibold">{t('form.summary.free')}</span>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        {paymentMethod === 'bank_transfer' && checkoutConfig.uniqueCodeEnabled && !manualShipping ? t('printCheckout.totalBeforeCode') : t('form.summary.totalDue')}
                      </span>
                      <span className="text-[10px] text-slate-400">{t('form.summary.totalNote')}</span>
                    </div>
                    <span className="font-mono text-lg font-black text-[#0F172A]">
                      {currency(grandTotal)}
                    </span>
                  </div>
                  {paymentMethod === 'bank_transfer' && checkoutConfig.uniqueCodeEnabled && !manualShipping && (
                    <p className="text-[10px] text-slate-400">{t('printCheckout.uniqueCodeNote')}</p>
                  )}
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={isSubmitting || !checkoutConfigLoaded || (courierMode && courierShipping.state.status === 'loading')}
                  className="w-full mt-6 py-3.5 px-4 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
                >
                  <Lock className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    {isSubmitting
                      ? t('form.submit.processing')
                      : paymentMethod === 'bank_transfer'
                        ? t('printCheckout.submit')
                        : t('form.submit.buyNow')}
                  </span>
                </button>

                <p className="text-[10px] text-center text-slate-400 mt-3">
                  {t('form.autoNotification')}
                </p>
              </div>
            </div>

          </form>
        )}

        {/* STEP 2: MIDTRANS SANDBOX SIMULATION */}
        {checkoutStep === 'midtrans_simulation' && createdOrder && (
          <div className="max-w-xl mx-auto mt-10 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            {/* Midtrans Header Bar */}
            <div className="bg-[#0F172A] p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-serif font-black tracking-tight text-white">MIDTRANS</span>
                <span className="text-[9px] bg-amber-500 text-slate-950 font-mono font-bold px-1.5 py-0.5 rounded">
                  {t('form.simulation.badge')}
                </span>
              </div>
              <span className="text-xs font-mono text-[#D4AF37]">
                {t('form.simulation.total', { amount: currency(createdOrder.total) })}
              </span>
            </div>

            <div className="p-6 space-y-6">
              <div className="text-center space-y-1">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">
                  {t('form.simulation.instructionsTitle')}
                </span>
                <h3 className="font-serif font-bold text-lg text-slate-900">
                  {createdOrder.paymentMethod.toUpperCase().replace('_', ' ')}
                </h3>
                <p className="text-xs text-slate-500">
                  <Trans
                    t={t}
                    i18nKey="form.simulation.billNumber"
                    values={{ orderNumber: createdOrder.orderNumber }}
                    components={{ strong: <strong className="font-mono" /> }}
                  />
                </p>
              </div>

              {/* QRIS Display Simulation */}
              {createdOrder.paymentMethod === 'qris' || ['gopay', 'ovo', 'dana', 'shopeepay'].includes(createdOrder.paymentMethod) ? (
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-center space-y-3">
                  <div className="w-48 h-48 bg-white mx-auto p-3 rounded-lg shadow-xs border border-slate-300 flex items-center justify-center">
                    <QrCode className="w-40 h-40 text-slate-900" />
                  </div>
                  <p className="text-xs text-slate-600">
                    {t('form.simulation.qrisHint')}
                  </p>
                </div>
              ) : (
                /* Virtual Account Display Simulation */
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-center space-y-3">
                  <span className="text-xs text-slate-500">{t('form.simulation.vaNumberLabel')}</span>
                  <div className="font-mono text-sm font-bold text-[#0F172A]">
                    {t('form.simulation.vaPending')}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {t('form.simulation.vaDeadline')}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleCompleteMidtransPayment}
                  className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? t('form.simulation.confirming') : t('form.simulation.simulateSuccess')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCheckoutStep('form')}
                  className="w-full py-2.5 text-slate-500 hover:text-slate-800 text-xs font-semibold text-center block"
                >
                  {t('form.simulation.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: ORDER COMPLETED SUCCESS VIEW */}
        {checkoutStep === 'success' && createdOrder && (
          <div className="max-w-2xl mx-auto mt-8 bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded bg-emerald-100 text-emerald-800">
                {t('form.success.badge')}
              </span>
              <h2 className="font-serif font-bold text-2xl text-slate-900 mt-2">
                {t('form.success.title')}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {t('form.success.description')}
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 text-left text-xs space-y-3">
              <div className="flex justify-between border-b border-slate-200 pb-2.5">
                <span className="text-slate-500">{t('form.success.invoiceNumber')}</span>
                <span className="font-mono font-bold text-[#0F172A]">{createdOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2.5">
                <span className="text-slate-500">{t('form.success.recipient')}</span>
                <span className="font-semibold text-slate-800">{createdOrder.customer.name} ({createdOrder.customer.phone})</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2.5">
                <span className="text-slate-500">{t('form.success.courier')}</span>
                <span className="font-semibold text-slate-800">{createdOrder.customer.courier}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2.5">
                <span className="text-slate-500">{t('form.success.paymentStatus')}</span>
                <span className="font-bold text-emerald-700 uppercase">{statusLabel(createdOrder.paymentStatus)}</span>
              </div>
              <div className="flex justify-between pt-1 text-sm font-bold">
                <span className="text-slate-900">{t('form.success.totalPayment')}</span>
                <span className="font-mono text-[#0F172A]">{currency(createdOrder.total)}</span>
              </div>
            </div>

            {/* Dispatcher Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={notificationService.getWhatsAppDispatchUrl(
                  adminWhatsApp,
                  notificationService.formatAdminWhatsAppMessage(createdOrder)
                )}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                <span>{t('form.success.sendProofWhatsApp')}</span>
              </a>

              <button
                type="button"
                onClick={() => window.print()}
                className="py-3 px-4 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>{t('form.success.printInvoice')}</span>
              </button>
            </div>

            {/* Tawaran keanggotaan (fase 3 Langkah 6): maks. sekali per 30 hari, tidak untuk anggota aktif. */}
            {onOpenMembership && <MembershipOfferCard onOpenMembership={onOpenMembership} />}

            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              {t('common:back')} - {t('common:home')} &amp; {t('common:catalog')}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
