import { getCurrentLanguage, type AppLanguage } from './index';

/**
 * Format angka, harga, dan tanggal sesuai bahasa aktif.
 * Harga selalu dalam Rupiah: ID "Rp 195.000" (sama seperti tampilan lama), EN/ZH "IDR 195,000".
 * Parameter `lang` opsional; tanpa itu dipakai bahasa aktif (berguna di luar komponen React).
 */
const NUMBER_LOCALE: Record<AppLanguage, string> = { id: 'id-ID', en: 'en-US', zh: 'zh-CN' };
const DATE_LOCALE: Record<AppLanguage, string> = { id: 'id-ID', en: 'en-GB', zh: 'zh-CN' };

export const formatNumber = (value: number, lang: AppLanguage = getCurrentLanguage()): string =>
  new Intl.NumberFormat(NUMBER_LOCALE[lang]).format(value);

export const formatCurrency = (amount: number, lang: AppLanguage = getCurrentLanguage()): string =>
  `${lang === 'id' ? 'Rp' : 'IDR'} ${formatNumber(amount, lang)}`;

const INDONESIAN_MONTHS = [
  'januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'
];

/**
 * Tanggal yang tersimpan sebagai teks Indonesia (mis. "18 Agustus 2026", data CMS) ditampilkan
 * sesuai bahasa aktif. Teks yang bukan format itu ditampilkan apa adanya.
 */
export const formatIndonesianDateText = (text: string, lang: AppLanguage = getCurrentLanguage()): string => {
  if (lang === 'id') return text;
  const match = text.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  const month = match ? INDONESIAN_MONTHS.indexOf(match[2].toLowerCase()) : -1;
  return match && month >= 0 ? formatDate(new Date(Number(match[3]), month, Number(match[1])), lang) : text;
};

export const formatDate = (
  value: Date | string | number,
  lang: AppLanguage = getCurrentLanguage(),
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
): string => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(DATE_LOCALE[lang], options).format(date);
};
