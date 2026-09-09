import React, { useState } from 'react';
import {
  CreditCard,
  Building,
  QrCode,
  Smartphone,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Save,
  MessageSquare,
  Mail,
  Copy,
  Check,
  ShieldCheck,
  FileText,
  X
} from 'lucide-react';
import { PaymentSettings, AdminBankAccount } from '../types';
import {
  getStoredPaymentSettings,
  saveStoredPaymentSettings,
  resetDefaultPaymentSettings,
  DEFAULT_BANK_ACCOUNTS
} from '../services/paymentService';

interface PaymentManagementTabProps {
  onPaymentSettingsUpdated?: (settings: PaymentSettings) => void;
}

export const PaymentManagementTab: React.FC<PaymentManagementTabProps> = ({
  onPaymentSettingsUpdated
}) => {
  const [settings, setSettings] = useState<PaymentSettings>(() => getStoredPaymentSettings());

  // Bank Account Modal State
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AdminBankAccount | null>(null);
  const [deleteBankConfirm, setDeleteBankConfirm] = useState<{ id: string; name: string; accountNumber: string } | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);

  // Bank Form State
  const [formBankName, setFormBankName] = useState('Bank Mandiri');
  const [formBankCode, setFormBankCode] = useState('MANDIRI');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formAccountHolder, setFormAccountHolder] = useState('PT CAKRAWALA MAGNA SCIENTIA');
  const [formBranch, setFormBranch] = useState('KC Jakarta Salemba Raya');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsDefault, setFormIsDefault] = useState(false);

  // Toast Notification
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const persistSettings = (newSettings: PaymentSettings) => {
    setSettings(newSettings);
    saveStoredPaymentSettings(newSettings);
    if (onPaymentSettingsUpdated) {
      onPaymentSettingsUpdated(newSettings);
    }
  };

  // Toggle Payment Method switches
  const handleToggleMethod = (key: keyof Pick<PaymentSettings, 'enableManualTransfer' | 'enableMidtransVA' | 'enableQris' | 'enableEWallet' | 'enableCreditCard'>) => {
    const updated = {
      ...settings,
      [key]: !settings[key]
    };
    persistSettings(updated);
    showToast(`Status metode pembayaran "${key}" berhasil diubah.`);
  };

  // Toggle single Bank Account active/inactive
  const handleToggleBankAccount = (id: string) => {
    const updatedAccounts = settings.bankAccounts.map(acc =>
      acc.id === id ? { ...acc, isActive: !acc.isActive } : acc
    );
    persistSettings({
      ...settings,
      bankAccounts: updatedAccounts
    });
    const toggled = updatedAccounts.find(a => a.id === id);
    showToast(`Status rekening ${toggled?.bankName} diubah ke ${toggled?.isActive ? 'Aktif' : 'Nonaktif'}.`);
  };

  // Trigger Delete Bank Account Modal
  const handleDeleteBankAccount = (id: string, bankName: string, accountNumber: string) => {
    setDeleteBankConfirm({ id, name: bankName, accountNumber });
  };

  // Confirm and Execute Deletion
  const handleConfirmDeleteBank = () => {
    if (!deleteBankConfirm) return;
    const targetId = deleteBankConfirm.id;
    const targetName = deleteBankConfirm.name;
    const updatedAccounts = settings.bankAccounts.filter(acc => acc.id !== targetId);
    persistSettings({
      ...settings,
      bankAccounts: updatedAccounts
    });
    setDeleteBankConfirm(null);
    showToast(`Rekening resmi ${targetName} berhasil dihapus.`);
  };

  // Open Create Bank Account Modal
  const handleOpenCreateBank = () => {
    setEditingAccount(null);
    setFormValidationError(null);
    setFormBankName('Bank Mandiri');
    setFormBankCode('MANDIRI');
    setFormAccountNumber('');
    setFormAccountHolder('PT CAKRAWALA MAGNA SCIENTIA');
    setFormBranch('');
    setFormIsActive(true);
    setFormIsDefault(false);
    setIsBankModalOpen(true);
  };

  // Open Edit Bank Account Modal
  const handleOpenEditBank = (acc: AdminBankAccount) => {
    setEditingAccount(acc);
    setFormValidationError(null);
    setFormBankName(acc.bankName);
    setFormBankCode(acc.bankCode);
    setFormAccountNumber(acc.accountNumber);
    setFormAccountHolder(acc.accountHolder);
    setFormBranch(acc.branch || '');
    setFormIsActive(acc.isActive);
    setFormIsDefault(acc.isDefault ?? false);
    setIsBankModalOpen(true);
  };

  // Save Bank Account Modal
  const handleSaveBankModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAccountNumber.trim() || !formAccountHolder.trim()) {
      setFormValidationError('Nomor rekening dan nama pemilik rekening wajib diisi.');
      return;
    }

    let updatedAccounts: AdminBankAccount[];

    if (editingAccount) {
      updatedAccounts = settings.bankAccounts.map(acc => {
        if (acc.id === editingAccount.id) {
          return {
            ...acc,
            bankName: formBankName,
            bankCode: formBankCode,
            accountNumber: formAccountNumber.trim(),
            accountHolder: formAccountHolder.trim(),
            branch: formBranch.trim() || undefined,
            isActive: formIsActive,
            isDefault: formIsDefault
          };
        }
        if (formIsDefault) {
          return { ...acc, isDefault: false };
        }
        return acc;
      });
      showToast(`Rekening resmi ${formBankName} berhasil diperbarui.`);
    } else {
      const newAcc: AdminBankAccount = {
        id: `acc-${Date.now()}`,
        bankName: formBankName,
        bankCode: formBankCode,
        accountNumber: formAccountNumber.trim(),
        accountHolder: formAccountHolder.trim(),
        branch: formBranch.trim() || undefined,
        isActive: formIsActive,
        isDefault: formIsDefault
      };

      if (formIsDefault) {
        updatedAccounts = [newAcc, ...settings.bankAccounts.map(a => ({ ...a, isDefault: false }))];
      } else {
        updatedAccounts = [newAcc, ...settings.bankAccounts];
      }
      showToast(`Rekening korporat baru ${formBankName} berhasil ditambahkan.`);
    }

    persistSettings({
      ...settings,
      bankAccounts: updatedAccounts
    });
    setIsBankModalOpen(false);
  };

  // Save General Instruction & Contact Settings
  const handleSaveGeneralSettings = (e: React.FormEvent) => {
    e.preventDefault();
    persistSettings(settings);
    showToast('Pengaturan instruksi transfer & kontak verifikasi berhasil disimpan.');
  };

  // Reset defaults
  const handleConfirmResetDefaults = () => {
    const def = resetDefaultPaymentSettings();
    persistSettings(def);
    setIsResetConfirmOpen(false);
    showToast('Pengaturan pembayaran dikembalikan ke default.');
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="payment-management-module">
      {/* Toast */}
      {notification && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-2.5 text-xs font-semibold animate-slideUp">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
              MODUL PEMBAYARAN KORPORAT
            </span>
            <span className="text-xs text-slate-500 font-medium">Rekening Resmi PT Cakrawala Magna Scientia</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1 tracking-tight">
            Manajemen Rekening Bank & Payment Gateway
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola rekening bank resmi korporat untuk transfer manual, gateway Virtual Account, QRIS, serta panduan transfer pembeli.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsResetConfirmOpen(true)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Kembalikan ke setelan awal"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset Bawaan</span>
          </button>
        </div>
      </div>

      {/* 1. PAYMENT GATEWAYS TOGGLE SWITCHES */}
      <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#D4AF37]" />
              <span>Aktivasi Saluran Pembayaran (Payment Channels Toggle)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Saluran yang dinonaktifkan di sini otomatis disembunyikan dari halaman checkout publik pembeli.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* Channel 1: Manual Transfer */}
          <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 flex items-center justify-between transition-all">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center">
                <Building className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-xs block">Transfer Bank Manual</span>
                <span className="text-[11px] text-slate-500">Rekening Korporat Resmi</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleMethod('enableManualTransfer')}
              className={`w-10 h-5.5 rounded-full transition-colors relative p-0.5 cursor-pointer flex items-center ${
                settings.enableManualTransfer ? 'bg-slate-900' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-4.5 h-4.5 rounded-full bg-white shadow-xs transition-transform transform ${
                  settings.enableManualTransfer ? 'translate-x-4.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Channel 2: Midtrans Virtual Account */}
          <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 flex items-center justify-between transition-all">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-xs block">Virtual Account (Midtrans)</span>
                <span className="text-[11px] text-slate-500">BCA, Mandiri, BNI, BRI</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleMethod('enableMidtransVA')}
              className={`w-10 h-5.5 rounded-full transition-colors relative p-0.5 cursor-pointer flex items-center ${
                settings.enableMidtransVA ? 'bg-slate-900' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-4.5 h-4.5 rounded-full bg-white shadow-xs transition-transform transform ${
                  settings.enableMidtransVA ? 'translate-x-4.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Channel 3: QRIS Universal */}
          <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 flex items-center justify-between transition-all">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-xs block">QRIS Universal</span>
                <span className="text-[11px] text-slate-500">GoPay, OVO, ShopeePay, BCA</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleMethod('enableQris')}
              className={`w-10 h-5.5 rounded-full transition-colors relative p-0.5 cursor-pointer flex items-center ${
                settings.enableQris ? 'bg-slate-900' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-4.5 h-4.5 rounded-full bg-white shadow-xs transition-transform transform ${
                  settings.enableQris ? 'translate-x-4.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Channel 4: E-Wallets */}
          <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 flex items-center justify-between transition-all">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-xs block">Dompet Digital (e-Wallet)</span>
                <span className="text-[11px] text-slate-500">DANA, LinkAja, OVO</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleMethod('enableEWallet')}
              className={`w-10 h-5.5 rounded-full transition-colors relative p-0.5 cursor-pointer flex items-center ${
                settings.enableEWallet ? 'bg-slate-900' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-4.5 h-4.5 rounded-full bg-white shadow-xs transition-transform transform ${
                  settings.enableEWallet ? 'translate-x-4.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Channel 5: Kartu Kredit/Debit */}
          <div className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 flex items-center justify-between transition-all">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-xs block">Kartu Kredit / Debit</span>
                <span className="text-[11px] text-slate-500">Visa, Mastercard, JCB</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleMethod('enableCreditCard')}
              className={`w-10 h-5.5 rounded-full transition-colors relative p-0.5 cursor-pointer flex items-center ${
                settings.enableCreditCard ? 'bg-slate-900' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-4.5 h-4.5 rounded-full bg-white shadow-xs transition-transform transform ${
                  settings.enableCreditCard ? 'translate-x-4.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 2. BANK ACCOUNTS CRUD MANAGEMENT */}
      <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">
                Rekening Resmi Korporat (Transfer Bank Manual)
              </h3>
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                {settings.bankAccounts.length} Rekening
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Hanya rekening aktif bertanda korporat yang akan ditampilkan kepada pembeli pada saat checkout.
            </p>
          </div>

          <button
            id="btn-add-bank-account"
            onClick={handleOpenCreateBank}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-[#DFBF64] hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Tambah Rekening</span>
          </button>
        </div>

        {/* Bank Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {settings.bankAccounts.map(acc => (
            <div
              key={acc.id}
              className={`p-4 rounded-xl border transition-all space-y-3 ${
                acc.isActive
                  ? 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                  : 'bg-slate-50/70 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-[#DFBF64] font-mono font-bold text-xs flex items-center justify-center shrink-0">
                    {acc.bankCode.slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-xs sm:text-sm">{acc.bankName}</h4>
                      {acc.isDefault && (
                        <span className="text-[9px] font-semibold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-300 uppercase">
                          Utama
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">{acc.branch || 'Kantor Cabang Resmi'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditBank(acc)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    title="Edit Rekening"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteBankAccount(acc.id, acc.bankName, acc.accountNumber)}
                    className="p-1.5 rounded-lg border border-slate-200 text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Hapus Rekening"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Account Details Box */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block font-mono">NOMOR REKENING KORPORAT:</span>
                  <span className="font-mono text-sm font-bold text-slate-900 tracking-wide">
                    {acc.accountNumber}
                  </span>
                  <span className="text-[11px] font-medium text-slate-700 block mt-0.5">
                    a.n. {acc.accountHolder}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleBankAccount(acc.id)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer transition-colors border ${
                    acc.isActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-200 text-slate-600 border-slate-300'
                  }`}
                >
                  {acc.isActive ? 'Aktif' : 'Nonaktif'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. CONTACT & TRANSACTION INSTRUCTION FORM */}
      <form onSubmit={handleSaveGeneralSettings} className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#D4AF37]" />
              <span>Instruksi Transaksi & Kontak Verifikasi Bukti Pembayaran</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Teks ini muncul di konfirmasi akhir pembayaran pembeli dan faktur digital.
            </p>
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-[#DFBF64] hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Simpan Pengaturan</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Nomor WhatsApp Finance / Verifikasi Faktur:
            </label>
            <div className="relative">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={settings.adminNotificationWhatsapp}
                onChange={e => setSettings({ ...settings, adminNotificationWhatsapp: e.target.value })}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800 font-mono"
                placeholder="+6285286146806"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Pembeli dapat langsung konfirmasi dan mengirimkan bukti transfer ke WhatsApp Finance.
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Email Bagian Keuangan Penerbit:
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={settings.adminNotificationEmail}
                onChange={e => setSettings({ ...settings, adminNotificationEmail: e.target.value })}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                placeholder="finance@cakranexa.com"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Salinan rincian invoice dikirimkan ke email ini setiap ada pesanan baru.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              QRIS Merchant Name:
            </label>
            <input
              type="text"
              value={settings.qrisMerchantName}
              onChange={e => setSettings({ ...settings, qrisMerchantName: e.target.value })}
              className="w-full p-2 text-xs rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800 font-bold"
              placeholder="PT CAKRAWALA MAGNA SCIENTIA"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              QRIS NMID (National Merchant ID):
            </label>
            <input
              type="text"
              value={settings.qrisNmid}
              onChange={e => setSettings({ ...settings, qrisNmid: e.target.value })}
              className="w-full p-2 text-xs rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800 font-mono"
              placeholder="ID1020240988172"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Instruksi Transfer Manual (Tampil di Checkout & Nota):
          </label>
          <textarea
            rows={3}
            required
            value={settings.manualTransferInstructions}
            onChange={e => setSettings({ ...settings, manualTransferInstructions: e.target.value })}
            className="w-full p-2.5 text-xs rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
            placeholder="Silahkan transfer sesuai nominal ke nomor rekening resmi PT Cakrawala Magna Scientia di atas, lalu unggah bukti transfer."
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Catatan Sukses Transaksi (Tampil Setelah Verifikasi Pembayaran):
          </label>
          <textarea
            rows={2}
            value={settings.paymentSuccessNote}
            onChange={e => setSettings({ ...settings, paymentSuccessNote: e.target.value })}
            className="w-full p-2.5 text-xs rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
            placeholder="Pesanan buku akademik Anda telah tercatat dalam sistem CakraNexa. Faktur penjualan resmi dan nomor resi pelacakan ekspedisi akan dikirimkan otomatis ke email dan WhatsApp Anda."
          />
        </div>
      </form>

      {/* MODAL: ADD / EDIT BANK ACCOUNT */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-slate-200 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {editingAccount ? 'Edit Rekening Resmi Korporat' : 'Tambah Rekening Resmi Korporat'}
                </h3>
              </div>
              <button
                onClick={() => setIsBankModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-md hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formValidationError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formValidationError}</span>
              </div>
            )}

            <form onSubmit={handleSaveBankModal} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Pilihan Bank:</label>
                  <select
                    value={formBankCode}
                    onChange={e => {
                      const code = e.target.value;
                      setFormBankCode(code);
                      if (code === 'MANDIRI') setFormBankName('Bank Mandiri');
                      else if (code === 'BCA') setFormBankName('Bank Central Asia (BCA)');
                      else if (code === 'BNI') setFormBankName('Bank Negara Indonesia (BNI)');
                      else if (code === 'BRI') setFormBankName('Bank Rakyat Indonesia (BRI)');
                      else if (code === 'BSI') setFormBankName('Bank Syariah Indonesia (BSI)');
                    }}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800 bg-white"
                  >
                    <option value="MANDIRI">Bank Mandiri</option>
                    <option value="BCA">Bank BCA</option>
                    <option value="BNI">Bank BNI</option>
                    <option value="BRI">Bank BRI</option>
                    <option value="BSI">Bank BSI</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Lengkap Bank:</label>
                  <input
                    type="text"
                    required
                    value={formBankName}
                    onChange={e => setFormBankName(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                    placeholder="Contoh: Bank Mandiri"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nomor Rekening (Mandatory):</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: 167-00-1164499-3"
                  value={formAccountNumber}
                  onChange={e => setFormAccountNumber(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Atas Nama / Pemilik Rekening:</label>
                <input
                  type="text"
                  required
                  value={formAccountHolder}
                  onChange={e => setFormAccountHolder(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800 uppercase font-semibold"
                  placeholder="PT CAKRAWALA MAGNA SCIENTIA"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Preset resmi: PT CAKRAWALA MAGNA SCIENTIA (dapat disesuaikan jika perlu)
                </span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Kantor Cabang / KC (Opsional):</label>
                <input
                  type="text"
                  value={formBranch}
                  onChange={e => setFormBranch(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                  placeholder="Contoh: KC Jakarta Salemba Raya"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={e => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 cursor-pointer"
                  />
                  <span>Rekening Aktif (Tampil di Checkout)</span>
                </label>

                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={e => setFormIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 cursor-pointer"
                  />
                  <span>Jadikan Rekening Utama</span>
                </label>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-200">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-slate-900 text-[#DFBF64] font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {editingAccount ? 'Simpan Perubahan' : 'Tambahkan Rekening'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsBankModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE BANK CONFIRMATION MODAL */}
      {deleteBankConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">
                Hapus Rekening {deleteBankConfirm.name}?
              </h4>
              <p className="text-xs text-slate-500 font-mono">
                No. Rekening: {deleteBankConfirm.accountNumber}
              </p>
            </div>
            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Tindakan ini akan menghapus rekening resmi korporat dari opsi transfer manual di halaman checkout pembeli. Perubahan akan langsung disinkronkan ke seluruh sistem.
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteBankConfirm(null)}
                className="py-2.5 px-3 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteBank}
                className="py-2.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                Ya, Hapus Rekening
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET PAYMENT CONFIRMATION MODAL */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">
                Reset Pengaturan Pembayaran?
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Semua rekening resmi, instruksi transfer, dan konfigurasi saluran pembayaran akan dikembalikan ke setelan bawaan PT CAKRAWALA MAGNA SCIENTIA.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="py-2.5 px-3 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmResetDefaults}
                className="py-2.5 px-3 rounded-lg bg-slate-900 text-[#DFBF64] hover:bg-slate-800 text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                Ya, Reset Bawaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

