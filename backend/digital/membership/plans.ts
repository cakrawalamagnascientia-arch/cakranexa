import type { PlanBenefitRecord, PlanCode, PlanRecord } from '../types';

/**
 * Seed paket keanggotaan (angka final dari docs/PHASE-3-BRIEF.md). Sama dengan INSERT di
 * src/db/membership_phase3_migration.sql; di produksi admin mengubahnya lewat tab Keanggotaan tanpa deploy.
 * Store memori (tes/dev) memakai data ini apa adanya.
 */
export const DEFAULT_PLANS: Omit<PlanRecord, 'updatedAt'>[] = [
  {
    id: 'plan-free', code: 'free', nameId: 'Free Circle', nameEn: 'Free Circle',
    priceMonthly: 0, priceYearly: 0, foundingPriceYearly: null, foundingCap: null, foundingCount: 0,
    maxDevices: 1, shelfAccess: 'none', printDiscountPercent: 0, sortOrder: 1, isActive: true
  },
  {
    id: 'plan-reader', code: 'reader', nameId: 'Reader Circle', nameEn: 'Reader Circle',
    priceMonthly: 39_000, priceYearly: 390_000, foundingPriceYearly: 299_000, foundingCap: 1000, foundingCount: 0,
    maxDevices: 1, shelfAccess: 'pick', printDiscountPercent: 10, sortOrder: 2, isActive: true
  },
  {
    id: 'plan-professional', code: 'professional', nameId: 'Professional & Academic Society', nameEn: 'Professional & Academic Society',
    priceMonthly: 99_000, priceYearly: 990_000, foundingPriceYearly: 790_000, foundingCap: 500, foundingCount: 0,
    maxDevices: 2, shelfAccess: 'full', printDiscountPercent: 15, sortOrder: 3, isActive: true
  },
  {
    id: 'plan-author', code: 'author', nameId: 'Author Guild', nameEn: 'Author Guild',
    priceMonthly: 149_000, priceYearly: 1_490_000, foundingPriceYearly: 1_190_000, foundingCap: 250, foundingCount: 0,
    maxDevices: 2, shelfAccess: 'full', printDiscountPercent: 15, sortOrder: 4, isActive: true
  }
];

/** Manfaat yang bisa dipenuhi saat peluncuran (keputusan 14-09-2026): tampil tanpa flag. */
export const LAUNCH_BENEFITS = ['account', 'newsletter', 'samples', 'wishlist', 'publicEvents', 'preorderAlerts'] as const;

export const EXTENDED_FLAG = 'MEMBERSHIP_EXTENDED_BENEFITS';
export const PRINT_DISCOUNT_FLAG = 'ENABLE_MEMBER_PRINT_DISCOUNT';
export const READER_PICK_FLAG = 'ENABLE_READER_DIGITAL_PICK';
export const AUTHOR_SHELF_FLAG = 'ENABLE_AUTHOR_GUILD_SHELF';

const PLAN_SPECIFIC: Record<PlanCode, Array<[string, string | null]>> = {
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

/** Seed plan_benefits: manfaat peluncuran (tanpa flag) lalu manfaat khusus paket. */
export const DEFAULT_PLAN_BENEFITS: PlanBenefitRecord[] = DEFAULT_PLANS.flatMap((plan) => [
  ...LAUNCH_BENEFITS.map((key) => [key, null] as [string, string | null]),
  ...PLAN_SPECIFIC[plan.code]
].map(([benefitKey, featureFlag], index) => ({ planId: plan.id, benefitKey, sortOrder: (index + 1) * 10, featureFlag })));

/** Urutan tingkat paket untuk upgrade/downgrade. */
export const PLAN_RANK: Record<PlanCode, number> = { free: 0, reader: 1, professional: 2, author: 3 };
