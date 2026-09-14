import type { NewSession } from '../store';
import type {
  ContractPatch,
  ContractRecord,
  ContractStatus,
  InstitutionEventRecord,
  InstitutionInvoicePatch,
  InstitutionInvoiceRecord,
  InstitutionInvoiceStatus,
  InstitutionPatch,
  InstitutionRecord,
  InstitutionStatus,
  JoinCodeRecord,
  MemberPatch,
  MemberRecord,
  MemberRole,
  MemberStatus,
  NewContract,
  NewInstitution,
  NewInstitutionInvoice,
  NewJoinCode,
  NewMember,
  TierRecord,
  UsageSummary
} from './types';

export interface ContractFilter {
  institutionId?: string;
  statuses?: ContractStatus[];
  previousContractId?: string;
  isTrial?: boolean;
}

export interface InstitutionInvoiceFilter {
  contractId?: string;
  institutionId?: string;
  statuses?: InstitutionInvoiceStatus[];
}

export interface MemberFilter {
  ids?: string[];
  institutionId?: string;
  userId?: string;
  /** Huruf kecil. */
  invitedEmail?: string;
  statuses?: MemberStatus[];
  roles?: MemberRole[];
}

/** Klaim slot pengguna bersamaan + pembuatan sesi (fungsi SQL institution_claim_session). */
export interface SessionClaimInput {
  institutionId: string;
  capacity: number;
  /** Lisensi per judul: batas dihitung per produk; null = seluruh koleksi kontrak. */
  scopeProductId: string | null;
  row: NewSession;
  windowSeconds: number;
}

/**
 * Akses data institusi fase 4. Implementasi: supabaseStore (produksi, service role) dan memoryStore (tes & dev
 * lokal). Pelanggaran keunikan melempar ConflictError (slug, kontrak berjalan/terbuka ganda, trial kedua, nomor invoice,
 * anggota ganda, kode gabung). Tidak ada operasi hapus: pembatalan/penonaktifan memakai status.
 */
export interface InstitutionStore {
  readonly kind: 'supabase' | 'memory';

  /** Isi mentah institution_config (kunci snake_case -> nilai JSON). */
  loadConfig(): Promise<Record<string, unknown>>;
  setConfig(key: string, value: unknown): Promise<void>;
  listTiers(): Promise<TierRecord[]>;

  createInstitution(row: NewInstitution): Promise<InstitutionRecord>;
  getInstitution(id: string): Promise<InstitutionRecord | null>;
  getInstitutionBySlug(slug: string): Promise<InstitutionRecord | null>;
  listInstitutions(filter: { statuses?: InstitutionStatus[]; inquiryId?: string }): Promise<InstitutionRecord[]>;
  /** Institusi yang email_domains-nya memuat salah satu domain ini. */
  listInstitutionsByDomains(domains: string[]): Promise<InstitutionRecord[]>;
  /** Institusi yang punya rentang IP (akses tamu jaringan). */
  listInstitutionsWithIpRanges(): Promise<InstitutionRecord[]>;
  /** Update bersyarat: null bila tidak ada atau status saat ini tidak termasuk `expectStatuses`. */
  updateInstitution(id: string, patch: InstitutionPatch, expectStatuses?: InstitutionStatus[]): Promise<InstitutionRecord | null>;

  createContract(row: NewContract): Promise<ContractRecord>;
  getContract(id: string): Promise<ContractRecord | null>;
  listContracts(filter: ContractFilter): Promise<ContractRecord[]>;
  updateContract(id: string, patch: ContractPatch, expectStatuses?: ContractStatus[]): Promise<ContractRecord | null>;
  /** Koleksi custom: menambah judul (duplikat diabaikan). */
  addContractCollection(contractId: string, productIds: string[]): Promise<void>;
  listContractCollection(contractId: string): Promise<string[]>;

  /** Nomor berikutnya untuk tahun ini (atomik). */
  nextInvoiceNumber(year: number): Promise<string>;
  createInvoice(row: NewInstitutionInvoice): Promise<InstitutionInvoiceRecord>;
  getInvoice(id: string): Promise<InstitutionInvoiceRecord | null>;
  getInvoiceByNumber(number: string): Promise<InstitutionInvoiceRecord | null>;
  listInvoices(filter: InstitutionInvoiceFilter): Promise<InstitutionInvoiceRecord[]>;
  updateInvoice(id: string, patch: InstitutionInvoicePatch, expectStatuses?: InstitutionInvoiceStatus[]): Promise<InstitutionInvoiceRecord | null>;

  listMembers(filter: MemberFilter): Promise<MemberRecord[]>;
  getMember(id: string): Promise<MemberRecord | null>;
  /** ConflictError bila user/email undangan sudah terdaftar di institusi yang sama. */
  insertMember(row: NewMember): Promise<MemberRecord>;
  updateMember(id: string, patch: MemberPatch, expectStatuses?: MemberStatus[]): Promise<MemberRecord | null>;

  createJoinCode(row: NewJoinCode): Promise<JoinCodeRecord>;
  getJoinCodeByCode(code: string): Promise<JoinCodeRecord | null>;
  listJoinCodes(institutionId: string): Promise<JoinCodeRecord[]>;
  /** Pakai kode secara atomik (masih berlaku & kuota tersisa); null bila tidak bisa dipakai. */
  useJoinCode(code: string, now: string): Promise<{ codeId: string; institutionId: string; groupLabel: string | null } | null>;
  disableJoinCode(id: string, now: string): Promise<JoinCodeRecord | null>;

  /** Supabase: fungsi SQL atomik. Store memori mengklaim lewat InstitutionService (tidak dipanggil). */
  claimSession(input: SessionClaimInput): Promise<{ sessionId: string | null; inUse: number; capacity: number }>;

  /** false bila dedupeKey sudah pernah dicatat (email perpanjangan/tenggang tidak terkirim dua kali). */
  insertEvent(row: { institutionId: string; contractId?: string | null; type: string; meta?: Record<string, unknown>; dedupeKey?: string | null }): Promise<boolean>;
  listEvents(filter: { institutionId?: string; contractId?: string; limit?: number }): Promise<InstitutionEventRecord[]>;

  /** Agregat institution_usage_daily untuk tanggal [fromDate, toDate] (YYYY-MM-DD, inklusif). */
  usageSummary(institutionId: string, fromDate: string, toDate: string): Promise<UsageSummary>;
}
