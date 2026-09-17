import type { LegacyPlanCode, PlanBenefitRecord, PlanCode, PlanRecord } from '../types';

type SeedPlan = Omit<PlanRecord, 'updatedAt'>;

const PHASE6_DEFAULTS = { foundingPriceYearly: null, foundingCap: null, foundingCount: 0, maxDevices: 2, isActive: true, successorPlanId: null } as const;

/**
 * Paket fase 6 (skema terkunci docs/PHASE-6-BRIEF.md). Sama dengan UPSERT di src/db/membership_phase6_migration.sql.
 * Tahunan = 10× bulanan; tanpa harga Founding perorangan; semua paket 2 perangkat; diskon buku cetak 5/10/20%.
 *  - Silver/Gold: e-book lewat jatah judul per bulan, audiobook seluruh rak dengan batas jam per bulan.
 *  - Platinum: seluruh rak (e-book dan audio) dengan batas jam audio per akun, 2 akun keluarga.
 *  - Blue: gratis, hanya sampel (tidak ada baris langganan).
 */
export const PHASE6_PLANS: SeedPlan[] = [
  {
    ...PHASE6_DEFAULTS, id: 'plan-blue', code: 'blue', nameId: 'Blue', nameEn: 'Blue',
    priceMonthly: 0, priceYearly: 0, shelfAccess: 'none', printDiscountPercent: 0, sortOrder: 11,
    ebookTitlesPerPeriod: null, audioHoursPerPeriod: null, frontlistDays: null, offlineTitles: 0, familyAccounts: 0
  },
  {
    ...PHASE6_DEFAULTS, id: 'plan-silver', code: 'silver', nameId: 'Silver', nameEn: 'Silver',
    priceMonthly: 49_000, priceYearly: 490_000, shelfAccess: 'pick', printDiscountPercent: 5, sortOrder: 12,
    ebookTitlesPerPeriod: 2, audioHoursPerPeriod: 5, frontlistDays: 90, offlineTitles: 0, familyAccounts: 0
  },
  {
    ...PHASE6_DEFAULTS, id: 'plan-gold', code: 'gold', nameId: 'Gold', nameEn: 'Gold',
    priceMonthly: 99_000, priceYearly: 990_000, shelfAccess: 'pick', printDiscountPercent: 10, sortOrder: 13,
    ebookTitlesPerPeriod: 6, audioHoursPerPeriod: 20, frontlistDays: 45, offlineTitles: 2, familyAccounts: 0
  },
  {
    ...PHASE6_DEFAULTS, id: 'plan-platinum', code: 'platinum', nameId: 'Platinum', nameEn: 'Platinum',
    priceMonthly: 199_000, priceYearly: 1_990_000, shelfAccess: 'full', printDiscountPercent: 20, sortOrder: 14,
    ebookTitlesPerPeriod: null, audioHoursPerPeriod: 60, frontlistDays: 0, offlineTitles: 5, familyAccounts: 2
  }
];

const LEGACY_QUOTAS = { ebookTitlesPerPeriod: null, audioHoursPerPeriod: null, frontlistDays: 0, offlineTitles: 0, familyAccounts: 0, successorPlanId: null } as const;

/**
 * Seed paket fase 3 apa adanya (docs/PHASE-3-BRIEF.md; INSERT di membership_phase3_migration.sql, dicek
 * membershipMigration.test.ts). Setelah migration fase 6 paket ini nonaktif dan diperpanjang ke penerusnya.
 */
export const PHASE3_PLANS: SeedPlan[] = [
  {
    ...LEGACY_QUOTAS, id: 'plan-free', code: 'free', nameId: 'Free Circle', nameEn: 'Free Circle',
    priceMonthly: 0, priceYearly: 0, foundingPriceYearly: null, foundingCap: null, foundingCount: 0,
    maxDevices: 1, shelfAccess: 'none', printDiscountPercent: 0, sortOrder: 1, isActive: true, frontlistDays: null
  },
  {
    ...LEGACY_QUOTAS, id: 'plan-reader', code: 'reader', nameId: 'Reader Circle', nameEn: 'Reader Circle',
    priceMonthly: 39_000, priceYearly: 390_000, foundingPriceYearly: 299_000, foundingCap: 1000, foundingCount: 0,
    maxDevices: 1, shelfAccess: 'pick', printDiscountPercent: 10, sortOrder: 2, isActive: true
  },
  {
    ...LEGACY_QUOTAS, id: 'plan-professional', code: 'professional', nameId: 'Professional & Academic Society', nameEn: 'Professional & Academic Society',
    priceMonthly: 99_000, priceYearly: 990_000, foundingPriceYearly: 790_000, foundingCap: 500, foundingCount: 0,
    maxDevices: 2, shelfAccess: 'full', printDiscountPercent: 15, sortOrder: 3, isActive: true
  },
  {
    ...LEGACY_QUOTAS, id: 'plan-author', code: 'author', nameId: 'Author Guild', nameEn: 'Author Guild',
    priceMonthly: 149_000, priceYearly: 1_490_000, foundingPriceYearly: 1_190_000, foundingCap: 250, foundingCount: 0,
    maxDevices: 2, shelfAccess: 'full', printDiscountPercent: 15, sortOrder: 4, isActive: true
  }
];

/** Penerus paket lama saat perpanjangan (keputusan fase 6 no. 1). */
export const LEGACY_SUCCESSOR: Record<LegacyPlanCode, string> = {
  free: 'plan-blue',
  reader: 'plan-silver',
  professional: 'plan-gold',
  author: 'plan-platinum'
};

export const isLegacyPlanCode = (code: string): code is LegacyPlanCode => code in LEGACY_SUCCESSOR;

/** Keadaan paket setelah migration fase 6: paket baru aktif, paket lama nonaktif dengan penerus dan 2 perangkat. */
export const DEFAULT_PLANS: SeedPlan[] = [
  ...PHASE6_PLANS,
  ...PHASE3_PLANS.map((plan) => ({
    ...plan,
    isActive: false,
    maxDevices: 2,
    successorPlanId: LEGACY_SUCCESSOR[plan.code as LegacyPlanCode]
  }))
];

/** Manfaat yang bisa dipenuhi saat peluncuran fase 3 (keputusan 14-09-2026): tampil tanpa flag. */
export const LAUNCH_BENEFITS = ['account', 'newsletter', 'samples', 'wishlist', 'publicEvents', 'preorderAlerts'] as const;

export const EXTENDED_FLAG = 'MEMBERSHIP_EXTENDED_BENEFITS';
export const PRINT_DISCOUNT_FLAG = 'ENABLE_MEMBER_PRINT_DISCOUNT';
export const READER_PICK_FLAG = 'ENABLE_READER_DIGITAL_PICK';
export const AUTHOR_SHELF_FLAG = 'ENABLE_AUTHOR_GUILD_SHELF';

const PHASE3_SPECIFIC: Record<LegacyPlanCode, Array<[string, string | null]>> = {
  free: [
    ['recommendations', EXTENDED_FLAG], ['points', EXTENDED_FLAG], ['birthdayGift', EXTENDED_FLAG], ['referralBasic', EXTENDED_FLAG]
  ],
  reader: [
    ['digitalPick', READER_PICK_FLAG],
    ['memberPrintDiscount', PRINT_DISCOUNT_FLAG],
    ['readerWallet', EXTENDED_FLAG], ['memberPick', EXTENDED_FLAG], ['preorderDiscount', EXTENDED_FLAG], ['freeShipping', EXTENDED_FLAG],
    ['digitalSampler', EXTENDED_FLAG], ['backlistDiscount', EXTENDED_FLAG], ['purchaseReward', EXTENDED_FLAG], ['bookClub', EXTENDED_FLAG],
    ['earlyAccess', EXTENDED_FLAG], ['birthdayVoucher', EXTENDED_FLAG], ['referral', EXTENDED_FLAG], ['annualGift', EXTENDED_FLAG]
  ],
  professional: [
    ['digitalShelf', null],
    ['memberPrintDiscount', PRINT_DISCOUNT_FLAG],
    ['proWallet', EXTENDED_FLAG], ['annualCredit', EXTENDED_FLAG], ['expertWebinar', EXTENDED_FLAG], ['researchDigest', EXTENDED_FLAG],
    ['companionResources', EXTENDED_FLAG], ['citationTools', EXTENDED_FLAG], ['executiveSummary', EXTENDED_FLAG], ['readingPathway', EXTENDED_FLAG],
    ['preorderPriority', EXTENDED_FLAG], ['expertForum', EXTENDED_FLAG], ['memberCertificate', EXTENDED_FLAG], ['corporateReferral', EXTENDED_FLAG]
  ],
  author: [
    ['digitalShelf', AUTHOR_SHELF_FLAG],
    ['authorOwnWorks', `!${AUTHOR_SHELF_FLAG}`],
    ['memberPrintDiscount', PRINT_DISCOUNT_FLAG],
    ['authorAcademy', EXTENDED_FLAG], ['manuscriptClinic', EXTENDED_FLAG], ['ownBooksDiscount', EXTENDED_FLAG], ['authorWallet', EXTENDED_FLAG],
    ['miniDiagnostic', EXTENDED_FLAG], ['editorialDiscount', EXTENDED_FLAG], ['fastTrack', EXTENDED_FLAG], ['templateLibrary', EXTENDED_FLAG],
    ['marketIntelligence', EXTENDED_FLAG], ['launchBundle', EXTENDED_FLAG], ['authorProfile', EXTENDED_FLAG], ['authorCommunity', EXTENDED_FLAG],
    ['referralWallet', EXTENDED_FLAG], ['eventPriority', EXTENDED_FLAG], ['strategySession', EXTENDED_FLAG]
  ]
};

/** Seed plan_benefits fase 3: manfaat peluncuran (tanpa flag) lalu manfaat khusus paket. */
export const PHASE3_PLAN_BENEFITS: PlanBenefitRecord[] = PHASE3_PLANS.flatMap((plan) => [
  ...LAUNCH_BENEFITS.map((key) => [key, null] as [string, string | null]),
  ...PHASE3_SPECIFIC[plan.code as LegacyPlanCode]
].map(([benefitKey, featureFlag], index) => ({ planId: plan.id, benefitKey, sortOrder: (index + 1) * 10, featureFlag })));

/** Manfaat paket fase 6 (sama dengan INSERT plan_benefits di membership_phase6_migration.sql). */
const PHASE6_SPECIFIC: Record<'blue' | 'silver' | 'gold' | 'platinum', Array<[string, string | null]>> = {
  blue: [['account', null], ['samples', null], ['audioSample', null], ['newsletter', null], ['devicesTwo', null]],
  silver: [['titleQuota', null], ['audioHours', null], ['frontlistDays', null], ['devicesTwo', null], ['memberPrintDiscount', PRINT_DISCOUNT_FLAG]],
  gold: [
    ['titleQuota', null], ['audioHours', null], ['frontlistDays', null], ['offlineTitles', null], ['notesHighlights', null],
    ['formatSync', null], ['devicesTwo', null], ['memberPrintDiscount', PRINT_DISCOUNT_FLAG]
  ],
  platinum: [
    ['fullShelf', null], ['audioHours', null], ['frontlistFirstDay', null], ['offlineTitles', null], ['notesHighlights', null],
    ['formatSync', null], ['familyAccounts', null], ['devicesTwo', null], ['memberPrintDiscount', PRINT_DISCOUNT_FLAG]
  ]
};

export const PHASE6_PLAN_BENEFITS: PlanBenefitRecord[] = PHASE6_PLANS.flatMap((plan) =>
  PHASE6_SPECIFIC[plan.code as keyof typeof PHASE6_SPECIFIC].map(([benefitKey, featureFlag], index) => ({
    planId: plan.id, benefitKey, sortOrder: (index + 1) * 10, featureFlag
  })));

export const DEFAULT_PLAN_BENEFITS: PlanBenefitRecord[] = [...PHASE6_PLAN_BENEFITS, ...PHASE3_PLAN_BENEFITS];

/** Urutan tingkat paket untuk upgrade/downgrade (paket lama setara penerusnya). */
export const PLAN_RANK: Record<PlanCode, number> = { blue: 0, silver: 1, gold: 2, platinum: 3, free: 0, reader: 1, professional: 2, author: 3 };
