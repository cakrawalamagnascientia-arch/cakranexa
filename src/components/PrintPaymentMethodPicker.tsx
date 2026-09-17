import React from 'react';
import { useTranslation } from 'react-i18next';
import { Building } from 'lucide-react';
import type { PaymentMethod } from '../types';
import { useOrderLabels } from '../i18n/orderLabels';

/**
 * Metode pembayaran checkout buku cetak dari payment_routing. Hanya satu metode aktif (bawaan: transfer bank ke
 * rekening PT) -> tidak ada pilihan; langsung keterangan metode dan bahwa instruksi transfer tampil setelah pesanan
 * dibuat. Lebih dari satu -> pilihan radio.
 */
export const PrintPaymentMethodPicker: React.FC<{
  methods: PaymentMethod[];
  selected: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
  transferDueHours: number;
}> = ({ methods, selected, onSelect, transferDueHours }) => {
  const { t } = useTranslation('checkout');
  const { paymentMethodLabel } = useOrderLabels();
  const label = (method: PaymentMethod) => (method === 'bank_transfer' ? t('printCheckout.paymentSingle.method') : paymentMethodLabel(method));

  if (methods.length <= 1) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs" data-payment-method="single">
        <div className="flex items-center gap-2">
          <Building className="h-4 w-4 text-[#C5A059]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('printCheckout.paymentSingle.title')}</span>
        </div>
        <p className="mt-1.5 font-semibold text-slate-900">{label(methods[0] ?? 'bank_transfer')}</p>
        <p className="mt-1 leading-relaxed text-slate-600">{t('printCheckout.paymentSingle.note', { hours: transferDueHours })}</p>
      </div>
    );
  }

  return (
    <fieldset className="space-y-2 text-xs" data-payment-method="choice">
      <legend className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('printCheckout.paymentChoose')}</legend>
      {methods.map((method) => (
        <label
          key={method}
          className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 ${selected === method ? 'border-slate-900 bg-slate-50 font-semibold' : 'border-slate-200'}`}
        >
          <input type="radio" name="print-payment-method" value={method} checked={selected === method} onChange={() => onSelect(method)} />
          <span>{label(method)}</span>
        </label>
      ))}
    </fieldset>
  );
};
