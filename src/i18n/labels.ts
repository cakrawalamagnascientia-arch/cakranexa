import type { BookCategory } from '../types';

/**
 * Nilai kategori (Bahasa Indonesia) tetap dipakai sebagai kunci data, filter, dan URL.
 * Hanya label tampilannya yang diterjemahkan, lewat catalog:categories.<kunci>.
 */
export const CATEGORY_KEYS = {
  Perpajakan: 'taxation',
  Akuntansi: 'accounting',
  Hukum: 'law',
  'Ekonomi & Bisnis': 'economicsBusiness',
  Filsafat: 'philosophy',
  Teologia: 'theology'
} as const satisfies Record<BookCategory, string>;

export type CategoryKey = (typeof CATEGORY_KEYS)[BookCategory];

export const categoryKey = (category: string): CategoryKey | undefined =>
  CATEGORY_KEYS[category as BookCategory];

/**
 * Badge buku (teks Indonesia di data) -> kunci book:badges.<kunci>.
 * Badge lain yang ditulis admin ditampilkan apa adanya.
 */
export const BADGE_KEYS = {
  'Segera Terbit': 'forthcoming',
  'Trilogi PPN Digital': 'vatTrilogy',
  'Pajak Internasional': 'internationalTax',
  'Audit & Perpajakan': 'auditTaxation',
  'Hukum Pajak Digital': 'digitalTaxLaw',
  'Hukum Pidana Pajak': 'taxCriminalLaw',
  'Hukum Pidana Korporasi': 'corporateCriminalLaw',
  'Restorative Justice': 'restorativeJustice',
  'Buku Teks': 'textbook',
  'Pajak Korporasi': 'corporateTax',
  Teologia: 'theology',
  'Karya Ilmiah': 'scholarlyWork'
} as const;

export type BadgeKey = (typeof BADGE_KEYS)[keyof typeof BADGE_KEYS];

export const badgeKey = (badge: string | undefined): BadgeKey | undefined =>
  badge ? BADGE_KEYS[badge.trim() as keyof typeof BADGE_KEYS] : undefined;
