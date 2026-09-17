import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { createTestApp, TEST_BANK_ACCOUNTS, TEST_COMPANY, type TestAppOptions } from './harness';
import { isEntitlementUsable } from '../entitlements';
import { catalogScalePct, DEFAULT_INSTITUTION_CONFIG, DEFAULT_TIERS, quoteContract } from '../institution/pricing';
import { invoiceDocument, pdfSafe, renderInvoicePdf, type InvoiceDocumentInput } from '../institution/pdf';
import { institutionEmail } from '../institution/email';
import type { MemoryInstitutionStore } from '../institution/memoryStore';
import type { ContractStatus, InquiryRef, NewInstitution } from '../institution/types';
import type { Phase1ProductLike } from '../memoryStore';

/**
 * Fase 4 Langkah 2 — alur kontrak institusi (docs/PHASE-4-BRIEF + koreksi review): harga & Founding (30 institusi pertama
 * yang membayar, kumulatif, dengan reservasi), invoice PDF + email bertautan, pelunasan manual/Midtrans -> entitlement
 * anggota, trial, perpanjangan otomatis (H-60 institusi, H-45 admin, invoice H-30, void +30 hari), "tidak diperpanjang",
 * tenggang, berakhir. Waktu dikendalikan `now`.
 */

const SERVER_KEY = 'SB-Mid-server-UJI';
const DAY = 86_400_000;
const START = '2026-09-14T03:00:00.000Z'; // 10:00 WIB
const PERIOD_START = '2026-09-13T17:00:00.000Z'; // 14 Sep 2026 00:00 WIB
const PERIOD_END = '2027-09-13T17:00:00.000Z';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

// Rak: dua judul (buku 3 punya e-book + audiobook = satu judul), satu judul belum masuk rak.
const PRODUCTS: Phase1ProductLike[] = [
  { id: 'prod-a', bookId: 'book-3', format: 'ebook', price: 99000, isActive: true, availabilityStatus: 'available', pageCount: 300, durationSeconds: null, shelfEntryDate: '2026-01-01' },
  { id: 'prod-a-audio', bookId: 'book-3', format: 'audiobook', price: 129000, isActive: true, availabilityStatus: 'available', pageCount: null, durationSeconds: 19800, shelfEntryDate: '2026-01-01' },
  { id: 'prod-b', bookId: 'book-24', format: 'ebook', price: 89000, isActive: true, availabilityStatus: 'available', pageCount: 200, durationSeconds: null, shelfEntryDate: '2026-02-01' },
  { id: 'prod-soon', bookId: 'book-25', format: 'ebook', price: 79000, isActive: true, availabilityStatus: 'available', pageCount: 100, durationSeconds: null, shelfEntryDate: '2027-06-01' }
];

const INQUIRY: InquiryRef = {
  id: '11111111-2222-4333-8444-555555555555',
  institutionName: 'Universitas Uji Nusantara',
  institutionType: 'university',
  email: 'Perpustakaan@UUN.ac.id',
  contactName: 'Dr. Kepala Perpustakaan',
  phone: '021-000000',
  language: 'id'
};

const sign = (orderId: string, statusCode: string, grossAmount: string) =>
  crypto.createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`).digest('hex');

const notification = (orderId: string, amount: number, status: string, extra: Record<string, unknown> = {}) => {
  const gross = `${amount}.00`;
  const statusCode = status === 'settlement' || status === 'capture' ? '200' : status === 'pending' ? '201' : '202';
  return {
    order_id: orderId, status_code: statusCode, gross_amount: gross, transaction_status: status,
    transaction_id: `trx-${orderId}`, payment_type: 'bank_transfer', signature_key: sign(orderId, statusCode, gross), ...extra
  };
};

const userId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const institutionRow = (n: number, status: NewInstitution['status']): NewInstitution => ({
  slug: `institusi-uji-${n}`, name: `Institusi Uji ${n}`, type: 'university', address: null, contactName: null, contactEmail: null,
  contactPhone: null, npwp: null, emailDomains: [], ipRanges: null, status, inquiryId: null, accountManager: null, logoUrl: null,
  showLogoPublic: false, notes: null, language: 'id'
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const setup = async (extra: Partial<TestAppOptions> = {}) => {
  const clock = { t: Date.parse(START) };
  const snapPayloads: any[] = [];
  const t = await createTestApp({
    products: PRODUCTS.map((p) => ({ ...p })),
    now: () => new Date(clock.t),
    inquiries: [INQUIRY],
    midtransClient: {
      createTransaction: async (payload) => {
        snapPayloads.push(payload);
        return { token: `snap-${snapPayloads.length}`, redirectUrl: `https://app.sandbox.midtrans.test/snap/v4/redirection/snap-${snapPayloads.length}` };
      }
    },
    ...extra
  });
  cleanups.push(t.cleanup);
  for (const p of t.products) await t.store.updateProduct(p.id, { processingStatus: 'ready' });
  const service = t.phase2.institution!;
  const istore = service.store as MemoryInstitutionStore;
  const admin = (method: 'get' | 'post' | 'patch', path: string, body: Record<string, unknown> = {}) =>
    request(t.app)[method](`/api/admin/institution${path}`).set('x-test-admin', '1').send(body);
  const createInstitution = async (body: Record<string, unknown> = {}) => {
    const res = await admin('post', '/institutions', { name: 'Perpustakaan Uji', type: 'library', contactEmail: 'kontak@perpus.test', ...body });
    expect(res.status).toBe(201);
    return res.body.institution as { id: string; slug: string; status: string };
  };
  /** Anggota aktif (dua), satu undangan tanpa akun, satu nonaktif; anggota pertama admin institusi. */
  const addMembers = async (institutionId: string, base = 1) => {
    const make = (n: number, over: Record<string, unknown>) => istore.insertMember({
      institutionId, userId: userId(n), role: 'member', status: 'active', invitedEmail: null, invitedAt: null, invitedBy: null,
      joinedAt: START, joinedVia: 'admin', groupLabel: null, disabledAt: null, expiresAt: null, ...over
    } as any);
    t.store.rememberUser({ id: userId(base), email: `admin${base}@perpus.test`, name: 'Admin Institusi' });
    await make(base, { role: 'admin' });
    await make(base + 1, {});
    await make(base + 2, { status: 'disabled', disabledAt: START });
    await istore.insertMember({ institutionId, userId: null, role: 'member', status: 'invited', invitedEmail: `undangan${base}@perpus.test`, invitedAt: START, invitedBy: 'admin', joinedAt: null, joinedVia: null, groupLabel: null, disabledAt: null, expiresAt: null });
  };
  const institutionEntitlements = async () => (await t.store.listEntitlements({ source: 'institution' }));
  const uploadProof = (invoiceId: string, body: Buffer = PNG, type = 'image/png') =>
    request(t.app).post(`/api/admin/institution/invoices/${invoiceId}/proof`).set('x-test-admin', '1').attach('file', body, { filename: 'bukti.png', contentType: type });
  const markPaid = async (invoiceId: string, body: Record<string, unknown> = {}) => {
    expect((await uploadProof(invoiceId)).status).toBe(200);
    return admin('post', `/invoices/${invoiceId}/mark-paid`, { confirm: true, method: 'transfer', ...body });
  };
  /** Kontrak draf -> invoice -> bukti -> lunas. */
  const activeContract = async (institutionId: string, body: Record<string, unknown> = { tier: 'starter', founding: true }) => {
    const created = await admin('post', `/institutions/${institutionId}/contracts`, body);
    expect(created.status).toBe(201);
    const issued = await admin('post', `/contracts/${created.body.contract.id}/issue`);
    expect(issued.status).toBe(201);
    const paid = await markPaid(issued.body.invoice.id, { reference: 'TRF-001' });
    expect(paid.status).toBe(200);
    return { contract: paid.body.contract, invoice: paid.body.invoice, link: issued.body.link as string };
  };
  /** Institusi dengan kontrak Founding yang sudah dibayar (langsung di store, untuk kuota). */
  const paidFoundingInstitution = async (n: number, status: ContractStatus) => {
    const institution = await istore.createInstitution(institutionRow(n, status === 'expired' ? 'expired' : 'active'));
    const contract = await istore.createContract({
      institutionId: institution.id, tier: 'starter', isTrial: false, concurrentUsers: 5, adminSeats: 1, fullPrice: 9_900_000, catalogScalePct: 40,
      catalogTitleCountAtSigning: 23, foundingDiscountPct: 15, contractedPrice: 3_366_000, ebaPct: 40, ebaCredit: 1_346_400,
      periodStart: '2025-09-01T00:00:00.000Z', periodEnd: '2026-09-01T00:00:00.000Z', graceDays: 14, status, collectionScope: 'full',
      previousContractId: null, notes: null, signedAt: '2025-09-01T00:00:00.000Z', createdBy: 'uji'
    });
    await istore.createInvoice({
      contractId: contract.id, institutionId: institution.id, number: await istore.nextInvoiceNumber(2025), amount: 3_366_000, taxPct: 0, taxAmount: 0,
      total: 3_366_000, issuedAt: '2025-08-20T00:00:00.000Z', dueAt: '2025-09-03T00:00:00.000Z', status: 'paid', paymentMethod: 'transfer',
      paidAt: '2025-08-25T00:00:00.000Z', paymentReference: null, proofPath: null, pdfPath: null, midtransOrderId: null, snapRedirectUrl: null, notes: null, createdBy: 'uji'
    });
    return institution;
  };
  return { ...t, clock, service, istore, admin, createInstitution, addMembers, institutionEntitlements, uploadProof, markPaid, activeContract, paidFoundingInstitution, snapPayloads, now: () => new Date(clock.t) };
};

describe('harga kontrak institusi (brief Langkah 2 & 9.1)', () => {
  const tier = (code: string) => DEFAULT_TIERS.find((t) => t.tier === code)!;
  const quote = (code: string, titles: number, founding = false) => quoteContract({ tier: tier(code), titleCount: titles, founding, config: DEFAULT_INSTITUTION_CONFIG });

  it('Starter 23 judul: 3.960.000 / Founding 3.366.000; kredit 20% (fase 6) 792.000 / 673.200', () => {
    expect(quote('starter', 23)).toMatchObject({ catalogScalePct: 40, scaledPrice: 3_960_000, contractedPrice: 3_960_000, ebaPct: 20, ebaCredit: 792_000, foundingDiscountAmount: 0 });
    expect(quote('starter', 23, true)).toMatchObject({ contractedPrice: 3_366_000, ebaCredit: 673_200, foundingDiscountPct: 15, foundingDiscountAmount: 594_000 });
  });

  it('Campus 9.960.000, Network 23.960.000; skala 60/80/100 menurut jumlah judul', () => {
    expect(quote('campus', 23).contractedPrice).toBe(9_960_000);
    expect(quote('network', 23).contractedPrice).toBe(23_960_000);
    const scale = DEFAULT_INSTITUTION_CONFIG.catalogScale;
    expect([0, 49, 50, 99, 100, 149, 150, 400].map((n) => catalogScalePct(n, scale))).toEqual([40, 40, 60, 60, 80, 80, 100, 100]);
    expect(quote('starter', 50).contractedPrice).toBe(5_940_000);
    expect(quote('starter', 100).contractedPrice).toBe(7_920_000);
    expect(quote('starter', 150).contractedPrice).toBe(9_900_000);
  });

  it('Enterprise wajib parameter manual; trial gratis tanpa EBA; PPN ditambahkan di atas harga kontrak', () => {
    expect(() => quote('enterprise', 23)).toThrow(/Enterprise/);
    const enterprise = quoteContract({ tier: tier('enterprise'), titleCount: 23, founding: false, config: DEFAULT_INSTITUTION_CONFIG, overrides: { concurrentUsers: 200, adminSeats: 20, fullPrice: 150_000_000 } });
    expect(enterprise).toMatchObject({ concurrentUsers: 200, adminSeats: 20, contractedPrice: 60_000_000 });
    expect(quoteContract({ tier: tier('starter'), titleCount: 23, founding: true, config: DEFAULT_INSTITUTION_CONFIG, isTrial: true }))
      .toMatchObject({ contractedPrice: 0, ebaPct: 0, ebaCredit: 0, foundingDiscountPct: 0 });
    const withTax = quoteContract({ tier: tier('starter'), titleCount: 23, founding: false, config: { ...DEFAULT_INSTITUTION_CONFIG, ppnPct: 11 } });
    expect(withTax).toMatchObject({ contractedPrice: 3_960_000, taxAmount: 435_600, total: 4_395_600 });
  });
});

describe('alur kontrak institusi', () => {
  it('permintaan -> prospect -> pratinjau -> draf -> invoice PDF + email -> lunas manual -> semua anggota aktif mendapat entitlement', async () => {
    const t = await setup();
    const converted = await t.admin('post', '/institutions', { inquiryId: INQUIRY.id });
    expect(converted.status).toBe(201);
    const inst = converted.body.institution;
    expect(inst).toMatchObject({ name: INQUIRY.institutionName, type: 'university', status: 'prospect', slug: 'universitas-uji-nusantara', contactEmail: 'perpustakaan@uun.ac.id', inquiryId: INQUIRY.id, language: 'id' });
    expect((await t.admin('post', '/institutions', { inquiryId: INQUIRY.id })).body.code).toBe('inquiry_converted');
    await t.addMembers(inst.id);

    const preview = await t.admin('post', `/institutions/${inst.id}/contracts/preview`, { tier: 'starter', founding: true });
    expect(preview.status).toBe(200);
    expect(preview.body.quote).toMatchObject({ catalogTitleCount: 2, catalogScalePct: 40, fullPrice: 9_900_000, contractedPrice: 3_366_000, ebaCredit: 673_200, total: 3_366_000 });
    expect(preview.body).toMatchObject({ periodStart: PERIOD_START, periodEnd: PERIOD_END, founding: { eligible: true, cap: 30, used: 0 } });

    const created = await t.admin('post', `/institutions/${inst.id}/contracts`, { tier: 'starter', founding: true, notes: 'Kontrak uji' });
    expect(created.status).toBe(201);
    expect(created.body.contract).toMatchObject({ status: 'draft', contractedPrice: 3_366_000, foundingDiscountPct: 15, catalogTitleCountAtSigning: 2, graceDays: 14 });
    expect((await t.admin('post', `/institutions/${inst.id}/contracts`, { tier: 'campus' })).body.code).toBe('contract_open');
    // Draf belum mereservasi kursi Founding.
    expect((await t.admin('get', '/summary')).body.founding).toMatchObject({ used: 0, reserved: 0 });

    const issued = await t.admin('post', `/contracts/${created.body.contract.id}/issue`);
    expect(issued.status).toBe(201);
    const invoice = issued.body.invoice;
    expect(invoice).toMatchObject({ number: 'INV-INST-2026-0001', amount: 3_366_000, taxAmount: 0, total: 3_366_000, status: 'issued', hasPdf: true, dueAt: new Date(Date.parse(START) + 14 * DAY).toISOString() });
    expect(issued.body.contract.status).toBe('issued');
    expect(issued.body.link).toMatch(/^https:\/\/api\.cakranexa\.test\/api\/institution\/invoices\/[0-9a-f-]+\/pdf\?t=/);
    expect((await t.admin('get', '/summary')).body.founding).toMatchObject({ used: 1, reserved: 1, paid: 0 });

    await t.phase2.idle!();
    const mail = t.mails.find((m) => m.subject.includes('INV-INST-2026-0001'))!;
    expect(mail.to.sort()).toEqual(['admin1@perpus.test', 'perpustakaan@uun.ac.id']);
    expect(mail.html).toContain(TEST_BANK_ACCOUNTS[0].accountNumber);
    expect(mail.html).toContain('/api/institution/invoices/');
    expect(mail.html).toContain('Rp 3.366.000');

    // Tautan email: PDF tanpa login; token dirusak atau dipakai untuk invoice lain -> 403.
    const link = new URL(issued.body.link);
    const pdf = await request(t.app).get(`${link.pathname}${link.search}`).buffer(true).parse(binary);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const doc = await PDFDocument.load(pdf.body);
    expect(doc.getTitle()).toBe('Invoice INV-INST-2026-0001');
    expect((await request(t.app).get(`${link.pathname}${link.search.slice(0, -2)}xx`)).status).toBe(403);
    expect((await request(t.app).get(`/api/institution/invoices/${crypto.randomUUID()}/pdf${link.search}`)).status).toBe(403);

    // Belum lunas -> belum ada akses.
    expect(await t.institutionEntitlements()).toHaveLength(0);
    expect((await t.admin('post', `/invoices/${invoice.id}/mark-paid`, { confirm: true, method: 'transfer' })).body.code).toBe('proof_required');
    expect((await t.uploadProof(invoice.id, Buffer.from('bukan gambar sungguhan'))).status).toBe(415);
    expect((await t.uploadProof(invoice.id)).body.invoice.hasProof).toBe(true);

    const paid = await t.admin('post', `/invoices/${invoice.id}/mark-paid`, { confirm: true, method: 'transfer', reference: 'TRF-UUN-01', paidDate: '2026-09-14' });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ result: 'success', invoice: { status: 'paid', paymentMethod: 'transfer', paymentReference: 'TRF-UUN-01' }, contract: { status: 'active' }, institution: { status: 'active' } });

    const entitlements = await t.institutionEntitlements();
    expect(entitlements.map((e) => e.userId).sort()).toEqual([userId(1), userId(2)]);
    for (const e of entitlements) {
      expect(e).toMatchObject({ scope: 'shelf', productId: null, sourceRef: created.body.contract.id, startsAt: PERIOD_START, endsAt: '2027-09-27T17:00:00.000Z', maxDevices: 2, status: 'active' });
      expect(isEntitlementUsable(e, t.now())).toBe(true);
    }
    await t.phase2.idle!();
    expect(t.mails.some((m) => m.subject.startsWith('Pembayaran diterima — akses'))).toBe(true);
    expect((await t.admin('post', `/invoices/${invoice.id}/mark-paid`, { confirm: true, method: 'transfer' })).body.code).toBe('already_paid');

    const detail = await t.admin('get', `/institutions/${inst.id}`);
    expect(detail.body.contracts[0]).toMatchObject({ paid: true, status: 'active', renewal: null });
    expect(detail.body.members).toEqual({ active: 2, invited: 1, disabled: 1, admins: 1 });
    expect((await t.admin('get', '/summary')).body.founding).toMatchObject({ cap: 30, used: 1, paid: 1, reserved: 0, remaining: 29 });
  });

  it('Midtrans: tautan VA INST- lalu webhook mengaktifkan; notifikasi ganda idempoten; signature/nominal salah ditolak', async () => {
    const t = await setup();
    const inst = await t.createInstitution();
    await t.addMembers(inst.id);
    const created = await t.admin('post', `/institutions/${inst.id}/contracts`, { tier: 'campus' });
    const issued = await t.admin('post', `/contracts/${created.body.contract.id}/issue`);
    const linkRes = await t.admin('post', `/invoices/${issued.body.invoice.id}/midtrans`);
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.paymentUrl).toContain('snap-1');
    expect(t.snapPayloads[0].transaction_details).toEqual({ order_id: 'INST-INV-INST-2026-0001-1', gross_amount: 9_960_000 });
    expect(t.snapPayloads[0].enabled_payments).toContain('bca_va');
    const orderId = linkRes.body.invoice.midtransOrderId;

    const hook = t.phase2.handleInstitutionNotification!;
    expect((await hook({ ...notification(orderId, 9_960_000, 'settlement'), signature_key: 'salah' })).status).toBe(403);
    expect((await hook(notification(orderId, 9_000_000, 'settlement'))).status).toBe(400);
    expect((await hook(notification(orderId, 9_960_000, 'pending'))).body).toEqual({ status: 'ignored' });
    expect(await t.institutionEntitlements()).toHaveLength(0);

    expect((await hook(notification(orderId, 9_960_000, 'settlement'))).body).toEqual({ status: 'success' });
    expect((await hook(notification(orderId, 9_960_000, 'settlement'))).body).toEqual({ status: 'duplicate' });
    expect(await t.institutionEntitlements()).toHaveLength(2);
    const contract = await t.istore.getContract(created.body.contract.id);
    const invoice = await t.istore.getInvoice(issued.body.invoice.id);
    expect(contract!.status).toBe('active');
    expect(invoice).toMatchObject({ status: 'paid', paymentMethod: 'midtrans', paymentReference: `trx-${orderId}` });
    expect((await t.istore.getInstitution(inst.id))!.status).toBe('active');
  });

  it('trial 30 hari: langsung aktif tanpa invoice, sekali per institusi; kontrak berbayar menggantikan trial', async () => {
    const t = await setup();
    const inst = await t.createInstitution();
    await t.addMembers(inst.id);
    const trial = await t.admin('post', `/institutions/${inst.id}/trial`);
    expect(trial.status).toBe(201);
    expect(trial.body.contract).toMatchObject({ isTrial: true, status: 'active', tier: 'starter', contractedPrice: 0, ebaPct: 0, ebaCredit: 0, graceDays: 0, concurrentUsers: 5 });
    expect(trial.body.institution.status).toBe('trial');
    const trialAccess = await t.institutionEntitlements();
    expect(trialAccess).toHaveLength(2);
    expect(trialAccess[0].endsAt).toBe(new Date(Date.parse(START) + 30 * DAY).toISOString());
    expect(await t.istore.listInvoices({ contractId: trial.body.contract.id })).toHaveLength(0);
    expect((await t.admin('post', `/institutions/${inst.id}/trial`)).body.code).toBe('trial_used');

    const preview = await t.admin('post', `/institutions/${inst.id}/contracts/preview`, { tier: 'starter' });
    expect(preview.body.warnings.join(' ')).toMatch(/Trial/);
    const { contract } = await t.activeContract(inst.id, { tier: 'starter' });
    expect(contract.status).toBe('active');
    expect((await t.istore.getContract(trial.body.contract.id))!.status).toBe('expired');
    expect((await t.istore.getInstitution(inst.id))!.status).toBe('active');
  });

  it('Founding: 30 institusi PERTAMA yang membayar (kumulatif, termasuk yang sudah berakhir) -> institusi ke-31 tidak bisa; kuota konfigurabel', async () => {
    const t = await setup();
    for (let n = 1; n <= 30; n += 1) await t.paidFoundingInstitution(n, n <= 15 ? 'active' : 'expired');
    // Institusi aktif tanpa kontrak Founding tidak memakai kuota.
    for (let n = 31; n <= 35; n += 1) await t.istore.createInstitution(institutionRow(n, 'active'));
    const inst = await t.createInstitution({ name: 'Institusi Ke-31' });
    const detail = await t.admin('get', `/institutions/${inst.id}`);
    expect(detail.body.founding).toMatchObject({ eligible: false, reason: 'founding_full', cap: 30, used: 30, paid: 30, reserved: 0, remaining: 0 });
    const refused = await t.admin('post', `/institutions/${inst.id}/contracts/preview`, { tier: 'starter', founding: true });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('founding_unavailable');
    expect((await t.admin('post', `/institutions/${inst.id}/contracts/preview`, { tier: 'starter' })).body.quote.contractedPrice).toBe(3_960_000);

    expect((await t.admin('patch', '/config', { foundingCap: 31 })).status).toBe(200);
    expect((await t.admin('get', `/institutions/${inst.id}`)).body.founding).toMatchObject({ eligible: true, remaining: 1 });
  });

  it('Founding: kursi direservasi saat invoice terbit, dilepas saat lewat jatuh tempo atau invoice dibatalkan; bayar terlambat di atas kuota ditandai', async () => {
    const t = await setup();
    await t.admin('patch', '/config', { foundingCap: 2 });
    const [a, b, c] = [await t.createInstitution({ name: 'Institusi A' }), await t.createInstitution({ name: 'Institusi B' }), await t.createInstitution({ name: 'Institusi C' })];
    const draft = async (institutionId: string) => (await t.admin('post', `/institutions/${institutionId}/contracts`, { tier: 'starter', founding: true })).body.contract.id as string;
    const issue = (contractId: string) => t.admin('post', `/contracts/${contractId}/issue`);

    const invA = (await issue(await draft(a.id))).body.invoice;
    const contractB = await draft(b.id);
    const contractC = await draft(c.id); // draf belum mereservasi, jadi masih boleh dibuat
    t.clock.t = Date.parse(START) + 10 * DAY;
    const invB = (await issue(contractB)).body.invoice;
    expect((await t.admin('get', '/summary')).body.founding).toMatchObject({ used: 2, reserved: 2, remaining: 0 });
    const full = await issue(contractC);
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('founding_full');
    expect((await t.istore.getContract(contractC))!.status).toBe('draft');

    // Invoice A lewat jatuh tempo (14 hari) tanpa dibayar -> reservasinya lepas.
    t.clock.t = Date.parse(START) + 15 * DAY;
    expect((await t.admin('get', '/summary')).body.founding).toMatchObject({ used: 1, reserved: 1 });
    const invC = (await issue(contractC)).body.invoice;
    expect(invC.status).toBe('issued');

    // Invoice C dibatalkan -> kursinya lepas; B membayar.
    await t.admin('post', `/invoices/${invC.id}/void`, { confirm: true });
    expect((await t.admin('get', '/summary')).body.founding).toMatchObject({ used: 1, reserved: 1, paid: 0 });
    expect((await t.markPaid(invB.id)).body.result).toBe('success');
    const reissuedC = (await issue(contractC)).body.invoice;
    expect((await t.markPaid(reissuedC.id)).body.result).toBe('success');
    expect((await t.admin('get', '/summary')).body.founding).toMatchObject({ used: 2, paid: 2, reserved: 0, remaining: 0 });

    // A membayar setelah jatuh tempo saat kuota sudah penuh: pembayaran diterima, admin diberi tanda untuk ditinjau.
    expect((await t.markPaid(invA.id)).body.result).toBe('success');
    const events = await t.istore.listEvents({ institutionId: a.id });
    expect(events.some((e) => e.type === 'founding_over_cap' && (e.meta as any).paid === 3 && (e.meta as any).cap === 2)).toBe(true);
  });

  it('job: pengingat & overdue invoice; perpanjangan H-60 draf, H-45 email admin, H-30 invoice otomatis (skala baru) di email institusi; tenggang, berakhir, void +30 hari', async () => {
    const t = await setup();
    const unpaid = await t.createInstitution({ name: 'Institusi Belum Bayar' });
    const draft = await t.admin('post', `/institutions/${unpaid.id}/contracts`, { tier: 'starter' });
    await t.admin('post', `/contracts/${draft.body.contract.id}/issue`);
    t.clock.t = Date.parse(START) + 11 * DAY + 3_600_000;
    expect((await t.phase2.runInstitutionJob!()).invoiceReminders).toBe(1);
    expect((await t.phase2.runInstitutionJob!()).invoiceReminders).toBe(0);
    t.clock.t = Date.parse(START) + 14 * DAY + 3_600_000;
    expect((await t.phase2.runInstitutionJob!()).invoicesOverdue).toBe(1);
    expect((await t.istore.listInvoices({ institutionId: unpaid.id }))[0].status).toBe('overdue');
    await t.phase2.idle!();
    expect(t.mails.filter((m) => m.subject.includes('melewati jatuh tempo'))).toHaveLength(1);
    expect(t.mails.filter((m) => m.subject.startsWith('Pengingat: invoice'))).toHaveLength(1);
    await t.admin('post', `/contracts/${draft.body.contract.id}/cancel`, { confirm: true, reason: 'tidak jadi' });

    t.clock.t = Date.parse(START);
    const inst = await t.createInstitution();
    await t.addMembers(inst.id);
    const { contract } = await t.activeContract(inst.id);
    const end = Date.parse(PERIOD_END);

    // H-60: pemberitahuan institusi + draf perpanjangan (harga tanpa Founding), tanggal invoice otomatis disebut.
    t.clock.t = end - 59 * DAY;
    expect((await t.phase2.runInstitutionJob!())).toMatchObject({ renewalNotices: 1, renewalAdminNotices: 0, renewalInvoicesIssued: 0 });
    const renewal = (await t.istore.listContracts({ previousContractId: contract.id }))[0];
    expect(renewal).toMatchObject({ status: 'draft', createdBy: 'system:renewal', foundingDiscountPct: 0, contractedPrice: 3_960_000, periodStart: PERIOD_END, periodEnd: '2028-09-13T17:00:00.000Z' });
    expect((await t.phase2.runInstitutionJob!()).renewalNotices).toBe(0);
    await t.phase2.idle!();
    const notice60 = t.mails.filter((m) => m.subject.startsWith('Perpanjangan langganan'));
    expect(notice60).toHaveLength(1);
    expect(notice60[0].html).toContain('Rp 3.960.000');
    // H-30 dari 14 Sep 2027 00:00 WIB = 15 Agustus 2027 (WIB).
    expect(notice60[0].html).toContain('akan terbit otomatis pada 15 Agustus 2027');

    // H-45: email internal ke admin CakraNexa, sekali.
    t.clock.t = end - 44 * DAY;
    expect((await t.phase2.runInstitutionJob!()).renewalAdminNotices).toBe(1);
    expect((await t.phase2.runInstitutionJob!()).renewalAdminNotices).toBe(0);
    await t.phase2.idle!();
    const adminMail = t.mails.filter((m) => m.subject.startsWith('[Institusi] Invoice perpanjangan'));
    expect(adminMail).toHaveLength(1);
    expect(adminMail[0].to).toEqual(['admin@uji.id']);
    expect(adminMail[0].html).toContain('Tidak diperpanjang');

    // Katalog tumbuh ke 51 judul (48 baru + prod-soon yang masuk rak 1 Jun 2027) -> invoice H-30 memakai skala 60%.
    for (let n = 0; n < 48; n += 1) {
      t.products.push({ id: `prod-extra-${n}`, bookId: `book-extra-${n}`, format: 'ebook', price: 50000, isActive: true, availabilityStatus: 'available', pageCount: 100, durationSeconds: null, shelfEntryDate: '2026-03-01' });
      await t.store.updateProduct(`prod-extra-${n}`, { processingStatus: 'ready' });
    }
    t.clock.t = end - 29 * DAY;
    expect((await t.phase2.runInstitutionJob!())).toMatchObject({ renewalInvoicesIssued: 1, renewalNotices: 1 });
    expect((await t.phase2.runInstitutionJob!())).toMatchObject({ renewalInvoicesIssued: 0, renewalNotices: 0 });
    expect(await t.istore.getContract(renewal.id)).toMatchObject({ status: 'issued', contractedPrice: 5_940_000, catalogScalePct: 60, catalogTitleCountAtSigning: 51 });
    const renewalInvoice = (await t.istore.listInvoices({ contractId: renewal.id }))[0];
    expect(renewalInvoice).toMatchObject({ number: 'INV-INST-2027-0001', total: 5_940_000, status: 'issued', createdBy: 'system:renewal' });
    await t.phase2.idle!();
    const notice30 = t.mails.filter((m) => m.subject.startsWith('Perpanjangan langganan')).at(-1)!;
    expect(notice30.html).toContain('INV-INST-2027-0001');
    expect(notice30.html).toContain('Rp 5.940.000');
    expect(notice30.html).toContain('/api/institution/invoices/');
    expect(notice30.html).toContain(TEST_BANK_ACCOUNTS[0].accountNumber);
    // Email invoice terpisah tidak dikirim (disatukan dengan pemberitahuan H-30).
    expect(t.mails.filter((m) => m.subject.startsWith('Invoice INV-INST-2027-0001'))).toHaveLength(0);

    // Tidak dibayar: tenggang (akses tetap, email memuat invoice), lalu berakhir (entitlement berakhir alami).
    t.clock.t = end + 3_600_000;
    expect((await t.phase2.runInstitutionJob!()).graceStarted).toBe(1);
    expect((await t.istore.getContract(contract.id))!.status).toBe('grace');
    expect((await t.istore.getInstitution(inst.id))!.status).toBe('grace');
    expect((await t.institutionEntitlements()).every((e) => isEntitlementUsable(e, t.now()))).toBe(true);
    await t.phase2.idle!();
    expect(t.mails.filter((m) => m.subject.startsWith('Masa tenggang')).at(-1)!.html).toContain('INV-INST-2027-0001');

    t.clock.t = end + 14 * DAY + 3_600_000;
    expect((await t.phase2.runInstitutionJob!()).expired).toBe(1);
    expect((await t.phase2.runInstitutionJob!()).expired).toBe(0);
    expect((await t.istore.getContract(contract.id))!.status).toBe('expired');
    expect((await t.istore.getInstitution(inst.id))!.status).toBe('expired');
    expect((await t.institutionEntitlements()).some((e) => isEntitlementUsable(e, t.now()))).toBe(false);
    await t.phase2.idle!();
    expect(t.mails.filter((m) => m.subject.startsWith('Masa tenggang'))).toHaveLength(1);
    expect(t.mails.filter((m) => m.subject.includes('telah berakhir'))).toHaveLength(1);

    // 30 hari setelah periode berakhir tanpa pembayaran: invoice perpanjangan di-void, kontraknya dibatalkan.
    t.clock.t = end + 29 * DAY;
    expect((await t.phase2.runInstitutionJob!()).renewalsVoided).toBe(0);
    t.clock.t = end + 30 * DAY + 3_600_000;
    expect((await t.phase2.runInstitutionJob!()).renewalsVoided).toBe(1);
    expect((await t.istore.getContract(renewal.id))!.status).toBe('canceled');
    expect((await t.istore.getInvoice(renewalInvoice.id))!.status).toBe('void');
    expect((await t.phase2.runInstitutionJob!()).renewalsVoided).toBe(0);
  });

  it('"tidak diperpanjang": tidak ada email admin, invoice, maupun pemberitahuan; kontrak berakhir seperti biasa', async () => {
    const t = await setup();
    const inst = await t.createInstitution();
    await t.addMembers(inst.id);
    const { contract } = await t.activeContract(inst.id);
    const end = Date.parse(PERIOD_END);
    t.clock.t = end - 50 * DAY;
    const declined = await t.admin('post', `/contracts/${contract.id}/decline-renewal`, { confirm: true, reason: 'Anggaran kampus dipotong' });
    expect(declined.status).toBe(200);
    expect(declined.body.renewal).toEqual({ state: 'declined' });
    expect((await t.admin('get', `/institutions/${inst.id}`)).body.contracts.find((c: any) => c.id === contract.id).renewal).toEqual({ state: 'declined' });
    // Menandai ulang aman (tidak ada yang berubah).
    expect((await t.admin('post', `/contracts/${contract.id}/decline-renewal`, { confirm: true })).status).toBe(200);

    for (const days of [44, 29, 10]) {
      t.clock.t = end - days * DAY;
      expect(await t.phase2.runInstitutionJob!()).toMatchObject({ renewalAdminNotices: 0, renewalInvoicesIssued: 0, renewalNotices: 0, errors: 0 });
    }
    expect(await t.istore.listInvoices({ institutionId: inst.id, statuses: ['issued', 'overdue'] })).toHaveLength(0);
    await t.phase2.idle!();
    expect(t.mails.filter((m) => m.subject.startsWith('Perpanjangan langganan') || m.subject.startsWith('[Institusi]'))).toHaveLength(0);

    t.clock.t = end + 3_600_000;
    expect((await t.phase2.runInstitutionJob!()).graceStarted).toBe(1);
    t.clock.t = end + 14 * DAY + 3_600_000;
    expect((await t.phase2.runInstitutionJob!()).expired).toBe(1);
    expect((await t.istore.getInstitution(inst.id))!.status).toBe('expired');
  });

  it('perpanjangan dibayar sebelum berakhir: menunggu di status terbit, aktif tepat di akhir periode tanpa tenggang; tidak bisa lagi ditandai tidak diperpanjang', async () => {
    const t = await setup();
    const inst = await t.createInstitution();
    await t.addMembers(inst.id);
    const { contract } = await t.activeContract(inst.id);
    const end = Date.parse(PERIOD_END);
    t.clock.t = end - 40 * DAY;
    await t.phase2.runInstitutionJob!();
    const renewal = (await t.istore.listContracts({ previousContractId: contract.id }))[0];
    const issued = await t.admin('post', `/contracts/${renewal.id}/issue`);
    expect(issued.body.invoice.number).toBe('INV-INST-2027-0001');
    const paid = await t.markPaid(issued.body.invoice.id, { method: 'va' });
    expect(paid.body).toMatchObject({ result: 'success', contract: { status: 'issued' }, institution: { status: 'active' } });
    const upcoming = (await t.institutionEntitlements()).filter((e) => e.sourceRef === renewal.id);
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0].startsAt).toBe(PERIOD_END);
    await t.phase2.idle!();
    expect(t.mails.some((m) => m.subject.startsWith('Pembayaran diterima — periode baru'))).toBe(true);
    expect((await t.admin('post', `/contracts/${contract.id}/decline-renewal`, { confirm: true })).body.code).toBe('renewal_paid');
    t.clock.t = end - 29 * DAY;
    expect(await t.phase2.runInstitutionJob!()).toMatchObject({ renewalNotices: 0, renewalInvoicesIssued: 0 });

    t.clock.t = end + 3_600_000;
    const result = await t.phase2.runInstitutionJob!();
    expect(result).toMatchObject({ activated: 1, graceStarted: 0 });
    expect((await t.istore.getContract(contract.id))!.status).toBe('expired');
    expect((await t.istore.getContract(renewal.id))!.status).toBe('active');
    expect((await t.istore.getInstitution(inst.id))!.status).toBe('active');
  });

  it('batal invoice -> kontrak kembali draf; batal kontrak; tanpa rekening CMS invoice ditolak; koleksi custom per judul', async () => {
    const t = await setup();
    const inst = await t.createInstitution();
    const custom = await t.admin('post', `/institutions/${inst.id}/contracts`, { tier: 'starter', collectionScope: 'custom', productIds: ['prod-a', 'prod-b', 'prod-a'] });
    expect(custom.status).toBe(201);
    expect(await t.istore.listContractCollection(custom.body.contract.id)).toEqual(['prod-a', 'prod-b']);
    expect((await t.admin('get', `/institutions/${inst.id}`)).body.contracts[0].collectionSize).toBe(2);

    const issued = await t.admin('post', `/contracts/${custom.body.contract.id}/issue`);
    const link = new URL(issued.body.link);
    const voided = await t.admin('post', `/invoices/${issued.body.invoice.id}/void`, { confirm: true, reason: 'salah tier' });
    expect(voided.body).toMatchObject({ invoice: { status: 'void' }, contract: { status: 'draft' } });
    expect((await request(t.app).get(`${link.pathname}${link.search}`)).status).toBe(410);
    const canceled = await t.admin('post', `/contracts/${custom.body.contract.id}/cancel`, { confirm: true });
    expect(canceled.body.contract.status).toBe('canceled');
    expect((await t.istore.getInstitution(inst.id))!.status).toBe('prospect');

    expect((await t.admin('post', `/institutions/${inst.id}/contracts`, { tier: 'starter', collectionScope: 'custom', productIds: ['tidak-ada'] })).body.code).toBe('collection_invalid');

    const noBank = await setup({ bankAccounts: [] });
    const other = await noBank.createInstitution();
    const draft = await noBank.admin('post', `/institutions/${other.id}/contracts`, { tier: 'starter' });
    const refused = await noBank.admin('post', `/contracts/${draft.body.contract.id}/issue`);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('bank_accounts_missing');
    expect((await noBank.istore.getContract(draft.body.contract.id))!.status).toBe('draft');
  });

  it('konfigurasi: PPN 11% dipakai invoice berikutnya; nilai di luar batas ditolak', async () => {
    const t = await setup();
    expect((await t.admin('patch', '/config', { ppnPct: 150 })).status).toBe(400);
    expect((await t.admin('patch', '/config', { catalogScale: [{ minTitles: 0, pct: 50 }] })).status).toBe(400);
    expect((await t.admin('patch', '/config', { renewalInvoiceDays: 0 })).status).toBe(400);
    const updated = await t.admin('patch', '/config', { ppnPct: 11, invoiceDueDays: 30 });
    expect(updated.body.config).toMatchObject({ ppnPct: 11, invoiceDueDays: 30, ebaExpiryDays: 90, renewalAdminNoticeDays: 45, renewalInvoiceDays: 30, renewalVoidDays: 30 });
    const inst = await t.createInstitution();
    const draft = await t.admin('post', `/institutions/${inst.id}/contracts`, { tier: 'starter' });
    const issued = await t.admin('post', `/contracts/${draft.body.contract.id}/issue`);
    expect(issued.body.invoice).toMatchObject({ amount: 3_960_000, taxPct: 11, taxAmount: 435_600, total: 4_395_600, dueAt: new Date(Date.parse(START) + 30 * DAY).toISOString() });
  });
});

describe('dokumen invoice & email institusi', () => {
  const input = (overrides: Partial<InvoiceDocumentInput> = {}): InvoiceDocumentInput => ({
    language: 'id',
    company: TEST_COMPANY,
    bankAccounts: TEST_BANK_ACCOUNTS,
    institution: { name: 'Universitas 北京 Ümlaut', address: 'Jl. Kampus 1', contactName: 'Bu Pustakawan', contactEmail: 'kontak@kampus.test', npwp: null },
    invoice: { number: 'INV-INST-2026-0009', amount: 3_366_000, taxPct: 0, taxAmount: 0, total: 3_366_000, issuedAt: START, dueAt: '2026-09-28T03:00:00.000Z' },
    contract: { concurrentUsers: 5, fullPrice: 9_900_000, catalogScalePct: 40, catalogTitleCountAtSigning: 23, foundingDiscountPct: 15, contractedPrice: 3_366_000, periodStart: PERIOD_START, periodEnd: PERIOD_END, ebaPct: 40, ebaCredit: 1_346_400 },
    tierName: 'Starter',
    paymentUrl: null,
    ...overrides
  });

  it('rincian perhitungan, rekening CMS, dan catatan EBA ada di invoice; aksara di luar WinAnsi tidak menggagalkan PDF', async () => {
    const doc = invoiceDocument(input());
    expect(doc.items).toEqual([
      { label: 'Harga penuh tahunan', amount: 'Rp 9.900.000' },
      { label: 'Skala katalog 40% (23 judul di rak saat kontrak dibuat)', amount: 'Rp 3.960.000' },
      { label: 'Diskon Founding 15% (tahun pertama)', amount: '- Rp 594.000' },
      { label: 'Subtotal (harga kontrak)', amount: 'Rp 3.366.000', strong: true },
      { label: 'PPN 0%', amount: 'Rp 0' },
      { label: 'Total tagihan', amount: 'Rp 3.366.000', strong: true }
    ]);
    expect(doc.payment.join('\n')).toContain('Bank Uji 000-00-0000000-0 a.n. PT UJI CAKRANEXA (KC Uji)');
    expect(doc.notes[0]).toContain('Rp 1.346.400');
    expect(doc.issuer).toContain('NPWP 00.000.000.0-000.000');
    expect(pdfSafe('Universitas 北京 Ümlaut – Ăn')).toBe('Universitas ?? Ümlaut – An');

    const pdf = await renderInvoicePdf(input({ paymentUrl: 'https://app.sandbox.midtrans.test/snap/v4/redirection/token-yang-sangat-panjang-sekali-tanpa-spasi-1234567890' }));
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getTitle()).toBe('Invoice INV-INST-2026-0009');
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(invoiceDocument(input({ language: 'en' })).items[5]).toEqual({ label: 'Total due', amount: 'Rp 3.366.000', strong: true });
  });

  it('email invoice (formal id/en) memuat tautan unduh dan rekening; tanpa rekening tidak menampilkan blok pembayaran', () => {
    const base = { institutionName: 'Universitas Uji', siteUrl: 'https://cakranexa.test', invoiceNumber: 'INV-INST-2026-0001', total: 3_366_000, dueAt: '2026-09-28T03:00:00.000Z', periodStart: PERIOD_START, periodEnd: PERIOD_END, tierName: 'Starter', downloadUrl: 'https://api.cakranexa.test/api/institution/invoices/x/pdf?t=1.a', bankAccounts: TEST_BANK_ACCOUNTS };
    const id = institutionEmail('invoiceIssued', { language: 'id', ...base });
    expect(id.subject).toBe('Invoice INV-INST-2026-0001 — langganan institusi CakraNexa');
    expect(id.html).toContain('Yth. Pengelola Universitas Uji');
    expect(id.html).toContain('000-00-0000000-0');
    expect(id.html).toContain(base.downloadUrl);
    const en = institutionEmail('invoiceIssued', { language: 'en', ...base });
    expect(en.subject).toBe('Invoice INV-INST-2026-0001 — CakraNexa institutional subscription');
    expect(en.html).toContain('Dear Universitas Uji team');
    expect(institutionEmail('activated', { language: 'id', ...base }).html).not.toContain('000-00-0000000-0');
  });
});
