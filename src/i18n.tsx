import React from 'react';
import { useTranslation } from 'react-i18next';
import { changeAppLanguage, getCurrentLanguage, type AppLanguage } from './i18n/index';
import type common from './i18n/locales/id/common.json';

/**
 * Lapisan kompatibilitas untuk komponen yang masih memakai useLanguage().
 * Terjemahan kini dikelola i18next (src/i18n/index.ts & src/i18n/locales/);
 * komponen dimigrasikan bertahap ke useTranslation() dari react-i18next.
 */
export type Language = AppLanguage;

type CommonStringKey = { [K in keyof typeof common]: (typeof common)[K] extends string ? K : never }[keyof typeof common];

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: CommonStringKey) => string;
}

/** Tidak lagi menyimpan state sendiri; dipertahankan agar main.tsx & import lama tetap berjalan. */
export const LanguageProvider: React.FC<React.PropsWithChildren> = ({ children }) => <>{children}</>;

export const useLanguage = (): LanguageContextValue => {
  const { t } = useTranslation('common');
  return {
    language: getCurrentLanguage(),
    setLanguage: (next) => { void changeAppLanguage(next); },
    t: (key) => t(key)
  };
};
