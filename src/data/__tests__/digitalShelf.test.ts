import { describe, expect, it } from 'vitest';
import {
  categoryShelves,
  comingSoon,
  frontlistDaysByPlan,
  inclusionBadge,
  jakartaToday,
  newArrivals,
  openDateFor,
  popularEntries,
  viewerFrontlistDays
} from '../digitalShelf';
import { FALLBACK_MEMBERSHIP } from '../membership';
import type { DigitalProduct } from '../../types';

const product = (over: Partial<DigitalProduct>): DigitalProduct => ({
  id: 'p', bookId: 'b', format: 'ebook', price: 0, isActive: true, availabilityStatus: 'available', shelfEntryDate: '2026-01-01',
  pageCount: 100, durationSeconds: null, narrator: null, samplePageStart: 1, samplePageEnd: 10, sampleAudioSeconds: 300,
  sampleImageUrls: [], sampleAudioUrl: null, ...over
});
const entry = (id: string, over: Partial<DigitalProduct>, category = 'Perpajakan') => ({ product: product({ id, ...over }), book: { category } });
const TODAY = '2026-09-14';
const FRONTLIST = frontlistDaysByPlan(FALLBACK_MEMBERSHIP.plans);

describe('rak digital fase 6', () => {
  it('hari frontlist per paket dari data paket; tanggal hari ini menurut WIB', () => {
    expect(FRONTLIST).toEqual({ silver: 90, gold: 45, platinum: 0 });
    expect(frontlistDaysByPlan([{ code: 'gold', frontlistDays: 30 }])).toEqual({ silver: 90, gold: 30, platinum: 0 });
    expect(jakartaToday(new Date('2026-09-13T17:30:00.000Z'))).toBe('2026-09-14');
    expect(openDateFor(product({ shelfEntryDate: '2026-08-15' }), 45)).toBe('2026-09-29');
  });

  it('badge: paket termurah yang sudah membuka judul; Sampel bila belum terbuka; Segera bila belum tersedia', () => {
    expect(inclusionBadge(product({ shelfEntryDate: '2026-01-01' }), TODAY, FRONTLIST)).toEqual({ kind: 'plan', plan: 'silver' });
    expect(inclusionBadge(product({ shelfEntryDate: '2026-07-01' }), TODAY, FRONTLIST)).toEqual({ kind: 'plan', plan: 'gold' });
    expect(inclusionBadge(product({ shelfEntryDate: '2026-09-14' }), TODAY, FRONTLIST)).toEqual({ kind: 'plan', plan: 'platinum' });
    expect(inclusionBadge(product({ shelfEntryDate: '2026-10-01' }), TODAY, FRONTLIST)).toEqual({ kind: 'sample' });
    expect(inclusionBadge(product({ shelfEntryDate: null }), TODAY, FRONTLIST)).toEqual({ kind: 'sample' });
    expect(inclusionBadge(product({ format: 'audiobook', shelfEntryDate: '2026-10-01' }), TODAY, FRONTLIST)).toEqual({ kind: 'soon', date: '2026-10-01' });
    expect(inclusionBadge(product({ availabilityStatus: 'coming_soon', shelfEntryDate: null }), TODAY, FRONTLIST)).toEqual({ kind: 'soon', date: null });
  });

  it('paket pengguna menentukan tanggal "Segera masuk rak"; pengunjung memakai Platinum', () => {
    expect(viewerFrontlistDays('gold', FRONTLIST)).toEqual({ plan: 'gold', days: 45 });
    expect(viewerFrontlistDays(null, FRONTLIST)).toEqual({ plan: 'platinum', days: 0 });
    expect(viewerFrontlistDays('blue', FRONTLIST)).toEqual({ plan: 'platinum', days: 0 });
    const entries = [
      entry('lama', { shelfEntryDate: '2026-01-01' }),
      entry('30hari', { shelfEntryDate: '2026-08-15' }),
      entry('bulan-depan', { shelfEntryDate: '2026-10-10' }),
      entry('tanpa-tanggal', { shelfEntryDate: null })
    ];
    expect(comingSoon(entries, TODAY, 45).map((e) => [e.product.id, e.openDate])).toEqual([['30hari', '2026-09-29'], ['bulan-depan', '2026-11-24']]);
    expect(comingSoon(entries, TODAY, 0).map((e) => e.product.id)).toEqual(['bulan-depan']);
  });

  it('baru masuk rak (60 hari), populer (urutan server), dan rak per kategori', () => {
    const entries = [
      entry('a', { shelfEntryDate: '2026-09-01' }, 'Hukum'),
      entry('b', { shelfEntryDate: '2026-08-15' }),
      entry('c', { shelfEntryDate: '2026-05-01' }),
      entry('d', { shelfEntryDate: '2026-09-20' }),
      entry('e', { shelfEntryDate: '2026-09-10', availabilityStatus: 'coming_soon' })
    ];
    expect(newArrivals(entries, TODAY).map((e) => e.product.id)).toEqual(['a', 'b']);
    expect(popularEntries(entries, ['c', 'tidak-ada', 'a']).map((e) => e.product.id)).toEqual(['c', 'a']);
    expect(categoryShelves(entries, ['Perpajakan', 'Akuntansi', 'Hukum']).map((s) => [s.category, s.items.map((i) => i.product.id)]))
      .toEqual([['Perpajakan', ['b', 'c', 'd']], ['Hukum', ['a']]]);
  });
});
