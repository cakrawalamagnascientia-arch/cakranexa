import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import type { AdminBankAccount } from '../types';

/** Daftar rekening transfer manual di modal checkout buku cetak (rekening dari resolveCheckoutBankAccounts). */
export const CheckoutBankAccountList: React.FC<{
  accounts: AdminBankAccount[];
  copiedId: string | null;
  onCopy: (account: AdminBankAccount) => void;
}> = ({ accounts, copiedId, onCopy }) => {
  const { t } = useTranslation('checkout');
  return (
    <div className="space-y-2">
      {accounts.map(acc => (
        <div key={acc.id} className="p-3 rounded-lg bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{acc.bankName}</span>
              {acc.branch && <span className="text-[10px] text-slate-500">({acc.branch})</span>}
            </div>
            <span className="font-mono text-sm font-bold text-slate-900 block mt-1">{acc.accountNumber}</span>
            <span className="text-[10px] text-slate-500 block">{t('bank.accountHolder', { name: acc.accountHolder })}</span>
          </div>
          <button
            type="button"
            onClick={() => onCopy(acc)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-700 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            {copiedId === acc.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            <span>{copiedId === acc.id ? t('bank.copied') : t('bank.copyAccountNumber')}</span>
          </button>
        </div>
      ))}
    </div>
  );
};
