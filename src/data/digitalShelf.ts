import type { DigitalProduct } from '../types';
import type { PlanCode, PublicPlan } from '../services/membershipApi';

/**
 * Aturan tampilan rak digital fase 6 (beranda /digital, kartu buku, "Segera masuk rak"). Sama dengan aturan server
 * (backend/digital/membership/quota.ts): judul terbuka untuk paket pada shelf_entry_date + frontlist_days.
 */

export type ShelfPlanCode = 'silver' | 'gold' | 'platinum';
/** Paket berbayar dari yang paling lama menunggu judul baru ke yang paling cepat. */
export const SHELF_PLAN_ORDER: ShelfPlanCode[] = ['silver', 'gold', 'platinum'];
/** Cadangan bila daftar paket belum dimuat (skema terkunci fase 6). */
export const DEFAULT_FRONTLIST_DAYS: Record<ShelfPlanCode, number> = { silver: 90, gold: 45, platinum: 0 };
/** Judul yang masuk rak dalam rentang ini tampil di "Baru masuk rak". */
export const NEW_ARRIVAL_DAYS = 60;

const DAY_MS = 86_400_000;

/** Tanggal kalender Jakarta (YYYY-MM-DD). */
export const jakartaToday = (now: Date = new Date()): string => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export const addDaysToDate = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);

/** Hari frontlist per paket dari data paket server (cadangan: angka skema terkunci). */
export const frontlistDaysByPlan = (plans: Pick<PublicPlan, 'code' | 'frontlistDays'>[]): Record<ShelfPlanCode, number> => {
  const result = { ...DEFAULT_FRONTLIST_DAYS };
  for (const code of SHELF_PLAN_ORDER) {
    const days = plans.find((p) => p.code === code)?.frontlistDays;
    if (typeof days === 'number') result[code] = days;
  }
  return result;
};

/** Tanggal buka judul untuk paket dengan frontlist_days ini; null bila judul belum punya tanggal rak. */
export const openDateFor = (product: Pick<DigitalProduct, 'shelfEntryDate'>, frontlistDays: number): string | null =>
  product.shelfEntryDate ? addDaysToDate(product.shelfEntryDate, frontlistDays) : null;

/** Judul sudah bisa dibaca/didengar lewat rak (tersedia dan punya tanggal masuk rak). */
export const isShelfTitle = (product: Pick<DigitalProduct, 'availabilityStatus' | 'shelfEntryDate' | 'isActive'>): boolean =>
  product.isActive && product.availabilityStatus === 'available' && product.shelfEntryDate !== null;

export type InclusionBadge = { kind: 'plan'; plan: ShelfPlanCode } | { kind: 'sample' } | { kind: 'soon'; date: string | null };

/**
 * Badge kartu: paket termurah yang sudah membuka judul hari ini ("Termasuk Silver/Gold/Platinum"), "Sampel" bila judul
 * belum terbuka untuk paket mana pun tetapi punya sampel, selain itu "Segera" (dengan tanggal buka Platinum bila ada).
 */
export const inclusionBadge = (
  product: Pick<DigitalProduct, 'availabilityStatus' | 'shelfEntryDate' | 'isActive' | 'format' | 'sampleAudioUrl'>,
  today: string,
  frontlist: Record<ShelfPlanCode, number>
): InclusionBadge => {
  if (isShelfTitle(product)) {
    const plan = SHELF_PLAN_ORDER.find((code) => (openDateFor(product, frontlist[code]) ?? '9999') <= today);
    if (plan) return { kind: 'plan', plan };
  }
  const hasSample = product.availabilityStatus === 'available' && (product.format === 'ebook' || Boolean(product.sampleAudioUrl));
  if (hasSample) return { kind: 'sample' };
  return { kind: 'soon', date: product.shelfEntryDate };
};

/** Frontlist paket pengguna: paket aktif (Silver/Gold/Platinum); pengunjung/Blue memakai Platinum (tanggal paling awal). */
export const viewerFrontlistDays = (planCode: PlanCode | null | undefined, frontlist: Record<ShelfPlanCode, number>): { plan: ShelfPlanCode; days: number } => {
  const plan: ShelfPlanCode = planCode === 'silver' || planCode === 'gold' || planCode === 'platinum' ? planCode : 'platinum';
  return { plan, days: frontlist[plan] };
};

interface ShelfProduct extends Pick<DigitalProduct, 'id' | 'availabilityStatus' | 'shelfEntryDate' | 'isActive'> {}

/** "Baru masuk rak": masuk rak dalam NEW_ARRIVAL_DAYS terakhir (tanggal rak ≤ hari ini), terbaru dulu. */
export const newArrivals = <T extends { product: ShelfProduct }>(entries: T[], today: string, days = NEW_ARRIVAL_DAYS): T[] =>
  entries
    .filter(({ product }) => isShelfTitle(product) && product.shelfEntryDate! <= today && daysBetween(product.shelfEntryDate!, today) <= days)
    .sort((a, b) => b.product.shelfEntryDate!.localeCompare(a.product.shelfEntryDate!) || a.product.id.localeCompare(b.product.id));

/** "Segera masuk rak": judul yang tanggal bukanya untuk paket pengguna masih di depan, terdekat dulu. */
export const comingSoon = <T extends { product: ShelfProduct }>(entries: T[], today: string, frontlistDays: number): Array<T & { openDate: string }> =>
  entries
    .flatMap((entry) => {
      const openDate = entry.product.isActive && entry.product.shelfEntryDate ? openDateFor(entry.product, frontlistDays) : null;
      return openDate && openDate > today ? [{ ...entry, openDate }] : [];
    })
    .sort((a, b) => a.openDate.localeCompare(b.openDate) || a.product.id.localeCompare(b.product.id));

/** Judul populer menurut urutan server; judul yang tidak dikenal katalog diabaikan. */
export const popularEntries = <T extends { product: { id: string } }>(entries: T[], productIds: string[]): T[] =>
  productIds.flatMap((id) => entries.filter((entry) => entry.product.id === id));

/** Rak per kategori: kategori berisi judul rak, urutan kategori mengikuti daftar yang diberikan. */
export const categoryShelves = <T extends { product: ShelfProduct; book: { category: string } }>(entries: T[], categories: string[]): Array<{ category: string; items: T[] }> =>
  categories
    .map((category) => ({ category, items: entries.filter((entry) => entry.book.category === category && isShelfTitle(entry.product)) }))
    .filter((shelf) => shelf.items.length > 0);
