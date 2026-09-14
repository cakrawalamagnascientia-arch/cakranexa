import { describe, expect, it } from 'vitest';
import { buildPath, parseLocation } from '../router';

describe('tautan undangan institusi (sementara, sampai halaman gabung Langkah 6 ada)', () => {
  it('/institutions/join/<slug> diarahkan ke Pustaka Saya, dengan atau tanpa prefix bahasa', () => {
    expect(parseLocation('/institutions/join/univ-contoh', '?invite=1')).toEqual({ page: 'library' });
    expect(parseLocation('/en/institutions/join/univ-contoh', '')).toEqual({ page: 'library' });
    expect(parseLocation('/zh/institutions/join', '')).toEqual({ page: 'library' });
    expect(buildPath({ page: 'library' }, 'en')).toBe('/en/library');
  });

  it('halaman /institutions tetap halaman institusi', () => {
    expect(parseLocation('/institutions', '')).toEqual({ page: 'institutions' });
  });
});
