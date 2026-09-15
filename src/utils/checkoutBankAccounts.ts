import type { AdminBankAccount } from '../types';

/**
 * Rekening transfer manual yang ditampilkan di checkout buku cetak: rekening aktif dari server (admin_bank_accounts,
 * diatur di CMS tab Pembayaran, sudah berurutan rekening utama lebih dulu). Selama server belum menjawab, tidak
 * terjangkau, atau tidak punya rekening aktif, dipakai rekening tersimpan/bawaan (Bank Mandiri resmi).
 */
export const resolveCheckoutBankAccounts = (
  server: AdminBankAccount[] | null,
  fallback: AdminBankAccount[]
): AdminBankAccount[] => {
  const fromServer = (server ?? []).filter((account) => account.isActive);
  return fromServer.length > 0 ? fromServer : fallback.filter((account) => account.isActive);
};
