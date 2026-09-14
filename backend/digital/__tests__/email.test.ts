import { describe, expect, it } from 'vitest';
import { anomalyAlertEmail, purchaseConfirmationEmail } from '../email';
import type { OrderRecord } from '../types';

const order = (language: string, customerName = 'Budi <Pembeli>'): OrderRecord => ({
  id: 'o-1',
  orderNumber: 'DIG-20260913-ABCDEF0123',
  userId: 'u-1',
  idempotencyKey: 'k',
  status: 'paid',
  amount: 99000,
  customerName,
  customerEmail: 'budi@uji.id',
  language,
  licenseAcceptedAt: '2026-09-13T00:00:00.000Z',
  licenseVersion: 'v1',
  snapToken: null,
  snapRedirectUrl: null,
  midtransTransactionId: null,
  midtransStatus: 'settlement',
  paymentType: null,
  fraudStatus: null,
  paidAt: '2026-09-13T00:00:00.000Z',
  refundedAt: null,
  confirmationSentAt: null,
  isTest: false,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
  items: [{ productId: 'p-1', bookId: 'book-3', format: 'ebook', title: 'Reformulasi Mekanisme PPN (E-Book)', unitPrice: 99000 }]
});

describe('email konfirmasi pembelian', () => {
  it.each([
    ['id', 'Pembelian digital berhasil', 'https://cakranexa.test/library', 'Buka Pustaka Saya'],
    ['en', 'Your digital purchase is ready', 'https://cakranexa.test/en/library', 'Open My Library'],
    ['zh', '数字产品购买成功', 'https://cakranexa.test/zh/library', '打开我的书库']
  ])('bahasa %s: subjek, tautan Pustaka Saya berbahasa sama, tanpa file', (language, subject, link, button) => {
    const email = purchaseConfirmationEmail(order(language), 'https://cakranexa.test');
    expect(email.subject).toContain(subject);
    expect(email.subject).toContain('DIG-20260913-ABCDEF0123');
    expect(email.html).toContain(`href="${link}"`);
    expect(email.html).toContain(button);
    expect(email.html).toContain('Rp 99.000');
    expect(email.html).not.toMatch(/\.pdf|\.mp3|\.m3u8|storage|signed|download/i);
    // Nama pembeli di-escape.
    expect(email.html).toContain('Budi &lt;Pembeli&gt;');
    expect(email.html).not.toContain('<Pembeli>');
  });

  it('bahasa tak dikenal jatuh ke bahasa Indonesia', () => {
    expect(purchaseConfirmationEmail(order('fr'), 'https://cakranexa.test').subject).toContain('Pembelian digital berhasil');
  });
});

describe('email anomali untuk admin', () => {
  it('berisi pengguna, aturan, produk, tindakan, dan tautan admin; data di-escape', () => {
    const email = anomalyAlertEmail([
      { rule: 'page_speed', userEmail: 'a@uji.id', userName: 'A <b>', productTitle: 'Buku (E-Book)', actionTaken: 'suspended', details: { fast_windows: 3 } },
      { rule: 'ip_spread', userEmail: 'b@uji.id', userName: '', productTitle: null, actionTaken: 'flagged', details: {} }
    ], 'https://cakranexa.test/admin');
    expect(email.subject).toContain('2 anomali');
    expect(email.html).toContain('A &lt;b&gt;');
    expect(email.html).toContain('ditangguhkan otomatis');
    expect(email.html).toContain('ditandai untuk ditinjau');
    expect(email.html).toContain('https://cakranexa.test/admin');
  });
});
