import { describe, expect, it } from 'vitest';
import { ShippingApiUsage, wibDate } from '../printCheckout/apiUsage';
import { MemoryPrintOrderStore } from '../printCheckout/store';

describe('penghitung pemakaian API RajaOngkir (kuota harian)', () => {
  it('bertambah per permintaan, tersimpan (bertahan saat server restart), peringatan di 80%, habis di batas, hari baru mulai 0 (WIB)', async () => {
    const store = new MemoryPrintOrderStore();
    let t = Date.parse('2026-09-15T10:00:00+07:00');
    const usage = new ShippingApiUsage({ store, limit: async () => 5, now: () => new Date(t) });
    expect(await usage.snapshot()).toMatchObject({ date: '2026-09-15', count: 0, limit: 5, warning: false, exhausted: false });
    for (let i = 0; i < 4; i += 1) expect(await usage.acquire()).toBe(true);
    expect(await usage.snapshot()).toMatchObject({ count: 4, percent: 80, warning: true, exhausted: false });
    expect(await store.getApiUsage('2026-09-15')).toBe(4);

    const restarted = new ShippingApiUsage({ store, limit: async () => 5, now: () => new Date(t) });
    expect(await restarted.acquire()).toBe(true);
    expect(await restarted.acquire()).toBe(false);
    expect(await restarted.snapshot()).toMatchObject({ count: 5, percent: 100, exhausted: true });

    t = Date.parse('2026-09-16T00:05:00+07:00');
    expect(await restarted.acquire()).toBe(true);
    expect(await restarted.snapshot()).toMatchObject({ date: '2026-09-16', count: 1 });
    expect(wibDate(new Date('2026-09-15T16:59:59Z'))).toBe('2026-09-15');
    expect(wibDate(new Date('2026-09-15T17:00:00Z'))).toBe('2026-09-16');
  });

  it('permintaan bersamaan tidak melewati batas; database gagal tidak menghentikan checkout', async () => {
    const usage = new ShippingApiUsage({ store: new MemoryPrintOrderStore(), limit: async () => 3 });
    const results = await Promise.all(Array.from({ length: 6 }, () => usage.acquire()));
    expect(results.filter(Boolean)).toHaveLength(3);

    const broken = new MemoryPrintOrderStore();
    broken.getApiUsage = async () => { throw new Error('db down'); };
    broken.saveApiUsage = async () => { throw new Error('db down'); };
    const resilient = new ShippingApiUsage({ store: broken, limit: async () => 2, log: { warn: () => undefined } });
    expect(await resilient.acquire()).toBe(true);
    expect((await resilient.snapshot()).count).toBe(1);
  });
});
