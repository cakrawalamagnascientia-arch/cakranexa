/**
 * Waktu bisnis fase 3 memakai zona Asia/Jakarta (UTC+7, tanpa DST): tanggal masuk rak, periode langganan,
 * slot Digital Member Pick, dan "bulan ini" di ringkasan admin.
 */
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (value: string | Date) => (typeof value === 'string' ? Date.parse(value) : value.getTime());

/** Tanggal kalender Jakarta (YYYY-MM-DD). */
export const jakartaDate = (value: string | Date): string => new Date(toMs(value) + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);

/** Tambah bulan kalender pada jam dinding Jakarta; tanggal dijepit ke akhir bulan (31 Jan + 1 bulan = 28/29 Feb). */
export const addMonths = (value: string | Date, months: number): string => {
  const wall = new Date(toMs(value) + JAKARTA_OFFSET_MS);
  const year = wall.getUTCFullYear();
  const month = wall.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const result = Date.UTC(year, month, Math.min(wall.getUTCDate(), lastDay), wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds(), wall.getUTCMilliseconds());
  return new Date(result - JAKARTA_OFFSET_MS).toISOString();
};

export const addDays = (value: string | Date, days: number): string => new Date(toMs(value) + days * DAY_MS).toISOString();

/** Awal bulan kalender Jakarta (00:00 WIB tanggal 1) sebagai ISO UTC. */
export const jakartaMonthStart = (value: string | Date, offsetMonths = 0): string => {
  const wall = new Date(toMs(value) + JAKARTA_OFFSET_MS);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + offsetMonths, 1) - JAKARTA_OFFSET_MS).toISOString();
};
