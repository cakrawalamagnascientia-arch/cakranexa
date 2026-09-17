import React from 'react';
import { useTranslation } from 'react-i18next';
import { Building, Globe } from 'lucide-react';
import type { PaymentMethod } from '../types';
import { useOrderLabels } from '../i18n/orderLabels';

/**
 * Metode pembayaran checkout buku cetak dari payment_routing. Hanya satu metode aktif (bawaan: transfer bank ke
 * rekening PT) -> tidak ada pilihan; langsung keterangan metode dan bahwa instruksi transfer tampil setelah pesanan
 * dibuat. Lebih dari satu -> pilihan radio. Transfer bank dengan rekening USD aktif -> pilihan "membayar dari luar
 * negeri" (nominal tetap Rupiah, tanpa kode unik, batas waktu hari kerja).
 */
export const PrintPaymentMethodPicker: React.FC<{
  methods: PaymentMethod[];
  selected: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
  transferDueHours: number;
  usdTransfer?: { available: boolean; dueBusinessDays: number };
  foreignTransfer?: boolean;
  onForeignTransferChange?: (value: boolean) => void;
}> = ({ methods, selected, onSelect, transferDueHours, usdTransfer, foreignTransfer, onForeignTransferChange }) => {
  const { t } = useTranslation('checkout');
  const { paymentMethodLabel } = useOrderLabels();
  const label = (method: PaymentMethod) => (method === 'bank_transfer' ? t('printCheckout.paymentSingle.method') : paymentMethodLabel(method));
  const days = usdTransfer?.dueBusinessDays ?? 5;
  const showForeign = selected === 'bank_transfer' && Boolean(usdTransfer?.available) && Boolean(onForeignTransferChange);
  const usdSelected = showForeign && Boolean(foreignTransfer);

  const foreignOption = showForeign ? (
    <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs" data-foreign-transfer>
      <input type="checkbox" className="mt-0.5" checked={usdSelected} onChange={(e) => onForeignTransferChange?.(e.target.checked)} />
      <span>
        <span className="flex items-center gap-1 font-semibold text-slate-900"><Globe className="h-3.5 w-3.5 text-[#C5A059]" />{t('printCheckout.foreign.label')}</span>
        <span className="mt-0.5 block leading-relaxed text-slate-600">{t('printCheckout.foreign.note', { days })}</span>
      </span>
    </label>
  ) : null;

  if (methods.length <= 1) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs" data-payment-method="single">
        <div className="flex items-center gap-2">
          <Building className="h-4 w-4 text-[#C5A059]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('printCheckout.paymentSingle.title')}</span>
        </div>
        <p className="mt-1.5 font-semibold text-slate-900">{label(methods[0] ?? 'bank_transfer')}</p>
        <p className="mt-1 leading-relaxed text-slate-600">
          {usdSelected ? t('printCheckout.foreign.singleNote', { days }) : t('printCheckout.paymentSingle.note', { hours: transferDueHours })}
        </p>
        {foreignOption}
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
      {foreignOption}
    </fieldset>
  );
};
