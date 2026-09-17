import { ApiError, apiUrl, fetchWithTimeout } from './apiClient';
import { clearAdminToken, getAdminToken } from './adminAuth';
import type { AuthorAccount, AuthorLinkLog } from '../../backend/manuscripts/adminStore';
import type { ManuscriptAddendum } from '../../backend/manuscripts/addenda';
import type { ContractView } from '../../backend/manuscripts/adminService';
import type { ImportPreview } from '../../backend/manuscripts/csvImport';
import type { ReminderItem } from '../../backend/manuscripts/reminders';
import type { TitleCostRow } from '../../backend/manuscripts/report';
import type { ManuscriptContract, ManuscriptContractStatus, ManuscriptPayment } from '../../backend/manuscripts/types';

/** Klien admin kontrak naskah fase 5R (backend/manuscripts/adminRouter.ts). */

export type {
  AuthorAccount,
  AuthorLinkLog,
  ContractView,
  ImportPreview,
  ManuscriptAddendum,
  ManuscriptContract,
  ManuscriptPayment,
  ReminderItem,
  TitleCostRow
};

export interface ManuscriptOptions {
  authors: Array<{ id: string; name: string; email: string | null }>;
  books: Array<{ id: string; title: string; isbn: string }>;
}

export interface ContractDetail extends ContractView {
  payments: ManuscriptPayment[];
  addenda: ManuscriptAddendum[];
}

/** Impor ditolak: pratinjau terbaru dikirim bersama pesan kesalahan. */
export class ImportRejectedError extends ApiError {
  constructor(message: string, status: number, readonly preview: ImportPreview) {
    super(message, status);
  }
}

const BASE = '/api/admin/manuscripts';
const TIMEOUT_MS = 60000;

const headers = (json = true): Record<string, string> => {
  const token = getAdminToken();
  return {
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

const fail = async (res: Response): Promise<never> => {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // bukan JSON
  }
  if (res.status === 401) clearAdminToken();
  const message = body?.error || `HTTP ${res.status}`;
  if (body?.preview) throw new ImportRejectedError(message, res.status, body.preview);
  throw new ApiError(message, res.status);
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetchWithTimeout(apiUrl(`${BASE}${path}`), { ...init, headers: { ...headers(!(init.body instanceof FormData)), ...(init.headers || {}) } }, TIMEOUT_MS);
  if (!res.ok) await fail(res);
  return res.json() as Promise<T>;
};

const send = <T>(path: string, method: 'POST' | 'PATCH', body?: unknown) =>
  request<T>(path, { method, body: JSON.stringify(body ?? {}) });

const upload = <T>(path: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return request<T>(path, { method: 'POST', body: form });
};

const blob = async (path: string): Promise<Blob> => {
  const res = await fetchWithTimeout(apiUrl(`${BASE}${path}`), { headers: headers(false) }, TIMEOUT_MS);
  if (!res.ok) await fail(res);
  return res.blob();
};

const id = (value: string) => encodeURIComponent(value);

export const manuscriptAdminApi = {
  options: () => request<ManuscriptOptions>('/options'),
  listContracts: (filter: { authorId?: string; bookId?: string; status?: ManuscriptContractStatus | '' } = {}) => {
    const query = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as Array<[string, string]>).toString();
    return request<{ contracts: ContractView[] }>(`/contracts${query ? `?${query}` : ''}`).then((r) => r.contracts);
  },
  getContract: (contractId: string) => request<ContractDetail>(`/contracts/${id(contractId)}`),
  createContract: (input: Record<string, unknown>) => send<{ contract: ManuscriptContract }>('/contracts', 'POST', input).then((r) => r.contract),
  updateContract: (contractId: string, input: Record<string, unknown>) => send<{ contract: ManuscriptContract }>(`/contracts/${id(contractId)}`, 'PATCH', input).then((r) => r.contract),
  signContract: (contractId: string) => send<{ contract: ManuscriptContract }>(`/contracts/${id(contractId)}/sign`, 'POST'),
  terminateContract: (contractId: string, reason: string) => send(`/contracts/${id(contractId)}/terminate`, 'POST', { reason }),
  uploadContractFile: (contractId: string, file: File) => upload(`/contracts/${id(contractId)}/file`, file),

  addPayment: (contractId: string, input: Record<string, unknown>) => send(`/contracts/${id(contractId)}/payments`, 'POST', input),
  updatePayment: (paymentId: string, input: Record<string, unknown>) => send(`/payments/${id(paymentId)}`, 'PATCH', input),
  markPaid: (paymentId: string, input: { paidAt?: string; reference?: string }) => send(`/payments/${id(paymentId)}/paid`, 'POST', input),
  uploadPaymentFile: (paymentId: string, kind: 'proof' | 'tax_slip', file: File) => upload(`/payments/${id(paymentId)}/files/${kind}`, file),

  addAddendum: (contractId: string, input: Record<string, unknown>) => send<{ addendum: ManuscriptAddendum }>(`/contracts/${id(contractId)}/addenda`, 'POST', input).then((r) => r.addendum),
  uploadAddendumFile: (addendumId: string, file: File) => upload(`/addenda/${id(addendumId)}/file`, file),

  /** Dokumen bucket privat sebagai URL blob sementara. */
  fileUrl: async (kind: 'contract' | 'addendum' | 'proof' | 'tax_slip', refId: string) => URL.createObjectURL(await blob(`/files/${kind}/${id(refId)}`)),

  reminders: () => request<{ reminders: ReminderItem[] }>('/reminders').then((r) => r.reminders),
  runReminders: () => send<{ items: number; sent: number }>('/jobs/reminders', 'POST'),
  report: () => request<{ rows: TitleCostRow[] }>('/report').then((r) => r.rows),
  exportCsv: (type: 'contracts' | 'payments' | 'report') => blob(`/export/${type}.csv`),

  importPreview: (csv: string) => send<{ preview: ImportPreview }>('/import/preview', 'POST', { csv }).then((r) => r.preview),
  importCommit: (csv: string) => send<{ created: string[] }>('/import/commit', 'POST', { csv }),

  authors: () => request<{ authors: AuthorAccount[] }>('/authors').then((r) => r.authors),
  authorLinks: (authorId: string) => request<{ links: AuthorLinkLog[] }>(`/authors/${id(authorId)}/links`).then((r) => r.links),
  linkAuthor: (authorId: string, input: { email?: string; userId?: string }) => send<{ author: AuthorAccount }>(`/authors/${id(authorId)}/link`, 'POST', input),
  unlinkAuthor: (authorId: string) => send<{ author: AuthorAccount }>(`/authors/${id(authorId)}/unlink`, 'POST')
};
