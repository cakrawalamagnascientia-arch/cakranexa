/**
 * Kontrak naskah jual putus dan jadwal honor (fase 5R, docs/PHASE-5-BRIEF.md). Nama field camelCase; pemetaan ke
 * kolom snake_case ada di supabaseStore.ts. Skema: src/db/manuscript_contracts_migration.sql.
 * Tidak ada royalti: penulis menerima honor jual putus (dan honor revisi per edisi bila diatur kontrak).
 */

export type ManuscriptContractStatus = 'draft' | 'signed' | 'terminated';
export type ManuscriptPaymentKind = 'honor' | 'revision';

export const MANUSCRIPT_CONTRACT_STATUSES: ManuscriptContractStatus[] = ['draft', 'signed', 'terminated'];
export const MANUSCRIPT_RIGHT_KEYS = ['print', 'ebook', 'audiobook', 'translation', 'derivative'] as const;
export type ManuscriptRightKey = (typeof MANUSCRIPT_RIGHT_KEYS)[number];

/** Cakupan hak yang dialihkan ke penerbit. */
export type ManuscriptRights = Record<ManuscriptRightKey, boolean>;

export interface ManuscriptContract {
  id: string;
  /** Huruf besar, unik. */
  contractNumber: string;
  authorId: string;
  /** null = naskah belum masuk katalog. */
  bookId: string | null;
  contractType: 'jual_putus';
  status: ManuscriptContractStatus;
  rights: ManuscriptRights;
  /** Tanggal kontrak (YYYY-MM-DD). */
  signedAt: string;
  /** 1–25 tahun (UU 28/2014 Pasal 18). */
  termYears: number;
  /** signedAt + termYears (YYYY-MM-DD); hak kembali ke penulis. */
  rightsRevertAt: string;
  /** Honor jual putus (Rupiah). */
  honorTotal: number;
  /** Honor revisi per edisi (Rupiah); 0 = kontrak tidak mengatur honor revisi. */
  revisionFeePerEdition: number;
  /** Path file kontrak di bucket privat. */
  contractFilePath: string | null;
  notes: string | null;
  terminatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewManuscriptContract = Omit<ManuscriptContract, 'id' | 'terminatedAt' | 'createdAt' | 'updatedAt'>;
export type ManuscriptContractPatch = Partial<Omit<ManuscriptContract, 'id' | 'createdAt' | 'updatedAt'>>;

export interface ManuscriptPayment {
  id: string;
  contractId: string;
  /** Urutan tahap dalam kontrak (unik per kontrak). */
  sequence: number;
  stage: string;
  kind: ManuscriptPaymentKind;
  /** Honor revisi: edisi ke-2, ke-3, ...; honor biasa: null. */
  edition: number | null;
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  /** YYYY-MM-DD; null = belum dibayar. */
  paidAt: string | null;
  /** Catatan mutasi (tanpa nomor rekening). */
  paymentReference: string | null;
  /** Bukti bayar & bukti potong pajak di bucket privat (tidak ada data pajak dalam bentuk teks). */
  paymentProofPath: string | null;
  taxSlipPath: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewManuscriptPayment = Omit<ManuscriptPayment, 'id' | 'createdAt' | 'updatedAt'>;
export type ManuscriptPaymentPatch = Partial<Omit<ManuscriptPayment, 'id' | 'contractId' | 'createdAt' | 'updatedAt'>>;

export interface ManuscriptPaymentSummary {
  honorTotal: number;
  /** Jumlah tahap honor yang sudah dijadwalkan. */
  honorScheduled: number;
  /** Honor yang belum masuk jadwal. */
  honorUnscheduled: number;
  honorPaid: number;
  /** Honor terjadwal yang belum dibayar. */
  honorOutstanding: number;
  revisionPaid: number;
  revisionOutstanding: number;
  /** Tahap belum dibayar yang lewat jatuh tempo (tanggal WIB). */
  overdueCount: number;
  nextDue: { id: string; stage: string; amount: number; dueDate: string } | null;
}
