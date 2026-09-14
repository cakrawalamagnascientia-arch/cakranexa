import { ApiError, apiUrl, fetchWithTimeout } from './apiClient';
import { clearAdminToken, getAdminToken } from './adminAuth';
import type { AdminBankAccount, InstitutionInquiry } from '../types';

/**
 * Klien admin institusi fase 4 (backend/digital/institution/admin.ts, rute /api/admin/institution/...) dan rekening
 * bank CMS (/api/admin/bank-accounts). Hanya untuk dasbor admin CakraNexa (token admin).
 */

export type InstitutionStatus = 'prospect' | 'trial' | 'active' | 'grace' | 'expired' | 'suspended';
export type InstitutionOrgType = 'university' | 'school' | 'library' | 'government' | 'firm' | 'company' | 'research' | 'nonprofit' | 'training_center';
export type InstitutionTierCode = 'starter' | 'campus' | 'network' | 'enterprise';
export type ContractStatus = 'draft' | 'issued' | 'active' | 'grace' | 'expired' | 'canceled';
export type InstitutionInvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'void';
export type ManualPaymentMethod = 'transfer' | 'va' | 'other';

export const INSTITUTION_STATUSES: InstitutionStatus[] = ['prospect', 'trial', 'active', 'grace', 'expired', 'suspended'];
export const ORG_TYPES: InstitutionOrgType[] = ['university', 'school', 'library', 'government', 'firm', 'company', 'research', 'nonprofit', 'training_center'];

export interface AdminInstitution {
  id: string;
  slug: string;
  name: string;
  type: InstitutionOrgType;
  address: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  npwp: string | null;
  emailDomains: string[];
  status: InstitutionStatus;
  inquiryId: string | null;
  accountManager: string | null;
  logoUrl: string | null;
  showLogoPublic: boolean;
  notes: string | null;
  language: 'id' | 'en';
  createdAt: string;
  updatedAt: string;
}

/** Status perpanjangan kontrak berjalan: declined = "tidak diperpanjang". */
export type ContractRenewal =
  | { state: 'declined' }
  | { state: 'draft' | 'issued' | 'paid' | 'active' | 'grace' | 'expired'; contractId: string; automatic: boolean }
  | null;

export interface AdminContract {
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
  contractedPrice: number;
  ebaPct: number;
  ebaCredit: number;
  periodStart: string;
  periodEnd: string;
  graceDays: number;
  status: ContractStatus;
  collectionScope: 'full' | 'custom';
  previousContractId: string | null;
  notes: string | null;
  signedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  /** Hanya pada detail institusi. */
  paid?: boolean;
  accessEndsAt?: string;
  collectionSize?: number | null;
  renewal?: ContractRenewal;
}

export interface AdminInstitutionInvoice {
  id: string;
  contractId: string;
  institutionId: string;
  number: string;
  amount: number;
  taxPct: number;
  taxAmount: number;
  total: number;
  issuedAt: string | null;
  dueAt: string | null;
  status: InstitutionInvoiceStatus;
  paymentMethod: 'transfer' | 'va' | 'midtrans' | 'other' | null;
  paidAt: string | null;
  paymentReference: string | null;
  midtransOrderId: string | null;
  snapRedirectUrl: string | null;
  notes: string | null;
  hasProof: boolean;
  hasPdf: boolean;
  createdAt: string;
}

export interface AdminInstitutionTier {
  tier: InstitutionTierCode;
  name: string;
  concurrentUsers: number | null;
  adminSeats: number | null;
  fullPrice: number | null;
  reportCadence: string | null;
  printDiscountPct: number | null;
  bulkOrderMin: number | null;
  readingListsPerYear: number | null;
  accountManager: boolean;
}

export interface InstitutionConfig {
  ebaPct: number;
  ebaExpiryDays: number;
  foundingCap: number;
  foundingDiscountPct: number;
  catalogScale: Array<{ minTitles: number; pct: number }>;
  ppnPct: number;
  invoiceDueDays: number;
  graceDays: number;
  trialDays: number;
  renewalNoticeDays: number[];
  renewalAdminNoticeDays: number;
  renewalInvoiceDays: number;
  renewalVoidDays: number;
  licensePriceMultiplier: number;
  licenseConcurrentUsers: number;
  ipGuestSessionHours: number;
}

export interface FoundingInfo {
  cap: number;
  /** paid + reserved. */
  used: number;
  remaining: number;
  /** Institusi yang sudah membayar kontrak Founding (kumulatif). */
  paid: number;
  /** Invoice Founding terbit yang belum jatuh tempo. */
  reserved: number;
  eligible?: boolean;
  reason?: 'not_first_year' | 'founding_full' | 'suspended' | null;
}

export interface ContractQuote {
  tier: InstitutionTierCode;
  tierName: string;
  isTrial: boolean;
  concurrentUsers: number;
  adminSeats: number;
  fullPrice: number;
  catalogTitleCount: number;
  catalogScalePct: number;
  scaledPrice: number;
  foundingDiscountPct: number;
  foundingDiscountAmount: number;
  contractedPrice: number;
  ebaPct: number;
  ebaCredit: number;
  ppnPct: number;
  taxAmount: number;
  total: number;
}

export interface CompanyBankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string | null;
}

export interface InstitutionSummary {
  counts: Record<InstitutionStatus, number>;
  total: number;
  founding: FoundingInfo;
  catalog: { titles: number; products: number; scalePct: number };
  config: InstitutionConfig;
  invalidConfig: string[];
  tiers: AdminInstitutionTier[];
  openInvoices: number;
  overdueInvoices: number;
  bankAccounts: CompanyBankAccount[];
  paymentAvailable: boolean;
  publicApiUrl: string;
}

export interface InstitutionListRow {
  institution: AdminInstitution;
  runningContract: AdminContract | null;
  openContract: AdminContract | null;
  openInvoice: AdminInstitutionInvoice | null;
  members: { active: number; invited: number };
}

export interface InstitutionEvent {
  id: string;
  contractId: string | null;
  type: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface InstitutionDetail {
  institution: AdminInstitution;
  contracts: AdminContract[];
  invoices: AdminInstitutionInvoice[];
  events: InstitutionEvent[];
  members: { active: number; invited: number; disabled: number; admins: number };
  founding: FoundingInfo;
  trialAvailable: boolean;
}

export interface ContractInput {
  tier: InstitutionTierCode;
  founding: boolean;
  periodStart?: string;
  concurrentUsers?: number;
  adminSeats?: number;
  fullPrice?: number;
  catalogScalePct?: number;
  collectionScope: 'full' | 'custom';
  productIds: string[];
  notes?: string;
}

export interface ContractPreview {
  quote: ContractQuote;
  founding: FoundingInfo;
  periodStart: string;
  periodEnd: string;
  graceDays: number;
  invoiceDueDays: number;
  previousContractId: string | null;
  warnings: string[];
}

export interface CatalogProduct {
  id: string;
  format: 'ebook' | 'audiobook';
  bookId: string;
  title: string;
  category: string;
}

export interface InstitutionJobResult {
  checked: number;
  activated: number;
  graceStarted: number;
  expired: number;
  renewalNotices: number;
  renewalAdminNotices: number;
  renewalInvoicesIssued: number;
  renewalsVoided: number;
  invoiceReminders: number;
  invoicesOverdue: number;
  errors: number;
}

/** Galat API admin dengan kode mesin dari server (mis. founding_unavailable). */
export class InstitutionApiError extends ApiError {
  code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message, status);
    this.code = code;
  }
}

const TIMEOUT_MS = 60000;

const headers = (json: boolean): Record<string, string> => {
  const token = getAdminToken();
  return { Accept: 'application/json', ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const failure = async (res: Response): Promise<InstitutionApiError> => {
  let message = `HTTP ${res.status}`;
  let code: string | null = null;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
    if (typeof body?.code === 'string') code = body.code;
  } catch {
    // bukan JSON
  }
  if (res.status === 401) clearAdminToken();
  return new InstitutionApiError(message, res.status, code);
};

const request = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const res = await fetchWithTimeout(apiUrl(path), {
    method,
    headers: headers(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body)
  }, TIMEOUT_MS);
  if (!res.ok) throw await failure(res);
  return res.json() as Promise<T>;
};

const blob = async (path: string): Promise<Blob> => {
  const res = await fetchWithTimeout(apiUrl(path), { headers: headers(false) }, TIMEOUT_MS);
  if (!res.ok) throw await failure(res);
  return res.blob();
};

const BASE = '/api/admin/institution';
const id = (value: string) => encodeURIComponent(value);

export const getInstitutionSummary = () => request<InstitutionSummary>(`${BASE}/summary`);
export const updateInstitutionConfig = (patch: Partial<InstitutionConfig>) => request<{ config: InstitutionConfig; note: string }>(`${BASE}/config`, 'PATCH', patch);
export const getInstitutionCatalog = () => request<{ titles: number; products: CatalogProduct[] }>(`${BASE}/catalog`);
export const listInstitutions = (filters: { status?: InstitutionStatus; q?: string } = {}) => {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  const query = params.toString();
  return request<{ institutions: InstitutionListRow[]; total: number }>(`${BASE}/institutions${query ? `?${query}` : ''}`);
};
export const createInstitution = (body: Partial<AdminInstitution> & { inquiryId?: string }) =>
  request<{ institution: AdminInstitution }>(`${BASE}/institutions`, 'POST', body);
export const getInstitutionDetail = (institutionId: string) => request<InstitutionDetail>(`${BASE}/institutions/${id(institutionId)}`);
export const updateInstitution = (institutionId: string, patch: Partial<AdminInstitution>) =>
  request<{ institution: AdminInstitution }>(`${BASE}/institutions/${id(institutionId)}`, 'PATCH', patch);
export const previewInstitutionContract = (institutionId: string, input: ContractInput) =>
  request<ContractPreview>(`${BASE}/institutions/${id(institutionId)}/contracts/preview`, 'POST', input);
export const createInstitutionContract = (institutionId: string, input: ContractInput) =>
  request<{ contract: AdminContract; quote: ContractQuote; warnings: string[] }>(`${BASE}/institutions/${id(institutionId)}/contracts`, 'POST', input);
export const createInstitutionTrial = (institutionId: string, notes?: string) =>
  request<{ contract: AdminContract }>(`${BASE}/institutions/${id(institutionId)}/trial`, 'POST', notes ? { notes } : {});
export const issueInstitutionContract = (contractId: string, sendEmail: boolean) =>
  request<{ invoice: AdminInstitutionInvoice; contract: AdminContract; link: string }>(`${BASE}/contracts/${id(contractId)}/issue`, 'POST', { sendEmail });
export const cancelInstitutionContract = (contractId: string, reason?: string) =>
  request<{ contract: AdminContract }>(`${BASE}/contracts/${id(contractId)}/cancel`, 'POST', { confirm: true, ...(reason ? { reason } : {}) });
/** Institusi tidak memperpanjang: draf/invoice perpanjangan yang belum dibayar dibatalkan, job berhenti menagih. */
export const declineInstitutionRenewal = (contractId: string, reason?: string) =>
  request<{ contract: AdminContract; renewal: ContractRenewal }>(`${BASE}/contracts/${id(contractId)}/decline-renewal`, 'POST', { confirm: true, ...(reason ? { reason } : {}) });
export const downloadInstitutionInvoicePdf = (invoiceId: string) => blob(`${BASE}/invoices/${id(invoiceId)}/pdf`);
export const getInstitutionInvoiceLink = (invoiceId: string) => request<{ url: string }>(`${BASE}/invoices/${id(invoiceId)}/link`);
export const sendInstitutionInvoice = (invoiceId: string) => request<{ sentTo: string[] }>(`${BASE}/invoices/${id(invoiceId)}/send`, 'POST', {});
export const openInstitutionInvoiceProof = (invoiceId: string) => blob(`${BASE}/invoices/${id(invoiceId)}/proof`);
export const markInstitutionInvoicePaid = (invoiceId: string, input: { method: ManualPaymentMethod; paidDate?: string; reference?: string; note?: string }) =>
  request<{ result: string; invoice: AdminInstitutionInvoice; contract: AdminContract; institution: AdminInstitution }>(`${BASE}/invoices/${id(invoiceId)}/mark-paid`, 'POST', { confirm: true, ...input });
export const createInstitutionPaymentLink = (invoiceId: string) =>
  request<{ invoice: AdminInstitutionInvoice; paymentUrl: string | null }>(`${BASE}/invoices/${id(invoiceId)}/midtrans`, 'POST', {});
export const voidInstitutionInvoice = (invoiceId: string, reason?: string) =>
  request<{ invoice: AdminInstitutionInvoice; contract: AdminContract }>(`${BASE}/invoices/${id(invoiceId)}/void`, 'POST', { confirm: true, ...(reason ? { reason } : {}) });
export const runInstitutionJob = () => request<InstitutionJobResult>(`${BASE}/jobs/run`, 'POST', {});
export const listInquiriesForConversion = () => request<InstitutionInquiry[]>('/api/admin/institutions/inquiries');

/** Unggah bukti pembayaran (multipart, field "file"). */
export const uploadInstitutionInvoiceProof = async (invoiceId: string, file: File): Promise<{ invoice: AdminInstitutionInvoice }> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetchWithTimeout(apiUrl(`${BASE}/invoices/${id(invoiceId)}/proof`), { method: 'POST', headers: headers(false), body: form }, TIMEOUT_MS);
  if (!res.ok) throw await failure(res);
  return res.json();
};

// ---- Rekening bank CMS (tab Pembayaran)
export const getServerBankAccounts = () => request<{ accounts: AdminBankAccount[]; persisted: boolean }>('/api/admin/bank-accounts');
export const saveServerBankAccounts = (accounts: AdminBankAccount[]) =>
  request<{ success: boolean; saved: number; deactivated: number }>('/api/admin/bank-accounts', 'PUT', { accounts });

// ---- Anggota institusi (Langkah 3): admin CakraNexa mengundang admin institusi pertama & mengelola anggota
export type InstitutionMemberRole = 'member' | 'admin';
export type InstitutionMemberStatus = 'invited' | 'active' | 'disabled';

export interface InstitutionMemberView {
  id: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  role: InstitutionMemberRole;
  status: InstitutionMemberStatus;
  joinedVia: 'invite' | 'domain' | 'code' | 'ip' | 'admin' | null;
  groupLabel: string | null;
  invitedAt: string | null;
  joinedAt: string | null;
  disabledAt: string | null;
  disabledBy: 'admin' | 'member' | 'system' | null;
  expiresAt: string | null;
}

export interface InviteResult {
  invited: number;
  reactivated: number;
  skipped: Array<{ email: string; reason: 'already_invited' | 'already_member' }>;
  invalid: string[];
}

export const listInstitutionMembers = (institutionId: string, filter: { status?: InstitutionMemberStatus; q?: string } = {}) => {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.q?.trim()) params.set('q', filter.q.trim());
  const query = params.toString();
  return request<{ members: InstitutionMemberView[] }>(`${BASE}/institutions/${id(institutionId)}/members${query ? `?${query}` : ''}`);
};
/** emails: daftar atau CSV (satu email per baris/koma). */
export const inviteInstitutionMembers = (institutionId: string, input: { emails: string; role: InstitutionMemberRole; groupLabel?: string }) =>
  request<InviteResult>(`${BASE}/institutions/${id(institutionId)}/members/invite`, 'POST', input);
export const updateInstitutionMember = (institutionId: string, memberId: string, patch: { role?: InstitutionMemberRole; status?: 'active' | 'disabled'; groupLabel?: string | null }) =>
  request<{ member: InstitutionMemberView | null }>(`${BASE}/institutions/${id(institutionId)}/members/${id(memberId)}`, 'PATCH', patch);
export const resendInstitutionInvite = (institutionId: string, memberId: string) =>
  request<{ sent: boolean }>(`${BASE}/institutions/${id(institutionId)}/members/${id(memberId)}/resend`, 'POST', {});
