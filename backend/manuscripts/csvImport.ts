import { isIsoDate, validateContractInput, type ContractInput } from './rules';
import { MANUSCRIPT_RIGHT_KEYS, type ManuscriptContract, type ManuscriptRightKey } from './types';

/**
 * Impor kontrak lama dari CSV (fase 5R Langkah 2): pratinjau dulu, simpan hanya bila semua baris valid. Satu baris =
 * satu kontrak yang sudah ditandatangani. Kolom (nama tidak peka huruf besar/kecil; pemisah koma atau titik koma):
 *   nomor_kontrak*, penulis* (ID, email, atau nama persis), buku (ID, slug, ISBN, atau judul persis; kosong = belum
 *   masuk katalog), tanggal_kontrak* (YYYY-MM-DD atau DD/MM/YYYY), jangka_tahun (bawaan 25), hak_cetak, hak_ebook,
 *   hak_audiobook, hak_terjemahan, hak_turunan (ya/tidak; bawaan: cetak, ebook, audiobook = ya), honor_total*,
 *   honor_revisi_per_edisi, honor_dibayar_tanggal (kosong = honor belum dibayar), catatan.
 * Honor dicatat sebagai satu tahap "Honor jual putus (impor kontrak lama)" dengan jatuh tempo = tanggal kontrak.
 */

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_STAGE = 'Honor jual putus (impor kontrak lama)';

export interface ImportAuthor {
  id: string;
  name: string;
  email: string | null;
}

export interface ImportBook {
  id: string;
  slug: string;
  title: string;
  isbn: string;
}

export interface ImportRowPreview {
  /** Nomor baris di file (header = 1). */
  line: number;
  contract: ContractInput | null;
  authorName: string | null;
  bookTitle: string | null;
  honorPaidAt: string | null;
  errors: string[];
  warnings: string[];
}

export interface ImportPreview {
  rows: ImportRowPreview[];
  total: number;
  valid: number;
  invalid: number;
  /** Kesalahan tingkat file (header, jumlah baris). */
  fileErrors: string[];
}

/** CSV RFC 4180 sederhana: tanda kutip ganda, pemisah koma/titik koma (dideteksi dari header), BOM diabaikan. */
export const parseCsv = (input: string): string[][] => {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"' && cell === '') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ''));
};

const norm = (value: unknown) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY" -> YYYY-MM-DD; null bila tidak valid. */
export const parseDate = (value: string): string | null => {
  const s = value.trim();
  if (isIsoDate(s)) return s;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
};

/** "30.000.000", "Rp 30.000.000,00", "30000000" -> 30000000; null bila tidak valid. */
export const parseRupiah = (value: string): number | null => {
  const s = value.replace(/rp\.?/i, '').replace(/\s/g, '');
  if (s === '') return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/.exec(s);
  if (!m || (m[2] && /[1-9]/.test(m[2]))) return null;
  return Number(m[1].replace(/\./g, ''));
};

/** ya/tidak -> boolean; undefined bila kosong; null bila tidak dikenal. */
const parseYesNo = (value: string): boolean | undefined | null => {
  const s = norm(value);
  if (s === '') return undefined;
  if (['ya', 'y', 'yes', 'true', '1', 'x'].includes(s)) return true;
  if (['tidak', 't', 'no', 'n', 'false', '0', '-'].includes(s)) return false;
  return null;
};

const HEADERS: Record<string, string[]> = {
  contractNumber: ['nomor_kontrak', 'no_kontrak', 'nomor kontrak'],
  author: ['penulis', 'author'],
  book: ['buku', 'judul', 'book'],
  signedAt: ['tanggal_kontrak', 'tanggal kontrak'],
  termYears: ['jangka_tahun', 'jangka waktu', 'jangka_waktu'],
  honorTotal: ['honor_total', 'honor', 'honor jual putus'],
  revisionFee: ['honor_revisi_per_edisi', 'honor revisi per edisi'],
  honorPaidAt: ['honor_dibayar_tanggal', 'tanggal bayar honor'],
  notes: ['catatan', 'notes']
};
const RIGHT_HEADERS: Record<ManuscriptRightKey, string> = {
  print: 'hak_cetak',
  ebook: 'hak_ebook',
  audiobook: 'hak_audiobook',
  translation: 'hak_terjemahan',
  derivative: 'hak_turunan'
};
const DEFAULT_RIGHTS: Record<ManuscriptRightKey, boolean> = { print: true, ebook: true, audiobook: true, translation: false, derivative: false };

const resolveAuthor = (value: string, authors: ImportAuthor[]): { author: ImportAuthor } | { error: string } => {
  const key = norm(value);
  if (!key) return { error: 'Kolom penulis kosong.' };
  const matches = UUID_RE.test(value.trim())
    ? authors.filter((a) => a.id === value.trim())
    : key.includes('@')
      ? authors.filter((a) => norm(a.email) === key)
      : authors.filter((a) => norm(a.name) === key);
  if (matches.length === 1) return { author: matches[0] };
  return { error: matches.length === 0 ? `Penulis "${value}" tidak ditemukan.` : `Penulis "${value}" cocok dengan ${matches.length} data; pakai ID atau email.` };
};

const resolveBook = (value: string, books: ImportBook[]): { book: ImportBook | null } | { error: string } => {
  const key = norm(value);
  if (!key) return { book: null };
  const byId = books.filter((b) => b.id === value.trim() || b.slug === key);
  const isbnDigits = digits(value);
  const matches = byId.length > 0
    ? byId
    : isbnDigits.length >= 10 && isbnDigits.length === value.replace(/[\s-]/g, '').length
      ? books.filter((b) => digits(b.isbn) === isbnDigits)
      : books.filter((b) => norm(b.title) === key);
  if (matches.length === 1) return { book: matches[0] };
  return { error: matches.length === 0 ? `Buku "${value}" tidak ditemukan di katalog.` : `Buku "${value}" cocok dengan ${matches.length} judul; pakai ID buku.` };
};

export const previewImport = (csv: string, ctx: {
  authors: ImportAuthor[];
  books: ImportBook[];
  existing: Array<Pick<ManuscriptContract, 'contractNumber' | 'authorId' | 'bookId' | 'status'>>;
  today: string;
}): ImportPreview => {
  const table = parseCsv(csv);
  const fileErrors: string[] = [];
  if (table.length < 2) fileErrors.push('File CSV kosong atau hanya berisi header.');
  const header = (table[0] ?? []).map(norm);
  const column = (names: string[]) => header.findIndex((h) => names.includes(h));
  const index = Object.fromEntries(Object.entries(HEADERS).map(([key, names]) => [key, column(names)])) as Record<keyof typeof HEADERS, number>;
  const rightIndex = Object.fromEntries(MANUSCRIPT_RIGHT_KEYS.map((key) => [key, column([RIGHT_HEADERS[key]])])) as Record<ManuscriptRightKey, number>;
  for (const required of ['contractNumber', 'author', 'signedAt', 'honorTotal'] as const) {
    if (index[required] < 0) fileErrors.push(`Kolom wajib tidak ada: ${HEADERS[required][0]}.`);
  }
  if (table.length - 1 > IMPORT_MAX_ROWS) fileErrors.push(`Maksimal ${IMPORT_MAX_ROWS} baris per impor.`);
  if (fileErrors.length > 0) return { rows: [], total: Math.max(0, table.length - 1), valid: 0, invalid: 0, fileErrors };

  const seenNumbers = new Set(ctx.existing.map((c) => c.contractNumber));
  const seenPairs = new Set(ctx.existing.filter((c) => c.status !== 'terminated' && c.bookId).map((c) => `${c.authorId}|${c.bookId}`));
  const rows: ImportRowPreview[] = table.slice(1).map((cells, i) => {
    const cell = (idx: number) => (idx >= 0 ? String(cells[idx] ?? '').trim() : '');
    const errors: string[] = [];
    const warnings: string[] = [];

    const author = resolveAuthor(cell(index.author), ctx.authors);
    if ('error' in author) errors.push(author.error);
    const book = resolveBook(cell(index.book), ctx.books);
    if ('error' in book) errors.push(book.error);
    if ('book' in book && !book.book) warnings.push('Tanpa judul katalog: kontrak dicatat sebagai naskah belum terbit.');

    const signedAt = parseDate(cell(index.signedAt));
    if (!signedAt) errors.push(`Tanggal kontrak tidak valid: "${cell(index.signedAt)}".`);
    const honorTotal = parseRupiah(cell(index.honorTotal));
    if (honorTotal === null) errors.push(`Honor total tidak valid: "${cell(index.honorTotal)}".`);
    const feeText = cell(index.revisionFee);
    const revisionFee = feeText ? parseRupiah(feeText) : 0;
    if (revisionFee === null) errors.push(`Honor revisi per edisi tidak valid: "${feeText}".`);

    const rights = { ...DEFAULT_RIGHTS };
    for (const key of MANUSCRIPT_RIGHT_KEYS) {
      const parsed = parseYesNo(cell(rightIndex[key]));
      if (parsed === null) errors.push(`Kolom ${RIGHT_HEADERS[key]} harus ya/tidak.`);
      else if (parsed !== undefined) rights[key] = parsed;
    }

    let honorPaidAt: string | null = null;
    const paidText = cell(index.honorPaidAt);
    if (paidText) {
      honorPaidAt = parseDate(paidText);
      if (!honorPaidAt) errors.push(`Tanggal bayar honor tidak valid: "${paidText}".`);
      else if (honorPaidAt > ctx.today) errors.push('Tanggal bayar honor di masa depan.');
      else if (signedAt && honorPaidAt < signedAt) warnings.push('Honor dibayar sebelum tanggal kontrak.');
    } else if ((honorTotal ?? 0) > 0) {
      warnings.push('Honor belum dibayar: tahap honor akan tercatat belum lunas.');
    }

    let contract: ContractInput | null = null;
    if (errors.length === 0) {
      const validated = validateContractInput({
        contractNumber: cell(index.contractNumber),
        authorId: 'author' in author ? author.author.id : '',
        bookId: 'book' in book ? book.book?.id ?? null : null,
        rights,
        signedAt,
        termYears: cell(index.termYears) || undefined,
        honorTotal,
        revisionFeePerEdition: revisionFee,
        notes: cell(index.notes)
      });
      if ('error' in validated) errors.push(validated.error);
      else contract = validated.value;
    }
    if (contract) {
      if (seenNumbers.has(contract.contractNumber)) errors.push(`Nomor kontrak ${contract.contractNumber} sudah ada.`);
      const pair = `${contract.authorId}|${contract.bookId}`;
      if (contract.bookId && seenPairs.has(pair)) errors.push('Penulis sudah punya kontrak aktif untuk judul ini.');
      seenNumbers.add(contract.contractNumber);
      if (contract.bookId) seenPairs.add(pair);
    }
    return {
      line: i + 2,
      contract: errors.length === 0 ? contract : null,
      authorName: 'author' in author ? author.author.name : null,
      bookTitle: 'book' in book ? book.book?.title ?? null : null,
      honorPaidAt,
      errors,
      warnings
    };
  });
  const valid = rows.filter((r) => r.errors.length === 0).length;
  return { rows, total: rows.length, valid, invalid: rows.length - valid, fileErrors };
};
