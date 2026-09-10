import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'id' | 'en' | 'zh';

const translations = {
  id: {
    language: 'Bahasa',
    indonesia: 'Indonesia',
    english: 'Inggris',
    chinese: 'China',
    home: 'Home',
    catalog: 'Katalog',
    publishing: 'Penerbitan',
    training: 'Pelatihan',
    journal: 'Jurnal',
    about: 'Tentang Kami',
    blog: 'Blog',
    career: 'Karier',
    contact: 'Kontak',
    authors: 'Penulis & Kontributor',
    cart: 'Keranjang',
    search: 'Cari',
    paymentMethod: 'Metode Pembayaran',
    allBooks: 'Semua Buku',
    viewDetails: 'Lihat Detail',
    viewProfile: 'Lihat Profil & Karya',
    officialSeller: 'Penjual Resmi',
    publisher: 'Penerbit Utama',
    priceComingSoon: 'Harga menyusul',
    latest: 'Terbaru',
    back: 'Kembali',
    save: 'Simpan Perubahan',
    cancel: 'Batal',
    loading: 'Memuat...',
    noData: 'Data belum tersedia.'
  },
  en: {
    language: 'Language',
    indonesia: 'Indonesian',
    english: 'English',
    chinese: 'Chinese',
    home: 'Home',
    catalog: 'Catalog',
    publishing: 'Publishing',
    training: 'Training',
    journal: 'Journal',
    about: 'About Us',
    blog: 'Blog',
    career: 'Career',
    contact: 'Contact',
    authors: 'Authors & Contributors',
    cart: 'Cart',
    search: 'Search',
    paymentMethod: 'Payment Method',
    allBooks: 'All Books',
    viewDetails: 'View Details',
    viewProfile: 'View Profile & Works',
    officialSeller: 'Official Seller',
    publisher: 'Main Publisher',
    priceComingSoon: 'Price coming soon',
    latest: 'New',
    back: 'Back',
    save: 'Save Changes',
    cancel: 'Cancel',
    loading: 'Loading...',
    noData: 'No data available.'
  },
  zh: {
    language: '语言',
    indonesia: '印度尼西亚语',
    english: '英语',
    chinese: '中文',
    home: '首页',
    catalog: '目录',
    publishing: '出版服务',
    training: '培训',
    journal: '期刊',
    about: '关于我们',
    blog: '博客',
    career: '职业',
    contact: '联系',
    authors: '作者与贡献者',
    cart: '购物车',
    search: '搜索',
    paymentMethod: '支付方式',
    allBooks: '全部书籍',
    viewDetails: '查看详情',
    viewProfile: '查看简介与作品',
    officialSeller: '官方销售商',
    publisher: '主要出版社',
    priceComingSoon: '价格即将公布',
    latest: '最新',
    back: '返回',
    save: '保存更改',
    cancel: '取消',
    loading: '加载中...',
    noData: '暂无数据。'
  }
} as const;

type TranslationKey = keyof typeof translations.id;
type TranslationValues = Record<TranslationKey, string>;

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('cakranexa_language') : null;
    return stored === 'en' || stored === 'zh' ? stored : 'id';
  });

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem('cakranexa_language', next);
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : next;
  };

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key) => (translations[language] as TranslationValues)[key]
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextValue => {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
};
