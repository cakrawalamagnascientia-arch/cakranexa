import type { Book, DigitalAvailability, DigitalFormat, DigitalProduct } from '../types';
import { INITIAL_BOOKS } from './booksData';

/**
 * Produk digital bawaan (seed) + aturan yang dipakai bersama oleh server, situs publik, dan dashboard admin.
 *
 * Fase 1: setiap judul punya e-book berstatus "Segera" tanpa harga, sampai admin mengisi harga satuan,
 * tanggal masuk Digital Reading Shelf, dan sampel. Audiobook hanya ada bila didefinisikan di SEED_OVERRIDES
 * atau dibuat lewat dashboard admin (tidak semua judul punya audiobook).
 */

export const DIGITAL_FORMATS: readonly DigitalFormat[] = ['ebook', 'audiobook'];
export const DIGITAL_AVAILABILITIES: readonly DigitalAvailability[] = ['coming_soon', 'available'];

/** Batas file di bucket PUBLIK "digital-samples" — hanya sampel, bukan file utuh. */
export const DIGITAL_SAMPLE_LIMITS = {
  maxImages: 10,
  maxImageBytes: 2 * 1024 * 1024,
  imageTypes: ['image/jpeg', 'image/png', 'image/webp'] as readonly string[],
  maxAudioSeconds: 360,
  maxAudioBytes: 8 * 1024 * 1024,
  audioTypes: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg'] as readonly string[],
  defaultAudioSeconds: 300,
  /** Rentang halaman sampel yang disarankan, dalam persen dari jumlah halaman. */
  recommendedPagePercent: { min: 10, max: 15 }
} as const;

/** Frontlist: judul baru masuk Digital Reading Shelf 90–180 hari setelah terbit. */
export const FRONTLIST_DAYS = { min: 90, max: 180 } as const;

// FNV-1a 32-bit; empat putaran dengan seed berbeda menghasilkan 128 bit untuk UUID stabil.
const fnv1a = (input: string, seed: number): number => {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

/** UUID stabil per buku × format, agar id sama di server, browser, dan Supabase. */
export const seedDigitalProductId = (bookId: string, format: DigitalFormat): string => {
  const key = `${bookId}:${format}`;
  const hex = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map((seed) => fnv1a(key, seed).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

/** Kunci unik produk (sama dengan UNIQUE(book_id, format) di database). */
export const digitalProductKey = (product: Pick<DigitalProduct, 'bookId' | 'format'>): string => `${product.bookId}:${product.format}`;

/** Produk baru berstatus "Segera" tanpa harga untuk sebuah buku. */
export const createDigitalProductDraft = (book: Pick<Book, 'id' | 'jumlahHalaman'>, format: DigitalFormat): DigitalProduct => ({
  id: seedDigitalProductId(book.id, format),
  bookId: book.id,
  format,
  price: 0,
  isActive: true,
  availabilityStatus: 'coming_soon',
  shelfEntryDate: null,
  pageCount: format === 'ebook' && book.jumlahHalaman > 0 ? book.jumlahHalaman : null,
  durationSeconds: null,
  narrator: null,
  samplePageStart: null,
  samplePageEnd: null,
  sampleAudioSeconds: DIGITAL_SAMPLE_LIMITS.defaultAudioSeconds,
  sampleImageUrls: [],
  sampleAudioUrl: null
});

/**
 * Isian per judul untuk data bawaan. Contoh:
 *   'book-24': {
 *     ebook: { price: 99000, availabilityStatus: 'available', shelfEntryDate: '2027-03-01' },
 *     audiobook: { price: 129000, durationSeconds: 21600, narrator: 'Nama Narator' }
 *   }
 * Perubahan lewat dashboard admin disimpan di Supabase dan menimpa isian ini.
 */
const SEED_OVERRIDES: Record<string, Partial<Record<DigitalFormat, Partial<DigitalProduct>>>> = {};

export const INITIAL_DIGITAL_PRODUCTS: DigitalProduct[] = INITIAL_BOOKS.flatMap((book) => {
  const overrides = SEED_OVERRIDES[book.id] || {};
  return DIGITAL_FORMATS
    .filter((format) => format === 'ebook' || Boolean(overrides[format]))
    .map((format) => ({ ...createDigitalProductDraft(book, format), ...overrides[format] }));
});

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** Tanggal (YYYY-MM-DD) menurut zona waktu lokal. */
export const toIsoDate = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
export const todayIsoDate = (): string => toIsoDate(new Date());
export const addDaysToIsoDate = (isoDate: string, days: number): string => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return toIsoDate(new Date(year, month - 1, day + days));
};

/** Status rak digital: sudah di rak, dijadwalkan (masih frontlist), atau tanggal belum ditetapkan. */
export type ShelfStatus = 'onShelf' | 'scheduled' | 'unscheduled';
export const getShelfStatus = (product: Pick<DigitalProduct, 'shelfEntryDate'>, today: string = todayIsoDate()): ShelfStatus => {
  if (!product.shelfEntryDate) return 'unscheduled';
  return product.shelfEntryDate <= today ? 'onShelf' : 'scheduled';
};

/** Produk bisa dibeli satuan (fase 2) bila tersedia dan sudah berharga. */
export const isUnitPurchasable = (product: Pick<DigitalProduct, 'availabilityStatus' | 'price'>): boolean =>
  product.availabilityStatus === 'available' && product.price > 0;

/** Persentase halaman sampel terhadap jumlah halaman; null bila data belum lengkap. */
export const samplePagePercent = (product: Pick<DigitalProduct, 'pageCount' | 'samplePageStart' | 'samplePageEnd'>): number | null => {
  const { pageCount, samplePageStart, samplePageEnd } = product;
  if (!pageCount || !samplePageStart || !samplePageEnd || samplePageEnd < samplePageStart) return null;
  return ((samplePageEnd - samplePageStart + 1) / pageCount) * 100;
};

const toNumberOrNull = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number(value));
const toTextOrNull = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
};

/** Ubah masukan JSON (camelCase) menjadi DigitalProduct; nilai yang salah tipe ditangkap oleh validateDigitalProduct. */
export const normalizeDigitalProduct = (input: any): DigitalProduct => ({
  id: String(input?.id ?? ''),
  bookId: String(input?.bookId ?? ''),
  format: input?.format as DigitalFormat,
  price: Number(input?.price ?? 0),
  isActive: input?.isActive !== false,
  availabilityStatus: (input?.availabilityStatus ?? 'coming_soon') as DigitalAvailability,
  shelfEntryDate: toTextOrNull(input?.shelfEntryDate),
  pageCount: toNumberOrNull(input?.pageCount),
  durationSeconds: toNumberOrNull(input?.durationSeconds),
  narrator: toTextOrNull(input?.narrator),
  samplePageStart: toNumberOrNull(input?.samplePageStart),
  samplePageEnd: toNumberOrNull(input?.samplePageEnd),
  sampleAudioSeconds: toNumberOrNull(input?.sampleAudioSeconds) ?? DIGITAL_SAMPLE_LIMITS.defaultAudioSeconds,
  sampleImageUrls: Array.isArray(input?.sampleImageUrls) ? input.sampleImageUrls.map((url: unknown) => String(url)) : [],
  sampleAudioUrl: toTextOrNull(input?.sampleAudioUrl),
  createdAt: typeof input?.createdAt === 'string' ? input.createdAt : undefined,
  updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : undefined
});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isIntegerIn = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/**
 * Validasi produk digital (server & dashboard admin). Mengembalikan pesan error untuk admin
 * (Bahasa Indonesia) atau null bila valid. `isAllowedSampleUrl` membatasi URL sampel ke bucket publik.
 */
export const validateDigitalProduct = (
  product: DigitalProduct,
  isAllowedSampleUrl: (url: string) => boolean = () => true
): string | null => {
  const { maxImages, maxAudioSeconds } = DIGITAL_SAMPLE_LIMITS;
  if (!product.bookId) return 'Buku wajib dipilih.';
  if (!DIGITAL_FORMATS.includes(product.format)) return 'Format harus ebook atau audiobook.';
  if (!DIGITAL_AVAILABILITIES.includes(product.availabilityStatus)) return 'Status ketersediaan tidak valid.';
  if (!isIntegerIn(product.price, 0, 100_000_000)) return 'Harga satuan harus bilangan bulat Rupiah (0 = belum ditetapkan).';
  if (product.availabilityStatus === 'available' && product.price <= 0) return 'Produk berstatus "Tersedia" wajib memiliki harga satuan.';
  if (product.shelfEntryDate !== null && (!ISO_DATE_RE.test(product.shelfEntryDate) || Number.isNaN(Date.parse(product.shelfEntryDate)))) {
    return 'Tanggal masuk rak digital tidak valid (format YYYY-MM-DD).';
  }
  if (product.pageCount !== null && !isIntegerIn(product.pageCount, 1, 100_000)) return 'Jumlah halaman harus bilangan bulat positif.';
  if (product.durationSeconds !== null && !isIntegerIn(product.durationSeconds, 1, 1_000_000)) return 'Durasi harus bilangan bulat positif (detik).';
  if (product.narrator !== null && product.narrator.length > 200) return 'Nama narator maksimal 200 karakter.';
  if (product.samplePageStart !== null || product.samplePageEnd !== null) {
    if (!isIntegerIn(product.samplePageStart, 1) || !isIntegerIn(product.samplePageEnd, 1)) {
      return 'Rentang halaman sampel wajib diisi lengkap (halaman awal dan akhir).';
    }
    if (product.samplePageEnd < product.samplePageStart) return 'Halaman akhir sampel harus sama atau setelah halaman awal.';
    if (product.pageCount && product.samplePageEnd > product.pageCount) return 'Rentang halaman sampel melebihi jumlah halaman.';
  }
  if (!isIntegerIn(product.sampleAudioSeconds, 1, maxAudioSeconds)) return `Durasi sampel audio maksimal ${maxAudioSeconds / 60} menit.`;
  if (!Array.isArray(product.sampleImageUrls) || product.sampleImageUrls.length > maxImages) return `Maksimal ${maxImages} gambar halaman sampel.`;
  if (product.sampleImageUrls.some((url) => typeof url !== 'string' || !isAllowedSampleUrl(url))) {
    return 'Gambar sampel harus berasal dari bucket sampel publik.';
  }
  if (product.sampleAudioUrl !== null && !isAllowedSampleUrl(product.sampleAudioUrl)) return 'Audio sampel harus berasal dari bucket sampel publik.';
  if (product.format === 'ebook' && product.sampleAudioUrl) return 'E-book tidak memakai audio sampel.';
  if (product.format === 'audiobook' && product.sampleImageUrls.length > 0) return 'Audiobook tidak memakai gambar halaman sampel.';
  return null;
};
