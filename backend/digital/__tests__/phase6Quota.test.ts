import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createTestApp, mintUserToken, USER_A, USER_B, type TestAppOptions } from './harness';
import { DEFAULT_PAYMENT_ROUTING } from '../../../src/data/paymentRouting';
import { addDaysToDate, isOpenFor, monthSlot, openDateFor } from '../membership/quota';
import type { MembershipGateway } from '../membership/gateway';
import type { Phase1ProductLike } from '../memoryStore';

/**
 * Fase 6 Langkah 1 (docs/PHASE-6-BRIEF.md + keputusan 17-09-2026): jatah judul, tanggal buka per paket, kuota audio,
 * akun keluarga Platinum, satu sesi & dua perangkat, routing (satuan off), dan perpindahan paket lama.
 */

const SERVER_KEY = 'SB-Mid-server-UJI';
const DAY = 86_400_000;
const START = '2026-09-14T03:00:00.000Z'; // Senin 10:00 WIB
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const USER_C = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'keluarga.c@uji.id', name: 'Keluarga C' };
const USER_D = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'keluarga.d@uji.id', name: 'Keluarga D' };
const device = (n: number) => `perangkat-fase6-${n}-abcdefghij`;

const settlement = (orderId: string, amount: number) => {
  const gross = `${amount}.00`;
  return {
    order_id: orderId,
    status_code: '200',
    gross_amount: gross,
    transaction_status: 'settlement',
    transaction_id: `trx-${orderId}`,
    payment_type: 'bank_transfer',
    signature_key: crypto.createHash('sha512').update(`${orderId}200${gross}${SERVER_KEY}`).digest('hex')
  };
};

// Rak per 14 Sep 2026: judul lama (semua paket berbayar) dan judul yang masuk rak 30 hari lalu (15 Agu).
const PRODUCTS: Phase1ProductLike[] = [
  { id: 'e-old-1', bookId: 'book-3', format: 'ebook', price: 99000, isActive: true, availabilityStatus: 'available', pageCount: 300, durationSeconds: null, shelfEntryDate: '2026-01-01' },
  { id: 'e-old-2', bookId: 'book-24', format: 'ebook', price: 89000, isActive: true, availabilityStatus: 'available', pageCount: 200, durationSeconds: null, shelfEntryDate: '2026-02-01' },
  { id: 'e-old-3', bookId: 'book-25', format: 'ebook', price: 79000, isActive: true, availabilityStatus: 'available', pageCount: 120, durationSeconds: null, shelfEntryDate: '2026-03-01' },
  { id: 'a-old', bookId: 'book-24', format: 'audiobook', price: 129000, isActive: true, availabilityStatus: 'available', pageCount: null, durationSeconds: 36000, shelfEntryDate: '2026-01-01' },
  { id: 'e-new', bookId: 'book-3', format: 'ebook', price: 99000, isActive: true, availabilityStatus: 'available', pageCount: 250, durationSeconds: null, shelfEntryDate: '2026-08-15' },
  { id: 'a-new', bookId: 'book-3', format: 'audiobook', price: 129000, isActive: true, availabilityStatus: 'available', pageCount: null, durationSeconds: 18000, shelfEntryDate: '2026-08-15' }
];

const gateway: MembershipGateway = {
  async createSubscription() { return { id: 'rsub', status: 'active', transactionIds: [], nextExecutionAt: null, amount: 0 }; },
  async updateSubscription() {},
  async disableSubscription() {},
  async enableSubscription() {},
  async cancelSubscription() {},
  async getSubscription() { return null; },
  async getTransactionStatus() { return null; },
  async getGopayAccount() { return null; }
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const setup = async (extra: Partial<TestAppOptions> = {}) => {
  const clock = { t: Date.parse(START) };
  const now = () => new Date(clock.t);
  const t = await createTestApp({
    products: PRODUCTS.map((p) => ({ ...p })),
    now,
    midtransClient: { createTransaction: async () => ({ token: 'snap-uji', redirectUrl: 'https://pay.test/snap' }) },
    membershipGateway: gateway,
    ...extra
  });
  cleanups.push(t.cleanup);
  for (const p of PRODUCTS) await t.store.updateProduct(p.id, { storagePath: `x/${p.id}`, processingStatus: 'ready' });
  const tokens = {
    a: await mintUserToken(USER_A),
    b: await mintUserToken(USER_B),
    c: await mintUserToken(USER_C),
    d: await mintUserToken(USER_D)
  };
  const as = (token: string) => ({
    get: (path: string) => request(t.app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body: Record<string, unknown> = {}) => request(t.app).post(path).set('Authorization', `Bearer ${token}`).send(body),
    delete: (path: string) => request(t.app).delete(path).set('Authorization', `Bearer ${token}`)
  });
  // Akun dikenal store (dipakai pencarian email akun keluarga).
  for (const token of Object.values(tokens)) await as(token).get('/api/account/me');
  const subscribe = (token: string, planCode: string, cycle = 'yearly') => as(token).post('/api/membership/subscribe', {
    plan_code: planCode,
    billing_cycle: cycle,
    payment_method: 'va',
    idempotency_key: `kunci-${crypto.randomUUID()}`,
    accept_terms: true,
    accept_license: true
  });
  const payInvoice = async (invoiceId: string) => {
    let invoice = (await t.store.getInvoice(invoiceId))!;
    // Tagihan perpanjangan belum punya transaksi Snap: siapkan seperti tombol "Bayar" di halaman akun.
    if (!invoice.midtransOrderId) {
      const sub = (await t.store.getSubscription(invoice.subscriptionId))!;
      const plan = (await t.phase2.membership!.planById(invoice.planId))!;
      invoice = await t.phase2.membership!.prepareSnap(invoice, sub, plan);
    }
    return t.phase2.handleMembershipNotification!(settlement(invoice.midtransOrderId!, invoice.amount));
  };
  const join = async (token: string, planCode: string, cycle = 'yearly') => {
    const res = await subscribe(token, planCode, cycle);
    expect(res.status).toBe(201);
    expect((await payInvoice(res.body.invoice.id)).body.status).toBe('success');
    return res.body;
  };
  const start = (token: string, productId: string, n = 1, takeover = false) =>
    request(t.app).post(`/api/access/${productId}/session/start`).set('Authorization', `Bearer ${token}`).set('User-Agent', UA).send({ deviceId: device(n), takeover });
  const pick = (token: string, productId: string) => as(token).post('/api/membership/picks', { product_id: productId });
  const setTime = (iso: string) => {
    clock.t = Date.parse(iso);
  };
  const advance = (days: number) => {
    clock.t += days * DAY;
  };
  const open = (userId: string) => t.phase2.membership!.openSubscription(userId);
  const listened = async (userId: string, productId: string, seconds: number) => {
    const sub = (await open(userId)) ?? null;
    const owner = sub ?? (await t.store.getSubscription((await t.store.listFamilyMembers({ userId, status: 'active' }))[0].ownerSubscriptionId))!;
    await t.store.insertReadingEvents([{
      userId, productId, sessionId: 'sesi-uji', entitlementId: null, unit: 'second', unitStart: 0, unitEnd: seconds, dwellMs: seconds * 1000,
      subscriptionId: owner.id, occurredAt: now().toISOString()
    }]);
  };
  return { ...t, clock, now, tokens, as, subscribe, payInvoice, join, start, pick, setTime, advance, open, listened };
};

describe('aturan kuota fase 6 (fungsi murni)', () => {
  it('tanggal buka = shelf_entry_date + frontlist_days; Blue (null) tidak pernah terbuka', () => {
    const product = { isActive: true, processingStatus: 'ready' as const, shelfEntryDate: '2026-08-15' };
    expect(openDateFor(product, 0)).toBe('2026-08-15');
    expect(openDateFor(product, 45)).toBe('2026-09-29');
    expect(openDateFor(product, 90)).toBe('2026-11-13');
    expect(openDateFor(product, null)).toBeNull();
    expect(isOpenFor(product, 45, '2026-09-28')).toBe(false);
    expect(isOpenFor(product, 45, '2026-09-29')).toBe(true);
    expect(isOpenFor(product, null, '2030-01-01')).toBe(false);
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('paket tahunan: slot bulanan di dalam periode', () => {
    const start = '2026-01-31T03:00:00.000Z';
    const end = '2027-01-31T03:00:00.000Z';
    expect(monthSlot(start, end, new Date('2026-02-15T00:00:00.000Z'))).toEqual({ start, end: '2026-02-28T03:00:00.000Z' });
    expect(monthSlot(start, end, new Date('2026-03-01T00:00:00.000Z')).start).toBe('2026-02-28T03:00:00.000Z');
  });
});

describe('Langkah 7 (bagian Langkah 1): jatah judul & tanggal buka per paket', () => {
  it('Silver memilih judul ke-3 -> ditolak; judul yang sama tidak dihitung dua kali; bulan berikutnya pilih lagi (boleh judul sama)', async () => {
    const t = await setup();
    await t.join(t.tokens.a, 'silver', 'monthly');
    // E-book tanpa jatah: tidak terbuka; audiobook lama terbuka lewat jam audio.
    expect((await t.start(t.tokens.a, 'e-old-1')).body.code).toBe('no_entitlement');
    const audio = await t.start(t.tokens.a, 'a-old');
    expect(audio.status).toBe(201);
    expect(audio.body.audioQuota).toMatchObject({ limitSeconds: 5 * 3600, usedSeconds: 0, exhausted: false });

    const options = await t.as(t.tokens.a).get('/api/membership/picks');
    expect(options.body).toMatchObject({ enabled: true, mode: 'quota', limit: 2, used: 0 });
    // Hanya e-book yang sudah terbuka untuk Silver (judul 30 hari lalu belum: +90 hari).
    expect(options.body.options.map((o: any) => o.productId).sort()).toEqual(['e-old-1', 'e-old-2', 'e-old-3']);

    expect((await t.pick(t.tokens.a, 'e-old-1')).status).toBe(201);
    expect((await t.pick(t.tokens.a, 'e-old-1')).body.code).toBe('title_already_picked');
    const second = await t.pick(t.tokens.a, 'e-old-2');
    expect(second.body.pick).toMatchObject({ used: 2, limit: 2 });
    const third = await t.pick(t.tokens.a, 'e-old-3');
    expect(third.status).toBe(409);
    expect(third.body).toMatchObject({ code: 'title_quota_full', limit: 2, used: 2 });
    expect((await t.pick(t.tokens.a, 'a-old')).body.code).toBe('not_on_shelf');
    expect((await t.pick(t.tokens.a, 'e-new')).body).toMatchObject({ code: 'not_open_for_plan', openDate: '2026-11-13' });

    expect((await t.start(t.tokens.a, 'e-old-1', 1)).status).toBe(201);
    expect((await t.start(t.tokens.a, 'e-old-3', 1)).body.code).toBe('no_entitlement');
    const sub = (await t.open(USER_A.id))!;
    const picks = t.store.titlePicks.filter((p) => p.subscriptionId === sub.id);
    const entitlement = t.store.entitlements.find((e) => e.id === picks[0].entitlementId)!;
    // Hanya sampai akhir slot bulan ini (tanpa tambahan masa tenggang).
    expect(entitlement).toMatchObject({ scope: 'product', source: 'membership', endsAt: picks[0].periodEnd, maxDevices: 2 });
    expect(t.mails.some((m) => m.subject.includes('Jatah bulan ini'))).toBe(true);

    // Bulan berikutnya (perpanjangan dibayar): jatah baru, judul yang sama boleh dipilih lagi.
    t.advance(24);
    await t.phase2.runMembershipJob!();
    const renewal = (await t.store.listInvoices({ subscriptionId: sub.id, kinds: ['renewal'] }))[0];
    expect((await t.payInvoice(renewal.id)).body.status).toBe('success');
    t.advance(7);
    expect((await t.start(t.tokens.a, 'e-old-1', 1)).body.code).toBe('expired');
    expect((await t.pick(t.tokens.a, 'e-old-1')).status).toBe(201);
    expect((await t.as(t.tokens.a).get('/api/membership/picks')).body).toMatchObject({ used: 1, limit: 2 });
  });

  it('Gold membuka judul 30 hari setelah masuk rak -> "tersedia pada <tanggal>"; Platinum -> langsung', async () => {
    const t = await setup();
    await t.join(t.tokens.a, 'gold');
    await t.join(t.tokens.b, 'platinum');

    expect((await t.pick(t.tokens.a, 'e-new')).body).toMatchObject({ code: 'not_open_for_plan', openDate: '2026-09-29' });
    expect((await t.start(t.tokens.a, 'a-new')).body.code).toBe('no_entitlement');
    const shelf = await t.as(t.tokens.a).get('/api/membership/shelf');
    expect(shelf.body.plan).toMatchObject({ code: 'gold', frontlistDays: 45 });
    expect(shelf.body.upcoming.find((u: any) => u.productId === 'a-new')).toMatchObject({ openDate: '2026-09-29' });
    expect(shelf.body.items.map((i: any) => i.productId)).toEqual(['a-old']);

    // Platinum: seluruh rak (e-book & audio) sejak hari pertama, tanpa jatah judul.
    expect((await t.start(t.tokens.b, 'e-new')).status).toBe(201);
    expect((await t.start(t.tokens.b, 'a-new', 1)).status).toBe(201);
    expect((await t.as(t.tokens.b).get('/api/membership/picks')).body.enabled).toBe(false);

    // 29 September 00:30 WIB: judul terbuka untuk Gold.
    t.setTime('2026-09-28T17:30:00.000Z');
    expect((await t.pick(t.tokens.a, 'e-new')).status).toBe(201);
    expect((await t.start(t.tokens.a, 'a-new', 1)).status).toBe(201);
  });

  it('jam audio habis -> sesi & playlist ditolak dengan tawaran upgrade; jam baru terbuka bulan berikutnya', async () => {
    const t = await setup();
    await t.join(t.tokens.a, 'silver');
    await t.listened(USER_A.id, 'a-old', 5 * 3600 - 60);
    const almost = await t.start(t.tokens.a, 'a-old');
    expect(almost.body.audioQuota).toMatchObject({ remainingSeconds: 60, exhausted: false });
    await t.listened(USER_A.id, 'a-old', 60);
    const denied = await t.start(t.tokens.a, 'a-old');
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: 'audio_quota_exhausted', upgrade: true, audioQuota: { exhausted: true, limitSeconds: 18000, usedSeconds: 18000 } });
    expect(Date.parse(denied.body.audioQuota.resetsAt)).toBe(Date.parse('2026-10-14T03:00:00.000Z'));
    // Sesi yang sudah terbuka juga berhenti: playlist/segmen ditolak.
    const meta = await request(t.app).get('/api/player/a-old/meta').set('Authorization', `Bearer ${t.tokens.a}`).set('X-Session-Token', almost.body.sessionToken);
    expect(meta.body.audioQuota).toMatchObject({ exhausted: true });
    const playlist = await request(t.app).get(meta.body.stream.playlistUrl);
    expect(playlist.status).toBe(403);
    expect(playlist.body.code).toBe('audio_quota_exhausted');
    // E-book tidak terpengaruh kuota audio.
    expect((await t.pick(t.tokens.a, 'e-old-1')).status).toBe(201);
    expect((await t.start(t.tokens.a, 'e-old-1')).status).toBe(201);

    t.advance(30);
    const reset = await t.start(t.tokens.a, 'a-old', 1, true);
    expect(reset.status).toBe(201);
    expect(reset.body.audioQuota).toMatchObject({ usedSeconds: 0, exhausted: false });
  });

  it('perangkat ke-3 ditolak; satu sesi per pengguna (judul lain di perangkat yang sama menutup sesi lama)', async () => {
    const t = await setup();
    await t.join(t.tokens.a, 'platinum');
    const first = await t.start(t.tokens.a, 'e-old-1', 1);
    expect(first.status).toBe(201);
    expect((await t.start(t.tokens.a, 'e-old-2', 1)).status).toBe(201);
    expect(t.store.sessions.find((s) => s.productId === 'e-old-1')).toMatchObject({ endReason: 'switched' });
    expect((await t.start(t.tokens.a, 'e-old-1', 2)).body.code).toBe('session_conflict');
    expect((await t.start(t.tokens.a, 'e-old-1', 2, true)).status).toBe(201);
    const third = await t.start(t.tokens.a, 'e-old-1', 3, true);
    expect(third.body).toMatchObject({ code: 'device_limit', maxDevices: 2 });
  });
});

describe('Langkah 7 (bagian Langkah 1): akun keluarga Platinum', () => {
  it('maks. 2 akun; akun ke-3 ditolak; tiap akun punya rak & jam audio sendiri; dilepas -> akses berakhir', async () => {
    const t = await setup();
    await t.join(t.tokens.b, 'gold');
    expect((await t.as(t.tokens.b).post('/api/membership/family', { email: USER_C.email })).body.code).toBe('family_unavailable');

    await t.join(t.tokens.a, 'platinum');
    const owner = t.as(t.tokens.a);
    expect((await owner.post('/api/membership/family', { email: 'belum.daftar@uji.id' })).body.code).toBe('family_user_not_found');
    expect((await owner.post('/api/membership/family', { email: USER_A.email })).body.code).toBe('family_owner');
    expect((await owner.post('/api/membership/family', { email: USER_B.email })).body.code).toBe('family_member_subscribed');
    const added = await owner.post('/api/membership/family', { email: USER_C.email.toUpperCase() });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ available: true, limit: 2, members: [{ email: USER_C.email }] });
    expect((await owner.post('/api/membership/family', { email: USER_D.email })).status).toBe(201);
    const extra = await t.subscribe(t.tokens.b, 'gold'); // pengguna B sudah berlangganan: bukan kandidat
    expect(extra.status).toBe(409);
    const full = await owner.post('/api/membership/family', { email: 'ketiga@uji.id' });
    expect(full.body.code).toBe('family_user_not_found');
    // Akun ke-3 yang terdaftar -> family_full.
    const fifth = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', email: 'keluarga.e@uji.id', name: 'Keluarga E' };
    const tokenE = await mintUserToken(fifth);
    await t.as(tokenE).get('/api/account/me');
    const denied = await owner.post('/api/membership/family', { email: fifth.email });
    expect(denied.status).toBe(409);
    expect(denied.body).toMatchObject({ code: 'family_full', limit: 2 });
    expect(t.mails.some((m) => m.to.includes(USER_C.email) && m.subject.includes('akun keluarga'))).toBe(true);

    // Anggota: seluruh rak, sesi sendiri, jam audio sendiri (60 jam per akun).
    expect((await t.start(t.tokens.c, 'e-new', 7)).status).toBe(201);
    expect((await t.as(t.tokens.c).get('/api/membership/family')).body.memberOf).toMatchObject({ ownerName: USER_A.name });
    await t.listened(USER_C.id, 'a-old', 60 * 3600);
    expect((await t.start(t.tokens.c, 'a-old', 7)).body.code).toBe('audio_quota_exhausted');
    const ownerAudio = await t.start(t.tokens.a, 'a-old', 1);
    expect(ownerAudio.status).toBe(201);
    expect(ownerAudio.body.audioQuota).toMatchObject({ usedSeconds: 0, limitSeconds: 60 * 3600 });

    // Lepas anggota: akses dan sesinya berakhir.
    const memberId = added.body.members[0].id;
    const removed = await t.as(t.tokens.a).delete(`/api/membership/family/${memberId}`);
    expect(removed.body.members.map((m: any) => m.email)).toEqual([USER_D.email]);
    expect((await t.start(t.tokens.c, 'e-new', 7)).status).toBe(403);
    expect((await owner.post('/api/membership/family', { email: fifth.email })).status).toBe(201);
  });
});

describe('Langkah 7 (bagian Langkah 1): routing, instansi, paket lama', () => {
  it('routing bawaan: checkout satuan tidak bisa diakses; langganan Midtrans off -> method_unavailable', async () => {
    const t = await setup({ paymentRouting: null });
    const status = await request(t.app).get('/api/digital/status');
    expect(status.body.unitSales).toBe(false);
    const buy = await t.as(t.tokens.a).post('/api/digital/checkout', { items: ['e-old-1'], idempotency_key: `kunci-${crypto.randomUUID()}`, license_accepted: true });
    expect(buy.status).toBe(403);
    expect(buy.body.code).toBe('unit_sales_disabled');
    const sub = await t.subscribe(t.tokens.a, 'gold');
    expect(sub.status).toBe(400);
    expect(sub.body.code).toBe('method_unavailable');
    expect(t.store.subscriptions).toHaveLength(0);
    // Paket gratis dan paket lama tidak bisa dipilih.
    const routed = await setup();
    expect((await routed.subscribe(routed.tokens.a, 'blue')).body.code).toBe('plan_unavailable');
    expect((await routed.subscribe(routed.tokens.a, 'professional')).body.code).toBe('plan_unavailable');
    const plans = (await request(routed.app).get('/api/membership/plans')).body.plans;
    expect(plans.map((p: any) => p.code)).toEqual(['blue', 'silver', 'gold', 'platinum']);
    expect(plans.find((p: any) => p.code === 'platinum')).toMatchObject({ founding: null, maxDevices: 2, familyAccounts: 2, audioHoursPerPeriod: 60, frontlistDays: 0 });
  });

  it('instansi: tanpa layar jatah, seluruh rak dengan tanggal buka +45 hari', async () => {
    const t = await setup();
    // Kontrak koleksi penuh tanpa batas pengguna bersamaan (hook institusi diganti tiruan).
    t.phase2.context!.institution = { coversProduct: async () => true, claimSession: async () => null };
    await t.store.insertEntitlements([{
      userId: USER_A.id, productId: null, scope: 'shelf', source: 'institution', sourceRef: 'kontrak-uji',
      startsAt: new Date(t.clock.t - DAY).toISOString(), endsAt: new Date(t.clock.t + 300 * DAY).toISOString(), maxDevices: 2
    }]);
    expect((await t.as(t.tokens.a).get('/api/membership/picks')).body.enabled).toBe(false);
    expect((await t.start(t.tokens.a, 'e-old-1')).body.entitlement.source).toBe('institution');
    expect((await t.start(t.tokens.a, 'e-new', 1)).body.code).toBe('no_entitlement');
    t.setTime('2026-09-28T17:30:00.000Z');
    expect((await t.start(t.tokens.a, 'e-new', 1)).status).toBe(201);
  });

  it('pelanggan paket lama: pemberitahuan 30 hari sebelum perpanjangan (sekali), lalu diperpanjang ke paket penerus', async () => {
    const t = await setup({ legacyPlans: true });
    const body = await t.join(t.tokens.a, 'reader', 'monthly');
    // Keadaan setelah migration fase 6: paket lama nonaktif dengan penerus.
    for (const plan of t.store.plans.filter((p) => ['free', 'reader', 'professional', 'author'].includes(p.code))) {
      plan.isActive = false;
      plan.successorPlanId = { free: 'plan-blue', reader: 'plan-silver', professional: 'plan-gold', author: 'plan-platinum' }[plan.code as 'reader']!;
    }
    const sub = (await t.open(USER_A.id))!;
    expect(body.subscription.planCode).toBe('reader');
    t.advance(2);
    expect((await t.phase2.runMembershipJob!()).planMigrationNotices).toBe(1);
    expect((await t.phase2.runMembershipJob!()).planMigrationNotices).toBe(0);
    const notice = t.mails.find((m) => m.subject.includes('berganti menjadi Silver'))!;
    expect(notice.html).toContain('Rp 49.000');
    const me = await t.as(t.tokens.a).get('/api/membership/me');
    expect(me.body.subscription).toMatchObject({ planCode: 'reader', successorPlanCode: 'silver' });
    expect(me.body.subscription.nextRenewal).toMatchObject({ planCode: 'silver', amount: 49000 });

    t.advance(22);
    await t.phase2.runMembershipJob!();
    const renewal = (await t.store.listInvoices({ subscriptionId: sub.id, kinds: ['renewal'] }))[0];
    expect(renewal).toMatchObject({ planId: 'plan-silver', amount: 49000 });
    expect((await t.payInvoice(renewal.id)).body.status).toBe('success');
    t.advance(7);
    expect((await t.open(USER_A.id))!).toMatchObject({ planId: 'plan-silver', priceLocked: 49000 });
    const events = await t.store.listSubscriptionEvents({ subscriptionId: sub.id });
    expect(events.find((e) => e.type === 'plan_migrated')?.meta).toMatchObject({ from: 'reader', to: 'silver' });
    expect((await t.as(t.tokens.a).get('/api/membership/picks')).body).toMatchObject({ mode: 'quota', limit: 2 });
    expect((await t.start(t.tokens.a, 'a-old')).status).toBe(201);
  });

  it('harga member buku cetak (flag hidup): Silver 5%, Gold 10%, Platinum 20%', async () => {
    const t = await setup({ env: { ENABLE_MEMBER_PRINT_DISCOUNT: 'true' } });
    await t.join(t.tokens.a, 'silver');
    await t.join(t.tokens.b, 'gold');
    await t.join(t.tokens.c, 'platinum');
    const discount = (token: string) => t.phase2.memberPrintDiscount!(`Bearer ${token}`);
    expect(await discount(t.tokens.a)).toEqual({ percent: 5, planCode: 'silver' });
    expect(await discount(t.tokens.b)).toEqual({ percent: 10, planCode: 'gold' });
    expect(await discount(t.tokens.c)).toEqual({ percent: 20, planCode: 'platinum' });
    expect(await discount(t.tokens.d)).toBeNull();
  });

  it('admin dapat mengubah kuota paket; paket berjatah wajib punya jumlah judul', async () => {
    const t = await setup();
    const patch = (code: string, body: Record<string, unknown>) =>
      request(t.app).patch(`/api/admin/membership/plans/${code}`).set('x-test-admin', '1').send(body);
    const updated = await patch('gold', { ebookTitlesPerPeriod: 7, audioHoursPerPeriod: 25, frontlistDays: 30, offlineTitles: 3 });
    expect(updated.status).toBe(200);
    expect(updated.body.plan).toMatchObject({ ebookTitlesPerPeriod: 7, audioHoursPerPeriod: 25, frontlistDays: 30, offlineTitles: 3 });
    expect((await patch('silver', { ebookTitlesPerPeriod: null })).body.code).toBe('invalid_plan');
    expect((await patch('blue', { priceMonthly: 1000 })).body.code).toBe('invalid_plan');
    expect((await patch('platinum', { familyAccounts: 11 })).body.code).toBe('invalid_plan');
    expect(DEFAULT_PAYMENT_ROUTING.some((r) => r.transactionType === 'membership' && r.provider === 'manual')).toBe(true);
  });
});
