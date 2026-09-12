import { DEFAULT_LANGUAGE, getCurrentLanguage, type AppLanguage } from './index';

/**
 * Konten CMS (siteContent) masih satu bahasa. Untuk EN/ZH:
 * - teks yang masih sama dengan nilai bawaan Bahasa Indonesia ditampilkan dari file terjemahan;
 * - teks yang sudah diubah admin tetap tampil apa adanya (belum punya versi EN/ZH).
 * Untuk Bahasa Indonesia, nilai CMS selalu dipakai.
 */
export const localizeCmsDefault = (
  value: string | undefined,
  indonesianDefault: string | undefined,
  translated: string,
  lang: AppLanguage = getCurrentLanguage()
): string => {
  if (lang === DEFAULT_LANGUAGE) return value ?? translated;
  if (!value || value === indonesianDefault) return translated;
  return value;
};
