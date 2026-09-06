import { PaymentSettings, AdminBankAccount } from '../types';

export const DEFAULT_BANK_ACCOUNTS: AdminBankAccount[] = [
  {
    id: 'acc-mandiri',
    bankName: 'Bank Mandiri',
    bankCode: 'MANDIRI',
    accountNumber: '137-00-2884910-2',
    accountHolder: 'PT CAKRAWALA MAGNA SCIENTIA',
    branch: 'KC Jakarta Salemba Raya',
    isActive: true,
    isDefault: true
  },
  {
    id: 'acc-bca',
    bankName: 'Bank Central Asia (BCA)',
    bankCode: 'BCA',
    accountNumber: '542-098-7712',
    accountHolder: 'PT CAKRAWALA MAGNA SCIENTIA',
    branch: 'KCU Matraman Jakarta',
    isActive: true,
    isDefault: false
  },
  {
    id: 'acc-bni',
    bankName: 'Bank Negara Indonesia (BNI)',
    bankCode: 'BNI',
    accountNumber: '028-199-3401',
    accountHolder: 'PT CAKRAWALA MAGNA SCIENTIA',
    branch: 'KC Salemba Raya',
    isActive: true,
    isDefault: false
  },
  {
    id: 'acc-bsi',
    bankName: 'Bank Syariah Indonesia (BSI)',
    bankCode: 'BSI',
    accountNumber: '719-204-8833',
    accountHolder: 'PT CAKRAWALA MAGNA SCIENTIA',
    branch: 'KCP Kramat Raya',
    isActive: false,
    isDefault: false
  }
];

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  enableManualTransfer: true,
  enableMidtransVA: true,
  enableQris: true,
  enableEWallet: true,
  enableCreditCard: true,

  bankAccounts: DEFAULT_BANK_ACCOUNTS,

  qrisMerchantName: 'PT CAKRAWALA MAGNA SCIENTIA',
  qrisNmid: 'ID1020240988172',
  qrisImageUrl: '',

  adminNotificationWhatsapp: '+6281288992341',
  adminNotificationEmail: 'finance@cakranexa.com',
  manualTransferInstructions: 'Silakan transfer sesuai total tagihan pembayaran ke salah satu nomor rekening resmi penerbit di atas. Simpan bukti transfer (struk ATM / screenshot m-Banking) dan unggah pada formulir verifikasi atau konfirmasi ke WhatsApp Finance Redaksi.',
  paymentSuccessNote: 'Pesanan buku akademik Anda telah tercatat dalam sistem CakraNexa. Faktur penjualan resmi dan nomor resi pelacakan ekspedisi akan dikirimkan otomatis ke email dan WhatsApp Anda.'
};

const PAYMENT_STORAGE_KEY = 'cakranexa_payment_settings';

export const getStoredPaymentSettings = (): PaymentSettings => {
  if (typeof window === 'undefined') return DEFAULT_PAYMENT_SETTINGS;
  try {
    const raw = localStorage.getItem(PAYMENT_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(DEFAULT_PAYMENT_SETTINGS));
      return DEFAULT_PAYMENT_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PAYMENT_SETTINGS,
      ...parsed,
      bankAccounts: Array.isArray(parsed.bankAccounts)
        ? parsed.bankAccounts
        : DEFAULT_BANK_ACCOUNTS
    };
  } catch (err) {
    console.error('Error reading payment settings from localStorage:', err);
    return DEFAULT_PAYMENT_SETTINGS;
  }
};

export const saveStoredPaymentSettings = (settings: PaymentSettings): void => {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      ...settings,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(payload));
    
    // Broadcast event across windows and in-app components
    window.dispatchEvent(new CustomEvent('cakranexa_payment_settings_updated', { detail: payload }));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.error('Error saving payment settings to localStorage:', err);
  }
};

export const resetDefaultPaymentSettings = (): PaymentSettings => {
  saveStoredPaymentSettings(DEFAULT_PAYMENT_SETTINGS);
  return DEFAULT_PAYMENT_SETTINGS;
};
