import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

/**
 * Konfigurasi multi-bahasa (i18next).
 * - Bahasa default Indonesia (dibundel langsung); Inggris & Mandarin dimuat saat dipilih.
 * - Menambah bahasa baru: tambahkan kode di SUPPORTED_LANGUAGES dan folder locales/<kode>/.
 * - URL berprefiks (/en, /zh) adalah penentu utama bahasa. Deteksi bahasa browser (navigator)
 *   sengaja tidak dipakai: Googlebot memakai bahasa browser Inggris, sehingga URL Indonesia
 *   akan terindeks dalam bahasa Inggris.
 */
export const SUPPORTED_LANGUAGES = ['id', 'en', 'zh'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'id';

export const NAMESPACES = [
  'common', 'home', 'catalog', 'book', 'author', 'blog', 'cart', 'checkout', 'auth', 'admin',
  'errors', 'seo', 'publishing', 'training', 'about', 'career', 'journal', 'contact'
] as const;

export const LANGUAGE_STORAGE_KEY = 'cakranexa_lang';
const LEGACY_STORAGE_KEY = 'cakranexa_language'; // dipakai sistem bahasa lama (src/i18n.tsx)

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

/** Nilai atribut <html lang> untuk tiap bahasa. */
export const HTML_LANG: Record<AppLanguage, string> = { id: 'id', en: 'en', zh: 'zh-CN' };

type LocaleData = Record<string, unknown>;
const namespaceOf = (path: string): string => path.split('/').pop()!.replace(/\.json$/, '');

const bundledIndonesian = import.meta.glob('./locales/id/*.json', { eager: true, import: 'default' }) as Record<string, LocaleData>;
const lazyLocales = import.meta.glob(['./locales/*/*.json', '!./locales/id/*.json'], { import: 'default' }) as Record<string, () => Promise<LocaleData>>;

const indonesianResources = Object.fromEntries(
  Object.entries(bundledIndonesian).map(([path, data]) => [namespaceOf(path), data])
);

// Backend kecil tanpa dependensi: memuat file JSON bahasa lain lewat dynamic import (code-splitting Vite).
const lazyLocaleBackend = {
  type: 'backend' as const,
  init() { /* tidak ada konfigurasi */ },
  read(language: string, namespace: string, callback: (error: unknown, data?: LocaleData) => void) {
    if (language === DEFAULT_LANGUAGE) return callback(null, indonesianResources[namespace] ?? {});
    const load = lazyLocales[`./locales/${language}/${namespace}.json`];
    if (!load) return callback(null, {});
    load().then((data) => callback(null, data), (error) => callback(error));
  }
};

// Pindahkan pilihan bahasa dari sistem lama agar pengunjung tidak kembali ke Bahasa Indonesia.
try {
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!localStorage.getItem(LANGUAGE_STORAGE_KEY) && isAppLanguage(legacy)) {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, legacy);
  }
} catch {
  // localStorage tidak tersedia (mode privat) — abaikan
}

// Poppins tidak punya aksara Han: Noto Sans SC hanya dimuat saat Mandarin dipakai.
const loadChineseFont = () => {
  if (document.getElementById('font-noto-sans-sc')) return;
  const link = document.createElement('link');
  link.id = 'font-noto-sans-sc';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap';
  document.head.appendChild(link);
};

const applyDocumentLanguage = (language: string | undefined) => {
  if (typeof document === 'undefined') return;
  const lang = isAppLanguage(language) ? language : DEFAULT_LANGUAGE;
  document.documentElement.lang = HTML_LANG[lang];
  document.documentElement.dataset.lang = lang; // dipakai CSS, mis. font Mandarin
  if (lang === 'zh') loadChineseFont();
};

i18n.on('languageChanged', applyDocumentLanguage);

i18n
  .use(lazyLocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { [DEFAULT_LANGUAGE]: indonesianResources },
    partialBundledLanguages: true,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    fallbackLng: DEFAULT_LANGUAGE,
    load: 'languageOnly',
    ns: [...NAMESPACES],
    defaultNS: 'common',
    returnEmptyString: false, // terjemahan kosong jatuh ke Bahasa Indonesia, bukan teks kosong
    interpolation: { escapeValue: false }, // React sudah meng-escape
    detection: {
      order: ['path', 'querystring', 'localStorage'],
      lookupFromPathIndex: 0,
      lookupQuerystring: 'lang',
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage']
    }
  });

applyDocumentLanguage(i18n.resolvedLanguage);

/** Bahasa aktif yang sudah dinormalisasi ke salah satu bahasa yang didukung. */
export const getCurrentLanguage = (): AppLanguage =>
  isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE;

/**
 * Ganti bahasa tanpa reload. Terjemahan dimuat lebih dulu agar tampilan tidak berkedip
 * ke layar loading (Suspense) saat berpindah bahasa.
 */
export const changeAppLanguage = async (language: AppLanguage): Promise<void> => {
  await i18n.loadLanguages(language);
  await i18n.changeLanguage(language);
};

export default i18n;
