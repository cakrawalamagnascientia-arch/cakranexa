import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createTestApp, mintUserToken, USER_A, USER_B } from './harness';

const SERVER_KEY = 'SB-Mid-server-UJI';
const snapOk = (async () => new Response(JSON.stringify({ token: 'snap-uji', redirect_url: null }), { status: 201 })) as unknown as typeof fetch;

const settlement = (orderId: string, amount: number) => {
  const gross = `${amount}.00`;
  return {
    order_id: orderId,
    status_code: '200',
    gross_amount: gross,
    transaction_status: 'settlement',
    transaction_id: `trx-${orderId}`,
    signature_key: crypto.createHash('sha512').update(`${orderId}200${gross}${SERVER_KEY}`).digest('hex')
  };
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const setup = async (env: Record<string, string>) => {
  const t = await createTestApp({ env, fetchImpl: snapOk });
  cleanups.push(t.cleanup);
  const tokenA = await mintUserToken(USER_A);
  const tokenB = await mintUserToken(USER_B);
  const as = (token: string | null, method: 'get' | 'post' | 'delete', path: string) => {
    const req = request(t.app)[method](path);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };
  const buy = (token: string, items: string[]) =>
    as(token, 'post', '/api/digital/checkout').send({ items, idempotency_key: `uji-${crypto.randomUUID()}`, license_accepted: true });
  return { ...t, tokenA, tokenB, as, buy };
};

describe('flag DIGITAL_ENABLED & DIGITAL_BETA_EMAILS', () => {
  it('flag mati: endpoint pembeli 404 digital_disabled kecuali email beta; akun & admin tetap berjalan', async () => {
    const t = await setup({ DIGITAL_ENABLED: 'false', DIGITAL_BETA_EMAILS: ` ${USER_A.email.toUpperCase()} , bukan-email` });
    expect((await t.as(null, 'get', '/api/digital/status')).body).toEqual({ enabled: false, beta: false, unitSales: true });
    expect((await t.as(t.tokenA, 'get', '/api/digital/status')).body).toEqual({ enabled: true, beta: true, unitSales: true });
    expect((await t.as(t.tokenB, 'get', '/api/digital/status')).body).toEqual({ enabled: false, beta: false, unitSales: true });
    expect((await t.as('token-rusak', 'get', '/api/digital/status')).body).toEqual({ enabled: false, beta: false, unitSales: true });

    for (const path of ['/api/library', '/api/digital/orders', '/api/devices']) {
      const res = await t.as(t.tokenB, 'get', path);
      expect(res.status, path).toBe(404);
      expect(res.body.code, path).toBe('digital_disabled');
    }
    const blockedBuy = await t.buy(t.tokenB, ['prod-ebook-1']);
    expect(blockedBuy.body.code).toBe('digital_disabled');
    expect(t.store.orders).toHaveLength(0);
    expect((await t.as(t.tokenB, 'post', '/api/access/prod-ebook-1/session/start').send({ deviceId: 'perangkat-uji-1-abcdefghij' })).body.code).toBe('digital_disabled');

    // Penguji beta tetap bisa.
    expect((await t.as(t.tokenA, 'get', '/api/library')).status).toBe(200);
    expect((await t.buy(t.tokenA, ['prod-ebook-1'])).status).toBe(201);

    // Akun (untuk login penguji) dan admin tidak terkena flag.
    expect((await t.as(t.tokenB, 'get', '/api/account/me')).body).toMatchObject({ user: { email: USER_B.email }, digitalEnabled: false });
    expect((await t.as(null, 'get', '/api/admin/digital/processing').set('x-test-admin', '1')).status).toBe(200);
    // Belum login tetap 401 (bukan 404).
    expect((await t.as(null, 'get', '/api/library')).status).toBe(401);
  });

  it('flag hidup: semua pengguna login bisa memakai fitur digital', async () => {
    const t = await setup({ DIGITAL_ENABLED: 'true' });
    expect((await t.as(null, 'get', '/api/digital/status')).body).toEqual({ enabled: true, beta: false, unitSales: true });
    expect((await t.as(t.tokenB, 'get', '/api/library')).status).toBe(200);
  });

  it('pesanan email beta ditandai is_test, dikecualikan dari ringkasan; hapus pesanan uji tidak menyentuh pesanan asli', async () => {
    const t = await setup({ DIGITAL_ENABLED: 'true', DIGITAL_BETA_EMAILS: USER_A.email });
    const testOrder = (await t.buy(t.tokenA, ['prod-ebook-1'])).body.order.orderNumber;
    const realOrder = (await t.buy(t.tokenB, ['prod-ebook-1'])).body.order.orderNumber;
    expect((await t.store.getOrderByNumber(testOrder))?.isTest).toBe(true);
    expect((await t.store.getOrderByNumber(realOrder))?.isTest).toBe(false);
    await t.phase2.handleMidtransNotification!(settlement(testOrder, 99000));
    await t.phase2.handleMidtransNotification!(settlement(realOrder, 99000));
    expect(t.store.entitlements).toHaveLength(2);

    expect((await t.as(null, 'get', '/api/admin/digital-access/orders/summary')).status).toBe(401);
    const summary = await t.as(null, 'get', '/api/admin/digital-access/orders/summary').set('x-test-admin', '1');
    expect(summary.status).toBe(200);
    expect(summary.body.summary).toMatchObject({ paidCount: 1, revenue: 99000, itemsSold: 1 });
    expect(summary.body.recent.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([realOrder]);
    expect(summary.body.test).toMatchObject({ count: 1, paidCount: 1, paidAmount: 99000 });
    expect(summary.body.betaEmailCount).toBe(1);

    // Pemilik pesanan uji sedang membaca: sesinya ikut diakhiri.
    const sessionToken = (await t.as(t.tokenA, 'post', '/api/access/prod-ebook-1/session/start').send({ deviceId: 'perangkat-uji-1-abcdefghij' })).body.sessionToken;
    expect(sessionToken).toBeTruthy();

    const del = '/api/admin/digital-access/test-orders';
    expect((await t.as(null, 'delete', del).set('x-test-admin', '1').send({})).body.code).toBe('confirm_required');
    expect((await t.as(null, 'delete', del).send({ confirm: true })).status).toBe(401);
    const removed = await t.as(null, 'delete', del).set('x-test-admin', '1').send({ confirm: true });
    expect(removed.body).toEqual({ ordersDeleted: 1, entitlementsDeleted: 1 });

    expect(t.store.orders.map((o) => o.orderNumber)).toEqual([realOrder]);
    expect(t.store.entitlements.map((e) => e.userId)).toEqual([USER_B.id]);
    expect(t.store.sessions.find((s) => s.userId === USER_A.id)?.endReason).toBe('revoked');
    expect((await t.as(t.tokenA, 'get', '/api/library')).body.items).toEqual([]);
    expect((await t.as(t.tokenB, 'get', '/api/library')).body.items).toHaveLength(1);
  });
});
