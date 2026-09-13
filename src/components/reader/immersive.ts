import { useEffect, useState } from 'react';

/**
 * Tampilan layar penuh untuk reader/player: kunci scroll halaman, noindex, dan friksi ringan
 * (blok cetak & Ctrl/Cmd+S/P). Friksi ini BUKAN lapisan keamanan — perlindungan sebenarnya ada di backend
 * (entitlement + sesi + watermark per pengguna).
 */
export const useImmersivePage = (): void => {
  useEffect(() => {
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);

    const printBlock = document.createElement('style');
    printBlock.textContent = '@media print { body * { display: none !important; } }';
    document.head.appendChild(printBlock);

    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['s', 'p'].includes(event.key.toLowerCase())) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      body.style.overflow = previousOverflow;
      robots.remove();
      printBlock.remove();
      window.removeEventListener('keydown', onKey);
    };
  }, []);
};

export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
};

/** Preferensi tampilan reader per browser (bukan data penting: aman bila localStorage tidak tersedia). */
export interface ReaderPrefs {
  dark: boolean;
  twoPage: boolean;
  zoom: number;
}

const PREFS_KEY = 'cakranexa_reader_prefs';

export const readReaderPrefs = (): ReaderPrefs => {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<ReaderPrefs>;
    return {
      dark: raw.dark === true,
      twoPage: raw.twoPage === true,
      zoom: typeof raw.zoom === 'number' && raw.zoom >= 0.5 && raw.zoom <= 3 ? raw.zoom : 1
    };
  } catch {
    return { dark: false, twoPage: false, zoom: 1 };
  }
};

export const writeReaderPrefs = (prefs: ReaderPrefs): void => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // abaikan
  }
};
