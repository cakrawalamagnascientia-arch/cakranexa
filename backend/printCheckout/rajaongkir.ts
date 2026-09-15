import { RAJAONGKIR_COURIERS, type ShippingDestination, type ShippingRate } from '../../src/data/shippingRates';

/**
 * Klien RajaOngkir (Komerce API V2, https://rajaongkir.komerce.id/api/v1) untuk ongkir buku cetak:
 *  - GET  /destination/domestic-destination?search=&limit=10 -> kecamatan/kelurahan tujuan (id dipakai hitung ongkir)
 *  - POST /calculate/domestic-cost (form: origin, destination, weight gram, courier "jne:pos:...", price=lowest) -> tarif per layanan,
 *    SATU permintaan untuk semua kurir.
 * API key hanya di server (header `key`, env RAJAONGKIR_API_KEY) dan tidak pernah ditulis ke log atau pesan error.
 * Kuota paket Starter 100 permintaan/hari: pencarian disimpan 24 jam per kata kunci dan tarif 30 menit per
 * (asal, tujuan, berat, kurir), di memori dengan batas ukuran. Setiap permintaan sungguhan melewati meter kuota harian;
 * kuota habis -> RajaOngkirError 429 tanpa memanggil API (checkout memakai cadangan).
 */

export const RAJAONGKIR_BASE_URL = 'https://rajaongkir.komerce.id/api/v1';

export class RajaOngkirError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'RajaOngkirError';
  }
}

export interface RajaOngkirClient {
  searchDestinations(query: string): Promise<ShippingDestination[]>;
  domesticCost(input: { origin: number; destination: number; weightGram: number; couriers: string[] }): Promise<ShippingRate[]>;
}

export type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Meter kuota harian: dipanggil tepat sebelum permintaan sungguhan; false = kuota habis. */
export interface RequestMeter {
  acquire(): Promise<boolean>;
}

export interface RajaOngkirOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
  meter?: RequestMeter;
  timeoutMs?: number;
  now?: () => number;
  searchCacheMs?: number;
  costCacheMs?: number;
}

class TtlCache<V> {
  private readonly entries = new Map<string, { at: number; value: V }>();

  constructor(private readonly ttlMs: number, private readonly now: () => number, private readonly max = 1000) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.at > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V) {
    if (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(key, { at: this.now(), value });
  }
}

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

/** Item pencarian V2: id, label "KEL, KEC, KOTA, PROVINSI, KODEPOS", province_name, city_name, district_name, subdistrict_name, zip_code. */
export const toDestination = (item: any): ShippingDestination | null => {
  const id = Number(item?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const label = str(item?.label);
  const parts = label.split(',').map((p) => p.trim());
  const zipFromLabel = /^\d{5}$/.test(parts[parts.length - 1] ?? '') ? parts[parts.length - 1] : '';
  const destination: ShippingDestination = {
    id,
    label: '',
    subdistrict: str(item?.subdistrict_name) || parts[0] || '',
    district: str(item?.district_name) || parts[1] || '',
    city: str(item?.city_name) || parts[2] || '',
    province: str(item?.province_name) || parts[3] || '',
    zipCode: str(item?.zip_code).replace(/\D/g, '').slice(0, 5) || zipFromLabel
  };
  destination.label = label || [destination.subdistrict, destination.district, destination.city, destination.province, destination.zipCode].filter(Boolean).join(', ');
  return destination.label ? destination : null;
};

const courierName = (code: string, name: string) =>
  RAJAONGKIR_COURIERS.find((c) => c.code === code)?.name ?? (name || code.toUpperCase());

/** Item tarif V2: name, code, service, description, cost, etd. */
export const toRate = (item: any): ShippingRate | null => {
  const code = str(item?.code).toLowerCase();
  const service = str(item?.service);
  const cost = Number(item?.cost);
  if (!code || !service || !Number.isFinite(cost) || cost <= 0) return null;
  return {
    courier: code,
    courierName: courierName(code, str(item?.name)),
    service,
    description: str(item?.description),
    cost: Math.round(cost),
    etd: str(item?.etd)
  };
};

export const createRajaOngkirClient = (options: RajaOngkirOptions): RajaOngkirClient => {
  const baseUrl = (options.baseUrl || RAJAONGKIR_BASE_URL).replace(/\/$/, '');
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? 5_000;
  const now = options.now ?? Date.now;
  const searchCache = new TtlCache<ShippingDestination[]>(options.searchCacheMs ?? 24 * 3_600_000, now);
  const costCache = new TtlCache<ShippingRate[]>(options.costCacheMs ?? 30 * 60_000, now);

  /** null = "data tidak ditemukan" (404 dari RajaOngkir), selain itu body JSON. */
  const call = async (path: string, init: { method: string; body?: string; headers?: Record<string, string> }): Promise<any | null> => {
    if (options.meter && !(await options.meter.acquire())) throw new RajaOngkirError(429, 'Kuota harian RajaOngkir habis.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: { Accept: 'application/json', key: options.apiKey, ...(init.headers || {}) },
        body: init.body,
        signal: controller.signal
      });
    } catch (err: any) {
      throw new RajaOngkirError(0, err?.name === 'AbortError' ? 'RajaOngkir tidak menjawab (timeout).' : 'RajaOngkir tidak dapat dihubungi.');
    } finally {
      clearTimeout(timer);
    }
    const raw = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // bukan JSON
    }
    const code = Number(body?.meta?.code) || res.status;
    if (code === 404) return null;
    if (!res.ok || code >= 400) {
      throw new RajaOngkirError(code, `RajaOngkir ${code}: ${str(body?.meta?.message).slice(0, 160) || 'permintaan gagal'}`);
    }
    return body;
  };

  return {
    async searchDestinations(query) {
      const q = query.trim().replace(/\s+/g, ' ').slice(0, 60);
      const key = q.toLowerCase();
      const cached = searchCache.get(key);
      if (cached) return cached;
      const body = await call(`/destination/domestic-destination?search=${encodeURIComponent(q)}&limit=10&offset=0`, { method: 'GET' });
      const list = (Array.isArray(body?.data) ? body.data : []).map(toDestination).filter(Boolean) as ShippingDestination[];
      searchCache.set(key, list);
      return list;
    },

    async domesticCost({ origin, destination, weightGram, couriers }) {
      const weight = Math.max(1, Math.round(weightGram));
      const courier = couriers.join(':');
      const key = `${origin}|${destination}|${weight}|${courier}`;
      const cached = costCache.get(key);
      if (cached) return cached;
      // price=lowest: RajaOngkir mengurutkan layanan dari yang termurah (terverifikasi dengan API sungguhan; tidak ada yang dibuang).
      const form = new URLSearchParams({ origin: String(origin), destination: String(destination), weight: String(weight), courier, price: 'lowest' });
      const body = await call('/calculate/domestic-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      const rates = (Array.isArray(body?.data) ? body.data : []).map(toRate).filter(Boolean) as ShippingRate[];
      costCache.set(key, rates);
      return rates;
    }
  };
};

/** API key RajaOngkir dari env RAJAONGKIR_API_KEY (satu-satunya nama yang dibaca); null = belum di-set. */
export const rajaOngkirKeyFromEnv = (env: Record<string, string | undefined>): string | null =>
  env.RAJAONGKIR_API_KEY?.trim() || null;
