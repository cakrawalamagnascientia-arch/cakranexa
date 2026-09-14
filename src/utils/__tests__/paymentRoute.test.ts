import { describe, expect, it } from 'vitest';
import { buildPath, parseLocation } from '../router';
import { parsePaymentQuery, paymentOrderKind } from '../paymentResult';

/** Halaman hasil pembayaran Midtrans: /payment/success & /payment/failed (dengan prefix bahasa) dan query redirect. */
describe('rute /payment', () => {
  const midtrans = '?order_id=CNX-202609-123456&status_code=200&transaction_status=settlement';

  it('Finish/Error Redirect URL Midtrans dibuka sebagai halaman pembayaran dengan query utuh', () => {
    expect(parseLocation('/payment/success', midtrans)).toEqual({ page: 'payment', subSection: 'success', query: midtrans.slice(1) });
    expect(parseLocation('/payment/failed', '?order_id=CNX-1&transaction_status=deny')).toMatchObject({ page: 'payment', subSection: 'failed' });
    expect(parseLocation('/en/payment/failed', '?order_id=CNX-1')).toMatchObject({ page: 'payment', subSection: 'failed', query: 'order_id=CNX-1' });
    expect(parseLocation('/payment', '')).toMatchObject({ page: 'payment', subSection: 'success' });
  });

  it('URL dibangun ulang tanpa kehilangan query, dengan prefix bahasa', () => {
    const state = { page: 'payment' as const, subSection: 'failed' as const, query: 'order_id=CNX-1&transaction_status=expire' };
    expect(buildPath(state, 'id')).toBe('/payment/failed?order_id=CNX-1&transaction_status=expire');
    expect(buildPath(state, 'zh')).toBe('/zh/payment/failed?order_id=CNX-1&transaction_status=expire');
    expect(buildPath({ page: 'payment', subSection: 'success' }, 'en')).toBe('/en/payment/success');
  });

  it('jenis pesanan dari awalan nomor; nomor tidak wajar diabaikan', () => {
    expect(parsePaymentQuery(midtrans.slice(1))).toEqual({ orderId: 'CNX-202609-123456', kind: 'print', transactionStatus: 'settlement' });
    expect(paymentOrderKind('DIG-20260914-ABCDE')).toBe('digital');
    expect(paymentOrderKind('SUB-20260914-1')).toBe('membership');
    expect(paymentOrderKind('INST-INV-INST-2026-0001-1')).toBe('institution');
    expect(parsePaymentQuery('order=DIG-X1&transaction_status=CANCEL')).toEqual({ orderId: 'DIG-X1', kind: 'digital', transactionStatus: 'cancel' });
    expect(parsePaymentQuery('order_id=%3Cscript%3E')).toMatchObject({ orderId: null, kind: 'unknown' });
    expect(parsePaymentQuery('')).toMatchObject({ orderId: null, kind: 'unknown', transactionStatus: '' });
  });
});
