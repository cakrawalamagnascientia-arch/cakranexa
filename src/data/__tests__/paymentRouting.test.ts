import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYMENT_ROUTING, enabledPrintMethods, normalizeRouting, printProviderFor, ROUTING_METHODS } from '../paymentRouting';

describe('payment_routing checkout buku cetak', () => {
  it('bawaan: hanya "Transfer Bank ke rekening PT"; semua metode lain off', () => {
    expect(DEFAULT_PAYMENT_ROUTING).toHaveLength(ROUTING_METHODS.length);
    expect(enabledPrintMethods(DEFAULT_PAYMENT_ROUTING, { midtransEnabled: true })).toEqual(['bank_transfer']);
    expect(printProviderFor(DEFAULT_PAYMENT_ROUTING, 'bca_va', { midtransEnabled: true })).toBe('off');
    expect(printProviderFor(DEFAULT_PAYMENT_ROUTING, 'manual_mandiri', { midtransEnabled: false })).toBe('manual');
  });

  it('metode Midtrans aktif hanya bila admin menyalakannya dan Midtrans terkonfigurasi; Xendit belum terpasang = off', () => {
    const routing = normalizeRouting([
      { transactionType: 'print', method: 'va_bca', provider: 'midtrans' },
      { transactionType: 'print', method: 'qris', provider: 'xendit' }
    ]);
    expect(enabledPrintMethods(routing, { midtransEnabled: true })).toEqual(['bank_transfer', 'bca_va']);
    expect(enabledPrintMethods(routing, { midtransEnabled: false })).toEqual(['bank_transfer']);
    expect(printProviderFor(routing, 'qris', { midtransEnabled: true })).toBe('off');
  });

  it('baris tidak valid memakai bawaan (transfer bank tidak bisa diarahkan ke gateway)', () => {
    const routing = normalizeRouting([
      { transactionType: 'print', method: 'bank_transfer', provider: 'midtrans' },
      { transactionType: 'print', method: 'va_bni', provider: 'manual' }
    ]);
    expect(routing.find((r) => r.method === 'bank_transfer')?.provider).toBe('manual');
    expect(routing.find((r) => r.method === 'va_bni')?.provider).toBe('off');
  });
});
