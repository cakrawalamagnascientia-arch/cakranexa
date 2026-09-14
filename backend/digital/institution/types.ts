/**
 * Tipe data akses institusi fase 4 (docs/PHASE-4-BRIEF). Nama field camelCase; pemetaan ke kolom snake_case ada di
 * supabaseStore.ts modul ini. Skema: src/db/institution_phase4_migration.sql.
 */

export type InstitutionOrgType =
  | 'university' | 'school' | 'library' | 'government' | 'firm' | 'company' | 'research' | 'nonprofit' | 'training_center';
export type InstitutionStatus = 'prospect' | 'trial' | 'active' | 'grace' | 'expired' | 'suspended';
export type InstitutionTierCode = 'starter' | 'campus' | 'network' | 'enterprise';
export type ContractStatus = 'draft' | 'issued' | 'active' | 'grace' | 'expired' | 'canceled';
export type CollectionScope = 'full' | 'custom';
export type InstitutionInvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'void';
export type InstitutionPaymentMethod = 'transfer' | 'va' | 'midtrans' | 'other';
export type MemberRole = 'member' | 'admin';
export type MemberStatus = 'invited' | 'active' | 'disabled';
export type JoinMethod = 'invite' | 'domain' | 'code' | 'ip' | 'admin';
/** Bahasa email & invoice institusi (ragam formal). */
export type InstitutionLanguage = 'id' | 'en';
export type ReportCadence = 'quarterly' | 'monthly' | 'monthly_analysis';

export const ORG_TYPES: InstitutionOrgType[] = ['university', 'school', 'library', 'government', 'firm', 'company', 'research', 'nonprofit', 'training_center'];
export const INSTITUTION_STATUSES: InstitutionStatus[] = ['prospect', 'trial', 'active', 'grace', 'expired', 'suspended'];
export const TIER_CODES: InstitutionTierCode[] = ['starter', 'campus', 'network', 'enterprise'];
/** Kontrak yang sedang memberi akses (paling banyak satu per institusi, indeks unik parsial di SQL). */
export const RUNNING_CONTRACT_STATUSES: ContractStatus[] = ['active', 'grace'];
/** Kontrak yang belum berjalan (paling banyak satu per institusi). */
export const OPEN_CONTRACT_STATUSES: ContractStatus[] = ['draft', 'issued'];
export const OPEN_INVOICE_STATUSES: InstitutionInvoiceStatus[] = ['issued', 'overdue'];

export interface InstitutionRecord {
  id: string;
  slug: string;
  name: string;
  type: InstitutionOrgType;
  address: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  npwp: string | null;
  /** Huruf kecil, mis. ["ui.ac.id"] (gabung otomatis lewat email terverifikasi, Langkah 3). */
  emailDomains: string[];
  ipRanges: string[] | null;
  status: InstitutionStatus;
  inquiryId: string | null;
  accountManager: string | null;
  logoUrl: string | null;
  showLogoPublic: boolean;
  notes: string | null;
  language: InstitutionLanguage;
  createdAt: string;
  updatedAt: string;
}

export type NewInstitution = Omit<InstitutionRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type InstitutionPatch = Partial<Omit<InstitutionRecord, 'id' | 'createdAt' | 'updatedAt'>>;

export interface TierRecord {
  tier: InstitutionTierCode;
  name: string;
  /** null untuk enterprise (diisi manual admin per kontrak). */
  concurrentUsers: number | null;
  adminSeats: number | null;
  fullPrice: number | null;
  reportCadence: ReportCadence | null;
  webinarsPerYear: number | null;
  printDiscountPct: number | null;
  bulkOrderMin: number | null;
  readingListsPerYear: number | null;
  accountManager: boolean;
  sortOrder: number;
}

export interface ContractRecord {
  id: string;
  institutionId: string;
  tier: InstitutionTierCode;
  isTrial: boolean;
  concurrentUsers: number;
  adminSeats: number;
  fullPrice: number;
  catalogScalePct: number;
  catalogTitleCountAtSigning: number;
  foundingDiscountPct: number;
  /** Dikunci saat kontrak dibuat; tidak berubah walau tier/skala/konfigurasi berubah. */
  contractedPrice: number;
  ebaPct: number;
  ebaCredit: number;
  periodStart: string;
  periodEnd: string;
  graceDays: number;
  status: ContractStatus;
  collectionScope: CollectionScope;
  previousContractId: string | null;
  notes: string | null;
  signedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewContract = Omit<ContractRecord, 'id' | 'createdAt' | 'updatedAt'>;
/** Field harga hanya diubah untuk kontrak berstatus draft (harga draf perpanjangan dihitung ulang tiap pemberitahuan). */
export type ContractPatch = Partial<Pick<ContractRecord,
  'status' | 'signedAt' | 'notes' | 'graceDays' | 'concurrentUsers' | 'adminSeats' | 'fullPrice' | 'catalogScalePct'
  | 'catalogTitleCountAtSigning' | 'foundingDiscountPct' | 'contractedPrice' | 'ebaPct' | 'ebaCredit'>>;

export interface InstitutionInvoiceRecord {
  id: string;
  contractId: string;
  institutionId: string;
  /** INV-INST-YYYY-NNNN, berurutan per tahun (fungsi SQL next_institution_invoice_number). */
  number: string;
  amount: number;
  taxPct: number;
  taxAmount: number;
  total: number;
  issuedAt: string | null;
  dueAt: string | null;
  status: InstitutionInvoiceStatus;
  paymentMethod: InstitutionPaymentMethod | null;
  paidAt: string | null;
  paymentReference: string | null;
  /** Bukti transfer di bucket privat. */
  proofPath: string | null;
  /** PDF invoice di bucket privat. */
  pdfPath: string | null;
  /** Midtrans (opsional): order_id terakhir `INST-<nomor>-<percobaan>` dan URL halaman bayar Snap. */
  midtransOrderId: string | null;
  snapRedirectUrl: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewInstitutionInvoice = Omit<InstitutionInvoiceRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type InstitutionInvoicePatch = Partial<Pick<InstitutionInvoiceRecord,
  'status' | 'paymentMethod' | 'paidAt' | 'paymentReference' | 'proofPath' | 'pdfPath' | 'midtransOrderId' | 'snapRedirectUrl' | 'notes'>>;

export interface MemberRecord {
  id: string;
  institutionId: string;
  userId: string | null;
  role: MemberRole;
  status: MemberStatus;
  invitedEmail: string | null;
  invitedAt: string | null;
  invitedBy: string | null;
  joinedAt: string | null;
  joinedVia: JoinMethod | null;
  groupLabel: string | null;
  disabledAt: string | null;
  /** admin = dinonaktifkan admin (tidak bisa bergabung ulang sendiri); member = keluar sendiri; system = otomatis. */
  disabledBy: MemberDisabledBy | null;
  /** Anggota tamu jaringan institusi (ENABLE_IP_ACCESS): akses sementara sampai waktu ini. */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MemberDisabledBy = 'admin' | 'member' | 'system';
export type NewMember = Omit<MemberRecord, 'id' | 'createdAt' | 'updatedAt' | 'disabledBy'> & { disabledBy?: MemberDisabledBy | null };
export type MemberPatch = Partial<Pick<MemberRecord,
  'userId' | 'role' | 'status' | 'invitedAt' | 'invitedBy' | 'joinedAt' | 'joinedVia' | 'groupLabel' | 'disabledAt' | 'disabledBy' | 'expiresAt'>>;

/** Kode gabung (mis. AKUN-2026) dengan batas waktu dan jumlah pemakaian. */
export interface JoinCodeRecord {
  id: string;
  institutionId: string;
  code: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  groupLabel: string | null;
  createdBy: string | null;
  disabledAt: string | null;
  createdAt: string;
}

export type NewJoinCode = Pick<JoinCodeRecord, 'institutionId' | 'code' | 'expiresAt' | 'maxUses' | 'groupLabel' | 'createdBy'>;

export interface InstitutionEventRecord {
  id: string;
  institutionId: string;
  contractId: string | null;
  type: string;
  meta: Record<string, unknown>;
  dedupeKey: string | null;
  createdAt: string;
}

/** Ringkasan agregat institution_usage_daily (tanpa data per individu). */
export interface UsageSummary {
  sessions: number;
  pagesRead: number;
  secondsListened: number;
  deniedConcurrency: number;
  topProducts: Array<{ productId: string; sessions: number }>;
}

export interface UsageDailyRow {
  institutionId: string;
  date: string;
  productId: string;
  sessions: number;
  uniqueUsers: number;
  pagesRead: number;
  secondsListened: number;
  deniedConcurrency: number;
}

/** Nilai institution_config (bisa diubah admin tanpa deploy). Bawaan: pricing.ts. */
export interface InstitutionConfig {
  ebaPct: number;
  ebaExpiryDays: number;
  foundingCap: number;
  foundingDiscountPct: number;
  /** Urut dari minTitles terbesar; pct hanya 40/60/80/100 (CHECK di SQL). */
  catalogScale: Array<{ minTitles: number; pct: number }>;
  ppnPct: number;
  invoiceDueDays: number;
  graceDays: number;
  trialDays: number;
  /** Pemberitahuan perpanjangan ke institusi (hari sebelum akhir periode); pemberitahuan H-30 memuat invoice. */
  renewalNoticeDays: number[];
  /** Pemberitahuan ke admin CakraNexa sebelum invoice perpanjangan terbit otomatis. */
  renewalAdminNoticeDays: number;
  /** Invoice perpanjangan terbit otomatis sekian hari sebelum akhir periode. */
  renewalInvoiceDays: number;
  /** Invoice perpanjangan yang belum dibayar di-void sekian hari setelah periode sebelumnya berakhir. */
  renewalVoidDays: number;
  licensePriceMultiplier: number;
  licenseConcurrentUsers: number;
  ipGuestSessionHours: number;
}

/** Rekening perusahaan dari CMS (tabel admin_bank_accounts, hanya yang aktif). */
export interface CompanyBankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string | null;
}

/** Identitas penerbit di kepala invoice (CMS: nama perusahaan, alamat & kontak footer, NPWP). */
export interface CompanyProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  npwp: string;
}

/** Permintaan penawaran fase 1 (/institutions) yang bisa dikonversi menjadi institusi. */
export interface InquiryRef {
  id: string;
  institutionName: string;
  institutionType: string;
  email: string;
  contactName: string | null;
  phone: string | null;
  language: string;
}
