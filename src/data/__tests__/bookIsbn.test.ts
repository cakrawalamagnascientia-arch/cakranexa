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

  it('Akuntansi Forensik: Konsep dan Aplikasi masuk katalog cetak dengan ISBN, harga, penulis, dan penerbit', () => {
    const book = seed('book-29');
    expect(book.slug).toBe('akuntansi-forensik-konsep-dan-aplikasi');
    expect(book.isbn).toBe('978-634-05-4539-5');
    expect(isbn13Valid(book.isbn)).toBe(true);
    expect(book.harga).toBe(135000);
    expect(book.author).toBe('Didit Santoso & Anis W. Hermawan');
    expect(book.penerbit).toBe('PT Scientia Integritas Utama');
    expect(book.category).toBe('Akuntansi');
    expect(book.coverBuku).toBe('/images/books/akuntansi-forensik.png');
    expect(INITIAL_BOOKS.filter((b) => b.slug === book.slug)).toHaveLength(1);
  });

  it('ISBN cetak terbit lainnya sesuai data redaksi dan valid', () => {
    const bySlug = (slug: string) => INITIAL_BOOKS.find((b) => b.slug === slug)?.isbn;
    const expected: Record<string, string> = {
      'pajak-atas-sektor-konstruksi-di-indonesia-teori-dan-praktek': '978-634-05-4355-1',
      'pajak-merger-dan-akuisisi-m-dan-a-di-indonesia-prinsip-dan-konsep': '978-634-05-3605-8',
      'akuntansi-pajak-teori-dan-praktik-di-indonesia': '978-634-05-3785-7',
      'thin-capitalization-di-indonesia-titik-temu-investasi-kepatuhan-dan-keadilan-pajak': '978-634-05-3878-6'
    };
    for (const [slug, isbn] of Object.entries(expected)) {
      expect(bySlug(slug), slug).toBe(isbn);
      expect(isbn13Valid(isbn), isbn).toBe(true);
    }
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
