import { describe, expect, it } from 'vitest';
import {
  ANNUAL_BILLED_MONTHS,
  DIGITAL_SHELF_PLANS,
  FALLBACK_MEMBERSHIP,
  INSTITUTION_TIERS,
  LAUNCH_BENEFIT_KEYS,
  MEMBERSHIP_BENEFIT_KEYS,
  MEMBERSHIP_ECONOMICS,
  MEMBERSHIP_WALLETS,
  acquisitionWalletAmount,
  institutionAnnualPrice,
  institutionCatalogPercent,
  nominalCashBenefitsPerYear
} from '../membership';
import { DEFAULT_PLANS, DEFAULT_PLAN_BENEFITS, LAUNCH_BENEFITS } from '../../../backend/digital/membership/plans';
import type { PlanCode } from '../../services/membershipApi';

/** Angka di sini sama dengan brief fase 3 / dokumen owner; seed server (plans.ts) adalah sumber kebenaran. */
const plan = (code: PlanCode) => FALLBACK_MEMBERSHIP.plans.find((p) => p.code === code)!;
const tier = (key: string) => INSTITUTION_TIERS.find((t) => t.key === key)!;

describe('paket individu (brief fase 3)', () => {
  it('harga reguler bulanan/tahunan (tahunan = 10 × bulanan)', () => {
    expect(ANNUAL_BILLED_MONTHS).toBe(10);
    expect(FALLBACK_MEMBERSHIP.plans.map((p) => [p.code, p.priceMonthly, p.priceYearly])).toEqual([
      ['free', 0, 0],
      ['reader', 39_000, 390_000],
      ['professional', 99_000, 990_000],
      ['author', 149_000, 1_490_000]
    ]);
  });

  it('harga Founding tahun pertama dan kuotanya', () => {
    expect(plan('reader').founding).toEqual({ priceYearly: 299_000, cap: 1000, remaining: null });
    expect(plan('professional').founding).toEqual({ priceYearly: 790_000, cap: 500, remaining: null });
    expect(plan('author').founding).toEqual({ priceYearly: 1_190_000, cap: 250, remaining: null });
    expect(plan('free').founding).toBeNull();
  });

  it('data cadangan frontend sama dengan seed server (harga, Founding, perangkat)', () => {
    expect(FALLBACK_MEMBERSHIP.plans.map((p) => ({
      code: p.code, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly,
      foundingPriceYearly: p.founding?.priceYearly ?? null, foundingCap: p.founding?.cap ?? null, maxDevices: p.maxDevices
    }))).toEqual(DEFAULT_PLANS.map((p) => ({
      code: p.code, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly,
      foundingPriceYearly: p.foundingPriceYearly, foundingCap: p.foundingCap, maxDevices: p.maxDevices
    })));
  });

  it('manfaat cadangan = manfaat server saat semua flag mati; Reader 1 perangkat, Author 2', () => {
    expect(LAUNCH_BENEFIT_KEYS).toEqual([...LAUNCH_BENEFITS]);
    for (const p of DEFAULT_PLANS) {
      const flagsOff = DEFAULT_PLAN_BENEFITS
        .filter((b) => b.planId === p.id && (b.featureFlag === null || b.featureFlag.startsWith('!')))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((b) => b.benefitKey);
      expect(plan(p.code).benefits).toEqual(flagsOff);
    }
    expect(plan('reader').maxDevices).toBe(1);
    expect(plan('author').maxDevices).toBe(2);
    // Semua kunci manfaat server punya teks di frontend.
    for (const b of DEFAULT_PLAN_BENEFITS) expect(MEMBERSHIP_BENEFIT_KEYS).toContain(b.benefitKey);
  });

  it('akses digital tanpa flag: hanya Professional membuka Digital Reading Shelf', () => {
    expect(DIGITAL_SHELF_PLANS.map((p) => p.code)).toEqual(['professional']);
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

  it('harga berlaku, Founding −15%, dan acquisition wallet 40% dari biaya yang dibayar', () => {
    expect(INSTITUTION_TIERS.map((t) => institutionAnnualPrice(t, 23))).toEqual([3_960_000, 9_960_000, 23_960_000, null]);
    expect(INSTITUTION_TIERS.map((t) => institutionAnnualPrice(t, 23, true))).toEqual([3_366_000, 8_466_000, 20_366_000, null]);
    expect(institutionAnnualPrice(tier('campus'), 150)).toBe(24_900_000);
    expect(acquisitionWalletAmount(institutionAnnualPrice(tier('campus'), 150)!)).toBe(9_960_000);
    expect(acquisitionWalletAmount(institutionAnnualPrice(tier('starter'), 23, true)!)).toBe(1_346_400);
  });
});
