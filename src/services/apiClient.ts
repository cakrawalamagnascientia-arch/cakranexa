import {
  Book,
  Order,
  OrderStatus,
  Author,
  DigitalFormat,
  DigitalProduct,
  PublicDigitalProduct,
  InstitutionInquiry,
  InstitutionInquiryStatus,
  InstitutionType,
  AdminBankAccount
} from '../types';
import { INITIAL_BOOKS, normalizeBookAuthors, withSeedIsbn } from '../data/booksData';
import { INITIAL_AUTHORS, INITIAL_BOOK_AUTHORS, normalizeAuthorProfile, authorNameKey } from '../data/authorsData';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { getAdminToken, clearAdminToken } from './adminAuth';

/**
 * Base URL backend Express.
 * - Kosong ('')  => same-origin (mode dev `tsx server.ts` di port 3000, atau Render full-stack).
 * - Terisi       => decoupled (frontend di Vercel, API di Render), mis. https://cakranexa-api.onrender.com
 */
export const API_BASE_URL: string = (() => {
  try {
    const env = (import.meta as any).env || {};
    const v = env.VITE_API_BASE_URL || env.NEXT_PUBLIC_API_BASE_URL || '';
    return String(v).replace(/\/$/, '');
  } catch {
    return '';
  }
})();

export const apiUrl = (path: string): string => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

const jsonHeaders = (): Record<string, string> => ({ 'Content-Type': 'application/json', Accept: 'application/json' });

const adminHeaders = (): Record<string, string> => {
  const token = getAdminToken();
  return token ? { ...jsonHeaders(), Authorization: `Bearer ${token}` } : jsonHeaders();
};

/** Batas waktu penyimpanan admin: server Render free tier butuh ±30-60 detik untuk bangun dari tidur. */
const ADMIN_WRITE_TIMEOUT_MS = 60000;
/** Sinkron katalog di latar belakang ikut menunggu server bangun; tampilan awal memakai cache. */
const CATALOG_SYNC_TIMEOUT_MS = 60000;

/** fetch dengan timeout agar UI tidak menggantung saat backend tidur (Render free tier) */
export const fetchWithTimeout = async (input: string, init: RequestInit = {}, timeoutMs = 12000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const parseError = async (res: Response): Promise<ApiError> => {
  let message = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    // ignore
  }
  if (res.status === 401) clearAdminToken();
  return new ApiError(message, res.status);
};

/** Permintaan JSON admin (header admin + batas waktu admin); galat server `{ error }` menjadi ApiError. */
const adminRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetchWithTimeout(apiUrl(path), { ...init, headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
};

/** Satu baris antrian transfer keanggotaan (backend MembershipService.adminTransfers). */
export interface AdminMembershipTransfer {
  id: string;
  orderRef: string;
  kind: 'initial' | 'renewal' | 'upgrade' | 'manual';
  planCode: string | null;
  amount: number;
  status: string;
  dueAt: string | null;
  issuedAt: string | null;
  transfer: { uniqueCode: string | null; uniqueDiscount: number; baseAmount: number; hasProof: boolean; proofUploadedAt: string | null } | null;
  subscriptionId: string;
  subscriptionStatus: string | null;
  customerName: string;
  customerEmail: string;
  isTest: boolean;
  failureReason: string | null;
  dueExtendedCount: number;
}

export interface CreateOrderResponse {
  success: boolean;
  orderId: string;
  snapToken?: string | null;
  paymentMode: 'midtrans_production' | 'midtrans_sandbox' | 'manual' | 'unavailable' | 'offline';
  total?: number;
  /** Transfer bank: halaman pesanan pembeli (/pesanan/<nomor>?t=...) berisi instruksi transfer. */
  orderPath?: string;
  accessToken?: string;
  paymentMethod?: string;
  uniqueCode?: number | null;
  uniqueDiscount?: number;
  paymentDueAt?: string | null;
  shippingZone?: string | null;
  manualShippingQuote?: boolean;
  subtotal?: number;
  shippingCost?: number;
  /** Ada bila server menerapkan harga member buku cetak (fase 3 Langkah 7). */
  memberDiscount?: { percent: number; planCode: string };
  paymentStatus?: OrderStatus;
}

const rowToBook = (row: any): Book => withSeedIsbn(normalizeBookAuthors({
  id: row.id,
  name: row.name,
  subtitle: row.subtitle || undefined,
  coverQuote: row.cover_quote || undefined,
  slug: row.slug,
  author: row.author,
  category: row.category,
  isbn: row.isbn,
  tahunTerbit: Number(row.tahun_terbit) || new Date().getFullYear(),
  jumlahHalaman: Number(row.jumlah_halaman) || 0,
  ukuranBuku: row.ukuran_buku,
  harga: Number(row.harga) || 0,
  sinopsis: row.sinopsis,
  linkPembelian: row.link_pembelian || '#',
  bukuTerbaru: Boolean(row.buku_terbaru),
  penerbit: row.penerbit,
  coverBuku: row.cover_buku,
  badge: row.badge || undefined,
  rating: row.rating != null ? Number(row.rating) : undefined,
  reviewsCount: row.reviews_count != null ? Number(row.reviews_count) : undefined,
  stock: row.stock != null ? Number(row.stock) : undefined,
  beratGram: Number(row.berat_gram) || 500,
  originalHarga: row.original_harga != null ? Number(row.original_harga) : undefined,
  discountPercentage: row.discount_percentage != null ? Number(row.discount_percentage) : undefined,
  releaseDate: row.release_date || undefined,
  daftarIsi: Array.isArray(row.daftar_isi) ? row.daftar_isi : undefined,
  tentangPenulis: row.tentang_penulis || undefined,
  isBestSeller: Boolean(row.is_best_seller),
  featured: Boolean(row.featured),
  i18n: row.i18n && typeof row.i18n === 'object' ? row.i18n : undefined
}));

const rowToAuthor = (row: any): Author => normalizeAuthorProfile({
  id: row.id,
  name: row.name,
  academic_titles: row.academic_titles || undefined,
  photo_url: row.photo_url || (() => {
    const name = String(row.name || '').toLowerCase();
    if (name.includes('henry dianto')) return '/images/authors/henry-dianto-p-sinaga.png';
    if (name.includes('joko purnomo')) return '/images/authors/joko-purnomo-raharjo.png';
    if (name.includes('wahyu widodo')) return '/images/authors/wahyu-widodo.png';
    if (name.includes('andi banua adams')) return '/images/authors/andi-banua-adams.png';
    return undefined;
  })(),
  scopus_id: row.scopus_id || undefined,
  orcid_id: row.orcid_id || undefined,
  linkedin_url: row.linkedin_url || undefined,
  email: row.email || undefined,
  profile_education: row.profile_education ?? undefined,
  work_experience: row.work_experience ?? undefined,
  organization_seminar: row.organization_seminar ?? undefined,
  publications: row.publications ?? undefined,
  created_at: row.created_at,
  updated_at: row.updated_at,
  i18n: row.i18n && typeof row.i18n === 'object' ? row.i18n : undefined,
  books: Array.isArray(row.books) ? row.books.map((b: any) => (typeof b === 'object' && 'id' in b ? rowToBook(b) : b)) : undefined
});

export const apiClient = {
  // ==========================================================================
  // ADMIN AUTH
  // ==========================================================================
  async adminLogin(password: string): Promise<{ token: string; expiresAt: string }> {
    const res = await fetchWithTimeout(apiUrl('/api/admin/login'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ password })
    });
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async adminVerify(): Promise<boolean> {
    if (!getAdminToken()) return false;
    try {
      const res = await fetchWithTimeout(apiUrl('/api/admin/me'), { headers: adminHeaders() }, 8000);
      if (res.status === 401) {
        clearAdminToken();
        return false;
      }
      return res.ok;
    } catch {
      return false; // backend tidak terjangkau
    }
  },

  async adminLogout(): Promise<void> {
    try {
      await fetchWithTimeout(apiUrl('/api/admin/logout'), { method: 'POST', headers: adminHeaders() }, 5000);
    } catch {
      // ignore
    } finally {
      clearAdminToken();
    }
  },

  async health(): Promise<any | null> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/health'), { headers: jsonHeaders() }, 6000);
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  },

  /**
   * Rekening perusahaan aktif untuk transfer manual di checkout buku cetak (publik, dari admin_bank_accounts).
   * null bila server tidak terjangkau atau belum tersambung ke database; pemanggil memakai rekening bawaan.
   */
  async getPublicBankAccounts(): Promise<AdminBankAccount[] | null> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/bank-accounts'), { headers: jsonHeaders() }, CATALOG_SYNC_TIMEOUT_MS);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.persisted && Array.isArray(data.accounts) ? (data.accounts as AdminBankAccount[]) : null;
    } catch {
      return null;
    }
  },

  // ==========================================================================
  // BOOKS
  // ==========================================================================
  /**
   * Urutan sumber: 1) Express API (sumber kebenaran; sudah menggabungkan buku bawaan & yang dihapus admin)
   *                2) Supabase langsung (anon key, read-only) jika API mati
   * Mengembalikan null bila keduanya tidak terjangkau, agar pemanggil mempertahankan cache
   * dan tidak menimpa perubahan admin dengan data bawaan.
   */
  async getBooks(): Promise<Book[] | null> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/books'), { headers: jsonHeaders() }, CATALOG_SYNC_TIMEOUT_MS);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data as Book[];
      }
    } catch (err) {
      console.warn('REST API tidak tersedia, mencoba Supabase langsung:', err);
    }

    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data, error } = await client.from('books').select('*').order('created_at', { ascending: true });
          if (!error && data) {
            const remote = data.map(rowToBook);
            const remoteIds = new Set(remote.map((book) => book.id));
            return [...remote, ...INITIAL_BOOKS.filter((book) => !remoteIds.has(book.id))];
          }
        }
      } catch (err) {
        console.warn('Supabase query gagal:', err);
      }
    }

    return null;
  },

  /** Admin: buat / perbarui buku (server melakukan upsert ke Supabase) */
  async saveBook(book: Book): Promise<Book> {
    const res = await fetchWithTimeout(apiUrl('/api/books'), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(book)
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    const data = await res.json();
    return data.book as Book;
  },

  /** Admin: hapus buku */
  async deleteBook(id: string): Promise<void> {
    const res = await fetchWithTimeout(apiUrl(`/api/books/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: adminHeaders()
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
  },

  // ==========================================================================
  // AUTHORS (Penulis & Kontributor)
  // ==========================================================================
  /** Sama seperti getBooks: null bila server & Supabase tidak terjangkau. */
  async getAuthors(): Promise<Author[] | null> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/authors'), { headers: jsonHeaders() }, CATALOG_SYNC_TIMEOUT_MS);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data.map((r: any) => rowToAuthor(r));
      }
    } catch (err) {
      console.warn('REST API authors tidak tersedia:', err);
    }
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data, error } = await client.from('authors').select('*').order('name', { ascending: true });
          if (!error && data) {
            const remote = data.map(rowToAuthor);
            const remoteKeys = new Set(remote.map((author) => authorNameKey(author.name)));
            return [...remote, ...INITIAL_AUTHORS.filter((author) => !remoteKeys.has(authorNameKey(author.name)))];
          }
        }
      } catch (err) {
        console.warn('Supabase author query gagal:', err);
      }
    }
    return null;
  },

  async getAuthorDetail(id: string): Promise<Author | null> {
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/authors/${encodeURIComponent(id)}`), { headers: jsonHeaders() }, 10000);
      if (res.status === 200) {
        const data = await res.json();
        return rowToAuthor(data);
      }
    } catch (err) {
      console.warn('GET author detail fallback ke seed:', err);
    }
    // Fallback: cari di INITIAL_AUTHORS + attach relasi buku dari INITIAL_BOOK_AUTHORS
    const seed = INITIAL_AUTHORS.find((a) => a.id === id);
    if (!seed) return null;
    const bookIds = INITIAL_BOOK_AUTHORS.filter((r) => r.author_id === id).map((r) => r.book_id);
    const books = INITIAL_BOOKS.filter((b) => bookIds.includes(b.id));
    return { ...seed, books };
  },

  /** Admin: create / update penulis (server melakukan penyimpanan ke Supabase). */
  async saveAuthor(author: Author, operation: 'create' | 'update' = 'update'): Promise<Author> {
    const method = operation === 'update' ? 'PUT' : 'POST';
    const res = await fetchWithTimeout(
      method === 'PUT' ? apiUrl(`/api/authors/${encodeURIComponent(author.id)}`) : apiUrl('/api/authors'),
      {
        method,
        headers: adminHeaders(),
        body: JSON.stringify(author)
      },
      ADMIN_WRITE_TIMEOUT_MS
    );
    if (!res.ok) throw await parseError(res);
    return rowToAuthor(await res.json());
  },

  /** Admin: hapus penulis */
  async deleteAuthor(id: string): Promise<void> {
    const res = await fetchWithTimeout(apiUrl(`/api/authors/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: adminHeaders()
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
  },

  /** Admin: atur ulang relasi buku penulis */
  async setAuthorBooks(authorId: string, bookIds: string[]): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/authors/${encodeURIComponent(authorId)}/books`), {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ book_ids: bookIds })
      }, ADMIN_WRITE_TIMEOUT_MS);
      return res.ok;
    } catch (err) {
      console.warn('setAuthorBooks gagal (offline-mode):', err);
      return false;
    }
  },

  // ==========================================================================
  // ORDERS
  // ==========================================================================
  /**
   * Membuat pesanan lewat SATU jalur: Express API (yang menulis ke Supabase dengan service role,
   * memvalidasi harga, mengurangi stok, dan membuat Snap token Midtrans).
   * Tidak lagi menulis langsung ke Supabase dari browser -> tidak ada order ganda.
   */
  async createOrder(order: Order, options: { accessToken?: string | null } = {}): Promise<CreateOrderResponse> {
    try {
      // Harga member (fase 3 Langkah 7): token login hanya dikirim bila harga member berlaku untuk pengguna ini.
      // Tanpa token, permintaan identik dengan alur cetak biasa.
      const headers = options.accessToken ? { ...jsonHeaders(), Authorization: `Bearer ${options.accessToken}` } : jsonHeaders();
      const res = await fetchWithTimeout(apiUrl('/api/orders'), {
        method: 'POST',
        headers,
        body: JSON.stringify(order)
      }, 20000);
      if (!res.ok) throw await parseError(res);
      const data = await res.json();
      return {
        success: true,
        orderId: data.orderId || order.orderNumber,
        snapToken: data.snapToken ?? null,
        paymentMode: data.paymentMode || 'unavailable',
        total: data.total,
        subtotal: data.subtotal,
        shippingCost: data.shippingCost,
        paymentStatus: data.paymentStatus,
        orderPath: data.orderPath,
        accessToken: data.accessToken,
        paymentMethod: data.paymentMethod,
        uniqueCode: data.uniqueCode ?? null,
        uniqueDiscount: data.uniqueDiscount ?? 0,
        paymentDueAt: data.paymentDueAt ?? null,
        shippingZone: data.shippingZone ?? null,
        manualShippingQuote: Boolean(data.manualShippingQuote),
        ...(data.memberDiscount ? { memberDiscount: data.memberDiscount } : {})
      };
    } catch (err) {
      if (err instanceof ApiError) throw err; // validasi server (400/409) harus ditampilkan ke pengguna
      console.warn('Backend tidak terjangkau; pesanan disimpan lokal saja:', err);
      return { success: true, orderId: order.orderNumber, snapToken: null, paymentMode: 'offline' };
    }
  },

  /** Admin: update status pembayaran / nomor resi */
  async updateOrder(order: Order): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/orders/${encodeURIComponent(order.orderNumber)}`), {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ paymentStatus: order.paymentStatus, trackingNumber: order.trackingNumber })
      });
      if (!res.ok) throw await parseError(res);
      return true;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.warn('Backend tidak terjangkau; update order hanya tersimpan lokal:', err);
      return false;
    }
  },

  /** Admin: ambil seluruh pesanan dari server (Supabase) */
  async getOrders(): Promise<any[]> {
    const res = await fetchWithTimeout(apiUrl('/api/orders'), { headers: adminHeaders() });
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  /** Publik: status pesanan (tanpa data pribadi) */
  async getOrderStatus(orderNumber: string): Promise<{ orderNumber: string; paymentStatus: OrderStatus; trackingNumber: string | null } | null> {
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/orders/${encodeURIComponent(orderNumber)}/status`), { headers: jsonHeaders() });
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  },

  // ==========================================================================
  // SEO & CMS (dipakai oleh seoService / siteContentService)
  // ==========================================================================
  async getSeoSettings(): Promise<any | null> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/seo'), { headers: jsonHeaders() }, 8000);
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  },

  async saveSeoSettings(settings: any): Promise<boolean> {
    const res = await fetchWithTimeout(apiUrl('/api/seo'), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(settings)
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return true;
  },

  async getSiteContent(): Promise<any | null> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/site-content'), { headers: jsonHeaders() }, 8000);
      if (res.status === 204 || !res.ok) return null;
      const data = await res.json();
      return data && typeof data === 'object' && !('status' in data && 'message' in data) ? data : null;
    } catch {
      return null;
    }
  },

  async saveSiteContent(content: any): Promise<boolean> {
    const res = await fetchWithTimeout(apiUrl('/api/site-content'), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(content)
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return true;
  },

  // ==========================================================================
  // PRODUK DIGITAL (E-BOOK & AUDIOBOOK)
  // ==========================================================================
  /** Katalog digital publik (produk aktif + ringkasan buku). null bila server tidak terjangkau. */
  async getDigitalProducts(): Promise<PublicDigitalProduct[] | null> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/digital/products'), { headers: jsonHeaders() }, CATALOG_SYNC_TIMEOUT_MS);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data as PublicDigitalProduct[];
      }
    } catch (err) {
      console.warn('Katalog digital tidak tersedia:', err);
    }
    return null;
  },

  /** Admin: semua produk digital (termasuk nonaktif) + status penyimpanan server. */
  async getAdminDigitalProducts(): Promise<AdminDigitalCatalog> {
    const res = await fetchWithTimeout(apiUrl('/api/admin/digital/products'), { headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  /** Admin: buat / perbarui produk digital (unik per buku × format). */
  async saveDigitalProduct(product: DigitalProduct): Promise<DigitalProduct> {
    const res = await fetchWithTimeout(apiUrl('/api/admin/digital/products'), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(product)
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    const data = await res.json();
    return data.product as DigitalProduct;
  },

  async deleteDigitalProduct(id: string): Promise<void> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital/products/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: adminHeaders()
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
  },

  /**
   * Admin: unggah file SAMPEL ke bucket publik. Server memvalidasi jenis, ukuran, durasi, dan jumlah file,
   * lalu memberi signed upload URL; file dikirim langsung ke Supabase Storage. Mengembalikan URL publik file.
   */
  async uploadDigitalSample(params: {
    bookId: string;
    format: DigitalFormat;
    kind: 'image' | 'audio';
    file: File;
    durationSeconds?: number;
    existingCount?: number;
  }): Promise<string> {
    const { file, ...meta } = params;
    const res = await fetchWithTimeout(apiUrl('/api/admin/digital/sample-upload'), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ ...meta, contentType: file.type, size: file.size })
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    const { uploadUrl, publicUrl } = await res.json();
    // Format yang sama dengan supabase-js uploadToSignedUrl.
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', file);
    const upload = await fetchWithTimeout(uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form }, ADMIN_WRITE_TIMEOUT_MS);
    if (!upload.ok) throw new ApiError(`Unggah ke Supabase Storage gagal (HTTP ${upload.status}).`, upload.status);
    return publicUrl as string;
  },

  /** Admin: hapus file sampel yang diunggah tetapi batal disimpan (server menolak file yang masih dipakai). */
  async deleteDigitalSample(url: string): Promise<void> {
    const res = await fetchWithTimeout(apiUrl('/api/admin/digital/sample'), {
      method: 'DELETE',
      headers: adminHeaders(),
      body: JSON.stringify({ url })
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
  },

  // ==========================================================================
  // INSTITUTION & LIBRARY NETWORK
  // ==========================================================================
  /** Publik: kirim permintaan penawaran institusi. */
  async submitInstitutionInquiry(inquiry: InstitutionInquiryInput): Promise<void> {
    const res = await fetchWithTimeout(apiUrl('/api/institutions/inquiry'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(inquiry)
    }, 30000);
    if (!res.ok) throw await parseError(res);
  },

  /** Admin: daftar permintaan penawaran, terbaru lebih dulu. */
  async getInstitutionInquiries(): Promise<InstitutionInquiry[]> {
    const res = await fetchWithTimeout(apiUrl('/api/admin/institutions/inquiries'), { headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async updateInstitutionInquiryStatus(id: string, status: InstitutionInquiryStatus): Promise<void> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/institutions/inquiries/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status })
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
  },

  // ==========================================================================
  // PRODUK DIGITAL FASE 2 — FILE MASTER & PEMROSESAN (admin)
  // ==========================================================================
  async listDigitalProcessingStates(): Promise<{ products: DigitalProcessingState[] }> {
    const res = await fetchWithTimeout(apiUrl('/api/admin/digital/processing'), { headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async getDigitalProcessingState(productId: string): Promise<DigitalProcessingState> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital/processing/${encodeURIComponent(productId)}`), { headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  /** Unggah file master (PDF/audio) ke bucket privat lewat server; progres unggah dilaporkan 0..1. */
  uploadDigitalMaster(productId: string, file: File, onProgress?: (fraction: number) => void): Promise<DigitalProcessingState> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl(`/api/admin/digital/processing/${encodeURIComponent(productId)}/master`));
      const token = getAdminToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
      };
      xhr.onload = () => {
        let body: any = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body as DigitalProcessingState);
          return;
        }
        if (xhr.status === 401) clearAdminToken();
        reject(new ApiError(body?.error || `HTTP ${xhr.status}`, xhr.status));
      };
      xhr.onerror = () => reject(new ApiError('Unggahan gagal: server tidak terjangkau.', 0));
      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  },

  async reprocessDigitalProduct(productId: string): Promise<DigitalProcessingState> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital/processing/${encodeURIComponent(productId)}/reprocess`), {
      method: 'POST',
      headers: adminHeaders()
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async saveDigitalChapters(productId: string, text: string): Promise<{ chapters: DigitalChapter[]; skipped: number; errors: string[] }> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital/processing/${encodeURIComponent(productId)}/chapters`), {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ text })
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  // ==========================================================================
  // PRODUK DIGITAL FASE 2 — PENJUALAN (admin)
  // ==========================================================================
  /** Ringkasan penjualan digital; pesanan uji (email beta) dihitung terpisah. */
  async getDigitalSalesSummary(): Promise<DigitalSalesSummary> {
    const res = await fetchWithTimeout(apiUrl('/api/admin/digital-access/orders/summary'), { headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  /** Hapus SEMUA pesanan uji (is_test) beserta hak aksesnya. Pesanan asli tidak tersentuh. */
  async deleteDigitalTestOrders(): Promise<{ ordersDeleted: number; entitlementsDeleted: number }> {
    const res = await fetchWithTimeout(apiUrl('/api/admin/digital-access/test-orders'), {
      method: 'DELETE',
      headers: adminHeaders(),
      body: JSON.stringify({ confirm: true })
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  // ==========================================================================
  // PRODUK DIGITAL FASE 2 — ENTITLEMENT, AKSES & ANOMALI (admin)
  // ==========================================================================
  async searchDigitalUsers(query: string): Promise<{ users: AdminDigitalUser[] }> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital-access/users?q=${encodeURIComponent(query)}`), { headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async getDigitalUserAccess(userId: string): Promise<AdminUserAccess> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital-access/users/${encodeURIComponent(userId)}`), { headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async grantDigitalEntitlement(input: { userId: string; productId: string; endsAt?: string | null; maxDevices?: number }): Promise<{ entitlement: AdminEntitlement }> {
    const res = await fetchWithTimeout(apiUrl('/api/admin/digital-access/entitlements'), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(input)
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async setDigitalEntitlementStatus(id: string, status: 'active' | 'suspended' | 'revoked', reason?: string): Promise<void> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital-access/entitlements/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status, reason })
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
  },

  async releaseDigitalDeviceAsAdmin(deviceId: string): Promise<void> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital-access/devices/${encodeURIComponent(deviceId)}/release`), {
      method: 'POST',
      headers: adminHeaders()
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
  },

  async endDigitalUserSessions(userId: string): Promise<{ sessionsEnded: number }> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital-access/users/${encodeURIComponent(userId)}/end-sessions`), {
      method: 'POST',
      headers: adminHeaders()
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async listDigitalAnomalies(status: 'open' | 'resolved' | 'all'): Promise<{ anomalies: AdminAnomaly[] }> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital-access/anomalies?status=${status}`), { headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  async resolveDigitalAnomaly(id: string, note: string, reactivate: boolean): Promise<void> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/digital-access/anomalies/${encodeURIComponent(id)}/resolve`), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ note, reactivate })
    }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
  },

  async scanDigitalAnomalies(): Promise<{ candidates: number; created: number }> {
    const res = await fetchWithTimeout(apiUrl('/api/admin/digital-access/anomalies/scan'), { method: 'POST', headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return res.json();
  },

  // ==========================================================================
  // KEANGGOTAAN FASE 3 (admin, Langkah 8)
  // ==========================================================================
  /** Ringkasan bulan berjalan (WIB); langganan uji tidak dihitung. */
  getMembershipSummary(): Promise<AdminMembershipSummary> {
    return adminRequest('/api/admin/membership/summary');
  },

  getMembershipPlans(): Promise<AdminMembershipPlans> {
    return adminRequest('/api/admin/membership/plans');
  },

  /** Kirim hanya kolom yang berubah. */
  updateMembershipPlan(code: string, patch: AdminMembershipPlanPatch): Promise<{ plan: AdminMembershipPlan; warnings: string[]; note: string }> {
    return adminRequest(`/api/admin/membership/plans/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  listMembershipSubscriptions(filters: AdminSubscriptionFilters = {}): Promise<{ subscriptions: AdminSubscription[]; total: number }> {
    const params = new URLSearchParams();
    if (filters.plan) params.set('plan', filters.plan);
    if (filters.status) params.set('status', filters.status);
    if (filters.founding) params.set('founding', filters.founding);
    if (filters.q?.trim()) params.set('q', filters.q.trim());
    if (filters.all) params.set('all', '1');
    const query = params.toString();
    return adminRequest(`/api/admin/membership/subscriptions${query ? `?${query}` : ''}`);
  },

  /** Fase 6: antrian transfer keanggotaan untuk Finance (?expired=1 menyertakan yang baru kedaluwarsa). */
  listMembershipTransfers(includeExpired = false): Promise<{ transfers: AdminMembershipTransfer[] }> {
    return adminRequest(`/api/admin/membership/transfers${includeExpired ? '?expired=1' : ''}`);
  },

  confirmMembershipTransfer(invoiceId: string, input: { reference?: string; allow_expired?: boolean }): Promise<{ invoice: Record<string, unknown> }> {
    return adminRequest(`/api/admin/membership/transfers/${encodeURIComponent(invoiceId)}/confirm`, { method: 'POST', body: JSON.stringify(input) });
  },

  extendMembershipTransfer(invoiceId: string, hours: number): Promise<{ invoice: Record<string, unknown> }> {
    return adminRequest(`/api/admin/membership/transfers/${encodeURIComponent(invoiceId)}/extend`, { method: 'POST', body: JSON.stringify({ hours }) });
  },

  async membershipTransferProofUrl(invoiceId: string): Promise<string> {
    const res = await fetchWithTimeout(apiUrl(`/api/admin/membership/transfers/${encodeURIComponent(invoiceId)}/proof`), { headers: adminHeaders() }, ADMIN_WRITE_TIMEOUT_MS);
    if (!res.ok) throw await parseError(res);
    return URL.createObjectURL(await res.blob());
  },

  getMembershipSubscription(id: string): Promise<AdminSubscriptionDetail> {
    return adminRequest(`/api/admin/membership/subscriptions/${encodeURIComponent(id)}`);
  },

  /** Perpanjang manual (pembayaran offline). amount kosong = nominal perpanjangan reguler. */
  extendMembershipSubscription(id: string, input: { amount?: number; note?: string }): Promise<AdminSubscriptionActionResult> {
    return adminRequest(`/api/admin/membership/subscriptions/${encodeURIComponent(id)}/extend`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true, ...input })
    });
  },

  /** Masa tenggang tambahan 1–30 hari untuk periode berjalan. */
  addMembershipGrace(id: string, input: { days: number; note?: string }): Promise<AdminSubscriptionActionResult> {
    return adminRequest(`/api/admin/membership/subscriptions/${encodeURIComponent(id)}/grace`, { method: 'POST', body: JSON.stringify(input) });
  },

  cancelMembershipSubscription(id: string, input: { immediate?: boolean; note?: string }): Promise<AdminSubscriptionActionResult> {
    return adminRequest(`/api/admin/membership/subscriptions/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true, ...input })
    });
  },

  changeMembershipPlan(
    id: string,
    input: { plan_code: AdminPlanCode; billing_cycle?: AdminBillingCycle; when: 'now' | 'period_end'; note?: string }
  ): Promise<AdminSubscriptionActionResult> {
    return adminRequest(`/api/admin/membership/subscriptions/${encodeURIComponent(id)}/change-plan`, { method: 'POST', body: JSON.stringify(input) });
  },

  setMembershipFounding(id: string, input: { is_founding: boolean; note?: string }): Promise<AdminSubscriptionActionResult> {
    return adminRequest(`/api/admin/membership/subscriptions/${encodeURIComponent(id)}/founding`, { method: 'POST', body: JSON.stringify(input) });
  },

  /** Status gateway WhatsApp; bila `to` diisi, kirim satu pesan uji ke nomor itu. */
  testMembershipWhatsApp(to?: string): Promise<AdminWhatsAppTestResult> {
    return adminRequest('/api/admin/membership/whatsapp/test', { method: 'POST', body: JSON.stringify(to ? { to } : {}) });
  },

  /**
   * Ekspor CSV (UTF-8 BOM) sebagai Blob. Nama file dari Content-Disposition bila terbaca
   * (lintas-origin header ini bisa tidak terekspos), selain itu nama cadangan.
   */
  async downloadMembershipCsv(kind: 'subscriptions' | 'invoices', params: Record<string, string | undefined> = {}): Promise<{ blob: Blob; filename: string }> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    const query = search.toString();
    const res = await fetchWithTimeout(
      apiUrl(`/api/admin/membership/export/${kind}.csv${query ? `?${query}` : ''}`),
      { headers: { ...adminHeaders(), Accept: 'text/csv' } },
      ADMIN_WRITE_TIMEOUT_MS
    );
    if (!res.ok) throw await parseError(res);
    const match = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') || '');
    return { blob: await res.blob(), filename: match?.[1] || `keanggotaan-${kind === 'subscriptions' ? 'langganan' : 'invoice'}.csv` };
  }
};

export interface AdminDigitalUser {
  id: string;
  email: string;
  fullName: string;
  createdAt?: string;
}

export interface AdminProductRef {
  id: string;
  format: 'ebook' | 'audiobook';
  bookId: string;
  title: string;
}

export interface AdminEntitlement {
  id: string;
  userId: string;
  productId: string;
  source: 'purchase' | 'membership' | 'institution' | 'admin_grant' | 'author';
  sourceRef: string | null;
  status: 'active' | 'suspended' | 'revoked' | 'expired';
  startsAt: string;
  endsAt: string | null;
  maxDevices: number;
  revokedReason: string | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  createdAt: string;
  usable?: boolean;
  product?: AdminProductRef | null;
}

export interface AdminAnomaly {
  id: string;
  userId: string;
  user: AdminDigitalUser | null;
  productId: string | null;
  product: AdminProductRef | null;
  rule: 'ip_spread' | 'device_limit_denials' | 'page_speed';
  details: Record<string, unknown>;
  actionTaken: 'flagged' | 'suspended';
  suspendedEntitlementIds: string[];
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export interface AdminUserAccess {
  user: AdminDigitalUser;
  maxDevices: number;
  entitlements: AdminEntitlement[];
  devices: Array<{ id: string; label: string; userAgent: string | null; firstSeen: string; lastSeen: string; releasedAt: string | null; releasedBy: string | null }>;
  sessions: Array<{ id: string; productId: string; product: AdminProductRef | null; deviceId: string | null; deviceLabel: string | null; ip: string | null; startedAt: string; lastHeartbeat: string; alive: boolean }>;
  orders: AdminDigitalOrder[];
  logs: Array<{ id: string; action: string; productId: string | null; product: AdminProductRef | null; ip: string | null; userAgent: string | null; meta: Record<string, unknown>; createdAt: string }>;
  anomalies: AdminAnomaly[];
}

export interface AdminDigitalOrder {
  orderNumber: string;
  status: 'pending' | 'challenge' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';
  amount: number;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  paidAt: string | null;
  isTest: boolean;
  items: Array<{ title: string; format: 'ebook' | 'audiobook'; unitPrice: number }>;
}

export interface DigitalSalesSummary {
  featureEnabled: boolean;
  betaEmailCount: number;
  summary: { paidCount: number; revenue: number; itemsSold: number; pendingCount: number; refundedCount: number; refundedAmount: number };
  recent: AdminDigitalOrder[];
  test: { count: number; paidCount: number; paidAmount: number; orders: AdminDigitalOrder[] };
}

// ---------------------------------------------------------------------------
// Keanggotaan fase 3 (admin) — mengikuti backend/digital/membership/admin.ts
// ---------------------------------------------------------------------------
export type AdminPlanCode = 'blue' | 'silver' | 'gold' | 'platinum' | 'free' | 'reader' | 'professional' | 'author';
export type AdminShelfAccess = 'none' | 'pick' | 'full';
export type AdminBillingCycle = 'monthly' | 'yearly';
export type AdminSubscriptionStatus = 'pending' | 'active' | 'past_due' | 'grace' | 'canceled' | 'expired';
export type AdminInvoiceStatus = 'draft' | 'issued' | 'paid' | 'failed' | 'void';
export type AdminInvoiceKind = 'initial' | 'renewal' | 'upgrade' | 'manual';
export type AdminMembershipPaymentMethod = 'card' | 'gopay' | 'va' | 'qris' | 'other';

/** Flag env di server (Render); hanya-baca di admin. */
export interface AdminMembershipFlags {
  autodebit: boolean;
  printDiscount: boolean;
  readerPick: boolean;
  authorShelf: boolean;
  extendedBenefits: boolean;
  graceDays: number;
  /** Gateway pengingat WhatsApp terpasang (WHATSAPP_PROVIDER + token). */
  whatsapp: boolean;
  whatsappSender: string | null;
}

/** POST /api/admin/membership/whatsapp/test */
export interface AdminWhatsAppTestResult {
  provider: 'fonnte' | 'cloud';
  senderNumber: string;
  connectedNumber: string | null;
  /** null = gateway tidak melaporkan nomor. */
  matchesSender: boolean | null;
  gatewayOk: boolean;
  detail: string;
  sentTo: string | null;
}

export interface AdminMembershipPlan {
  id: string;
  code: AdminPlanCode;
  nameId: string;
  nameEn: string;
  priceMonthly: number;
  priceYearly: number;
  foundingPriceYearly: number | null;
  foundingCap: number | null;
  foundingCount: number;
  maxDevices: number;
  shelfAccess: AdminShelfAccess;
  printDiscountPercent: number;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export type AdminMembershipPlanPatch = Partial<Pick<AdminMembershipPlan,
  'priceMonthly' | 'priceYearly' | 'foundingPriceYearly' | 'foundingCap' | 'maxDevices' | 'shelfAccess' | 'printDiscountPercent' | 'isActive'>>;

export interface AdminMembershipPlans {
  plans: AdminMembershipPlan[];
  benefits: Array<{ planId: string; benefitKey: string; sortOrder: number; featureFlag: string | null }>;
  flags: AdminMembershipFlags;
}

export interface AdminMembershipSummary {
  /** YYYY-MM (WIB). */
  month: string;
  activeTotal: number;
  activeByPlan: Array<{ code: AdminPlanCode; name: string; active: number; yearly: number; founding: number }>;
  newThisMonth: number;
  cancelRequestsThisMonth: number;
  canceledThisMonth: number;
  expiredThisMonth: number;
  pastDue: number;
  grace: number;
  revenueThisMonth: number;
  /** 0–1. */
  revenueYearlyShare: number;
  /** 0–1. */
  activeYearlyShare: number;
  activeAtMonthStart: number;
  /** 0–1; null bila belum ada anggota aktif di awal bulan. */
  churnRate: number | null;
  founding: Array<{ code: AdminPlanCode; cap: number | null; used: number; remaining: number }>;
  flags: AdminMembershipFlags;
  testSubscriptions: number;
}

export interface AdminSubscription {
  id: string;
  userId: string;
  email: string;
  name: string;
  planCode: AdminPlanCode | null;
  planName: string | null;
  billingCycle: AdminBillingCycle;
  status: AdminSubscriptionStatus;
  isFounding: boolean;
  priceLocked: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  accessEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  paymentMethod: AdminMembershipPaymentMethod;
  autodebit: boolean;
  whatsappNumber: string | null;
  whatsappOptIn: boolean;
  pendingPlanCode: AdminPlanCode | null;
  pendingBillingCycle: AdminBillingCycle | null;
  foundingEndsAt: string | null;
  extraGraceDays: number;
  language: string;
  isTest: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMembershipInvoice {
  id: string;
  subscriptionId: string;
  kind: AdminInvoiceKind;
  planCode: AdminPlanCode | null;
  billingCycle: AdminBillingCycle;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: AdminInvoiceStatus;
  orderRef: string;
  midtransOrderId: string | null;
  midtransTransactionId: string | null;
  paymentType: string | null;
  isFoundingPrice: boolean;
  issuedAt: string | null;
  paidAt: string | null;
  dueAt: string | null;
  attempt: number;
  failureReason: string | null;
  isTest: boolean;
  createdAt: string;
}

export interface AdminSubscriptionEvent {
  id: string;
  subscriptionId: string;
  type: string;
  meta: Record<string, unknown>;
  dedupeKey: string | null;
  createdAt: string;
}

/** Entitlement dengan scope fase 3 (scope 'shelf' tanpa produk). */
export interface AdminMembershipEntitlement extends Omit<AdminEntitlement, 'productId'> {
  productId: string | null;
  scope: 'product' | 'shelf';
}

export interface AdminSubscriptionDetail {
  subscription: AdminSubscription;
  user: AdminDigitalUser;
  maxDevices: number;
  invoices: AdminMembershipInvoice[];
  events: AdminSubscriptionEvent[];
  entitlements: AdminMembershipEntitlement[];
  devices: Array<{ id: string; label: string; firstSeen: string; lastSeen: string; releasedAt: string | null; releasedBy: string | null }>;
  picks: Array<{
    id: string;
    subscriptionId: string;
    userId: string;
    productId: string;
    periodStart: string;
    periodEnd: string;
    entitlementId: string | null;
    createdAt: string;
    product: AdminProductRef | null;
  }>;
  /** Langganan lain milik pengguna yang sama. */
  history: AdminSubscription[];
}

export interface AdminSubscriptionFilters {
  plan?: AdminPlanCode | '';
  /** 'open' = pending/active/past_due/grace. */
  status?: AdminSubscriptionStatus | 'open' | '';
  founding?: 'true' | 'false' | '';
  q?: string;
  /** Sertakan pendaftaran yang tidak pernah dibayar. */
  all?: boolean;
}

export interface AdminSubscriptionActionResult {
  subscription: AdminSubscription;
  /** Perpanjang manual: invoice 'manual' yang tercatat lunas. */
  invoice?: AdminMembershipInvoice;
  /** Pembatalan: pengingat refund manual di Midtrans. */
  refundNote?: string;
  /** Founding: catatan harga terkunci. */
  note?: string;
}

export interface DigitalChapter {
  chapterNumber: number;
  title: string;
  startSeconds: number | null;
  startPage: number | null;
}

/** Status file master & pemrosesan produk digital (tanpa path penyimpanan). */
export interface DigitalProcessingState {
  productId: string;
  format: DigitalFormat;
  processingStatus: 'none' | 'processing' | 'ready' | 'failed';
  processingError: string | null;
  processingStartedAt: string | null;
  processedAt: string | null;
  pageCount: number | null;
  durationSeconds: number | null;
  hasMaster: boolean;
  masterContentType: string | null;
  masterSizeBytes: number | null;
  masterUploadedAt: string | null;
  chapters?: DigitalChapter[];
}

export interface AdminDigitalCatalog {
  products: DigitalProduct[];
  /** Supabase terhubung: perubahan tersimpan permanen. false = hanya di memori server sampai restart. */
  persistent: boolean;
  /** Unggah sampel ke Supabase Storage tersedia. */
  storageEnabled: boolean;
}

export interface InstitutionInquiryInput {
  institutionName: string;
  institutionType: InstitutionType;
  userCount: number;
  email: string;
  contactName?: string;
  phone?: string;
  message?: string;
  language: string;
  /** Honeypot anti-spam; harus kosong. */
  website?: string;
}
