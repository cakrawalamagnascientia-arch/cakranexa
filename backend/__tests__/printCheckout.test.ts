import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PrintCheckoutService } from '../printCheckout/service';
import { createPrintCheckoutRouter } from '../printCheckout/router';
import { MemoryPrintOrderStore } from '../printCheckout/store';
import { DEFAULT_GATEWAY_FEE_RATES } from '../printOrderRoyalty';
import { ORDER_NOT_SAVED_MESSAGE } from '../printOrders';
import type { AssetStorage } from '../digital/storage';
import type { RajaOngkirClient } from '../printCheckout/rajaongkir';
import type { Book } from '../../src/types';
import { DEFAULT_PRINT_CHECKOUT_SETTINGS } from '../../src/data/shippingZones';
import { DEFAULT_COURIERS, type ShippingDestination, type ShippingRate } from '../../src/data/shippingRates';

/**
 * Checkout buku cetak (satu tes per poin keputusan):
 * 1 simpan gagal -> 503 · 2 ongkir zona dari server · 3 awaiting_transfer/expired/perpanjang + markOrderPaid ·
 * 4 hanya transfer bank (payment_routing) · 5 instruksi, email, WhatsApp, bukti transfer · 6 kode unik · 7 is_test.
 * Ongkir RajaOngkir memakai klien tiruan (API sungguhan tidak dipanggil).
 */

const START = Date.parse('2026-09-15T03:00:00.000Z'); // 10:00 WIB
const HOUR = 3_600_000;
const BOOKS = [
  { id: 'book-a', name: 'BUKU UJI SATU', harga: 185000, stock: 10, beratGram: 600 },
  { id: 'book-b', name: 'BUKU UJI DUA', harga: 150000 }
] as unknown as Book[];
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const CUSTOMER = {
  name: 'Pembeli Uji',
  phone: '081200000000',
  email: 'pembeli@uji.test',
  address: 'Jl. Uji 1',
  province: 'DKI Jakarta',
  city: 'Jakarta Pusat',
  postalCode: '10410',
  courier: 'JNE Express',
  shippingService: 'REG (Reguler)'
};
const IDR_ACCOUNT = { bankName: 'Bank Mandiri', accountNumber: '167-00-1164499-3', accountHolder: 'PT CAKRAWALA MAGNA SCIENTIA', branch: null, currency: 'IDR' as const, swiftCode: null };
const USD_ACCOUNT = { bankName: 'Bank Mandiri', accountNumber: '167-00-1171867-2', accountHolder: 'PT CAKRAWALA MAGNA SCIENTIA', branch: null, currency: 'USD' as const, swiftCode: 'BMRIIDJA' };
const ROUTE_VA_BCA ={ routing: [{ transactionType: 'print', method: 'va_bca', provider: 'midtrans' }] };
const ORIGIN = { id: 3855, label: 'KRAMAT, SENEN, JAKARTA PUSAT, DKI JAKARTA, 10450' };
const DEST: ShippingDestination = {
  id: 17473, label: 'SENEN, SENEN, JAKARTA PUSAT, DKI JAKARTA, 10410', province: 'DKI JAKARTA', city: 'JAKARTA PUSAT', district: 'SENEN', subdistrict: 'SENEN', zipCode: '10410'
};
const RATES: ShippingRate[] = [
  { courier: 'pos', courierName: 'POS Indonesia', service: 'Pos Reguler', description: 'Pos Reguler', cost: 21000, etd: '3 day' },
  { courier: 'jne', courierName: 'JNE', service: 'YES', description: 'Yakin Esok Sampai', cost: 36000, etd: '1 day' },
  { courier: 'jne', courierName: 'JNE', service: 'REG', description: 'Layanan Reguler', cost: 18000, etd: '2-3 day' },
  { courier: 'wahana', courierName: 'Wahana', service: 'NORMAL', description: 'Normal', cost: 9000, etd: '4 day' }
];

/** RajaOngkir tiruan: mencatat permintaan tarif; `fail` meniru API gagal, `rates` bisa dikosongkan. */
const fakeRajaOngkir = () => {
  const fake = {
    fail: false,
    rates: RATES,
    costCalls: [] as Array<{ origin: number; destination: number; weightGram: number; couriers: string[] }>,
    client: null as unknown as RajaOngkirClient
  };
  fake.client = {
    searchDestinations: async (q) => (q.toLowerCase().includes('senen') ? [DEST] : []),
    domesticCost: async (input) => {
      fake.costCalls.push(input);
      if (fake.fail) throw new Error('RajaOngkir 500: server error');
      return fake.rates;
    }
  };
  return fake;
};

let seq = 0;

const setup = (opts: { midtransEnabled?: boolean; storage?: boolean; mode?: 'zone' | 'rajaongkir'; rajaongkir?: boolean; origin?: boolean; usd?: boolean } = {}) => {
  const clock = { t: START };
  const stock: Record<string, number> = {};
  const store = new MemoryPrintOrderStore((bookId, quantity) => {
    stock[bookId] = (stock[bookId] ?? 0) + quantity;
  });
  const mode = opts.mode ?? 'zone';
  store.settings = { ...DEFAULT_PRINT_CHECKOUT_SETTINGS, fallbackMode: mode === 'zone' ? 'zone_table' : 'hold_order', origin: opts.origin === false ? null : ORIGIN, packagingGram: 100 };
  const raja = fakeRajaOngkir();
  const mails: Array<{ to: string[]; subject: string; html: string }> = [];
  const snaps: any[] = [];
  const adminNotices: any[] = [];
  const files = new Map<string, Buffer>();
  const storage: AssetStorage = {
    kind: 'filesystem',
    upload: async (objectPath, body) => {
      files.set(objectPath, body as Buffer);
    },
    download: async (objectPath) => files.get(objectPath)!,
    downloadToFile: async () => undefined,
    remove: async () => undefined,
    list: async () => []
  };
  const service = new PrintCheckoutService({
    store,
    storage: opts.storage === false ? null : storage,
    loadCatalog: async () => BOOKS,
    memberPrintDiscount: async () => null,
    memberPrintPrice: () => null,
    royaltyConfig: { ppnPercent: 0, feeRates: DEFAULT_GATEWAY_FEE_RATES },
    isTestBuyer: (email) => email.endsWith('@beta.test'),
    createSnap: async (order) => {
      snaps.push(order);
      return 'snap-token-uji';
    },
    notifyAdmin: async (order) => {
      adminNotices.push(order);
    },
    sendMail: async (message) => {
      mails.push(message);
    },
    listBankAccounts: async () => (opts.usd === false ? [IDR_ACCOUNT] : [IDR_ACCOUNT, USD_ACCOUNT]),
    adminEmails: ['admin@uji.test'],
    midtrans: { enabled: opts.midtransEnabled ?? false, isProduction: false },
    siteUrl: 'https://cakranexa.test',
    financeWhatsapp: '+6285286146806',
    companyName: 'PT Cakrawala Magna Scientia',
    tokenSecret: 'rahasia-uji',
    shippingRates: opts.rajaongkir === false ? null : raja.client,
    now: () => new Date(clock.t),
    random: () => 0.5,
    log: { error: () => undefined, warn: () => undefined }
  });
  const app = express();
  app.use(express.json());
  app.use(createPrintCheckoutRouter(service, (req, res, next) => {
    if (req.headers['x-test-admin'] === '1') return next();
    return res.status(401).json({ error: 'admin' });
  }));
  const order = (over: Record<string, any> = {}) => {
    seq += 1;
    const { customer, ...rest } = over;
    return {
      orderNumber: `CNX-202609-${String(seq).padStart(6, '0')}`,
      items: [{ book: { id: 'book-a' }, quantity: 1 }],
      paymentMethod: 'bank_transfer',
      language: 'id',
      ...rest,
      customer: { ...CUSTOMER, ...(customer || {}) }
    };
  };
  const place = (over: Record<string, any> = {}) => request(app).post('/api/orders').send(order(over));
  const admin = (method: 'get' | 'post' | 'patch' | 'put', path: string, body?: object) => {
    const req = request(app)[method](path).set('x-test-admin', '1');
    return body === undefined ? req : req.send(body);
  };
  const status = async (orderNumber: string) => (await store.getOrder(orderNumber))!.payment_status;
  const mailsWith = (subjectPart: string) => mails.filter((m) => m.subject.includes(subjectPart));
  const advance = (hours: number) => {
    clock.t += hours * HOUR;
  };
  const destination = async (q = 'senen') => (await request(app).get(`/api/shipping/destinations?q=${q}`)).body.destinations?.[0];
  return { store, service, app, mails, snaps, adminNotices, stock, files, place, admin, status, mailsWith, advance, raja, destination };
};

describe('checkout buku cetak: transfer bank ke rekening PT', () => {
  it('poin 2/5/6: ongkir zona dari server, kode unik dipotong dari total, batas 24 jam, email instruksi lengkap; stok belum berkurang', async () => {
    const t = setup();
    const config = await request(t.app).get('/api/print-checkout/config');
    expect(config.body.methods).toEqual(['bank_transfer']);
    expect(config.body.zones.find((z: any) => z.id === 'jabodetabek').fee).toBe(15000);
    expect(config.body.provinces).toHaveLength(38);

    const res = await t.place({ shippingCost: 15000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      paymentStatus: 'awaiting_transfer',
      paymentMethod: 'bank_transfer',
      subtotal: 185000,
      shippingCost: 15000,
      shippingZone: 'Jabodetabek',
      uniqueCode: 500,
      uniqueDiscount: 500,
      total: 199500,
      paymentMode: 'manual',
      snapToken: null
    });
    const n = res.body.orderNumber;
    expect(res.body.paymentDueAt).toBe(new Date(START + 24 * HOUR).toISOString());
    expect(res.body.orderPath).toBe(`/pesanan/${n}?t=${res.body.accessToken}`);
    expect(t.snaps).toHaveLength(0);
    expect(t.adminNotices).toHaveLength(1);
    expect(t.stock).toEqual({});

    expect(t.mails).toHaveLength(1);
    const [mail] = t.mails;
    expect(mail.to).toEqual(['pembeli@uji.test']);
    expect(mail.subject).toContain(`Instruksi pembayaran pesanan ${n}`);
    for (const expected of [n, 'Rp199.500', 'Rp185.000', 'Rp15.000', 'Potongan kode unik (500)', 'Bank Mandiri', '167-00-1164499-3',
      'PT CAKRAWALA MAGNA SCIENTIA', 'WIB', '24 jam', `https://cakranexa.test/pesanan/${n}?t=${res.body.accessToken}`]) {
      expect(mail.html, expected).toContain(expected);
    }
    const waText = encodeURIComponent(`Konfirmasi pembayaran pesanan #${n}, Rp199.500, atas nama Pembeli Uji`);
    expect(mail.html).toContain(`https://wa.me/6285286146806?text=${waText}`);
  });

  it('poin 2: angka ongkir dari browser tidak dipercaya (selisih -> 409 muat ulang); zona dari provinsi dan kota', async () => {
    const t = setup();
    const wrong = await t.place({ shippingCost: 1000 });
    expect(wrong.status).toBe(409);
    expect(wrong.body.code).toBe('shipping_changed');
    expect(wrong.body.error).toContain('Muat ulang');
    expect(t.store.orders).toHaveLength(0);

    expect((await t.place()).body.shippingCost).toBe(15000);
    expect((await t.place({ customer: { province: 'Jawa Barat', city: 'Kota Bogor' } })).body.shippingCost).toBe(15000);
    expect((await t.place({ customer: { province: 'Jawa Barat', city: 'Bandung' } })).body.shippingCost).toBe(18000);
    expect((await t.place({ customer: { province: 'Papua', city: 'Jayapura' } })).body.shippingCost).toBe(42000);
    const badProvince = await t.place({ customer: { province: 'Jakarta' } });
    expect(badProvince.status).toBe(400);
    expect(badProvince.body.code).toBe('invalid_province');
  });

  it('poin 2: >= 5 eksemplar -> menunggu ongkir; admin mengisi ongkir -> tagihan transfer dengan kode unik dan batas waktu', async () => {
    const t = setup();
    const res = await t.place({ items: [{ book: { id: 'book-a' }, quantity: 5 }], shippingCost: 999 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ paymentStatus: 'awaiting_shipping_quote', manualShippingQuote: true, shippingCost: 0, total: 925000, uniqueCode: null, paymentDueAt: null });
    expect(t.mails[0].subject).toContain('menunggu ongkos kirim');
    expect(t.mails[0].html).not.toContain('167-00-1164499-3');
    const n = res.body.orderNumber;
    expect((await t.admin('post', `/api/admin/print-orders/${n}/confirm-payment`, {})).status).toBe(409);

    t.advance(2);
    const quoted = await t.admin('post', `/api/admin/print-orders/${n}/shipping-quote`, { shippingFee: 55000 });
    expect(quoted.status).toBe(200);
    expect(quoted.body.order).toMatchObject({
      payment_status: 'awaiting_transfer', shipping_fee: 55000, unique_code: 500, unique_discount: 500, total_amount: 979500, payment_method: 'bank_transfer'
    });
    expect(quoted.body.order.payment_due_at).toBe(new Date(START + 26 * HOUR).toISOString());
    const bill = t.mails.at(-1)!;
    expect(bill.subject).toContain('ongkos kirim sudah ditentukan');
    expect(bill.html).toContain('Rp979.500');
    expect(bill.html).toContain('167-00-1164499-3');
    expect((await t.admin('post', `/api/admin/print-orders/${n}/shipping-quote`, { shippingFee: 1 })).status).toBe(409);
  });

  it('poin 4: metode selain transfer bank off sampai diaktifkan admin; routing baru langsung dipakai checkout berikutnya', async () => {
    const t = setup({ midtransEnabled: true });
    const off = await t.place({ paymentMethod: 'bca_va' });
    expect(off.status).toBe(400);
    expect(off.body.code).toBe('method_unavailable');
    expect((await t.admin('put', '/api/admin/payment-routing', { routing: [{ transactionType: 'print', method: 'va_bca', provider: 'manual' }] })).status).toBe(400);
    expect((await t.admin('put', '/api/admin/payment-routing', ROUTE_VA_BCA)).status).toBe(200);
    expect((await request(t.app).get('/api/print-checkout/config')).body.methods).toEqual(['bank_transfer', 'bca_va']);

    const va = await t.place({ paymentMethod: 'bca_va' });
    expect(va.body).toMatchObject({ paymentStatus: 'pending', paymentMethod: 'bca_va', uniqueCode: null, total: 200000, snapToken: 'snap-token-uji', paymentMode: 'midtrans_sandbox' });
    expect(t.snaps).toHaveLength(1);
    expect(t.snaps[0]).toMatchObject({ orderNumber: va.body.orderNumber, total: 200000, shippingCost: 15000 });
    expect(t.mails).toHaveLength(0);

    // Midtrans belum terkonfigurasi di server: metode gateway tidak ditawarkan walau routing menyala.
    const noMidtrans = setup({ midtransEnabled: false });
    await noMidtrans.admin('put', '/api/admin/payment-routing', ROUTE_VA_BCA);
    expect((await request(noMidtrans.app).get('/api/print-checkout/config')).body.methods).toEqual(['bank_transfer']);
  });

  it('poin 3: markOrderPaid dipakai konfirmasi admin, webhook Midtrans, dan dropdown Dispatcher; efek lunas hanya sekali', async () => {
    const t = setup({ midtransEnabled: true });
    const transfer = (await t.place()).body.orderNumber;
    const confirm = await t.admin('post', `/api/admin/print-orders/${transfer}/confirm-payment`, { reference: 'mutasi 15/09' });
    expect(confirm.status).toBe(200);
    expect(confirm.body.order).toMatchObject({ payment_status: 'paid', payment_confirmed_by: 'admin', payment_reference: 'mutasi 15/09' });
    expect(t.stock).toEqual({ 'book-a': 1 });
    expect(t.mailsWith('Pembayaran pesanan')).toHaveLength(1);
    expect((await t.admin('post', `/api/admin/print-orders/${transfer}/confirm-payment`, {})).status).toBe(409);
    expect(t.stock).toEqual({ 'book-a': 1 });
    expect(t.mailsWith('Pembayaran pesanan')).toHaveLength(1);

    await t.admin('put', '/api/admin/payment-routing', ROUTE_VA_BCA);
    const va = (await t.place({ paymentMethod: 'bca_va' })).body;
    const settlement = { order_id: va.orderNumber, transaction_status: 'settlement', gross_amount: `${va.total}.00`, transaction_id: 'trx-1', payment_type: 'bank_transfer' };
    expect(await t.service.handleMidtransNotification(settlement)).toMatchObject({ status: 200, body: { result: 'paid' } });
    expect(await t.service.handleMidtransNotification(settlement)).toMatchObject({ status: 200, body: { result: 'duplicate' } });
    expect(t.stock).toEqual({ 'book-a': 2 });
    expect(t.mailsWith('Pembayaran pesanan')).toHaveLength(2);
    await t.service.handleMidtransNotification({ ...settlement, transaction_status: 'expire' });
    expect(await t.status(va.orderNumber)).toBe('paid');

    const other = (await t.place({ paymentMethod: 'bca_va' })).body;
    expect(await t.service.handleMidtransNotification({ order_id: other.orderNumber, transaction_status: 'settlement', gross_amount: '1.00' })).toMatchObject({ status: 400 });
    expect(await t.status(other.orderNumber)).toBe('pending');
    expect(await t.service.handleMidtransNotification({ order_id: 'CNX-TIDAK-ADA', transaction_status: 'settlement', gross_amount: '1.00' })).toMatchObject({ status: 404 });

    // Dispatcher harus mengonfirmasi pembayaran dan memiliki resi sebelum mengirim notifikasi shipped.
    const shipped = (await t.place()).body.orderNumber;
    expect((await t.admin('patch', `/api/orders/${shipped}`, { paymentStatus: 'shipped', trackingNumber: 'JNE123' })).status).toBe(409);
    expect((await t.admin('post', `/api/admin/print-orders/${shipped}/confirm-payment`, {})).status).toBe(200);
    expect((await t.admin('patch', `/api/orders/${shipped}`, { paymentStatus: 'shipped' })).status).toBe(400);
    expect((await t.admin('patch', `/api/orders/${shipped}`, { paymentStatus: 'shipped', trackingNumber: 'JNE123' })).status).toBe(200);
    const row = await t.store.getOrder(shipped);
    expect(row).toMatchObject({ payment_status: 'shipped', tracking_number: 'JNE123', payment_confirmed_by: 'admin' });
    expect(row!.paid_at).toBeTruthy();
    expect(t.stock).toEqual({ 'book-a': 3 });
    expect(t.mailsWith('telah dikirim')).toHaveLength(1);
    expect(t.mails.at(-1)!.html).toContain('JNE123');
    expect((await t.admin('patch', `/api/orders/${shipped}`, { paymentStatus: 'shipped', trackingNumber: 'JNE123' })).status).toBe(200);
    expect(t.mailsWith('telah dikirim')).toHaveLength(1);
  });

  it('poin 3: lewat 24 jam -> expired + email; pesanan kedaluwarsa harus checkout ulang', async () => {
    const t = setup();
    const a = (await t.place()).body;
    const b = (await t.place()).body;
    t.advance(23);
    expect((await t.admin('post', '/api/admin/print-orders/jobs/run')).body).toEqual({ checked: 2, expired: 0 });
    t.advance(2);
    expect((await t.admin('post', '/api/admin/print-orders/jobs/run')).body).toEqual({ checked: 2, expired: 2 });
    expect((await request(t.app).get(`/api/orders/${a.orderNumber}/status`)).body.paymentStatus).toBe('expired');
    const expiredMails = t.mailsWith('kedaluwarsa');
    expect(expiredMails).toHaveLength(2);
    expect(expiredMails[0].html).toContain('buat pesanan baru');

    const detail = await request(t.app).get(`/api/orders/${a.orderNumber}/detail?t=${a.accessToken}`);
    expect(detail.body).toMatchObject({ status: 'expired', canUploadProof: false, bankAccounts: [] });
    expect((await t.admin('post', `/api/admin/print-orders/${a.orderNumber}/extend`, {})).status).toBe(409);
    expect((await t.admin('post', `/api/admin/print-orders/${a.orderNumber}/confirm-payment`, {})).status).toBe(409);

    expect((await t.admin('post', `/api/admin/print-orders/${b.orderNumber}/confirm-payment`, {})).status).toBe(409);
    expect((await t.admin('post', `/api/admin/print-orders/${b.orderNumber}/extend`, {})).status).toBe(409);
  });

  it('poin 5: halaman pesanan bertoken berisi instruksi & WhatsApp; bukti transfer ke bucket privat dan tampil di admin', async () => {
    const t = setup();
    const res = (await t.place()).body;
    const n = res.orderNumber;
    expect((await request(t.app).get(`/api/orders/${n}/detail?t=salah`)).status).toBe(404);
    const detail = await request(t.app).get(`/api/orders/${n}/detail?t=${res.accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      orderNumber: n, status: 'awaiting_transfer', total: 199500, subtotal: 185000, shippingFee: 15000, shippingZone: 'Jabodetabek',
      uniqueCode: 500, uniqueDiscount: 500, buyerName: 'Pembeli Uji', financeWhatsapp: '+6285286146806', canUploadProof: true, hasProof: false
    });
    expect(detail.body.whatsappText).toBe(`Konfirmasi pembayaran pesanan #${n}, Rp199.500, atas nama Pembeli Uji`);
    expect(detail.body.bankAccounts).toEqual([IDR_ACCOUNT, USD_ACCOUNT]);
    expect(detail.body.items[0]).toMatchObject({ bookId: 'book-a', quantity: 1, subtotal: 185000 });
    expect(detail.body.items[0].title).toMatch(/uji satu/i);

    const proofUrl = `/api/orders/${n}/proof?t=${res.accessToken}`;
    const fake = await request(t.app).post(proofUrl).attach('file', Buffer.from('bukan gambar'), { filename: 'bukti.png', contentType: 'image/png' });
    expect(fake.status).toBe(415);
    const upload = await request(t.app).post(proofUrl).attach('file', PNG, { filename: 'bukti.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    expect([...t.files.keys()]).toEqual([expect.stringMatching(new RegExp(`^print-order-proofs/${n}/\\d+-[0-9a-f]{8}\\.png$`))]);
    expect(t.mailsWith('[Bukti Transfer]')).toHaveLength(1);

    const list = await t.admin('get', '/api/orders');
    expect(list.body.find((o: any) => o.order_id === n)).toMatchObject({ has_proof: true });
    expect((await request(t.app).get(`/api/admin/print-orders/${n}/proof`)).status).toBe(401);
    const proof = await t.admin('get', `/api/admin/print-orders/${n}/proof`);
    expect(proof.status).toBe(200);
    expect(proof.headers['content-type']).toContain('image/png');
    expect(Buffer.compare(proof.body as Buffer, PNG)).toBe(0);

    await t.admin('post', `/api/admin/print-orders/${n}/confirm-payment`, {});
    expect((await request(t.app).post(proofUrl).attach('file', PNG, { filename: 'b.png', contentType: 'image/png' })).status).toBe(409);

    // Tanpa bucket privat: form unggah disembunyikan dan endpoint menjawab 503; halaman tetap menutup pesanan lewat batas.
    const noStorage = setup({ storage: false });
    const o2 = (await noStorage.place()).body;
    const detailUrl = `/api/orders/${o2.orderNumber}/detail?t=${o2.accessToken}`;
    expect((await request(noStorage.app).get(detailUrl)).body.canUploadProof).toBe(false);
    expect((await request(noStorage.app).post(`/api/orders/${o2.orderNumber}/proof?t=${o2.accessToken}`).attach('file', PNG, { filename: 'b.png', contentType: 'image/png' })).status).toBe(503);
    noStorage.advance(25);
    expect((await request(noStorage.app).get(detailUrl)).body.status).toBe('expired');
  });

  it('poin 6: kode unik membuat nominal tiap pesanan terbuka berbeda, tidak pernah melebihi subtotal + ongkir; bisa dimatikan admin', async () => {
    const t = setup();
    const placed: any[] = [];
    for (let i = 0; i < 4; i += 1) placed.push((await t.place()).body);
    expect(new Set(placed.map((o) => o.total)).size).toBe(4);
    for (const o of placed) {
      expect(o.total).toBeLessThan(200000);
      expect(200000 - o.total).toBe(o.uniqueDiscount);
      expect(o.uniqueCode + o.uniqueDiscount).toBe(1000);
    }
    const current = (await t.admin('get', '/api/admin/print-checkout/settings')).body.settings;
    expect((await t.admin('put', '/api/admin/print-checkout/settings', { settings: { ...current, uniqueCodeEnabled: false } })).status).toBe(200);
    expect((await t.place()).body).toMatchObject({ uniqueCode: null, uniqueDiscount: 0, total: 200000 });
    expect((await t.admin('put', '/api/admin/print-checkout/settings', { settings: { ...current, manualQuoteMinCopies: 0 } })).status).toBe(400);
  });

  it('poin 7: pesanan uji ditandai otomatis untuk email beta dan manual oleh admin', async () => {
    const t = setup();
    const beta = (await t.place({ customer: { email: 'penguji@beta.test' } })).body.orderNumber;
    const normal = (await t.place()).body.orderNumber;
    expect((await t.store.getOrder(beta))!.is_test).toBe(true);
    expect((await t.store.getOrder(normal))!.is_test).toBe(false);
    expect((await t.admin('patch', `/api/admin/print-orders/${normal}/test`, { isTest: true })).body).toEqual({ isTest: true });
    expect((await t.store.getOrder(normal))!.is_test).toBe(true);
    expect((await request(t.app).patch(`/api/admin/print-orders/${normal}/test`).send({ isTest: false })).status).toBe(401);
  });

  it('RajaOngkir: tarif kurir sebenarnya dari server untuk kecamatan & berat katalog; tujuan harus hasil pencarian bertanda tangan', async () => {
    const t = setup({ mode: 'rajaongkir' });
    expect((await request(t.app).get('/api/print-checkout/config')).body).toMatchObject({ fallbackMode: 'hold_order', courierRates: true });
    expect((await request(t.app).get('/api/shipping/destinations?q=se')).status).toBe(400);
    const search = await request(t.app).get('/api/shipping/destinations?q=senen');
    expect(search.status).toBe(200);
    const dest = search.body.destinations[0];
    expect(dest).toMatchObject({ ...DEST, token: expect.stringMatching(/^[\w-]{32}$/) });

    // Tarif untuk isi keranjang: berat 2 x 600 g + kemasan 100 g; kurir di luar pengaturan dibuang; termurah dulu.
    const rates = await request(t.app).post('/api/shipping/quote').send({ destination: dest, items: [{ book_id: 'book-a', qty: 2 }] });
    expect(rates.body).toMatchObject({ status: 'ok', weightGram: 1300 });
    expect(rates.body.rates.map((r: ShippingRate) => `${r.courier}:${r.service}:${r.cost}`)).toEqual(['jne:REG:18000', 'pos:Pos Reguler:21000', 'jne:YES:36000']);
    expect(t.raja.costCalls[0]).toEqual({ origin: 3855, destination: 17473, weightGram: 1300, couriers: DEFAULT_COURIERS });

    const courier = { destination: dest, courierCode: 'jne', shippingService: 'REG', courier: 'JNE' };
    const res = await t.place({ shippingCost: 18000, customer: { ...courier, province: '', city: '', postalCode: '' } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ paymentStatus: 'awaiting_transfer', subtotal: 185000, shippingCost: 18000, shippingZone: 'JNE REG', shippingSource: 'rajaongkir', total: 202500 });
    expect(t.raja.costCalls.at(-1)).toMatchObject({ weightGram: 700 });
    const row = (await t.store.getOrder(res.body.orderNumber))!;
    expect(row).toMatchObject({
      shipping_source: 'rajaongkir', shipping_fee: 18000, courier: 'JNE - REG', shipping_destination_id: 17473, shipping_weight_gram: 700, shipping_etd: '2-3 day',
      province: 'DKI Jakarta', city: 'Jakarta Pusat', shipping_zone: null, shipping_address: 'Jl. Uji 1, Senen, Jakarta Pusat, DKI Jakarta (10410)'
    });
    expect(t.mails[0].html).toContain('JNE REG');
    expect(t.mails[0].html).toContain('Rp18.000');
    const detail = await request(t.app).get(`/api/orders/${res.body.orderNumber}/detail?t=${res.body.accessToken}`);
    expect(detail.body).toMatchObject({ shippingFee: 18000, shippingZone: 'JNE REG', shippingEtd: '2-3 day' });

    // Wilayah diubah di browser (tanda tangan tidak cocok) ditolak; tanpa wilayah memakai fallback.
    const before = t.store.orders.length;
    const tampered = await t.place({ shippingCost: 18000, customer: { ...courier, destination: { ...dest, id: 1 } } });
    expect(tampered.status).toBe(400);
    expect(tampered.body.code).toBe('destination_invalid');
    expect((await t.place({ customer: { destination: null } })).body.shippingSource).toBe('manual');
    expect((await request(t.app).post('/api/shipping/quote').send({ destination: { ...dest, token: 'x' }, items: [{ book_id: 'book-a', qty: 1 }] })).status).toBe(400);
    // Nominal atau layanan yang tidak sama dengan tarif RajaOngkir -> 409, pembeli memilih ulang.
    const cheaper = await t.place({ shippingCost: 1000, customer: courier });
    expect(cheaper.status).toBe(409);
    expect(cheaper.body.code).toBe('shipping_changed');
    expect((await t.place({ shippingCost: 9000, customer: { ...courier, courierCode: 'wahana', shippingService: 'NORMAL' } })).status).toBe(409);
    expect(t.store.orders).toHaveLength(before + 1);
  });

  it('RajaOngkir belum aktif atau gagal -> menunggu ongkir dari admin (tanpa angka karangan); admin melihat tarif RajaOngkir', async () => {
    // Tanpa API key: checkout memakai provinsi, ongkir diisi admin.
    const noKey = setup({ mode: 'rajaongkir', rajaongkir: false });
    expect((await request(noKey.app).get('/api/print-checkout/config')).body).toMatchObject({ fallbackMode: 'hold_order', courierRates: false });
    expect((await request(noKey.app).get('/api/shipping/destinations?q=senen')).status).toBe(503);
    const a = await noKey.place({ shippingCost: 15000 });
    expect(a.body).toMatchObject({ paymentStatus: 'awaiting_shipping_quote', shippingCost: 0, manualShippingQuote: true, shippingSource: 'manual', uniqueCode: null });
    expect(noKey.mails[0].subject).toContain('menunggu ongkos kirim');
    expect(noKey.mails[0].html).toContain('cek langsung ke kurir');
    expect((await request(noKey.app).get(`/api/orders/${a.body.orderNumber}/detail?t=${a.body.accessToken}`)).body.manualQuoteReason).toBe('rates');

    // API key ada tetapi lokasi asal belum diatur: tidak ada panggilan tarif.
    const noOrigin = setup({ mode: 'rajaongkir', origin: false });
    expect((await request(noOrigin.app).get('/api/print-checkout/config')).body.courierRates).toBe(false);
    expect((await noOrigin.place()).body.paymentStatus).toBe('awaiting_shipping_quote');
    expect(noOrigin.raja.costCalls).toHaveLength(0);

    // RajaOngkir gagal saat checkout -> menunggu ongkir; admin memuat tarif setelah pulih lalu memilih layanan.
    const t = setup({ mode: 'rajaongkir' });
    const dest = await t.destination();
    t.raja.fail = true;
    expect((await request(t.app).post('/api/shipping/quote').send({ destination: dest, items: [{ book_id: 'book-a', qty: 1 }] })).body)
      .toMatchObject({ status: 'manual', reason: 'unavailable' });
    const order = await t.place({ shippingCost: 18000, customer: { destination: dest, courierCode: 'jne', shippingService: 'REG' } });
    expect(order.body).toMatchObject({ paymentStatus: 'awaiting_shipping_quote', shippingCost: 0 });
    const n = order.body.orderNumber;
    expect((await t.admin('get', `/api/admin/print-orders/${n}/shipping-rates`)).body).toMatchObject({ available: false });
    t.raja.fail = false;
    const adminRates = await t.admin('get', `/api/admin/print-orders/${n}/shipping-rates`);
    expect(adminRates.body).toMatchObject({ available: true, weightGram: 700, destinationLabel: DEST.label });
    expect(adminRates.body.rates[0]).toMatchObject({ courier: 'jne', service: 'REG', cost: 18000 });
    expect((await request(t.app).get(`/api/admin/print-orders/${n}/shipping-rates`)).status).toBe(401);
    const quoted = await t.admin('post', `/api/admin/print-orders/${n}/shipping-quote`, { shippingFee: 18000, courier: 'JNE - REG' });
    expect(quoted.body.order).toMatchObject({ payment_status: 'awaiting_transfer', shipping_fee: 18000, total_amount: 202500 });
    expect((await t.store.getOrder(n))!.courier).toBe('JNE - REG');

    // Tidak ada layanan kurir ke tujuan -> menunggu ongkir; >= N eksemplar tetap menunggu ongkir (alasan: pesanan besar).
    t.raja.rates = [];
    expect((await request(t.app).post('/api/shipping/quote').send({ destination: dest, items: [{ book_id: 'book-a', qty: 1 }] })).body.reason).toBe('no_service');
    t.raja.rates = RATES;
    const bulkRates = await request(t.app).post('/api/shipping/quote').send({ destination: dest, items: [{ book_id: 'book-a', qty: 5 }] });
    expect(bulkRates.body).toMatchObject({ status: 'manual', reason: 'bulk', weightGram: 3100 });
    const bulk = await t.place({ items: [{ book: { id: 'book-a' }, quantity: 5 }], customer: { destination: dest } });
    expect(bulk.body.paymentStatus).toBe('awaiting_shipping_quote');
    expect(t.mails.at(-1)!.html).toContain('5 eksemplar atau lebih');
  });

  it('pengaturan ongkir: lokasi asal, kurir, dan berat kemasan divalidasi; lokasi asal mengaktifkan tarif kurir di checkout', async () => {
    const t = setup({ mode: 'rajaongkir', origin: false });
    const res = await t.admin('get', '/api/admin/print-checkout/settings');
    expect(res.body.rajaongkir).toEqual({ configured: true });
    const current = res.body.settings;
    expect(current).toMatchObject({ fallbackMode: 'hold_order', origin: null });
    expect((await t.admin('put', '/api/admin/print-checkout/settings', { settings: { ...current, origin: { id: -1, label: 'X' } } })).status).toBe(400);
    expect((await t.admin('put', '/api/admin/print-checkout/settings', { settings: { ...current, couriers: ['dhl'] } })).status).toBe(400);
    expect((await t.admin('put', '/api/admin/print-checkout/settings', { settings: { ...current, packagingGram: 9000 } })).status).toBe(400);
    const saved = await t.admin('put', '/api/admin/print-checkout/settings', { settings: { ...current, origin: ORIGIN, couriers: ['jne', 'pos'] } });
    expect(saved.status).toBe(200);
    expect(saved.body.settings).toMatchObject({ origin: ORIGIN, couriers: ['jne', 'pos'] });
    expect((await request(t.app).get('/api/print-checkout/config')).body.courierRates).toBe(true);
    const dest = await t.destination();
    await request(t.app).post('/api/shipping/quote').send({ destination: dest, items: [{ book_id: 'book-b', qty: 1 }] });
    expect(t.raja.costCalls.at(-1)).toEqual({ origin: 3855, destination: 17473, weightGram: 600, couriers: ['jne', 'pos'] });
  });

  it('transfer dari luar negeri (USD): nominal Rupiah tanpa kode unik, batas 5 hari kerja, rekening USD + SWIFT, catatan USD diterima', async () => {
    const t = setup();
    const config = await request(t.app).get('/api/print-checkout/config');
    expect(config.body.usdTransfer).toEqual({ available: true, dueBusinessDays: 5 });

    const res = await t.place({ transferCurrency: 'USD', shippingCost: 15000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ paymentStatus: 'awaiting_transfer', transferCurrency: 'USD', uniqueCode: null, uniqueDiscount: 0, total: 200000 });
    // Selasa 10:00 WIB + 5 hari kerja (lewat Sabtu-Minggu) = Selasa berikutnya 10:00 WIB.
    expect(res.body.paymentDueAt).toBe('2026-09-22T03:00:00.000Z');
    const n = res.body.orderNumber;
    expect(await t.store.getOrder(n)).toMatchObject({ transfer_currency: 'USD', unique_code: null });

    const html = t.mails[0].html;
    const idrAt = html.indexOf('167-00-1164499-3');
    const foreignAt = html.indexOf('Untuk pembayaran dari luar negeri');
    expect(idrAt).toBeGreaterThan(-1);
    expect(foreignAt).toBeGreaterThan(idrAt);
    for (const expected of ['167-00-1171867-2', 'BMRIIDJA', 'PT CAKRAWALA MAGNA SCIENTIA', `nomor pesanan ${n}`, 'Rp200.000', '5 hari kerja', 'tanpa kode unik']) {
      expect(html, expected).toContain(expected);
    }
    expect(html.indexOf('167-00-1171867-2')).toBeGreaterThan(foreignAt);
    expect(html).not.toContain('Potongan kode unik');

    const detail = await request(t.app).get(`/api/orders/${n}/detail?t=${res.body.accessToken}`);
    expect(detail.body).toMatchObject({ transferCurrency: 'USD', transferDueBusinessDays: 5, uniqueCode: null, total: 200000 });

    // Perpanjangan tanpa jam -> 5 hari kerja dari batas lama; jam eksplisit tetap dihormati.
    const extended = await t.admin('post', `/api/admin/print-orders/${n}/extend`, {});
    expect(extended.status).toBe(200);
    expect(extended.body.order.payment_due_at).toBe('2026-09-29T03:00:00.000Z');

    // Konfirmasi Finance: alur sama, catatan USD opsional divalidasi sebelum menandai lunas.
    const bad = await t.admin('post', `/api/admin/print-orders/${n}/confirm-payment`, { usdAmountReceived: 'dua belas' });
    expect(bad.status).toBe(400);
    expect(await t.status(n)).toBe('awaiting_transfer');
    const confirmed = await t.admin('post', `/api/admin/print-orders/${n}/confirm-payment`, { reference: 'SWIFT MT103', usdAmountReceived: '12,5' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.order).toMatchObject({ payment_status: 'paid', payment_reference: 'SWIFT MT103', usd_amount_received: 12.5 });
    expect(t.stock).toEqual({ 'book-a': 1 });

    // Pesanan IDR biasa tetap memakai kode unik dan batas 24 jam; rekening USD tetap tercantum di bawahnya.
    const idr = (await t.place({ shippingCost: 15000 })).body;
    expect(idr).toMatchObject({ transferCurrency: 'IDR', uniqueCode: 500 });
    expect(idr.paymentDueAt).toBe(new Date(START + 24 * HOUR).toISOString());
    expect(t.mails.at(-1)!.html).toContain('Untuk pembayaran dari luar negeri');
  });

  it('transfer USD: tidak tersedia tanpa rekening USD aktif; menunggu ongkir -> tagihan USD tanpa kode unik dan 5 hari kerja', async () => {
    const off = setup({ usd: false });
    expect((await request(off.app).get('/api/print-checkout/config')).body.usdTransfer).toEqual({ available: false, dueBusinessDays: 5 });
    const refused = await off.place({ transferCurrency: 'USD' });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('usd_unavailable');
    expect((await off.place({ shippingCost: 15000 })).body.transferCurrency).toBe('IDR');
    expect(off.mails.at(-1)!.html).not.toContain('Untuk pembayaran dari luar negeri');

    const t = setup();
    const held = (await t.place({ transferCurrency: 'USD', items: [{ book: { id: 'book-a' }, quantity: 5 }] })).body;
    expect(held).toMatchObject({ paymentStatus: 'awaiting_shipping_quote', transferCurrency: 'USD' });
    const quoted = await t.admin('post', `/api/admin/print-orders/${held.orderNumber}/shipping-quote`, { shippingFee: 55000 });
    expect(quoted.body.order).toMatchObject({ payment_status: 'awaiting_transfer', unique_code: null, unique_discount: 0, total_amount: 980000 });
    expect(quoted.body.order.payment_due_at).toBe('2026-09-22T03:00:00.000Z');
    expect(t.mails.at(-1)!.html).toContain('5 hari kerja');
  });

  it('poin 1: pesanan gagal disimpan -> 503 tanpa transaksi pembayaran dan tanpa email; nomor ganda -> 409', async () => {
    const t = setup({ midtransEnabled: true });
    await t.admin('put', '/api/admin/payment-routing', ROUTE_VA_BCA);
    const first = await t.place();
    expect(first.status).toBe(201);
    const duplicate = await request(t.app).post('/api/orders').send({
      orderNumber: first.body.orderNumber, items: [{ book: { id: 'book-a' }, quantity: 1 }], paymentMethod: 'bank_transfer', customer: CUSTOMER
    });
    expect(duplicate.status).toBe(409);
    const mailsBefore = t.mails.length;
    const noticesBefore = t.adminNotices.length;
    t.store.insertOrder = async () => ({ error: { message: 'connection terminated', code: '08006' } });
    for (const paymentMethod of ['bank_transfer', 'bca_va']) {
      const res = await t.place({ paymentMethod });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: ORDER_NOT_SAVED_MESSAGE, code: 'order_not_saved' });
    }
    expect(t.snaps).toHaveLength(0);
    expect(t.mails).toHaveLength(mailsBefore);
    expect(t.adminNotices).toHaveLength(noticesBefore);
  });
});
