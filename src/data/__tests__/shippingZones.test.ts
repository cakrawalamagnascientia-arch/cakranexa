import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRINT_CHECKOUT_SETTINGS,
  DEFAULT_SHIPPING_ZONES,
  INDONESIA_PROVINCES,
  normalizeRegion,
  quoteShipping,
  resolveShippingZone,
  validatePrintCheckoutSettings
} from '../shippingZones';

const settings = DEFAULT_PRINT_CHECKOUT_SETTINGS;

describe('ongkir zona flat buku cetak', () => {
  it('38 provinsi, masing-masing tepat di satu zona bawaan', () => {
    expect(INDONESIA_PROVINCES).toHaveLength(38);
    for (const province of INDONESIA_PROVINCES) {
      expect(DEFAULT_SHIPPING_ZONES.filter((z) => z.provinces.includes(province)), province).toHaveLength(1);
    }
    expect('settings' in validatePrintCheckoutSettings(settings)).toBe(true);
  });

  it('zona dari provinsi; kota di daftar zona menimpa provinsi (Bogor/Depok/Tangerang/Bekasi = Jabodetabek)', () => {
    expect(resolveShippingZone(settings.zones, 'DKI Jakarta', 'Jakarta Pusat')?.id).toBe('jabodetabek');
    expect(resolveShippingZone(settings.zones, 'Jawa Barat', 'Kota Bogor')?.id).toBe('jabodetabek');
    expect(resolveShippingZone(settings.zones, 'Jawa Barat', 'Kab. Bekasi')?.id).toBe('jabodetabek');
    expect(resolveShippingZone(settings.zones, 'Banten', 'Kota Tangerang Selatan')?.id).toBe('jabodetabek');
    expect(resolveShippingZone(settings.zones, 'Jawa Barat', 'Bandung')?.id).toBe('jawa-barat-banten');
    expect(resolveShippingZone(settings.zones, 'Papua Selatan', 'Merauke')?.id).toBe('maluku-papua');
    expect(normalizeRegion('  Kabupaten   Bogor ')).toBe('bogor');
  });

  it('ongkir flat per pesanan; >= N eksemplar menunggu ongkir dari admin', () => {
    expect(quoteShipping(settings, { province: 'DKI Jakarta', city: 'Jakarta Selatan', copies: 1 })).toMatchObject({ kind: 'zone', fee: 15000 });
    expect(quoteShipping(settings, { province: 'DKI Jakarta', city: 'Jakarta Selatan', copies: 4 })).toMatchObject({ kind: 'zone', fee: 15000 });
    expect(quoteShipping(settings, { province: 'Sulawesi Selatan', city: 'Makassar', copies: 2 })).toMatchObject({ kind: 'zone', fee: 33000 });
    expect(quoteShipping(settings, { province: 'DKI Jakarta', city: 'Jakarta Selatan', copies: 5 })).toMatchObject({ kind: 'manual', minCopies: 5 });
    const perCopy = { ...settings, zones: settings.zones.map((z) => (z.id === 'jabodetabek' ? { ...z, extraPerCopy: 5000 } : z)) };
    expect(quoteShipping(perCopy, { province: 'DKI Jakarta', city: 'Jakarta Utara', copies: 3 })).toMatchObject({ kind: 'zone', fee: 25000 });
    expect(quoteShipping(settings, { province: 'Atlantis', city: '', copies: 1 }).kind).toBe('unknown_region');
  });

  it('validasi admin: provinsi ganda atau terlewat ditolak; N dan batas waktu dibatasi', () => {
    const doubled = { ...settings, zones: settings.zones.map((z) => (z.id === 'sumatera' ? { ...z, provinces: [...z.provinces, 'Bali'] } : z)) };
    expect(validatePrintCheckoutSettings(doubled)).toEqual({ error: expect.stringContaining('Bali masuk dua zona') });
    const missing = { ...settings, zones: settings.zones.filter((z) => z.id !== 'kalimantan') };
    expect(validatePrintCheckoutSettings(missing)).toEqual({ error: expect.stringContaining('Kalimantan Barat') });
    expect(validatePrintCheckoutSettings({ ...settings, manualQuoteMinCopies: 1 })).toEqual({ error: expect.any(String) });
    expect(validatePrintCheckoutSettings({ ...settings, transferDueHours: 0 })).toEqual({ error: expect.any(String) });
    expect(validatePrintCheckoutSettings({ ...settings, zones: [{ ...settings.zones[0], fee: -1 }, ...settings.zones.slice(1)] })).toEqual({ error: expect.any(String) });
  });

  it('RajaOngkir: cadangan bawaan tabel zona, kemasan 80 g, kuota 100/hari; lokasi asal, kurir, kemasan, kuota divalidasi', () => {
    expect(settings).toMatchObject({ fallbackMode: 'zone_table', origin: null, packagingGram: 80, dailyQuota: 100 });
    expect(settings.couriers).toEqual(['jne', 'pos', 'tiki', 'sicepat', 'jnt', 'anteraja']);
    const legacy = { zones: settings.zones, manualQuoteMinCopies: 5, uniqueCodeEnabled: true, transferDueHours: 24 };
    expect(validatePrintCheckoutSettings(legacy)).toEqual({ settings: { ...settings } });
    const valid = validatePrintCheckoutSettings({ ...settings, fallbackMode: 'hold_order', origin: { id: 17620, label: 'MENTENG, JAKARTA PUSAT' }, couriers: ['jne', 'jne', 'sicepat'], packagingGram: 150, dailyQuota: 1000 });
    expect(valid).toEqual({ settings: expect.objectContaining({ fallbackMode: 'hold_order', origin: { id: 17620, label: 'MENTENG, JAKARTA PUSAT' }, couriers: ['jne', 'sicepat'], packagingGram: 150, dailyQuota: 1000 }) });
    expect(validatePrintCheckoutSettings({ ...settings, fallbackMode: 'biteship' })).toEqual({ error: expect.any(String) });
    expect(validatePrintCheckoutSettings({ ...settings, dailyQuota: 0 })).toEqual({ error: expect.stringContaining('Kuota harian') });
    // Nama provinsi RajaOngkir dengan singkatan dalam kurung tetap cocok dengan zona.
    expect(normalizeRegion('NUSA TENGGARA BARAT (NTB)')).toBe('nusa tenggara barat');
    expect(resolveShippingZone(settings.zones, 'NUSA TENGGARA BARAT (NTB)', 'LOMBOK TIMUR')?.id).toBe('bali-nusa-tenggara');
    expect(resolveShippingZone(settings.zones, 'JAWA BARAT', 'BEKASI')?.id).toBe('jabodetabek');
    expect(validatePrintCheckoutSettings({ ...settings, origin: { id: 0, label: 'X' } })).toEqual({ error: expect.stringContaining('Lokasi asal') });
    expect(validatePrintCheckoutSettings({ ...settings, origin: { id: 5, label: ' ' } })).toEqual({ error: expect.stringContaining('Lokasi asal') });
    expect(validatePrintCheckoutSettings({ ...settings, couriers: [] })).toEqual({ error: expect.stringContaining('kurir') });
    expect(validatePrintCheckoutSettings({ ...settings, couriers: ['dhl'] })).toEqual({ error: expect.stringContaining('kurir') });
    expect(validatePrintCheckoutSettings({ ...settings, packagingGram: 6000 })).toEqual({ error: expect.stringContaining('kemasan') });
  });
});
