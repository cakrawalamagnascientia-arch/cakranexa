import type { SupabaseClient } from '@supabase/supabase-js';
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

/** Timestamptz PostgREST -> ISO UTC; kolom DATE -> YYYY-MM-DD. */
const iso = (value: unknown): string | null => (value ? new Date(String(value)).toISOString() : null);
const day = (value: unknown): string | null => (value ? String(value).slice(0, 10) : null);

const check = <T>(result: { data: T; error: { code?: string; message: string } | null }, what: string): T => {
  if (result.error) {
    if (result.error.code === '23505') throw new ManuscriptConflictError(`${what}: ${result.error.message}`);
    throw new Error(`Supabase ${what}: ${result.error.message}`);
  }
  return result.data;
};

const toContract = (r: any): ManuscriptContract => ({
  id: r.id,
  contractNumber: r.contract_number,
  authorId: r.author_id,
  bookId: r.book_id ?? null,
  contractType: 'jual_putus',
  status: r.status,
  rights: {
    print: Boolean(r.rights_print),
    ebook: Boolean(r.rights_ebook),
    audiobook: Boolean(r.rights_audiobook),
    translation: Boolean(r.rights_translation),
    derivative: Boolean(r.rights_derivative)
  },
  signedAt: day(r.signed_at)!,
  termYears: Number(r.term_years),
  rightsRevertAt: day(r.rights_revert_at)!,
  honorTotal: Number(r.honor_total),
  revisionFeePerEdition: Number(r.revision_fee_per_edition),
  contractFilePath: r.contract_file_path ?? null,
  notes: r.notes ?? null,
  terminatedAt: iso(r.terminated_at),
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!
});

const contractRow = (c: ManuscriptContractPatch): Record<string, unknown> => {
  const row: Record<string, unknown> = {
    contract_number: c.contractNumber,
    author_id: c.authorId,
    book_id: c.bookId,
    contract_type: c.contractType,
    status: c.status,
    signed_at: c.signedAt,
    term_years: c.termYears,
    rights_revert_at: c.rightsRevertAt,
    honor_total: c.honorTotal,
    revision_fee_per_edition: c.revisionFeePerEdition,
    contract_file_path: c.contractFilePath,
    notes: c.notes,
    terminated_at: c.terminatedAt
  };
  if (c.rights) {
    row.rights_print = c.rights.print;
    row.rights_ebook = c.rights.ebook;
    row.rights_audiobook = c.rights.audiobook;
    row.rights_translation = c.rights.translation;
    row.rights_derivative = c.rights.derivative;
  }
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
};

const toPayment = (r: any): ManuscriptPayment => ({
  id: r.id,
  contractId: r.contract_id,
  sequence: Number(r.sequence),
  stage: r.stage,
  kind: r.kind,
  edition: r.edition === null || r.edition === undefined ? null : Number(r.edition),
  amount: Number(r.amount),
  dueDate: day(r.due_date)!,
  paidAt: day(r.paid_at),
  paymentReference: r.payment_reference ?? null,
  paymentProofPath: r.payment_proof_path ?? null,
  taxSlipPath: r.tax_slip_path ?? null,
  notes: r.notes ?? null,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!
});

const paymentRow = (p: ManuscriptPaymentPatch & { contractId?: string }): Record<string, unknown> =>
  Object.fromEntries(Object.entries({
    contract_id: p.contractId,
    sequence: p.sequence,
    stage: p.stage,
    kind: p.kind,
    edition: p.edition,
    amount: p.amount,
    due_date: p.dueDate,
    paid_at: p.paidAt,
    payment_reference: p.paymentReference,
    payment_proof_path: p.paymentProofPath,
    tax_slip_path: p.taxSlipPath,
    notes: p.notes
  }).filter(([, v]) => v !== undefined));

export class SupabaseManuscriptStore implements ManuscriptStore {
  readonly kind = 'supabase' as const;

  constructor(private readonly client: SupabaseClient) {}

  async createContract(row: NewManuscriptContract) {
    const data = check(await this.client.from('manuscript_contracts').insert(contractRow(row)).select('*').single(), 'manuscript_contracts insert');
    return toContract(data);
  }

  async getContract(id: string) {
    const data = check(await this.client.from('manuscript_contracts').select('*').eq('id', id).maybeSingle(), 'manuscript_contracts');
    return data ? toContract(data) : null;
  }

  async listContracts(filter: ManuscriptContractFilter) {
    let query = this.client.from('manuscript_contracts').select('*');
    if (filter.authorId) query = query.eq('author_id', filter.authorId);
    if (filter.bookId) query = query.eq('book_id', filter.bookId);
    if (filter.statuses) query = query.in('status', filter.statuses);
    if (filter.revertOnOrBefore) query = query.lte('rights_revert_at', filter.revertOnOrBefore);
    const data = check(await query.order('signed_at', { ascending: false }).order('created_at', { ascending: false }), 'manuscript_contracts');
    return (data ?? []).map(toContract);
  }

  async updateContract(id: string, patch: ManuscriptContractPatch, fromStatuses?: ManuscriptContractStatus[]) {
    let query = this.client.from('manuscript_contracts').update(contractRow(patch)).eq('id', id);
    if (fromStatuses) query = query.in('status', fromStatuses);
    const data = check(await query.select('*').maybeSingle(), 'manuscript_contracts update');
    return data ? toContract(data) : null;
  }

  async createPayment(row: NewManuscriptPayment) {
    const data = check(await this.client.from('manuscript_payments').insert(paymentRow(row)).select('*').single(), 'manuscript_payments insert');
    return toPayment(data);
  }

  async getPayment(id: string) {
    const data = check(await this.client.from('manuscript_payments').select('*').eq('id', id).maybeSingle(), 'manuscript_payments');
    return data ? toPayment(data) : null;
  }

  async listPayments(filter: ManuscriptPaymentFilter) {
    if (filter.contractIds && filter.contractIds.length === 0) return [];
    let query = this.client.from('manuscript_payments').select('*');
    if (filter.contractIds) query = query.in('contract_id', filter.contractIds);
    if (filter.unpaid) query = query.is('paid_at', null);
    if (filter.dueOnOrBefore) query = query.lte('due_date', filter.dueOnOrBefore);
    const data = check(await query.order('due_date', { ascending: true }).order('sequence', { ascending: true }), 'manuscript_payments');
    return (data ?? []).map(toPayment);
  }

  async updatePayment(id: string, patch: ManuscriptPaymentPatch, options: { onlyUnpaid?: boolean } = {}) {
    let query = this.client.from('manuscript_payments').update(paymentRow(patch)).eq('id', id);
    if (options.onlyUnpaid) query = query.is('paid_at', null);
    const data = check(await query.select('*').maybeSingle(), 'manuscript_payments update');
    return data ? toPayment(data) : null;
  }
}
