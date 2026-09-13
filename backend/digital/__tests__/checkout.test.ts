import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createTestApp, mintUserToken, USER_A, USER_B } from './harness';

const SERVER_KEY = 'SB-Mid-server-UJI';

const sign = (orderId: string, statusCode: string, grossAmount: string) =>
  crypto.createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`).digest('hex');

const notification = (orderId: string, amount: number, status: string, extra: Record<string, string> = {}) => {
  const gross = `${amount}.00`;
  const statusCode = status === 'settlement' || status === 'capture' ? '200' : status === 'pending' ? '201' : '202';
  return {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: gross,
    transaction_status: status,
    transaction_id: `trx-${orderId}`,
    payment_type: 'bank_transfer',
    signature_key: sign(orderId, statusCode, gross),
    ...extra
  };
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const setup = async (snapFails = false) => {
  const midtransCalls: any[] = [];
  const t = await createTestApp({
    fetchImpl: (async (_url: string, init: RequestInit) => {
      midtransCalls.push(JSON.parse(String(init.body)));
      if (snapFails) return new Response('down', { status: 500 });
      return new Response(JSON.stringify({ token: `snap-${midtransCalls.length}`, redirect_url: 'https://pay.test/x' }), { status: 201 });
    }) as unknown as typeof fetch
  });
  cleanups.push(t.cleanup);
  const tokenA = await mintUserToken(USER_A);
  const tokenB = await mintUserToken(USER_B);
  const checkout = (token: string | null, body: Record<string, unknown>) => {
    const req = request(t.app).post('/api/digital/checkout');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };
  const webhook = (body: Record<string, unknown>) => t.phase2.handleMidtransNotification!(body);
  return { ...t, tokenA, tokenB, checkout, webhook, midtransCalls };
};

const key = () => `tes-${crypto.randomUUID()}`;

describe('checkout digital', () => {
  it('wajib login, persetujuan lisensi, dan produk yang tersedia', async () => {
    const t = await setup();
    expect((await t.checkout(null, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true })).status).toBe(401);
    const noLicense = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: false });
    expect(noLicense.body.code).toBe('license_required');
    const soon = await t.checkout(t.tokenA, { items: ['prod-soon'], idempotency_key: key(), license_accepted: true });
    expect(soon.status).toBe(400);
    expect(soon.body.code).toBe('product_unavailable');
  });

  it('membuat pesanan pending dengan token Snap; payload Midtrans tanpa nomor telepon', async () => {
    const t = await setup();
    const res = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true, language: 'en' });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('pending');
    expect(res.body.order.amount).toBe(99000);
    expect(res.body.order.snapToken).toBe('snap-1');
    expect(res.body.order.orderNumber).toMatch(/^DIG-\d{8}-[0-9A-F]{10}$/);
    const payload = t.midtransCalls[0];
    expect(payload.transaction_details).toEqual({ order_id: res.body.order.orderNumber, gross_amount: 99000 });
    expect(JSON.stringify(payload.customer_details)).not.toMatch(/phone/);
    expect(payload.callbacks.finish).toBe(`https://cakranexa.test/en/digital/checkout?order=${res.body.order.orderNumber}`);
    const stored = await t.store.getOrderByNumber(res.body.order.orderNumber);
    expect(stored?.licenseAcceptedAt).toBeTruthy();
    expect(stored?.language).toBe('en');
  });

  it('idempotency key ganda mengembalikan pesanan yang sama (satu panggilan Midtrans)', async () => {
    const t = await setup();
    const k = key();
    const first = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: k, license_accepted: true });
    const second = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: k, license_accepted: true });
    expect(second.status).toBe(200);
    expect(second.body.reused).toBe(true);
    expect(second.body.order.orderNumber).toBe(first.body.order.orderNumber);
    expect(t.midtransCalls).toHaveLength(1);
    expect(t.store.orders).toHaveLength(1);
    const otherUser = await t.checkout(t.tokenB, { items: ['prod-ebook-1'], idempotency_key: k, license_accepted: true });
    expect(otherUser.status).toBe(409);
  });

  it('webhook settlement membuat satu entitlement walau dikirim ganda; email konfirmasi sekali', async () => {
    const t = await setup();
    const res = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true });
    const orderNumber = res.body.order.orderNumber;
    // Endpoint frontend tidak pernah membuat entitlement.
    await request(t.app).get(`/api/digital/orders/${orderNumber}`).set('Authorization', `Bearer ${t.tokenA}`);
    expect(t.store.entitlements).toHaveLength(0);

    const first = await t.webhook(notification(orderNumber, 99000, 'settlement'));
    const second = await t.webhook(notification(orderNumber, 99000, 'settlement'));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(t.store.entitlements).toHaveLength(1);
    expect(t.store.entitlements[0]).toMatchObject({ userId: USER_A.id, productId: 'prod-ebook-1', source: 'purchase', status: 'active', endsAt: null, maxDevices: 2 });
    await t.phase2.idle!();
    expect(t.mails).toHaveLength(1);
    expect(t.mails[0].html).toMatch(/\/library/);
    expect(t.mails[0].html).not.toMatch(/\.pdf|storage|signed/i);

    const order = await request(t.app).get(`/api/digital/orders/${orderNumber}`).set('Authorization', `Bearer ${t.tokenA}`);
    expect(order.body.order.status).toBe('paid');
    expect(order.body.order.snapToken).toBeNull();
    expect((await request(t.app).get(`/api/digital/orders/${orderNumber}`).set('Authorization', `Bearer ${t.tokenB}`)).status).toBe(404);
  });

  it('menolak checkout produk yang sudah dimiliki', async () => {
    const t = await setup();
    const res = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true });
    await t.webhook(notification(res.body.order.orderNumber, 99000, 'settlement'));
    const again = await t.checkout(t.tokenA, { items: ['prod-ebook-1', 'prod-audio-1'], idempotency_key: key(), license_accepted: true });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_owned');
    expect(again.body.productIds).toEqual(['prod-ebook-1']);
  });

  it('refund mencabut entitlement; pembelian ulang diizinkan', async () => {
    const t = await setup();
    const res = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true });
    const orderNumber = res.body.order.orderNumber;
    await t.webhook(notification(orderNumber, 99000, 'settlement'));
    const refund = await t.webhook(notification(orderNumber, 99000, 'refund'));
    expect(refund.status).toBe(200);
    expect(t.store.entitlements[0].status).toBe('revoked');
    expect(t.store.entitlements[0].revokedReason).toBe('refund');
    // Notifikasi settlement terlambat tidak menghidupkan kembali pesanan yang di-refund.
    await t.webhook(notification(orderNumber, 99000, 'settlement'));
    expect(t.store.entitlements.filter((e) => e.status === 'active')).toHaveLength(0);
    const again = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true });
    expect(again.status).toBe(201);
  });

  it('bundel e-book + audiobook: satu pesanan, dua entitlement', async () => {
    const t = await setup();
    const res = await t.checkout(t.tokenA, { items: ['prod-ebook-2', 'prod-audio-1'], idempotency_key: key(), license_accepted: true });
    expect(res.body.order.amount).toBe(89000 + 129000);
    expect(res.body.order.items).toHaveLength(2);
    await t.webhook(notification(res.body.order.orderNumber, 218000, 'settlement'));
    expect(t.store.entitlements.map((e) => e.productId).sort()).toEqual(['prod-audio-1', 'prod-ebook-2']);
    expect(new Set(t.store.entitlements.map((e) => e.sourceRef)).size).toBe(1);
  });

  it('signature salah, nominal berbeda, dan capture challenge tidak membuat entitlement', async () => {
    const t = await setup();
    const res = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true });
    const orderNumber = res.body.order.orderNumber;
    expect((await t.webhook({ ...notification(orderNumber, 99000, 'settlement'), signature_key: 'palsu' })).status).toBe(403);
    expect((await t.webhook(notification(orderNumber, 1000, 'settlement'))).status).toBe(400);
    const challenge = await t.webhook(notification(orderNumber, 99000, 'capture', { fraud_status: 'challenge' }));
    expect(challenge.status).toBe(200);
    expect((await t.store.getOrderByNumber(orderNumber))?.status).toBe('challenge');
    expect(t.store.entitlements).toHaveLength(0);
  });

  it('entitlement ditangguhkan memblokir pembelian ulang (bukan jalan pintas memulihkan akses)', async () => {
    const t = await setup();
    const res = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true });
    await t.webhook(notification(res.body.order.orderNumber, 99000, 'settlement'));
    await t.store.updateEntitlements([t.store.entitlements[0].id], { status: 'suspended', statusChangedBy: 'anomaly' });
    const again = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('suspended');
  });

  it('kegagalan Midtrans -> 502 payment_error dan pesanan failed', async () => {
    const t = await setup(true);
    const res = await t.checkout(t.tokenA, { items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('payment_error');
    expect(t.store.orders[0].status).toBe('failed');
  });

  it('webhook membalas 200 tanpa menunggu email; notifikasi bersamaan tidak menggandakan apa pun', async () => {
    const sent: string[] = [];
    let releaseMail!: () => void;
    const mailGate = new Promise<void>((resolve) => { releaseMail = resolve; });
    const t = await createTestApp({
      fetchImpl: (async () => new Response(JSON.stringify({ token: 'snap-1', redirect_url: null }), { status: 201 })) as unknown as typeof fetch,
      mailer: { send: async (message) => { await mailGate; sent.push(message.subject); } }
    });
    cleanups.push(t.cleanup);
    const tokenA = await mintUserToken(USER_A);
    const res = await request(t.app).post('/api/digital/checkout').set('Authorization', `Bearer ${tokenA}`)
      .send({ items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true });
    const n = notification(res.body.order.orderNumber, 99000, 'settlement');

    // Tiga notifikasi bersamaan selesai walau pengiriman email masih tertahan.
    const results = await Promise.all([1, 2, 3].map(() => t.phase2.handleMidtransNotification!(n)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(t.store.entitlements).toHaveLength(1);
    expect(sent).toHaveLength(0);

    releaseMail();
    await t.phase2.idle!();
    expect(sent).toHaveLength(1);
  });

  it('email gagal melepas klaim sehingga notifikasi berikutnya mencoba lagi', async () => {
    let mailDown = true;
    const sent: string[] = [];
    const t = await createTestApp({
      fetchImpl: (async () => new Response(JSON.stringify({ token: 'snap-1', redirect_url: null }), { status: 201 })) as unknown as typeof fetch,
      mailer: { send: async (message) => { if (mailDown) throw new Error('resend tidak tersedia'); sent.push(message.subject); } }
    });
    cleanups.push(t.cleanup);
    const tokenA = await mintUserToken(USER_A);
    const res = await request(t.app).post('/api/digital/checkout').set('Authorization', `Bearer ${tokenA}`)
      .send({ items: ['prod-ebook-1'], idempotency_key: key(), license_accepted: true });
    const orderNumber = res.body.order.orderNumber;
    const n = notification(orderNumber, 99000, 'settlement');

    expect((await t.phase2.handleMidtransNotification!(n)).status).toBe(200);
    await t.phase2.idle!();
    expect((await t.store.getOrderByNumber(orderNumber))?.confirmationSentAt).toBeNull();

    mailDown = false;
    await t.phase2.handleMidtransNotification!(n);
    await t.phase2.idle!();
    expect(sent).toHaveLength(1);
    expect((await t.store.getOrderByNumber(orderNumber))?.confirmationSentAt).toBeTruthy();
    expect(t.store.entitlements).toHaveLength(1);
  });
});
