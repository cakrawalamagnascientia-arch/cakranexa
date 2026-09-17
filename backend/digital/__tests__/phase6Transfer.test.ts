import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createTestApp, mintUserToken, USER_A, USER_B, type TestAppOptions } from './harness';
import type { Phase1ProductLike } from '../memoryStore';
import { membershipEmail } from '../membership/email';
import { membershipWhatsApp } from '../membership/whatsapp';

/**
 * Fase 6 Langkah 4: keanggotaan dibayar lewat transfer bank + kode unik dan dikonfirmasi Finance (payment_routing
 * 'membership' bawaan), tanpa Midtrans. Juga status halaman buku dengan langganan sungguhan dari alur ini.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const START = '2026-09-14T03:00:00.000Z'; // Senin 10:00 WIB
const USER_C = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'platinum.c@uji.id', name: 'Pembaca C' };
const ADMIN = { 'x-test-admin': '1' };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(64)]);

const PRODUCTS: Phase1ProductLike[] = [
  { id: 'e-old-1', bookId: 'book-3', format: 'ebook', price: 0, isActive: true, availabilityStatus: 'available', pageCount: 300, durationSeconds: null, shelfEntryDate: '2026-01-01' },
  { id: 'e-old-2', bookId: 'book-24', format: 'ebook', price: 0, isActive: true, availabilityStatus: 'available', pageCount: 200, durationSeconds: null, shelfEntryDate: '2026-02-01' },
  { id: 'e-old-3', bookId: 'book-25', format: 'ebook', price: 0, isActive: true, availabilityStatus: 'available', pageCount: 120, durationSeconds: null, shelfEntryDate: '2026-03-01' },
  { id: 'e-new', bookId: 'book-3', format: 'ebook', price: 0, isActive: true, availabilityStatus: 'available', pageCount: 250, durationSeconds: null, shelfEntryDate: '2026-08-15' }
];

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const setup = async (extra: Partial<TestAppOptions> = {}) => {
  const clock = { t: Date.parse(START) };
  const t = await createTestApp({
    products: PRODUCTS.map((p) => ({ ...p })),
    now: () => new Date(clock.t),
    // Produksi fase 6: Midtrans mati, routing bawaan (keanggotaan = transfer bank manual).
    midtrans: { enabled: false, serverKey: '', snapUrl: '', isProduction: false },
    paymentRouting: null,
    ...extra
  });
  cleanups.push(t.cleanup);
  for (const p of PRODUCTS) await t.store.updateProduct(p.id, { storagePath: `x/${p.id}`, processingStatus: 'ready' });
  const tokens = { a: await mintUserToken(USER_A), b: await mintUserToken(USER_B), c: await mintUserToken(USER_C) };
  const as = (token: string) => ({
    get: (path: string) => request(t.app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body: Record<string, unknown> = {}) => request(t.app).post(path).set('Authorization', `Bearer ${token}`).send(body)
  });
  const subscribe = (token: string, planCode: string, cycle = 'yearly', key = `kunci-${crypto.randomUUID()}`) => as(token).post('/api/membership/subscribe', {
    plan_code: planCode, billing_cycle: cycle, payment_method: 'bank_transfer', idempotency_key: key, accept_terms: true, accept_license: true, language: 'id'
  });
  const confirm = (invoiceId: string, body: Record<string, unknown> = {}) =>
    request(t.app).post(`/api/admin/membership/transfers/${invoiceId}/confirm`).set(ADMIN).send(body);
  const join = async (token: string, planCode: string, cycle = 'yearly') => {
    const res = await subscribe(token, planCode, cycle);
    expect(res.status).toBe(201);
    expect((await confirm(res.body.invoice.id, { reference: 'MUTASI-1' })).status).toBe(200);
    return res.body;
  };
  const advance = (ms: number) => {
    clock.t += ms;
  };
  const job = async () => {
    const result = await t.phase2.runMembershipJob!();
    await t.phase2.idle?.();
    return result;
  };
  const mailsTo = (email: string) => t.mails.filter((m) => m.to.includes(email));
  return { ...t, clock, tokens, as, subscribe, confirm, join, advance, job, mailsTo };
};

describe('checkout keanggotaan: transfer bank + kode unik (tanpa Midtrans)', () => {
  it('tombol Pilih paket tersedia dari payment_routing walau Midtrans mati', async () => {
    const t = await setup();
    const res = await request(t.app).get('/api/membership/plans');
    expect(res.body).toMatchObject({ paymentAvailable: true, paymentMethods: ['bank_transfer'] });
    // Routing keanggotaan dimatikan admin -> tidak tersedia.
    const off = await setup({ paymentRouting: [{ transactionType: 'membership', method: 'bank_transfer', provider: 'off' }] });
    expect((await request(off.app).get('/api/membership/plans')).body).toMatchObject({ paymentAvailable: false, paymentMethods: [] });
    expect((await off.subscribe(off.tokens.a, 'gold')).body.code).toBe('method_unavailable');
    // Metode Snap tetap butuh Midtrans.
    const card = await t.as(t.tokens.a).post('/api/membership/subscribe', {
      plan_code: 'gold', billing_cycle: 'yearly', payment_method: 'card', idempotency_key: `kunci-${crypto.randomUUID()}`, accept_terms: true, accept_license: true
    });
    expect(card.body.code).toBe('payment_unavailable');
  });

  it('daftar: tagihan 24 jam berkode unik, instruksi lewat email, tanpa Snap; kunci yang sama = tagihan yang sama', async () => {
    const t = await setup();
    const key = `kunci-${crypto.randomUUID()}`;
    const res = await t.subscribe(t.tokens.a, 'gold', 'yearly', key);
    expect(res.status).toBe(201);
    const { invoice, subscription } = res.body;
    expect(subscription).toMatchObject({ status: 'pending', paymentMethod: 'bank_transfer' });
    expect(invoice).toMatchObject({ status: 'issued', paymentType: 'bank_transfer', snapToken: null, redirectUrl: null });
    expect(invoice.transfer.baseAmount).toBe(990000);
    expect(invoice.transfer.uniqueCode).toMatch(/^\d{3}$/);
    expect(invoice.amount).toBe(990000 - 1000 + Number(invoice.transfer.uniqueCode));
    expect(invoice.transfer.uniqueDiscount).toBe(990000 - invoice.amount);
    expect(Date.parse(invoice.dueAt) - Date.parse(START)).toBe(24 * HOUR);

    const again = await t.subscribe(t.tokens.a, 'gold', 'yearly', key);
    expect(again.body).toMatchObject({ reused: true, invoice: { id: invoice.id, amount: invoice.amount } });

    await t.phase2.idle?.();
    const mail = t.mailsTo(USER_A.email).find((m) => m.subject.startsWith('Instruksi transfer'));
    expect(mail).toBeTruthy();
    expect(mail!.html).toContain('000-00-0000000-0');
    expect(mail!.html).toContain(invoice.transfer.uniqueCode);
    expect(mail!.html).toContain('wa.me/6285286146806');
    expect(mail!.html).not.toMatch(/Virtual Account|QRIS|kartu kredit|Midtrans/i);
  });

  it('kode unik tidak bentrok dengan tagihan keanggotaan lain maupun pesanan cetak yang menunggu transfer', async () => {
    // Semua nominal Silver tahunan kecuali kode 500 sudah dipakai pesanan cetak.
    const taken = Array.from({ length: 999 }, (_, i) => 490000 - 1000 + i + 1).filter((total) => total !== 490000 - 1000 + 500);
    const t = await setup({ openPrintTransferTotals: async () => taken });
    const first = await t.subscribe(t.tokens.a, 'silver');
    expect(first.body.invoice.transfer.uniqueCode).toBe('500');
    // Nominal itu kini dipakai tagihan A: tagihan B tidak mendapat kode (nominal penuh), tidak pernah nominal yang sama.
    const second = await t.subscribe(t.tokens.b, 'silver');
    expect(second.body.invoice.amount).not.toBe(first.body.invoice.amount);
    expect(t.phase2.openMembershipTransferTotals).toBeTruthy();
    expect(await t.phase2.openMembershipTransferTotals!()).toEqual(expect.arrayContaining([first.body.invoice.amount]));
  });

  it('halaman tagihan: rekening dan WhatsApp Finance hanya milik anggota; unggah bukti ke bucket privat + email admin', async () => {
    const t = await setup();
    const { invoice } = (await t.subscribe(t.tokens.a, 'silver', 'monthly')).body;
    const detail = await t.as(t.tokens.a).get(`/api/membership/invoices/${invoice.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.bankAccounts).toEqual([expect.objectContaining({ bankName: 'Bank Uji', accountNumber: '000-00-0000000-0' })]);
    expect(detail.body.financeWhatsappUrl).toMatch(/^https:\/\/wa\.me\/6285286146806\?text=/);
    expect(decodeURIComponent(detail.body.financeWhatsappUrl)).toContain(invoice.orderRef);
    expect((await t.as(t.tokens.b).get(`/api/membership/invoices/${invoice.id}`)).status).toBe(404);

    const bad = await request(t.app).post(`/api/membership/invoices/${invoice.id}/proof`).set('Authorization', `Bearer ${t.tokens.a}`)
      .attach('file', Buffer.from('bukan gambar'), { filename: 'bukti.png', contentType: 'image/png' });
    expect(bad.status).toBe(415);
    const up = await request(t.app).post(`/api/membership/invoices/${invoice.id}/proof`).set('Authorization', `Bearer ${t.tokens.a}`)
      .attach('file', PNG, { filename: 'bukti.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.invoice.transfer).toMatchObject({ hasProof: true });
    const stored = await t.store.getInvoice(invoice.id);
    expect(stored!.paymentProofPath).toMatch(new RegExp(`^membership-proofs/${invoice.id}/\\d+-[0-9a-f]{8}\\.png$`));
    await t.phase2.idle?.();
    expect(t.mailsTo('admin@uji.id').some((m) => m.subject.includes(invoice.orderRef))).toBe(true);

    const proof = await request(t.app).get(`/api/admin/membership/transfers/${invoice.id}/proof`).set(ADMIN);
    expect(proof.status).toBe(200);
    expect(proof.headers['content-type']).toContain('image/png');
    expect((await request(t.app).get(`/api/admin/membership/transfers/${invoice.id}/proof`)).status).toBe(401);
  });

  it('konfirmasi Finance: paket aktif, hak rak dibuat, harga terkunci tanpa potongan kode, email "Pilih buku bulan ini"', async () => {
    const t = await setup();
    const { invoice } = (await t.subscribe(t.tokens.a, 'gold', 'monthly')).body;
    const queue = await request(t.app).get('/api/admin/membership/transfers').set(ADMIN);
    expect(queue.body.transfers).toEqual([expect.objectContaining({ id: invoice.id, customerEmail: USER_A.email, amount: invoice.amount, subscriptionStatus: 'pending' })]);

    const res = await t.confirm(invoice.id, { reference: 'BCA 14/09 #123' });
    expect(res.status).toBe(200);
    expect(res.body.invoice).toMatchObject({ status: 'paid', paymentType: 'bank_transfer' });
    const stored = await t.store.getInvoice(invoice.id);
    expect(stored).toMatchObject({ paymentConfirmedBy: 'admin', paymentReference: 'BCA 14/09 #123' });
    const me = await t.as(t.tokens.a).get('/api/membership/me');
    expect(me.body.subscription).toMatchObject({ status: 'active', planCode: 'gold', priceLocked: 99000 });
    expect((await t.confirm(invoice.id)).body.code).toBe('already_paid');
    expect((await request(t.app).get('/api/admin/membership/transfers').set(ADMIN)).body.transfers).toEqual([]);

    await t.phase2.idle?.();
    const welcome = t.mailsTo(USER_A.email).find((m) => m.subject.startsWith('Selamat datang'));
    expect(welcome!.subject).toContain('pilih buku bulan ini');
    expect(welcome!.html).toContain('/library/pick');
  });

  it('batas 24 jam: tagihan ditutup dan anggota diberi tahu; Finance dapat memperpanjang atau mengonfirmasi transfer terlambat', async () => {
    const t = await setup();
    const late = (await t.subscribe(t.tokens.a, 'silver', 'monthly')).body.invoice;
    const extended = (await t.subscribe(t.tokens.b, 'silver', 'monthly')).body.invoice;
    const ext = await request(t.app).post(`/api/admin/membership/transfers/${extended.id}/extend`).set(ADMIN).send({ hours: 24 });
    expect(Date.parse(ext.body.invoice.dueAt) - Date.parse(extended.dueAt)).toBe(24 * HOUR);

    t.advance(24 * HOUR + 60_000);
    await t.job();
    expect(await t.store.getInvoice(late.id)).toMatchObject({ status: 'void', failureReason: 'payment_expired' });
    expect((await t.store.getSubscription(late.subscriptionId ?? (await t.store.getInvoice(late.id))!.subscriptionId))!.status).toBe('expired');
    expect(await t.store.getInvoice(extended.id)).toMatchObject({ status: 'issued' });
    expect(t.mailsTo(USER_A.email).some((m) => m.subject.startsWith('Batas transfer'))).toBe(true);
    expect((await request(t.app).get(`/api/membership/invoices/${late.id}`).set('Authorization', `Bearer ${t.tokens.a}`)).body)
      .toMatchObject({ expired: true, bankAccounts: [], financeWhatsappUrl: null });
    expect((await request(t.app).post(`/api/membership/invoices/${late.id}/proof`).set('Authorization', `Bearer ${t.tokens.a}`)
      .attach('file', PNG, { filename: 'b.png', contentType: 'image/png' })).body.code).toBe('invoice_closed');

    // Transfer ternyata masuk sebelum batas: Finance mengonfirmasi dengan tanda "terlambat".
    expect((await t.confirm(late.id)).body.code).toBe('invoice_closed');
    expect((await request(t.app).get('/api/admin/membership/transfers?expired=1').set(ADMIN)).body.transfers.map((x: any) => x.id)).toContain(late.id);
    expect((await t.confirm(late.id, { allow_expired: true })).status).toBe(200);
    expect((await t.as(t.tokens.a).get('/api/membership/me')).body.subscription).toMatchObject({ status: 'active', planCode: 'silver' });
  });

  it('perpanjangan: tagihan H-7 berkode unik, pengingat berisi rekening, konfirmasi memperpanjang periode', async () => {
    const t = await setup();
    await t.join(t.tokens.a, 'silver', 'monthly');
    const me = (await t.as(t.tokens.a).get('/api/membership/me')).body;
    t.clock.t = Date.parse(me.subscription.currentPeriodEnd) - 7 * DAY + HOUR;
    await t.job();
    const renewal = (await t.store.listInvoices({ subscriptionId: me.subscription.id, kinds: ['renewal'] }))[0];
    expect(renewal).toMatchObject({ status: 'issued', paymentType: 'bank_transfer', midtransOrderId: null });
    expect(renewal.uniqueCode).not.toBeNull();
    expect(renewal.amount + renewal.uniqueDiscount).toBe(49000);
    const reminder = t.mailsTo(USER_A.email).find((m) => m.subject.startsWith('Tagihan perpanjangan'));
    expect(reminder!.html).toContain('000-00-0000000-0');
    expect(reminder!.html).not.toMatch(/Virtual Account|QRIS/);
    // Tombol bayar di halaman akun = instruksi transfer, bukan Snap.
    const pay = await t.as(t.tokens.a).post(`/api/membership/invoices/${renewal.id}/pay`);
    expect(pay.body.invoice).toMatchObject({ id: renewal.id, snapToken: null, transfer: expect.objectContaining({ baseAmount: 49000 }) });
    expect((await t.confirm(renewal.id)).status).toBe(200);
    const after = (await t.as(t.tokens.a).get('/api/membership/me')).body.subscription;
    expect(after.currentPeriodStart).toBe(me.subscription.currentPeriodEnd);
    expect(after.priceLocked).toBe(49000);
  });

  it('upgrade Silver -> Gold lewat transfer: selisih prorata berkode unik, aktif setelah konfirmasi', async () => {
    const t = await setup();
    await t.join(t.tokens.a, 'silver', 'monthly');
    const change = await t.as(t.tokens.a).post('/api/membership/change', { plan_code: 'gold', billing_cycle: 'monthly' });
    expect(change.status).toBe(200);
    expect(change.body).toMatchObject({ mode: 'immediate', applied: false, invoice: { kind: 'upgrade', paymentType: 'bank_transfer', snapToken: null } });
    expect(change.body.invoice.transfer.baseAmount).toBe(99000 - change.body.credit);
    expect((await t.confirm(change.body.invoice.id)).status).toBe(200);
    expect((await t.as(t.tokens.a).get('/api/membership/me')).body.subscription.planCode).toBe('gold');
  });
});

describe('status halaman buku dengan langganan sungguhan dari alur transfer', () => {
  const status = async (t: Awaited<ReturnType<typeof setup>>, token: string, productId: string) =>
    (await t.as(token).get(`/api/membership/title-status/${productId}`)).body;

  it('Silver jatah habis, Gold tersedia pada <tanggal>, Platinum langsung', async () => {
    const t = await setup();
    await t.join(t.tokens.a, 'silver');
    await t.join(t.tokens.b, 'gold');
    await t.join(t.tokens.c, 'platinum');

    expect(await status(t, t.tokens.a, 'e-old-1')).toMatchObject({ status: 'quota_available', quota: { used: 0, limit: 2 } });
    for (const id of ['e-old-1', 'e-old-2']) expect((await t.as(t.tokens.a).post('/api/membership/picks', { product_id: id })).status).toBe(201);
    expect(await status(t, t.tokens.a, 'e-old-3')).toMatchObject({ status: 'quota_full', planCode: 'silver', quota: { used: 2, limit: 2 } });
    expect(await status(t, t.tokens.a, 'e-old-1')).toMatchObject({ status: 'open', via: 'quota' });

    expect(await status(t, t.tokens.b, 'e-new')).toMatchObject({ status: 'opens_on', planCode: 'gold', openDate: '2026-09-29', upgradeOpenDate: '2026-08-15' });
    expect(await status(t, t.tokens.c, 'e-new')).toMatchObject({ status: 'open', planCode: 'platinum', upgrade: false });
  });
});

describe('teks email & WhatsApp keanggotaan tanpa VA/QRIS/kartu/Midtrans', () => {
  it.each(['id', 'en'])('bahasa %s', (language) => {
    const base = { language, name: 'Uji', siteUrl: 'https://cakranexa.test', planName: 'Gold', amount: 98765, date: START, days: 3 };
    const transfer = { accounts: [{ bankName: 'Bank Uji', accountNumber: '123', accountHolder: 'PT' }], uniqueCode: '765', whatsappUrl: 'https://wa.me/1' };
    for (const kind of ['invoice', 'reminder', 'paymentFailed', 'grace', 'transferInstructions', 'transferExpired'] as const) {
      const email = membershipEmail(kind, { ...base, transfer });
      expect(email.html, kind).not.toMatch(/Virtual Account|QRIS|kartu|card details|Midtrans/i);
      const wa = membershipWhatsApp(kind, { ...base, transfer });
      expect(wa.text, kind).not.toMatch(/Virtual Account|QRIS|diperpanjang otomatis|pembayaran otomatis|renew automatically|automatic payment|Midtrans/i);
    }
    expect(membershipEmail('transferInstructions', { ...base, transfer }).html).toContain('765');
  });
});
