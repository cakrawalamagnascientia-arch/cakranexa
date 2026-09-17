import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MemoryManuscriptStore } from '../manuscripts/memoryStore';
import { MemoryManuscriptAdminStore, type AuthorAccount } from '../manuscripts/adminStore';
import { ManuscriptAdminService } from '../manuscripts/adminService';
import { createManuscriptAdminRouter } from '../manuscripts/adminRouter';
import { parseCsv, parseDate, parseRupiah } from '../manuscripts/csvImport';
import type { AssetStorage } from '../digital/storage';

/**
 * Fase 5R Langkah 2: admin kontrak (addendum & nilai efektif, dokumen privat, pengingat, laporan & ekspor CSV,
 * impor CSV kontrak lama dengan pratinjau) dan akun login penulis.
 */

const AUTHOR_A = '11111111-1111-4111-8111-111111111111';
const AUTHOR_B = '22222222-2222-4222-8222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW = new Date('2026-11-01T03:00:00.000Z'); // 10:00 WIB
const PDF = Buffer.from('%PDF-1.4\n% uji kontrak\n');
const BOOKS = Array.from({ length: 23 }, (_, i) => ({
  id: `book-${i + 1}`,
  slug: `judul-uji-${i + 1}`,
  name: `JUDUL UJI ${i + 1}`,
  isbn: `978-623-10-${String(1000 + i)}-${i % 10}`
}));

const author = (id: string, name: string, email: string | null): AuthorAccount => ({ id, name, email, userId: null, userLinkSource: null, userLinkedAt: null });

const setup = (opts: { storage?: boolean } = {}) => {
  const store = new MemoryManuscriptStore();
  const adminStore = new MemoryManuscriptAdminStore();
  adminStore.authors.push(author(AUTHOR_A, 'Henry Dianto P. Sinaga', 'Henry@Contoh.id'), author(AUTHOR_B, 'Anton Hartanto', 'anton@contoh.id'));
  adminStore.users.push(
    { id: USER_A, email: 'henry@contoh.id', verified: true },
    { id: USER_B, email: 'anton@contoh.id', verified: false },
    { id: USER_C, email: 'lain@contoh.id', verified: true }
  );
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
  const mails: Array<{ to: string[]; subject: string; html: string }> = [];
  const logs: unknown[][] = [];
  const log = { info: (...a: unknown[]) => logs.push(a), warn: (...a: unknown[]) => logs.push(a), error: (...a: unknown[]) => logs.push(a) };
  const service = new ManuscriptAdminService({
    store,
    adminStore,
    storage: opts.storage === false ? null : storage,
    loadBooks: async () => BOOKS,
    sendMail: async (m) => {
      mails.push(m);
    },
    adminEmails: ['admin@uji.test'],
    siteUrl: 'https://cakranexa.test',
    now: () => NOW,
    log
  });
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(createManuscriptAdminRouter(service, (req, res, next) => (req.headers['x-test-admin'] === '1' ? next() : res.status(401).json({ error: 'admin' }))));
  const admin = (method: 'get' | 'post' | 'patch', path: string, body?: object) => {
    const req = request(app)[method](`/api/admin/manuscripts${path}`).set('x-test-admin', '1');
    return body === undefined ? req : req.send(body);
  };
  const contract = (over: Record<string, unknown> = {}) => ({
    contractNumber: 'SPK/2026/001',
    authorId: AUTHOR_A,
    bookId: 'book-1',
    rights: { print: true, ebook: true, audiobook: true },
    signedAt: '2026-09-01',
    termYears: 25,
    honorTotal: 30_000_000,
    revisionFeePerEdition: 5_000_000,
    ...over
  });
  /** Kontrak ditandatangani dengan satu tahap honor penuh. */
  const signed = async (over: Record<string, unknown> = {}, dueDate = '2026-09-10') => {
    const created = (await admin('post', '/contracts', contract(over))).body.contract;
    const honor = Number((over.honorTotal as number | undefined) ?? 30_000_000);
    const payment = honor > 0 ? (await admin('post', `/contracts/${created.id}/payments`, { stage: 'Honor', amount: honor, dueDate })).body.payment : null;
    expect((await admin('post', `/contracts/${created.id}/sign`)).status).toBe(200);
    return { contract: created, payment };
  };
  return { store, adminStore, service, app, admin, files, mails, logs, contract, signed };
};

describe('admin kontrak naskah: addendum & nilai efektif', () => {
  it('addendum mengubah hak/jangka waktu/honor tanpa mengedit kontrak induk; jadwal honor mengikuti nilai efektif', async () => {
    const t = setup();
    expect((await request(t.app).get('/api/admin/manuscripts/contracts')).status).toBe(401);
    const { contract } = await t.signed();

    const draft = (await t.admin('post', '/contracts', t.contract({ contractNumber: 'SPK/2026/002', bookId: 'book-2' }))).body.contract;
    const onDraft = await t.admin('post', `/contracts/${draft.id}/addenda`, { addendumNumber: 'ADD/0', signedAt: '2026-10-01', description: 'x', honorTotal: 1 });
    expect(onDraft.body.code).toBe('invalid_state');
    expect((await t.admin('post', `/contracts/${contract.id}/addenda`, { addendumNumber: 'ADD/X', signedAt: '2026-10-01', description: 'Tanpa perubahan', honorTotal: 30_000_000 })).body.code).toBe('invalid_addendum');
    expect((await t.admin('post', `/contracts/${contract.id}/addenda`, { addendumNumber: 'ADD/X', signedAt: '2026-08-01', description: 'Sebelum induk', termYears: 20 })).body.error).toContain('sebelum tanggal kontrak induk');
    expect((await t.admin('post', `/contracts/${contract.id}/addenda`, { addendumNumber: 'ADD/X', signedAt: '2026-10-01', description: 'Turun', honorTotal: 20_000_000 })).body.code).toBe('schedule_exceeds_honor');
    expect((await t.admin('post', `/contracts/${contract.id}/addenda`, { addendumNumber: 'ADD/X', signedAt: '2026-10-01', description: 'Tanpa hak', rights: { print: false, ebook: false, audiobook: false } })).body.error).toContain('minimal satu hak');

    const add1 = await t.admin('post', `/contracts/${contract.id}/addenda`, {
      addendumNumber: 'add/1', signedAt: '2026-10-01', description: 'Tambah hak terjemahan & honor', honorTotal: 40_000_000, termYears: 20,
      rights: { print: true, ebook: true, audiobook: true, translation: true, derivative: false }
    });
    expect(add1.status).toBe(201);
    expect(add1.body.addendum).toMatchObject({ addendumNumber: 'ADD/1', changes: { rights: { translation: true }, termYears: 20, honorTotal: 40_000_000, revisionFeePerEdition: null } });
    expect((await t.admin('post', `/contracts/${contract.id}/addenda`, { addendumNumber: 'ADD/1', signedAt: '2026-10-02', description: 'Ganda', termYears: 15 })).status).toBe(409);

    let detail = (await t.admin('get', `/contracts/${contract.id}`)).body;
    expect(detail.contract).toMatchObject({ honorTotal: 30_000_000, termYears: 25, rightsRevertAt: '2051-09-01', rights: { translation: false } });
    expect(detail.effective).toMatchObject({ honorTotal: 40_000_000, termYears: 20, rightsRevertAt: '2046-09-01', rights: { translation: true }, addenda: ['ADD/1'] });
    expect(detail.summary).toMatchObject({ honorTotal: 40_000_000, honorScheduled: 30_000_000, honorUnscheduled: 10_000_000 });

    // Kontrak induk tetap terkunci; tahap honor tambahan mengikuti honor efektif.
    expect((await t.admin('patch', `/contracts/${contract.id}`, { honorTotal: 40_000_000 })).body.code).toBe('contract_signed');
    expect((await t.admin('post', `/contracts/${contract.id}/payments`, { stage: 'Tambahan', amount: 10_000_000, dueDate: '2026-12-01' })).status).toBe(201);
    expect((await t.admin('post', `/contracts/${contract.id}/payments`, { stage: 'Lebih', amount: 1, dueDate: '2026-12-01' })).body.code).toBe('schedule_exceeds_honor');

    // Addendum berikutnya (urut tanggal) memperpendek jangka waktu lagi.
    expect((await t.admin('post', `/contracts/${contract.id}/addenda`, { addendumNumber: 'ADD/2', signedAt: '2026-10-15', description: 'Jangka 10 tahun', termYears: 10 })).status).toBe(201);
    detail = (await t.admin('get', `/contracts/${contract.id}`)).body;
    expect(detail.effective).toMatchObject({ termYears: 10, rightsRevertAt: '2036-09-01', honorTotal: 40_000_000, addenda: ['ADD/1', 'ADD/2'] });
    expect(detail.addenda.map((a: { addendumNumber: string }) => a.addendumNumber)).toEqual(['ADD/1', 'ADD/2']);
    expect((await t.admin('get', '/contracts')).body.contracts.find((c: any) => c.contract.id === contract.id).effective.termYears).toBe(10);
  });

  it('dokumen kontrak, addendum, bukti bayar, dan bukti potong pajak ke bucket privat; isi file diperiksa; unduh hanya lewat admin', async () => {
    const t = setup();
    const { contract, payment } = await t.signed();
    const fake = await t.admin('post', `/contracts/${contract.id}/file`).attach('file', Buffer.from('bukan pdf'), { filename: 'k.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(415);
    const uploaded = await t.admin('post', `/contracts/${contract.id}/file`).attach('file', PDF, { filename: 'kontrak.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.contract.contractFilePath).toMatch(new RegExp(`^manuscripts/${contract.id}/kontrak-\\d+-[0-9a-f]{8}\\.pdf$`));
    expect(t.files.has(uploaded.body.contract.contractFilePath)).toBe(true);

    expect((await request(t.app).get(`/api/admin/manuscripts/files/contract/${contract.id}`)).status).toBe(401);
    const file = await t.admin('get', `/files/contract/${contract.id}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(file.headers['content-disposition']).toContain('kontrak-SPK-2026-001.pdf');
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);

    await t.admin('post', `/payments/${payment.id}/paid`, { paidAt: '2026-09-12', reference: 'Mutasi 12/09' });
    expect((await t.admin('post', `/payments/${payment.id}/files/tax_slip`).attach('file', PDF, { filename: 'bp.pdf', contentType: 'application/pdf' })).body.payment.taxSlipPath).toMatch(/pembayaran-.+-bukti-potong-/);
    expect((await t.admin('post', `/payments/${payment.id}/files/proof`).attach('file', PDF, { filename: 'bb.pdf', contentType: 'application/pdf' })).body.payment.paymentProofPath).toMatch(/bukti-bayar/);
    expect((await t.admin('post', `/payments/${payment.id}/files/lainnya`).attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(404);
    expect((await t.admin('get', `/files/tax_slip/${payment.id}`)).status).toBe(200);

    const addendum = (await t.admin('post', `/contracts/${contract.id}/addenda`, { addendumNumber: 'ADD/9', signedAt: '2026-10-01', description: 'Honor revisi', revisionFeePerEdition: 6_000_000 })).body.addendum;
    expect((await t.admin('get', `/files/addendum/${addendum.id}`)).status).toBe(404);
    expect((await t.admin('post', `/addenda/${addendum.id}/file`).attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' })).body.addendum.filePath).toMatch(/addendum-/);
    expect((await t.admin('get', `/files/addendum/${addendum.id}`)).status).toBe(200);

    const noStorage = setup({ storage: false });
    const other = await noStorage.signed();
    expect((await noStorage.admin('post', `/contracts/${other.contract.id}/file`).attach('file', PDF, { filename: 'k.pdf', contentType: 'application/pdf' })).status).toBe(503);
  });
});

describe('admin kontrak naskah: pengingat, laporan, ekspor', () => {
  it('pengingat jatuh tempo 7 hari, terlambat, dan hak kembali 12 bulan; email ringkasan sekali per pengingat', async () => {
    const t = setup();
    // Hak kembali 2026-12-01 (kurang dari 12 bulan lagi); satu tahap terlambat, satu jatuh tempo 4 hari lagi, satu masih jauh.
    const old = (await t.admin('post', '/contracts', t.contract({ contractNumber: 'SPK/2001/001', signedAt: '2001-12-01', honorTotal: 30_000 }))).body.contract;
    await t.admin('post', `/contracts/${old.id}/payments`, { stage: 'Tahap 1', amount: 10_000, dueDate: '2026-10-20' });
    await t.admin('post', `/contracts/${old.id}/payments`, { stage: 'Tahap 2', amount: 10_000, dueDate: '2026-11-05' });
    await t.admin('post', `/contracts/${old.id}/payments`, { stage: 'Tahap 3', amount: 10_000, dueDate: '2026-12-20' });
    await t.admin('post', `/contracts/${old.id}/sign`);
    // Kontrak draf tidak diingatkan.
    const draft = (await t.admin('post', '/contracts', t.contract({ contractNumber: 'SPK/2026/050', bookId: 'book-5' }))).body.contract;
    await t.admin('post', `/contracts/${draft.id}/payments`, { stage: 'Draf', amount: 1, dueDate: '2026-10-01' });

    const reminders = (await t.admin('get', '/reminders')).body.reminders;
    expect(reminders.map((r: any) => [r.kind, r.stage, r.daysLeft])).toEqual([
      ['payment_overdue', 'Tahap 1', -12],
      ['payment_due_soon', 'Tahap 2', 4],
      ['rights_revert_12m', null, 30]
    ]);
    expect(reminders[2]).toMatchObject({ refDate: '2026-12-01', contractNumber: 'SPK/2001/001', authorName: 'Henry Dianto P. Sinaga', bookTitle: 'JUDUL UJI 1' });

    expect((await t.admin('post', '/jobs/reminders')).body).toEqual({ items: 3, sent: 3 });
    expect(t.mails).toHaveLength(1);
    expect(t.mails[0].to).toEqual(['admin@uji.test']);
    expect(t.mails[0].subject).toBe('[Kontrak Naskah] 2 pembayaran & 1 hak kembali perlu ditindaklanjuti');
    for (const text of ['SPK/2001/001', 'terlambat 12 hari', 'jatuh tempo 2026-11-05 (4 hari lagi)', 'Hak kembali ke penulis pada 2026-12-01', 'https://cakranexa.test/admin']) {
      expect(t.mails[0].html, text).toContain(text);
    }
    expect((await t.admin('post', '/jobs/reminders')).body).toEqual({ items: 3, sent: 0 });
    expect(t.mails).toHaveLength(1);

    // Tahap yang sudah dibayar tidak lagi diingatkan.
    const payments = (await t.admin('get', `/contracts/${old.id}`)).body.payments;
    await t.admin('post', `/payments/${payments[0].id}/paid`, { paidAt: '2026-10-31' });
    expect((await t.admin('get', '/reminders')).body.reminders).toHaveLength(2);
  });

  it('laporan biaya per judul (nilai efektif, kontrak diakhiri hanya yang dibayar) dan ekspor CSV aman formula', async () => {
    const t = setup();
    const a = await t.signed({ contractNumber: 'SPK/1', notes: '=HYPERLINK("http://jahat")' });
    await t.admin('post', `/payments/${a.payment.id}/paid`, { paidAt: '2026-09-15', reference: '+62 mutasi' });
    await t.admin('post', `/contracts/${a.contract.id}/payments`, { stage: 'Revisi edisi 2', kind: 'revision', edition: 2, amount: 5_000_000, dueDate: '2026-10-01' })
      .then((r) => t.admin('post', `/payments/${r.body.payment.id}/paid`, { paidAt: '2026-10-02' }));
    await t.admin('post', `/contracts/${a.contract.id}/addenda`, { addendumNumber: 'ADD/1', signedAt: '2026-10-05', description: 'Naik', honorTotal: 35_000_000 });
    // Penulis bersama untuk judul yang sama; kontrak diakhiri setelah sebagian dibayar.
    const b = (await t.admin('post', '/contracts', t.contract({ contractNumber: 'SPK/2', authorId: AUTHOR_B, honorTotal: 20_000_000, revisionFeePerEdition: 0 }))).body.contract;
    const b1 = (await t.admin('post', `/contracts/${b.id}/payments`, { stage: 'Tahap 1', amount: 8_000_000, dueDate: '2026-09-05' })).body.payment;
    await t.admin('post', `/contracts/${b.id}/payments`, { stage: 'Tahap 2', amount: 12_000_000, dueDate: '2026-12-05' });
    await t.admin('post', `/contracts/${b.id}/sign`);
    await t.admin('post', `/payments/${b1.id}/paid`, { paidAt: '2026-09-06' });
    await t.admin('post', `/contracts/${b.id}/terminate`, { reason: 'Naskah dibatalkan' });
    // Naskah belum masuk katalog.
    await t.signed({ contractNumber: 'SPK/3', bookId: null, honorTotal: 0 });

    const rows = (await t.admin('get', '/report')).body.rows;
    expect(rows).toEqual([
      { bookId: 'book-1', bookTitle: 'JUDUL UJI 1', contracts: 2, honorCommitted: 43_000_000, honorPaid: 38_000_000, honorOutstanding: 5_000_000, revisionPaid: 5_000_000, revisionOutstanding: 0, totalPaid: 43_000_000 },
      { bookId: null, bookTitle: 'Naskah belum masuk katalog', contracts: 1, honorCommitted: 0, honorPaid: 0, honorOutstanding: 0, revisionPaid: 0, revisionOutstanding: 0, totalPaid: 0 }
    ]);

    const contracts = await t.admin('get', '/export/contracts.csv');
    expect(contracts.headers['content-type']).toContain('text/csv');
    expect(contracts.headers['content-disposition']).toMatch(/attachment; filename="kontrak-naskah-20261101\.csv"/);
    expect(contracts.text.startsWith('﻿Nomor Kontrak,Status,Penulis')).toBe(true);
    expect(contracts.text).toContain(`SPK/1,Ditandatangani,Henry Dianto P. Sinaga,book-1,JUDUL UJI 1,2026-09-01,25,2051-09-01,cetak; ebook; audiobook,35000000,5000000,ADD/1,30000000,"'=HYPERLINK(""http://jahat"")"`);
    expect(contracts.text).toContain('SPK/2,Diakhiri,Anton Hartanto');
    const payments = await t.admin('get', '/export/payments.csv');
    expect(payments.text).toContain("SPK/1,Henry Dianto P. Sinaga,JUDUL UJI 1,1,Honor,Honor,,30000000,2026-09-10,2026-09-15,'+62 mutasi,,");
    expect(payments.text).toContain('Honor revisi,2,5000000');
    expect((await t.admin('get', '/export/report.csv')).text).toContain('book-1,JUDUL UJI 1,2,43000000,38000000,5000000,5000000,0,43000000');
    expect((await t.admin('get', '/export/lain.csv')).status).toBe(404);
  });
});

describe('impor CSV kontrak lama', () => {
  it('format angka, tanggal, dan CSV (BOM, titik koma, tanda kutip)', () => {
    expect(parseRupiah('Rp 30.000.000,00')).toBe(30_000_000);
    expect(parseRupiah('30000000')).toBe(30_000_000);
    expect(parseRupiah('30.000.000,50')).toBeNull();
    expect(parseRupiah('30,5')).toBeNull();
    expect(parseDate('05/03/2024')).toBe('2024-03-05');
    expect(parseDate('2024-02-30')).toBeNull();
    expect(parseCsv('﻿a;b;c\r\n"x;1";"ka""ta";\r\n\r\n')).toEqual([['a', 'b', 'c'], ['x;1', 'ka"ta', '']]);
    expect(parseCsv('a,b\n1,"baris\nbaru"')).toEqual([['a', 'b'], ['1', 'baris\nbaru']]);
  });

  it('23 kontrak lama: pratinjau dulu, disimpan sebagai kontrak ditandatangani dengan tahap honor (lunas bila ada tanggal bayar)', async () => {
    const t = setup();
    const header = 'Nomor_Kontrak;Penulis;Buku;Tanggal_Kontrak;Jangka_Tahun;Hak_Cetak;Hak_Ebook;Hak_Audiobook;Hak_Terjemahan;Hak_Turunan;Honor_Total;Honor_Revisi_Per_Edisi;Honor_Dibayar_Tanggal;Catatan';
    const lines = BOOKS.map((b, i) => [
      `SPK/2024/${String(i + 1).padStart(3, '0')}`,
      i % 2 === 0 ? 'henry@contoh.id' : 'Anton Hartanto',
      i % 3 === 0 ? b.id : i % 3 === 1 ? b.isbn : b.name.toLowerCase(),
      `15/03/20${String(10 + (i % 10))}`,
      i === 0 ? '' : '20',
      'ya', 'ya', i === 1 ? 'tidak' : 'ya', 'tidak', 'tidak',
      'Rp 25.000.000',
      '0',
      i < 20 ? '20/03/2024' : '',
      i === 2 ? '"Catatan; dengan titik koma"' : ''
    ].join(';'));
    const csv = `﻿${header}\r\n${lines.join('\r\n')}\r\n`;

    const preview = (await t.admin('post', '/import/preview', { csv })).body.preview;
    expect(preview).toMatchObject({ total: 23, valid: 23, invalid: 0, fileErrors: [] });
    expect(preview.rows[0]).toMatchObject({ line: 2, authorName: 'Henry Dianto P. Sinaga', bookTitle: 'JUDUL UJI 1', honorPaidAt: '2024-03-20', errors: [] });
    expect(preview.rows[0].contract).toMatchObject({ contractNumber: 'SPK/2024/001', signedAt: '2010-03-15', termYears: 25, rightsRevertAt: '2035-03-15', honorTotal: 25_000_000 });
    expect(preview.rows[1].contract.rights).toEqual({ print: true, ebook: true, audiobook: false, translation: false, derivative: false });
    expect(preview.rows[2].contract.notes).toBe('Catatan; dengan titik koma');
    expect(preview.rows[20].warnings).toContain('Honor belum dibayar: tahap honor akan tercatat belum lunas.');
    expect(t.store.contracts).toHaveLength(0);

    const committed = await t.admin('post', '/import/commit', { csv });
    expect(committed.status).toBe(201);
    expect(committed.body.created).toHaveLength(23);
    expect(t.store.contracts.every((c) => c.status === 'signed')).toBe(true);
    expect(t.store.payments).toHaveLength(23);
    expect(t.store.payments.filter((p) => p.paidAt === '2024-03-20')).toHaveLength(20);
    const list = (await t.admin('get', '/contracts')).body.contracts;
    expect(list.find((c: any) => c.contract.contractNumber === 'SPK/2024/023').summary).toMatchObject({ honorPaid: 0, honorScheduled: 25_000_000, overdueCount: 1 });

    // Impor ulang file yang sama: semua nomor & pasangan sudah ada, tidak ada yang disimpan.
    const again = await t.admin('post', '/import/commit', { csv });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('import_invalid');
    expect(again.body.preview.invalid).toBe(23);
    expect(again.body.preview.rows[0].errors).toEqual(expect.arrayContaining(['Nomor kontrak SPK/2024/001 sudah ada.', 'Penulis sudah punya kontrak aktif untuk judul ini.']));
    expect(t.store.contracts).toHaveLength(23);
  });

  it('baris bermasalah menahan seluruh impor; kolom wajib dan kesalahan per baris dilaporkan', async () => {
    const t = setup();
    const header = 'nomor_kontrak,penulis,buku,tanggal_kontrak,honor_total,honor_dibayar_tanggal,hak_ebook';
    const csv = [
      header,
      'SPK/A,henry@contoh.id,book-1,2024-01-10,10000000,,',
      'SPK/A,henry@contoh.id,book-2,2024-01-10,10000000,,',
      'SPK/B,Tidak Ada,book-3,2024-01-10,10000000,,',
      'SPK/C,Anton Hartanto,book-99,31/02/2024,sepuluh juta,,',
      'SPK/D,Anton Hartanto,book-4,2024-01-10,10000000,01/01/2030,mungkin',
      'SPK/E,Anton Hartanto,,2024-01-10,10000000,,'
    ].join('\n');
    const preview = (await t.admin('post', '/import/preview', { csv })).body.preview;
    expect(preview).toMatchObject({ total: 6, valid: 2, invalid: 4 });
    expect(preview.rows[1].errors).toEqual(['Nomor kontrak SPK/A sudah ada.']);
    expect(preview.rows[2].errors).toEqual(['Penulis "Tidak Ada" tidak ditemukan.']);
    expect(preview.rows[3].errors).toEqual([
      'Buku "book-99" tidak ditemukan di katalog.',
      'Tanggal kontrak tidak valid: "31/02/2024".',
      'Honor total tidak valid: "sepuluh juta".'
    ]);
    expect(preview.rows[4].errors).toEqual(['Kolom hak_ebook harus ya/tidak.', 'Tanggal bayar honor di masa depan.']);
    expect(preview.rows[5]).toMatchObject({ errors: [], bookTitle: null, warnings: expect.arrayContaining(['Tanpa judul katalog: kontrak dicatat sebagai naskah belum terbit.']) });

    const rejected = await t.admin('post', '/import/commit', { csv });
    expect(rejected.status).toBe(400);
    expect(rejected.body.preview.invalid).toBe(4);
    expect(t.store.contracts).toHaveLength(0);

    const missing = (await t.admin('post', '/import/preview', { csv: 'penulis,buku\nhenry@contoh.id,book-1' })).body.preview;
    expect(missing.fileErrors).toEqual(['Kolom wajib tidak ada: nomor_kontrak.', 'Kolom wajib tidak ada: tanggal_kontrak.', 'Kolom wajib tidak ada: honor_total.']);
    expect((await t.admin('post', '/import/preview', { csv: '' })).body.code).toBe('csv_required');
  });
});

describe('akun login penulis', () => {
  it('otomatis hanya bila email terkonfirmasi, sama, dan user_id kosong; admin tidak ditimpa; tautan yang dilepas admin tidak ditautkan ulang otomatis; semua dicatat', async () => {
    const t = setup();
    const links = t.service.links;
    expect(await links.autoLink(USER_B)).toBeNull(); // email belum dikonfirmasi
    expect(await links.autoLink(USER_C)).toBeNull(); // email tidak cocok dengan penulis mana pun

    const linked = await links.autoLink(USER_A);
    expect(linked).toMatchObject({ id: AUTHOR_A, userId: USER_A, userLinkSource: 'auto_email' });
    expect(await links.autoLink(USER_A)).toMatchObject({ id: AUTHOR_A });
    expect(t.adminStore.links).toHaveLength(1);
    expect(t.adminStore.links[0]).toMatchObject({ authorId: AUTHOR_A, userId: USER_A, action: 'link', source: 'auto_email', actor: 'henry@contoh.id' });
    expect(t.logs.some((entry) => String(entry[0]).includes('ditautkan otomatis'))).toBe(true);

    // Admin melepas tautan: login berikutnya tidak menautkan ulang pasangan yang sama.
    expect((await request(t.app).post(`/api/admin/manuscripts/authors/${AUTHOR_A}/unlink`)).status).toBe(401);
    const unlinked = await t.admin('post', `/authors/${AUTHOR_A}/unlink`);
    expect(unlinked.body.author).toMatchObject({ userId: null, userLinkSource: null });
    expect((await t.admin('post', `/authors/${AUTHOR_A}/unlink`)).body.code).toBe('author_not_linked');
    expect(await links.autoLink(USER_A)).toBeNull();

    // Admin menautkan (lewat email); nilai admin tidak ditimpa penautan otomatis akun lain.
    const byAdmin = await t.admin('post', `/authors/${AUTHOR_A}/link`, { email: 'HENRY@contoh.id' });
    expect(byAdmin.body.author).toMatchObject({ userId: USER_A, userLinkSource: 'admin' });
    t.adminStore.users.push({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'henry@contoh.id', verified: true });
    expect(await links.autoLink('dddddddd-dddd-4ddd-8ddd-dddddddddddd')).toBeNull();
    expect(t.adminStore.authors.find((a) => a.id === AUTHOR_A)?.userId).toBe(USER_A);

    expect((await t.admin('post', `/authors/${AUTHOR_A}/link`, { userId: USER_C })).body.code).toBe('author_linked');
    expect((await t.admin('post', `/authors/${AUTHOR_B}/link`, { userId: USER_A })).body.code).toBe('account_linked');
    expect((await t.admin('post', `/authors/${AUTHOR_B}/link`, { email: 'belum@daftar.id' })).body.code).toBe('account_not_found');
    expect((await t.admin('post', `/authors/${AUTHOR_B}/link`, {})).body.code).toBe('account_required');
    const unverified = await t.admin('post', `/authors/${AUTHOR_B}/link`, { userId: USER_B });
    expect(unverified.body.author).toMatchObject({ userId: USER_B, userLinkSource: 'admin' });

    const history = (await t.admin('get', `/authors/${AUTHOR_A}/links`)).body.links;
    expect(history.map((l: any) => `${l.action}:${l.source}`)).toEqual(['link:admin', 'unlink:admin', 'link:auto_email']);
    const accounts = (await t.admin('get', '/authors')).body.authors;
    expect(accounts.map((a: any) => a.name)).toEqual(['Anton Hartanto', 'Henry Dianto P. Sinaga']);
  });

  it('email yang cocok dengan lebih dari satu penulis tidak ditautkan otomatis', async () => {
    const t = setup();
    t.adminStore.authors.push(author('33333333-3333-4333-8333-333333333333', 'Henry (duplikat)', ' henry@contoh.id '));
    expect(await t.service.links.autoLink(USER_A)).toBeNull();
    expect(t.adminStore.links).toHaveLength(0);
    expect(t.logs.some((entry) => String(entry[0]).includes('lebih dari satu penulis'))).toBe(true);
  });
});
