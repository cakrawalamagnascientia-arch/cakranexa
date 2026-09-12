import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_BOOKS, normalizeBookAuthors } from './src/data/booksData';
import { INITIAL_AUTHORS, INITIAL_BOOK_AUTHORS, normalizeAuthorProfile, authorNameKey } from './src/data/authorsData';
import type { Book, Author, Book as BookType } from './src/types';

// Load environment variables
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================
const PORT = Number(process.env.PORT) || 3000; // Render/Cloud Run menyuntikkan PORT sendiri
const HOST = '0.0.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || '';
const MIDTRANS_IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const MIDTRANS_SNAP_URL = MIDTRANS_IS_PRODUCTION
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
const MIDTRANS_ENABLED = Boolean(MIDTRANS_SERVER_KEY && !MIDTRANS_SERVER_KEY.includes('xxxx'));
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ORDER_NOTIFICATION_EMAILS = Array.from(new Set((process.env.ORDER_NOTIFICATION_EMAILS || [
  'joko.qut@gmail.com',
  'shenrydp@gmail.com',
  'wahyugalih@gmail.com',
  'edy.gunawan@ofisiprima.com',
  'cakrawalamagnascientia@gmail.com',
  'info@cakranexa.com'
].join(',')).split(',').map((email) => email.trim().toLowerCase()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))));
const EMAIL_FROM = process.env.EMAIL_FROM || 'CakraNexa <info@cakranexa.com>';

if (IS_PRODUCTION && !ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD belum di-set. Login Admin akan selalu ditolak di production.');
}

// Initialize Supabase Admin Client if credentials exist
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabaseAdmin: SupabaseClient | null = null;
if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project') && !supabaseKey.includes('your-service-role')) {
  try {
    supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    console.log('✅ Supabase Admin Client initialized.');
  } catch (err) {
    console.warn('⚠️ Supabase init warning:', err);
  }
} else {
  console.log('ℹ️  Supabase belum dikonfigurasi (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Menggunakan penyimpanan in-memory.');
}

// ============================================================================
// IN-MEMORY FALLBACK STORE (single source of truth = src/data/booksData.ts)
// ============================================================================
let inMemoryBooks: Book[] = INITIAL_BOOKS.map((b) => ({ ...b }));
let inMemoryOrders: any[] = [];
let inMemoryAuthors: Author[] = INITIAL_AUTHORS.map((a) => ({ ...a }));
let inMemoryBookAuthors: Array<{ id?: string; book_id: string; author_id: string; author_order: number; created_at?: string }> = INITIAL_BOOK_AUTHORS.map((r, idx) => ({
  id: `ba-${idx}-${Math.random().toString(36).slice(2, 8)}`,
  ...r,
  created_at: new Date().toISOString()
}));

// Konten CMS (singleton site_content id=1). Field deletedRecords menyimpan buku/penulis bawaan
// (seed) yang sudah dihapus admin, agar tidak muncul lagi saat katalog Supabase digabung dengan seed.
type DeletedRecords = { books: string[]; authors: string[] };
let inMemorySiteContent: any = null;
let deletedRecords: DeletedRecords = { books: [], authors: [] };

const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function loadSiteContent(): Promise<any | null> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('site_content').select('content_data').eq('id', 1).maybeSingle();
    if (!error) inMemorySiteContent = data?.content_data ?? null;
  }
  const stored = inMemorySiteContent?.deletedRecords;
  deletedRecords = {
    books: Array.isArray(stored?.books) ? stored.books : [],
    authors: Array.isArray(stored?.authors) ? stored.authors : []
  };
  return inMemorySiteContent;
}

/** Simpan konten CMS; mengembalikan pesan error Supabase, atau null jika berhasil. */
async function saveSiteContent(content: any): Promise<string | null> {
  inMemorySiteContent = content;
  if (!supabaseAdmin) return null;
  const { error } = await supabaseAdmin.from('site_content').upsert({
    id: 1,
    content_data: content,
    updated_at: new Date().toISOString()
  });
  return error ? error.message : null;
}

async function markSeedDeleted(kind: keyof DeletedRecords, key: string, deleted: boolean): Promise<void> {
  if (!supabaseAdmin || !key) return; // mode in-memory: data yang dihapus sudah hilang dari memori
  await loadSiteContent();
  const keys = new Set(deletedRecords[kind]);
  if (keys.has(key) === deleted) return;
  if (deleted) keys.add(key);
  else keys.delete(key);
  deletedRecords = { ...deletedRecords, [kind]: [...keys] };
  const error = await saveSiteContent({ ...(inMemorySiteContent || {}), deletedRecords });
  if (error) console.warn('Supabase deletedRecords save warning:', error);
}

// ============================================================================
// HELPERS
// ============================================================================
const rowToBook = (b: any): Book => normalizeBookAuthors({
  id: b.id,
  name: b.name,
  subtitle: b.subtitle || undefined,
  coverQuote: b.cover_quote || undefined,
  slug: b.slug,
  author: b.author,
  category: b.category,
  isbn: b.isbn,
  tahunTerbit: Number(b.tahun_terbit) || new Date().getFullYear(),
  jumlahHalaman: Number(b.jumlah_halaman) || 0,
  ukuranBuku: b.ukuran_buku,
  harga: Number(b.harga) || 0,
  sinopsis: b.sinopsis,
  linkPembelian: b.link_pembelian || '#',
  bukuTerbaru: Boolean(b.buku_terbaru),
  penerbit: b.penerbit,
  coverBuku: b.cover_buku,
  badge: b.badge || undefined,
  rating: b.rating != null ? Number(b.rating) : undefined,
  reviewsCount: b.reviews_count != null ? Number(b.reviews_count) : undefined,
  stock: b.stock != null ? Number(b.stock) : undefined,
  beratGram: Number(b.berat_gram) || 500,
  originalHarga: b.original_harga != null ? Number(b.original_harga) : undefined,
  discountPercentage: b.discount_percentage != null ? Number(b.discount_percentage) : undefined,
  releaseDate: b.release_date || undefined,
  daftarIsi: Array.isArray(b.daftar_isi) ? b.daftar_isi : undefined,
  tentangPenulis: b.tentang_penulis || undefined,
  isBestSeller: Boolean(b.is_best_seller),
  featured: Boolean(b.featured),
  i18n: b.i18n && typeof b.i18n === 'object' ? b.i18n : undefined
});

const bookToRow = (b: Book) => ({
  id: b.id,
  name: b.name,
  subtitle: b.subtitle || null,
  cover_quote: b.coverQuote || null,
  slug: b.slug,
  author: b.author,
  category: b.category,
  isbn: b.isbn,
  tahun_terbit: b.tahunTerbit,
  jumlah_halaman: b.jumlahHalaman,
  ukuran_buku: b.ukuranBuku,
  harga: b.harga,
  sinopsis: b.sinopsis,
  link_pembelian: b.linkPembelian || '#',
  buku_terbaru: Boolean(b.bukuTerbaru),
  penerbit: b.penerbit,
  cover_buku: b.coverBuku,
  badge: b.badge || undefined,
  // null = tidak dikelola; jangan isi rating palsu atau stok 0 yang memblokir pesanan.
  rating: b.rating ?? null,
  reviews_count: b.reviewsCount ?? null,
  stock: b.stock ?? null,
  berat_gram: b.beratGram ?? 500,
  original_harga: b.originalHarga ?? null,
  discount_percentage: b.discountPercentage ?? null,
  release_date: b.releaseDate || null,
  daftar_isi: b.daftarIsi ?? null,
  tentang_penulis: b.tentangPenulis ?? null,
  is_best_seller: Boolean(b.isBestSeller),
  featured: Boolean(b.featured),
  i18n: b.i18n ?? {},
  updated_at: new Date().toISOString()
});

async function loadBooks(): Promise<Book[]> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('books').select('*').order('created_at', { ascending: true });
    if (!error && data) {
      await loadSiteContent();
      // Terjemahan bawaan (src/data/translations) dipakai bila baris database belum punya terjemahan.
      const remoteBooks = data.map((row) => {
        const remote = rowToBook(row);
        if (remote.i18n && Object.keys(remote.i18n).length > 0) return remote;
        const seed = INITIAL_BOOKS.find((book) => book.id === remote.id);
        return seed?.i18n ? { ...remote, i18n: seed.i18n } : remote;
      });
      const remoteIds = new Set(remoteBooks.map((book) => book.id));
      const deletedIds = new Set(deletedRecords.books);
      // Buku bawaan yang belum pernah disimpan ke Supabase tetap tampil, kecuali sudah dihapus admin.
      inMemoryBooks = [
        ...remoteBooks,
        ...INITIAL_BOOKS.filter((book) => !remoteIds.has(book.id) && !deletedIds.has(book.id))
      ];
    }
  }
  return inMemoryBooks;
}

// ============================================================================
// AUTHORS HELPERS (Mapping Snake ↔ Camel + Load from Supabase)
// ============================================================================
const authorPhotoFallback = (name?: string): string | undefined => {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('henry dianto')) return '/images/authors/henry-dianto-p-sinaga.png';
  if (normalized.includes('joko purnomo')) return '/images/authors/joko-purnomo-raharjo.png';
  if (normalized.includes('wahyu widodo')) return '/images/authors/wahyu-widodo.png';
  if (normalized.includes('andi banua adams')) return '/images/authors/andi-banua-adams.png';
  return undefined;
};

const rowToAuthor = (row: any): Author => normalizeAuthorProfile({
  id: row.id,
  name: row.name,
  academic_titles: row.academic_titles || undefined,
  photo_url: row.photo_url || authorPhotoFallback(row.name),
  scopus_id: row.scopus_id || undefined,
  orcid_id: row.orcid_id || undefined,
  linkedin_url: row.linkedin_url || undefined,
  email: row.email || undefined,
  profile_education: row.profile_education || undefined,
  work_experience: row.work_experience || undefined,
  organization_seminar: row.organization_seminar || undefined,
  publications: row.publications || undefined,
  created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
  updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  i18n: row.i18n && typeof row.i18n === 'object' ? row.i18n : undefined
});

const authorToRow = (a: Author) => ({
  id: a.id,
  name: a.name,
  academic_titles: a.academic_titles || null,
  photo_url: a.photo_url || null,
  scopus_id: a.scopus_id || null,
  orcid_id: a.orcid_id || null,
  linkedin_url: a.linkedin_url || null,
  email: a.email || null,
  profile_education: a.profile_education || null,
  work_experience: a.work_experience || null,
  organization_seminar: a.organization_seminar || null,
  publications: a.publications || null,
  i18n: a.i18n ?? {},
  updated_at: new Date().toISOString()
});

async function loadAuthors(): Promise<Author[]> {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from('authors').select('*').order('name', { ascending: true });
      if (!error && Array.isArray(data)) {
        await loadSiteContent();
        // Terjemahan bio bawaan dipakai bila baris database belum punya terjemahan (dicocokkan lewat nama).
        const remoteAuthors = data.map((row) => {
          const remote = rowToAuthor(row);
          if (remote.i18n && Object.keys(remote.i18n).length > 0) return remote;
          const seed = INITIAL_AUTHORS.find((author) => authorNameKey(author.name) === authorNameKey(remote.name));
          return seed?.i18n ? { ...remote, i18n: seed.i18n } : remote;
        });
        const remoteKeys = new Set(remoteAuthors.map((author) => authorNameKey(author.name)));
        const deletedKeys = new Set(deletedRecords.authors);
        // Penulis bawaan yang belum ada di Supabase tetap tampil, kecuali sudah dihapus admin.
        inMemoryAuthors = [
          ...remoteAuthors,
          ...INITIAL_AUTHORS.filter((author) => {
            const key = authorNameKey(author.name);
            return !remoteKeys.has(key) && !deletedKeys.has(key);
          })
        ];
      }
    } catch (err) {
      console.warn('Supabase authors load fallback ke in-memory:', (err as any)?.message);
    }
  }
  return inMemoryAuthors;
}

async function loadBookAuthors(): Promise<typeof inMemoryBookAuthors> {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from('book_authors').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        inMemoryBookAuthors = data.map((row) => ({
          id: row.id,
          book_id: String(row.book_id),
          author_id: row.author_id,
          author_order: Number(row.author_order) || 0,
          created_at: row.created_at
        }));
      }
    } catch (err) {
      console.warn('Supabase book_authors load fallback ke in-memory:', (err as any)?.message);
    }
  }
  return inMemoryBookAuthors;
}

/** Cari penulis berdasarkan id; id seed lama ("author-1") dicocokkan lewat nama bila sudah pindah ke UUID. */
const findAuthorIndex = (id: string): number => {
  const direct = inMemoryAuthors.findIndex((a) => a.id === id);
  if (direct >= 0 || isUuid(id)) return direct;
  const seed = INITIAL_AUTHORS.find((a) => a.id === id);
  if (!seed) return -1;
  const key = authorNameKey(seed.name);
  return inMemoryAuthors.findIndex((a) => authorNameKey(a.name) === key);
};

const attachAuthorBooks = (author: Author, allBooks: BookType[]): Author => {
  const rels = inMemoryBookAuthors.filter((r) => r.author_id === author.id).sort((a, b) => a.author_order - b.author_order);
  const books = rels
    .map((r) => allBooks.find((b) => b.id === r.book_id))
    .filter((b): b is BookType => Boolean(b));
  return { ...author, books };
};

const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
};

// ---- Admin token (ditandatangani HMAC, 12 jam) ------------------------------
// Token tidak disimpan di memori, sehingga tetap sah setelah server Render tidur/restart
// dan di setiap instance serverless. Mengganti ADMIN_PASSWORD membatalkan semua token.
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_TOKEN_SECRET = crypto.createHash('sha256').update(`cakranexa-admin-token:${ADMIN_PASSWORD}:${ADMIN_API_KEY}`).digest();
const revokedAdminTokens = new Set<string>(); // logout (best effort, per instance)

const signAdminToken = (payload: string): string =>
  crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(payload).digest('hex');

const issueAdminToken = (): { token: string; expiresAt: number } => {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  const payload = `${expiresAt}.${crypto.randomBytes(16).toString('hex')}`;
  return { token: `${payload}.${signAdminToken(payload)}`, expiresAt };
};

const isValidAdminToken = (token: string | undefined): boolean => {
  if (!token) return false;
  if (ADMIN_API_KEY && safeEqual(token, ADMIN_API_KEY)) return true; // static key untuk integrasi server-to-server
  if (!ADMIN_PASSWORD || revokedAdminTokens.has(token)) return false;
  const [expiresAt, nonce, signature] = token.split('.');
  if (!expiresAt || !nonce || !signature) return false;
  if (!safeEqual(signature, signAdminToken(`${expiresAt}.${nonce}`))) return false;
  return Number(expiresAt) > Date.now();
};

/** Middleware: wajib Authorization: Bearer <token> atau header x-admin-key */
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  const headerKey = (req.headers['x-admin-key'] as string | undefined)?.trim();
  if (isValidAdminToken(bearer) || isValidAdminToken(headerKey)) return next();
  return res.status(401).json({ error: 'Unauthorized: kredensial admin tidak valid atau sudah kedaluwarsa.' });
};

// ---- Simple login rate limiter (per IP, 10 percobaan / 15 menit) -----------
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const loginRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= 10) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' });
  }
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
  return next();
};

// ---- Midtrans -------------------------------------------------------------
const verifyMidtransSignature = (n: any): boolean => {
  if (!MIDTRANS_ENABLED) return false;
  const raw = `${n.order_id}${n.status_code}${n.gross_amount}${MIDTRANS_SERVER_KEY}`;
  const expected = crypto.createHash('sha512').update(raw).digest('hex');
  return typeof n.signature_key === 'string' && safeEqual(expected, n.signature_key);
};

const mapMidtransStatus = (transactionStatus: string, fraudStatus?: string): string => {
  if (transactionStatus === 'capture') return fraudStatus === 'challenge' ? 'pending' : 'paid';
  if (transactionStatus === 'settlement') return 'paid';
  if (['cancel', 'deny', 'expire'].includes(transactionStatus)) return 'cancelled';
  if (transactionStatus === 'failure') return 'failed';
  return 'pending';
};

async function createSnapTransaction(order: any): Promise<string | null> {
  if (!MIDTRANS_ENABLED) return null;
  try {
    const authHeader = 'Basic ' + Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString('base64');
    const payload = {
      transaction_details: { order_id: order.orderNumber, gross_amount: Math.round(order.total) },
      item_details: [
        ...order.items.map((it: any) => ({
          id: it.book.id,
          price: Math.round(it.book.harga),
          quantity: it.quantity,
          name: String(it.book.name).slice(0, 50)
        })),
        ...(order.shippingCost > 0
          ? [{ id: 'SHIPPING', price: Math.round(order.shippingCost), quantity: 1, name: 'Ongkos Kirim' }]
          : [])
      ],
      customer_details: {
        first_name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone,
        shipping_address: {
          first_name: order.customer.name,
          phone: order.customer.phone,
          address: order.customer.address,
          city: order.customer.city,
          postal_code: order.customer.postalCode,
          country_code: 'IDN'
        }
      }
    };
    const res = await fetch(MIDTRANS_SNAP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: authHeader },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error('Midtrans Snap error:', res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { token?: string };
    return data.token || null;
  } catch (err) {
    console.error('Midtrans Snap request failed:', err);
    return null;
  }
}

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

async function sendOrderNotificationEmail(order: any): Promise<void> {
  if (!RESEND_API_KEY || ORDER_NOTIFICATION_EMAILS.length === 0) {
    console.warn(`Order email skipped: ${!RESEND_API_KEY ? 'RESEND_API_KEY belum dikonfigurasi' : 'tidak ada penerima email yang valid'}.`);
    return;
  }
  const itemRows = order.items.map((item: any) => `<li>${escapeHtml(item.book.name)} x ${item.quantity}</li>`).join('');
  const html = `
    <h2>Pesanan Baru CakraNexa</h2>
    <p><strong>Order:</strong> ${escapeHtml(order.orderNumber)}</p>
    <p><strong>Pelanggan:</strong> ${escapeHtml(order.customer.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(order.customer.email)}</p>
    <p><strong>WhatsApp:</strong> ${escapeHtml(order.customer.phone)}</p>
    <p><strong>Metode pembayaran:</strong> ${escapeHtml(order.paymentMethod)}</p>
    <p><strong>Status:</strong> ${escapeHtml(order.paymentStatus)}</p>
    <p><strong>Total:</strong> Rp ${Number(order.total).toLocaleString('id-ID')}</p>
    <ul>${itemRows}</ul>
    <p>Notifikasi ini dikirim otomatis oleh CakraNexa.</p>
  `;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: ORDER_NOTIFICATION_EMAILS,
      subject: `[Pesanan Baru] ${order.orderNumber} - ${order.customer.name}`,
      html
    })
  });
  if (!response.ok) {
    throw new Error(`Resend email failed (${response.status}): ${await response.text()}`);
  }
}

async function updateOrderStatus(orderId: string, paymentStatus?: string, trackingNumber?: string) {
  const idx = inMemoryOrders.findIndex((o) => o.orderNumber === orderId || o.id === orderId);
  if (idx >= 0) {
    inMemoryOrders[idx] = {
      ...inMemoryOrders[idx],
      paymentStatus: paymentStatus ?? inMemoryOrders[idx].paymentStatus,
      trackingNumber: trackingNumber !== undefined ? trackingNumber : inMemoryOrders[idx].trackingNumber
    };
  }
  if (supabaseAdmin) {
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (paymentStatus) patch.payment_status = paymentStatus;
    if (trackingNumber !== undefined) patch.tracking_number = trackingNumber;
    const { error } = await supabaseAdmin.from('orders').update(patch).eq('order_id', orderId);
    if (error) console.warn('Supabase order update warning:', error.message);
  }
}

// ============================================================================
// SERVER
// ============================================================================
const app = express();

async function startServer() {
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // 1. CORS: hanya origin yang diizinkan (ALLOWED_ORIGINS), *.vercel.app, dan localhost
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .map((s) => s.replace(/\/$/, ''))
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true); // same-origin, curl, webhook Midtrans
        if (configuredOrigins.includes(origin)) return callback(null, true);
        const isVercelPreview = /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin);
        const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1):[0-9]+$/.test(origin);
        const isRunApp = /^https:\/\/[a-zA-Z0-9-]+\.run\.app$/.test(origin);
        if (isVercelPreview || isLocalhost || isRunApp) return callback(null, true);
        return callback(new Error(`Origin ${origin} tidak diizinkan oleh CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Admin-Key']
    })
  );

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // ==========================================================================
  // HEALTH & AUTH
  // ==========================================================================
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'PT CAKRAWALA MAGNA SCIENTIA (CakraNexa) Backend API',
      timestamp: new Date().toISOString(),
      supabaseConnected: Boolean(supabaseAdmin),
      midtransEnabled: MIDTRANS_ENABLED,
      midtransMode: MIDTRANS_IS_PRODUCTION ? 'production' : 'sandbox',
      adminConfigured: Boolean(ADMIN_PASSWORD),
      booksCount: inMemoryBooks.length,
      ordersCount: inMemoryOrders.length
    });
  });

  // POST /api/admin/login  { password } -> { token, expiresAt }
  app.post('/api/admin/login', loginRateLimit, (req, res) => {
    const password = String(req.body?.password || '');
    if (!ADMIN_PASSWORD) {
      return res.status(503).json({ error: 'ADMIN_PASSWORD belum dikonfigurasi di server.' });
    }
    if (!password || !safeEqual(password, ADMIN_PASSWORD)) {
      return res.status(401).json({ error: 'Password admin salah.' });
    }
    const { token, expiresAt } = issueAdminToken();
    return res.json({ token, expiresAt: new Date(expiresAt).toISOString() });
  });

  app.get('/api/admin/me', requireAdmin, (_req, res) => res.json({ ok: true }));

  app.post('/api/admin/logout', requireAdmin, (req, res) => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) revokedAdminTokens.add(auth.slice(7).trim());
    res.json({ ok: true });
  });

  // ==========================================================================
  // BOOKS
  // ==========================================================================
  app.get('/api/books', async (_req, res) => {
    try {
      return res.json(await loadBooks());
    } catch (err) {
      console.error('Error fetching books:', err);
      return res.json(inMemoryBooks);
    }
  });

  app.get('/api/books/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const books = await loadBooks();
      const book = books.find((b) => b.id === id || b.slug === id);
      if (!book) return res.status(404).json({ error: 'Buku tidak ditemukan' });
      return res.json(book);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/books - Create or Update Book (Admin)
  app.post('/api/books', requireAdmin, async (req, res) => {
    try {
      const bookData = normalizeBookAuthors(req.body as Book);
      if (!bookData?.id || !bookData.name || !bookData.slug || typeof bookData.harga !== 'number') {
        return res.status(400).json({ error: 'Field wajib: id, name, slug, harga (number).' });
      }
      const index = inMemoryBooks.findIndex((b) => b.id === bookData.id);
      // Ganti utuh (bukan digabung) agar field yang dikosongkan admin ikut terhapus.
      if (index >= 0) inMemoryBooks[index] = bookData;
      else inMemoryBooks.unshift(bookData);

      if (supabaseAdmin) {
        const { error } = await supabaseAdmin.from('books').upsert(bookToRow(bookData));
        if (error) return res.status(500).json({ error: `Supabase: ${error.message}` });
        await markSeedDeleted('books', bookData.id, false);
      }
      return res.status(201).json({ success: true, book: bookData });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/books/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    inMemoryBooks = inMemoryBooks.filter((b) => b.id !== id);
    if (supabaseAdmin) {
      const { error } = await supabaseAdmin.from('books').delete().eq('id', id);
      if (error) return res.status(500).json({ error: `Supabase: ${error.message}` });
      await markSeedDeleted('books', id, true);
    }
    return res.json({ success: true, message: 'Buku berhasil dihapus' });
  });

  // ==========================================================================
  // ORDERS
  // ==========================================================================
  // GET /api/orders (Admin) — berisi data pribadi pelanggan
  app.get('/api/orders', requireAdmin, async (_req, res) => {
    try {
      if (supabaseAdmin) {
        const { data, error } = await supabaseAdmin
          .from('orders')
          .select('*, order_items(*)')
          .order('created_at', { ascending: false });
        if (!error && data) return res.json(data);
      }
      return res.json(inMemoryOrders);
    } catch {
      return res.json(inMemoryOrders);
    }
  });

  // GET /api/orders/:id/status (Publik) — pelanggan cek status pesanannya sendiri; tanpa PII
  app.get('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const local = inMemoryOrders.find((o) => o.orderNumber === id);
    if (local) return res.json({ orderNumber: id, paymentStatus: local.paymentStatus, trackingNumber: local.trackingNumber || null });
    if (supabaseAdmin) {
      const { data } = await supabaseAdmin.from('orders').select('payment_status, tracking_number').eq('order_id', id).maybeSingle();
      if (data) return res.json({ orderNumber: id, paymentStatus: data.payment_status, trackingNumber: data.tracking_number });
    }
    return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  });

  // POST /api/orders (Publik) — validasi & hitung ulang total di server (anti manipulasi harga)
  app.post('/api/orders', async (req, res) => {
    try {
      const order = req.body;
      const c = order?.customer;
      if (!order?.orderNumber || !Array.isArray(order.items) || order.items.length === 0) {
        return res.status(400).json({ error: 'Pesanan tidak valid: item kosong.' });
      }
      if (!c?.name || !c?.phone || !c?.email || !c?.address || !c?.city || !c?.postalCode) {
        return res.status(400).json({ error: 'Data pelanggan belum lengkap.' });
      }
      if (inMemoryOrders.some((o) => o.orderNumber === order.orderNumber)) {
        return res.status(409).json({ error: 'Nomor pesanan sudah terdaftar.' });
      }

      // Hitung ulang subtotal dari harga katalog server, bukan dari client
      const catalog = await loadBooks();
      let subtotal = 0;
      const items = order.items.map((it: any) => {
        const book = catalog.find((b) => b.id === it?.book?.id);
        if (!book) throw Object.assign(new Error(`Buku ${it?.book?.id} tidak ditemukan di katalog.`), { status: 400 });
        const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
        if (!book.harga || book.harga <= 0) {
          throw Object.assign(new Error(`"${book.name}" belum dapat dipesan (harga belum ditetapkan / segera terbit).`), { status: 400 });
        }
        if (typeof book.stock === 'number' && book.stock < qty) {
          throw Object.assign(new Error(`Stok "${book.name}" tidak mencukupi (tersisa ${book.stock}).`), { status: 409 });
        }
        subtotal += book.harga * qty;
        return { book, quantity: qty };
      });
      const shippingCost = Math.max(0, Number(order.shippingCost) || 0);
      const total = subtotal + shippingCost;

      const normalized = {
        ...order,
        items,
        subtotal,
        shippingCost,
        total,
        paymentStatus: order.paymentMethod === 'manual_mandiri' ? 'processing' : 'pending',
        // Bahasa pelanggan saat checkout (untuk pesan WhatsApp ke pelanggan); nilai lain -> 'id'.
        language: ['id', 'en', 'zh'].includes(order.language) ? order.language : 'id',
        createdAt: new Date().toISOString()
      };
      inMemoryOrders.unshift(normalized);

      // Kurangi stok in-memory
      items.forEach(({ book, quantity }: any) => {
        const i = inMemoryBooks.findIndex((b) => b.id === book.id);
        if (i >= 0 && typeof inMemoryBooks[i].stock === 'number') inMemoryBooks[i].stock = Math.max(0, (inMemoryBooks[i].stock as number) - quantity);
      });

      if (supabaseAdmin) {
        const { error: orderError } = await supabaseAdmin.from('orders').insert({
          order_id: normalized.orderNumber,
          customer_name: c.name,
          customer_phone: c.phone,
          customer_email: c.email,
          shipping_address: `${c.address}, ${c.district ? c.district + ', ' : ''}${c.city}, ${c.province || ''} (${c.postalCode})`,
          courier: `${c.courier || '-'} - ${c.shippingService || 'Reguler'}`,
          shipping_fee: shippingCost,
          total_amount: total,
          payment_method: normalized.paymentMethod,
          payment_status: normalized.paymentStatus,
          va_number: normalized.vaNumber || null,
          payment_proof_url: normalized.paymentProofUrl || null,
          tracking_number: normalized.trackingNumber || null,
          customer_notes: c.notes || null,
          language: normalized.language
        });
        if (orderError) {
          console.error('Supabase order insert error:', orderError.message);
        } else {
          await supabaseAdmin.from('order_items').insert(
            items.map(({ book, quantity }: any) => ({
              order_id: normalized.orderNumber,
              book_id: book.id,
              quantity,
              unit_price: book.harga,
              subtotal: book.harga * quantity
            }))
          );
          // Kurangi stok via RPC (lihat schema.sql: decrement_book_stock)
          for (const { book, quantity } of items) {
            if (typeof book.stock !== 'number') continue; // stok tidak dikelola untuk buku ini
            await supabaseAdmin.rpc('decrement_book_stock', { p_book_id: book.id, p_qty: quantity });
          }
        }
      }

      // Midtrans Snap token hanya boleh dibuat dari backend yang memiliki Server Key.
      const snapToken = normalized.paymentMethod === 'manual_mandiri' ? null : await createSnapTransaction(normalized);

      try {
        await sendOrderNotificationEmail(normalized);
      } catch (emailError) {
        console.error('Order email notification failed:', emailError);
      }

      return res.status(201).json({
        success: true,
        orderId: normalized.orderNumber,
        subtotal,
        shippingCost,
        total,
        paymentStatus: normalized.paymentStatus,
        snapToken,
        paymentMode: snapToken ? (MIDTRANS_IS_PRODUCTION ? 'midtrans_production' : 'midtrans_sandbox') : 'unavailable'
      });
    } catch (err: any) {
      console.error('Order creation error:', err);
      return res.status(err.status || 500).json({ error: err.message });
    }
  });

  // PATCH /api/orders/:id (Admin) — status pembayaran / nomor resi
  app.patch('/api/orders/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { paymentStatus, trackingNumber } = req.body || {};
    const allowed = ['pending', 'paid', 'processing', 'shipped', 'failed', 'cancelled'];
    if (paymentStatus && !allowed.includes(paymentStatus)) {
      return res.status(400).json({ error: `paymentStatus harus salah satu dari: ${allowed.join(', ')}` });
    }
    await updateOrderStatus(id, paymentStatus, trackingNumber);
    return res.json({ success: true, message: 'Status pesanan berhasil diperbarui' });
  });

  // ==========================================================================
  // SHIPPING
  // ==========================================================================
  app.post('/api/shipping/calculate', (req, res) => {
    const { destinationPostalCode, weightInGrams } = req.body || {};
    const weight = Number(weightInGrams) || 500;
    const baseMultiplier = Math.max(1, Math.ceil(weight / 1000));
    const firstDigit = parseInt(String(destinationPostalCode || '').charAt(0), 10);
    const isOuterJava = !Number.isNaN(firstDigit) && firstDigit > 6; // 7x-9x: Kalimantan, Bali/NTT, Sulawesi, Maluku, Papua
    const isSumatera = !Number.isNaN(firstDigit) && firstDigit >= 2 && firstDigit <= 3;
    const zoneBonus = isOuterJava ? 15000 : isSumatera ? 9000 : 0;
    const outerEtd = isOuterJava || isSumatera;

    const rates = [
      { courier: 'JNE', service: 'REG', description: 'Layanan Reguler Nasional', cost: (18000 + zoneBonus) * baseMultiplier, etd: outerEtd ? '3-5 Hari' : '2-3 Hari' },
      { courier: 'JNE', service: 'YES', description: 'Yakin Esok Sampai', cost: Math.round((32000 + zoneBonus * 1.5) * baseMultiplier), etd: '1 Hari' },
      { courier: 'SiCepat', service: 'SIUNT', description: 'SiUntung Tarif Ekonomis', cost: (17000 + zoneBonus) * baseMultiplier, etd: outerEtd ? '3-5 Hari' : '2-3 Hari' },
      { courier: 'POS Indonesia', service: 'Pos Kilat Khusus', description: 'Jangkauan Hingga Pelosok Nusantara', cost: (16000 + zoneBonus) * baseMultiplier, etd: outerEtd ? '4-6 Hari' : '2-4 Hari' },
      { courier: 'J&T Express', service: 'EZ', description: 'J&T Regular Express', cost: (19000 + zoneBonus) * baseMultiplier, etd: outerEtd ? '3-5 Hari' : '2-3 Hari' }
    ];
    return res.json(rates);
  });

  // ==========================================================================
  // PAYMENT WEBHOOK (Midtrans)
  // ==========================================================================
  app.post('/api/payment/midtrans-webhook', async (req, res) => {
    const n = req.body || {};
    if (!MIDTRANS_ENABLED) {
      return res.status(503).json({ error: 'Midtrans belum dikonfigurasi (MIDTRANS_SERVER_KEY).' });
    }
    if (!verifyMidtransSignature(n)) {
      console.warn('⚠️  Webhook Midtrans dengan signature tidak valid ditolak:', n.order_id);
      return res.status(403).json({ error: 'Invalid signature' });
    }
    const targetStatus = mapMidtransStatus(String(n.transaction_status), n.fraud_status);
    await updateOrderStatus(String(n.order_id), targetStatus);
    console.log(`💳 Midtrans webhook: ${n.order_id} -> ${n.transaction_status} (${targetStatus})`);
    return res.json({ status: 'success', received: true });
  });

  // ==========================================================================
  // SEO SETTINGS
  // ==========================================================================
  let inMemorySeoSettings: Record<string, any> = {
    siteTitle: 'CakraNexa — Penerbit Buku Akademik & Profesional Ber-ISBN',
    slogan: 'Penerbitan Buku Ilmiah, Monografi, & Teks Berkualitas Nasional',
    targetKeywords: 'penerbit buku akademik, penerbitan isbn, buku perpajakan, monografi hukum, cetak buku unesco, jurnal ilmiah, cakrawala magna scientia',
    metaDescription: 'Platform resmi penerbitan buku akademik ber-ISBN, perpajakan, hukum, dan ekonomi oleh PT Cakrawala Magna Scientia. Layanan profesional, ISBN resmi Perpusnas, dan distribusi nasional.',
    siteUrl: process.env.SITE_URL || 'https://cakranexa.com',
    ogImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=1200&h=630&q=80',
    noindex: false,
    responsiveViewport: true,
    customHeaderTags: '<meta name="author" content="PT Cakrawala Magna Scientia" />\n<meta name="publisher" content="CakraNexa Publishing" />\n<meta name="geo.region" content="ID-JK" />',
    googleAnalyticsId: '',
    googleMapsApiKey: '',
    metaPixelId: '',
    gtmId: '',
    googleAdsConversionId: '',
    googleAdsConversionLabel: '',
    updatedAt: new Date().toISOString()
  };

  const seoRowToSettings = (d: any) => ({
    siteTitle: d.site_title,
    slogan: d.slogan,
    targetKeywords: d.target_keywords,
    metaDescription: d.meta_description,
    siteUrl: d.site_url,
    ogImage: d.og_image,
    noindex: Boolean(d.noindex),
    responsiveViewport: d.responsive_viewport !== false,
    customHeaderTags: d.custom_header_tags,
    googleAnalyticsId: d.google_analytics_id,
    googleMapsApiKey: d.google_maps_api_key,
    metaPixelId: d.meta_pixel_id,
    gtmId: d.gtm_id,
    googleAdsConversionId: d.google_ads_conversion_id,
    googleAdsConversionLabel: d.google_ads_conversion_label,
    updatedAt: d.updated_at
  });

  const loadSeo = async () => {
    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin.from('seo_settings').select('*').eq('id', 1).maybeSingle();
        if (!error && data) {
          const fromDb = seoRowToSettings(data);
          Object.entries(fromDb).forEach(([k, v]) => {
            if (v !== null && v !== undefined) inMemorySeoSettings[k] = v;
          });
        }
      } catch (err) {
        console.warn('Supabase SEO fetch fallback:', err);
      }
    }
    return inMemorySeoSettings;
  };

  app.get('/api/seo', async (_req, res) => res.json(await loadSeo()));

  app.post('/api/seo', requireAdmin, async (req, res) => {
    const payload = req.body || {};
    inMemorySeoSettings = { ...inMemorySeoSettings, ...payload, updatedAt: new Date().toISOString() };
    if (supabaseAdmin) {
      const s = inMemorySeoSettings;
      const { error } = await supabaseAdmin.from('seo_settings').upsert({
        id: 1,
        site_title: s.siteTitle,
        slogan: s.slogan,
        target_keywords: s.targetKeywords,
        meta_description: s.metaDescription,
        site_url: s.siteUrl,
        og_image: s.ogImage,
        noindex: s.noindex,
        responsive_viewport: s.responsiveViewport,
        custom_header_tags: s.customHeaderTags,
        google_analytics_id: s.googleAnalyticsId,
        google_maps_api_key: s.googleMapsApiKey,
        meta_pixel_id: s.metaPixelId,
        gtm_id: s.gtmId,
        google_ads_conversion_id: s.googleAdsConversionId,
        google_ads_conversion_label: s.googleAdsConversionLabel,
        updated_at: s.updatedAt
      });
      if (error) return res.status(500).json({ error: `Supabase: ${error.message}` });
    }
    return res.json({ success: true, settings: inMemorySeoSettings });
  });

  // ==========================================================================
  // SITE CONTENT (CMS)
  // ==========================================================================
  app.get('/api/site-content', async (_req, res) => {
    try {
      await loadSiteContent();
    } catch (err) {
      console.warn('Supabase site_content fetch fallback:', err);
    }
    if (!inMemorySiteContent) return res.status(204).end(); // belum ada konten tersimpan -> client pakai default
    const publicContent = { ...inMemorySiteContent };
    delete publicContent.deletedRecords;
    return res.json(publicContent);
  });

  app.post('/api/site-content', requireAdmin, async (req, res) => {
    try {
      await loadSiteContent(); // ambil deletedRecords terbaru agar tidak tertimpa isi CMS dari browser
      const content = { ...req.body, deletedRecords, updatedAt: new Date().toISOString() };
      const error = await saveSiteContent(content);
      if (error) return res.status(500).json({ error: `Supabase: ${error}` });
      return res.json({ success: true, content });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // AUTHORS API — /api/authors & /api/authors/:id + CRUD admin-protected
  // ==========================================================================

  // GET /api/authors — list semua penulis (diurut nama ASC)
  app.get('/api/authors', async (_req, res) => {
    try {
      const authors = await loadAuthors();
      const sorted = [...authors].sort((a, b) => String(a.name).localeCompare(String(b.name), 'id-ID'));
      return res.json(sorted);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Gagal memuat daftar penulis.' });
    }
  });

  // GET /api/authors/:id — detail 1 penulis + attach relasi buku karyanya
  app.get('/api/authors/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      await loadAuthors();
      await loadBookAuthors();
      const allBooks = await loadBooks();
      const author = inMemoryAuthors.find((a) => a.id === id);
      if (!author) {
        return res.status(404).json({ error: 'Penulis tidak ditemukan.' });
      }
      const enriched = attachAuthorBooks(author, allBooks);
      return res.json(enriched);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Gagal memuat detail penulis.' });
    }
  });

  // POST /api/authors — (Admin) buat penulis baru
  app.post('/api/authors', requireAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !String(body.name).trim()) {
        return res.status(400).json({ error: 'Nama penulis wajib diisi.' });
      }
      // Kolom authors.id di Supabase bertipe UUID.
      const newId = body.id && (!supabaseAdmin || isUuid(String(body.id))) ? String(body.id) : crypto.randomUUID();
      const now = new Date().toISOString();
      const payload: Author = {
        id: newId,
        name: String(body.name).trim(),
        academic_titles: body.academic_titles ? String(body.academic_titles).trim() : undefined,
        photo_url: body.photo_url ? String(body.photo_url) : undefined,
        scopus_id: body.scopus_id ? String(body.scopus_id).trim() : undefined,
        orcid_id: body.orcid_id ? String(body.orcid_id).trim() : undefined,
        linkedin_url: body.linkedin_url ? String(body.linkedin_url).trim() : undefined,
        email: body.email ? String(body.email).trim() : undefined,
        profile_education: body.profile_education ?? undefined,
        work_experience: body.work_experience ?? undefined,
        organization_seminar: body.organization_seminar ?? undefined,
        publications: body.publications ?? undefined,
        i18n: body.i18n && typeof body.i18n === 'object' ? body.i18n : undefined,
        created_at: now,
        updated_at: now
      };

      if (supabaseAdmin) {
        const { error } = await supabaseAdmin.from('authors').insert(authorToRow(payload));
        if (error) return res.status(500).json({ error: `Supabase: ${error.message}` });
      }
      inMemoryAuthors.push(payload);
      await markSeedDeleted('authors', authorNameKey(payload.name), false);
      return res.status(201).json(payload);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Gagal menyimpan penulis baru.' });
    }
  });

  // PUT /api/authors/:id — (Admin) perbarui penulis
  app.put('/api/authors/:id', requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      await loadAuthors();
      const idx = findAuthorIndex(id);
      if (idx < 0) return res.status(404).json({ error: 'Penulis tidak ditemukan.' });
      const body = req.body || {};
      const prev = inMemoryAuthors[idx];
      const updated: Author = {
        ...prev,
        ...body,
        id: prev.id,
        created_at: prev.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (body.name) updated.name = String(body.name).trim();
      if (supabaseAdmin) {
        // Penulis bawaan (id "author-N") belum punya baris di Supabase (kolom id bertipe UUID):
        // simpan sebagai baris baru ber-UUID, lalu pindahkan relasi bukunya ke id baru.
        if (!isUuid(prev.id)) updated.id = crypto.randomUUID();
        const { error } = await supabaseAdmin.from('authors').upsert(authorToRow(updated));
        if (error) return res.status(500).json({ error: `Supabase: ${error.message}` });
        if (updated.id !== prev.id) {
          await loadBookAuthors();
          inMemoryBookAuthors = inMemoryBookAuthors.map((r) => (r.author_id === prev.id ? { ...r, author_id: updated.id } : r));
          const rows = inMemoryBookAuthors
            .filter((r) => r.author_id === updated.id)
            .map((r) => ({ book_id: r.book_id, author_id: updated.id, author_order: r.author_order }));
          if (rows.length > 0) {
            const { error: relError } = await supabaseAdmin.from('book_authors').insert(rows);
            if (relError) console.warn('Supabase book_authors migrate warning:', relError.message);
          }
        }
      }
      inMemoryAuthors[idx] = updated;
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Gagal memperbarui data penulis.' });
    }
  });

  // DELETE /api/authors/:id — (Admin) hapus penulis + cascade junction relasi bukunya
  app.delete('/api/authors/:id', requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      await loadAuthors();
      const idx = findAuthorIndex(id);
      if (idx < 0) {
        return res.status(404).json({ error: 'Penulis tidak ditemukan.' });
      }
      const target = inMemoryAuthors[idx];
      await loadBookAuthors();
      // Penulis bawaan (id non-UUID) tidak punya baris di Supabase; cukup ditandai terhapus.
      if (supabaseAdmin && isUuid(target.id)) {
        const { error: e1 } = await supabaseAdmin.from('book_authors').delete().eq('author_id', target.id);
        if (e1) return res.status(500).json({ error: `Supabase relasi: ${e1.message}` });
        const { error: e2 } = await supabaseAdmin.from('authors').delete().eq('id', target.id);
        if (e2) return res.status(500).json({ error: `Supabase author: ${e2.message}` });
      }
      inMemoryAuthors = inMemoryAuthors.filter((a) => a.id !== target.id);
      inMemoryBookAuthors = inMemoryBookAuthors.filter((r) => r.author_id !== target.id);
      await markSeedDeleted('authors', authorNameKey(target.name), true);
      return res.json({ success: true, deletedId: target.id });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Gagal menghapus penulis.' });
    }
  });

  // POST /api/authors/:id/books — (Admin) atur ulang relasi buku
  app.post('/api/authors/:id/books', requireAdmin, async (req, res) => {
    try {
      const requestedId = String(req.params.id || '').trim();
      const body = req.body || {};
      const bookIds: string[] = Array.isArray(body.book_ids)
        ? body.book_ids.map((s: any) => String(s))
        : [];
      await loadAuthors();
      const idx = findAuthorIndex(requestedId);
      if (idx < 0) {
        return res.status(404).json({ error: 'Penulis tidak ditemukan.' });
      }
      const authorId = inMemoryAuthors[idx].id;
      await loadBookAuthors();
      // Hapus relasi lama untuk author ini
      inMemoryBookAuthors = inMemoryBookAuthors.filter((r) => r.author_id !== authorId);
      // Tambahkan yang baru berurutan
      const now = new Date().toISOString();
      bookIds.forEach((bid, idx) => {
        inMemoryBookAuthors.push({
          id: `ba-${authorId}-${bid}-${Math.random().toString(36).slice(2, 8)}`,
          book_id: bid,
          author_id: authorId,
          author_order: idx,
          created_at: now
        });
      });
      if (supabaseAdmin && isUuid(authorId)) {
        try {
          const { error: e1 } = await supabaseAdmin.from('book_authors').delete().eq('author_id', authorId);
          if (e1) console.warn('Supabase book_authors reset warning:', e1.message);
          if (bookIds.length > 0) {
            const rows = bookIds.map((bid, idx) => ({
              book_id: bid,
              author_id: authorId,
              author_order: idx,
              created_at: now
            }));
            const { error: e2 } = await supabaseAdmin.from('book_authors').insert(rows);
            if (e2) console.warn('Supabase book_authors insert warning:', e2.message);
          }
        } catch (e) {
          console.warn('Supabase book_authors relation catch:', (e as any).message);
        }
      }
      return res.json({ success: true, total_relations: bookIds.length });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Gagal menyimpan relasi buku.' });
    }
  });

  // ==========================================================================
  // SITEMAP & ROBOTS (dinamis, mengikuti katalog aktual & pengaturan SEO)
  // ==========================================================================
  const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  app.get('/sitemap.xml', async (_req, res) => {
    const seo = await loadSeo();
    const baseUrl = String(seo.siteUrl || 'https://cakranexa.com').replace(/\/$/, '');
    const now = new Date().toISOString().split('T')[0];
    const staticPages = [
      { path: '', freq: 'daily', prio: '1.0' },
      { path: '/katalog', freq: 'daily', prio: '0.9' },
      { path: '/penerbitan', freq: 'weekly', prio: '0.85' },
      { path: '/pelatihan', freq: 'weekly', prio: '0.8' },
      { path: '/jurnal', freq: 'monthly', prio: '0.75' },
      { path: '/tentang-kami', freq: 'monthly', prio: '0.7' },
      { path: '/blog', freq: 'weekly', prio: '0.75' },
      { path: '/karir', freq: 'weekly', prio: '0.6' },
      { path: '/kontak', freq: 'monthly', prio: '0.6' }
    ];
    const books = await loadBooks();
    // Setiap halaman dalam 3 bahasa (Indonesia tanpa prefix, /en, /zh) beserta tautan hreflang antarbahasa.
    const languages = [
      { hreflang: 'id', prefix: '' },
      { hreflang: 'en', prefix: '/en' },
      { hreflang: 'zh-CN', prefix: '/zh' }
    ];
    const entry = (path: string, freq: string, prio: string) => {
      const alternates = [
        ...languages.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${escapeXml(`${baseUrl}${l.prefix}${path}`)}"/>`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${baseUrl}${path}`)}"/>`
      ].join('\n');
      return languages
        .map((l) => `  <url>\n    <loc>${escapeXml(`${baseUrl}${l.prefix}${path}`)}</loc>\n${alternates}\n    <lastmod>${now}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${prio}</priority>\n  </url>`)
        .join('\n');
    };
    const urls = [
      ...staticPages.map((p) => entry(p.path, p.freq, p.prio)),
      ...books.map((b) => entry(`/katalog/${b.slug || b.id}`, 'weekly', '0.80'))
    ];
    res.header('Content-Type', 'application/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>`);
  });

  app.get('/robots.txt', async (_req, res) => {
    const seo = await loadSeo();
    const baseUrl = String(seo.siteUrl || 'https://cakranexa.com').replace(/\/$/, '');
    const body = seo.noindex
      ? `User-agent: *\nDisallow: /\n`
      : `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /en/admin\nDisallow: /en/checkout\nDisallow: /zh/admin\nDisallow: /zh/checkout\n`;
    res.header('Content-Type', 'text/plain');
    return res.send(`${body}\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  // ==========================================================================
  // VITE DEV MIDDLEWARE (dev) / STATIC SPA (production)
  // ==========================================================================
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite'); // hanya dimuat saat dev
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint tidak ditemukan' });
      return res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handler (termasuk penolakan CORS)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.message?.includes('CORS')) return res.status(403).json({ error: err.message });
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  // Muat katalog awal dari Supabase (jika ada) agar in-memory selaras dengan DB
  try {
    await loadBooks();
    await loadAuthors();
    await loadBookAuthors();
  } catch (err) {
    console.warn('Initial catalog/authors load fallback:', err);
  }

  if (process.env.VERCEL !== '1') {
    app.listen(PORT, HOST, () => {
      console.log(`🚀 CakraNexa Express Server running on http://${HOST}:${PORT} [${IS_PRODUCTION ? 'production' : 'development'}]`);
      console.log(`🔐 Admin login: ${ADMIN_PASSWORD ? 'aktif' : 'NONAKTIF (set ADMIN_PASSWORD)'} | 💳 Midtrans: ${MIDTRANS_ENABLED ? (MIDTRANS_IS_PRODUCTION ? 'production' : 'sandbox') : 'tidak tersedia'}`);
    });
  }
}

startServer();

export default app;
