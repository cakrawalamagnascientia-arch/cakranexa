import { describe, expect, it } from 'vitest';
import { createRajaOngkirClient, rajaOngkirKeyFromEnv, RajaOngkirError, toDestination, type FetchLike } from '../printCheckout/rajaongkir';

/** Klien RajaOngkir (Komerce API V2) dengan fetch tiruan: API sungguhan tidak pernah dipanggil di tes. */

const KEY = 'kunci-uji-rahasia';
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

const fakeFetch = (respond: (url: string, init: Parameters<FetchLike>[1]) => ReturnType<typeof json> | Promise<never>) => {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { calls, fetch };
};

const SEARCH_BODY = {
  meta: { message: 'Success Get Domestic Destinations', code: 200, status: 'success' },
  data: [
    { id: 17473, label: 'SENEN, SENEN, JAKARTA PUSAT, DKI JAKARTA, 10410', province_name: 'DKI JAKARTA', city_name: 'JAKARTA PUSAT', district_name: 'SENEN', subdistrict_name: 'SENEN', zip_code: '10410' },
    { id: 'bukan-angka', label: 'RUSAK' }
  ]
};

const COST_BODY = {
  meta: { message: 'Success Calculate Domestic Shipping cost', code: 200, status: 'success' },
  data: [
    { name: 'Jalur Nugraha Ekakurir (JNE)', code: 'jne', service: 'REG', description: 'Layanan Reguler', cost: 18000, etd: '2-3 day' },
    { name: 'POS Indonesia (POS)', code: 'pos', service: 'Pos Reguler', description: 'Pos Reguler', cost: 21000, etd: '3 day' },
    { name: 'JNE', code: 'jne', service: 'JTR', description: 'JNE Trucking', cost: 0, etd: '' }
  ]
};

const MINUTE = 60_000;

describe('klien RajaOngkir', () => {
  it('pencarian wilayah: GET domestic-destination (limit 10) dengan header key, item V2 dipetakan, hasil disimpan 24 jam', async () => {
    let now = 0;
    const f = fakeFetch(() => json(200, SEARCH_BODY));
    const client = createRajaOngkirClient({ apiKey: KEY, fetch: f.fetch, now: () => now });
    const list = await client.searchDestinations('  senen ');
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe('https://rajaongkir.komerce.id/api/v1/destination/domestic-destination?search=senen&limit=10&offset=0');
    expect(f.calls[0].init.method).toBe('GET');
    expect(f.calls[0].init.headers.key).toBe(KEY);
    expect(list).toEqual([{ id: 17473, label: 'SENEN, SENEN, JAKARTA PUSAT, DKI JAKARTA, 10410', province: 'DKI JAKARTA', city: 'JAKARTA PUSAT', district: 'SENEN', subdistrict: 'SENEN', zipCode: '10410' }]);

    await client.searchDestinations('SENEN');
    now = 23 * 60 * MINUTE;
    await client.searchDestinations('senen');
    expect(f.calls).toHaveLength(1);
    now = 25 * 60 * MINUTE;
    await client.searchDestinations('senen');
    expect(f.calls).toHaveLength(2);
  });

  it('item tanpa kolom nama wilayah memakai label; 404 "data tidak ditemukan" = daftar kosong', async () => {
    expect(toDestination({ id: 5, label: 'MENTENG, MENTENG, JAKARTA PUSAT, DKI JAKARTA, 10310' })).toMatchObject({
      subdistrict: 'MENTENG', district: 'MENTENG', city: 'JAKARTA PUSAT', province: 'DKI JAKARTA', zipCode: '10310'
    });
    const f = fakeFetch(() => json(404, { meta: { message: 'Data not found', code: 404, status: 'failed' }, data: null }));
    expect(await createRajaOngkirClient({ apiKey: KEY, fetch: f.fetch }).searchDestinations('xyzxyz')).toEqual([]);
  });

  it('tarif: SATU POST untuk semua kurir (courier jne:pos), tarif 0 dibuang, hasil disimpan 30 menit per (asal, tujuan, berat, kurir)', async () => {
    let now = 0;
    const f = fakeFetch(() => json(200, COST_BODY));
    const client = createRajaOngkirClient({ apiKey: KEY, fetch: f.fetch, now: () => now });
    const input = { origin: 3855, destination: 17473, weightGram: 700.4, couriers: ['jne', 'pos'] };
    const rates = await client.domesticCost(input);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe('https://rajaongkir.komerce.id/api/v1/calculate/domestic-cost');
    expect(f.calls[0].init.method).toBe('POST');
    expect(f.calls[0].init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(f.calls[0].init.headers.key).toBe(KEY);
    expect(Object.fromEntries(new URLSearchParams(f.calls[0].init.body))).toEqual({ origin: '3855', destination: '17473', weight: '700', courier: 'jne:pos', price: 'lowest' });
    expect(rates).toEqual([
      { courier: 'jne', courierName: 'JNE', service: 'REG', description: 'Layanan Reguler', cost: 18000, etd: '2-3 day' },
      { courier: 'pos', courierName: 'POS Indonesia', service: 'Pos Reguler', description: 'Pos Reguler', cost: 21000, etd: '3 day' }
    ]);
    now = 29 * MINUTE;
    await client.domesticCost(input);
    expect(f.calls).toHaveLength(1);
    await client.domesticCost({ ...input, weightGram: 1200 });
    expect(f.calls).toHaveLength(2);
    now = 31 * MINUTE;
    await client.domesticCost(input);
    expect(f.calls).toHaveLength(3);
  });

  it('meter kuota: hanya permintaan sungguhan yang dihitung (cache tidak); kuota habis -> 429 tanpa memanggil API', async () => {
    let allowed = 2;
    let acquired = 0;
    const meter = { acquire: async () => (allowed > 0 ? (allowed -= 1, acquired += 1, true) : false) };
    const f = fakeFetch((url) => json(200, url.includes('domestic-destination') ? SEARCH_BODY : COST_BODY));
    const client = createRajaOngkirClient({ apiKey: KEY, fetch: f.fetch, meter });
    const input = { origin: 1, destination: 2, weightGram: 500, couriers: ['jne', 'pos'] };
    await client.domesticCost(input);
    await client.domesticCost(input);
    await client.searchDestinations('senen');
    await client.searchDestinations('senen');
    expect(f.calls).toHaveLength(2);
    expect(acquired).toBe(2);
    const err = await client.domesticCost({ ...input, weightGram: 900 }).catch((e) => e);
    expect(err).toBeInstanceOf(RajaOngkirError);
    expect(err.status).toBe(429);
    expect(f.calls).toHaveLength(2);
  });

  it('galat API (401, 422 kurir tidak valid), jaringan, dan timeout -> RajaOngkirError tanpa membocorkan API key; tidak diulang, tidak disimpan', async () => {
    const denied = fakeFetch(() => json(401, { meta: { message: 'Invalid Api key, key not found', code: 401, status: 'failed' } }));
    const client = createRajaOngkirClient({ apiKey: KEY, fetch: denied.fetch });
    const err = await client.domesticCost({ origin: 1, destination: 2, weightGram: 500, couriers: ['jne'] }).catch((e) => e);
    expect(err).toBeInstanceOf(RajaOngkirError);
    expect(err.status).toBe(401);
    expect(err.message).toContain('Invalid Api key');
    expect(err.message).not.toContain(KEY);
    await client.domesticCost({ origin: 1, destination: 2, weightGram: 500, couriers: ['jne'] }).catch(() => undefined);
    expect(denied.calls).toHaveLength(2);

    const invalid = fakeFetch(() => json(422, { meta: { message: 'Invalid Courier', code: 422, status: 'failed' }, data: null }));
    const invalidErr = await createRajaOngkirClient({ apiKey: KEY, fetch: invalid.fetch }).domesticCost({ origin: 1, destination: 2, weightGram: 500, couriers: ['jne', 'rex'] }).catch((e) => e);
    expect(invalidErr).toMatchObject({ status: 422 });
    expect(invalid.calls).toHaveLength(1);

    const offline = fakeFetch(() => Promise.reject(new Error(`ECONNRESET ${KEY}`)));
    const netErr = await createRajaOngkirClient({ apiKey: KEY, fetch: offline.fetch }).searchDestinations('senen').catch((e) => e);
    expect(netErr).toMatchObject({ status: 0 });
    expect(netErr.message).not.toContain(KEY);

    const hanging: FetchLike = (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    const timeout = await createRajaOngkirClient({ apiKey: KEY, fetch: hanging, timeoutMs: 20 }).searchDestinations('senen').catch((e) => e);
    expect(timeout.message).toContain('timeout');
  });

  it('API key hanya dari env RAJAONGKIR_API_KEY', () => {
    expect(rajaOngkirKeyFromEnv({})).toBeNull();
    expect(rajaOngkirKeyFromEnv({ RAJAONGKIR_API_KEY: '  ' })).toBeNull();
    expect(rajaOngkirKeyFromEnv({ RAJAONGKIR_KEY: 'k1', KOMERCE_API_KEY: 'k2' })).toBeNull();
    expect(rajaOngkirKeyFromEnv({ RAJAONGKIR_API_KEY: ' k0 ' })).toBe('k0');
  });
});
