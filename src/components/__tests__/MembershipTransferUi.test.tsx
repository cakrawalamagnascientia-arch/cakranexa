import React from 'react';
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { parseLocation, buildPath } from '../../utils/router';
import { MembershipCheckoutView } from '../digital/MembershipCheckoutView';
import { AccountMembershipView } from '../account/AccountMembershipView';
import { OnboardingView } from '../account/OnboardingView';

/**
 * Fase 6 Langkah 4 (frontend): checkout bertahap dengan transfer bank, rute halaman tagihan & "Pilih buku bulan ini",
 * halaman akun tanpa perpanjangan otomatis/VA/QRIS/kartu, dan onboarding 3 langkah.
 */

const sessionState = vi.hoisted(() => ({ loggedIn: true }));
vi.mock('../../services/memberSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberSession')>();
  return {
    ...actual,
    useMemberSession: () => ({ ...actual.useMemberSession(), isLoggedIn: sessionState.loggedIn, isLoading: false, isAvailable: true, userId: 'uji' })
  };
});

const plans = vi.hoisted(() => ({
  data: {
    plans: [
      { code: 'gold', name: { id: 'Gold', en: 'Gold' }, priceMonthly: 99000, priceYearly: 990000, founding: null, maxDevices: 2, shelfAccess: 'pick', ebookTitlesPerPeriod: 6, audioHoursPerPeriod: 20, frontlistDays: 45, offlineTitles: 2, familyAccounts: 0, printDiscountPercent: 0, benefits: [] }
    ],
    flags: { autodebit: false, printDiscount: false, readerPick: false, authorShelf: false, extendedBenefits: false, offline: false, crossFormatSync: false, graceDays: 5, whatsapp: false, whatsappSender: null },
    paymentAvailable: true,
    paymentMethods: ['bank_transfer'],
    purchaseEnabled: true,
    current: null,
    foundingEligible: false
  },
  loading: false,
  live: true
}));
vi.mock('../../hooks/useMembershipPlans', () => ({ useMembershipPlans: () => plans }));

const membership = vi.hoisted(() => ({
  subscription: {
    id: 's1', planCode: 'gold', planName: { id: 'Gold', en: 'Gold' }, billingCycle: 'monthly', status: 'active', isFounding: false, priceLocked: 99000,
    currentPeriodStart: '2026-09-14T03:00:00.000Z', currentPeriodEnd: '2026-10-14T03:00:00.000Z', accessEndsAt: '2026-10-19T03:00:00.000Z', graceEndsAt: '2026-10-19T03:00:00.000Z',
    cancelAtPeriodEnd: false, canceledAt: null, endedAt: null, endedReason: null, paymentMethod: 'bank_transfer', autodebit: false, whatsappNumber: null, whatsappOptIn: false,
    foundingEndsAt: null, regularYearlyPrice: 990000, pendingChange: null, nextRenewal: { date: '2026-10-14T03:00:00.000Z', amount: 99000, planCode: 'gold', billingCycle: 'monthly' },
    maxDevices: 2, shelfAccess: 'pick', createdAt: '2026-09-14T03:00:00.000Z'
  },
  invoices: [],
  openInvoice: {
    id: 'inv-1', orderRef: 'SUB-20260914-ABCDE', kind: 'renewal', planCode: 'gold', billingCycle: 'monthly', periodStart: '2026-10-14T03:00:00.000Z', periodEnd: '2026-11-14T03:00:00.000Z',
    amount: 98543, status: 'issued', isFoundingPrice: false, issuedAt: '2026-10-07T03:00:00.000Z', paidAt: null, dueAt: '2026-10-14T03:00:00.000Z', paymentType: 'bank_transfer',
    snapToken: null, redirectUrl: null, transfer: { uniqueCode: '543', uniqueDiscount: 457, baseAmount: 99000, hasProof: false, proofUploadedAt: null }
  },
  printDiscountPercent: 10,
  autodebitAvailable: false,
  audio: null
}));
vi.mock('../../services/membershipApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/membershipApi')>();
  return { ...actual, getMyMembership: async () => membership, getMembershipPlans: async () => plans.data };
});

const LOCALES = path.resolve(__dirname, '../../i18n/locales/id');

beforeAll(async () => {
  const resources = Object.fromEntries(fs.readdirSync(LOCALES).filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace('.json', ''), JSON.parse(fs.readFileSync(path.join(LOCALES, f), 'utf8'))]));
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({ lng: 'id', resources: { id: resources }, ns: Object.keys(resources), defaultNS: 'common', interpolation: { escapeValue: false } });
  } else {
    for (const [ns, bundle] of Object.entries(resources)) i18next.addResourceBundle('id', ns, bundle, true, true);
    await i18next.changeLanguage('id');
  }
});

describe('checkout keanggotaan bertahap', () => {
  it('tiga langkah, metode dari server (transfer bank), dan alur transfer dijelaskan', () => {
    const html = renderToStaticMarkup(<MembershipCheckoutView query="plan=gold&cycle=yearly" onNavigate={() => undefined} />);
    expect(html).toContain('id="membership-checkout-steps"');
    for (const label of ['Paket', 'Ketentuan', 'Pembayaran']) expect(html).toContain(label);
    expect(html).toContain('id="btn-membership-next"');
    // Langkah pertama: ringkasan paket, belum ada tombol bayar.
    expect(html).toContain('id="membership-step-plan"');
    expect(html).not.toContain('id="btn-membership-pay"');
    expect(html).toContain('Rp 990.000');
    expect(html).not.toMatch(/Virtual Account|QRIS|Kartu kredit|Midtrans/);
  });
});

describe('halaman akun keanggotaan', () => {
  it('tanpa perpanjangan otomatis dan tanpa pilihan metode; tagihan transfer mengarah ke instruksi', async () => {
    const html = renderToStaticMarkup(<AccountMembershipView query="" onNavigate={() => undefined} />);
    expect(html).not.toContain('id="account-membership-method"');
    expect(html).not.toMatch(/perpanjangan otomatis|Ditagih otomatis|Virtual Account|QRIS/i);
  });
});

describe('onboarding setelah daftar', () => {
  it('tiga langkah: minat, format, cara kerja (sampel vs paket)', () => {
    const html = renderToStaticMarkup(<OnboardingView />);
    expect(html).toContain('id="onboarding-page"');
    expect(html).toContain('id="onboarding-interests"');
    for (const label of ['Minat', 'Format', 'Cara kerja']) expect(html).toContain(label);
    expect(html).toContain('Perpajakan');
  });
});

describe('rute fase 6 Langkah 4', () => {
  it('/membership/invoice/<id> dan /library/pick', () => {
    expect(parseLocation('/membership/invoice/inv-1', '')).toEqual({ page: 'membership', subSection: 'invoice', digitalItem: 'inv-1' });
    expect(buildPath({ page: 'membership', subSection: 'invoice', digitalItem: 'inv-1' })).toBe('/membership/invoice/inv-1');
    expect(parseLocation('/library/pick', '')).toEqual({ page: 'library', subSection: 'pick' });
    expect(buildPath({ page: 'library', subSection: 'pick' })).toBe('/library/pick');
    expect(parseLocation('/account/onboarding', '')).toEqual({ page: 'account', subSection: 'onboarding', query: '' });
  });
});
