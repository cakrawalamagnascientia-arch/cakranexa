import React, { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  CartItem,
  Order,
  CustomerDetails,
  PaymentMethod
} from '../types';
import { ShippingCalculator, CourierOption, AVAILABLE_COURIERS } from './ShippingCalculator';
import { PaymentMethods } from './PaymentMethods';
import { notificationService } from '../services/NotificationService';
import { trackInitiateCheckout, trackPurchase } from '../services/trackingService';
import { toTitleCase } from '../utils/formatters';
import { generateCakraNexaTrackingNumber } from '../services/shippingService';
import { apiClient, ApiError } from '../services/apiClient';
import { openSnapPayment } from '../services/midtransSnap';
import { getStoredPaymentSettings } from '../services/paymentService';
import { generateOrderNumber, generateOrderId, nowIso } from '../utils/orderUtils';
import { useBookText, useCategoryLabel, useFormatters } from '../i18n/hooks';
import { getCurrentLanguage } from '../i18n/index';
import { useOrderLabels, useShippingMethodText } from '../i18n/orderLabels';
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
}

export const CheckoutForm: React.FC<CheckoutFormProps> = ({
  cartItems,
  onOrderCompleted,
  onCancel
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
    province: 'DKI Jakarta',
    city: 'Jakarta Pusat',
    district: 'Senen',
    postalCode: '10410',
    courier: 'JNE Express - REG (Reguler)',
    notes: ''
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Shipping & Courier state
  const totalWeightGram = cartItems.reduce(
    (acc, item) => acc + (item.book.beratGram || 480) * item.quantity,
    0
  );
  const [selectedCourier, setSelectedCourier] = useState<CourierOption>(AVAILABLE_COURIERS[0]);
  const [shippingCost, setShippingCost] = useState<number>(14000);

  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bca_va');
  const [proofUrl, setProofUrl] = useState<string | undefined>(undefined);
  const [proofName, setProofName] = useState<string | undefined>(undefined);

  // Cart calculations
  const subtotal = cartItems.reduce(
    (acc, item) => acc + item.book.harga * item.quantity,
    0
  );
  const grandTotal = subtotal + shippingCost;

  // Fire InitiateCheckout tracking event on mount
  useEffect(() => {
    if (cartItems.length > 0) {
      trackInitiateCheckout(cartItems, grandTotal);
    }
  }, []);

  const handleCourierSelect = (courier: CourierOption, cost: number) => {
    setSelectedCourier(courier);
    setShippingCost(cost);
    // Disimpan ke pesanan untuk admin: memakai data kurir apa adanya (Bahasa Indonesia).
    setCustomer(prev => ({
      ...prev,
      courier: `${courier.name} - ${courier.service}`
    }));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!customer.name.trim()) errors.name = t('form.errors.nameRequired');
    if (!customer.phone.trim()) errors.phone = t('form.errors.phoneRequired');
    if (!customer.email.trim() || !customer.email.includes('@')) errors.email = t('form.errors.emailRequired');
    if (!customer.address.trim()) errors.address = t('form.errors.addressRequired');
    if (!customer.city.trim()) errors.city = t('form.errors.cityRequired');
    if (!customer.postalCode.trim()) errors.postalCode = t('form.errors.postalCodeRequired');

    if (paymentMethod === 'manual_mandiri' && !proofUrl) {
      errors.paymentProof = t('form.errors.paymentProofRequired');
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
      subtotal,
      shippingCost,
      total: grandTotal,
      totalWeightGram,
      customer: { ...customer },
      paymentMethod,
      paymentStatus: paymentMethod === 'manual_mandiri' ? 'processing' : 'pending',
      paymentProofUrl: proofUrl,
      paymentProofName: proofName,
      whatsappDispatched: false,
      emailDispatched: false,
      createdAt: nowIso()
    };

    // 1) Catat pesanan di backend: validasi harga/stok di server & (jika Midtrans aktif) buat Snap token asli
    let serverResult;
    try {
      serverResult = await apiClient.createOrder(draftOrder);
    } catch (err) {
      setIsSubmitting(false);
      setSubmitError(err instanceof ApiError ? err.message : t('form.errors.orderFailed'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const newOrder: Order = {
      ...draftOrder,
      // total resmi dihitung server (anti manipulasi harga); fallback ke nilai lokal jika offline
      subtotal: serverResult.subtotal ?? draftOrder.subtotal,
      shippingCost: serverResult.shippingCost ?? draftOrder.shippingCost,
      total: serverResult.total ?? draftOrder.total,
      snapToken: serverResult.snapToken || undefined,
      serverSynced: serverResult.paymentMode !== 'offline',
      paymentMode: serverResult.paymentMode,
      // Bahasa pelanggan: konfirmasi WhatsApp ke pelanggan ditulis dalam bahasa ini.
      language: getCurrentLanguage()
    };
    setCreatedOrder(newOrder);

    // 2) Transfer manual -> langsung selesai (menunggu verifikasi admin)
    if (paymentMethod === 'manual_mandiri') {
      await notificationService.dispatchWhatsAppToAdmin(newOrder);
      setIsSubmitting(false);
      setCheckoutStep('success');
      onOrderCompleted({ ...newOrder, whatsappDispatched: true, emailDispatched: true });
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

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {t('form.fields.province.label')}
                    </label>
                    <input
                      type="text"
                      placeholder="DKI Jakarta"
                      value={customer.province}
                      onChange={(e) => setCustomer({ ...customer, province: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
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

                <div className="mt-5">
                  <ShippingCalculator
                    totalWeightGram={totalWeightGram}
                    postalCode={customer.postalCode}
                    selectedCourierId={selectedCourier.id}
                    onSelectCourier={handleCourierSelect}
                    subtotal={subtotal}
                  />
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
                  <PaymentMethods
                    selectedMethod={paymentMethod}
                    onSelectMethod={(method) => setPaymentMethod(method)}
                    onProofUploaded={(url, name) => {
                      setProofUrl(url);
                      setProofName(name);
                      setFormErrors(prev => {
                        const copy = { ...prev };
                        delete copy.paymentProof;
                        return copy;
                      });
                    }}
                    uploadedProofName={proofName}
                  />

                  {formErrors.paymentProof && (
                    <p className="text-[11px] text-red-500 mt-2 font-medium bg-red-50 p-2 rounded border border-red-200">
                      {formErrors.paymentProof}
                    </p>
                  )}
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
                        <div className="flex items-center justify-between mt-1 text-xs">
                          <span className="text-slate-500 font-mono">
                            {item.quantity} x {currency(item.book.harga)}
                          </span>
                          <span className="font-mono font-bold text-[#0F172A]">
                            {currency(item.book.harga * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Price Breakdown */}
                <div className="space-y-2.5 pt-4 border-t border-slate-100 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>{t('form.summary.subtotal', { count: cartItems.reduce((a, b) => a + b.quantity, 0) })}</span>
                    <span className="font-mono font-bold text-slate-900">
                      {currency(subtotal)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <div>
                      <span>{t('form.summary.shippingCost')}</span>
                      <span className="block text-[10px] text-slate-400">
                        {selectedCourier.name} ({shippingMethodText(selectedCourier).service})
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">
                      {currency(shippingCost)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>{t('form.summary.serviceInsurance')}</span>
                    <span className="font-mono text-emerald-600 font-semibold">{t('form.summary.free')}</span>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{t('form.summary.totalDue')}</span>
                      <span className="text-[10px] text-slate-400">{t('form.summary.totalNote')}</span>
                    </div>
                    <span className="font-mono text-lg font-black text-[#0F172A]">
                      {currency(grandTotal)}
                    </span>
                  </div>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-6 py-3.5 px-4 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
                >
                  <Lock className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    {isSubmitting
                      ? t('form.submit.processing')
                      : paymentMethod === 'manual_mandiri'
                        ? t('form.submit.confirmManual')
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
