import crypto from 'crypto';
import { ConflictError } from '../errors';
import { DEFAULT_TIERS } from './pricing';
import { OPEN_CONTRACT_STATUSES, RUNNING_CONTRACT_STATUSES } from './types';
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
  UsageDailyRow,
  UsageSummary
} from './types';

const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * Store institusi di memori untuk tes otomatis dan dev lokal. Meniru batasan SQL yang dipakai alur kontrak & anggota:
 * slug unik, satu kontrak berjalan & satu kontrak terbuka per institusi, trial sekali, nomor invoice unik per tahun,
 * anggota unik per user/email, kode gabung unik dengan kuota.
 */
export class MemoryInstitutionStore implements InstitutionStore {
  readonly kind = 'memory' as const;
  readonly config = new Map<string, unknown>();
  readonly tiers: TierRecord[] = clone(DEFAULT_TIERS);
  readonly institutions: InstitutionRecord[] = [];
  readonly contracts: ContractRecord[] = [];
  readonly collections: Array<{ contractId: string; productId: string }> = [];
  readonly counters = new Map<number, number>();
  readonly invoices: InstitutionInvoiceRecord[] = [];
  readonly members: MemberRecord[] = [];
  readonly joinCodes: JoinCodeRecord[] = [];
  readonly events: InstitutionEventRecord[] = [];
  /** Diisi tes (job harian penggunaan dibuat di Langkah 4). */
  readonly usage: UsageDailyRow[] = [];

  async loadConfig() {
    return Object.fromEntries(this.config);
  }

  async setConfig(key: string, value: unknown) {
    this.config.set(key, clone(value));
  }

  async listTiers() {
    return clone(this.tiers);
  }

  async createInstitution(row: NewInstitution) {
    if (this.institutions.some((i) => i.slug === row.slug)) throw new ConflictError('institution_slug');
    const record: InstitutionRecord = { ...clone(row), id: uuid(), createdAt: nowIso(), updatedAt: nowIso() };
    this.institutions.push(record);
    return clone(record);
  }

  async getInstitution(id: string) {
    const i = this.institutions.find((x) => x.id === id);
    return i ? clone(i) : null;
  }

  async getInstitutionBySlug(slug: string) {
    const i = this.institutions.find((x) => x.slug === slug);
    return i ? clone(i) : null;
  }

  async listInstitutions(filter: { statuses?: InstitutionStatus[]; inquiryId?: string }) {
    return this.institutions
      .filter((i) => (!filter.statuses || filter.statuses.includes(i.status)) && (!filter.inquiryId || i.inquiryId === filter.inquiryId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  async listInstitutionsByDomains(domains: string[]) {
    return this.institutions.filter((i) => i.emailDomains.some((d) => domains.includes(d))).map(clone);
  }

  async listInstitutionsWithIpRanges() {
    return this.institutions.filter((i) => (i.ipRanges ?? []).length > 0).map(clone);
  }

  async updateInstitution(id: string, patch: InstitutionPatch, expectStatuses?: InstitutionStatus[]) {
    const i = this.institutions.find((x) => x.id === id);
    if (!i || (expectStatuses && !expectStatuses.includes(i.status))) return null;
    if (patch.slug && patch.slug !== i.slug && this.institutions.some((x) => x.slug === patch.slug)) throw new ConflictError('institution_slug');
    Object.assign(i, clone(patch), { updatedAt: nowIso() });
    return clone(i);
  }

  private assertContractSlots(institutionId: string, status: ContractStatus, isTrial: boolean, exceptId?: string) {
    const others = this.contracts.filter((c) => c.institutionId === institutionId && c.id !== exceptId);
    if (RUNNING_CONTRACT_STATUSES.includes(status) && others.some((c) => RUNNING_CONTRACT_STATUSES.includes(c.status))) {
      throw new ConflictError('contract_running');
    }
    if (OPEN_CONTRACT_STATUSES.includes(status) && others.some((c) => OPEN_CONTRACT_STATUSES.includes(c.status))) {
      throw new ConflictError('contract_open');
    }
    if (isTrial && others.some((c) => c.isTrial)) throw new ConflictError('contract_trial');
  }

  async createContract(row: NewContract) {
    this.assertContractSlots(row.institutionId, row.status, row.isTrial);
    const record: ContractRecord = { ...clone(row), id: uuid(), createdAt: nowIso(), updatedAt: nowIso() };
    this.contracts.push(record);
    return clone(record);
  }

  async getContract(id: string) {
    const c = this.contracts.find((x) => x.id === id);
    return c ? clone(c) : null;
  }

  async listContracts(filter: ContractFilter) {
    return this.contracts
      .filter((c) => (!filter.institutionId || c.institutionId === filter.institutionId)
        && (!filter.statuses || filter.statuses.includes(c.status))
        && (!filter.previousContractId || c.previousContractId === filter.previousContractId)
        && (filter.isTrial === undefined || c.isTrial === filter.isTrial))
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart) || b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  async updateContract(id: string, patch: ContractPatch, expectStatuses?: ContractStatus[]) {
    const c = this.contracts.find((x) => x.id === id);
    if (!c || (expectStatuses && !expectStatuses.includes(c.status))) return null;
    if (patch.status && patch.status !== c.status) this.assertContractSlots(c.institutionId, patch.status, false, c.id);
    Object.assign(c, clone(patch), { updatedAt: nowIso() });
    return clone(c);
  }

  async addContractCollection(contractId: string, productIds: string[]) {
    for (const productId of productIds) {
      if (!this.collections.some((r) => r.contractId === contractId && r.productId === productId)) this.collections.push({ contractId, productId });
    }
  }

  async listContractCollection(contractId: string) {
    return this.collections.filter((r) => r.contractId === contractId).map((r) => r.productId);
  }

  async nextInvoiceNumber(year: number) {
    const next = (this.counters.get(year) ?? 0) + 1;
    this.counters.set(year, next);
    return `INV-INST-${year}-${String(next).padStart(4, '0')}`;
  }

  async createInvoice(row: NewInstitutionInvoice) {
    if (this.invoices.some((i) => i.number === row.number)) throw new ConflictError('invoice_number');
    if (row.midtransOrderId && this.invoices.some((i) => i.midtransOrderId === row.midtransOrderId)) throw new ConflictError('invoice_order_id');
    if (row.total !== row.amount + row.taxAmount) throw new Error('institution_invoices_total_check');
    const record: InstitutionInvoiceRecord = { ...clone(row), id: uuid(), createdAt: nowIso(), updatedAt: nowIso() };
    this.invoices.push(record);
    return clone(record);
  }

  async getInvoice(id: string) {
    const i = this.invoices.find((x) => x.id === id);
    return i ? clone(i) : null;
  }

  async getInvoiceByNumber(number: string) {
    const i = this.invoices.find((x) => x.number === number);
    return i ? clone(i) : null;
  }

  async listInvoices(filter: InstitutionInvoiceFilter) {
    return this.invoices
      .filter((i) => (!filter.contractId || i.contractId === filter.contractId)
        && (!filter.institutionId || i.institutionId === filter.institutionId)
        && (!filter.statuses || filter.statuses.includes(i.status)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number.localeCompare(a.number))
      .map(clone);
  }

  async updateInvoice(id: string, patch: InstitutionInvoicePatch, expectStatuses?: InstitutionInvoiceStatus[]) {
    const i = this.invoices.find((x) => x.id === id);
    if (!i || (expectStatuses && !expectStatuses.includes(i.status))) return null;
    if (patch.midtransOrderId && this.invoices.some((x) => x.id !== id && x.midtransOrderId === patch.midtransOrderId)) throw new ConflictError('invoice_order_id');
    Object.assign(i, clone(patch), { updatedAt: nowIso() });
    return clone(i);
  }

  async listMembers(filter: MemberFilter) {
    return this.members
      .filter((m) => (!filter.ids || filter.ids.includes(m.id))
        && (!filter.institutionId || m.institutionId === filter.institutionId)
        && (!filter.userId || m.userId === filter.userId)
        && (!filter.invitedEmail || m.invitedEmail === filter.invitedEmail)
        && (!filter.statuses || filter.statuses.includes(m.status))
        && (!filter.roles || filter.roles.includes(m.role)))
      .map(clone);
  }

  async getMember(id: string) {
    const m = this.members.find((x) => x.id === id);
    return m ? clone(m) : null;
  }

  private assertMemberUnique(institutionId: string, userId: string | null, invitedEmail: string | null, exceptId?: string) {
    const others = this.members.filter((m) => m.institutionId === institutionId && m.id !== exceptId);
    if (userId && others.some((m) => m.userId === userId)) throw new ConflictError('member_user');
    if (invitedEmail && others.some((m) => m.invitedEmail === invitedEmail)) throw new ConflictError('member_email');
  }

  async insertMember(row: NewMember) {
    this.assertMemberUnique(row.institutionId, row.userId, row.invitedEmail);
    if (row.status === 'active' && !row.userId) throw new Error('institution_members_active_check');
    const record: MemberRecord = { ...clone(row), disabledBy: row.disabledBy ?? null, id: uuid(), createdAt: nowIso(), updatedAt: nowIso() };
    this.members.push(record);
    return clone(record);
  }

  async updateMember(id: string, patch: MemberPatch, expectStatuses?: MemberStatus[]) {
    const m = this.members.find((x) => x.id === id);
    if (!m || (expectStatuses && !expectStatuses.includes(m.status))) return null;
    if (patch.userId && patch.userId !== m.userId) this.assertMemberUnique(m.institutionId, patch.userId, null, m.id);
    Object.assign(m, clone(patch), { updatedAt: nowIso() });
    return clone(m);
  }

  async createJoinCode(row: NewJoinCode) {
    if (this.joinCodes.some((c) => c.code === row.code)) throw new ConflictError('join_code');
    const record: JoinCodeRecord = { ...clone(row), id: uuid(), usedCount: 0, disabledAt: null, createdAt: nowIso() };
    this.joinCodes.push(record);
    return clone(record);
  }

  async getJoinCodeByCode(code: string) {
    const c = this.joinCodes.find((x) => x.code === code.trim().toUpperCase());
    return c ? clone(c) : null;
  }

  async listJoinCodes(institutionId: string) {
    return this.joinCodes.filter((c) => c.institutionId === institutionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }

  async useJoinCode(code: string, now: string) {
    const c = this.joinCodes.find((x) => x.code === code.trim().toUpperCase());
    if (!c || c.disabledAt || (c.expiresAt && Date.parse(c.expiresAt) <= Date.parse(now)) || (c.maxUses !== null && c.usedCount >= c.maxUses)) return null;
    c.usedCount += 1;
    return { codeId: c.id, institutionId: c.institutionId, groupLabel: c.groupLabel };
  }

  async disableJoinCode(id: string, now: string) {
    const c = this.joinCodes.find((x) => x.id === id);
    if (!c) return null;
    if (!c.disabledAt) c.disabledAt = now;
    return clone(c);
  }

  async claimSession(_input: SessionClaimInput): Promise<{ sessionId: string | null; inUse: number; capacity: number }> {
    throw new Error('Store memori: klaim sesi institusi dilakukan InstitutionService.');
  }

  async insertEvent(row: { institutionId: string; contractId?: string | null; type: string; meta?: Record<string, unknown>; dedupeKey?: string | null }) {
    if (row.dedupeKey && this.events.some((e) => e.dedupeKey === row.dedupeKey)) return false;
    this.events.push({
      id: String(this.events.length + 1),
      institutionId: row.institutionId,
      contractId: row.contractId ?? null,
      type: row.type,
      meta: clone(row.meta ?? {}),
      dedupeKey: row.dedupeKey ?? null,
      createdAt: nowIso()
    });
    return true;
  }

  async listEvents(filter: { institutionId?: string; contractId?: string; limit?: number }) {
    return this.events
      .filter((e) => (!filter.institutionId || e.institutionId === filter.institutionId) && (!filter.contractId || e.contractId === filter.contractId))
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, filter.limit ?? 200)
      .map(clone);
  }

  async usageSummary(institutionId: string, fromDate: string, toDate: string): Promise<UsageSummary> {
    const rows = this.usage.filter((u) => u.institutionId === institutionId && u.date >= fromDate && u.date <= toDate);
    return summarizeUsage(rows);
  }
}

/** Agregat baris harian (juga dipakai supabaseStore). */
export const summarizeUsage = (rows: UsageDailyRow[]): UsageSummary => {
  const byProduct = new Map<string, number>();
  let sessions = 0;
  let pagesRead = 0;
  let secondsListened = 0;
  let deniedConcurrency = 0;
  for (const r of rows) {
    sessions += r.sessions;
    pagesRead += r.pagesRead;
    secondsListened += r.secondsListened;
    deniedConcurrency += r.deniedConcurrency;
    byProduct.set(r.productId, (byProduct.get(r.productId) ?? 0) + r.sessions);
  }
  const topProducts = [...byProduct.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([productId, n]) => ({ productId, sessions: n }));
  return { sessions, pagesRead, secondsListened, deniedConcurrency, topProducts };
};
