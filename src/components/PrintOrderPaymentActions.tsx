import React, { useState } from 'react';
import { CheckCircle, Clock, FileText, FlaskConical, Truck } from 'lucide-react';
import type { Order } from '../types';
import {
  confirmOrderPayment,
  extendOrderDeadline,
  fetchOrderProofUrl,
  getOrderShippingRates,
  setOrderShippingQuote,
  setOrderTest
} from '../services/printCheckoutApi';
import type { ShippingRate } from '../data/shippingRates';

/**
 * Aksi pembayaran pesanan buku cetak di tab Pesanan & Dispatcher: konfirmasi transfer (markOrderPaid), isi ongkir
 * pesanan besar, perpanjang batas waktu 24 jam, lihat bukti transfer (bucket privat), dan tandai pesanan uji.
 */
const fmtWib = (iso: string) =>
  `${new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })} WIB`;

const button = 'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-50';

export const PrintOrderPaymentActions: React.FC<{
  order: Order;
  onChanged: () => void;
  notify: (message: string) => void;
}> = ({ order, onChanged, notify }) => {
  const [busy, setBusy] = useState(false);
  const status = order.paymentStatus;
  const awaiting = status === 'awaiting_transfer';

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      notify(message);
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Aksi gagal.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    const reference = window.prompt(`Konfirmasi pembayaran ${order.orderNumber} sebesar Rp${order.total.toLocaleString('id-ID')}.\nCatatan mutasi (opsional):`, '');
    if (reference === null) return;
    // Jalur transfer dari luar negeri: catat jumlah USD yang diterima (opsional).
    let usdAmount: string | undefined;
    if (order.transferCurrency === 'USD') {
      const value = window.prompt('Jumlah USD diterima (opsional, mis. 12.50):', '');
      if (value === null) return;
      usdAmount = value.trim() || undefined;
    }
    void run(() => confirmOrderPayment(order.orderNumber, reference.trim() || undefined, usdAmount), `Pembayaran ${order.orderNumber} dikonfirmasi. Pesanan masuk antrean kirim.`);
  };

  // Tarif RajaOngkir (bila pesanan punya kecamatan tujuan): ketik nomor layanan atau nominal ongkir.
  const quote = async () => {
    setBusy(true);
    let rates: ShippingRate[] = [];
    let info = '';
    try {
      const res = await getOrderShippingRates(order.orderNumber);
      rates = res.rates.slice(0, 12);
      info = res.available
        ? `\nTarif RajaOngkir (${res.weightGram ?? '-'} g ke ${res.destinationLabel ?? '-'}):\n${rates.map((r, i) => `${i + 1}. ${r.courierName} ${r.service}: Rp${r.cost.toLocaleString('id-ID')}${r.etd ? ` (${r.etd})` : ''}`).join('\n')}\nKetik nomor layanan, atau nominal ongkir.`
        : `\n(${res.message ?? 'Tarif RajaOngkir tidak tersedia.'})`;
    } catch {
      info = '\n(Tarif RajaOngkir tidak dapat dimuat.)';
    } finally {
      setBusy(false);
    }
    const value = window.prompt(`Ongkos kirim untuk ${order.copies ?? ''} eksemplar ke ${order.customer?.city || '-'} (Rupiah):${info}`, '');
    if (!value) return;
    const digits = value.replace(/[^\d]/g, '');
    const picked = digits.length <= 2 ? rates[Number(digits) - 1] : undefined;
    const fee = picked ? picked.cost : Number(digits);
    if (!Number.isFinite(fee) || !digits) return;
    const courier = picked ? `${picked.courierName} - ${picked.service}` : undefined;
    void run(() => setOrderShippingQuote(order.orderNumber, fee, courier), `Ongkos kirim ${order.orderNumber} disimpan; tagihan dikirim ke pembeli.`);
  };

  const openProof = async () => {
    const tab = window.open('', '_blank');
    try {
      const url = await fetchOrderProofUrl(order.orderNumber);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank');
    } catch (err) {
      tab?.close();
      notify(err instanceof Error ? err.message : 'Bukti transfer tidak dapat dibuka.');
    }
  };

  return (
    <div className="mt-1.5 flex flex-col items-center gap-1 text-[10px]" data-print-order-actions>
      {order.isTest && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-bold text-violet-800">UJI</span>}
      {order.shippingSource === 'zone_fallback' && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800" title="Ongkir dari tabel zona karena RajaOngkir tidak tersedia saat checkout" data-shipping-fallback>
          ONGKIR ESTIMASI
        </span>
      )}
      {order.transferCurrency === 'USD' && (
        <span className="rounded bg-sky-100 px-1.5 py-0.5 font-bold text-sky-800" title="Pembeli membayar dari luar negeri ke rekening USD" data-transfer-usd>
          TRANSFER USD
        </span>
      )}
      {order.usdAmountReceived !== null && order.usdAmountReceived !== undefined && (
        <span className="font-mono text-slate-600">USD diterima: {order.usdAmountReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      )}
      {status === 'awaiting_transfer' && order.paymentDueAt && (
        <span className="inline-flex items-center gap-1 text-slate-500"><Clock className="h-3 w-3" />Batas {fmtWib(order.paymentDueAt)}</span>
      )}
      {order.uniqueCode !== null && order.uniqueCode !== undefined && (
        <span className="font-mono text-slate-500">Kode unik {String(order.uniqueCode).padStart(3, '0')}</span>
      )}
      {awaiting && (
        <button type="button" disabled={busy} onClick={confirm} className={`${button} border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}>
          <CheckCircle className="h-3 w-3" />Konfirmasi Pembayaran
        </button>
      )}
      {status === 'awaiting_shipping_quote' && (
        <button type="button" disabled={busy} onClick={() => void quote()} className={`${button} border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100`}>
          <Truck className="h-3 w-3" />Isi Ongkir & Kirim Tagihan
        </button>
      )}
      {awaiting && order.shippingSource === 'zone_fallback' && (
        <button type="button" disabled={busy} onClick={() => void quote()} className={`${button} border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
          <Truck className="h-3 w-3" />Koreksi Ongkir & Tagih Ulang
        </button>
      )}
      {awaiting && (
        <button type="button" disabled={busy} onClick={() => void run(() => extendOrderDeadline(order.orderNumber), `Batas waktu ${order.orderNumber} diperpanjang; pembeli diberi tahu lewat email.`)} className={`${button} border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
          <Clock className="h-3 w-3" />Perpanjang 24 Jam
        </button>
      )}
      {order.hasProof && (
        <button type="button" onClick={() => void openProof()} className={`${button} border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100`}>
          <FileText className="h-3 w-3" />Lihat Bukti Transfer
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(() => setOrderTest(order.orderNumber, !order.isTest), order.isTest ? `Tanda uji ${order.orderNumber} dilepas.` : `${order.orderNumber} ditandai pesanan uji.`)}
        className={`${button} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
      >
        <FlaskConical className="h-3 w-3" />{order.isTest ? 'Batal Tandai Uji' : 'Tandai Uji'}
      </button>
    </div>
  );
};
