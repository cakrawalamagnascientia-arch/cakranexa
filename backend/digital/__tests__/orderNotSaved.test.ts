import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createTestApp, mintUserToken, USER_A } from './harness';
import { ORDER_NOT_SAVED_MESSAGE } from '../errors';

/**
 * Hotfix: bila pesanan/tagihan gagal disimpan, tidak ada transaksi Midtrans yang dibuat dan pembeli mendapat 503
 * dengan pesan "Pesanan belum dapat diproses, coba lagi." (checkout digital dan keanggotaan; buku cetak ada di
 * backend/__tests__/printOrders.test.ts).
 */

const SERVER_KEY = 'SB-Mid-server-UJI';
const sign = (orderId: string, statusCode: string, grossAmount: string) =>
  crypto.createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`).digest('hex');
const settlement = (orderId: string, amount: number) => {
  const gross = `${amount}.00`;
  return {
    order_id: orderId,
    status_code: '200',
    gross_amount: gross,
    transaction_status: 'settlement',
    transaction_id: `trx-${orderId}`,
    payment_type: 'bank_transfer',
    signature_key: sign(orderId, '200', gross)
  };
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const dbDown = (): never => {
  throw new Error('connection terminated unexpectedly');
};

describe('checkout digital: pesanan gagal disimpan', () => {
  it('insert pesanan gagal -> 503 order_not_saved, tanpa panggilan Midtrans', async () => {
    const snapCalls: unknown[] = [];
    const t = await createTestApp({
      fetchImpl: (async (_url: string, init: RequestInit) => {
        snapCalls.push(init.body);
        return new Response(JSON.stringify({ token: 'snap-x', redirect_url: 'https://pay.test/x' }), { status: 201 });
      }) as unknown as typeof fetch
    });
    cleanups.push(t.cleanup);
    t.store.createOrder = async () => dbDown();
    const token = await mintUserToken(USER_A);
    const res = await request(t.app).post('/api/digital/checkout').set('Authorization', `Bearer ${token}`)
      .send({ items: ['prod-ebook-1'], idempotency_key: `tes-${crypto.randomUUID()}`, license_accepted: true });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'order_not_saved', error: ORDER_NOT_SAVED_MESSAGE });
    expect(snapCalls).toHaveLength(0);
  });
});

describe('keanggotaan: langganan/tagihan gagal disimpan', () => {
  const setup = async () => {
    const snapPayloads: unknown[] = [];
    const t = await createTestApp({
      midtransClient: {
        createTransaction: async (payload) => {
          snapPayloads.push(payload);
          return { token: `snap-${snapPayloads.length}`, redirectUrl: 'https://pay.test/snap' };
        }
      }
    });
    cleanups.push(t.cleanup);
    const token = await mintUserToken(USER_A);
    const post = (path: string, body: Record<string, unknown>) =>
      request(t.app).post(path).set('Authorization', `Bearer ${token}`).send(body);
    const subscribe = (body: Record<string, unknown> = {}) => post('/api/membership/subscribe', {
      plan_code: 'professional',
      billing_cycle: 'yearly',
      payment_method: 'va',
      idempotency_key: `kunci-${crypto.randomUUID()}`,
      accept_terms: true,
      accept_license: true,
      ...body
    });
    const professional = t.store.plans.find((p) => p.code === 'professional')!;
    return { ...t, snapPayloads, post, subscribe, professional };
  };

  it('langganan gagal disimpan -> 503 tanpa Snap; kursi Founding dilepas', async () => {
    const t = await setup();
    const before = t.professional.foundingCount;
    t.store.createSubscription = async () => dbDown();
    const res = await t.subscribe();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'order_not_saved', error: ORDER_NOT_SAVED_MESSAGE });
    expect(t.snapPayloads).toHaveLength(0);
    expect(t.professional.foundingCount).toBe(before);
  });

  it('tagihan gagal disimpan -> 503 tanpa Snap; langganan pending ditutup dan kursi Founding dilepas', async () => {
    const t = await setup();
    const before = t.professional.foundingCount;
    t.store.createInvoice = async () => dbDown();
    const res = await t.subscribe();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'order_not_saved', error: ORDER_NOT_SAVED_MESSAGE });
    expect(t.snapPayloads).toHaveLength(0);
    expect(t.professional.foundingCount).toBe(before);
    expect(await t.phase2.membership!.openSubscription(USER_A.id)).toBeFalsy();
    expect(t.store.subscriptions.find((s) => s.userId === USER_A.id)).toMatchObject({ status: 'expired', endedReason: 'invoice_error' });
  });

  it('tagihan upgrade gagal disimpan -> 503 tanpa Snap; keanggotaan berjalan tidak berubah', async () => {
    const t = await setup();
    const joined = await t.subscribe({ plan_code: 'reader', billing_cycle: 'monthly' });
    expect(joined.status).toBe(201);
    const invoice = (await t.store.getInvoice(joined.body.invoice.id))!;
    const paid = await t.phase2.handleMembershipNotification!(settlement(invoice.midtransOrderId!, invoice.amount));
    expect(paid.body.status).toBe('success');
    const snapsBefore = t.snapPayloads.length;

    t.store.createInvoice = async () => dbDown();
    const change = await t.post('/api/membership/change', { plan_code: 'professional', billing_cycle: 'monthly' });
    expect(change.status).toBe(503);
    expect(change.body).toMatchObject({ code: 'order_not_saved', error: ORDER_NOT_SAVED_MESSAGE });
    expect(t.snapPayloads).toHaveLength(snapsBefore);
    expect(await t.phase2.membership!.openSubscription(USER_A.id)).toMatchObject({ planId: 'plan-reader', status: 'active' });
  });
});
