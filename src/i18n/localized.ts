import { DEFAULT_LANGUAGE, getCurrentLanguage, type AppLanguage } from './index';

/**
 * Terjemahan konten dari database/CMS (buku, penulis, artikel blog).
 * Disimpan per record sebagai `i18n: { en: { field: ... }, zh: { field: ... } }`
 * (kolom JSONB `i18n` di Supabase). Bahasa Indonesia tetap di field aslinya.
 */
// Literal 'id' (bukan typeof DEFAULT_LANGUAGE, yang bertipe AppLanguage sehingga Exclude menjadi never).
export type TranslatableLanguage = Exclude<AppLanguage, 'id'>;
export type ContentTranslations<Field extends string, Value = string> =
  Partial<Record<TranslatableLanguage, Partial<Record<Field, Value>>>>;

const isFilled = (value: unknown): boolean =>
  Array.isArray(value) ? value.some((item) => String(item).trim() !== '') : typeof value === 'string' && value.trim() !== '';

/**
 * Ambil field dalam bahasa aktif; bila terjemahan kosong/tidak ada, pakai nilai Bahasa Indonesia.
 * Tidak pernah menghasilkan teks kosong bila versi Indonesia terisi.
 */
export function getLocalized<R extends { i18n?: ContentTranslations<string, unknown> }, F extends keyof R & string>(
  record: R,
  field: F,
  lang: AppLanguage = getCurrentLanguage()
): R[F] {
  if (lang !== DEFAULT_LANGUAGE) {
    const translated = (record.i18n?.[lang as TranslatableLanguage] as Record<string, unknown> | undefined)?.[field];
    if (isFilled(translated)) return translated as R[F];
  }
  return record[field];
}
