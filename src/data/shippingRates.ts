/**
 * Ongkos kirim buku cetak dari RajaOngkir (Komerce API V2): tarif kurir sebenarnya untuk kecamatan/kelurahan tujuan
 * dan berat pesanan dari katalog. Tipe, daftar kurir, dan format dipakai server dan browser; server selalu menghitung
 * ulang tarif saat pesanan dibuat.
 */

export const RAJAONGKIR_COURIERS = [
  { code: 'jne', name: 'JNE' },
  { code: 'pos', name: 'POS Indonesia' },
  { code: 'tiki', name: 'TIKI' },
  { code: 'sicepat', name: 'SiCepat' },
  { code: 'jnt', name: 'J&T Express' },
  { code: 'anteraja', name: 'AnterAja' },
  { code: 'ninja', name: 'Ninja Xpress' },
  { code: 'lion', name: 'Lion Parcel' },
  { code: 'wahana', name: 'Wahana' },
  { code: 'sap', name: 'SAP Express' },
  { code: 'ide', name: 'ID Express' }
] as const;

export type CourierCode = (typeof RAJAONGKIR_COURIERS)[number]['code'];

export const DEFAULT_COURIERS: CourierCode[] = ['jne', 'pos', 'tiki', 'sicepat', 'jnt', 'anteraja'];

export const isCourierCode = (value: unknown): value is CourierCode =>
  RAJAONGKIR_COURIERS.some((c) => c.code === value);

/** Berat satu eksemplar bila katalog belum mencatat berat buku (gram). */
export const DEFAULT_BOOK_WEIGHT_GRAM = 500;

/** Kecamatan/kelurahan tujuan dari pencarian RajaOngkir. */
export interface ShippingDestination {
  id: number;
  label: string;
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  zipCode: string;
}

/** Hasil pencarian yang ditandatangani server; token membuktikan data wilayah tidak diubah browser. */
export interface SignedShippingDestination extends ShippingDestination {
  token: string;
}

export interface ShippingRate {
  /** Kode kurir RajaOngkir (jne, pos, ...). */
  courier: string;
  courierName: string;
  service: string;
  description: string;
  cost: number;
  /** Estimasi dari RajaOngkir apa adanya (mis. "2-3 day"). */
  etd: string;
}

/**
 * POST /api/shipping/quote: ok = tarif kurir RajaOngkir; estimate = tarif tidak tersedia, ongkir estimasi dari tabel
 * zona (cadangan); manual = ongkir diisi admin (pesanan besar, tidak ada layanan ke tujuan, atau cadangan "tahan pesanan").
 */
export type ShippingRatesResponse =
  | { status: 'ok'; weightGram: number; rates: ShippingRate[] }
  | { status: 'estimate'; weightGram: number; fee: number; zoneName: string; rates: [] }
  | { status: 'manual'; reason: 'bulk' | 'unavailable' | 'no_service'; weightGram: number; rates: [] };

export const rateKey = (rate: Pick<ShippingRate, 'courier' | 'service'>) => `${rate.courier}:${rate.service}`;

export const shippingRateLabel = (rate: Pick<ShippingRate, 'courierName' | 'service'>) => `${rate.courierName} ${rate.service}`;

/** "2-3 day", "1-2 HARI", "3" -> "2-3" / "1-2" / "3"; null bila tidak ada angka. */
export const etdDays = (etd: string | null | undefined): string | null => {
  const match = String(etd ?? '').match(/(\d+)\s*(?:-\s*(\d+))?/);
  if (!match) return null;
  return match[2] && match[2] !== match[1] ? `${match[1]}-${match[2]}` : match[1];
};

/** Termurah dulu; tarif sama -> kurir lalu layanan (urutan stabil). */
export const sortRates = (rates: ShippingRate[]): ShippingRate[] =>
  [...rates].sort((a, b) => a.cost - b.cost || a.courierName.localeCompare(b.courierName) || a.service.localeCompare(b.service));

const KEEP_UPPER = new Set(['DKI', 'DI', 'NTB', 'NTT', 'II', 'III', 'IV']);

/** "DKI JAKARTA" -> "DKI Jakarta", "KOTA ADM. JAKARTA PUSAT" -> "Kota Adm. Jakarta Pusat". */
export const regionName = (value: string): string =>
  String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (KEEP_UPPER.has(word.replace(/[^A-Za-z]/g, '').toUpperCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');

/** Keterangan layanan yang layak tampil: bukan angka saja (RajaOngkir POS mengirim "240") dan tidak sama dengan nama layanan. */
export const rateDescription = (rate: Pick<ShippingRate, 'description' | 'service'>): string =>
  /[a-z]/i.test(rate.description) && rate.description !== rate.service ? rate.description : '';

/** Alamat wilayah untuk pesanan: kelurahan (bila beda), kecamatan, kota, provinsi. */
export const destinationAddress = (d: ShippingDestination): string =>
  [d.subdistrict && d.subdistrict !== d.district ? d.subdistrict : '', d.district, d.city, d.province]
    .map(regionName)
    .filter(Boolean)
    .join(', ');
