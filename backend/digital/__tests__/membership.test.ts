import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createTestApp, mintUserToken, USER_A, USER_B, type TestAppOptions } from './harness';
import { memberPrintPrice } from '../membership/service';
import type { MembershipGateway, RemoteSubscription } from '../membership/gateway';
import type { WhatsAppSender } from '../membership/whatsapp';
import type { Phase1ProductLike } from '../memoryStore';

/**
 * Keanggotaan fase 3 — skenario verifikasi docs/PHASE-3-BRIEF.md Langkah 10 (tes 1–10) dan alur pendukungnya.
 * Midtrans diganti tiruan: Snap (token), Subscriptions API, dan status transaksi. Waktu dikendalikan lewat `now`.
 */

const SERVER_KEY = 'SB-Mid-server-UJI';
const DAY = 86_400_000;
const START = '2026-09-14T03:00:00.000Z'; // 10:00 WIB
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const device = (n: number) => `perangkat-uji-${n}-abcdefghij`;

const sign = (orderId: string, statusCode: string, grossAmount: string) =>
  crypto.createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`).digest('hex');

const notification = (orderId: string, amount: number, status: string, extra: Record<string, unknown> = {}) => {
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

// Rak: dua judul sudah masuk rak, satu judul frontlist masuk rak besok (15 Sep 2026 WIB).
const PRODUCTS: Phase1ProductLike[] = [
  { id: 'prod-shelf', bookId: 'book-3', format: 'ebook', price: 99000, isActive: true, availabilityStatus: 'available', pageCount: 300, durationSeconds: null, shelfEntryDate: '2026-01-01' },
  { id: 'prod-shelf-audio', bookId: 'book-24', format: 'audiobook', price: 129000, isActive: true, availabilityStatus: 'available', pageCount: null, durationSeconds: 19800, shelfEntryDate: '2026-02-01' },
  { id: 'prod-frontlist', bookId: 'book-24', format: 'ebook', price: 89000, isActive: true, availabilityStatus: 'available', pageCount: 200, durationSeconds: null, shelfEntryDate: '2026-09-15' }
];

const fakeGateway = () => {
  const calls: Array<{ op: string; id?: string; input?: any }> = [];
  const statuses = new Map<string, Record<string, any>>();
  const remotes = new Map<string, RemoteSubscription>();
  let seq = 0;
  const gateway: MembershipGateway = {
    async createSubscription(input) {
      const id = `rsub-${++seq}`;
      calls.push({ op: 'create', id, input });
      const remote = { id, status: 'active', transactionIds: [], nextExecutionAt: input.startTime, amount: input.amount };
      remotes.set(id, remote);
      return remote;
    },
    async updateSubscription(id, input) {
      calls.push({ op: 'update', id, input });
    },
    async disableSubscription(id) {
      calls.push({ op: 'disable', id });
    },
    async enableSubscription(id) {
      calls.push({ op: 'enable', id });
    },
    async cancelSubscription(id) {
      calls.push({ op: 'cancel', id });
    },
    async getSubscription(id) {
      return remotes.get(id) ?? null;
    },
    async getTransactionStatus(id) {
      calls.push({ op: 'status', id });
      return statuses.get(id) ?? null;
    },
    async getGopayAccount() {
      return { accountId: 'gopay-akun-uji', token: 'gopay-token-uji' };
    }
  };
  return { gateway, calls, statuses, remotes };
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const setup = async (env: Record<string, string> = {}, extra: Partial<TestAppOptions> = {}) => {
  const clock = { t: Date.parse(START) };
  const now = () => new Date(clock.t);
  const gw = fakeGateway();
  const snapPayloads: any[] = [];
  const t = await createTestApp({
    products: PRODUCTS.map((p) => ({ ...p })),
    now,
    env: { ENABLE_READER_DIGITAL_PICK: 'true', ...env },
    midtransClient: {
      createTransaction: async (payload) => {
        snapPayloads.push(payload);
        return { token: `snap-${snapPayloads.length}`, redirectUrl: 'https://pay.test/snap' };
      }
    },
    membershipGateway: gw.gateway,
    ...extra
  });
  cleanups.push(t.cleanup);
  for (const p of PRODUCTS) await t.store.updateProduct(p.id, { storagePath: `ebooks/${p.id}`, processingStatus: 'ready' });
  const tokenA = await mintUserToken(USER_A);
  const tokenB = await mintUserToken(USER_B);
  const as = (token: string) => ({
    get: (path: string) => request(t.app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body: Record<string, unknown> = {}) => request(t.app).post(path).set('Authorization', `Bearer ${token}`).send(body)
  });
  const admin = (method: 'get' | 'post' | 'patch', path: string, body: Record<string, unknown> = {}) =>
    request(t.app)[method](path).set('x-test-admin', '1').send(body);
  const subscribe = (token: string, body: Record<string, unknown> = {}) => as(token).post('/api/membership/subscribe', {
    plan_code: 'professional',
    billing_cycle: 'yearly',
    payment_method: 'va',
    idempotency_key: `kunci-${crypto.randomUUID()}`,
    accept_terms: true,
    accept_license: true,
    ...body
  });
  const webhook = (body: Record<string, unknown>) => t.phase2.handleMembershipNotification!(body);
  /** Notifikasi Snap bertanda tangan untuk percobaan terakhir invoice. */
  const payInvoice = async (invoiceId: string, status = 'settlement', extra: Record<string, unknown> = {}) => {
    const invoice = (await t.store.getInvoice(invoiceId))!;
    return webhook(notification(invoice.midtransOrderId!, invoice.amount, status, extra));
  };
  const join = async (token: string, body: Record<string, unknown> = {}) => {
    const res = await subscribe(token, body);
    expect(res.status).toBe(201);
    const paid = await payInvoice(res.body.invoice.id);
    expect(paid.body.status).toBe('success');
    return res.body;
  };
  const start = (token: string, productId: string, n = 1) =>
    request(t.app).post(`/api/access/${productId}/session/start`).set('Authorization', `Bearer ${token}`).set('User-Agent', UA).send({ deviceId: device(n) });
  const advance = (days: number) => {
    clock.t += days * DAY;
  };
  const setTime = (ms: number | string) => {
    clock.t = typeof ms === 'string' ? Date.parse(ms) : ms;
  };
  const job = () => t.phase2.runMembershipJob!();
  const open = (userId: string) => t.phase2.membership!.openSubscription(userId);
  const eventsOf = async (subscriptionId: string, type?: string) =>
    (await t.store.listSubscriptionEvents({ subscriptionId })).filter((e) => !type || e.type === type);
  return { ...t, now, gw, snapPayloads, tokenA, tokenB, as, admin, subscribe, webhook, payInvoice, join, start, advance, setTime, job, open, eventsOf };
};

describe('keanggotaan — verifikasi Langkah 10', () => {
  it('1. dua pendaftar bersamaan pada kursi Founding terakhir -> hanya satu Founding; kursi dilepas bila tidak dibayar', async () => {
    const t = await setup();
    const plan = t.store.plans.find((p) => p.code === 'professional')!;
    plan.foundingCount = plan.foundingCap! - 1;
    const [a, b] = await Promise.all([t.subscribe(t.tokenA), t.subscribe(t.tokenB)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const founding = [a.body, b.body].filter((x) => x.subscription.isFounding);
    const regular = [a.body, b.body].filter((x) => !x.subscription.isFounding);
    expect(founding).toHaveLength(1);
    expect(founding[0].invoice.amount).toBe(790000);
    expect(regular[0].invoice.amount).toBe(990000);
    expect(plan.foundingCount).toBe(plan.foundingCap);
    const plans = await request(t.app).get('/api/membership/plans');
    expect(plans.body.plans.find((p: any) => p.code === 'professional').founding.remaining).toBe(0);

    // Tidak dibayar dalam 24 jam: pendaftaran di-void dan kursi Founding kembali.
    t.advance(1.1);
    const result = await t.job();
    expect(result.pendingVoided).toBe(2);
    expect(plan.foundingCount).toBe(plan.foundingCap! - 1);
  });

  it('2. settlement ganda -> satu invoice paid, satu entitlement rak; signature palsu ditolak', async () => {
    const t = await setup();
    const res = await t.subscribe(t.tokenA);
    const first = await t.payInvoice(res.body.invoice.id);
    const second = await t.payInvoice(res.body.invoice.id);
    expect(first.body.status).toBe('success');
    expect(second.body.status).toBe('duplicate');
    expect(t.store.invoices.filter((i) => i.status === 'paid')).toHaveLength(1);
    const sub = (await t.open(USER_A.id))!;
    expect(sub.status).toBe('active');
    const shelf = t.store.entitlements.filter((e) => e.scope === 'shelf');
    expect(shelf).toHaveLength(1);
    expect(shelf[0]).toMatchObject({ source: 'membership', sourceRef: sub.id, productId: null, maxDevices: 2, startsAt: sub.currentPeriodStart, status: 'active' });
    expect(Date.parse(shelf[0].endsAt!) - Date.parse(sub.currentPeriodEnd!)).toBe(5 * DAY);

    const invoice = t.store.invoices[0];
    const forged = await t.webhook({ ...notification(invoice.midtransOrderId!, invoice.amount, 'settlement'), signature_key: 'palsu' });
    expect(forged.status).toBe(403);
    const wrongAmount = await t.webhook(notification(invoice.midtransOrderId!, 1000, 'settlement'));
    expect(wrongAmount.status).toBe(400);
    await t.phase2.idle!();
    expect(t.mails.filter((m) => m.to.includes(USER_A.email) && /Selamat datang/.test(m.subject))).toHaveLength(1);
  });

  it('3. Professional membuka judul di rak, tidak bisa judul yang masuk rak besok, tetap bisa beli satuan', async () => {
    const t = await setup();
    await t.join(t.tokenA);
    expect((await t.start(t.tokenA, 'prod-shelf')).status).toBe(201);
    const soon = await t.start(t.tokenA, 'prod-frontlist');
    expect(soon.status).toBe(403);
    expect(soon.body.code).toBe('no_entitlement');

    // Pembelian satuan tetap tersedia (hak rak tidak dihitung "sudah dimiliki", keputusan A3).
    const buy = (productId: string) => t.as(t.tokenA).post('/api/digital/checkout', { items: [productId], idempotency_key: `kunci-${crypto.randomUUID()}`, license_accepted: true });
    expect((await buy('prod-frontlist')).status).toBe(201);
    expect((await buy('prod-shelf')).status).toBe(201);

    // Keesokan harinya (00:30 WIB) judul itu masuk rak.
    t.setTime('2026-09-14T17:30:00.000Z');
    expect((await t.start(t.tokenA, 'prod-frontlist')).status).toBe(201);
  });

  it('4. Reader tanpa Pick -> 403; setelah Pick bisa; ganti Pick di periode sama ditolak; bulan berikutnya boleh memilih lagi', async () => {
    const t = await setup();
    await t.join(t.tokenA, { plan_code: 'reader' });
    const before = await t.start(t.tokenA, 'prod-shelf');
    expect(before.status).toBe(403);
    expect(before.body.code).toBe('no_entitlement');

    const options = await t.as(t.tokenA).get('/api/membership/picks');
    expect(options.body.enabled).toBe(true);
    expect(options.body.options.map((o: any) => o.productId).sort()).toEqual(['prod-shelf', 'prod-shelf-audio']);
    expect((await t.as(t.tokenA).post('/api/membership/picks', { product_id: 'prod-frontlist' })).body.code).toBe('not_on_shelf');

    const pick = await t.as(t.tokenA).post('/api/membership/picks', { product_id: 'prod-shelf' });
    expect(pick.status).toBe(201);
    expect((await t.start(t.tokenA, 'prod-shelf')).status).toBe(201);
    expect((await t.start(t.tokenA, 'prod-shelf-audio')).status).toBe(403);
    const again = await t.as(t.tokenA).post('/api/membership/picks', { product_id: 'prod-shelf-audio' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('pick_locked');

    const record = t.store.picks[0];
    const entitlement = t.store.entitlements.find((e) => e.id === record.entitlementId)!;
    expect(entitlement).toMatchObject({ scope: 'product', source: 'membership', sourceRef: record.id, productId: 'prod-shelf', maxDevices: 1 });
    expect(Date.parse(entitlement.endsAt!) - Date.parse(record.periodEnd)).toBe(5 * DAY);

    // Slot bulan berikutnya: Pick baru; Pick lama berakhir setelah masa tenggangnya (tidak akumulatif).
    t.advance(31);
    expect((await t.as(t.tokenA).post('/api/membership/picks', { product_id: 'prod-shelf-audio' })).status).toBe(201);
    t.advance(5);
    expect((await t.start(t.tokenA, 'prod-shelf')).status).toBe(403);
    expect((await t.start(t.tokenA, 'prod-shelf-audio')).status).toBe(201);
  });

  it('5. perpanjangan manual: H-7 invoice & pengingat sekali; H0 grace (akses tetap); H+6 expired, progres tersimpan; bayar lagi -> aktif, progres tersambung', async () => {
    const t = await setup();
    await t.join(t.tokenA, { billing_cycle: 'monthly' });
    const sub0 = (await t.open(USER_A.id))!;
    const due = Date.parse(sub0.currentPeriodEnd!);
    await t.store.upsertProgress(USER_A.id, 'prod-shelf', { position: 42, percent: 14 });
    const days = async () => (await t.eventsOf(sub0.id, 'reminder_sent')).map((e) => e.meta.days).sort();

    t.setTime(due - 8 * DAY);
    await t.job();
    expect(t.store.invoices.filter((i) => i.kind === 'renewal')).toHaveLength(0);

    t.setTime(due - 7 * DAY + 60_000);
    const first = await t.job();
    await t.job();
    const renewals = t.store.invoices.filter((i) => i.kind === 'renewal');
    expect(first.invoicesIssued).toBe(1);
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ status: 'issued', amount: 99000, periodStart: sub0.currentPeriodEnd });
    expect(await days()).toEqual([7]);

    t.setTime(due - 3 * DAY + 60_000);
    await t.job();
    await t.job();
    t.setTime(due - 1 * DAY + 60_000);
    await t.job();
    expect(await days()).toEqual([1, 3, 7]);

    t.setTime(due + 60_000);
    const h0 = await t.job();
    expect(h0.graceStarted).toBe(1);
    expect((await t.store.getSubscription(sub0.id))!.status).toBe('grace');
    expect(await days()).toEqual([0, 1, 3, 7]);
    expect((await t.start(t.tokenA, 'prod-shelf')).status).toBe(201);

    await t.phase2.idle!();
    const mailsBeforeExpiry = t.mails.length;
    t.setTime(due + 6 * DAY);
    const h6 = await t.job();
    expect(h6.expired).toBe(1);
    expect(await t.store.getSubscription(sub0.id)).toMatchObject({ status: 'expired', endedReason: 'unpaid' });
    expect((await t.store.getInvoice(renewals[0].id))!.status).toBe('void');
    expect((await t.start(t.tokenA, 'prod-shelf')).status).toBe(403);
    expect(await t.store.getProgress(USER_A.id, 'prod-shelf')).toMatchObject({ position: 42 });
    expect(await t.eventsOf(sub0.id, 'expired')).toHaveLength(1);
    await t.job();
    await t.phase2.idle!();
    expect(t.mails.length).toBe(mailsBeforeExpiry + 1); // email "akses dikunci" sekali

    // Berlangganan lagi setelah expired: langganan baru dengan harga reguler (bukan Founding).
    const again = await t.subscribe(t.tokenA);
    expect(again.status).toBe(201);
    expect(again.body.subscription.isFounding).toBe(false);
    expect(again.body.invoice.amount).toBe(990000);
    await t.payInvoice(again.body.invoice.id);
    expect((await t.start(t.tokenA, 'prod-shelf')).status).toBe(201);
    expect(await t.store.getProgress(USER_A.id, 'prod-shelf')).toMatchObject({ position: 42 });
  });

  it('6. upgrade prorata: hak lama dicabut (upgraded), hak baru aktif, batas perangkat naik', async () => {
    const t = await setup();
    await t.join(t.tokenA, { plan_code: 'reader', billing_cycle: 'monthly' });
    await t.as(t.tokenA).post('/api/membership/picks', { product_id: 'prod-shelf' });
    const sub0 = (await t.open(USER_A.id))!;
    expect((await t.start(t.tokenA, 'prod-shelf', 1)).status).toBe(201);
    expect((await t.start(t.tokenA, 'prod-shelf', 2)).body.code).toBe('device_limit');

    t.advance(10);
    const change = await t.as(t.tokenA).post('/api/membership/change', { plan_code: 'professional', billing_cycle: 'monthly' });
    expect(change.status).toBe(200);
    expect(change.body.mode).toBe('immediate');
    const total = Date.parse(sub0.currentPeriodEnd!) - Date.parse(sub0.currentPeriodStart!);
    const remaining = Date.parse(sub0.currentPeriodEnd!) - t.now().getTime();
    const credit = Math.round((39000 * remaining) / total);
    expect(change.body.credit).toBe(credit);
    expect(change.body.invoice.amount).toBe(99000 - credit);

    expect((await t.payInvoice(change.body.invoice.id)).body.status).toBe('success');
    const sub1 = (await t.open(USER_A.id))!;
    expect(sub1).toMatchObject({ id: sub0.id, planId: 'plan-professional', status: 'active', currentPeriodStart: t.now().toISOString(), priceLocked: 99000 });
    const pickEntitlement = t.store.entitlements.find((e) => e.id === t.store.picks[0].entitlementId)!;
    expect(pickEntitlement).toMatchObject({ status: 'revoked', revokedReason: 'upgraded' });
    const shelf = t.store.entitlements.filter((e) => e.scope === 'shelf' && e.status === 'active');
    expect(shelf).toHaveLength(1);
    expect(shelf[0].maxDevices).toBe(2);
    expect((await t.start(t.tokenA, 'prod-shelf-audio', 2)).status).toBe(201);
    expect(await t.eventsOf(sub0.id, 'upgraded')).toHaveLength(1);
  });

  it('7. batal: akses sampai akhir periode, tanpa tagihan berikutnya, auto-debit dinonaktifkan; batalkan pembatalan', async () => {
    const t = await setup({ ENABLE_AUTODEBIT: 'true' });
    const res = await t.subscribe(t.tokenA, { payment_method: 'card', billing_cycle: 'monthly' });
    // Snap pertama meminta tokenisasi kartu; data kartu tidak pernah melewati server.
    expect(t.snapPayloads[0]).toMatchObject({ credit_card: { secure: true, save_card: true }, enabled_payments: ['credit_card'] });
    await t.payInvoice(res.body.invoice.id, 'settlement', { payment_type: 'credit_card', saved_token_id: 'tok-kartu-uji', saved_token_id_expired_at: '2030-12-31 07:00:00' });
    const sub0 = (await t.open(USER_A.id))!;
    expect(sub0.midtransSubscriptionId).toBe('rsub-1');
    expect(sub0.midtransToken).toBeTruthy();
    expect(sub0.midtransToken).not.toContain('tok-kartu-uji');
    expect(t.gw.calls.find((c) => c.op === 'create')!.input).toMatchObject({ paymentType: 'credit_card', token: 'tok-kartu-uji', amount: 99000, intervalMonths: 1, startTime: sub0.currentPeriodEnd, retryDays: 3 });

    expect((await t.as(t.tokenA).post('/api/membership/cancel')).body.code).toBe('confirm_required');
    const cancel = await t.as(t.tokenA).post('/api/membership/cancel', { confirm: true });
    expect(cancel.status).toBe(200);
    expect(cancel.body.subscription).toMatchObject({ cancelAtPeriodEnd: true, accessEndsAt: sub0.currentPeriodEnd, nextRenewal: null });
    expect(t.gw.calls.some((c) => c.op === 'disable' && c.id === 'rsub-1')).toBe(true);
    expect(t.store.entitlements.find((e) => e.scope === 'shelf')!.endsAt).toBe(sub0.currentPeriodEnd);

    const resume = await t.as(t.tokenA).post('/api/membership/resume');
    expect(resume.body.subscription.cancelAtPeriodEnd).toBe(false);
    expect(t.gw.calls.some((c) => c.op === 'enable' && c.id === 'rsub-1')).toBe(true);
    expect(Date.parse(t.store.entitlements.find((e) => e.scope === 'shelf')!.endsAt!) - Date.parse(sub0.currentPeriodEnd!)).toBe(5 * DAY);

    await t.as(t.tokenA).post('/api/membership/cancel', { confirm: true });
    t.setTime(Date.parse(sub0.currentPeriodEnd!) - 7 * DAY + 60_000);
    await t.job();
    expect(t.store.invoices.filter((i) => i.kind === 'renewal')).toHaveLength(0);
    expect((await t.start(t.tokenA, 'prod-shelf')).status).toBe(201);

    t.setTime(Date.parse(sub0.currentPeriodEnd!) + 60_000);
    expect((await t.job()).canceled).toBe(1);
    expect((await t.store.getSubscription(sub0.id))!.status).toBe('canceled');
    expect(t.gw.calls.some((c) => c.op === 'cancel' && c.id === 'rsub-1')).toBe(true);
    expect((await t.start(t.tokenA, 'prod-shelf')).status).toBe(403);
  });

  it('8. auto-debit gagal -> past_due, dicoba ulang, satu email; berhasil -> aktif; notifikasi tak terverifikasi ditolak', async () => {
    const t = await setup({ ENABLE_AUTODEBIT: 'true' });
    const res = await t.subscribe(t.tokenA, { payment_method: 'card', billing_cycle: 'monthly' });
    await t.payInvoice(res.body.invoice.id, 'settlement', { payment_type: 'credit_card', saved_token_id: 'tok-kartu-uji', saved_token_id_expired_at: '2030-12-31 07:00:00' });
    const sub0 = (await t.open(USER_A.id))!;
    const due = Date.parse(sub0.currentPeriodEnd!);

    t.setTime(due - 7 * DAY + 60_000);
    await t.job();
    await t.job();
    expect(await t.eventsOf(sub0.id, 'reminder_sent')).toHaveLength(1);
    await t.phase2.idle!();
    const mailsBefore = t.mails.length;

    const remoteStatus = (orderId: string, status: string) => {
      t.gw.statuses.set(orderId, { order_id: orderId, transaction_status: status, gross_amount: '99000.00', payment_type: 'credit_card', transaction_id: `trx-${orderId}` });
      return { order_id: orderId, transaction_status: status, subscription_id: 'rsub-1' };
    };
    t.setTime(due + 60_000);
    expect((await t.webhook(remoteStatus('auto-uji-0001', 'deny'))).body.status).toBe('failed');
    expect((await t.store.getSubscription(sub0.id))!.status).toBe('past_due');
    t.advance(1);
    await t.webhook(remoteStatus('auto-uji-0002', 'deny'));
    await t.job();
    expect((await t.store.getSubscription(sub0.id))!.status).toBe('past_due');
    // Akses tetap terbuka selama percobaan ulang.
    expect((await t.start(t.tokenA, 'prod-shelf')).status).toBe(201);
    await t.phase2.idle!();
    expect(t.mails.length).toBe(mailsBefore + 1);
    const failedInvoice = t.store.invoices.find((i) => i.kind === 'renewal')!;
    expect(failedInvoice).toMatchObject({ status: 'failed', attempt: 2 });

    // Notifikasi yang tidak bisa diverifikasi ke API Midtrans ditolak.
    expect((await t.webhook({ order_id: 'palsu-0001', transaction_status: 'settlement', subscription_id: 'rsub-1' })).status).toBe(403);

    t.advance(1);
    expect((await t.webhook(remoteStatus('auto-uji-0003', 'settlement'))).body.status).toBe('success');
    expect(await t.store.getSubscription(sub0.id)).toMatchObject({ status: 'active', currentPeriodStart: sub0.currentPeriodEnd });
    expect((await t.webhook(remoteStatus('auto-uji-0003', 'settlement'))).body.status).toBe('duplicate');
    expect(t.store.entitlements.filter((e) => e.scope === 'shelf')).toHaveLength(2);
  });

  it('8b. auto-debit tetap gagal sampai akhir tenggang -> expired dan langganan Midtrans dihentikan', async () => {
    const t = await setup({ ENABLE_AUTODEBIT: 'true' });
    const res = await t.subscribe(t.tokenA, { payment_method: 'card', billing_cycle: 'monthly' });
    await t.payInvoice(res.body.invoice.id, 'settlement', { payment_type: 'credit_card', saved_token_id: 'tok-kartu-uji', saved_token_id_expired_at: '2030-12-31 07:00:00' });
    const sub0 = (await t.open(USER_A.id))!;
    const due = Date.parse(sub0.currentPeriodEnd!);
    // Tidak ada notifikasi sama sekali: job menandai past_due saat jatuh tempo, lalu expired setelah tenggang.
    t.setTime(due + 60_000);
    expect((await t.job()).pastDue).toBe(1);
    t.setTime(due + 5 * DAY + 60_000);
    expect((await t.job()).expired).toBe(1);
    expect(t.gw.calls.some((c) => c.op === 'cancel' && c.id === 'rsub-1')).toBe(true);
  });

  it('9. Founding: pemberitahuan 30 hari sebelum ulang tahun (sekali), perpanjangan harga reguler', async () => {
    const t = await setup();
    await t.join(t.tokenA);
    const sub0 = (await t.open(USER_A.id))!;
    expect(sub0).toMatchObject({ isFounding: true, priceLocked: 790000, foundingEndsAt: sub0.currentPeriodEnd });
    const anniversary = Date.parse(sub0.foundingEndsAt!);

    t.setTime(anniversary - 31 * DAY);
    expect((await t.job()).foundingNotices).toBe(0);
    t.setTime(anniversary - 30 * DAY + 60_000);
    expect((await t.job()).foundingNotices).toBe(1);
    expect((await t.job()).foundingNotices).toBe(0);
    const notice = await t.eventsOf(sub0.id, 'founding_notice');
    expect(notice).toHaveLength(1);
    expect(notice[0].meta.regularPrice).toBe(990000);

    t.setTime(anniversary - 7 * DAY + 60_000);
    await t.job();
    const renewal = t.store.invoices.find((i) => i.kind === 'renewal')!;
    expect(renewal).toMatchObject({ amount: 990000, isFoundingPrice: false });
    const pay = await t.as(t.tokenA).post(`/api/membership/invoices/${renewal.id}/pay`);
    expect(pay.body.invoice.snapToken).toBeTruthy();
    await t.payInvoice(renewal.id);
    expect(await t.store.getSubscription(sub0.id)).toMatchObject({ status: 'active', priceLocked: 990000, currentPeriodStart: sub0.currentPeriodEnd });
  });

  it('10. harga member buku cetak: flag mati -> tidak ada diskon walau anggota aktif', async () => {
    const t = await setup();
    await t.join(t.tokenA);
    expect(await t.phase2.memberPrintDiscount!(`Bearer ${t.tokenA}`)).toBeNull();
    const plans = await request(t.app).get('/api/membership/plans');
    expect(plans.body.flags.printDiscount).toBe(false);
    expect(plans.body.plans.every((p: any) => p.printDiscountPercent === 0 && !p.benefits.includes('memberPrintDiscount'))).toBe(true);
  });

  it('10b. flag hidup: Reader 10%, Professional 15%; hanya anggota aktif; tidak bertumpuk dengan promo', async () => {
    const t = await setup({ ENABLE_MEMBER_PRINT_DISCOUNT: 'true' });
    expect(await t.phase2.memberPrintDiscount!(`Bearer ${t.tokenA}`)).toBeNull();
    expect(await t.phase2.memberPrintDiscount!(undefined)).toBeNull();
    expect(await t.phase2.memberPrintDiscount!('Bearer token-palsu')).toBeNull();
    await t.join(t.tokenA);
    expect(await t.phase2.memberPrintDiscount!(`Bearer ${t.tokenA}`)).toEqual({ percent: 15, planCode: 'professional' });
    await t.join(t.tokenB, { plan_code: 'reader' });
    expect(await t.phase2.memberPrintDiscount!(`Bearer ${t.tokenB}`)).toEqual({ percent: 10, planCode: 'reader' });
    expect(memberPrintPrice(100000, null, 15)).toBe(85000);
    expect(memberPrintPrice(100000, 120000, 15)).toBeNull(); // promo Rp100.000 lebih murah dari harga member Rp102.000
    expect(memberPrintPrice(110000, 120000, 15)).toBe(102000);
    expect(memberPrintPrice(100000, null, 0)).toBeNull();
  });
});

describe('keanggotaan — alur pendukung', () => {
  it('GET /api/membership/plans: publik, sisa kursi Founding, hanya manfaat peluncuran bila flag mati', async () => {
    const t = await setup({ ENABLE_READER_DIGITAL_PICK: 'false' });
    const res = await request(t.app).get('/api/membership/plans');
    expect(res.status).toBe(200);
    const reader = res.body.plans.find((p: any) => p.code === 'reader');
    expect(reader).toMatchObject({
      priceMonthly: 39000,
      priceYearly: 390000,
      founding: { priceYearly: 299000, cap: 1000, remaining: 1000 },
      maxDevices: 1,
      shelfAccess: 'none',
      printDiscountPercent: 0
    });
    expect(reader.benefits).toEqual(['account', 'newsletter', 'samples', 'wishlist', 'publicEvents', 'preorderAlerts']);
    const author = res.body.plans.find((p: any) => p.code === 'author');
    expect(author.maxDevices).toBe(2);
    expect(author.benefits).toContain('authorOwnWorks');
    expect(author.benefits).not.toContain('digitalShelf');
    expect(res.body.purchaseEnabled).toBe(true);
    expect(res.body.current).toBeNull();
  });

  it('fitur digital tertutup: paket tetap tampil, pendaftaran ditolak', async () => {
    const t = await setup({ DIGITAL_ENABLED: 'false' });
    expect((await request(t.app).get('/api/membership/plans')).body.purchaseEnabled).toBe(false);
    const res = await t.subscribe(t.tokenA);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('digital_disabled');
  });

  it('pendaftaran: wajib setuju ketentuan; idempotency; sudah anggota -> 409; Snap VA tanpa tokenisasi & telepon', async () => {
    const t = await setup();
    expect((await t.subscribe(t.tokenA, { accept_terms: false })).body.code).toBe('terms_required');
    expect((await t.subscribe(t.tokenA, { accept_license: false })).body.code).toBe('license_required');
    expect((await request(t.app).post('/api/membership/subscribe').send({})).status).toBe(401);
    const k = 'kunci-idem-000000000001';
    const a = await t.subscribe(t.tokenA, { idempotency_key: k });
    const b = await t.subscribe(t.tokenA, { idempotency_key: k });
    expect(b.status).toBe(200);
    expect(b.body.reused).toBe(true);
    expect(b.body.invoice.id).toBe(a.body.invoice.id);
    expect(t.snapPayloads).toHaveLength(1);
    expect(t.snapPayloads[0].enabled_payments).toEqual(['bank_transfer', 'echannel']);
    expect(t.snapPayloads[0].credit_card).toBeUndefined();
    expect(t.snapPayloads[0].user_id).toBeUndefined();
    expect(JSON.stringify(t.snapPayloads[0].customer_details)).not.toMatch(/phone/);
    await t.payInvoice(a.body.invoice.id);
    const again = await t.subscribe(t.tokenA, { plan_code: 'author' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_subscribed');
  });

  it('downgrade & tahunan->bulanan dijadwalkan di akhir periode; bisa dibatalkan; hak paket lama berakhir tepat akhir periode', async () => {
    const t = await setup({ ENABLE_AUTHOR_GUILD_SHELF: 'true' });
    await t.join(t.tokenA, { plan_code: 'author', billing_cycle: 'monthly' });
    const sub0 = (await t.open(USER_A.id))!;
    const schedule = () => t.as(t.tokenA).post('/api/membership/change', { plan_code: 'professional', billing_cycle: 'monthly' });
    const res = await schedule();
    expect(res.body.mode).toBe('scheduled');
    expect(res.body.subscription.pendingChange).toMatchObject({ planCode: 'professional', effectiveAt: sub0.currentPeriodEnd });
    expect(res.body.subscription.nextRenewal).toMatchObject({ amount: 99000, planCode: 'professional' });
    expect((await t.as(t.tokenA).post('/api/membership/change/cancel')).body.subscription.pendingChange).toBeNull();
    await schedule();

    t.setTime(Date.parse(sub0.currentPeriodEnd!) - 7 * DAY + 60_000);
    await t.job();
    const renewal = t.store.invoices.find((i) => i.kind === 'renewal' && i.status === 'issued')!;
    expect(renewal).toMatchObject({ amount: 99000, planId: 'plan-professional' });
    await t.as(t.tokenA).post(`/api/membership/invoices/${renewal.id}/pay`);
    await t.payInvoice(renewal.id);
    expect(await t.store.getSubscription(sub0.id)).toMatchObject({ planId: 'plan-professional', pendingPlanId: null, currentPeriodStart: sub0.currentPeriodEnd });
    const authorRow = t.store.entitlements.find((e) => e.scope === 'shelf' && e.startsAt === sub0.currentPeriodStart)!;
    expect(authorRow.endsAt).toBe(sub0.currentPeriodEnd);
  });

  it('Rak Digital: judul on-shelf dan "Segera masuk rak"; "Milik Saya" tidak berisi judul rak', async () => {
    const t = await setup();
    await t.join(t.tokenA);
    const shelf = await t.as(t.tokenA).get('/api/membership/shelf');
    expect(shelf.body.access).toBe('full');
    expect(shelf.body.items.map((i: any) => i.productId).sort()).toEqual(['prod-shelf', 'prod-shelf-audio']);
    expect(shelf.body.upcoming.map((i: any) => [i.productId, i.shelfEntryDate])).toEqual([['prod-frontlist', '2026-09-15']]);
    const library = await t.as(t.tokenA).get('/api/library');
    expect(library.body.items).toHaveLength(0);
    expect(library.body.devices.max).toBe(2);
  });

  it('bukti pembayaran: hanya pemilik & invoice lunas, HTML tanpa skrip', async () => {
    const t = await setup();
    const body = await t.join(t.tokenA);
    const receipt = await t.as(t.tokenA).get(`/api/membership/invoices/${body.invoice.id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-type']).toMatch(/text\/html/);
    expect(receipt.text).toContain('Bukti Pembayaran');
    expect(receipt.text).toContain('Rp 790.000');
    expect(receipt.text).not.toMatch(/<script/i);
    expect((await t.as(t.tokenB).get(`/api/membership/invoices/${body.invoice.id}/receipt`)).status).toBe(404);
  });

  it('admin: ringkasan, perpanjang manual, tenggang tambahan, CSV ber-BOM; tanpa admin ditolak', async () => {
    const t = await setup();
    await t.join(t.tokenA, { billing_cycle: 'monthly' });
    const sub0 = (await t.open(USER_A.id))!;
    expect((await request(t.app).get('/api/admin/membership/summary')).status).toBe(401);

    const summary = await t.admin('get', '/api/admin/membership/summary');
    expect(summary.body).toMatchObject({ activeTotal: 1, newThisMonth: 1, revenueThisMonth: 99000, pastDue: 0, grace: 0 });
    expect(summary.body.activeByPlan.find((p: any) => p.code === 'professional').active).toBe(1);
    expect(summary.body.founding.find((f: any) => f.code === 'professional')).toMatchObject({ cap: 500, used: 0, remaining: 500 });

    const list = await t.admin('get', '/api/admin/membership/subscriptions?plan=professional&status=active');
    expect(list.body.total).toBe(1);
    const detail = await t.admin('get', `/api/admin/membership/subscriptions/${sub0.id}`);
    expect(detail.body.invoices).toHaveLength(1);
    expect(detail.body.events.map((e: any) => e.type)).toContain('activated');

    const extend = await t.admin('post', `/api/admin/membership/subscriptions/${sub0.id}/extend`, { confirm: true, note: 'transfer bank' });
    expect(extend.status).toBe(200);
    expect(extend.body.subscription.currentPeriodStart).toBe(sub0.currentPeriodEnd);
    expect(extend.body.invoice).toMatchObject({ kind: 'manual', status: 'paid', amount: 99000 });

    const grace = await t.admin('post', `/api/admin/membership/subscriptions/${sub0.id}/grace`, { days: 3 });
    expect(grace.body.subscription.extraGraceDays).toBe(3);
    const latest = t.store.entitlements.filter((e) => e.scope === 'shelf' && e.status === 'active').sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
    expect(Date.parse(latest.endsAt!) - Date.parse(grace.body.subscription.currentPeriodEnd)).toBe(8 * DAY);

    const patch = await t.admin('patch', '/api/admin/membership/plans/reader', { foundingCap: -1 });
    expect(patch.status).toBe(400);
    const csv = await t.admin('get', '/api/admin/membership/export/invoices.csv');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.startsWith('﻿')).toBe(true);
    expect(csv.text).toContain('manual');
  });

  it('pengingat WhatsApp: hanya dengan persetujuan, sekali per hari-H, berhenti setelah dimatikan; nomor tidak ke Midtrans', async () => {
    const sent: Array<{ to: string; text: string; template: string }> = [];
    const whatsappSender: WhatsAppSender = {
      provider: 'fonnte',
      async send(to, message) { sent.push({ to, text: message.text, template: message.template.name }); },
      async status() { return { ok: true, detail: 'connect', connectedNumber: '6285286146806' }; }
    };
    const t = await setup({}, { whatsappSender });
    const plans = await request(t.app).get('/api/membership/plans');
    expect(plans.body.flags).toMatchObject({ whatsapp: true, whatsappSender: '+62 852 8614 6806' });

    const invalid = await t.subscribe(t.tokenA, { billing_cycle: 'monthly', whatsapp_opt_in: true, whatsapp_number: '12345' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('invalid_whatsapp');
    const joined = await t.join(t.tokenA, { billing_cycle: 'monthly', whatsapp_opt_in: true, whatsapp_number: '0812-3456-7890' });
    expect(joined.subscription).toMatchObject({ whatsappOptIn: true, whatsappNumber: '6281234567890' });
    expect(JSON.stringify(t.snapPayloads.map((p) => p.customer_details))).not.toMatch(/phone|6281234567890/);
    // Anggota tanpa persetujuan tidak menerima WhatsApp.
    await t.join(t.tokenB, { billing_cycle: 'monthly' });

    const sub = (await t.open(USER_A.id))!;
    const due = Date.parse(sub.currentPeriodEnd!);
    t.setTime(due - 7 * DAY + 60_000);
    await t.job();
    await t.job();
    await t.phase2.idle!();
    expect(sent.map((s) => [s.to, s.template])).toEqual([['6281234567890', 'cnx_invoice']]);
    expect(sent[0].text).toContain('Rp 99.000');

    t.setTime(due - 3 * DAY + 60_000);
    await t.job();
    await t.phase2.idle!();
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toContain('3 hari lagi');

    const off = await t.as(t.tokenA).post('/api/membership/whatsapp', { opt_in: false });
    expect(off.body.subscription).toMatchObject({ whatsappOptIn: false, whatsappNumber: null });
    const mailsBefore = t.mails.length;
    t.setTime(due - 1 * DAY + 60_000);
    await t.job();
    await t.phase2.idle!();
    expect(sent).toHaveLength(2);
    expect(t.mails.length).toBeGreaterThan(mailsBefore); // email tetap terkirim

    const on = await t.as(t.tokenA).post('/api/membership/whatsapp', { opt_in: true, whatsapp_number: '+62 811 1111 2222' });
    expect(on.body.subscription).toMatchObject({ whatsappOptIn: true, whatsappNumber: '6281111112222' });
    expect((await t.as(t.tokenA).post('/api/membership/whatsapp', { opt_in: true, whatsapp_number: 'bukan nomor' })).body.code).toBe('invalid_whatsapp');

    // Admin: status gateway (nomor tersambung = nomor resmi) dan pesan uji.
    const test = await t.admin('post', '/api/admin/membership/whatsapp/test', { to: '0852 8614 6806' });
    expect(test.body).toMatchObject({ provider: 'fonnte', senderNumber: '+62 852 8614 6806', matchesSender: true, gatewayOk: true, sentTo: '+62 852 8614 6806' });
  });

  it('pengingat WhatsApp gagal: dicatat sebagai event, email tetap terkirim; tanpa gateway admin mendapat 409', async () => {
    const failing: WhatsAppSender = {
      provider: 'cloud',
      async send() { throw new Error('Template name does not exist'); },
      async status() { return { ok: false, detail: 'error', connectedNumber: null }; }
    };
    const t = await setup({}, { whatsappSender: failing });
    await t.join(t.tokenA, { billing_cycle: 'monthly', whatsapp_opt_in: true, whatsapp_number: '081234567890' });
    const sub = (await t.open(USER_A.id))!;
    t.setTime(Date.parse(sub.currentPeriodEnd!) - 7 * DAY + 60_000);
    const mailsBefore = t.mails.length;
    await t.job();
    await t.phase2.idle!();
    expect(t.mails.length).toBe(mailsBefore + 1);
    const failures = await t.eventsOf(sub.id, 'whatsapp_failed');
    expect(failures).toHaveLength(1);
    expect(failures[0].meta).toMatchObject({ kind: 'invoice' });

    const plain = await setup();
    expect((await request(plain.app).get('/api/membership/plans')).body.flags.whatsapp).toBe(false);
    expect((await plain.admin('post', '/api/admin/membership/whatsapp/test', {})).status).toBe(409);
  });

  it('cron internal ikut menjalankan job keanggotaan', async () => {
    const t = await setup();
    const res = await request(t.app).post('/api/internal/cron').set('Authorization', 'Bearer rahasia-cron-tes');
    expect(res.status).toBe(200);
    expect(res.body.jobs.membership).toMatchObject({ errors: 0 });
  });
});
