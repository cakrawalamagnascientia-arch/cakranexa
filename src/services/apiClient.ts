import { Book, Order, OrderStatus, Author } from '../types';
import { INITIAL_BOOKS, normalizeBookAuthors } from '../data/booksData';
import { INITIAL_AUTHORS, INITIAL_BOOK_AUTHORS } from '../data/authorsData';
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

export interface ShippingCalculationRequest {
  originPostalCode?: string;
  destinationPostalCode: string;
  weightInGrams: number;
  couriers?: string[];
}

export interface ShippingCalculationResponse {
  courier: string;
  service: string;
  description: string;
  cost: number;
  etd: string;
}

export interface CreateOrderResponse {
  success: boolean;
  orderId: string;
  snapToken?: string | null;
  paymentMode: 'midtrans_production' | 'midtrans_sandbox' | 'simulation' | 'offline';
  total?: number;
  subtotal?: number;
  shippingCost?: number;
  paymentStatus?: OrderStatus;
}

const rowToBook = (row: any): Book => normalizeBookAuthors({
  id: row.id,
  name: row.name,
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
  featured: Boolean(row.featured)
});

const rowToAuthor = (row: any): Author => ({
  id: row.id,
  name: row.name,
  academic_titles: row.academic_titles || undefined,
  photo_url: row.photo_url || undefined,
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

  // ==========================================================================
  // BOOKS
  // ==========================================================================
  /**
   * Urutan sumber: 1) Express API (sumber kebenaran, sudah sinkron dengan Supabase)
   *                2) Supabase langsung (anon key, read-only) jika API mati
   *                3) Seed lokal INITIAL_BOOKS
   */
  async getBooks(): Promise<Book[]> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/books'), { headers: jsonHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data as Book[];
      }
    } catch (err) {
      console.warn('REST API tidak tersedia, mencoba Supabase langsung:', err);
    }

    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data, error } = await client.from('books').select('*').order('created_at', { ascending: true });
          if (!error && data && data.length > 0) return data.map(rowToBook);
        }
      } catch (err) {
        console.warn('Supabase query gagal, memakai data seed lokal:', err);
      }
    }

    return INITIAL_BOOKS;
  },

  /** Admin: buat / perbarui buku (server melakukan upsert ke Supabase) */
  async saveBook(book: Book): Promise<Book> {
    const res = await fetchWithTimeout(apiUrl('/api/books'), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(book)
    });
    if (!res.ok) throw await parseError(res);
    const data = await res.json();
    return data.book as Book;
  },

  /** Admin: hapus buku */
  async deleteBook(id: string): Promise<void> {
    const res = await fetchWithTimeout(apiUrl(`/api/books/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: adminHeaders()
    });
    if (!res.ok) throw await parseError(res);
  },

  // ==========================================================================
  // AUTHORS (Penulis & Kontributor)
  // ==========================================================================
  async getAuthors(): Promise<Author[]> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/authors'), { headers: jsonHeaders() }, 10000);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data.map((r: any) => rowToAuthor(r));
      }
    } catch (err) {
      console.warn('REST API authors tidak tersedia, pakai seed lokal:', err);
    }
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data, error } = await client.from('authors').select('*').order('name', { ascending: true });
          if (!error && data && data.length > 0) return data.map(rowToAuthor);
        }
      } catch (err) {
        console.warn('Supabase author query gagal, pakai seed:', err);
      }
    }
    return INITIAL_AUTHORS.map((a) => ({ ...a }));
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
      15000
    );
    if (!res.ok) throw await parseError(res);
    return rowToAuthor(await res.json());
  },

  /** Admin: hapus penulis */
  async deleteAuthor(id: string): Promise<void> {
    const res = await fetchWithTimeout(apiUrl(`/api/authors/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: adminHeaders()
    });
    if (!res.ok) throw await parseError(res);
  },

  /** Admin: atur ulang relasi buku penulis */
  async setAuthorBooks(authorId: string, bookIds: string[]): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/authors/${encodeURIComponent(authorId)}/books`), {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ book_ids: bookIds })
      });
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
  async createOrder(order: Order): Promise<CreateOrderResponse> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/orders'), {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(order)
      }, 20000);
      if (!res.ok) throw await parseError(res);
      const data = await res.json();
      return {
        success: true,
        orderId: data.orderId || order.orderNumber,
        snapToken: data.snapToken ?? null,
        paymentMode: data.paymentMode || 'simulation',
        total: data.total,
        subtotal: data.subtotal,
        shippingCost: data.shippingCost,
        paymentStatus: data.paymentStatus
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
  // SHIPPING
  // ==========================================================================
  async calculateShippingRates(req: ShippingCalculationRequest): Promise<ShippingCalculationResponse[]> {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/shipping/calculate'), {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(req)
      });
      if (res.ok) return await res.json();
    } catch {
      // fallback
    }
    const baseMultiplier = Math.max(1, Math.ceil(req.weightInGrams / 1000));
    return [
      { courier: 'JNE', service: 'REG', description: 'Layanan Reguler', cost: 18000 * baseMultiplier, etd: '2-3 Hari' },
      { courier: 'JNE', service: 'YES', description: 'Yakin Esok Sampai', cost: 32000 * baseMultiplier, etd: '1 Hari' },
      { courier: 'SiCepat', service: 'SIUNT', description: 'SiUntung Reguler', cost: 17000 * baseMultiplier, etd: '2-3 Hari' },
      { courier: 'POS Indonesia', service: 'Pos Kilat Khusus', description: 'Pos Kilat Khusus Nasional', cost: 16000 * baseMultiplier, etd: '2-4 Hari' },
      { courier: 'J&T Express', service: 'EZ', description: 'J&T Regular Express', cost: 19000 * baseMultiplier, etd: '2-3 Hari' }
    ];
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
    });
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
    });
    if (!res.ok) throw await parseError(res);
    return true;
  }
};
