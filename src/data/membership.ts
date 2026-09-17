import type { InstitutionInquiryStatus, InstitutionType } from '../types';
import type { LegacyPlanCode, MembershipPlans, PlanCode, PublicPlan } from '../services/membershipApi';

/**
 * Keanggotaan Cakrawala Magna Society di CakraNexa (docs/PHASE-3-BRIEF.md; analisis skema: docs/SKEMA-KEANGGOTAAN.md).
 *
 * Sumber kebenaran paket adalah tabel `plans`/`plan_benefits` di server (seed: backend/digital/membership/plans.ts),
 * dibaca halaman lewat GET /api/membership/plans. File ini hanya berisi:
 *  - data cadangan bila API tidak tersedia (angka sama dengan seed, semua flag dianggap mati),
 *  - parameter teks manfaat (Rupiah/angka) dan kebijakan yang tampil di FAQ,
 *  - data Institution & Library Network (fase 4, halaman penawaran).
 * Teks tampilan: src/i18n/locales/<bahasa>/digital.json (membership.*, institutions.*).
 */

/** Paket tahunan = 10 × harga bulanan ("hemat 2 bulan"). */
export const ANNUAL_BILLED_MONTHS = 10;

/** Harga Founding: tahun pertama paket tahunan untuk anggota baru; pemberitahuan harga reguler sebelum ulang tahun. */
export const FOUNDING_MEMBER_PROGRAM = { renewalNoticeDays: 30 };

/** Kebijakan penagihan (brief fase 3 Langkah 3). */
export const MEMBERSHIP_BILLING_POLICY = {
  /** Masa tenggang setelah jatuh tempo; akses tetap terbuka. */
  graceDays: 5,
  /** Pengingat tagihan manual: H-7, H-3, H-1, dan hari jatuh tempo. */
  reminderDaysBeforeDue: [7, 3, 1, 0] as readonly number[],
  /** Setelah akses dikunci, progres baca dan catatan disimpan selama ini. */
  lockedDataRetentionMonths: 12,
  /** Satu kali pelepasan perangkat per sekian hari (sama dengan fase 2). */
  deviceReleaseDays: 30
};

// ---------------------------------------------------------------------------
// PAKET INDIVIDU
// ---------------------------------------------------------------------------
export type MembershipPlanKey = 'blue' | 'silver' | 'gold' | 'platinum' | 'freeCircle' | 'readerCircle' | 'professionalSociety' | 'authorGuild';

/** Kode paket di server -> kunci teks di digital.json (membership.plans.<kunci>). */
export const PLAN_KEY_BY_CODE: Record<PlanCode, MembershipPlanKey> = {
  blue: 'blue',
  silver: 'silver',
  gold: 'gold',
  platinum: 'platinum',
  free: 'freeCircle',
  reader: 'readerCircle',
  professional: 'professionalSociety',
  author: 'authorGuild'
};

/** Semua kunci manfaat yang punya teks (membership.benefits.<kunci>); kunci lain dari server tidak ditampilkan. */
export const MEMBERSHIP_BENEFIT_KEYS = [
  // Peluncuran (tanpa flag)
  'account', 'newsletter', 'samples', 'wishlist', 'publicEvents', 'preorderAlerts',
  // Akses digital & harga member (flag server)
  'digitalPick', 'digitalShelf', 'authorOwnWorks', 'memberPrintDiscount',
  // Paket fase 6 (angka dari kolom kuota paket)
  'audioSample', 'devicesTwo', 'titleQuota', 'audioHours', 'frontlistDays', 'frontlistFirstDay', 'offlineTitles',
  'notesHighlights', 'formatSync', 'fullShelf', 'familyAccounts',
  // Manfaat lanjutan dokumen owner (flag MEMBERSHIP_EXTENDED_BENEFITS, belum diluncurkan)
  'points', 'recommendations', 'birthdayGift', 'referralBasic',
  'bookDiscount', 'readerWallet', 'memberPick', 'preorderDiscount', 'freeShipping', 'digitalSampler', 'backlistDiscount',
  'purchaseReward', 'bookClub', 'earlyAccess', 'birthdayVoucher', 'referral', 'annualGift',
  'printDiscount', 'proWallet', 'annualCredit', 'expertWebinar', 'researchDigest', 'companionResources', 'citationTools',
  'executiveSummary', 'readingPathway', 'preorderPriority', 'expertForum', 'memberCertificate', 'corporateReferral',
  'authorAcademy', 'manuscriptClinic', 'authorBookDiscount', 'ownBooksDiscount', 'authorWallet', 'miniDiagnostic',
  'editorialDiscount', 'fastTrack', 'templateLibrary', 'marketIntelligence', 'launchBundle', 'authorProfile',
  'authorCommunity', 'referralWallet', 'eventPriority', 'strategySession'
] as const;
export type MembershipBenefitKey = (typeof MEMBERSHIP_BENEFIT_KEYS)[number];

export const isMembershipBenefitKey = (key: string): key is MembershipBenefitKey =>
  (MEMBERSHIP_BENEFIT_KEYS as readonly string[]).includes(key);

/** Manfaat yang bisa dipenuhi saat peluncuran (sama dengan LAUNCH_BENEFITS di server). */
export const LAUNCH_BENEFIT_KEYS: MembershipBenefitKey[] = ['account', 'newsletter', 'samples', 'wishlist', 'publicEvents', 'preorderAlerts'];

/** Wallet & kredit tahunan dokumen owner (manfaat lanjutan; dasar hitungan batas biaya manfaat 35%). */
export interface MembershipWallet {
  amount: number;
  period: 'month' | 'quarter';
  minPurchase: number;
  validityDays?: number;
  maxActive?: number;
}

export const MEMBERSHIP_WALLETS: Record<Exclude<LegacyPlanCode, 'free'>, MembershipWallet> = {
  reader: { amount: 25_000, period: 'month', minPurchase: 149_000, validityDays: 60, maxActive: 2 },
  professional: { amount: 50_000, period: 'quarter', minPurchase: 249_000 },
  author: { amount: 75_000, period: 'quarter', minPurchase: 350_000 }
};

export const PROFESSIONAL_ANNUAL_CREDIT = { amount: 150_000, minPurchase: 399_000 };

/** Aturan ekonomi yang wajib dijaga (dokumen owner bab IX dan analisis royalti bab 3). */
export const MEMBERSHIP_ECONOMICS = {
  /** Biaya tunai langsung seluruh manfaat maksimal sekian persen dari pendapatan keanggotaan. */
  benefitCostCapPercent: 35,
  /**
   * Saran minimum belanja wallet/voucher: 5–6 × nilai voucher. Contoh owner sendiri lebih rendah
   * (Rp50.000 → Rp249.000 = 4,98×; Rp75.000 → Rp350.000 = 4,67×); angka owner yang dipakai.
   */
  voucherMinPurchaseMultiple: { min: 5, max: 6 },
  /** Urutan potongan; harga member (Langkah 7) selalu langkah pertama dan tidak bertumpuk dengan promo. */
  discountStackingOrder: ['memberPrice', 'walletOrVoucher', 'points', 'shippingSubsidy'] as readonly string[],
  shippingSubsidyMax: 15_000,
  freeShippingMinPurchase: 199_000
};

/** Nilai nominal manfaat tunai per tahun (wallet + kredit tahunan) bila seluruhnya dipakai. */
export const nominalCashBenefitsPerYear = (code: Exclude<LegacyPlanCode, 'free'>, billing: 'monthly' | 'annual'): number => {
  const wallet = MEMBERSHIP_WALLETS[code];
  const walletPerYear = wallet.amount * (wallet.period === 'month' ? 12 : 4);
  return walletPerYear + (billing === 'annual' && code === 'professional' ? PROFESSIONAL_ANNUAL_CREDIT.amount : 0);
};

/** Program loyalitas (dokumen owner bab XI) — tampil hanya bila manfaat lanjutan diaktifkan. */
export const MAGNA_POINTS = { percent: 3, campaignMaxPercent: 5, validityMonths: 12 };

export type LoyaltyStatusKey = 'member' | 'reader' | 'curator' | 'patron';
export const LOYALTY_STATUSES: { key: LoyaltyStatusKey; minAnnualSpend: number }[] = [
  { key: 'member', minAnnualSpend: 0 },
  { key: 'reader', minAnnualSpend: 1_000_000 },
  { key: 'curator', minAnnualSpend: 3_000_000 },
  { key: 'patron', minAnnualSpend: 7_500_000 }
];

/** Parameter teks manfaat: `amounts` diformat Rupiah, `values` sebagai angka. */
export const BENEFIT_PARAMS: Partial<Record<MembershipBenefitKey, { amounts?: Record<string, number>; values?: Record<string, number> }>> = {
  samples: { values: { min: 10, max: 15 } },
  audioSample: { values: { minutes: 5 } },
  devicesTwo: { values: { n: 2 } },
  bookDiscount: { values: { percent: 10 } },
  readerWallet: { amounts: { amount: MEMBERSHIP_WALLETS.reader.amount, min: MEMBERSHIP_WALLETS.reader.minPurchase }, values: { days: 60, active: 2 } },
  preorderDiscount: { values: { percent: 15 } },
  freeShipping: { amounts: { min: MEMBERSHIP_ECONOMICS.freeShippingMinPurchase } },
  backlistDiscount: { values: { percent: 20 } },
  purchaseReward: { values: { percent: 3 } },
  earlyAccess: { values: { days: 7 } },
  birthdayVoucher: { amounts: { max: 50_000 }, values: { percent: 20 } },
  referral: { amounts: { amount: 25_000, min: 149_000 } },
  annualGift: { amounts: { max: 99_000 } },
  printDiscount: { values: { percent: 15 } },
  proWallet: { amounts: { amount: MEMBERSHIP_WALLETS.professional.amount, min: MEMBERSHIP_WALLETS.professional.minPurchase } },
  annualCredit: { amounts: { amount: PROFESSIONAL_ANNUAL_CREDIT.amount, min: PROFESSIONAL_ANNUAL_CREDIT.minPurchase } },
  expertWebinar: { values: { n: 2 } },
  readingPathway: { values: { n: 3 } },
  authorAcademy: { values: { n: 2 } },
  authorBookDiscount: { values: { percent: 15 } },
  ownBooksDiscount: { values: { percent: 35, copies: 20 } },
  authorWallet: { amounts: { amount: MEMBERSHIP_WALLETS.author.amount, min: MEMBERSHIP_WALLETS.author.minPurchase } },
  miniDiagnostic: { values: { words: 5000 } },
  editorialDiscount: { amounts: { max: 2_000_000 }, values: { percent: 10 } },
  fastTrack: { values: { days: 10 } },
  referralWallet: { values: { percent: 10 } }
};

const PLAN_NAMES: Record<PlanCode, string> = {
  blue: 'Blue',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  free: 'Free Circle',
  reader: 'Reader Circle',
  professional: 'Professional & Academic Society',
  author: 'Author Guild'
};

type PlanQuotas = Pick<PublicPlan, 'ebookTitlesPerPeriod' | 'audioHoursPerPeriod' | 'frontlistDays' | 'offlineTitles' | 'familyAccounts'>;

const fallbackPlan = (
  code: PlanCode,
  priceMonthly: number,
  shelfAccess: PublicPlan['shelfAccess'],
  quotas: PlanQuotas,
  benefits: MembershipBenefitKey[]
): PublicPlan => ({
  code,
  name: { id: PLAN_NAMES[code], en: PLAN_NAMES[code] },
  priceMonthly,
  priceYearly: priceMonthly * ANNUAL_BILLED_MONTHS,
  founding: null,
  maxDevices: 2,
  shelfAccess,
  ...quotas,
  printDiscountPercent: 0,
  benefits
});

/** Kunci teks manfaat yang angkanya diambil dari kolom kuota paket (bukan BENEFIT_PARAMS). */
export const planBenefitValues = (key: MembershipBenefitKey, plan: PublicPlan): Record<string, number> => {
  switch (key) {
    case 'titleQuota': return { n: plan.ebookTitlesPerPeriod ?? 0 };
    case 'audioHours': return { hours: plan.audioHoursPerPeriod ?? 0 };
    case 'frontlistDays': return { days: plan.frontlistDays ?? 0 };
    case 'offlineTitles': return { n: plan.offlineTitles };
    case 'familyAccounts': return { n: plan.familyAccounts };
    default: return {};
  }
};

/**
 * Cadangan bila GET /api/membership/plans tidak tersedia (mis. fungsi Vercel atau jaringan): angka sama dengan seed
 * server, semua flag dianggap mati (Reader tanpa Pick, Author tanpa rak, tanpa harga member), pendaftaran ditutup.
 */
export const FALLBACK_MEMBERSHIP: MembershipPlans = {
  plans: [
    fallbackPlan('blue', 0, 'none',
      { ebookTitlesPerPeriod: null, audioHoursPerPeriod: null, frontlistDays: null, offlineTitles: 0, familyAccounts: 0 },
      ['account', 'samples', 'audioSample', 'newsletter', 'devicesTwo']),
    fallbackPlan('silver', 49_000, 'pick',
      { ebookTitlesPerPeriod: 2, audioHoursPerPeriod: 5, frontlistDays: 90, offlineTitles: 0, familyAccounts: 0 },
      ['titleQuota', 'audioHours', 'frontlistDays', 'devicesTwo']),
    fallbackPlan('gold', 99_000, 'pick',
      { ebookTitlesPerPeriod: 6, audioHoursPerPeriod: 20, frontlistDays: 45, offlineTitles: 2, familyAccounts: 0 },
      ['titleQuota', 'audioHours', 'frontlistDays', 'offlineTitles', 'notesHighlights', 'formatSync', 'devicesTwo']),
    fallbackPlan('platinum', 199_000, 'full',
      { ebookTitlesPerPeriod: null, audioHoursPerPeriod: 60, frontlistDays: 0, offlineTitles: 5, familyAccounts: 2 },
      ['fullShelf', 'audioHours', 'frontlistFirstDay', 'offlineTitles', 'notesHighlights', 'formatSync', 'familyAccounts', 'devicesTwo'])
  ],
  flags: {
    autodebit: false,
    printDiscount: false,
    readerPick: false,
    authorShelf: false,
    extendedBenefits: false,
    graceDays: MEMBERSHIP_BILLING_POLICY.graceDays,
    whatsapp: false,
    whatsappSender: null
  },
  paymentAvailable: false,
  purchaseEnabled: false,
  current: null,
  foundingEligible: true
};

/** Paket yang membuka Digital Reading Shelf penuh (tanpa flag): dipakai halaman produk digital. */
export const DIGITAL_SHELF_PLANS: { code: PlanCode; key: MembershipPlanKey }[] = FALLBACK_MEMBERSHIP.plans
  .filter((plan) => plan.shelfAccess === 'full')
  .map((plan) => ({ code: plan.code, key: PLAN_KEY_BY_CODE[plan.code] }));

export const MEMBERSHIP_FAQ_KEYS = [
  'shelf',
  'frontlist',
  'unitPurchase',
  'billing',
  'founding',
  'payment',
  'grace',
  'changePlan',
  'cancel',
  'devices',
  'institutions'
] as const;
export type MembershipFaqKey = (typeof MEMBERSHIP_FAQ_KEYS)[number];

// ---------------------------------------------------------------------------
// INSTITUTION & LIBRARY NETWORK (kontrak tahunan; halaman publik tanpa harga, penawaran lewat formulir)
// ---------------------------------------------------------------------------
export type InstitutionTierKey = 'starter' | 'campus' | 'network' | 'consortium';
export type InstitutionReportCadence = 'quarterly' | 'monthly' | 'monthlyAnalysis';
export type InstitutionAdoptionSupport = 'basic' | 'full' | 'fullManager';

export interface InstitutionTier {
  key: InstitutionTierKey;
  /** Pengguna bersamaan (concurrent users); null = di atas tingkat Network, sesuai kontrak. */
  concurrentUsers: number | null;
  /** Harga penuh per tahun (katalog ≥150 judul); null = penawaran khusus. Tidak ditampilkan di situs publik. */
  annualPrice: number | null;
  highlighted?: boolean;
  /** Nilai per tingkat; null = sesuai kontrak. */
  adminAccounts: number | null;
  webinarsPerYear: number | null;
  usageReports: InstitutionReportCadence | null;
  printDiscountPercent: number | null;
  bulkOrderMin: number | null;
  readingListsPerYear: number | null;
  courseAdoption: InstitutionAdoptionSupport | null;
}

export const INSTITUTION_TIERS: InstitutionTier[] = [
  {
    key: 'starter', concurrentUsers: 5, annualPrice: 9_900_000,
    adminAccounts: 1, webinarsPerYear: 2, usageReports: 'quarterly', printDiscountPercent: 20, bulkOrderMin: 25, readingListsPerYear: 2, courseAdoption: 'basic'
  },
  {
    key: 'campus', concurrentUsers: 20, annualPrice: 24_900_000, highlighted: true,
    adminAccounts: 3, webinarsPerYear: 4, usageReports: 'monthly', printDiscountPercent: 25, bulkOrderMin: 50, readingListsPerYear: 6, courseAdoption: 'full'
  },
  {
    key: 'network', concurrentUsers: 50, annualPrice: 59_900_000,
    adminAccounts: 10, webinarsPerYear: 8, usageReports: 'monthlyAnalysis', printDiscountPercent: 30, bulkOrderMin: 100, readingListsPerYear: 12, courseAdoption: 'fullManager'
  },
  {
    key: 'consortium', concurrentUsers: null, annualPrice: null,
    adminAccounts: null, webinarsPerYear: null, usageReports: null, printDiscountPercent: null, bulkOrderMin: null, readingListsPerYear: null, courseAdoption: null
  }
];

/** Manfaat yang berlaku di semua tingkat institusi (dokumen owner 7.3). */
export const INSTITUTION_COMMON_FEATURES = [
  'collection',
  'accessMethods',
  'concurrentAccess',
  'adminDashboard',
  'usageReports',
  'catalogMetadata',
  'readingLists',
  'courseAdoption',
  'printDiscount',
  'webinars',
  'collectionAdvice',
  'librarianSupport',
  'collectionUpdates',
  'techSupport',
  'certificate'
] as const;
export type InstitutionFeatureKey = (typeof INSTITUTION_COMMON_FEATURES)[number];

export const INSTITUTION_PROGRAM = {
  /**
   * Persentase biaya tahunan yang DIBAYAR yang menjadi kredit di akhir periode (fase 6: 20%, sebelumnya 40%).
   * Kredit ditukar ke buku cetak atau potongan perpanjangan, bukan lisensi permanen.
   */
  acquisitionWalletPercent: 20,
  /** Founding: diskon tahun pertama untuk sejumlah institusi pertama. */
  founding: { discountPercent: 15, cap: 30 },
  /** Harga penuh berlaku mulai jumlah judul digital relevan ini. */
  fullPriceTitles: 150
};

/** Penyesuaian harga menurut jumlah judul digital (dokumen owner 7.6); kenaikan berlaku pada perpanjangan berikutnya. */
export const INSTITUTION_CATALOG_PRICE_BANDS: { minTitles: number; percent: number }[] = [
  { minTitles: 150, percent: 100 },
  { minTitles: 100, percent: 80 },
  { minTitles: 50, percent: 60 },
  { minTitles: 0, percent: 40 }
];

export const institutionCatalogPercent = (digitalTitles: number): number =>
  INSTITUTION_CATALOG_PRICE_BANDS.find((band) => digitalTitles >= band.minTitles)?.percent ?? 40;

/** Harga tahunan yang berlaku untuk sebuah tingkat; null untuk penawaran khusus. */
export const institutionAnnualPrice = (tier: InstitutionTier, digitalTitles: number, founding = false): number | null => {
  if (tier.annualPrice === null) return null;
  const catalogPrice = (tier.annualPrice * institutionCatalogPercent(digitalTitles)) / 100;
  return Math.round(founding ? (catalogPrice * (100 - INSTITUTION_PROGRAM.founding.discountPercent)) / 100 : catalogPrice);
};

/** Kredit akuisisi dari biaya tahunan yang benar-benar dibayar. */
export const acquisitionWalletAmount = (paidAnnualPrice: number): number =>
  Math.round((paidAnnualPrice * INSTITUTION_PROGRAM.acquisitionWalletPercent) / 100);

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
