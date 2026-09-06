import { ActivePage, SubSection } from '../types';

/**
 * router.ts — sinkronisasi state SPA <-> URL browser (History API).
 * Membuat URL di sitemap (/katalog/<slug>, /penerbitan, ...) benar-benar bisa dibuka,
 * di-refresh, dibagikan, dan di-crawl. Tanpa dependensi router eksternal.
 */
export interface RouteState {
  page: ActivePage;
  subSection?: SubSection;
  bookSlug?: string | null;
  category?: string;
  search?: string;
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
  checkout: 'checkout'
};

const VALID_SUBSECTIONS = new Set<string>([
  'terbaru', 'kategori', 'penulis', 'layanan', 'kirim-naskah', 'panduan', 'panduan-penulis',
  'proses', 'faq', 'profil', 'visi-misi', 'tim', 'legalitas'
]);

const CATEGORIES = new Set(['Perpajakan', 'Akuntansi', 'Hukum', 'Ekonomi & Bisnis', 'Filsafat', 'Teologia']);

export const parseLocation = (pathname: string = window.location.pathname, search: string = window.location.search): RouteState => {
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').map(decodeURIComponent);
  const params = new URLSearchParams(search);
  const page = PAGE_PATHS[segments[0] || ''] || 'beranda';
  const state: RouteState = { page };

  if (page === 'katalog') {
    if (segments[1]) state.bookSlug = segments[1];
    const kategori = params.get('kategori');
    if (kategori && CATEGORIES.has(kategori)) state.category = kategori;
    const q = params.get('q');
    if (q) state.search = q;
  } else if (segments[1] && VALID_SUBSECTIONS.has(segments[1])) {
    state.subSection = segments[1] as SubSection;
  }
  return state;
};

export const buildPath = (state: RouteState): string => {
  const { page, subSection, bookSlug, category, search } = state;
  if (page === 'beranda' || page === 'home') return '/';
  const base = page === 'career' ? '/karir' : `/${page}`;

  if (page === 'katalog') {
    if (bookSlug) return `${base}/${encodeURIComponent(bookSlug)}`;
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('kategori', category);
    if (search) params.set('q', search);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }
  if (subSection && VALID_SUBSECTIONS.has(subSection)) return `${base}/${subSection}`;
  return base;
};

export const pushRoute = (state: RouteState, replace = false): void => {
  if (typeof window === 'undefined') return;
  const path = buildPath(state);
  const current = window.location.pathname + window.location.search;
  if (current === path) return;
  if (replace) window.history.replaceState(state, '', path);
  else window.history.pushState(state, '', path);
};
