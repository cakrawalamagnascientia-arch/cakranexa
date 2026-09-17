import type {
  ManuscriptContract,
  ManuscriptContractPatch,
  ManuscriptContractStatus,
  ManuscriptPayment,
  ManuscriptPaymentPatch,
  NewManuscriptContract,
  NewManuscriptPayment
} from './types';

/** Pelanggaran keunikan: nomor kontrak, kontrak aktif ganda untuk penulis+judul, urutan tahap ganda. */
export class ManuscriptConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManuscriptConflictError';
  }
}

export interface ManuscriptContractFilter {
  authorId?: string;
  bookId?: string;
  statuses?: ManuscriptContractStatus[];
  /** rights_revert_at <= tanggal ini (YYYY-MM-DD). */
  revertOnOrBefore?: string;
}

export interface ManuscriptPaymentFilter {
  contractIds?: string[];
  unpaid?: boolean;
  /** due_date <= tanggal ini (YYYY-MM-DD). */
  dueOnOrBefore?: string;
}

/**
 * Akses data kontrak naskah fase 5R. Implementasi: supabaseStore (produksi, service role) dan memoryStore (tes & dev).
 * Tidak ada operasi hapus: kontrak diakhiri lewat status, tahap pembayaran yang sudah dibayar tidak diubah.
 */
export interface ManuscriptStore {
  readonly kind: 'supabase' | 'memory';
  createContract(row: NewManuscriptContract): Promise<ManuscriptContract>;
  getContract(id: string): Promise<ManuscriptContract | null>;
  listContracts(filter: ManuscriptContractFilter): Promise<ManuscriptContract[]>;
  /** Update bersyarat: hanya bila status sekarang termasuk `fromStatuses`. null = tidak ada baris yang cocok. */
  updateContract(id: string, patch: ManuscriptContractPatch, fromStatuses?: ManuscriptContractStatus[]): Promise<ManuscriptContract | null>;

  createPayment(row: NewManuscriptPayment): Promise<ManuscriptPayment>;
  getPayment(id: string): Promise<ManuscriptPayment | null>;
  listPayments(filter: ManuscriptPaymentFilter): Promise<ManuscriptPayment[]>;
  /** onlyUnpaid: hanya tahap yang belum dibayar. null = tidak ada baris yang cocok. */
  updatePayment(id: string, patch: ManuscriptPaymentPatch, options?: { onlyUnpaid?: boolean }): Promise<ManuscriptPayment | null>;
}
