import type { InstitutionInquiryStatus, InstitutionType } from '../types';

/**
 * Data keanggotaan CakraNexa: paket, harga, manfaat, FAQ, dan tingkat Institution & Library Network.
 * Ubah struktur paket di sini. Teks tampilan ada di src/i18n/locales/<bahasa>/digital.json:
 *   membership.plans.<key>.*, membership.benefits.<benefitKey>, membership.faq.items.<faqKey>.*,
 *   institutions.tiers.<key>.*, institutions.features.<featureKey>
 *
 * CATATAN: daftar manfaat tiap paket dan batas pengguna institusi masih DRAF — tinjau sebelum dipublikasikan.
 */

/** Paket tahunan dibayar 10 bulan ("Hemat 2 bulan"). */
export const ANNUAL_BILLED_MONTHS = 10;

/** Program Founding Member: set `active: true` untuk menampilkan badge "Founding Member" pada paket berbayar. */
export const FOUNDING_MEMBER_PROGRAM = { active: false };

export type MembershipPlanKey = 'freeCircle' | 'readerCircle' | 'professionalSociety' | 'authorGuild';

export type MembershipBenefitKey =
  | 'samples'
  | 'newsletter'
  | 'publicEvents'
  | 'memberDiscount'
  | 'printDiscount'
  | 'earlyNews'
  | 'digitalShelf'
  | 'frontlistDiscount'
  | 'webinars'
  | 'manuscriptReview'
  | 'publishingDiscount'
  | 'authorCommunity';

export interface MembershipPlan {
  key: MembershipPlanKey;
  /** Harga per bulan (Rupiah); 0 = gratis. */
  monthlyPrice: number;
  /** Ditonjolkan sebagai paket utama. */
  highlighted?: boolean;
  /** Akses penuh e-book & audiobook melalui Digital Reading Shelf. */
  includesDigitalShelf: boolean;
  /** Ikut program Founding Member bila program aktif. */
  foundingEligible: boolean;
  benefits: MembershipBenefitKey[];
}

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    key: 'freeCircle',
    monthlyPrice: 0,
    includesDigitalShelf: false,
    foundingEligible: false,
    benefits: ['samples', 'newsletter', 'publicEvents']
  },
  {
    key: 'readerCircle',
    monthlyPrice: 39000,
    includesDigitalShelf: false,
    foundingEligible: true,
    benefits: ['samples', 'memberDiscount', 'printDiscount', 'earlyNews', 'newsletter']
  },
  {
    key: 'professionalSociety',
    monthlyPrice: 99000,
    highlighted: true,
    includesDigitalShelf: true,
    foundingEligible: true,
    benefits: ['digitalShelf', 'frontlistDiscount', 'printDiscount', 'webinars', 'earlyNews']
  },
  {
    key: 'authorGuild',
    monthlyPrice: 149000,
    includesDigitalShelf: true,
    foundingEligible: true,
    benefits: ['digitalShelf', 'manuscriptReview', 'publishingDiscount', 'authorCommunity', 'printDiscount']
  }
];

export const annualPlanPrice = (plan: MembershipPlan): number => plan.monthlyPrice * ANNUAL_BILLED_MONTHS;

/** Paket individu yang memberi akses Digital Reading Shelf. */
export const DIGITAL_SHELF_PLANS: MembershipPlan[] = MEMBERSHIP_PLANS.filter((plan) => plan.includesDigitalShelf);

export const MEMBERSHIP_FAQ_KEYS = ['shelf', 'frontlist', 'unitPurchase', 'billing', 'cancel', 'institutions'] as const;
export type MembershipFaqKey = (typeof MEMBERSHIP_FAQ_KEYS)[number];

// ---------------------------------------------------------------------------
// INSTITUTION & LIBRARY NETWORK (kontrak tahunan; harga tidak dipublikasikan)
// ---------------------------------------------------------------------------
export type InstitutionTierKey = 'starter' | 'campus' | 'network';

export type InstitutionFeatureKey =
  | 'shelfAccess'
  | 'usageReports'
  | 'acquisitionWallet'
  | 'ipAccess'
  | 'marcRecords'
  | 'multiCampus'
  | 'accountManager';

export interface InstitutionTier {
  key: InstitutionTierKey;
  /** Jumlah pengguna bersamaan (concurrent users); null = disesuaikan, di atas tingkat sebelumnya. */
  concurrentUsers: number | null;
  highlighted?: boolean;
  features: InstitutionFeatureKey[];
}

export const INSTITUTION_TIERS: InstitutionTier[] = [
  { key: 'starter', concurrentUsers: 25, features: ['shelfAccess', 'usageReports', 'acquisitionWallet'] },
  { key: 'campus', concurrentUsers: 100, highlighted: true, features: ['shelfAccess', 'ipAccess', 'usageReports', 'acquisitionWallet', 'marcRecords'] },
  { key: 'network', concurrentUsers: null, features: ['shelfAccess', 'ipAccess', 'usageReports', 'acquisitionWallet', 'marcRecords', 'multiCampus', 'accountManager'] }
];

export const INSTITUTION_TYPES: readonly InstitutionType[] = ['university', 'library', 'government', 'company', 'other'];
export const INSTITUTION_INQUIRY_STATUSES: readonly InstitutionInquiryStatus[] = ['new', 'contacted', 'done'];

/** Batas isian form permintaan penawaran (dipakai form publik dan server). */
export const INSTITUTION_INQUIRY_LIMITS = {
  nameMax: 200,
  contactMax: 120,
  phoneMax: 40,
  messageMax: 2000,
  maxUsers: 1_000_000
} as const;
