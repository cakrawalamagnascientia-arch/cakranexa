import crypto from 'crypto';
import { ManuscriptConflictError, type ManuscriptContractFilter, type ManuscriptPaymentFilter, type ManuscriptStore } from './store';
import type {
  ManuscriptContract,
  ManuscriptContractPatch,
  ManuscriptContractStatus,
  ManuscriptPayment,
  ManuscriptPaymentPatch,
  NewManuscriptContract,
  NewManuscriptPayment
} from './types';

const nowIso = () => new Date().toISOString();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * Store kontrak naskah di memori untuk tes otomatis dan dev lokal. Meniru batasan SQL: nomor kontrak unik, satu kontrak
 * belum diakhiri per penulis+judul, urutan tahap unik per kontrak.
 */
export class MemoryManuscriptStore implements ManuscriptStore {
  readonly kind = 'memory' as const;
  readonly contracts: ManuscriptContract[] = [];
  readonly payments: ManuscriptPayment[] = [];

  private assertContractUnique(candidate: ManuscriptContract) {
    for (const c of this.contracts) {
      if (c.id === candidate.id) continue;
      if (c.contractNumber === candidate.contractNumber) throw new ManuscriptConflictError('Nomor kontrak sudah dipakai.');
      if (candidate.bookId && c.bookId === candidate.bookId && c.authorId === candidate.authorId
        && c.status !== 'terminated' && candidate.status !== 'terminated') {
        throw new ManuscriptConflictError('Penulis sudah punya kontrak yang belum diakhiri untuk judul ini.');
      }
    }
  }

  async createContract(row: NewManuscriptContract) {
    const at = nowIso();
    const contract: ManuscriptContract = { ...clone(row), id: crypto.randomUUID(), terminatedAt: null, createdAt: at, updatedAt: at };
    this.assertContractUnique(contract);
    this.contracts.push(contract);
    return clone(contract);
  }

  async getContract(id: string) {
    const found = this.contracts.find((c) => c.id === id);
    return found ? clone(found) : null;
  }

  async listContracts(filter: ManuscriptContractFilter) {
    return clone(this.contracts
      .filter((c) => (!filter.authorId || c.authorId === filter.authorId)
        && (!filter.bookId || c.bookId === filter.bookId)
        && (!filter.statuses || filter.statuses.includes(c.status))
        && (!filter.revertOnOrBefore || c.rightsRevertAt <= filter.revertOnOrBefore))
      .sort((a, b) => b.signedAt.localeCompare(a.signedAt) || b.createdAt.localeCompare(a.createdAt)));
  }

  async updateContract(id: string, patch: ManuscriptContractPatch, fromStatuses?: ManuscriptContractStatus[]) {
    const index = this.contracts.findIndex((c) => c.id === id);
    if (index < 0 || (fromStatuses && !fromStatuses.includes(this.contracts[index].status))) return null;
    const next: ManuscriptContract = { ...this.contracts[index], ...clone(patch), updatedAt: nowIso() };
    this.assertContractUnique(next);
    this.contracts[index] = next;
    return clone(next);
  }

  async createPayment(row: NewManuscriptPayment) {
    if (this.payments.some((p) => p.contractId === row.contractId && p.sequence === row.sequence)) {
      throw new ManuscriptConflictError('Urutan tahap pembayaran sudah dipakai.');
    }
    const at = nowIso();
    const payment: ManuscriptPayment = { ...clone(row), id: crypto.randomUUID(), createdAt: at, updatedAt: at };
    this.payments.push(payment);
    return clone(payment);
  }

  async getPayment(id: string) {
    const found = this.payments.find((p) => p.id === id);
    return found ? clone(found) : null;
  }

  async listPayments(filter: ManuscriptPaymentFilter) {
    return clone(this.payments
      .filter((p) => (!filter.contractIds || filter.contractIds.includes(p.contractId))
        && (!filter.unpaid || p.paidAt === null)
        && (!filter.dueOnOrBefore || p.dueDate <= filter.dueOnOrBefore))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence));
  }

  async updatePayment(id: string, patch: ManuscriptPaymentPatch, options: { onlyUnpaid?: boolean } = {}) {
    const index = this.payments.findIndex((p) => p.id === id);
    if (index < 0 || (options.onlyUnpaid && this.payments[index].paidAt !== null)) return null;
    this.payments[index] = { ...this.payments[index], ...clone(patch), updatedAt: nowIso() };
    return clone(this.payments[index]);
  }
}
