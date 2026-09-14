import { describe, expect, it } from 'vitest';
import { memberPrintPrice as backendMemberPrintPrice } from '../../../backend/digital/membership/service';
import type { CartItem } from '../../types';
import { memberPrintPrice, printSubtotal, printUnitPrice, resolveMemberPrintPricing } from '../memberPrice';
import {
  isMembershipOfferDue,
  markMembershipOfferShown,
  MEMBERSHIP_OFFER_INTERVAL_MS,
  membershipOfferStorageKey,
  readMembershipOfferShownAt
} from '../membershipOffer';

const item = (harga: number, quantity: number, originalHarga?: number): CartItem => ({
  book: { harga, originalHarga } as CartItem['book'],
  quantity
});

describe('memberPrintPrice (fase 3 Langkah 7)', () => {
  it('sama dengan contoh di tes backend', () => {
    expect(memberPrintPrice(100000, null, 15)).toBe(85000);
    expect(memberPrintPrice(100000, 120000, 15)).toBeNull(); // promo lebih murah dari harga member
    expect(memberPrintPrice(110000, 120000, 15)).toBe(102000);
    expect(memberPrintPrice(100000, null, 0)).toBeNull();
    expect(memberPrintPrice(0, null, 15)).toBeNull(); // harga belum ditetapkan
  });

  it('identik dengan implementasi backend untuk berbagai harga', () => {
    const prices = [1, 999, 45000, 87500, 99999, 100000, 110000, 125050, 349000];
    const originals = [undefined, null, 0, 50000, 100000, 120000, 400000];
    for (const harga of prices) {
      for (const original of originals) {
        for (const percent of [-5, 0, 10, 15, 33, 100]) {
          expect(memberPrintPrice(harga, original, percent)).toBe(backendMemberPrintPrice(harga, original, percent));
        }
      }
    }
  });

  it('percent 0 = subtotal katalog persis seperti hitungan lama', () => {
    const items = [item(100000, 2), item(110000, 1, 120000), item(95000, 3, 90000)];
    const legacy = items.reduce((sum, i) => sum + i.book.harga * i.quantity, 0);
    expect(printSubtotal(items, 0)).toBe(legacy);
    expect(printUnitPrice(items[0].book, 0)).toBe(100000);
    // 85.000 x 2 + 102.000 + 80.750 x 3 (dasar 95.000, bukan harga coret yang lebih rendah)
    expect(printSubtotal(items, 15)).toBe(85000 * 2 + 102000 + 80750 * 3);
  });
});

describe('resolveMemberPrintPricing', () => {
  const plans = [
    { code: 'reader', printDiscountPercent: 10 },
    { code: 'professional', printDiscountPercent: 15 },
    { code: 'free', printDiscountPercent: 0 }
  ];

  it('endpoint gagal = tanpa diskon, status tidak diketahui', () => {
    expect(resolveMemberPrintPricing(null)).toEqual({ percent: 0, planCode: null, isActiveMember: null });
  });

  it('flag mati = tanpa diskon walau anggota aktif', () => {
    expect(resolveMemberPrintPricing({ plans, flags: { printDiscount: false }, current: { planCode: 'reader', status: 'active' } }))
      .toEqual({ percent: 0, planCode: null, isActiveMember: true });
  });

  it('flag aktif + anggota active/past_due/grace = persen paketnya', () => {
    for (const status of ['active', 'past_due', 'grace']) {
      expect(resolveMemberPrintPricing({ plans, flags: { printDiscount: true }, current: { planCode: 'professional', status } }))
        .toEqual({ percent: 15, planCode: 'professional', isActiveMember: true });
    }
  });

  it('bukan anggota aktif / tamu / paket tanpa diskon = tanpa diskon', () => {
    expect(resolveMemberPrintPricing({ plans, flags: { printDiscount: true }, current: { planCode: 'reader', status: 'expired' } }))
      .toEqual({ percent: 0, planCode: null, isActiveMember: false });
    expect(resolveMemberPrintPricing({ plans, flags: { printDiscount: true }, current: null }))
      .toEqual({ percent: 0, planCode: null, isActiveMember: false });
    expect(resolveMemberPrintPricing({ plans, flags: { printDiscount: true }, current: { planCode: 'free', status: 'active' } }))
      .toEqual({ percent: 0, planCode: null, isActiveMember: true });
  });
});

describe('tawaran keanggotaan setelah pembelian cetak', () => {
  const now = Date.UTC(2026, 8, 14);

  it('paling sering sekali per 30 hari', () => {
    expect(isMembershipOfferDue(null, now)).toBe(true);
    expect(isMembershipOfferDue(now - MEMBERSHIP_OFFER_INTERVAL_MS + 60_000, now)).toBe(false);
    expect(isMembershipOfferDue(now - MEMBERSHIP_OFFER_INTERVAL_MS, now)).toBe(true);
    expect(isMembershipOfferDue(now + 60_000, now)).toBe(true); // jam perangkat mundur
  });

  it('kunci per pengguna atau guest; localStorage tidak tersedia tidak melempar error', () => {
    expect(membershipOfferStorageKey('user-1')).not.toBe(membershipOfferStorageKey(null));
    expect(membershipOfferStorageKey(undefined)).toBe(membershipOfferStorageKey(null));
    expect(membershipOfferStorageKey(null)).toContain('guest');
    expect(() => markMembershipOfferShown('user-1', now)).not.toThrow();
    expect(readMembershipOfferShownAt('user-1')).toBeNull();
  });
});
