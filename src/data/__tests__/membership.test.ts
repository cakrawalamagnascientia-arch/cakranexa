import { describe, expect, it } from 'vitest';
import {
  ANNUAL_BILLED_MONTHS,
  FALLBACK_MEMBERSHIP,
  INSTITUTION_TIERS,
  LAUNCH_BENEFIT_KEYS,
  MEMBERSHIP_BENEFIT_KEYS,
  MEMBERSHIP_ECONOMICS,
  MEMBERSHIP_FAQ_KEYS,
  MEMBERSHIP_WALLETS,
  acquisitionWalletAmount,
  institutionAnnualPrice,
  institutionCatalogPercent,
  nominalCashBenefitsPerYear
} from '../membership';
import { PHASE6_PLAN_BENEFITS, PHASE6_PLANS } from '../../../backend/digital/membership/plans';
import type { PlanCode } from '../../services/membershipApi';

/** Paket fase 6 (skema terkunci); seed server (plans.ts) adalah sumber kebenaran. Wallet & institusi dari dokumen owner. */
const plan = (code: PlanCode) => FALLBACK_MEMBERSHIP.plans.find((p) => p.code === code)!;
const tier = (key: string) => INSTITUTION_TIERS.find((t) => t.key === key)!;

describe('paket individu (skema terkunci fase 6)', () => {
  it('Blue gratis, Silver 49.000, Gold 99.000, Platinum 199.000; tahunan = 10 × bulanan; tanpa Founding perorangan', () => {
    expect(ANNUAL_BILLED_MONTHS).toBe(10);
    expect(FALLBACK_MEMBERSHIP.plans.map((p) => [p.code, p.priceMonthly, p.priceYearly])).toEqual([
      ['blue', 0, 0],
      ['silver', 49_000, 490_000],
      ['gold', 99_000, 990_000],
      ['platinum', 199_000, 1_990_000]
    ]);
    expect(FALLBACK_MEMBERSHIP.plans.every((p) => p.founding === null && p.maxDevices === 2)).toBe(true);
  });

  it('kuota: judul, jam audio, frontlist, offline, akun keluarga', () => {
    expect(FALLBACK_MEMBERSHIP.plans.map((p) => [p.code, p.ebookTitlesPerPeriod, p.audioHoursPerPeriod, p.frontlistDays, p.offlineTitles, p.familyAccounts])).toEqual([
      ['blue', null, null, null, 0, 0],
      ['silver', 2, 5, 90, 0, 0],
      ['gold', 6, 20, 45, 2, 0],
      ['platinum', null, 60, 0, 5, 2]
    ]);
  });

  it('data cadangan frontend sama dengan seed server (harga, kuota, perangkat)', () => {
    const shape = (p: { code: string; priceMonthly: number; priceYearly: number; maxDevices: number; shelfAccess: string; ebookTitlesPerPeriod: number | null; audioHoursPerPeriod: number | null; frontlistDays: number | null; offlineTitles: number; familyAccounts: number }) => ({
      code: p.code, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly, maxDevices: p.maxDevices, shelfAccess: p.shelfAccess,
      ebookTitlesPerPeriod: p.ebookTitlesPerPeriod, audioHoursPerPeriod: p.audioHoursPerPeriod, frontlistDays: p.frontlistDays,
      offlineTitles: p.offlineTitles, familyAccounts: p.familyAccounts
    });
    expect(FALLBACK_MEMBERSHIP.plans.map(shape)).toEqual(PHASE6_PLANS.map(shape));
    expect(PHASE6_PLANS.every((p) => p.foundingPriceYearly === null && p.foundingCap === null)).toBe(true);
  });

  it('diskon buku cetak anggota (proposal): Silver 5%, Gold 10%, Platinum 20%', () => {
    expect(PHASE6_PLANS.map((p) => [p.code, p.printDiscountPercent])).toEqual([['blue', 0], ['silver', 5], ['gold', 10], ['platinum', 20]]);
  });

  it('FAQ menjelaskan sampel (tanpa uji coba), jatah, jam audio, perangkat, dan keluarga; tanpa Founding', () => {
    expect(MEMBERSHIP_FAQ_KEYS).toEqual(expect.arrayContaining(['samples', 'titleQuota', 'audioHours', 'devices', 'family', 'unitPurchase']));
    expect(MEMBERSHIP_FAQ_KEYS).not.toContain('founding');
  });

  it('manfaat cadangan = manfaat server saat semua flag mati; semua kunci punya teks', () => {
    expect(LAUNCH_BENEFIT_KEYS).toContain('samples');
    for (const p of PHASE6_PLANS) {
      const flagsOff = PHASE6_PLAN_BENEFITS
        .filter((b) => b.planId === p.id && (b.featureFlag === null || b.featureFlag.startsWith('!')))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((b) => b.benefitKey);
      expect(plan(p.code).benefits).toEqual(flagsOff);
    }
    for (const b of PHASE6_PLAN_BENEFITS) expect(MEMBERSHIP_BENEFIT_KEYS).toContain(b.benefitKey);
  });

  it('akses digital tanpa flag: hanya Platinum membuka seluruh rak', () => {
    expect(FALLBACK_MEMBERSHIP.plans.filter((p) => p.shelfAccess === 'full').map((p) => p.code)).toEqual(['platinum']);
    expect(FALLBACK_MEMBERSHIP.flags).toMatchObject({ readerPick: false, authorShelf: false, printDiscount: false, extendedBenefits: false });
    expect(FALLBACK_MEMBERSHIP.purchaseEnabled).toBe(false);
  });

  it('wallet dan minimum belanja sesuai contoh owner (bab 9.2); rasionya tercatat sebagai inkonsistensi A8', () => {
    expect(Object.entries(MEMBERSHIP_WALLETS).map(([code, w]) => [code, w.amount, w.period, w.minPurchase])).toEqual([
      ['reader', 25_000, 'month', 149_000],
      ['professional', 50_000, 'quarter', 249_000],
      ['author', 75_000, 'quarter', 350_000]
    ]);
    const multiples = Object.values(MEMBERSHIP_WALLETS).map((w) => Math.round((w.minPurchase / w.amount) * 100) / 100);
    expect(multiples).toEqual([5.96, 4.98, 4.67]);
    expect(multiples.filter((m) => m >= MEMBERSHIP_ECONOMICS.voucherMinPurchaseMultiple.min)).toEqual([5.96]);
  });

  it('nominal manfaat tunai per tahun (dasar hitungan batas biaya 35% di dokumen keputusan)', () => {
    const ratio = (code: 'reader' | 'professional' | 'author', price: number, billing: 'monthly' | 'annual') =>
      Math.round((nominalCashBenefitsPerYear(code, billing) / price) * 1000) / 10;
    expect(nominalCashBenefitsPerYear('reader', 'annual')).toBe(300_000);
    expect(nominalCashBenefitsPerYear('professional', 'annual')).toBe(350_000);
    expect(nominalCashBenefitsPerYear('professional', 'monthly')).toBe(200_000);
    expect(nominalCashBenefitsPerYear('author', 'annual')).toBe(300_000);
    expect(ratio('reader', 390_000, 'annual')).toBe(76.9);
    expect(ratio('reader', 299_000, 'annual')).toBe(100.3);
    expect(ratio('professional', 990_000, 'annual')).toBe(35.4);
    expect(ratio('professional', 790_000, 'annual')).toBe(44.3);
    expect(ratio('author', 1_490_000, 'annual')).toBe(20.1);
    expect(ratio('author', 1_190_000, 'annual')).toBe(25.2);
  });
});

describe('Institution & Library Network (dokumen owner 7.2–7.6)', () => {
  it('pengguna bersamaan dan harga penuh per tingkat', () => {
    expect(INSTITUTION_TIERS.map((t) => [t.key, t.concurrentUsers, t.annualPrice])).toEqual([
      ['starter', 5, 9_900_000],
      ['campus', 20, 24_900_000],
      ['network', 50, 59_900_000],
      ['consortium', null, null]
    ]);
  });

  it('penyesuaian harga menurut jumlah judul digital', () => {
    expect([0, 23, 49, 50, 99, 100, 149, 150, 400].map(institutionCatalogPercent)).toEqual([40, 40, 40, 60, 60, 80, 80, 100, 100]);
  });

  it('harga berlaku, Founding −15%, dan kredit institusi 20% dari biaya yang dibayar (fase 6)', () => {
    expect(INSTITUTION_TIERS.map((t) => institutionAnnualPrice(t, 23))).toEqual([3_960_000, 9_960_000, 23_960_000, null]);
    expect(INSTITUTION_TIERS.map((t) => institutionAnnualPrice(t, 23, true))).toEqual([3_366_000, 8_466_000, 20_366_000, null]);
    expect(institutionAnnualPrice(tier('campus'), 150)).toBe(24_900_000);
    expect(acquisitionWalletAmount(institutionAnnualPrice(tier('campus'), 150)!)).toBe(4_980_000);
    expect(acquisitionWalletAmount(institutionAnnualPrice(tier('starter'), 23, true)!)).toBe(673_200);
  });
});
