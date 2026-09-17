import { describe, expect, it } from 'vitest';
import { createDigitalProductDraft, printReleaseDate, validateDigitalProduct } from '../digitalProducts';
import type { Book } from '../../types';

/** Form produk digital untuk skema langganan murni: harga satuan tidak wajib; tanggal rak dari tanggal terbit cetak. */
const book = { id: 'book-uji', name: 'Buku Uji', tahunTerbit: 2024 } as unknown as Book;

describe('produk digital: skema langganan', () => {
  it('produk "Tersedia" tanpa harga satuan valid; harga lama tetap harus bilangan bulat', () => {
    const draft = { ...createDigitalProductDraft(book, 'ebook'), availabilityStatus: 'available' as const, price: 0 };
    expect(validateDigitalProduct(draft)).toBeNull();
    expect(validateDigitalProduct({ ...draft, price: 99000 })).toBeNull();
    expect(validateDigitalProduct({ ...draft, price: 12.5 })).toMatch(/bilangan bulat/);
    expect(validateDigitalProduct({ ...draft, price: -1 })).toMatch(/bilangan bulat/);
  });

  it('bantuan "isi tanggal terbit cetak": tanggal rilis, cadangan 1 Januari tahun terbit, atau tidak ada', () => {
    expect(printReleaseDate({ releaseDate: '2024-05-17T00:00:00.000Z', tahunTerbit: 2024 })).toEqual({ date: '2024-05-17', approximate: false });
    expect(printReleaseDate({ releaseDate: null, tahunTerbit: 2023 })).toEqual({ date: '2023-01-01', approximate: true });
    expect(printReleaseDate({ releaseDate: 'bukan-tanggal', tahunTerbit: '2022' })).toEqual({ date: '2022-01-01', approximate: true });
    expect(printReleaseDate({ releaseDate: '', tahunTerbit: null })).toBeNull();
  });
});
