import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Book } from '../types';
import { DEFAULT_LANGUAGE, isAppLanguage, type AppLanguage } from './index';
import { formatCurrency, formatDate, formatNumber } from './format';
import { categoryKey } from './labels';
import { localizeCmsDefault } from './cms';
import { getLocalized, type ContentTranslations } from './localized';

/** Bahasa aktif; komponen yang memakainya dirender ulang saat bahasa berganti. */
export const useAppLanguage = (): AppLanguage => {
  const { i18n } = useTranslation();
  return isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE;
};

/** Formatter harga/angka/tanggal yang terikat ke bahasa aktif. */
export const useFormatters = () => {
  const lang = useAppLanguage();
  return useMemo(() => ({
    lang,
    currency: (amount: number) => formatCurrency(amount, lang),
    number: (value: number) => formatNumber(value, lang),
    date: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => formatDate(value, lang, options)
  }), [lang]);
};

/** Label kategori buku dalam bahasa aktif; nilai yang tidak dikenal ditampilkan apa adanya. */
export const useCategoryLabel = () => {
  const { t } = useTranslation('catalog');
  return (category: string): string => {
    const key = categoryKey(category);
    return key ? t(`categories.${key}`) : category;
  };
};

/** Versi hook dari localizeCmsDefault (lihat src/i18n/cms.ts). */
export const useCmsText = () => {
  const lang = useAppLanguage();
  return (value: string | undefined, indonesianDefault: string | undefined, translated: string): string =>
    localizeCmsDefault(value, indonesianDefault, translated, lang);
};

/** Versi hook dari getLocalized: `localized(author, 'publications')` dalam bahasa aktif. */
export const useLocalized = () => {
  const lang = useAppLanguage();
  return <R extends { i18n?: ContentTranslations<string, unknown> }, F extends keyof R & string>(record: R, field: F): R[F] =>
    getLocalized(record, field, lang);
};

/**
 * Teks buku dalam bahasa aktif. Judul terjemahan dipakai bila diisi admin; bila tidak,
 * judul Indonesia yang sudah dirapikan (`book.title`, lalu `book.name`).
 */
export const useBookText = () => {
  const lang = useAppLanguage();
  return useMemo(() => ({
    title: (book: Book): string => {
      const localizedName = getLocalized(book, 'name', lang);
      return localizedName !== book.name ? localizedName : book.title || book.name;
    },
    subtitle: (book: Book): string | undefined => getLocalized(book, 'subtitle', lang),
    sinopsis: (book: Book): string => getLocalized(book, 'sinopsis', lang)
  }), [lang]);
};
