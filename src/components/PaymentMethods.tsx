import React, { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Building,
  QrCode,
  Smartphone,
  CreditCard,
  Copy,
  Check,
  Upload,
  FileText,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  MessageSquare
} from 'lucide-react';
import { PaymentMethod, PaymentSettings, AdminBankAccount } from '../types';
import { getStoredPaymentSettings } from '../services/paymentService';
import { useManualTransferInstructions, useOrderLabels } from '../i18n/orderLabels';

interface PaymentMethodsProps {
  selectedMethod: PaymentMethod;
  onSelectMethod: (method: PaymentMethod) => void;
  onProofUploaded?: (fileUrl: string, fileName: string) => void;
  uploadedProofName?: string;
  paymentSettings?: PaymentSettings;
}

// Nilai metode pembayaran adalah kunci data; labelnya dari checkout:paymentMethods.*
const VA_BANKS: { id: PaymentMethod; code: string }[] = [
  { id: 'bca_va', code: 'BCA' },
  { id: 'mandiri_bill', code: 'MANDIRI' },
  { id: 'bni_va', code: 'BNI' },
  { id: 'bri_va', code: 'BRI' },
  { id: 'permata_va', code: 'PERMATA' },
];

const E_WALLETS = ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'] as const satisfies readonly PaymentMethod[];

export const PaymentMethods: React.FC<PaymentMethodsProps> = ({
  selectedMethod,
  onSelectMethod,
  onProofUploaded,
  uploadedProofName,
  paymentSettings
}) => {
  const { t } = useTranslation('checkout');
  const { paymentMethodLabel } = useOrderLabels();
  const manualTransferInstructions = useManualTransferInstructions();
  const [settings, setSettings] = useState<PaymentSettings>(() => paymentSettings || getStoredPaymentSettings());
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'midtrans_va' | 'midtrans_ewallet' | 'manual_transfer' | 'cards'>('midtrans_va');
  const [proofPreview, setProofPreview] = useState<string | null>(null);

  useEffect(() => {
    if (paymentSettings) {
      setSettings(paymentSettings);
    } else {
      setSettings(getStoredPaymentSettings());
    }
  }, [paymentSettings]);

  // Adjust activeTab if the currently active tab is disabled in settings
  useEffect(() => {
    if (activeTab === 'midtrans_va' && !settings.enableMidtransVA) {
      if (settings.enableManualTransfer) setActiveTab('manual_transfer');
      else if (settings.enableQris || settings.enableEWallet) setActiveTab('midtrans_ewallet');
      else if (settings.enableCreditCard) setActiveTab('cards');
    }
  }, [settings, activeTab]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedAccount(id);
    setTimeout(() => setCopiedAccount(null), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        setProofPreview(result);
        if (onProofUploaded) {
          onProofUploaded(result, file.name);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const activeBankAccounts = settings.bankAccounts.filter(acc => acc.isActive);

  return (
    <div className="space-y-4">
      {/* Category Pills - Dynamically Rendered based on Admin Settings */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {settings.enableMidtransVA && (
          <button
            type="button"
            onClick={() => setActiveTab('midtrans_va')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'midtrans_va'
                ? 'bg-[#0F172A] text-[#D4AF37]'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>{t('payment.tabs.va')}</span>
          </button>
        )}

        {(settings.enableQris || settings.enableEWallet) && (
          <button
            type="button"
            onClick={() => setActiveTab('midtrans_ewallet')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'midtrans_ewallet'
                ? 'bg-[#0F172A] text-[#D4AF37]'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{t('payment.tabs.ewallet')}</span>
          </button>
        )}

        {settings.enableManualTransfer && (
          <button
            type="button"
            onClick={() => {
              setActiveTab('manual_transfer');
              onSelectMethod('manual_mandiri');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'manual_transfer'
                ? 'bg-[#0F172A] text-[#D4AF37]'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Building className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{t('payment.tabs.manual')}</span>
          </button>
        )}

        {settings.enableCreditCard && (
          <button
            type="button"
            onClick={() => {
              setActiveTab('cards');
              onSelectMethod('credit_card');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'cards'
                ? 'bg-[#0F172A] text-[#D4AF37]'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>{t('payment.tabs.cards')}</span>
          </button>
        )}
      </div>

      {/* TAB 1: VIRTUAL ACCOUNTS */}
      {activeTab === 'midtrans_va' && settings.enableMidtransVA && (
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-700 block">
            {t('payment.va.chooseBank')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {VA_BANKS.map((bank) => {
              const isSelected = selectedMethod === bank.id;
              return (
                <button
                  key={bank.id}
                  type="button"
                  onClick={() => onSelectMethod(bank.id)}
                  className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#0F172A] bg-slate-900 text-white font-bold ring-1 ring-[#D4AF37]'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div>
                    <div className="text-xs">{paymentMethodLabel(bank.id)}</div>
                    <span className="text-[9px] uppercase tracking-wider opacity-70">{t('payment.va.instantVerification')}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#D4AF37]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: MIDTRANS E-WALLETS & QRIS */}
      {activeTab === 'midtrans_ewallet' && (settings.enableQris || settings.enableEWallet) && (
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-700 block">
            {t('payment.ewallet.choose')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {settings.enableQris && (
              <button
                type="button"
                onClick={() => onSelectMethod('qris')}
                className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                  selectedMethod === 'qris'
                    ? 'border-[#0F172A] bg-slate-900 text-white font-bold ring-1 ring-[#D4AF37]'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>
                  <div className="text-xs">{paymentMethodLabel('qris')}</div>
                  <span className="text-[9px] opacity-70 block">{settings.qrisMerchantName}</span>
                </div>
                {selectedMethod === 'qris' && <Check className="w-4 h-4 text-[#D4AF37]" />}
              </button>
            )}

            {settings.enableEWallet && E_WALLETS.map((walletId) => {
              const isSelected = selectedMethod === walletId;
              return (
                <button
                  key={walletId}
                  type="button"
                  onClick={() => onSelectMethod(walletId)}
                  className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#0F172A] bg-slate-900 text-white font-bold ring-1 ring-[#D4AF37]'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div>
                    <div className="text-xs">{paymentMethodLabel(walletId)}</div>
                    <span className="text-[9px] opacity-70 block">{t(`payment.ewallet.subtitles.${walletId}`)}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#D4AF37]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: DIRECT MANUAL BANK TRANSFER */}
      {activeTab === 'manual_transfer' && settings.enableManualTransfer && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 text-xs">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                {t('bank.officialAccount')}
              </span>
              <h4 className="font-bold text-sm text-slate-900 tracking-tight">
                PT CAKRAWALA MAGNA SCIENTIA
              </h4>
              <p className="text-slate-500 text-[11px] mt-0.5">
                {t('payment.manual.chooseAccount')}
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold">
              {t('payment.manual.verifiedAccount')}
            </span>
          </div>

          {/* Dynamic Active Bank Accounts from Admin Portal */}
          <div className="space-y-2.5">
            {activeBankAccounts.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                {t('payment.manual.noAccounts')}
              </div>
            ) : (
              activeBankAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between p-3.5 rounded-lg bg-white border border-slate-200 shadow-2xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {acc.bankName}
                      </span>
                      {acc.branch && (
                        <span className="text-[10px] text-slate-500">({acc.branch})</span>
                      )}
                    </div>
                    <span className="font-mono text-base font-bold text-slate-900 block mt-1">
                      {acc.accountNumber}
                    </span>
                    <span className="text-[11px] font-medium text-slate-600 block mt-0.5">
                      {t('bank.accountHolder', { name: acc.accountHolder })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(acc.accountNumber.replace(/[^0-9]/g, ''), acc.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    {copiedAccount === acc.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{copiedAccount === acc.id ? t('bank.copied') : t('bank.copyAccountNumber')}</span>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Admin Configured Instruction Text */}
          <div className="p-3 bg-white border border-slate-200 rounded-lg text-slate-700 text-[11px] leading-relaxed">
            <strong className="text-slate-900 font-semibold block mb-0.5">{t('payment.manual.instructionsLabel')}</strong>
            {manualTransferInstructions(settings.manualTransferInstructions)}
          </div>

          {/* WhatsApp Finance Contact Direct Link */}
          {settings.adminNotificationWhatsapp && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <Trans
                    t={t}
                    i18nKey="bank.whatsappFinance"
                    values={{ phone: settings.adminNotificationWhatsapp }}
                    components={{ strong: <strong /> }}
                  />
                </span>
              </div>
            </div>
          )}

          {/* Payment Proof Upload */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="text-xs font-bold text-slate-700 block">
              {t('payment.manual.upload.label')}
            </label>

            <div className="border-2 border-dashed border-slate-300 hover:border-[#D4AF37] rounded-xl p-4 text-center bg-white transition-colors">
              <input
                type="file"
                accept="image/*,.pdf"
                id="payment-proof-input"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label htmlFor="payment-proof-input" className="cursor-pointer block space-y-1">
                <Upload className="w-6 h-6 text-slate-400 mx-auto" />
                <div className="text-xs font-semibold text-[#0F172A]">
                  {t('payment.manual.upload.cta')}
                </div>
                <div className="text-[10px] text-slate-400">
                  {t('payment.manual.upload.formats')}
                </div>
              </label>
            </div>

            {(uploadedProofName || proofPreview) && (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="font-semibold truncate">
                    {uploadedProofName || t('payment.manual.upload.defaultFileName')}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded flex-shrink-0">
                  {t('payment.manual.upload.attached')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CREDIT CARD */}
      {activeTab === 'cards' && settings.enableCreditCard && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">{t('payment.cards.title')}</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-slate-500 text-[11px] leading-relaxed">
            {t('payment.cards.description')}
          </p>
        </div>
      )}
    </div>
  );
};
