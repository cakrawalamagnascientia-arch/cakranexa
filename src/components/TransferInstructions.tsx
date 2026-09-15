import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, MessageCircle, Upload } from 'lucide-react';
import type { PrintOrderDetail } from '../services/printCheckoutApi';
import { formatRupiahPlain, whatsappLink } from '../utils/transferConfirmation';

/**
 * Instruksi transfer pesanan buku cetak (halaman /pesanan/<nomor>): nominal PERSIS termasuk ongkir dan kode unik,
 * rincian, rekening PT, batas waktu, tombol konfirmasi WhatsApp Finance, dan slot unggah bukti transfer.
 */

const LOCALES: Record<string, string> = { id: 'id-ID', en: 'en-GB', zh: 'zh-CN' };

/** "Rabu, 16 September 2026 pukul 10.00 WIB" */
export const formatWib = (iso: string, language: string): string =>
  `${new Date(iso).toLocaleString(LOCALES[language] ?? 'id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'short' })} WIB`;

export const TransferInstructions: React.FC<{
  detail: PrintOrderDetail;
  language: string;
  copied: string | null;
  onCopy: (key: string, value: string) => void;
  children?: React.ReactNode;
}> = ({ detail, language, copied, onCopy, children }) => {
  const { t } = useTranslation('checkout');
  const copyButton = (key: string, value: string, label: string) => (
    <button
      type="button"
      onClick={() => onCopy(key, value)}
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
    >
      {copied === key ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      <span>{copied === key ? t('orderPage.copied') : label}</span>
    </button>
  );

  return (
    <div className="space-y-5" data-transfer-instructions>
      <div className="rounded-xl border-2 border-[#D4AF37] bg-amber-50 p-5">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-amber-900">{t('orderPage.amountLabel')}</span>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="font-mono text-3xl font-black text-slate-900" data-amount>{formatRupiahPlain(detail.total)}</span>
          {copyButton('amount', String(detail.total), t('orderPage.copyAmount'))}
        </div>
        <p className="mt-2 text-xs text-amber-900">{t('orderPage.exactNote')}</p>
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-slate-600">{t('orderPage.breakdown.subtotal')}</dt><dd className="font-mono">{formatRupiahPlain(detail.subtotal)}</dd></div>
        <div className="flex justify-between">
          <dt className="text-slate-600">{detail.shippingZone ? t('orderPage.breakdown.shippingZone', { zone: detail.shippingZone }) : t('orderPage.breakdown.shipping')}</dt>
          <dd className="font-mono">{formatRupiahPlain(detail.shippingFee)}</dd>
        </div>
        {detail.uniqueDiscount > 0 && detail.uniqueCode !== null && (
          <div className="flex justify-between">
            <dt className="text-slate-600">{t('orderPage.breakdown.uniqueDiscount', { code: String(detail.uniqueCode).padStart(3, '0') })}</dt>
            <dd className="font-mono">−{formatRupiahPlain(detail.uniqueDiscount)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-1 font-bold"><dt>{t('orderPage.breakdown.total')}</dt><dd className="font-mono">{formatRupiahPlain(detail.total)}</dd></div>
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-bold text-slate-900">{t('orderPage.transferTo')}</h3>
        <div className="space-y-2">
          {detail.bankAccounts.map((account) => (
            <div key={account.accountNumber} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-sm">
                <span className="block text-[11px] text-slate-500">{t('orderPage.bank')}: <strong className="text-slate-800">{account.bankName}</strong>{account.branch ? ` (${account.branch})` : ''}</span>
                <span className="block font-mono text-base font-bold text-slate-900">{account.accountNumber}</span>
                <span className="block text-[11px] text-slate-500">{t('orderPage.accountHolder')}: <strong className="text-slate-800">{account.accountHolder}</strong></span>
              </div>
              {copyButton(`account-${account.accountNumber}`, account.accountNumber.replace(/[^0-9]/g, ''), t('orderPage.copyAccount'))}
            </div>
          ))}
        </div>
      </div>

      {detail.paymentDueAt && (
        <p className="text-sm">
          <strong>{t('orderPage.deadline')}:</strong> <span data-deadline>{formatWib(detail.paymentDueAt, language)}</span>
          <span className="block text-xs text-slate-500">{t('orderPage.deadlineNote', { hours: detail.transferDueHours })}</span>
        </p>
      )}

      <a
        href={whatsappLink(detail.financeWhatsapp, detail.whatsappText)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
        data-whatsapp-confirm
      >
        <MessageCircle className="h-4 w-4" />
        <span>{t('orderPage.confirmWhatsApp')}</span>
      </a>

      {children}
    </div>
  );
};

/** Formulir unggah bukti transfer (opsional): foto/screenshot atau PDF ke bucket privat. */
export const ProofUploader: React.FC<{
  language: string;
  hasProof: boolean;
  proofUploadedAt: string | null;
  uploading: boolean;
  error: string | null;
  onUpload: (file: File) => void;
}> = ({ language, hasProof, proofUploadedAt, uploading, error, onUpload }) => {
  const { t } = useTranslation('checkout');
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4" data-proof-uploader>
      <h3 className="text-sm font-bold text-slate-900">{t('orderPage.proof.title')}</h3>
      <p className="mt-1 text-xs text-slate-600">{t('orderPage.proof.hint')}</p>
      {hasProof && proofUploadedAt && (
        <p className="mt-2 text-xs font-semibold text-emerald-700">{t('orderPage.proof.uploaded', { date: formatWib(proofUploadedAt, language) })}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs"
        />
        <button
          type="button"
          disabled={!file || uploading}
          onClick={() => file && onUpload(file)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>{uploading ? t('orderPage.proof.uploading') : t('orderPage.proof.upload')}</span>
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
};
