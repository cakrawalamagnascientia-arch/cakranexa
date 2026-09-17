import { describe, expect, it } from 'vitest';
import { addYears, computeRightsRevertAt, summarizePayments, validateContractInput, validatePaymentInput, wibToday } from '../manuscripts/rules';
import { ManuscriptService } from '../manuscripts/service';
import { MemoryManuscriptStore } from '../manuscripts/memoryStore';

/** Fase 5R Langkah 1: kontrak naskah jual putus dan jadwal honor (tanpa royalti). */

const AUTHOR = '11111111-1111-4111-8111-111111111111';
const OTHER_AUTHOR = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-09-17T03:00:00.000Z'); // 10:00 WIB

const contractInput = (over: Record<string, unknown> = {}) => ({
  contractNumber: 'msc/2026/001',
  authorId: AUTHOR,
  bookId: 'book-10',
  rights: { print: true, ebook: true, audiobook: true, translation: false, derivative: false },
  signedAt: '2026-09-01',
  termYears: 25,
  honorTotal: 30_000_000,
  revisionFeePerEdition: 5_000_000,
  notes: 'Naskah hukum pajak e-commerce',
  ...over
});

const setup = () => {
  const store = new MemoryManuscriptStore();
  const service = new ManuscriptService({
    store,
    authorExists: async (id) => id === AUTHOR || id === OTHER_AUTHOR,
    bookExists: async (id) => ['book-10', 'book-11'].includes(id),
    now: () => NOW
  });
  return { store, service };
};

const expectError = async (promise: Promise<unknown>, status: number, code: string) => {
  await expect(promise).rejects.toMatchObject({ status, code });
};

describe('aturan kontrak jual putus', () => {
  it('hak kembali = tanggal kontrak + jangka waktu, paling lama 25 tahun; 29 Februari mengikuti Postgres', () => {
    expect(computeRightsRevertAt('2026-09-01', 25)).toBe('2051-09-01');
    expect(computeRightsRevertAt('2026-09-01', 10)).toBe('2036-09-01');
    expect(computeRightsRevertAt('2026-09-01', 40)).toBe('2051-09-01');
    expect(addYears('2028-02-29', 25)).toBe('2053-02-28');
    expect(addYears('2028-02-29', 4)).toBe('2032-02-29');
    expect(wibToday(new Date('2026-09-17T17:00:00Z'))).toBe('2026-09-18');
  });

  it('validasi form kontrak: nomor, penulis, hak, tanggal, jangka waktu 1–25 tahun, honor; tanggal kembali dihitung server', () => {
    const ok = validateContractInput({ ...contractInput(), rightsRevertAt: '2099-01-01' });
    expect(ok).toEqual({ value: expect.objectContaining({ contractNumber: 'MSC/2026/001', rightsRevertAt: '2051-09-01', termYears: 25 }) });
    expect(validateContractInput(contractInput({ termYears: undefined }))).toEqual({ value: expect.objectContaining({ termYears: 25 }) });
    expect(validateContractInput(contractInput({ termYears: 26 }))).toEqual({ error: expect.stringContaining('UU 28/2014') });
    expect(validateContractInput(contractInput({ contractType: 'royalti' }))).toEqual({ error: expect.stringContaining('jual putus') });
    expect(validateContractInput(contractInput({ rights: {} }))).toEqual({ error: expect.stringContaining('hak') });
    expect(validateContractInput(contractInput({ signedAt: '2026-02-30' }))).toEqual({ error: expect.stringContaining('Tanggal kontrak') });
    expect(validateContractInput(contractInput({ authorId: 'bukan-uuid' }))).toEqual({ error: 'Pilih penulis.' });
    expect(validateContractInput(contractInput({ honorTotal: -1 }))).toEqual({ error: expect.stringContaining('Honor') });
    expect(validateContractInput(contractInput({ contractNumber: '' }))).toEqual({ error: expect.stringContaining('Nomor kontrak') });
    expect(validatePaymentInput({ stage: 'Revisi', kind: 'revision', amount: 1000, dueDate: '2027-01-01' })).toEqual({ error: expect.stringContaining('edisi') });
    expect(validatePaymentInput({ stage: 'Tahap 1', amount: 0, dueDate: '2027-01-01' })).toEqual({ error: expect.stringContaining('Jumlah') });
  });

  it('ringkasan jadwal: terjadwal, belum dijadwalkan, dibayar, terlambat, jatuh tempo berikutnya', () => {
    const base = { contractId: 'c', edition: null, paymentReference: null, paymentProofPath: null, taxSlipPath: null, notes: null, createdAt: '', updatedAt: '' };
    const summary = summarizePayments({ honorTotal: 30_000_000 }, [
      { ...base, id: 'p1', sequence: 1, stage: 'Tahap 1', kind: 'honor', amount: 10_000_000, dueDate: '2026-09-01', paidAt: '2026-09-02' },
      { ...base, id: 'p2', sequence: 2, stage: 'Tahap 2', kind: 'honor', amount: 10_000_000, dueDate: '2026-09-10', paidAt: null },
      { ...base, id: 'p3', sequence: 3, stage: 'Revisi edisi 2', kind: 'revision', edition: 2, amount: 2_000_000, dueDate: '2027-06-01', paidAt: null }
    ], '2026-09-17');
    expect(summary).toEqual({
      honorTotal: 30_000_000, honorScheduled: 20_000_000, honorUnscheduled: 10_000_000, honorPaid: 10_000_000, honorOutstanding: 10_000_000,
      revisionPaid: 0, revisionOutstanding: 2_000_000, overdueCount: 1,
      nextDue: { id: 'p2', stage: 'Tahap 2', amount: 10_000_000, dueDate: '2026-09-10' }
    });
  });
});

describe('service kontrak naskah', () => {
  it('draf -> jadwal honor -> tanda tangan (jadwal = honor total) -> lunas; syarat pokok terkunci setelah ditandatangani', async () => {
    const { service } = setup();
    const contract = await service.createContract(contractInput());
    expect(contract).toMatchObject({ status: 'draft', contractType: 'jual_putus', contractNumber: 'MSC/2026/001', rightsRevertAt: '2051-09-01', contractFilePath: null });

    const p1 = await service.addPayment(contract.id, { stage: 'Tahap 1 — penandatanganan', amount: 15_000_000, dueDate: '2026-09-10' });
    expect(p1).toMatchObject({ sequence: 1, kind: 'honor', edition: null, paidAt: null });
    await expectError(service.signContract(contract.id), 409, 'schedule_incomplete');
    await expectError(service.addPayment(contract.id, { stage: 'Tahap 2', amount: 15_000_001, dueDate: '2026-12-01' }), 400, 'schedule_exceeds_honor');
    const p2 = await service.addPayment(contract.id, { stage: 'Tahap 2 — naskah final', amount: 15_000_000, dueDate: '2026-12-01' });
    expect(p2.sequence).toBe(2);
    await expectError(service.markPaymentPaid(p1.id, {}), 409, 'invalid_state');

    const signed = await service.signContract(contract.id);
    expect(signed.status).toBe('signed');
    await expectError(service.signContract(contract.id), 409, 'invalid_state');
    await expectError(service.updateContract(contract.id, { honorTotal: 40_000_000 }), 409, 'contract_signed');
    await expectError(service.updateContract(contract.id, { rights: { ...contract.rights, translation: true } }), 409, 'contract_signed');
    await expectError(service.updateContract(contract.id, { termYears: 20 }), 409, 'contract_signed');
    expect((await service.updateContract(contract.id, { notes: 'Diperbarui' })).notes).toBe('Diperbarui');

    const paid = await service.markPaymentPaid(p1.id, { paidAt: '2026-09-12', reference: 'Mutasi 12/09' });
    expect(paid).toMatchObject({ paidAt: '2026-09-12', paymentReference: 'Mutasi 12/09' });
    await expectError(service.markPaymentPaid(p1.id, {}), 409, 'payment_paid');
    await expectError(service.updatePayment(p1.id, { amount: 1 }), 409, 'payment_paid');
    await expectError(service.markPaymentPaid(p2.id, { paidAt: '2026-09-30' }), 400, 'invalid_date');
    // Bukti bayar & bukti potong pajak tetap bisa dilampirkan setelah dibayar (path bucket privat).
    expect((await service.setPaymentFile(p1.id, 'tax_slip', 'manuscripts/x/tax.pdf')).taxSlipPath).toBe('manuscripts/x/tax.pdf');

    const detail = await service.contractDetail(contract.id);
    expect(detail.summary).toMatchObject({ honorScheduled: 30_000_000, honorPaid: 15_000_000, honorOutstanding: 15_000_000, overdueCount: 0 });
    expect(detail.summary.nextDue).toMatchObject({ id: p2.id, dueDate: '2026-12-01' });
  });

  it('honor revisi per edisi: hanya bila diatur kontrak, tidak melebihi honor revisi per edisi', async () => {
    const { service } = setup();
    const contract = await service.createContract(contractInput());
    await service.addPayment(contract.id, { stage: 'Honor', amount: 30_000_000, dueDate: '2026-09-10' });
    await expectError(service.addPayment(contract.id, { stage: 'Revisi', kind: 'revision', edition: 2, amount: 5_000_001, dueDate: '2027-06-01' }), 400, 'revision_exceeds_fee');
    const rev = await service.addPayment(contract.id, { stage: 'Revisi edisi 2', kind: 'revision', edition: 2, amount: 5_000_000, dueDate: '2027-06-01' });
    expect(rev).toMatchObject({ kind: 'revision', edition: 2, sequence: 2 });
    await expectError(service.addPayment(contract.id, { stage: 'Revisi lagi', kind: 'revision', edition: 2, amount: 1, dueDate: '2027-07-01' }), 400, 'revision_exceeds_fee');
    expect((await service.addPayment(contract.id, { stage: 'Revisi edisi 3', kind: 'revision', edition: 3, amount: 5_000_000, dueDate: '2029-06-01' })).edition).toBe(3);

    const noFee = await service.createContract(contractInput({ contractNumber: 'MSC/2026/002', bookId: 'book-11', revisionFeePerEdition: 0 }));
    await expectError(service.addPayment(noFee.id, { stage: 'Revisi', kind: 'revision', edition: 2, amount: 1, dueDate: '2027-06-01' }), 400, 'no_revision_fee');
    // Honor total tidak boleh diturunkan di bawah jadwal yang sudah ada.
    await expectError(service.updateContract(contract.id, { honorTotal: 20_000_000 }), 409, 'schedule_exceeds_honor');
  });

  it('keunikan & referensi: nomor kontrak unik, satu kontrak aktif per penulis+judul, penulis/judul harus ada; diakhiri membuka kontrak baru', async () => {
    const { service } = setup();
    const first = await service.createContract(contractInput());
    await expectError(service.createContract(contractInput({ bookId: 'book-11' })), 409, 'contract_conflict');
    await expectError(service.createContract(contractInput({ contractNumber: 'MSC/2026/009' })), 409, 'contract_conflict');
    // Penulis lain untuk judul yang sama (penulis bersama) boleh.
    expect((await service.createContract(contractInput({ contractNumber: 'MSC/2026/010', authorId: OTHER_AUTHOR }))).status).toBe('draft');
    await expectError(service.createContract(contractInput({ contractNumber: 'MSC/2026/011', authorId: '33333333-3333-4333-8333-333333333333' })), 400, 'author_not_found');
    await expectError(service.createContract(contractInput({ contractNumber: 'MSC/2026/012', bookId: 'book-99' })), 400, 'book_not_found');
    expect((await service.createContract(contractInput({ contractNumber: 'MSC/2026/013', bookId: null }))).bookId).toBeNull();

    await expectError(service.terminateContract(first.id, ' '), 400, 'reason_required');
    const ended = await service.terminateContract(first.id, 'Naskah ditarik penulis');
    expect(ended).toMatchObject({ status: 'terminated' });
    expect(ended.notes).toContain('[Diakhiri 2026-09-17] Naskah ditarik penulis');
    expect(ended.terminatedAt).toBe(NOW.toISOString());
    await expectError(service.updateContract(first.id, { notes: 'x' }), 409, 'contract_terminated');
    await expectError(service.addPayment(first.id, { stage: 'Tahap', amount: 1, dueDate: '2027-01-01' }), 409, 'contract_terminated');
    expect((await service.createContract(contractInput({ contractNumber: 'MSC/2026/014' }))).status).toBe('draft');
  });

  it('daftar kontrak per penulis dengan ringkasan; tahap terlambat terhitung menurut tanggal WIB', async () => {
    const { service } = setup();
    const contract = await service.createContract(contractInput({ honorTotal: 10_000_000, revisionFeePerEdition: 0 }));
    await service.addPayment(contract.id, { stage: 'Tahap 1', amount: 10_000_000, dueDate: '2026-09-16' });
    await service.createContract(contractInput({ contractNumber: 'MSC/2026/020', authorId: OTHER_AUTHOR }));
    const mine = await service.listContracts({ authorId: AUTHOR });
    expect(mine).toHaveLength(1);
    expect(mine[0].summary).toMatchObject({ overdueCount: 1, honorUnscheduled: 0 });
    expect(await service.listContracts({ revertOnOrBefore: '2051-08-31' })).toHaveLength(0);
    expect(await service.listContracts({ revertOnOrBefore: '2051-09-01' })).toHaveLength(2);
  });
});
