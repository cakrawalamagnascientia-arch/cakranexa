import { DEFAULT_COURIERS, isCourierCode } from './shippingRates';

/**
 * Pengaturan checkout buku cetak (tabel print_checkout_settings; dipakai server dan browser).
 * Sumber ongkir: tarif kurir RajaOngkir (src/data/shippingRates.ts, backend/printCheckout/rajaongkir.ts).
 * Tabel zona flat di file ini adalah CADANGAN (fallbackMode 'zone_table') saat tarif kurir tidak tersedia atau kuota
 * harian habis; pesanannya ditandai zone_fallback agar admin bisa mengoreksi. Zona ditentukan dari provinsi yang
 * dipilih pembeli; daftar kota di zona menimpa provinsi (mis. Kota/Kabupaten Bogor di Jawa Barat masuk zona
 * Jabodetabek). Pesanan >= manualQuoteMinCopies eksemplar tidak dihitung otomatis: statusnya "menunggu ongkir" dan
 * admin mengisi ongkir sebelum tagihan dikirim.
 */

export const INDONESIA_PROVINCES = [
  'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Sumatera Selatan',
  'Kepulauan Bangka Belitung', 'Bengkulu', 'Lampung',
  'DKI Jakarta', 'Jawa Barat', 'Banten', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur',
  'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur',
  'Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara',
  'Sulawesi Utara', 'Gorontalo', 'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tenggara',
  'Maluku', 'Maluku Utara',
  'Papua', 'Papua Barat', 'Papua Barat Daya', 'Papua Tengah', 'Papua Pegunungan', 'Papua Selatan'
] as const;

export type IndonesiaProvince = (typeof INDONESIA_PROVINCES)[number];

export interface ShippingZone {
  id: string;
  name: string;
  /** Ongkir flat per pesanan (Rupiah). */
  fee: number;
  /** Tambahan per eksemplar setelah eksemplar pertama (0 = benar-benar flat). */
  extraPerCopy: number;
  provinces: string[];
  /** Kota/kabupaten yang masuk zona ini walau provinsinya di zona lain (tanpa awalan "Kota"/"Kabupaten"). */
  cities: string[];
}

/** Saat tarif RajaOngkir tidak tersedia (API key/lokasi asal belum diatur, API gagal, kuota harian habis). */
export type ShippingFallbackMode = 'zone_table' | 'hold_order';

/** Lokasi pengiriman (gudang) = kecamatan/kelurahan asal di RajaOngkir. */
export interface ShippingOrigin {
  id: number;
  label: string;
}

export interface PrintCheckoutSettings {
  /** zone_table = ongkir estimasi dari tabel zona (pesanan ditandai zone_fallback); hold_order = menunggu ongkir dari admin. */
  fallbackMode: ShippingFallbackMode;
  /** null = belum diatur admin: checkout memakai cadangan sampai lokasi asal diisi. */
  origin: ShippingOrigin | null;
  /** Kurir yang ditawarkan (kode RajaOngkir), dikirim sekaligus dalam satu permintaan. */
  couriers: string[];
  /** Tambahan berat kemasan per pesanan (gram) di atas berat buku dari katalog. */
  packagingGram: number;
  /** Batas permintaan API RajaOngkir per hari (paket Starter: 100); habis -> cadangan tanpa memanggil API. */
  dailyQuota: number;
  zones: ShippingZone[];
  /** Pesanan dengan jumlah eksemplar >= angka ini menunggu ongkir dari admin. */
  manualQuoteMinCopies: number;
  /** Kode unik 3 digit pada nominal transfer (dipotong dari total, tidak pernah menambah tagihan). */
  uniqueCodeEnabled: boolean;
  /** Batas waktu transfer sejak tagihan terbit (jam). */
  transferDueHours: number;
}

export const DEFAULT_SHIPPING_ZONES: ShippingZone[] = [
  { id: 'jabodetabek', name: 'Jabodetabek', fee: 15000, extraPerCopy: 0, provinces: ['DKI Jakarta'], cities: ['Bogor', 'Depok', 'Tangerang', 'Tangerang Selatan', 'Bekasi'] },
  { id: 'jawa-barat-banten', name: 'Jawa Barat & Banten', fee: 18000, extraPerCopy: 0, provinces: ['Jawa Barat', 'Banten'], cities: [] },
  { id: 'jawa-tengah-diy', name: 'Jawa Tengah & DI Yogyakarta', fee: 20000, extraPerCopy: 0, provinces: ['Jawa Tengah', 'DI Yogyakarta'], cities: [] },
  { id: 'jawa-timur', name: 'Jawa Timur', fee: 21000, extraPerCopy: 0, provinces: ['Jawa Timur'], cities: [] },
  {
    id: 'sumatera', name: 'Sumatera', fee: 25000, extraPerCopy: 0, cities: [],
    provinces: ['Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Sumatera Selatan', 'Kepulauan Bangka Belitung', 'Bengkulu', 'Lampung']
  },
  { id: 'bali-nusa-tenggara', name: 'Bali & Nusa Tenggara', fee: 26000, extraPerCopy: 0, provinces: ['Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur'], cities: [] },
  {
    id: 'kalimantan', name: 'Kalimantan', fee: 30000, extraPerCopy: 0, cities: [],
    provinces: ['Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara']
  },
  {
    id: 'sulawesi', name: 'Sulawesi', fee: 33000, extraPerCopy: 0, cities: [],
    provinces: ['Sulawesi Utara', 'Gorontalo', 'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tenggara']
  },
  {
    id: 'maluku-papua', name: 'Maluku & Papua', fee: 42000, extraPerCopy: 0, cities: [],
    provinces: ['Maluku', 'Maluku Utara', 'Papua', 'Papua Barat', 'Papua Barat Daya', 'Papua Tengah', 'Papua Pegunungan', 'Papua Selatan']
  }
];

export const DEFAULT_PRINT_CHECKOUT_SETTINGS: PrintCheckoutSettings = {
  fallbackMode: 'zone_table',
  origin: null,
  couriers: DEFAULT_COURIERS,
  packagingGram: 80,
  dailyQuota: 100,
  zones: DEFAULT_SHIPPING_ZONES,
  manualQuoteMinCopies: 5,
  uniqueCodeEnabled: true,
  transferDueHours: 24
};

/** "Kota Bogor", "Kab. Bogor", " bogor " -> "bogor". */
export const normalizeRegion = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // RajaOngkir: "NUSA TENGGARA BARAT (NTB)"
    .replace(/[.,/()]/g, ' ')
    .replace(/^\s*(provinsi|prov|kota adm|kota administrasi|kabupaten administrasi|kabupaten|kab|kota)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();

export const isIndonesiaProvince = (value: unknown): value is IndonesiaProvince =>
  (INDONESIA_PROVINCES as readonly string[]).includes(String(value));

export const resolveShippingZone = (zones: ShippingZone[], province: string, city: string): ShippingZone | null => {
  const cityKey = normalizeRegion(city);
  if (cityKey) {
    const byCity = zones.find((zone) => zone.cities.some((c) => normalizeRegion(c) === cityKey));
    if (byCity) return byCity;
  }
  const provinceKey = normalizeRegion(province);
  return zones.find((zone) => zone.provinces.some((p) => normalizeRegion(p) === provinceKey)) ?? null;
};

export type ShippingQuote =
  | { kind: 'zone'; zoneId: string; zoneName: string; fee: number; copies: number }
  | { kind: 'manual'; copies: number; minCopies: number; zoneId: string | null }
  | { kind: 'unknown_region'; copies: number };

export const quoteShipping = (
  settings: PrintCheckoutSettings,
  input: { province: string; city: string; copies: number }
): ShippingQuote => {
  const copies = Math.max(0, Math.floor(input.copies));
  const zone = resolveShippingZone(settings.zones, input.province, input.city);
  if (copies >= settings.manualQuoteMinCopies) return { kind: 'manual', copies, minCopies: settings.manualQuoteMinCopies, zoneId: zone?.id ?? null };
  if (!zone) return { kind: 'unknown_region', copies };
  return { kind: 'zone', zoneId: zone.id, zoneName: zone.name, fee: zone.fee + zone.extraPerCopy * Math.max(0, copies - 1), copies };
};

const ZONE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const rupiah = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 10_000_000 ? n : null;
};

/** Validasi pengaturan dari admin. Setiap provinsi harus masuk tepat satu zona. */
export const validatePrintCheckoutSettings = (input: unknown): { settings: PrintCheckoutSettings } | { error: string } => {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const zonesRaw = Array.isArray(raw.zones) ? raw.zones : null;
  if (!zonesRaw || zonesRaw.length === 0 || zonesRaw.length > 40) return { error: 'Daftar zona tidak valid (1–40 zona).' };
  const zones: ShippingZone[] = [];
  const seenProvince = new Map<string, string>();
  for (const z of zonesRaw as Array<Record<string, unknown>>) {
    const id = String(z?.id ?? '').trim();
    const name = String(z?.name ?? '').trim().slice(0, 60);
    const fee = rupiah(z?.fee);
    const extraPerCopy = rupiah(z?.extraPerCopy ?? 0);
    if (!ZONE_ID_RE.test(id) || !name || fee === null || extraPerCopy === null) return { error: `Zona tidak valid: ${name || id || '(tanpa nama)'}.` };
    if (zones.some((existing) => existing.id === id)) return { error: `ID zona ganda: ${id}.` };
    const provinces = Array.isArray(z?.provinces) ? (z.provinces as unknown[]).map(String) : [];
    for (const p of provinces) {
      if (!isIndonesiaProvince(p)) return { error: `Provinsi tidak dikenal: ${p}.` };
      if (seenProvince.has(p)) return { error: `${p} masuk dua zona (${seenProvince.get(p)} dan ${name}).` };
      seenProvince.set(p, name);
    }
    const cities = (Array.isArray(z?.cities) ? (z.cities as unknown[]) : [])
      .map((c) => String(c).trim().slice(0, 80)).filter(Boolean).slice(0, 100);
    zones.push({ id, name, fee, extraPerCopy, provinces, cities });
  }
  const missing = INDONESIA_PROVINCES.filter((p) => !seenProvince.has(p));
  if (missing.length > 0) return { error: `Provinsi belum masuk zona: ${missing.join(', ')}.` };
  const minCopies = Number(raw.manualQuoteMinCopies);
  if (!Number.isInteger(minCopies) || minCopies < 2 || minCopies > 1000) return { error: 'Batas eksemplar untuk ongkir manual harus 2–1000.' };
  const dueHours = Number(raw.transferDueHours);
  if (!Number.isInteger(dueHours) || dueHours < 1 || dueHours > 168) return { error: 'Batas waktu transfer harus 1–168 jam.' };
  const fallbackMode = raw.fallbackMode ?? 'zone_table';
  if (fallbackMode !== 'zone_table' && fallbackMode !== 'hold_order') return { error: 'Mode cadangan ongkos kirim tidak dikenal.' };
  let origin: ShippingOrigin | null = null;
  if (raw.origin !== null && raw.origin !== undefined) {
    const o = raw.origin as Record<string, unknown>;
    const id = Number(o?.id);
    const label = String(o?.label ?? '').trim().slice(0, 200);
    if (!Number.isInteger(id) || id <= 0 || !label) return { error: 'Lokasi asal pengiriman tidak valid. Pilih ulang dari hasil pencarian.' };
    origin = { id, label };
  }
  const couriersRaw = raw.couriers ?? DEFAULT_COURIERS;
  if (!Array.isArray(couriersRaw)) return { error: 'Daftar kurir tidak valid.' };
  const couriers = [...new Set(couriersRaw.map(String))];
  if (couriers.length === 0 || couriers.some((c) => !isCourierCode(c))) return { error: 'Pilih minimal satu kurir yang dikenal RajaOngkir.' };
  const packagingGram = Number(raw.packagingGram ?? 80);
  if (!Number.isInteger(packagingGram) || packagingGram < 0 || packagingGram > 5000) return { error: 'Berat kemasan harus 0–5000 gram.' };
  const dailyQuota = Number(raw.dailyQuota ?? 100);
  if (!Number.isInteger(dailyQuota) || dailyQuota < 1 || dailyQuota > 100000) return { error: 'Kuota harian RajaOngkir harus 1–100.000 permintaan.' };
  return {
    settings: {
      fallbackMode,
      origin,
      couriers,
      packagingGram,
      dailyQuota,
      zones,
      manualQuoteMinCopies: minCopies,
      uniqueCodeEnabled: raw.uniqueCodeEnabled !== false,
      transferDueHours: dueHours
    }
  };
};
