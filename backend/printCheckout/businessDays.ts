/**
 * Batas waktu jalur transfer dari luar negeri (rekening USD): hari kerja Senin–Jumat menurut kalender WIB, pada jam
 * yang sama dengan waktu mulai. Hari libur nasional tidak dihitung khusus; admin tetap bisa memperpanjang.
 */

const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 3_600_000;

export const USD_DUE_BUSINESS_DAYS = 5;

export const addBusinessDaysWib = (from: Date, days: number): Date => {
  let time = from.getTime();
  let added = 0;
  while (added < days) {
    time += DAY_MS;
    const weekday = new Date(time + WIB_OFFSET_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return new Date(time);
};
