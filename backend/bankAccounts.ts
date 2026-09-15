/**
 * Rekening bank perusahaan (tabel admin_bank_accounts, dikelola di CMS tab Pembayaran).
 * Dipakai endpoint admin, endpoint publik untuk transfer manual di checkout buku cetak, dan invoice institusi fase 4.
 */
export type BankAccountRow = {
  id: string;
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_holder: string;
  branch: string | null;
  is_active: boolean;
  is_default: boolean;
};

export const BANK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const rowToBankAccount = (row: any) => ({
  id: row.id,
  bankName: row.bank_name,
  bankCode: row.bank_code,
  accountNumber: row.account_number,
  accountHolder: row.account_holder,
  branch: row.branch || undefined,
  isActive: row.is_active !== false,
  isDefault: Boolean(row.is_default)
});

/** Rekening untuk pembeli: hanya yang aktif, rekening utama lebih dulu, tanpa kolom internal (waktu dibuat/diubah). */
export const publicBankAccounts = (rows: any[]) =>
  rows
    .filter((row) => row && row.is_active !== false)
    .map(rowToBankAccount)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
