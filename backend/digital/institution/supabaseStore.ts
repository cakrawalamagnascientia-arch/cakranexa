import type { SupabaseClient } from '@supabase/supabase-js';
import { ConflictError } from '../errors';
import { summarizeUsage } from './memoryStore';
import type { ContractFilter, InstitutionInvoiceFilter, InstitutionStore, MemberFilter, SessionClaimInput } from './store';
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
  MemberStatus,
  NewContract,
  NewInstitution,
  NewInstitutionInvoice,
  NewJoinCode,
  NewMember,
  TierRecord,
  UsageDailyRow
} from './types';

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toSnake = (patch: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined).map(([k, v]) => [snake(k), v]));
const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
/** Timestamptz PostgREST ("2026-09-14T03:00:00+00:00") -> ISO UTC, sama dengan store memori. */
const iso = (value: unknown): string | null => (value ? new Date(String(value)).toISOString() : null);

/** Lempar error Supabase; pelanggaran unik (23505) menjadi ConflictError. */
const check = <T>(result: { data: T; error: { code?: string; message: string } | null }, what: string): T => {
  if (result.error) {
    if (result.error.code === '23505') throw new ConflictError(`${what}: ${result.error.message}`);
    throw new Error(`Supabase ${what}: ${result.error.message}`);
  }
  return result.data;
};

const toInstitution = (r: any): InstitutionRecord => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  type: r.type,
  address: r.address ?? null,
  contactName: r.contact_name ?? null,
  contactEmail: r.contact_email ?? null,
  contactPhone: r.contact_phone ?? null,
  npwp: r.npwp ?? null,
  emailDomains: Array.isArray(r.email_domains) ? r.email_domains.map(String) : [],
  ipRanges: Array.isArray(r.ip_ranges) ? r.ip_ranges.map(String) : null,
  status: r.status,
  inquiryId: r.inquiry_id ?? null,
  accountManager: r.account_manager ?? null,
  logoUrl: r.logo_url ?? null,
  showLogoPublic: Boolean(r.show_logo_public),
  notes: r.notes ?? null,
  language: r.language === 'en' ? 'en' : 'id',
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!
});

const toTier = (r: any): TierRecord => ({
  tier: r.tier,
  name: r.name,
  concurrentUsers: num(r.concurrent_users),
  adminSeats: num(r.admin_seats),
  fullPrice: num(r.full_price),
  reportCadence: r.report_cadence ?? null,
  webinarsPerYear: num(r.webinars_per_year),
  printDiscountPct: num(r.print_discount_pct),
  bulkOrderMin: num(r.bulk_order_min),
  readingListsPerYear: num(r.reading_lists_per_year),
  accountManager: Boolean(r.account_manager),
  sortOrder: Number(r.sort_order) || 0
});

const toContract = (r: any): ContractRecord => ({
  id: r.id,
  institutionId: r.institution_id,
  tier: r.tier,
  isTrial: Boolean(r.is_trial),
  concurrentUsers: Number(r.concurrent_users),
  adminSeats: Number(r.admin_seats),
  fullPrice: Number(r.full_price),
  catalogScalePct: Number(r.catalog_scale_pct),
  catalogTitleCountAtSigning: Number(r.catalog_title_count_at_signing),
  foundingDiscountPct: Number(r.founding_discount_pct),
  contractedPrice: Number(r.contracted_price),
  ebaPct: Number(r.eba_pct),
  ebaCredit: Number(r.eba_credit),
  periodStart: iso(r.period_start)!,
  periodEnd: iso(r.period_end)!,
  graceDays: Number(r.grace_days),
  status: r.status,
  collectionScope: r.collection_scope === 'custom' ? 'custom' : 'full',
  previousContractId: r.previous_contract_id ?? null,
  notes: r.notes ?? null,
  signedAt: iso(r.signed_at),
  createdBy: r.created_by ?? null,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!
});

const toInvoice = (r: any): InstitutionInvoiceRecord => ({
  id: r.id,
  contractId: r.contract_id,
  institutionId: r.institution_id,
  number: r.number,
  amount: Number(r.amount),
  taxPct: Number(r.tax_pct) || 0,
  taxAmount: Number(r.tax_amount) || 0,
  total: Number(r.total),
  issuedAt: iso(r.issued_at),
  dueAt: iso(r.due_at),
  status: r.status,
  paymentMethod: r.payment_method ?? null,
  paidAt: iso(r.paid_at),
  paymentReference: r.payment_reference ?? null,
  proofPath: r.proof_path ?? null,
  pdfPath: r.pdf_path ?? null,
  midtransOrderId: r.midtrans_order_id ?? null,
  snapRedirectUrl: r.snap_redirect_url ?? null,
  notes: r.notes ?? null,
  createdBy: r.created_by ?? null,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!
});

const toMember = (r: any): MemberRecord => ({
  id: r.id,
  institutionId: r.institution_id,
  userId: r.user_id ?? null,
  role: r.role,
  status: r.status,
  invitedEmail: r.invited_email ?? null,
  invitedAt: iso(r.invited_at),
  invitedBy: r.invited_by ?? null,
  joinedAt: iso(r.joined_at),
  joinedVia: r.joined_via ?? null,
  groupLabel: r.group_label ?? null,
  disabledAt: iso(r.disabled_at),
  disabledBy: r.disabled_by ?? null,
  expiresAt: iso(r.expires_at),
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!
});

const toJoinCode = (r: any): JoinCodeRecord => ({
  id: r.id,
  institutionId: r.institution_id,
  code: r.code,
  expiresAt: iso(r.expires_at),
  maxUses: num(r.max_uses),
  usedCount: Number(r.used_count) || 0,
  groupLabel: r.group_label ?? null,
  createdBy: r.created_by ?? null,
  disabledAt: iso(r.disabled_at),
  createdAt: iso(r.created_at)!
});

const toEvent = (r: any): InstitutionEventRecord => ({
  id: String(r.id),
  institutionId: r.institution_id,
  contractId: r.contract_id ?? null,
  type: r.type,
  meta: r.meta || {},
  dedupeKey: r.dedupe_key ?? null,
  createdAt: iso(r.created_at)!
});

/** Store institusi di Supabase (service role, melewati RLS). */
export class SupabaseInstitutionStore implements InstitutionStore {
  readonly kind = 'supabase' as const;

  constructor(private readonly db: SupabaseClient) {}

  async loadConfig() {
    const data = check(await this.db.from('institution_config').select('key, value'), 'loadConfig');
    return Object.fromEntries(((data as any[]) || []).map((r) => [r.key, r.value]));
  }

  async setConfig(key: string, value: unknown) {
    check(await this.db.from('institution_config').upsert({ key, value }, { onConflict: 'key' }), 'setConfig');
  }

  async listTiers() {
    const data = check(await this.db.from('institution_tiers').select('*').order('sort_order'), 'listTiers');
    return ((data as any[]) || []).map(toTier);
  }

  async createInstitution(row: NewInstitution) {
    const data = check(await this.db.from('institutions').insert(toSnake(row as unknown as Record<string, unknown>)).select('*').single(), 'createInstitution');
    return toInstitution(data);
  }

  async getInstitution(id: string) {
    const data = check(await this.db.from('institutions').select('*').eq('id', id).maybeSingle(), 'getInstitution');
    return data ? toInstitution(data) : null;
  }

  async getInstitutionBySlug(slug: string) {
    const data = check(await this.db.from('institutions').select('*').eq('slug', slug).maybeSingle(), 'getInstitutionBySlug');
    return data ? toInstitution(data) : null;
  }

  async listInstitutions(filter: { statuses?: InstitutionStatus[]; inquiryId?: string }) {
    let query = this.db.from('institutions').select('*');
    if (filter.statuses) query = query.in('status', filter.statuses);
    if (filter.inquiryId) query = query.eq('inquiry_id', filter.inquiryId);
    const data = check(await query.order('created_at', { ascending: false }).limit(5000), 'listInstitutions');
    return ((data as any[]) || []).map(toInstitution);
  }

  async listInstitutionsByDomains(domains: string[]) {
    if (domains.length === 0) return [];
    const data = check(await this.db.from('institutions').select('*').overlaps('email_domains', domains).limit(100), 'listInstitutionsByDomains');
    return ((data as any[]) || []).map(toInstitution);
  }

  async listInstitutionsWithIpRanges() {
    const data = check(await this.db.from('institutions').select('*').not('ip_ranges', 'is', null).limit(5000), 'listInstitutionsWithIpRanges');
    return ((data as any[]) || []).map(toInstitution).filter((i) => (i.ipRanges ?? []).length > 0);
  }

  async updateInstitution(id: string, patch: InstitutionPatch, expectStatuses?: InstitutionStatus[]) {
    let query = this.db.from('institutions').update(toSnake(patch as Record<string, unknown>)).eq('id', id);
    if (expectStatuses) query = query.in('status', expectStatuses);
    const data = check(await query.select('*').maybeSingle(), 'updateInstitution');
    return data ? toInstitution(data) : null;
  }

  async createContract(row: NewContract) {
    const data = check(await this.db.from('institution_contracts').insert(toSnake(row as unknown as Record<string, unknown>)).select('*').single(), 'createContract');
    return toContract(data);
  }

  async getContract(id: string) {
    const data = check(await this.db.from('institution_contracts').select('*').eq('id', id).maybeSingle(), 'getContract');
    return data ? toContract(data) : null;
  }

  async listContracts(filter: ContractFilter) {
    let query = this.db.from('institution_contracts').select('*');
    if (filter.institutionId) query = query.eq('institution_id', filter.institutionId);
    if (filter.statuses) query = query.in('status', filter.statuses);
    if (filter.previousContractId) query = query.eq('previous_contract_id', filter.previousContractId);
    if (filter.isTrial !== undefined) query = query.eq('is_trial', filter.isTrial);
    const data = check(await query.order('period_start', { ascending: false }).order('created_at', { ascending: false }).limit(10000), 'listContracts');
    return ((data as any[]) || []).map(toContract);
  }

  async updateContract(id: string, patch: ContractPatch, expectStatuses?: ContractStatus[]) {
    let query = this.db.from('institution_contracts').update(toSnake(patch as Record<string, unknown>)).eq('id', id);
    if (expectStatuses) query = query.in('status', expectStatuses);
    const data = check(await query.select('*').maybeSingle(), 'updateContract');
    return data ? toContract(data) : null;
  }

  async addContractCollection(contractId: string, productIds: string[]) {
    if (productIds.length === 0) return;
    check(await this.db.from('institution_contract_collections')
      .upsert(productIds.map((id) => ({ contract_id: contractId, digital_product_id: id })), { onConflict: 'contract_id,digital_product_id', ignoreDuplicates: true }), 'addContractCollection');
  }

  async listContractCollection(contractId: string) {
    const data = check(await this.db.from('institution_contract_collections').select('digital_product_id').eq('contract_id', contractId).limit(10000), 'listContractCollection');
    return ((data as any[]) || []).map((r) => String(r.digital_product_id));
  }

  async nextInvoiceNumber(year: number) {
    const data = check(await this.db.rpc('next_institution_invoice_number', { p_year: year }), 'nextInvoiceNumber');
    return String(data);
  }

  async createInvoice(row: NewInstitutionInvoice) {
    const data = check(await this.db.from('institution_invoices').insert(toSnake(row as unknown as Record<string, unknown>)).select('*').single(), 'createInvoice');
    return toInvoice(data);
  }

  async getInvoice(id: string) {
    const data = check(await this.db.from('institution_invoices').select('*').eq('id', id).maybeSingle(), 'getInvoice');
    return data ? toInvoice(data) : null;
  }

  async getInvoiceByNumber(number: string) {
    const data = check(await this.db.from('institution_invoices').select('*').eq('number', number).maybeSingle(), 'getInvoiceByNumber');
    return data ? toInvoice(data) : null;
  }

  async listInvoices(filter: InstitutionInvoiceFilter) {
    let query = this.db.from('institution_invoices').select('*');
    if (filter.contractId) query = query.eq('contract_id', filter.contractId);
    if (filter.institutionId) query = query.eq('institution_id', filter.institutionId);
    if (filter.statuses) query = query.in('status', filter.statuses);
    const data = check(await query.order('created_at', { ascending: false }).limit(10000), 'listInvoices');
    return ((data as any[]) || []).map(toInvoice);
  }

  async updateInvoice(id: string, patch: InstitutionInvoicePatch, expectStatuses?: InstitutionInvoiceStatus[]) {
    let query = this.db.from('institution_invoices').update(toSnake(patch as Record<string, unknown>)).eq('id', id);
    if (expectStatuses) query = query.in('status', expectStatuses);
    const data = check(await query.select('*').maybeSingle(), 'updateInvoice');
    return data ? toInvoice(data) : null;
  }

  async listMembers(filter: MemberFilter) {
    let query = this.db.from('institution_members').select('*');
    if (filter.ids) query = query.in('id', filter.ids);
    if (filter.institutionId) query = query.eq('institution_id', filter.institutionId);
    if (filter.userId) query = query.eq('user_id', filter.userId);
    if (filter.invitedEmail) query = query.eq('invited_email', filter.invitedEmail);
    if (filter.statuses) query = query.in('status', filter.statuses);
    if (filter.roles) query = query.in('role', filter.roles);
    const data = check(await query.order('created_at').limit(100000), 'listMembers');
    return ((data as any[]) || []).map(toMember);
  }

  async getMember(id: string) {
    const data = check(await this.db.from('institution_members').select('*').eq('id', id).maybeSingle(), 'getMember');
    return data ? toMember(data) : null;
  }

  async insertMember(row: NewMember) {
    const data = check(await this.db.from('institution_members').insert(toSnake(row as unknown as Record<string, unknown>)).select('*').single(), 'insertMember');
    return toMember(data);
  }

  async updateMember(id: string, patch: MemberPatch, expectStatuses?: MemberStatus[]) {
    let query = this.db.from('institution_members').update(toSnake(patch as Record<string, unknown>)).eq('id', id);
    if (expectStatuses) query = query.in('status', expectStatuses);
    const data = check(await query.select('*').maybeSingle(), 'updateMember');
    return data ? toMember(data) : null;
  }

  async createJoinCode(row: NewJoinCode) {
    const data = check(await this.db.from('institution_join_codes').insert(toSnake(row as unknown as Record<string, unknown>)).select('*').single(), 'createJoinCode');
    return toJoinCode(data);
  }

  async getJoinCodeByCode(code: string) {
    const data = check(await this.db.from('institution_join_codes').select('*').eq('code', code.trim().toUpperCase()).maybeSingle(), 'getJoinCodeByCode');
    return data ? toJoinCode(data) : null;
  }

  async listJoinCodes(institutionId: string) {
    const data = check(await this.db.from('institution_join_codes').select('*').eq('institution_id', institutionId).order('created_at', { ascending: false }).limit(500), 'listJoinCodes');
    return ((data as any[]) || []).map(toJoinCode);
  }

  async useJoinCode(code: string, now: string) {
    const data = check(await this.db.rpc('institution_use_join_code', { p_code: code, p_now: now }), 'useJoinCode');
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { codeId: String(row.code_id), institutionId: String(row.institution_id), groupLabel: row.group_label ?? null } : null;
  }

  async disableJoinCode(id: string, now: string) {
    check(await this.db.from('institution_join_codes').update({ disabled_at: now }).eq('id', id).is('disabled_at', null), 'disableJoinCode');
    const data = check(await this.db.from('institution_join_codes').select('*').eq('id', id).maybeSingle(), 'disableJoinCode');
    return data ? toJoinCode(data) : null;
  }

  async claimSession(input: SessionClaimInput) {
    const { row } = input;
    const data = check(await this.db.rpc('institution_claim_session', {
      p_institution_id: input.institutionId,
      p_capacity: input.capacity,
      p_scope_product_id: input.scopeProductId,
      p_user_id: row.userId,
      p_product_id: row.productId,
      p_device_id: row.deviceId,
      p_entitlement_id: row.entitlementId,
      p_token_hash: row.tokenHash,
      p_ip: row.ip,
      p_user_agent: row.userAgent,
      p_now: row.startedAt,
      p_window_seconds: input.windowSeconds
    }), 'claimSession');
    const result = Array.isArray(data) ? data[0] : data;
    return { sessionId: result?.session_id ?? null, inUse: Number(result?.in_use) || 0, capacity: Number(result?.capacity) || input.capacity };
  }

  async insertEvent(row: { institutionId: string; contractId?: string | null; type: string; meta?: Record<string, unknown>; dedupeKey?: string | null }) {
    const result = await this.db.from('institution_events').insert({
      institution_id: row.institutionId,
      contract_id: row.contractId ?? null,
      type: row.type,
      meta: row.meta ?? {},
      dedupe_key: row.dedupeKey ?? null
    });
    if (result.error?.code === '23505') return false;
    check(result, 'insertEvent');
    return true;
  }

  async listEvents(filter: { institutionId?: string; contractId?: string; limit?: number }) {
    let query = this.db.from('institution_events').select('*');
    if (filter.institutionId) query = query.eq('institution_id', filter.institutionId);
    if (filter.contractId) query = query.eq('contract_id', filter.contractId);
    const data = check(await query.order('id', { ascending: false }).limit(filter.limit ?? 200), 'listEvents');
    return ((data as any[]) || []).map(toEvent);
  }

  async usageSummary(institutionId: string, fromDate: string, toDate: string) {
    const data = check(await this.db.from('institution_usage_daily')
      .select('*')
      .eq('institution_id', institutionId)
      .gte('date', fromDate)
      .lte('date', toDate)
      .limit(100000), 'usageSummary');
    const rows: UsageDailyRow[] = ((data as any[]) || []).map((r) => ({
      institutionId: r.institution_id,
      date: String(r.date).slice(0, 10),
      productId: r.digital_product_id,
      sessions: Number(r.sessions) || 0,
      uniqueUsers: Number(r.unique_users) || 0,
      pagesRead: Number(r.pages_read) || 0,
      secondsListened: Number(r.seconds_listened) || 0,
      deniedConcurrency: Number(r.denied_concurrency) || 0
    }));
    return summarizeUsage(rows);
  }
}
