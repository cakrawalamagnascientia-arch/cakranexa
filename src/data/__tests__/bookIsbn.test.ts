import { describe, expect, it } from 'vitest';
import { INITIAL_BOOKS, withLocalBookCover, withSeedIsbn } from '../booksData';

const seed = (id: string) => {
  const book = INITIAL_BOOKS.find((candidate) => candidate.id === id);
  if (!book) throw new Error(`buku ${id} tidak ada`);
  return book;
};

const isbn13Valid = (isbn: string) => {
  const digits = isbn.replace(/-/g, '');
  if (!/^\d{13}$/.test(digits)) return false;
  const sum = [...digits.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
};

describe('ISBN buku cetak', () => {
  it('Reformulasi Mekanisme PPN dan Prinsip-prinsip Transfer Pricing memakai ISBN cetak yang terbit', () => {
    expect(seed('book-3').isbn).toBe('978-634-05-5289-8');
    expect(seed('book-4').isbn).toBe('978-634-05-5211-9');
    expect(isbn13Valid(seed('book-3').isbn)).toBe(true);
    expect(isbn13Valid(seed('book-4').isbn)).toBe(true);
  });

  it('baris database lama yang kosong/"Dalam Pengajuan" memakai ISBN bawaan; ISBN dari admin dipertahankan', () => {
    expect(withSeedIsbn({ ...seed('book-3'), isbn: 'Dalam Pengajuan' }).isbn).toBe('978-634-05-5289-8');
    expect(withSeedIsbn({ ...seed('book-4'), isbn: '' }).isbn).toBe('978-634-05-5211-9');
    expect(withLocalBookCover({ ...seed('book-4'), isbn: 'Dalam Pengajuan' }).isbn).toBe('978-634-05-5211-9');
    expect(withSeedIsbn({ ...seed('book-4'), isbn: '978-634-00-0000-0' }).isbn).toBe('978-634-00-0000-0');
    // Buku yang ISBN bawaannya juga belum terbit tidak berubah.
    expect(withSeedIsbn({ ...seed('book-1'), isbn: 'Dalam Pengajuan' }).isbn).toBe('Dalam Pengajuan');
  });
});
