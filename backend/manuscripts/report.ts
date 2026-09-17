import { toCsv } from '../digital/membership/admin';
import { MANUSCRIPT_RIGHT_KEYS, type ManuscriptContract, type ManuscriptPayment } from './types';
import type { EffectiveTerms } from './addenda';

/**
 * Laporan biaya naskah per judul dan ekspor CSV (fase 5R Langkah 2). Biaya = honor jual putus efektif (setelah
 * addendum) + honor revisi. Kontrak yang diakhiri hanya menyumbang yang sudah dibayar. CSV aman dibuka di spreadsheet
 * (toCsv mencegah formula injection).
 */

export interface ReportEntry {
  contract: ManuscriptContract;
  effective: EffectiveTerms;
  payments: ManuscriptPayment[];
}

export interface TitleCostRow {
  bookId: string | null;
  bookTitle: string;
  contracts: number;
  honorCommitted: number;
  honorPaid: number;
  honorOutstanding: number;
  revisionPaid: number;
  revisionOutstanding: number;
  totalPaid: number;
}

const sum = (payments: ManuscriptPayment[]) => payments.reduce((total, p) => total + p.amount, 0);

export const costReport = (entries: ReportEntry[], bookTitle: (bookId: string | null) => string): TitleCostRow[] => {
  const rows = new Map<string, TitleCostRow>();
  for (const { contract, effective, payments } of entries) {
    const key = contract.bookId ?? '';
    const row = rows.get(key) ?? {
      bookId: contract.bookId,
      bookTitle: bookTitle(contract.bookId),
      contracts: 0,
      honorCommitted: 0,
      honorPaid: 0,
      honorOutstanding: 0,
      revisionPaid: 0,
      revisionOutstanding: 0,
      totalPaid: 0
    };
    const terminated = contract.status === 'terminated';
    const honorPaid = sum(payments.filter((p) => p.kind === 'honor' && p.paidAt));
    const revisionPaid = sum(payments.filter((p) => p.kind === 'revision' && p.paidAt));
    row.contracts += 1;
    row.honorCommitted += terminated ? honorPaid : effective.honorTotal;
    row.honorPaid += honorPaid;
    row.revisionPaid += revisionPaid;
    row.revisionOutstanding += terminated ? 0 : sum(payments.filter((p) => p.kind === 'revision' && !p.paidAt));
    row.honorOutstanding = row.honorCommitted - row.honorPaid;
    row.totalPaid = row.honorPaid + row.revisionPaid;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.bookTitle.localeCompare(b.bookTitle, 'id'));
};

const STATUS_LABEL: Record<string, string> = { draft: 'Draf', signed: 'Ditandatangani', terminated: 'Diakhiri' };
const RIGHT_LABEL: Record<string, string> = { print: 'cetak', ebook: 'ebook', audiobook: 'audiobook', translation: 'terjemahan', derivative: 'turunan' };

export const reportCsv = (rows: TitleCostRow[]) => toCsv(
  ['ID Buku', 'Judul', 'Jumlah Kontrak', 'Honor Jual Putus (Rp)', 'Honor Dibayar (Rp)', 'Honor Belum Dibayar (Rp)', 'Honor Revisi Dibayar (Rp)', 'Honor Revisi Terjadwal (Rp)', 'Total Dibayar (Rp)'],
  rows.map((r) => [r.bookId ?? '', r.bookTitle, r.contracts, r.honorCommitted, r.honorPaid, r.honorOutstanding, r.revisionPaid, r.revisionOutstanding, r.totalPaid])
);

export const contractsCsv = (entries: ReportEntry[], authorName: (id: string) => string, bookTitle: (id: string | null) => string) => toCsv(
  ['Nomor Kontrak', 'Status', 'Penulis', 'ID Buku', 'Judul', 'Tanggal Kontrak', 'Jangka Waktu (tahun)', 'Hak Kembali', 'Hak Dialihkan',
    'Honor Jual Putus (Rp)', 'Honor Revisi per Edisi (Rp)', 'Addendum', 'Honor Dibayar (Rp)', 'Catatan'],
  entries.map(({ contract, effective, payments }) => [
    contract.contractNumber,
    STATUS_LABEL[contract.status] ?? contract.status,
    authorName(contract.authorId),
    contract.bookId ?? '',
    bookTitle(contract.bookId),
    contract.signedAt,
    effective.termYears,
    effective.rightsRevertAt,
    MANUSCRIPT_RIGHT_KEYS.filter((key) => effective.rights[key]).map((key) => RIGHT_LABEL[key]).join('; '),
    effective.honorTotal,
    effective.revisionFeePerEdition,
    effective.addenda.join('; '),
    sum(payments.filter((p) => p.kind === 'honor' && p.paidAt)),
    contract.notes ?? ''
  ])
);

export const paymentsCsv = (entries: ReportEntry[], authorName: (id: string) => string, bookTitle: (id: string | null) => string) => toCsv(
  ['Nomor Kontrak', 'Penulis', 'Judul', 'Urutan', 'Tahap', 'Jenis', 'Edisi', 'Jumlah (Rp)', 'Jatuh Tempo', 'Tanggal Bayar', 'Referensi', 'Bukti Bayar', 'Bukti Potong Pajak'],
  entries.flatMap(({ contract, payments }) => payments.map((p) => [
    contract.contractNumber,
    authorName(contract.authorId),
    bookTitle(contract.bookId),
    p.sequence,
    p.stage,
    p.kind === 'honor' ? 'Honor' : 'Honor revisi',
    p.edition ?? '',
    p.amount,
    p.dueDate,
    p.paidAt ?? '',
    p.paymentReference ?? '',
    p.paymentProofPath ? 'ada' : '',
    p.taxSlipPath ? 'ada' : ''
  ]))
);
