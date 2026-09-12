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
