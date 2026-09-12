import { createContext, useContext, useEffect, useState } from 'react';
import type { Book, DigitalFormat, DigitalProduct } from '../types';
import { apiClient } from '../services/apiClient';
import { DIGITAL_FORMATS, INITIAL_DIGITAL_PRODUCTS } from '../data/digitalProducts';

/** Produk digital beserta bukunya (buku diambil dari katalog aplikasi, termasuk terjemahannya). */
export interface DigitalEntry {
  product: DigitalProduct;
  book: Book;
}

export interface DigitalCatalog {
  /** Produk aktif yang bukunya ada di katalog. */
  entries: DigitalEntry[];
  forBook: (bookId: string) => Partial<Record<DigitalFormat, DigitalProduct>>;
  /** Jumlah judul berstatus "Tersedia" per format (badge menu). */
  availableCount: (format: DigitalFormat) => number;
  /** Format digital yang dimiliki setidaknya satu judul di kategori ini. */
  categoryFormats: (category: string) => DigitalFormat[];
  /** Cari berdasarkan format + slug (atau id) buku, seperti di URL /digital/<format>/<slug>. */
  findByBook: (format: DigitalFormat, slugOrId: string) => DigitalEntry | undefined;
  findById: (productId: string) => DigitalEntry | undefined;
}

export const buildDigitalCatalog = (books: Book[], products: DigitalProduct[]): DigitalCatalog => {
  const bookById = new Map(books.map((book) => [book.id, book]));
  const entries = products.flatMap((product) => {
    const book = bookById.get(product.bookId);
    return product.isActive && book ? [{ product, book }] : [];
  });
  return {
    entries,
    forBook: (bookId) => Object.fromEntries(
      entries.filter((entry) => entry.book.id === bookId).map((entry) => [entry.product.format, entry.product])
    ) as Partial<Record<DigitalFormat, DigitalProduct>>,
    availableCount: (format) => entries.filter((entry) => entry.product.format === format && entry.product.availabilityStatus === 'available').length,
    categoryFormats: (category) => DIGITAL_FORMATS.filter((format) =>
      entries.some((entry) => entry.product.format === format && entry.book.category === category)
    ),
    findByBook: (format, slugOrId) => entries.find((entry) =>
      entry.product.format === format && (entry.book.slug === slugOrId || entry.book.id === slugOrId)
    ),
    findById: (productId) => entries.find((entry) => entry.product.id === productId)
  };
};

const CACHE_KEY = 'cakranexa_digital_v1';

const readCachedProducts = (): DigitalProduct[] | null => {
  try {
    const saved = localStorage.getItem(CACHE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Produk digital: tampilan awal dari cache (atau data bawaan), lalu disinkronkan dari API.
 * Bila server tidak terjangkau, cache dipertahankan.
 */
export const useDigitalProducts = (): DigitalProduct[] => {
  const [products, setProducts] = useState<DigitalProduct[]>(() => readCachedProducts() ?? INITIAL_DIGITAL_PRODUCTS);

  useEffect(() => {
    let mounted = true;
    apiClient.getDigitalProducts().then((remote) => {
      if (!mounted || !remote) return;
      // Ringkasan buku dari server tidak disimpan: buku diambil dari katalog aplikasi.
      const next = remote.map(({ book: _book, ...product }) => product);
      setProducts(next);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        // abaikan batas penyimpanan
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return products;
};

export const DigitalCatalogContext = createContext<DigitalCatalog>(buildDigitalCatalog([], []));

export const useDigitalCatalog = (): DigitalCatalog => useContext(DigitalCatalogContext);
