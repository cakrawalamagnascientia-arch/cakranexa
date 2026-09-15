import { describe, expect, it } from 'vitest';
import { destinationAddress, etdDays, rateDescription, regionName, sortRates, type ShippingRate } from '../shippingRates';

const rate = (courier: string, service: string, cost: number): ShippingRate => ({ courier, courierName: courier.toUpperCase(), service, description: '', cost, etd: '' });

describe('format ongkir RajaOngkir', () => {
  it('estimasi hari dari teks RajaOngkir', () => {
    expect(etdDays('2-3 day')).toBe('2-3');
    expect(etdDays('1-2 HARI')).toBe('1-2');
    expect(etdDays('3')).toBe('3');
    expect(etdDays('1-1 day')).toBe('1');
    expect(etdDays('')).toBeNull();
  });

  it('nama wilayah huruf besar -> huruf wajar, singkatan provinsi tetap', () => {
    expect(regionName('DKI JAKARTA')).toBe('DKI Jakarta');
    expect(regionName('DI YOGYAKARTA')).toBe('DI Yogyakarta');
    expect(regionName('KOTA  ADM. JAKARTA PUSAT')).toBe('Kota Adm. Jakarta Pusat');
    expect(regionName('NUSA TENGGARA BARAT (NTB)')).toBe('Nusa Tenggara Barat (NTB)');
    expect(regionName('BOGOR BARAT - KOTA')).toBe('Bogor Barat - Kota');
    // Keterangan layanan dari respons RajaOngkir sungguhan: POS mengirim "240" (tidak tampil).
    expect(rateDescription({ service: 'Pos Reguler', description: '240' })).toBe('');
    expect(rateDescription({ service: 'REG', description: 'REG' })).toBe('');
    expect(rateDescription({ service: 'REG', description: 'Layanan Reguler' })).toBe('Layanan Reguler');
    expect(destinationAddress({ id: 1, label: '', subdistrict: 'KWITANG', district: 'SENEN', city: 'JAKARTA PUSAT', province: 'DKI JAKARTA', zipCode: '10420' }))
      .toBe('Kwitang, Senen, Jakarta Pusat, DKI Jakarta');
    expect(destinationAddress({ id: 1, label: '', subdistrict: 'SENEN', district: 'SENEN', city: 'JAKARTA PUSAT', province: 'DKI JAKARTA', zipCode: '10410' }))
      .toBe('Senen, Jakarta Pusat, DKI Jakarta');
  });

  it('tarif termurah dulu, urutan stabil untuk tarif sama', () => {
    const sorted = sortRates([rate('pos', 'REG', 21000), rate('jne', 'YES', 36000), rate('tiki', 'REG', 18000), rate('jne', 'REG', 18000)]);
    expect(sorted.map((r) => `${r.courier}:${r.service}`)).toEqual(['jne:REG', 'tiki:REG', 'pos:REG', 'jne:YES']);
  });
});
