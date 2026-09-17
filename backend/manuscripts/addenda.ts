import { computeRightsRevertAt, isIsoDate, MAX_TERM_YEARS } from './rules';
import { MANUSCRIPT_RIGHT_KEYS, type ManuscriptContract, type ManuscriptRights } from './types';

/**
 * Addendum kontrak naskah (fase 5R Langkah 2): merujuk kontrak induk yang sudah ditandatangani dan mengubah hak,
 * jangka waktu, atau honor tanpa mengedit kontrak induk. Nilai efektif = kontrak induk + addendum urut tanggal
 * (tanggal sama: urut dibuat). Jangka waktu tetap dihitung dari tanggal kontrak induk, paling lama 25 tahun.
 */

export interface AddendumChanges {
  /** Hanya hak yang berubah. */
  rights: Partial<ManuscriptRights>;
  termYears: number | null;
  honorTotal: number | null;
  revisionFeePerEdition: number | null;
}

export interface ManuscriptAddendum {
  id: string;
  contractId: string;
  addendumNumber: string;
  /** YYYY-MM-DD */
  signedAt: string;
  changes: AddendumChanges;
  description: string;
  filePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewManuscriptAddendum = Omit<ManuscriptAddendum, 'id' | 'createdAt' | 'updatedAt'>;

export interface EffectiveTerms {
  rights: ManuscriptRights;
  termYears: number;
  rightsRevertAt: string;
  honorTotal: number;
  revisionFeePerEdition: number;
  /** Nomor addendum yang diterapkan, urut tanggal. */
  addenda: string[];
}

const NUMBER_RE = /^[A-Z0-9][A-Z0-9/._-]{2,39}$/;
const MAX_RUPIAH = 1_000_000_000_000;

const byDate = (a: ManuscriptAddendum, b: ManuscriptAddendum) =>
  a.signedAt.localeCompare(b.signedAt) || a.createdAt.localeCompare(b.createdAt);

export const effectiveTerms = (
  contract: Pick<ManuscriptContract, 'id' | 'rights' | 'signedAt' | 'termYears' | 'honorTotal' | 'revisionFeePerEdition'>,
  addenda: ManuscriptAddendum[]
): EffectiveTerms => {
  let rights: ManuscriptRights = { ...contract.rights };
  let termYears = contract.termYears;
  let honorTotal = contract.honorTotal;
  let revisionFeePerEdition = contract.revisionFeePerEdition;
  const applied: string[] = [];
  for (const addendum of addenda.filter((a) => a.contractId === contract.id).sort(byDate)) {
    rights = { ...rights, ...addendum.changes.rights };
    if (addendum.changes.termYears !== null) termYears = addendum.changes.termYears;
    if (addendum.changes.honorTotal !== null) honorTotal = addendum.changes.honorTotal;
    if (addendum.changes.revisionFeePerEdition !== null) revisionFeePerEdition = addendum.changes.revisionFeePerEdition;
    applied.push(addendum.addendumNumber);
  }
  return {
    rights,
    termYears,
    rightsRevertAt: computeRightsRevertAt(contract.signedAt, termYears),
    honorTotal,
    revisionFeePerEdition,
    addenda: applied
  };
};

const optionalRupiah = (value: unknown): number | null | 'invalid' => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_RUPIAH ? n : 'invalid';
};

export interface AddendumInput {
  addendumNumber: string;
  signedAt: string;
  changes: AddendumChanges;
  description: string;
}

/** Validasi form addendum. Hanya perubahan yang berbeda dari nilai efektif saat ini yang dicatat. */
export const validateAddendumInput = (
  input: unknown,
  contract: Pick<ManuscriptContract, 'signedAt'>,
  current: EffectiveTerms
): { value: AddendumInput } | { error: string } => {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const addendumNumber = String(raw.addendumNumber ?? '').trim().toUpperCase();
  if (!NUMBER_RE.test(addendumNumber)) return { error: 'Nomor addendum wajib diisi (3–40 karakter: huruf, angka, / . _ -).' };
  if (!isIsoDate(raw.signedAt)) return { error: 'Tanggal addendum tidak valid (YYYY-MM-DD).' };
  if (raw.signedAt < contract.signedAt) return { error: 'Tanggal addendum tidak boleh sebelum tanggal kontrak induk.' };
  const description = String(raw.description ?? '').trim().slice(0, 2000);
  if (!description) return { error: 'Uraian perubahan wajib diisi.' };

  const rightsRaw = (raw.rights && typeof raw.rights === 'object' ? raw.rights : {}) as Record<string, unknown>;
  const rights: Partial<ManuscriptRights> = {};
  for (const key of MANUSCRIPT_RIGHT_KEYS) {
    if (typeof rightsRaw[key] === 'boolean' && rightsRaw[key] !== current.rights[key]) rights[key] = rightsRaw[key] as boolean;
  }

  let termYears: number | null = null;
  if (raw.termYears !== undefined && raw.termYears !== null && raw.termYears !== '') {
    const n = Number(raw.termYears);
    if (!Number.isInteger(n) || n < 1 || n > MAX_TERM_YEARS) return { error: `Jangka waktu 1–${MAX_TERM_YEARS} tahun sejak tanggal kontrak induk (UU 28/2014 Pasal 18).` };
    if (n !== current.termYears) termYears = n;
  }
  const honor = optionalRupiah(raw.honorTotal);
  if (honor === 'invalid') return { error: 'Honor jual putus harus angka bulat Rupiah.' };
  const fee = optionalRupiah(raw.revisionFeePerEdition);
  if (fee === 'invalid') return { error: 'Honor revisi per edisi harus angka bulat Rupiah.' };
  const honorTotal = honor !== null && honor !== current.honorTotal ? honor : null;
  const revisionFeePerEdition = fee !== null && fee !== current.revisionFeePerEdition ? fee : null;

  if (Object.keys(rights).length === 0 && termYears === null && honorTotal === null && revisionFeePerEdition === null) {
    return { error: 'Addendum harus mengubah minimal satu hal: hak, jangka waktu, atau honor.' };
  }
  const nextRights = { ...current.rights, ...rights };
  if (!MANUSCRIPT_RIGHT_KEYS.some((key) => nextRights[key])) return { error: 'Setelah addendum, minimal satu hak harus tetap dialihkan.' };

  return { value: { addendumNumber, signedAt: raw.signedAt, description, changes: { rights, termYears, honorTotal, revisionFeePerEdition } } };
};
