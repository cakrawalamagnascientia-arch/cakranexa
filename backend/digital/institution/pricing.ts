import { INSTITUTION_CATALOG_PRICE_BANDS, INSTITUTION_PROGRAM, INSTITUTION_TIERS } from '../../../src/data/membership';
import type { InstitutionConfig, InstitutionTierCode, TierRecord } from './types';

/**
 * Harga kontrak institusi (docs/PHASE-4-BRIEF Langkah 2). Fungsi murni: dipakai pratinjau admin, pembuatan kontrak,
 * draf perpanjangan, dan tes. Angka bawaan diturunkan dari src/data/membership.ts (sumber yang sama dengan halaman
 * /institutions dan seed SQL), sehingga tidak ada dua salinan angka tier/skala/Founding/EBA.
 *
 *   harga_skala     = harga_penuh × skala_katalog%
 *   harga_kontrak   = round(harga_skala × (100 − diskon_founding%) / 100)     -> dikunci di kontrak
 *   kredit_EBA      = round(harga_kontrak × eba%)                              -> dikreditkan di akhir periode (Langkah 5)
 *   PPN             = round(harga_kontrak × ppn%)  (ditambahkan di atas harga kontrak pada invoice)
 */

/** Skala harga yang diizinkan CHECK institution_contracts.catalog_scale_pct. */
export const ALLOWED_SCALE_PCTS = [40, 60, 80, 100] as const;

const TIER_KEY: Record<string, InstitutionTierCode> = { starter: 'starter', campus: 'campus', network: 'network', consortium: 'enterprise' };
const CADENCE: Record<string, TierRecord['reportCadence']> = { quarterly: 'quarterly', monthly: 'monthly', monthlyAnalysis: 'monthly_analysis' };

/** Tier bawaan (store memori/tes); produksi membaca tabel institution_tiers yang di-seed dengan angka yang sama. */
export const DEFAULT_TIERS: TierRecord[] = INSTITUTION_TIERS.map((t, index) => {
  const tier = TIER_KEY[t.key];
  return {
    tier,
    name: tier === 'enterprise' ? 'Consortium / Enterprise' : t.key.charAt(0).toUpperCase() + t.key.slice(1),
    concurrentUsers: t.concurrentUsers,
    adminSeats: t.adminAccounts,
    fullPrice: t.annualPrice,
    reportCadence: t.usageReports ? CADENCE[t.usageReports] ?? null : null,
    webinarsPerYear: t.webinarsPerYear,
    printDiscountPct: t.printDiscountPercent,
    bulkOrderMin: t.bulkOrderMin,
    readingListsPerYear: t.readingListsPerYear,
    accountManager: tier === 'network' || tier === 'enterprise',
    sortOrder: index + 1
  };
});

export const DEFAULT_INSTITUTION_CONFIG: InstitutionConfig = {
  ebaPct: INSTITUTION_PROGRAM.acquisitionWalletPercent,
  ebaExpiryDays: 90,
  foundingCap: INSTITUTION_PROGRAM.founding.cap,
  foundingDiscountPct: INSTITUTION_PROGRAM.founding.discountPercent,
  catalogScale: INSTITUTION_CATALOG_PRICE_BANDS.map((band) => ({ minTitles: band.minTitles, pct: band.percent })),
  ppnPct: 0,
  invoiceDueDays: 14,
  graceDays: 14,
  trialDays: 30,
  renewalNoticeDays: [60, 30],
  renewalAdminNoticeDays: 45,
  renewalInvoiceDays: 30,
  renewalVoidDays: 30,
  licensePriceMultiplier: 5,
  licenseConcurrentUsers: 5,
  ipGuestSessionHours: 4
};

/** Kunci tabel institution_config untuk tiap field konfigurasi. */
export const CONFIG_KEYS: Record<keyof InstitutionConfig, string> = {
  ebaPct: 'eba_pct',
  ebaExpiryDays: 'eba_expiry_days',
  foundingCap: 'founding_cap',
  foundingDiscountPct: 'founding_discount_pct',
  catalogScale: 'catalog_scale',
  ppnPct: 'ppn_pct',
  invoiceDueDays: 'invoice_due_days',
  graceDays: 'grace_days',
  trialDays: 'trial_days',
  renewalNoticeDays: 'renewal_notice_days',
  renewalAdminNoticeDays: 'renewal_admin_notice_days',
  renewalInvoiceDays: 'renewal_invoice_days',
  renewalVoidDays: 'renewal_void_days',
  licensePriceMultiplier: 'license_price_multiplier',
  licenseConcurrentUsers: 'license_concurrent_users',
  ipGuestSessionHours: 'ip_guest_session_hours'
};

/** Batas nilai konfigurasi numerik: [min, maks, bilangan bulat?]. */
export const CONFIG_BOUNDS: Record<Exclude<keyof InstitutionConfig, 'catalogScale' | 'renewalNoticeDays'>, [number, number, boolean]> = {
  ebaPct: [0, 100, true],
  ebaExpiryDays: [0, 3650, true],
  foundingCap: [0, 100000, true],
  foundingDiscountPct: [0, 100, true],
  ppnPct: [0, 100, false],
  invoiceDueDays: [1, 365, true],
  graceDays: [0, 365, true],
  trialDays: [1, 365, true],
  renewalAdminNoticeDays: [1, 365, true],
  renewalInvoiceDays: [1, 365, true],
  renewalVoidDays: [1, 365, true],
  licensePriceMultiplier: [0, 100, false],
  licenseConcurrentUsers: [1, 1000, true],
  ipGuestSessionHours: [1, 72, true]
};

const validNumber = (value: unknown, [min, max, integer]: [number, number, boolean]): number | null => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return null;
  if (integer && !Number.isInteger(n)) return null;
  return integer ? n : Math.round(n * 100) / 100;
};

/** Skala katalog valid: pct dari ALLOWED_SCALE_PCTS, harus ada pita minTitles 0. Diurutkan minTitles menurun. */
export const parseCatalogScale = (value: unknown): InstitutionConfig['catalogScale'] | null => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return null;
  const bands: InstitutionConfig['catalogScale'] = [];
  for (const raw of value) {
    const minTitles = Number((raw as any)?.min_titles ?? (raw as any)?.minTitles);
    const pct = Number((raw as any)?.pct);
    if (!Number.isInteger(minTitles) || minTitles < 0 || !(ALLOWED_SCALE_PCTS as readonly number[]).includes(pct)) return null;
    bands.push({ minTitles, pct });
  }
  if (!bands.some((b) => b.minTitles === 0)) return null;
  if (new Set(bands.map((b) => b.minTitles)).size !== bands.length) return null;
  return bands.sort((a, b) => b.minTitles - a.minTitles);
};

export const parseNoticeDays = (value: unknown): number[] | null => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5) return null;
  const days = value.map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) return null;
  return [...new Set(days)].sort((a, b) => b - a);
};

/**
 * Gabungkan nilai tabel institution_config di atas bawaan. Nilai yang tidak valid diabaikan (bawaan dipakai) dan
 * dilaporkan lewat `invalid` agar admin melihatnya.
 */
export const mergeConfig = (raw: Record<string, unknown>): { config: InstitutionConfig; invalid: string[] } => {
  const config: InstitutionConfig = { ...DEFAULT_INSTITUTION_CONFIG, catalogScale: [...DEFAULT_INSTITUTION_CONFIG.catalogScale], renewalNoticeDays: [...DEFAULT_INSTITUTION_CONFIG.renewalNoticeDays] };
  const invalid: string[] = [];
  for (const [field, key] of Object.entries(CONFIG_KEYS) as Array<[keyof InstitutionConfig, string]>) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (field === 'catalogScale') {
      const parsed = parseCatalogScale(value);
      if (parsed) config.catalogScale = parsed;
      else invalid.push(key);
    } else if (field === 'renewalNoticeDays') {
      const parsed = parseNoticeDays(value);
      if (parsed) config.renewalNoticeDays = parsed;
      else invalid.push(key);
    } else {
      const parsed = validNumber(value, CONFIG_BOUNDS[field]);
      if (parsed !== null) (config as any)[field] = parsed;
      else invalid.push(key);
    }
  }
  return { config, invalid };
};

/** Skala katalog untuk jumlah judul di rak (pita pertama yang terpenuhi, dari minTitles terbesar). */
export const catalogScalePct = (titles: number, scale: InstitutionConfig['catalogScale']): number => {
  const sorted = [...scale].sort((a, b) => b.minTitles - a.minTitles);
  return sorted.find((band) => titles >= band.minTitles)?.pct ?? sorted[sorted.length - 1]?.pct ?? 40;
};

export interface QuoteInput {
  tier: TierRecord;
  titleCount: number;
  founding: boolean;
  config: InstitutionConfig;
  isTrial?: boolean;
  /** Enterprise: semua parameter diisi admin. Diabaikan untuk tier lain. */
  overrides?: { concurrentUsers?: number; adminSeats?: number; fullPrice?: number; catalogScalePct?: number };
}

export interface ContractQuote {
  tier: TierRecord['tier'];
  tierName: string;
  isTrial: boolean;
  concurrentUsers: number;
  adminSeats: number;
  fullPrice: number;
  catalogTitleCount: number;
  catalogScalePct: number;
  /** Harga penuh × skala (dibulatkan untuk tampilan). */
  scaledPrice: number;
  foundingDiscountPct: number;
  foundingDiscountAmount: number;
  contractedPrice: number;
  ebaPct: number;
  ebaCredit: number;
  ppnPct: number;
  taxAmount: number;
  total: number;
}

export class QuoteError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export const quoteContract = (input: QuoteInput): ContractQuote => {
  const { tier, config } = input;
  const isTrial = Boolean(input.isTrial);
  const enterprise = tier.tier === 'enterprise';
  const o = enterprise ? input.overrides ?? {} : {};
  const concurrentUsers = o.concurrentUsers ?? tier.concurrentUsers;
  const adminSeats = o.adminSeats ?? tier.adminSeats;
  const fullPrice = o.fullPrice ?? tier.fullPrice;
  if (!concurrentUsers || concurrentUsers < 1 || !adminSeats || adminSeats < 1 || fullPrice === null || fullPrice === undefined || fullPrice < 0) {
    throw new QuoteError('enterprise_parameters_required', 'Tier Enterprise: isi pengguna bersamaan, kursi admin, dan harga penuh.');
  }
  const titleCount = Math.max(0, Math.floor(input.titleCount));
  const scalePct = enterprise && o.catalogScalePct !== undefined ? o.catalogScalePct : catalogScalePct(titleCount, config.catalogScale);
  if (!(ALLOWED_SCALE_PCTS as readonly number[]).includes(scalePct)) throw new QuoteError('invalid_scale', 'Skala katalog harus 40, 60, 80, atau 100%.');
  const foundingPct = !isTrial && input.founding ? config.foundingDiscountPct : 0;
  const scaled = (fullPrice * scalePct) / 100;
  const scaledPrice = Math.round(scaled);
  const contractedPrice = isTrial ? 0 : Math.round((scaled * (100 - foundingPct)) / 100);
  const ebaPct = isTrial ? 0 : config.ebaPct;
  const ebaCredit = Math.round((contractedPrice * ebaPct) / 100);
  const taxAmount = Math.round((contractedPrice * config.ppnPct) / 100);
  return {
    tier: tier.tier,
    tierName: tier.name,
    isTrial,
    concurrentUsers,
    adminSeats,
    fullPrice,
    catalogTitleCount: titleCount,
    catalogScalePct: scalePct,
    scaledPrice,
    foundingDiscountPct: foundingPct,
    foundingDiscountAmount: isTrial ? 0 : scaledPrice - contractedPrice,
    contractedPrice,
    ebaPct,
    ebaCredit,
    ppnPct: config.ppnPct,
    taxAmount,
    total: contractedPrice + taxAmount
  };
};
