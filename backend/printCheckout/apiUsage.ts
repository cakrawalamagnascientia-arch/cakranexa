/**
 * Penghitung permintaan API RajaOngkir per hari (tanggal WIB). Paket Komerce Starter: 100 permintaan/hari.
 * Bertambah hanya saat server benar-benar memanggil API (hasil cache tidak dihitung), disimpan di tabel
 * shipping_api_usage agar tidak hilang saat server Render tidur/restart, dan tampil di tab Management Pengiriman
 * dengan peringatan di 80%. Kuota habis -> klien tidak memanggil API dan checkout memakai cadangan.
 */

export interface ApiUsageStore {
  getApiUsage(date: string): Promise<number>;
  saveApiUsage(date: string, count: number): Promise<void>;
}

export interface ApiUsageSnapshot {
  date: string;
  count: number;
  limit: number;
  percent: number;
  /** >= 80% kuota terpakai. */
  warning: boolean;
  exhausted: boolean;
}

const WIB_OFFSET_MS = 7 * 3_600_000;

/** Tanggal kalender WIB (UTC+7), mis. 2026-09-15. */
export const wibDate = (d: Date): string => new Date(d.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);

export class ShippingApiUsage {
  private day: Promise<{ date: string; count: number }> | null = null;
  private dayDate = '';

  constructor(private readonly deps: {
    store: ApiUsageStore;
    /** Batas harian dari pengaturan admin (bawaan 100). */
    limit: () => Promise<number>;
    now?: () => Date;
    log?: Pick<Console, 'warn'>;
  }) {}

  private get log() {
    return this.deps.log ?? console;
  }

  private current(): Promise<{ date: string; count: number }> {
    const date = wibDate(this.deps.now ? this.deps.now() : new Date());
    if (!this.day || this.dayDate !== date) {
      this.dayDate = date;
      this.day = this.deps.store.getApiUsage(date)
        .catch((err: any) => {
          this.log.warn('[print] gagal membaca pemakaian API RajaOngkir:', err?.message || err);
          return 0;
        })
        .then((count) => ({ date, count }));
    }
    return this.day;
  }

  /** Dipanggil tepat sebelum permintaan sungguhan ke RajaOngkir. false = kuota habis, jangan panggil API. */
  async acquire(): Promise<boolean> {
    const [day, limit] = await Promise.all([this.current(), this.deps.limit()]);
    // Periksa dan tambah tanpa jeda await: permintaan bersamaan tidak melewati batas.
    if (day.count >= limit) return false;
    day.count += 1;
    await this.deps.store.saveApiUsage(day.date, day.count).catch((err: any) => {
      this.log.warn('[print] gagal menyimpan pemakaian API RajaOngkir:', err?.message || err);
    });
    return true;
  }

  async snapshot(): Promise<ApiUsageSnapshot> {
    const [day, limit] = await Promise.all([this.current(), this.deps.limit()]);
    return {
      date: day.date,
      count: day.count,
      limit,
      percent: Math.round((day.count / limit) * 100),
      warning: day.count >= Math.ceil(limit * 0.8),
      exhausted: day.count >= limit
    };
  }
}
