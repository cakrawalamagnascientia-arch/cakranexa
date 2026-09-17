import React, { useEffect, useState } from 'react';
import { CreditCard, Save } from 'lucide-react';
import { allowedProviders, DEFAULT_PAYMENT_ROUTING, type RoutingEntry, type RoutingMethod, type RoutingProvider } from '../data/paymentRouting';
import { DEFAULT_PRINT_CHECKOUT_SETTINGS, type PrintCheckoutSettings } from '../data/shippingZones';
import { getPaymentRouting, getPrintCheckoutSettings, savePaymentRouting, savePrintCheckoutSettings } from '../services/printCheckoutApi';

/**
 * Metode pembayaran checkout buku cetak (tabel payment_routing) dan pengaturan transfer manual (kode unik, batas
 * waktu). Bawaan: hanya transfer bank ke rekening PT; metode lain off sampai diaktifkan di sini.
 */
const METHOD_LABELS: Record<RoutingMethod, string> = {
  bank_transfer: 'Transfer Bank ke rekening PT (dikonfirmasi admin)',
  va_bni: 'Virtual Account BNI',
  va_mandiri: 'Virtual Account Mandiri',
  va_bri: 'Virtual Account BRI',
  va_bca: 'Virtual Account BCA',
  qris: 'QRIS',
  gopay: 'GoPay',
  ovo: 'OVO',
  dana: 'DANA',
  shopeepay: 'ShopeePay',
  card: 'Kartu Kredit/Debit'
};
const PROVIDER_LABELS: Record<RoutingProvider, string> = {
  manual: 'Aktif (manual)',
  midtrans: 'Midtrans',
  xendit: 'Xendit (belum terpasang)',
  off: 'Off'
};

export const PaymentRoutingPanel: React.FC = () => {
  const [routing, setRouting] = useState<RoutingEntry[] | null>(null);
  const [settings, setSettings] = useState<PrintCheckoutSettings | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getPaymentRouting(), getPrintCheckoutSettings()])
      .then(([r, s]) => {
        setRouting(r);
        setSettings(s);
      })
      .catch((err) => {
        setRouting(DEFAULT_PAYMENT_ROUTING);
        setSettings(DEFAULT_PRINT_CHECKOUT_SETTINGS);
        setMessage({ tone: 'error', text: `Pengaturan server belum dapat dimuat (${err instanceof Error ? err.message : err}).` });
      });
  }, []);

  if (!routing || !settings) {
    return <section className="rounded-xl border border-slate-200 bg-white p-5 text-xs text-slate-500">Memuat metode pembayaran…</section>;
  }

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const [savedRouting, savedSettings] = await Promise.all([savePaymentRouting(routing), savePrintCheckoutSettings(settings)]);
      setRouting(savedRouting);
      setSettings(savedSettings);
      setMessage({ tone: 'ok', text: 'Metode pembayaran disimpan. Checkout memakai pengaturan baru paling lambat 1 menit.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal menyimpan.' });
    } finally {
      setSaving(false);
    }
  };

  const active = routing.filter((r) => r.transactionType === 'print' && (r.provider === 'manual' || r.provider === 'midtrans')).length;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6" id="payment-routing-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><CreditCard className="h-4 w-4 text-[#D4AF37]" />Metode Pembayaran Checkout Buku Cetak</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Sumber tunggal metode di checkout (payment_routing). Bila hanya satu metode aktif, pembeli tidak melihat pilihan metode dan langsung mendapat instruksi transfer.
            {active === 1 ? ' Saat ini: satu metode aktif.' : ` Saat ini: ${active} metode aktif.`}
          </p>
        </div>
        <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-[#DFBF64] disabled:opacity-50">
          <Save className="h-3.5 w-3.5" />{saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {routing.filter((r) => r.transactionType === 'print').map((entry) => (
          <label key={entry.method} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2.5 text-xs">
            <span className="font-medium text-slate-800">{METHOD_LABELS[entry.method]}</span>
            <select
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              value={entry.provider}
              onChange={(e) => setRouting(routing.map((r) => (r.method === entry.method && r.transactionType === entry.transactionType ? { ...r, provider: e.target.value as RoutingProvider } : r)))}
            >
              {allowedProviders(entry.method).map((p) => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={settings.uniqueCodeEnabled} onChange={(e) => setSettings({ ...settings, uniqueCodeEnabled: e.target.checked })} />
          <span>
            <strong className="block text-slate-800">Kode unik 3 digit pada nominal transfer</strong>
            <span className="text-slate-500">Nominal = subtotal + ongkir − 1.000 + kode (pembeli hemat Rp1–Rp999). Setiap pesanan terbuka punya nominal berbeda sehingga Finance cukup mencocokkan mutasi.</span>
          </span>
        </label>
        <label className="block">
          <strong className="block text-slate-800">Batas waktu transfer (jam)</strong>
          <input
            className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1"
            inputMode="numeric"
            value={settings.transferDueHours}
            onChange={(e) => setSettings({ ...settings, transferDueHours: Number(e.target.value.replace(/\D/g, '')) || 0 })}
          />
          <span className="mt-1 block text-slate-500">Lewat batas: pesanan otomatis kedaluwarsa dan pembeli mendapat email. Admin bisa memperpanjang.</span>
        </label>
      </div>

      {message && <p className={`text-xs ${message.tone === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>{message.text}</p>}
    </section>
  );
};
