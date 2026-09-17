import { describe, expect, it } from 'vitest';
import { BANK_ID_RE, publicBankAccounts, rowToBankAccount } from '../bankAccounts';

const row = (over: Record<string, unknown>) => ({
  id: 'acc-uji',
  bank_name: 'Bank Uji',
  bank_code: 'UJI',
  account_number: '000-00-0000000-0',
  account_holder: 'PT UJI CAKRANEXA',
  branch: null,
  is_active: true,
  is_default: false,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
  ...over
});

describe('rekening bank perusahaan (admin_bank_accounts)', () => {
  it('endpoint publik: hanya rekening aktif, rekening utama lebih dulu, tanpa kolom internal', () => {
    const rows = [
      row({ id: 'acc-bca', bank_name: 'BCA', bank_code: 'BCA', account_number: '000-111-2222' }),
      row({ id: 'acc-lama', bank_name: 'Bank Lama', account_number: '999-999-9999', is_active: false }),
      row({ id: 'acc-mandiri', bank_name: 'Bank Mandiri', bank_code: 'MANDIRI', account_number: '000-00-1111111-1', branch: 'KC Uji', is_default: true })
    ];
    const accounts = publicBankAccounts(rows);
    expect(accounts).toEqual([
      { id: 'acc-mandiri', bankName: 'Bank Mandiri', bankCode: 'MANDIRI', accountNumber: '000-00-1111111-1', accountHolder: 'PT UJI CAKRANEXA', branch: 'KC Uji', currency: 'IDR', isActive: true, isDefault: true },
      { id: 'acc-bca', bankName: 'BCA', bankCode: 'BCA', accountNumber: '000-111-2222', accountHolder: 'PT UJI CAKRANEXA', branch: undefined, currency: 'IDR', isActive: true, isDefault: false }
    ]);
    expect(JSON.stringify(accounts)).not.toMatch(/created_at|updated_at|Bank Lama/);
  });

  it('bentuk data admin tidak berubah (rekening nonaktif tetap terbaca di CMS)', () => {
    expect(rowToBankAccount(row({ is_active: false }))).toMatchObject({ id: 'acc-uji', isActive: false, isDefault: false });
    expect(BANK_ID_RE.test('acc-mandiri')).toBe(true);
    expect(BANK_ID_RE.test('acc mandiri')).toBe(false);
  });
});
