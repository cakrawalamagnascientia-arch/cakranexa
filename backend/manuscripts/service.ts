import { ManuscriptConflictError, type ManuscriptContractFilter, type ManuscriptStore } from './store';
import {
  isIsoDate,
  summarizePayments,
  validateContractInput,
  validatePaymentInput,
  wibToday,
  type ContractInput
} from './rules';
import type {
  ManuscriptContract,
  ManuscriptPayment,
  ManuscriptPaymentSummary,
  ManuscriptRightKey
} from './types';

/**
 * Kontrak naskah jual putus (fase 5R, Langkah 1): buat/ubah kontrak, tanda tangani, akhiri, jadwal honor dan honor
 * revisi per edisi, tandai lunas, dan ringkasan. Rute admin, unggah file, pengingat, dan dashboard penulis dibangun di
 * langkah berikutnya di atas service ini.
 *
 * Aturan:
 *  - Hak kembali ke penulis pada tanggal kontrak + jangka waktu (paling lama 25 tahun), dihitung server.
 *  - Jumlah tahap honor tidak boleh melebihi honor jual putus; kontrak baru bisa ditandatangani bila jadwal honor sama
 *    dengan honor total.
 *  - Kontrak yang sudah ditandatangani: syarat pokok (penulis, hak, tanggal, jangka waktu, honor) terkunci.
 *  - Honor revisi hanya bila kontrak mengaturnya; jumlah per edisi tidak melebihi honor revisi per edisi.
 *  - Tahap yang sudah dibayar tidak diubah (kecuali melampirkan bukti).
 */

export class ManuscriptError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ManuscriptError';
  }
}

const fail = (status: number, code: string, message: string) => new ManuscriptError(status, code, message);

export interface ManuscriptDeps {
  store: ManuscriptStore;
  authorExists(authorId: string): Promise<boolean>;
  bookExists(bookId: string): Promise<boolean>;
  now?: () => Date;
}

export interface ContractWithSummary {
  contract: ManuscriptContract;
  summary: ManuscriptPaymentSummary;
}

const LOCKED_WHEN_SIGNED = ['contractNumber', 'authorId', 'signedAt', 'termYears', 'honorTotal', 'revisionFeePerEdition'] as const;

const sameRights = (a: Record<ManuscriptRightKey, boolean>, b: Record<ManuscriptRightKey, boolean>) =>
  (Object.keys(a) as ManuscriptRightKey[]).every((key) => a[key] === b[key]);

const inputOf = (c: ManuscriptContract) => ({
  contractNumber: c.contractNumber,
  authorId: c.authorId,
  bookId: c.bookId,
  rights: c.rights,
  signedAt: c.signedAt,
  termYears: c.termYears,
  honorTotal: c.honorTotal,
  revisionFeePerEdition: c.revisionFeePerEdition,
  notes: c.notes
});

export class ManuscriptService {
  constructor(private readonly deps: ManuscriptDeps) {}

  private today(): string {
    return wibToday(this.deps.now ? this.deps.now() : new Date());
  }

  private async contractOr404(id: string): Promise<ManuscriptContract> {
    const contract = await this.deps.store.getContract(id);
    if (!contract) throw fail(404, 'contract_not_found', 'Kontrak tidak ditemukan.');
    return contract;
  }

  private async paymentOr404(id: string): Promise<ManuscriptPayment> {
    const payment = await this.deps.store.getPayment(id);
    if (!payment) throw fail(404, 'payment_not_found', 'Tahap pembayaran tidak ditemukan.');
    return payment;
  }

  private async checkReferences(value: ContractInput) {
    if (!(await this.deps.authorExists(value.authorId))) throw fail(400, 'author_not_found', 'Penulis tidak ditemukan.');
    if (value.bookId && !(await this.deps.bookExists(value.bookId))) throw fail(400, 'book_not_found', 'Judul buku tidak ditemukan.');
  }

  private async guardConflict<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err) {
      if (err instanceof ManuscriptConflictError) {
        throw fail(409, 'contract_conflict', 'Nomor kontrak sudah dipakai, atau penulis sudah punya kontrak yang belum diakhiri untuk judul ini.');
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------ kontrak
  async createContract(input: unknown): Promise<ManuscriptContract> {
    const validated = validateContractInput(input);
    if ('error' in validated) throw fail(400, 'invalid_contract', validated.error);
    await this.checkReferences(validated.value);
    return this.guardConflict(() => this.deps.store.createContract({
      ...validated.value,
      contractType: 'jual_putus',
      status: 'draft',
      contractFilePath: null
    }));
  }

  async updateContract(id: string, input: Record<string, unknown>): Promise<ManuscriptContract> {
    const current = await this.contractOr404(id);
    if (current.status === 'terminated') throw fail(409, 'contract_terminated', 'Kontrak yang sudah diakhiri tidak dapat diubah.');
    const validated = validateContractInput({ ...inputOf(current), ...input });
    if ('error' in validated) throw fail(400, 'invalid_contract', validated.error);
    const next = validated.value;
    if (current.status === 'signed') {
      const changed = LOCKED_WHEN_SIGNED.filter((key) => next[key] !== current[key]);
      if (changed.length > 0 || !sameRights(next.rights, current.rights)) {
        throw fail(409, 'contract_signed', 'Kontrak sudah ditandatangani: penulis, hak, tanggal, jangka waktu, dan honor tidak dapat diubah.');
      }
    }
    if (next.honorTotal < current.honorTotal) {
      const payments = await this.deps.store.listPayments({ contractIds: [id] });
      const scheduled = payments.filter((p) => p.kind === 'honor').reduce((total, p) => total + p.amount, 0);
      if (scheduled > next.honorTotal) throw fail(409, 'schedule_exceeds_honor', 'Honor total lebih kecil dari jadwal pembayaran yang sudah dibuat.');
    }
    await this.checkReferences(next);
    const updated = await this.guardConflict(() => this.deps.store.updateContract(id, next, [current.status]));
    if (!updated) throw fail(409, 'state_changed', 'Status kontrak berubah. Muat ulang.');
    return updated;
  }

  /** Draf -> ditandatangani; jadwal honor harus sama dengan honor total. */
  async signContract(id: string): Promise<ManuscriptContract> {
    const contract = await this.contractOr404(id);
    if (contract.status !== 'draft') throw fail(409, 'invalid_state', 'Hanya kontrak draf yang dapat ditandatangani.');
    const payments = await this.deps.store.listPayments({ contractIds: [id] });
    const scheduled = payments.filter((p) => p.kind === 'honor').reduce((total, p) => total + p.amount, 0);
    if (scheduled !== contract.honorTotal) {
      throw fail(409, 'schedule_incomplete', `Jadwal honor (Rp${scheduled.toLocaleString('id-ID')}) harus sama dengan honor total (Rp${contract.honorTotal.toLocaleString('id-ID')}).`);
    }
    const signed = await this.deps.store.updateContract(id, { status: 'signed' }, ['draft']);
    if (!signed) throw fail(409, 'state_changed', 'Status kontrak berubah. Muat ulang.');
    return signed;
  }

  async terminateContract(id: string, reason: unknown): Promise<ManuscriptContract> {
    const contract = await this.contractOr404(id);
    if (contract.status === 'terminated') throw fail(409, 'invalid_state', 'Kontrak sudah diakhiri.');
    const note = String(reason ?? '').trim().slice(0, 500);
    if (!note) throw fail(400, 'reason_required', 'Alasan pengakhiran kontrak wajib diisi.');
    const stamp = `[Diakhiri ${this.today()}] ${note}`;
    const updated = await this.deps.store.updateContract(id, {
      status: 'terminated',
      terminatedAt: (this.deps.now ? this.deps.now() : new Date()).toISOString(),
      notes: contract.notes ? `${contract.notes}\n${stamp}` : stamp
    }, [contract.status]);
    if (!updated) throw fail(409, 'state_changed', 'Status kontrak berubah. Muat ulang.');
    return updated;
  }

  /** Path file kontrak di bucket privat (unggahan dibuat di langkah rute admin). */
  async setContractFile(id: string, objectPath: string): Promise<ManuscriptContract> {
    await this.contractOr404(id);
    const updated = await this.deps.store.updateContract(id, { contractFilePath: objectPath });
    if (!updated) throw fail(404, 'contract_not_found', 'Kontrak tidak ditemukan.');
    return updated;
  }

  // --------------------------------------------------------------- pembayaran
  private async checkPaymentTotals(contract: ManuscriptContract, candidate: { kind: string; edition: number | null; amount: number }, excludeId?: string) {
    const payments = (await this.deps.store.listPayments({ contractIds: [contract.id] })).filter((p) => p.id !== excludeId);
    if (candidate.kind === 'honor') {
      const scheduled = payments.filter((p) => p.kind === 'honor').reduce((total, p) => total + p.amount, 0);
      if (scheduled + candidate.amount > contract.honorTotal) {
        throw fail(400, 'schedule_exceeds_honor', `Jadwal honor melebihi honor total (sisa Rp${Math.max(0, contract.honorTotal - scheduled).toLocaleString('id-ID')}).`);
      }
      return payments;
    }
    if (contract.revisionFeePerEdition <= 0) throw fail(400, 'no_revision_fee', 'Kontrak ini tidak mengatur honor revisi.');
    const edition = payments.filter((p) => p.kind === 'revision' && p.edition === candidate.edition).reduce((total, p) => total + p.amount, 0);
    if (edition + candidate.amount > contract.revisionFeePerEdition) {
      throw fail(400, 'revision_exceeds_fee', `Honor revisi edisi ${candidate.edition} melebihi honor revisi per edisi.`);
    }
    return payments;
  }

  async addPayment(contractId: string, input: unknown): Promise<ManuscriptPayment> {
    const contract = await this.contractOr404(contractId);
    if (contract.status === 'terminated') throw fail(409, 'contract_terminated', 'Kontrak sudah diakhiri.');
    const validated = validatePaymentInput(input);
    if ('error' in validated) throw fail(400, 'invalid_payment', validated.error);
    const existing = await this.checkPaymentTotals(contract, validated.value);
    const sequence = existing.reduce((max, p) => Math.max(max, p.sequence), 0) + 1;
    try {
      return await this.deps.store.createPayment({
        ...validated.value,
        contractId,
        sequence,
        paidAt: null,
        paymentReference: null,
        paymentProofPath: null,
        taxSlipPath: null
      });
    } catch (err) {
      if (err instanceof ManuscriptConflictError) throw fail(409, 'state_changed', 'Jadwal berubah bersamaan. Coba lagi.');
      throw err;
    }
  }

  /** Ubah tahap yang belum dibayar. */
  async updatePayment(paymentId: string, input: Record<string, unknown>): Promise<ManuscriptPayment> {
    const payment = await this.paymentOr404(paymentId);
    if (payment.paidAt) throw fail(409, 'payment_paid', 'Tahap yang sudah dibayar tidak dapat diubah.');
    const contract = await this.contractOr404(payment.contractId);
    if (contract.status === 'terminated') throw fail(409, 'contract_terminated', 'Kontrak sudah diakhiri.');
    const validated = validatePaymentInput({
      stage: payment.stage, kind: payment.kind, edition: payment.edition, amount: payment.amount, dueDate: payment.dueDate, notes: payment.notes, ...input
    });
    if ('error' in validated) throw fail(400, 'invalid_payment', validated.error);
    await this.checkPaymentTotals(contract, validated.value, paymentId);
    const updated = await this.deps.store.updatePayment(paymentId, validated.value, { onlyUnpaid: true });
    if (!updated) throw fail(409, 'payment_paid', 'Tahap yang sudah dibayar tidak dapat diubah.');
    return updated;
  }

  async markPaymentPaid(paymentId: string, input: Record<string, unknown>): Promise<ManuscriptPayment> {
    const payment = await this.paymentOr404(paymentId);
    if (payment.paidAt) throw fail(409, 'payment_paid', 'Tahap ini sudah ditandai dibayar.');
    const contract = await this.contractOr404(payment.contractId);
    if (contract.status !== 'signed') throw fail(409, 'invalid_state', 'Pembayaran hanya untuk kontrak yang sudah ditandatangani.');
    const paidAt = input?.paidAt ?? this.today();
    if (!isIsoDate(paidAt) || paidAt > this.today()) throw fail(400, 'invalid_date', 'Tanggal bayar tidak valid atau di masa depan.');
    const reference = String(input?.reference ?? '').trim().slice(0, 200) || null;
    const updated = await this.deps.store.updatePayment(paymentId, { paidAt, paymentReference: reference }, { onlyUnpaid: true });
    if (!updated) throw fail(409, 'payment_paid', 'Tahap ini sudah ditandai dibayar.');
    return updated;
  }

  /** Path bukti bayar / bukti potong pajak di bucket privat (boleh setelah dibayar). */
  async setPaymentFile(paymentId: string, kind: 'proof' | 'tax_slip', objectPath: string): Promise<ManuscriptPayment> {
    await this.paymentOr404(paymentId);
    const updated = await this.deps.store.updatePayment(paymentId, kind === 'proof' ? { paymentProofPath: objectPath } : { taxSlipPath: objectPath });
    if (!updated) throw fail(404, 'payment_not_found', 'Tahap pembayaran tidak ditemukan.');
    return updated;
  }

  // -------------------------------------------------------------------- baca
  async contractDetail(id: string): Promise<ContractWithSummary & { payments: ManuscriptPayment[] }> {
    const contract = await this.contractOr404(id);
    const payments = await this.deps.store.listPayments({ contractIds: [id] });
    return { contract, payments, summary: summarizePayments(contract, payments, this.today()) };
  }

  async listContracts(filter: ManuscriptContractFilter = {}): Promise<ContractWithSummary[]> {
    const contracts = await this.deps.store.listContracts(filter);
    const payments = await this.deps.store.listPayments({ contractIds: contracts.map((c) => c.id) });
    const today = this.today();
    return contracts.map((contract) => ({
      contract,
      summary: summarizePayments(contract, payments.filter((p) => p.contractId === contract.id), today)
    }));
  }
}
