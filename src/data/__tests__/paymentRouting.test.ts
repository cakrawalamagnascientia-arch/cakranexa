import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_ROUTING,
  digitalUnitSalesEnabled,
  enabledPrintMethods,
  enabledRoutingMethods,
  MANAGED_ROUTING_TYPES,
  normalizeRouting,
  printProviderFor,
  ROUTING_METHODS
} from '../paymentRouting';

describe('payment_routing fase 6: pembelian satuan digital dan keanggotaan', () => {
  it('bawaan: pembelian satuan tertutup; keanggotaan hanya transfer bank manual', () => {
    expect(digitalUnitSalesEnabled(DEFAULT_PAYMENT_ROUTING, { midtransEnabled: true })).toBe(false);
    expect(enabledRoutingMethods(DEFAULT_PAYMENT_ROUTING, 'digital', { midtransEnabled: true })).toEqual([]);
    expect(enabledRoutingMethods(DEFAULT_PAYMENT_ROUTING, 'membership', { midtransEnabled: true })).toEqual([{ method: 'bank_transfer', provider: 'manual' }]);
  });

  it('satuan terbuka lagi hanya bila admin mengarahkan metode digital ke Midtrans dan Midtrans terkonfigurasi', () => {
    const routing = normalizeRouting([
      { transactionType: 'digital', method: 'qris', provider: 'midtrans' },
      { transactionType: 'digital', method: 'bank_transfer', provider: 'manual' }
    ]);
    expect(digitalUnitSalesEnabled(routing, { midtransEnabled: true })).toBe(true);
    expect(digitalUnitSalesEnabled(routing, { midtransEnabled: false })).toBe(false);
    // Transfer manual saja tidak membuka checkout satuan (checkout satuan hanya lewat Snap).
    expect(digitalUnitSalesEnabled(normalizeRouting([{ transactionType: 'digital', method: 'bank_transfer', provider: 'manual' }]), { midtransEnabled: true })).toBe(false);
  });

  it('baris jenis transaksi yang tidak dikelola diabaikan', () => {
    const routing = normalizeRouting([{ transactionType: 'institution', method: 'qris', provider: 'midtrans' }]);
    expect(routing.some((r) => r.transactionType === 'institution')).toBe(false);
  });
});

describe('payment_routing checkout buku cetak', () => {
  it('bawaan: hanya "Transfer Bank ke rekening PT"; semua metode lain off', () => {
    expect(DEFAULT_PAYMENT_ROUTING).toHaveLength(ROUTING_METHODS.length * MANAGED_ROUTING_TYPES.length);
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
