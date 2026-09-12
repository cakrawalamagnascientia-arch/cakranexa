import React from 'react';
import { useTranslation } from 'react-i18next';
import { HTML_LANG, SUPPORTED_LANGUAGES, changeAppLanguage, type AppLanguage } from '../i18n/index';
import { useAppLanguage } from '../i18n/hooks';

const SHORT_LABELS: Record<AppLanguage, string> = { id: 'ID', en: 'EN', zh: '中文' };
const LANGUAGE_NAME_KEYS = { id: 'indonesia', en: 'english', zh: 'chinese' } as const satisfies Record<AppLanguage, string>;

interface LanguageSwitcherProps {
  className?: string;
}

/**
 * Pilihan bahasa "ID | EN | 中文". Mengganti bahasa tanpa reload; App ikut mengganti prefix URL
 * (/en, /zh), <html lang>, judul halaman, dan meta description.
 */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className = '' }) => {
  const { t } = useTranslation('common');
  const current = useAppLanguage();

  return (
    <div
      role="group"
      aria-label={t('language')}
      className={`items-center rounded border border-slate-700 bg-[#0F172A] p-0.5 ${className}`}
    >
      {SUPPORTED_LANGUAGES.map((language) => {
        const isActive = language === current;
        return (
          <button
            key={language}
            type="button"
            lang={HTML_LANG[language]}
            aria-pressed={isActive}
            title={t(LANGUAGE_NAME_KEYS[language])}
            onClick={() => { if (!isActive) void changeAppLanguage(language); }}
            className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              isActive ? 'bg-[#D4AF37] text-[#0F172A]' : 'text-slate-300 hover:text-white'
            }`}
          >
            {SHORT_LABELS[language]}
          </button>
        );
      })}
    </div>
  );
};
