import { describe, expect, it } from 'vitest';
import { addBusinessDaysWib, USD_DUE_BUSINESS_DAYS } from '../printCheckout/businessDays';

describe('batas waktu transfer USD: hari kerja WIB', () => {
  it('melewati Sabtu-Minggu dan mempertahankan jam', () => {
    expect(USD_DUE_BUSINESS_DAYS).toBe(5);
    // Selasa 10:00 WIB -> Selasa berikutnya 10:00 WIB
    expect(addBusinessDaysWib(new Date('2026-09-15T03:00:00.000Z'), 5).toISOString()).toBe('2026-09-22T03:00:00.000Z');
    // Jumat 16:00 WIB + 1 -> Senin 16:00 WIB
    expect(addBusinessDaysWib(new Date('2026-09-18T09:00:00.000Z'), 1).toISOString()).toBe('2026-09-21T09:00:00.000Z');
    // Sabtu 10:00 WIB + 5 -> Jumat 10:00 WIB
    expect(addBusinessDaysWib(new Date('2026-09-19T03:00:00.000Z'), 5).toISOString()).toBe('2026-09-25T03:00:00.000Z');
  });

  it('hari dihitung menurut kalender WIB, bukan UTC', () => {
    // Jumat 23:30 WIB (= Jumat 16:30 UTC) + 1 -> Senin 23:30 WIB
    expect(addBusinessDaysWib(new Date('2026-09-18T16:30:00.000Z'), 1).toISOString()).toBe('2026-09-21T16:30:00.000Z');
    // Minggu 06:00 WIB (= Sabtu 23:00 UTC) + 1 -> Senin 06:00 WIB
    expect(addBusinessDaysWib(new Date('2026-09-19T23:00:00.000Z'), 1).toISOString()).toBe('2026-09-20T23:00:00.000Z');
  });
});
