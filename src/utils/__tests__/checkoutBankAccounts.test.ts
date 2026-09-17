import { describe, expect, it } from 'vitest';
import { resolveCheckoutBankAccounts } from '../checkoutBankAccounts';
import { DEFAULT_BANK_ACCOUNTS } from '../../services/paymentService';
import type { AdminBankAccount } from '../../types';

const account = (over: Partial<AdminBankAccount>): AdminBankAccount => ({
  id: 'acc-uji', bankName: 'Bank Uji', bankCode: 'UJI', accountNumber: '000-00-0000000-0',
  accountHolder: 'PT UJI CAKRANEXA', isActive: true, isDefault: false, ...over
});

describe('rekening transfer manual di checkout buku cetak', () => {
  it('memakai rekening aktif dari server (admin_bank_accounts) sesuai urutan server', () => {
    const server = [account({ id: 'acc-bca', bankName: 'BCA', isDefault: true }), account({ id: 'acc-bni', bankName: 'BNI' })];
    expect(resolveCheckoutBankAccounts(server, DEFAULT_BANK_ACCOUNTS).map((a) => a.id)).toEqual(['acc-bca', 'acc-bni']);
  });

  it('memakai rekening bawaan Bank Mandiri resmi (IDR utama, lalu USD untuk pembayaran luar negeri) bila server belum menjawab, gagal, atau tanpa rekening aktif', () => {
    for (const server of [null, [], [account({ isActive: false })]]) {
      expect(resolveCheckoutBankAccounts(server, DEFAULT_BANK_ACCOUNTS).map((a) => [a.accountNumber, a.currency])).toEqual([
        ['167-00-1164499-3', 'IDR'],
        ['167-00-1171867-2', 'USD']
      ]);
    }
  });

  it('rekening nonaktif di daftar cadangan tidak ditampilkan', () => {
    const fallback = [...DEFAULT_BANK_ACCOUNTS, account({ id: 'acc-mati', isActive: false })];
    expect(resolveCheckoutBankAccounts(null, fallback).map((a) => a.id)).toEqual(['acc-mandiri', 'acc-mandiri-usd']);
  });
});
