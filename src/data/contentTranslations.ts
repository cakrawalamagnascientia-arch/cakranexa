import type { Author, Book } from '../types';
import booksPart1 from './translations/books-part1.json';
import booksPart2 from './translations/books-part2.json';
import authors from './translations/authors.json';

/**
 * Terjemahan bawaan konten katalog (en, zh) untuk buku dan penulis awal.
 * Menjadi nilai awal field `i18n`; admin dapat mengubahnya lewat dashboard, dan terjemahan
 * yang tersimpan di server diutamakan. Buku/penulis baru diterjemahkan lewat dashboard admin.
 */
export const BOOK_TRANSLATIONS = { ...booksPart1, ...booksPart2 } as Record<string, Book['i18n']>;
export const AUTHOR_TRANSLATIONS = authors as Record<string, Author['i18n']>;
