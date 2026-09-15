import React from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import checkoutId from '../../i18n/locales/id/checkout.json';
import { CheckoutBankAccountList } from '../CheckoutBankAccountList';
import { resolveCheckoutBankAccounts } from '../../utils/checkoutBankAccounts';
import { DEFAULT_BANK_ACCOUNTS } from '../../services/paymentService';
import type { AdminBankAccount } from '../../types';

// Snapshot tampilan rekening transfer manual di modal checkout buku cetak (Bahasa Indonesia).
const SERVER_ACCOUNTS: AdminBankAccount[] = [
  { id: 'acc-uji-utama', bankName: 'Bank Uji', bankCode: 'UJI', accountNumber: '000-00-1111111-1', accountHolder: 'PT UJI CAKRANEXA', branch: 'KC Uji', isActive: true, isDefault: true },
  { id: 'acc-uji-kedua', bankName: 'Bank Uji Dua', bankCode: 'UJI2', accountNumber: '000-222-3333', accountHolder: 'PT UJI CAKRANEXA', isActive: true, isDefault: false }
];

const render = (accounts: AdminBankAccount[], copiedId: string | null = null) =>
  renderToStaticMarkup(<CheckoutBankAccountList accounts={accounts} copiedId={copiedId} onCopy={() => undefined} />);

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'id',
    resources: { id: { checkout: checkoutId } },
    ns: ['checkout'],
    defaultNS: 'checkout',
    interpolation: { escapeValue: false }
  });
});

describe('checkout buku cetak: rekening transfer manual', () => {
  it('rekening dari server (admin_bank_accounts)', () => {
    const html = render(resolveCheckoutBankAccounts(SERVER_ACCOUNTS, DEFAULT_BANK_ACCOUNTS));
    expect(html).toContain('000-00-1111111-1');
    expect(html).toContain('000-222-3333');
    expect(html).not.toContain('167-00-1164499-3');
    expect(html).toMatchSnapshot();
  });

  it('cadangan saat server tidak terjangkau: Bank Mandiri resmi', () => {
    const html = render(resolveCheckoutBankAccounts(null, DEFAULT_BANK_ACCOUNTS));
    expect(html).toContain('167-00-1164499-3');
    expect(html).toContain('PT CAKRAWALA MAGNA SCIENTIA');
    expect(html).toMatchSnapshot();
  });

  it('tombol salin berganti label setelah nomor disalin', () => {
    const html = render(SERVER_ACCOUNTS, 'acc-uji-kedua');
    expect(html.match(/Tersalin|Disalin/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});
