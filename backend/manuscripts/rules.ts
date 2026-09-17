import {
  MANUSCRIPT_RIGHT_KEYS,
  type ManuscriptContract,
  type ManuscriptPayment,
  type ManuscriptPaymentKind,
  type ManuscriptPaymentSummary,
  type ManuscriptRights
} from './types';

/**
 * Aturan kontrak jual putus (fase 5R): jangka waktu paling lama 25 tahun sejak tanggal kontrak, setelah itu hak kembali
 * ke penulis (UU 28/2014 Pasal 18). Validasi input admin dan ringkasan jadwal honor. Tanpa I/O.
 */

export const MAX_TERM_YEARS = 25;
const MAX_RUPIAH = 1_000_000_000_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOOK_ID_RE = /^[A-Za-z0-9_-]{1,50}$/;
const CONTRACT_NUMBER_RE = /^[A-Z0-9][A-Z0-9/._-]{2,39}$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** Tanggal kalender valid YYYY-MM-DD. */
export const isIsoDate = (value: unknown): value is string => {
  const match = typeof value === 'string' ? DATE_RE.exec(value) : null;
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** Tambah tahun seperti Postgres `date + interval 'n years'`: 29 Februari -> 28 Februari di tahun non-kabisat. */
export const addYears = (date: string, years: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const year = y + years;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${pad(m)}-${pad(Math.min(d, lastDay))}`;
};

/** Tanggal hak kembali ke penulis = tanggal kontrak + jangka waktu (paling lama 25 tahun). */
export const computeRightsRevertAt = (signedAt: string, termYears: number): string =>
  addYears(signedAt, Math.min(termYears, MAX_TERM_YEARS));

/** Tanggal kalender WIB (UTC+7). */
export const wibToday = (now: Date): string => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

const text = (value: unknown, max: number): string | null => {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, max) : null;
};

const rupiah = (value: unknown, min: number): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= MAX_RUPIAH ? n : null;
};

export interface ContractInput {
  contractNumber: string;
  authorId: string;
  bookId: string | null;
  rights: ManuscriptRights;
  signedAt: string;
  termYears: number;
  rightsRevertAt: string;
  honorTotal: number;
  revisionFeePerEdition: number;
  notes: string | null;
}

/** Validasi form kontrak admin. rightsRevertAt selalu dihitung server, nilai dari browser diabaikan. */
export const validateContractInput = (input: unknown): { value: ContractInput } | { error: string } => {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  if (raw.contractType !== undefined && raw.contractType !== 'jual_putus') return { error: 'Jenis kontrak hanya jual putus.' };
  const contractNumber = String(raw.contractNumber ?? '').trim().toUpperCase();
  if (!CONTRACT_NUMBER_RE.test(contractNumber)) return { error: 'Nomor kontrak wajib diisi (3–40 karakter: huruf, angka, / . _ -).' };
  const authorId = String(raw.authorId ?? '').trim();
  if (!UUID_RE.test(authorId)) return { error: 'Pilih penulis.' };
  const bookId = raw.bookId === null || raw.bookId === undefined || raw.bookId === '' ? null : String(raw.bookId).trim();
  if (bookId !== null && !BOOK_ID_RE.test(bookId)) return { error: 'Judul buku tidak valid.' };

  const rightsRaw = (raw.rights && typeof raw.rights === 'object' ? raw.rights : {}) as Record<string, unknown>;
  const rights = Object.fromEntries(MANUSCRIPT_RIGHT_KEYS.map((key) => [key, rightsRaw[key] === true])) as ManuscriptRights;
  if (!MANUSCRIPT_RIGHT_KEYS.some((key) => rights[key])) return { error: 'Pilih minimal satu hak yang dialihkan.' };

  if (!isIsoDate(raw.signedAt)) return { error: 'Tanggal kontrak tidak valid (YYYY-MM-DD).' };
  const termYears = raw.termYears === undefined || raw.termYears === null || raw.termYears === '' ? MAX_TERM_YEARS : Number(raw.termYears);
  if (!Number.isInteger(termYears) || termYears < 1 || termYears > MAX_TERM_YEARS) {
    return { error: `Jangka waktu kontrak 1–${MAX_TERM_YEARS} tahun (UU 28/2014 Pasal 18).` };
  }
  const honorTotal = rupiah(raw.honorTotal, 0);
  if (honorTotal === null) return { error: 'Honor jual putus harus angka bulat Rupiah.' };
  const revisionFeePerEdition = rupiah(raw.revisionFeePerEdition ?? 0, 0);
  if (revisionFeePerEdition === null) return { error: 'Honor revisi per edisi harus angka bulat Rupiah.' };

  return {
    value: {
      contractNumber,
      authorId,
      bookId,
      rights,
      signedAt: raw.signedAt,
      termYears,
      rightsRevertAt: computeRightsRevertAt(raw.signedAt, termYears),
      honorTotal,
      revisionFeePerEdition,
      notes: text(raw.notes, 2000)
    }
  };
};

export interface PaymentInput {
  stage: string;
  kind: ManuscriptPaymentKind;
  edition: number | null;
  amount: number;
  dueDate: string;
  notes: string | null;
}

export const validatePaymentInput = (input: unknown): { value: PaymentInput } | { error: string } => {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const stage = text(raw.stage, 120);
  if (!stage) return { error: 'Nama tahap pembayaran wajib diisi.' };
  const kind = (raw.kind ?? 'honor') as ManuscriptPaymentKind;
  if (kind !== 'honor' && kind !== 'revision') return { error: 'Jenis pembayaran tidak dikenal.' };
  let edition: number | null = null;
  if (kind === 'revision') {
    edition = Number(raw.edition);
    if (!Number.isInteger(edition) || edition < 2 || edition > 99) return { error: 'Honor revisi wajib mencantumkan edisi (2–99).' };
  }
  const amount = rupiah(raw.amount, 1);
  if (amount === null) return { error: 'Jumlah pembayaran harus angka bulat Rupiah lebih dari 0.' };
  if (!isIsoDate(raw.dueDate)) return { error: 'Tanggal jatuh tempo tidak valid (YYYY-MM-DD).' };
  return { value: { stage, kind, edition, amount, dueDate: raw.dueDate, notes: text(raw.notes, 1000) } };
};

const sum = (payments: ManuscriptPayment[]) => payments.reduce((total, p) => total + p.amount, 0);

/** Ringkasan jadwal honor satu kontrak; `today` = tanggal WIB. */
export const summarizePayments = (
  contract: Pick<ManuscriptContract, 'honorTotal'>,
  payments: ManuscriptPayment[],
  today: string
): ManuscriptPaymentSummary => {
  const honor = payments.filter((p) => p.kind === 'honor');
  const revision = payments.filter((p) => p.kind === 'revision');
  const honorScheduled = sum(honor);
  const honorPaid = sum(honor.filter((p) => p.paidAt));
  const unpaid = payments
    .filter((p) => !p.paidAt)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence);
  const next = unpaid[0];
  return {
    honorTotal: contract.honorTotal,
    honorScheduled,
    honorUnscheduled: Math.max(0, contract.honorTotal - honorScheduled),
    honorPaid,
    honorOutstanding: honorScheduled - honorPaid,
    revisionPaid: sum(revision.filter((p) => p.paidAt)),
    revisionOutstanding: sum(revision.filter((p) => !p.paidAt)),
    overdueCount: unpaid.filter((p) => p.dueDate < today).length,
    nextDue: next ? { id: next.id, stage: next.stage, amount: next.amount, dueDate: next.dueDate } : null
  };
};
