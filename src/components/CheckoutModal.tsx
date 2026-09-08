import React, { useState, useEffect } from 'react';
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
import { CartItem, CustomerDetails, PaymentMethod, Order, ShippingMethod, PaymentSettings } from '../types';
import { getStoredShippingMethods, calculateShippingFee, generateCakraNexaTrackingNumber } from '../services/shippingService';
import { getStoredPaymentSettings } from '../services/paymentService';
import { trackInitiateCheckout, trackPurchase } from '../services/trackingService';
import { toTitleCase } from '../utils/formatters';
import { apiClient, ApiError } from '../services/apiClient';
import { openSnapPayment } from '../services/midtransSnap';
import { generateOrderNumber, generateOrderId, generateSimulatedVa, nowIso } from '../utils/orderUtils';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onOrderSuccess: (order: Order) => void;
  directBookBuy?: CartItem | null;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  onOrderSuccess,
  directBookBuy
}) => {
  const activeItems = directBookBuy ? [directBookBuy] : items;
  
  // Stages: 'customer_details' | 'midtrans_snap' | 'order_complete'
  const [step, setStep] = useState<'customer_details' | 'midtrans_snap' | 'order_complete'>('customer_details');
  
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>(() => 
    getStoredShippingMethods().filter(m => m.isActive)
  );
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(() => 
    getStoredPaymentSettings()
  );

  const [selectedCourierId, setSelectedCourierId] = useState<string>(() => 
    shippingMethods[0]?.id || 'jne_reg'
  );

  useEffect(() => {
    if (isOpen) {
      const activeM = getStoredShippingMethods().filter(m => m.isActive);
      setShippingMethods(activeM);
      if (activeM.length > 0 && !activeM.some(m => m.id === selectedCourierId)) {
        setSelectedCourierId(activeM[0].id);
      }
      setPaymentSettings(getStoredPaymentSettings());

      // Trigger InitiateCheckout tracking event
      if (activeItems.length > 0) {
        trackInitiateCheckout(activeItems, total);
      }
    }
  }, [isOpen]);

  const totalWeightGram = activeItems.reduce(
    (sum, item) => sum + ((item.book.beratGram || 480) * item.quantity),
    0
  );

  const subtotal = activeItems.reduce((sum, item) => sum + (item.book.harga * item.quantity), 0);

  const currentCourier = shippingMethods.find(m => m.id === selectedCourierId) || shippingMethods[0];
  const shippingCalculation = currentCourier 
    ? calculateShippingFee(currentCourier, totalWeightGram, '10430', subtotal)
    : { fee: 15000, isFree: false, originalFee: 15000 };
  const shippingCost = shippingCalculation.fee;
  const total = subtotal + shippingCost;

  // Customer Details Form State
  const [customer, setCustomer] = useState<CustomerDetails>({
    name: 'Dr. Ahmad Fauzi, S.E., M.Ak.',
    email: 'ahmad.fauzi@universitas.ac.id',
    phone: '081288992341',
    address: 'Jl. Salemba Raya No. 4, Senen',
    province: 'DKI Jakarta',
    city: 'Jakarta Pusat',
    district: 'Senen',
    postalCode: '10430',
    courier: currentCourier ? `${currentCourier.name} (${currentCourier.service}) - Rp ${shippingCost.toLocaleString('id-ID')}` : 'JNE Regular - Rp 15.000',
    notes: 'Mohon kemas dengan bubble wrap tebal dan box kardus buku.'
  });

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('bca_va');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [copiedVA, setCopiedVA] = useState(false);
  const [copiedBankAcc, setCopiedBankAcc] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  // Update customer.courier label whenever current courier or shipping cost changes
  useEffect(() => {
    if (currentCourier) {
      setCustomer(prev => ({
        ...prev,
        courier: `${currentCourier.name} (${currentCourier.service}) - ${shippingCalculation.isFree ? 'Gratis Ongkir' : `Rp ${shippingCost.toLocaleString('id-ID')}`}`
      }));
    }
  }, [selectedCourierId, shippingCost, shippingCalculation.isFree, currentCourier]);

  if (!isOpen) return null;

  const showToast = (type: 'success' | 'info' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer.name || !customer.email || !customer.phone || !customer.address) {
      showToast('error', 'Mohon lengkapi semua rincian alamat pengiriman.');
      return;
    }
    if (isCreatingOrder) return;
    setIsCreatingOrder(true);

    const draftOrder: Order = {
      id: generateOrderId(),
      orderNumber: generateOrderNumber(),
      trackingNumber: generateCakraNexaTrackingNumber(),
      items: activeItems,
      subtotal,
      shippingCost,
      total,
      customer,
      paymentMethod: selectedMethod,
      paymentStatus: selectedMethod === 'manual_mandiri' ? 'processing' : 'pending',
      vaNumber: generateSimulatedVa(customer.phone),
      createdAt: nowIso()
    };

    // Catat pesanan di backend terlebih dahulu (validasi harga & stok, Snap token asli jika Midtrans aktif)
    let result;
    try {
      result = await apiClient.createOrder(draftOrder);
    } catch (err) {
      setIsCreatingOrder(false);
      showToast('error', err instanceof ApiError ? err.message : 'Pesanan gagal diproses. Coba lagi.');
      return;
    }

    const newOrder: Order = {
      ...draftOrder,
      subtotal: result.subtotal ?? draftOrder.subtotal,
      shippingCost: result.shippingCost ?? draftOrder.shippingCost,
      total: result.total ?? draftOrder.total,
      snapToken: result.snapToken || undefined,
      serverSynced: result.paymentMode !== 'offline',
      paymentMode: result.paymentMode
    };
    setCreatedOrder(newOrder);
    setIsCreatingOrder(false);

    if (newOrder.snapToken) {
      const opened = await openSnapPayment(newOrder.snapToken, {
        onSuccess: () => completeOrder(newOrder, 'paid'),
        onPending: () => completeOrder(newOrder, 'pending'),
        onError: () => showToast('error', 'Pembayaran Midtrans gagal atau dibatalkan.'),
        onClose: () => showToast('info', 'Popup pembayaran ditutup. Pesanan tetap tercatat dengan status pending.')
      });
      if (opened) return;
    }

    setStep('midtrans_snap');
    showToast('info', newOrder.paymentMode === 'simulation' || newOrder.paymentMode === 'offline'
      ? 'Mode simulasi: Midtrans belum dikonfigurasi di server.'
      : 'Membuka layar pembayaran.');
  };

  const completeOrder = (order: Order, status: 'paid' | 'pending') => {
    const updatedOrder: Order = { ...order, paymentStatus: status };
    setCreatedOrder(updatedOrder);
    onOrderSuccess(updatedOrder);
    if (status === 'paid') trackPurchase(updatedOrder);
    setStep('order_complete');
    showToast('success', status === 'paid'
      ? 'Pembayaran berhasil diverifikasi! Faktur diterbitkan.'
      : 'Pesanan tercatat. Selesaikan pembayaran sesuai instruksi Virtual Account / QRIS.');
  };

  // Simulasi (hanya tampil jika Midtrans belum dikonfigurasi di server)
  const handleSimulatePayment = (status: 'success' | 'pending' | 'failed') => {
    if (!createdOrder) return;
    if (status === 'success') {
      completeOrder(createdOrder, 'paid');
    } else if (status === 'pending') {
      completeOrder(createdOrder, 'pending');
    } else {
      showToast('error', 'Transaksi dibatalkan atau pembayaran ditolak oleh sistem.');
      setStep('customer_details');
    }
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
                {step === 'customer_details' && 'Rincian Pengiriman & Pemesanan'}
                {step === 'midtrans_snap' && 'Midtrans Payment Gateway (Mode Simulasi)'}
                {step === 'order_complete' && 'Faktur Resmi Pembelian Buku'}
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
                Item Buku yang Dipesan ({activeItems.length})
              </span>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {activeItems.map((item) => (
                  <div key={item.book.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 last:border-0">
                    <div className="flex items-center gap-2 max-w-[70%]">
                      <span className="w-5 h-5 rounded bg-slate-200 text-slate-700 font-mono font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                        {item.quantity}x
                      </span>
                      <span className="font-semibold text-slate-800 truncate" title={toTitleCase(item.book.title || item.book.name)}>
                        {toTitleCase(item.book.title || item.book.name)}
                      </span>
                    </div>
                    <span className="font-mono text-slate-900 font-bold">
                      Rp {(item.book.harga * item.quantity).toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Input Form Fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nama Lengkap & Gelar *
                  </label>
                  <input
                    type="text"
                    required
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder="Contoh: Dr. Budi Santoso, S.E., M.Si."
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Email Aktif (Untuk Notifikasi Faktur) *
                  </label>
                  <input
                    type="email"
                    required
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder="nama@institusi.ac.id"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nomor WhatsApp / Telepon *
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
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Kota / Kabupaten Tujuan *
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
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Alamat Lengkap Pengiriman Buku (Kantor / Kampus / Rumah) *
                </label>
                <textarea
                  required
                  rows={2}
                  value={customer.address}
                  onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                  placeholder="Nama Jalan, Nomor Gedung/Ruangan, RT/RW, Kelurahan, Kecamatan..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Kode Pos
                  </label>
                  <input
                    type="text"
                    value={customer.postalCode}
                    onChange={(e) => setCustomer({ ...customer, postalCode: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059]"
                    placeholder="10430"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Pilihan Ekspedisi Pengiriman
                  </label>
                  <select
                    value={selectedCourierId}
                    onChange={(e) => setSelectedCourierId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-[#C5A059] bg-white font-medium"
                  >
                    {shippingMethods.map((m) => {
                      const calc = calculateShippingFee(m, totalWeightGram, customer.postalCode || '10430', subtotal);
                      return (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.service}) - {calc.isFree ? 'GRATIS ONGKIR' : `Rp ${calc.fee.toLocaleString('id-ID')}`} (Est. {m.estimatedDays})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            {/* Total Summary */}
            <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal Harga Buku</span>
                <span className="font-mono text-white">Rp {subtotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Ongkos Kirim Terhitung</span>
                <span className="font-mono text-white">Rp {shippingCost.toLocaleString('id-ID')}</span>
              </div>
              <div className="pt-2 border-t border-white/20 flex justify-between text-sm font-bold text-[#DFBF64]">
                <span>Total Tagihan Pembayaran</span>
                <span className="font-mono text-base">Rp {total.toLocaleString('id-ID')}</span>
              </div>
            </div>

            {/* Submit CTA */}
            <button
              id="btn-submit-order-snap"
              type="submit"
              disabled={isCreatingOrder}
              className="disabled:opacity-60 disabled:cursor-wait w-full py-3.5 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#c5a059] text-[#0F172A] font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Beli Sekarang</span>
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
                  <div className="text-xs font-bold uppercase tracking-wider">Midtrans SNAP — Mode Simulasi (server key belum diset)</div>
                  <div className="text-[10px] text-slate-200 font-mono">Token: {createdOrder.snapToken}</div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-300 block">Total Tagihan</span>
                <span className="text-base font-bold text-[#DFBF64] font-mono">
                  Rp {createdOrder.total.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Pilih Metode Pembayaran Resmi:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  ...(paymentSettings.enableMidtransVA ? [
                    { id: 'bca_va', label: 'BCA Virtual Account', icon: Building },
                    { id: 'mandiri_bill', label: 'Mandiri Bill', icon: Building },
                    { id: 'bni_va', label: 'BNI Virtual Account', icon: Building },
                    { id: 'bri_va', label: 'BRI Virtual Account', icon: Building },
                  ] : []),
                  ...(paymentSettings.enableQris ? [
                    { id: 'qris', label: 'QRIS Universal', icon: QrCode },
                  ] : []),
                  ...(paymentSettings.enableManualTransfer ? [
                    { id: 'manual_mandiri', label: 'Transfer Manual Bank', icon: Building },
                  ] : []),
                  ...(paymentSettings.enableCreditCard ? [
                    { id: 'credit_card', label: 'Kartu Kredit/Debit', icon: CreditCard },
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
                      <span className="text-slate-500 uppercase font-bold text-[10px] block">Rekening Resmi Korporat</span>
                      <span className="text-xs font-bold text-slate-900">PT CAKRAWALA MAGNA SCIENTIA</span>
                    </div>
                    <span className="text-[10px] text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-semibold">
                      Giro Perusahaan
                    </span>
                  </div>
                  <div className="space-y-2">
                    {paymentSettings.bankAccounts.filter(b => b.isActive).map(acc => (
                      <div key={acc.id} className="p-3 rounded-lg bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{acc.bankName}</span>
                            {acc.branch && <span className="text-[10px] text-slate-500">({acc.branch})</span>}
                          </div>
                          <span className="font-mono text-sm font-bold text-slate-900 block mt-1">{acc.accountNumber}</span>
                          <span className="text-[10px] text-slate-500 block">a.n. {acc.accountHolder}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(acc.accountNumber.replace(/[^0-9]/g, ''));
                            setCopiedBankAcc(acc.id);
                            setTimeout(() => setCopiedBankAcc(null), 2000);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-700 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                        >
                          {copiedBankAcc === acc.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                          <span>{copiedBankAcc === acc.id ? 'Tersalin' : 'Salin No. Rekening'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="text-slate-700 text-[11px] bg-white p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                    <strong className="text-slate-900 font-semibold block mb-0.5">Petunjuk:</strong>
                    {paymentSettings.manualTransferInstructions || 'Silahkan transfer sesuai nominal ke nomor rekening resmi PT Cakrawala Magna Scientia di atas, lalu unggah bukti transfer.'}
                  </div>
                  {paymentSettings.adminNotificationWhatsapp && (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Konfirmasi cepat WhatsApp Finance: <strong>{paymentSettings.adminNotificationWhatsapp}</strong></span>
                    </div>
                  )}
                </div>
              ) : selectedMethod.includes('va') || selectedMethod === 'mandiri_bill' ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 uppercase font-medium text-[11px]">Nomor Virtual Account</span>
                    <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-mono">
                      Batas Pembayaran: 23:59 WIB
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
                      <span>{copiedVA ? 'Tersalin' : 'Salin Nomor'}</span>
                    </button>
                  </div>
                  <p className="text-slate-500 leading-relaxed text-[11px]">
                    Buka m-Banking atau ATM bank pilihan Anda &gt; Transfer Virtual Account &gt; Masukkan nomor di atas &gt; Konfirmasi nama PT Cakrawala Magna Scientia &gt; Tekan Bayar.
                  </p>
                </div>
              ) : selectedMethod === 'qris' ? (
                /* QRIS Mode */
                <div className="text-center space-y-3 py-2">
                  <span className="text-[11px] font-bold text-slate-700 block uppercase">
                    Scan QRIS: {paymentSettings.qrisMerchantName}
                  </span>
                  <div className="w-44 h-44 mx-auto bg-white p-3 rounded-xl border-2 border-slate-800 shadow-md flex items-center justify-center">
                    <div className="w-full h-full bg-slate-900 rounded flex flex-col items-center justify-center text-white p-2">
                      <QrCode className="w-24 h-24 text-[#DFBF64]" />
                      <span className="text-[8px] font-mono mt-1 text-slate-300">NMID: {paymentSettings.qrisNmid}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Kadaluarsa dalam: 14 menit 59 detik
                  </p>
                </div>
              ) : (
                /* Credit Card Mode */
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Nomor Kartu Kredit (Dummy)</label>
                    <input
                      type="text"
                      readOnly
                      value="4111 2222 3333 4444"
                      className="w-full p-2 bg-white rounded border border-slate-300 font-mono text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">Berlaku Hingga</label>
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
                Sandbox Simulator Actions:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  id="btn-simulate-success"
                  type="button"
                  onClick={() => handleSimulatePayment('success')}
                  className="py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Simulasi Sukses</span>
                </button>

                <button
                  id="btn-simulate-pending"
                  type="button"
                  onClick={() => handleSimulatePayment('pending')}
                  className="py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Simulasi Pending</span>
                </button>

                <button
                  id="btn-simulate-failed"
                  type="button"
                  onClick={() => handleSimulatePayment('failed')}
                  className="py-2.5 px-3 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Batal / Gagal</span>
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
                  Transaksi Berhasil & Pembayaran Terverifikasi
                </h4>
                <p className="text-emerald-700 text-[11px]">
                  Faktur resmi telah dibuat dan naskah cetak siap diproses untuk pengiriman.
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
                    Brand: CakraNexa Academic & Professional Publishing
                  </p>
                  <p className="text-slate-400 text-[10px]">
                    NPWP: 01.889.324.5-021.000 • Jakarta, Indonesia
                  </p>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold uppercase text-[10px]">
                    LUNAS (PAID)
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
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Penerima & Pembeli:</span>
                  <strong className="text-slate-900 block">{createdOrder.customer.name}</strong>
                  <span className="text-slate-600 block">{createdOrder.customer.email}</span>
                  <span className="text-slate-600 block">{createdOrder.customer.phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Alamat Pengiriman:</span>
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
                      <th className="py-2">Judul Publikasi Buku</th>
                      <th className="py-2 text-center">Qty</th>
                      <th className="py-2 text-right">Harga Satuan</th>
                      <th className="py-2 text-right">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {createdOrder.items.map((item) => (
                      <tr key={item.book.id}>
                        <td className="py-2.5 font-medium text-slate-900 pr-2">
                          <div>{toTitleCase(item.book.title || item.book.name)}</div>
                          <span className="text-[10px] text-slate-400 font-mono">ISBN: {item.book.isbn}</span>
                        </td>
                        <td className="py-2.5 text-center font-mono">{item.quantity}</td>
                        <td className="py-2.5 text-right font-mono">Rp {item.book.harga.toLocaleString('id-ID')}</td>
                        <td className="py-2.5 text-right font-mono font-bold text-slate-900">
                          Rp {(item.book.harga * item.quantity).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-right">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-mono">Rp {createdOrder.subtotal.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Biaya Pengiriman</span>
                  <span className="font-mono">Rp {createdOrder.shippingCost.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-100">
                  <span>Total Pembayaran</span>
                  <span className="font-mono text-[#9A7B38]">Rp {createdOrder.total.toLocaleString('id-ID')}</span>
                </div>
              </div>

            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Faktur</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-[#DFBF64] font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Kembali ke Katalog</span>
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
