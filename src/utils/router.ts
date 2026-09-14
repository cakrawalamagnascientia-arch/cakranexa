import { ActivePage, SubSection } from '../types';
import { DEFAULT_LANGUAGE, getCurrentLanguage, isAppLanguage, type AppLanguage } from '../i18n/index';

/**
 * router.ts — sinkronisasi state SPA <-> URL browser (History API).
 * Membuat URL di sitemap (/katalog/<slug>, /penerbitan, ...) benar-benar bisa dibuka,
 * di-refresh, dibagikan, dan di-crawl. Tanpa dependensi router eksternal.
 *
 * Bahasa ditentukan oleh prefix URL: tanpa prefix = Bahasa Indonesia, /en = English, /zh = Mandarin
 * (mis. /katalog, /en/katalog, /zh/katalog). Dashboard admin selalu tanpa prefix.
 *
 * Produk digital: /digital/ebook, /digital/audiobook (daftar), /digital/<format>/<slug-buku> (detail),
 * /digital/sample/<id-produk> (sampel), /digital/checkout?items=... (checkout). Keanggotaan: /membership,
 * /membership/checkout?plan=&cycle=, /membership/terms, /institutions, /library (Pustaka Saya, ?welcome=1),
 * /library/read/<id-produk>, /library/listen/<id-produk>.
 * Akun pembeli: /account/login|register|reset|update-password (?next=<path>), /account/membership (?invoice=).
 * Hasil pembayaran Midtrans: /payment/success dan /payment/failed (?order_id=&transaction_status=).
 */
export interface RouteState {
  page: ActivePage;
  subSection?: SubSection;
  bookSlug?: string | null;
  category?: string;
  search?: string;
  selectedAuthorId?: string | null;
  /** Halaman digital: slug buku, id produk (sampel), atau id produk (reader/player). */
  digitalItem?: string | null;
  /** Query mentah (tanpa '?') yang dipertahankan untuk halaman akun, checkout digital, dan hasil pembayaran. */
  query?: string;
}

const PAGE_PATHS: Record<string, ActivePage> = {
  '': 'beranda',
  beranda: 'beranda',
  home: 'beranda',
  katalog: 'katalog',
  penerbitan: 'penerbitan',
  pelatihan: 'pelatihan',
  jurnal: 'jurnal',
  'tentang-kami': 'tentang-kami',
  blog: 'blog',
  karir: 'karir',
  career: 'karir',
  kontak: 'kontak',
  admin: 'admin',
  checkout: 'checkout',
  digital: 'digital',
  membership: 'membership',
  institutions: 'institutions',
  library: 'library',
  account: 'account',
  payment: 'payment'
};

const VALID_SUBSECTIONS = new Set<string>([
  'all', 'terbaru', 'kategori', 'penulis', 'layanan', 'kirim-naskah', 'panduan', 'panduan-penulis',
  'proses', 'faq', 'profil', 'visi-misi', 'tim', 'legalitas'
]);

const ACCOUNT_SUBSECTIONS = new Set<string>(['login', 'register', 'reset', 'update-password', 'membership']);

const CATEGORIES = new Set(['Perpajakan', 'Akuntansi', 'Hukum', 'Ekonomi & Bisnis', 'Filsafat', 'Teologia']);

/** Halaman yang selalu tanpa prefix bahasa. */
const UNPREFIXED_PATH_RE = /^\/admin(\/|$)/;

/** Pisahkan prefix bahasa (/en, /zh) dari path. Tanpa prefix berarti Bahasa Indonesia. */
export const splitLanguagePrefix = (pathname: string): { language: AppLanguage; path: string } => {
  const match = pathname.match(/^\/([a-z]{2})(?=\/|$)/);
  if (match && isAppLanguage(match[1]) && match[1] !== DEFAULT_LANGUAGE) {
    return { language: match[1], path: pathname.slice(match[0].length) || '/' };
  }
  return { language: DEFAULT_LANGUAGE, path: pathname || '/' };
};

/** Tambahkan prefix bahasa ke path tanpa prefix (Bahasa Indonesia dan halaman admin tetap tanpa prefix). */
export const withLanguagePrefix = (path: string, language: AppLanguage): string => {
  if (language === DEFAULT_LANGUAGE || UNPREFIXED_PATH_RE.test(path)) return path;
  return `/${language}${path === '/' ? '' : path}`;
};

/** Bahasa menurut URL saat ini. */
export const languageFromLocation = (): AppLanguage =>
  typeof window === 'undefined' ? DEFAULT_LANGUAGE : splitLanguagePrefix(window.location.pathname).language;

export const parseLocation = (pathname: string = window.location.pathname, search: string = window.location.search): RouteState => {
  const { path } = splitLanguagePrefix(pathname);
  const segments = path.replace(/^\/+|\/+$/g, '').split('/').map(decodeURIComponent);
  const params = new URLSearchParams(search);
  const rawQuery = search.replace(/^\?/, '');
  const page = PAGE_PATHS[segments[0] || ''] || 'beranda';
  const state: RouteState = { page };

  if (page === 'katalog') {
    if (segments[1]) {
      if (VALID_SUBSECTIONS.has(segments[1])) {
        state.subSection = segments[1] as SubSection;
        if (segments[1] === 'penulis' && segments[2]) {
          state.selectedAuthorId = segments[2];
        }
      } else {
        state.bookSlug = segments[1];
      }
    }
    const kategori = params.get('kategori');
    if (kategori && CATEGORIES.has(kategori)) state.category = kategori;
    const q = params.get('q');
    if (q) state.search = q;
  } else if (page === 'digital') {
    const section = segments[1];
    if (section === 'checkout') {
      state.subSection = 'checkout';
      state.query = rawQuery;
    } else if (section === 'sample' && segments[2]) {
      state.subSection = 'sample';
      state.digitalItem = segments[2];
    } else {
      state.subSection = section === 'audiobook' ? 'audiobook' : 'ebook';
      if ((section === 'ebook' || section === 'audiobook') && segments[2]) state.digitalItem = segments[2];
    }
  } else if (page === 'library') {
    if ((segments[1] === 'read' || segments[1] === 'listen') && segments[2]) {
      state.subSection = segments[1];
      state.digitalItem = segments[2];
    } else if (rawQuery) {
      state.query = rawQuery;
    }
  } else if (page === 'membership') {
    if (segments[1] === 'checkout') {
      state.subSection = 'checkout';
      state.query = rawQuery;
    } else if (segments[1] === 'terms') {
      state.subSection = 'terms';
    }
  } else if (page === 'account') {
    state.subSection = (ACCOUNT_SUBSECTIONS.has(segments[1]) ? segments[1] : 'login') as SubSection;
    state.query = rawQuery;
  } else if (page === 'payment') {
    // /payment tanpa sub-path diperlakukan sebagai halaman sukses (status tetap dibaca dari server).
    state.subSection = segments[1] === 'failed' ? 'failed' : 'success';
    state.query = rawQuery;
  } else if (segments[1] && VALID_SUBSECTIONS.has(segments[1])) {
    state.subSection = segments[1] as SubSection;
  }
  return state;
};

/** Path tanpa prefix bahasa untuk sebuah state halaman. */
const buildBasePath = (state: RouteState): string => {
  const { page, subSection, bookSlug, selectedAuthorId, category, search, digitalItem, query } = state;
  if (page === 'beranda' || page === 'home') return '/';
  const base = page === 'career' ? '/karir' : `/${page}`;
  const withQuery = (path: string) => (query ? `${path}?${query}` : path);

  if (page === 'katalog') {
    if (bookSlug) return `${base}/${encodeURIComponent(bookSlug)}`;
    if (subSection === 'penulis' && selectedAuthorId) {
      return `${base}/penulis/${encodeURIComponent(selectedAuthorId)}`;
    }
    if (subSection === 'penulis' || subSection === 'terbaru' || subSection === 'kategori') {
      return `${base}/${subSection}`;
    }
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('kategori', category);
    if (search) params.set('q', search);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }
  if (page === 'digital') {
    if (subSection === 'checkout') return withQuery(`${base}/checkout`);
    if (subSection === 'sample' && digitalItem) return `${base}/sample/${encodeURIComponent(digitalItem)}`;
    const format = subSection === 'audiobook' ? 'audiobook' : 'ebook';
    return digitalItem ? `${base}/${format}/${encodeURIComponent(digitalItem)}` : `${base}/${format}`;
  }
  if (page === 'library') {
    if ((subSection === 'read' || subSection === 'listen') && digitalItem) return `${base}/${subSection}/${encodeURIComponent(digitalItem)}`;
    return withQuery(base);
  }
  if (page === 'membership') {
    if (subSection === 'checkout') return withQuery(`${base}/checkout`);
    if (subSection === 'terms') return `${base}/terms`;
    return base;
  }
  if (page === 'account') {
    const section = subSection && ACCOUNT_SUBSECTIONS.has(subSection) ? subSection : 'login';
    return withQuery(`${base}/${section}`);
  }
  if (page === 'payment') return withQuery(`${base}/${subSection === 'failed' ? 'failed' : 'success'}`);
  if (subSection && VALID_SUBSECTIONS.has(subSection)) return `${base}/${subSection}`;
  return base;
};

export const buildPath = (state: RouteState, language: AppLanguage = getCurrentLanguage()): string =>
  withLanguagePrefix(buildBasePath(state), language);

export const pushRoute = (state: RouteState, replace = false): void => {
  if (typeof window === 'undefined') return;
  const path = buildPath(state);
  const current = window.location.pathname + window.location.search;
  if (current === path) return;
  if (replace) window.history.replaceState(state, '', path);
  else window.history.pushState(state, '', path);
};

/**
 * Samakan prefix bahasa di URL saat ini dengan `language` tanpa menambah riwayat
 * (dipakai saat pengunjung mengganti bahasa). Parameter ?lang= dibuang karena bahasa sudah ada di path.
 */
export const replaceLanguageInUrl = (language: AppLanguage): void => {
  if (typeof window === 'undefined') return;
  const { path } = splitLanguagePrefix(window.location.pathname);
  const params = new URLSearchParams(window.location.search);
  params.delete('lang');
  const qs = params.toString();
  const next = `${withLanguagePrefix(path, language)}${qs ? `?${qs}` : ''}${window.location.hash}`;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) window.history.replaceState(window.history.state, '', next);
};
