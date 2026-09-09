import { Book, Order } from '../types';

export interface TimeSeriesDataPoint {
  label: string;
  revenue: number;
  traffic: number;
  orders: number;
}

export interface CategorySalesData {
  name: string;
  sold: number;
  revenue: number;
  percentage: number;
  color: string;
}

export interface BestSellerItem {
  id: string;
  title: string;
  author: string;
  category: string;
  soldUnits: number;
  stockRemaining: number;
  targetUnits: number;
  revenue: number;
  coverImage?: string;
}

export interface InquiryOrReview {
  id: string;
  type: 'manuscript' | 'review' | 'inquiry';
  title: string;
  senderName: string;
  senderRole?: string;
  institution?: string;
  date: string;
  timestamp: string;
  content: string;
  status: 'pending' | 'reviewed' | 'responded' | 'approved';
  rating?: number;
  bookRefTitle?: string;
}

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time: string;
  title: string;
  category: 'launch' | 'webinar' | 'editorial' | 'deadline';
  location: string;
  description: string;
  status: 'upcoming' | 'ongoing' | 'completed';
}

// ============================================================================
// SEMUA ANGKA DIHITUNG DARI DATA NYATA (orders & books). Tidak ada seed/dummy.
// Trafik pengunjung memerlukan sumber eksternal (GA4) -> 0 sampai terintegrasi.
// ============================================================================

const PAID_STATUSES = new Set(['paid', 'processing', 'shipped']);

const CATEGORY_COLORS: Record<string, string> = {
  Perpajakan: '#D4AF37',
  Akuntansi: '#0F172A',
  Hukum: '#64748B',
  'Ekonomi & Bisnis': '#DFBF64',
  Filsafat: '#94A3B8',
  Teologia: '#334155'
};

const parseDate = (iso?: string): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Deret waktu pendapatan & jumlah pesanan dari order nyata. */
export function buildTimeSeries(orders: Order[], range: 'daily' | 'weekly' | 'monthly'): TimeSeriesDataPoint[] {
  const now = new Date();
  const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
  if (range === 'daily') {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const e = new Date(d); e.setDate(e.getDate() + 1);
      buckets.push({ key: d.toISOString(), label: d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }), start: d, end: e });
    }
  } else if (range === 'weekly') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay() - i * 7);
      const e = new Date(d); e.setDate(e.getDate() + 7);
      buckets.push({ key: d.toISOString(), label: `Mg ${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}`, start: d, end: e });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      buckets.push({ key: d.toISOString(), label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }), start: d, end: e });
    }
  }
  return buckets.map((b) => {
    const inRange = orders.filter((o) => {
      const d = parseDate(o.createdAt);
      return d && d >= b.start && d < b.end;
    });
    const revenue = inRange.filter((o) => PAID_STATUSES.has(o.paymentStatus)).reduce((a, o) => a + (o.total || 0), 0);
    return { label: b.label, revenue, traffic: 0, orders: inRange.length };
  });
}

/** Distribusi penjualan per kategori dari item order yang sudah dibayar. */
export function buildCategoryDistribution(orders: Order[], books: Book[]): CategorySalesData[] {
  const agg = new Map<string, { sold: number; revenue: number }>();
  orders.filter((o) => PAID_STATUSES.has(o.paymentStatus)).forEach((o) => {
    (o.items || []).forEach((it) => {
      const cat = books.find((b) => b.id === it.book?.id)?.category || it.book?.category || 'Lainnya';
      const cur = agg.get(cat) || { sold: 0, revenue: 0 };
      cur.sold += it.quantity || 1;
      cur.revenue += (it.book?.harga || 0) * (it.quantity || 1);
      agg.set(cat, cur);
    });
  });
  const totalSold = [...agg.values()].reduce((a, v) => a + v.sold, 0);
  return [...agg.entries()]
    .map(([name, v]) => ({ name, sold: v.sold, revenue: v.revenue, percentage: totalSold ? Math.round((v.sold / totalSold) * 100) : 0, color: CATEGORY_COLORS[name] || '#CBD5E1' }))
    .sort((a, b) => b.sold - a.sold);
}

/** Top 5 buku terlaris dari order nyata. Jika belum ada penjualan, daftar kosong. */
export function getTopBestSellers(books: Book[], orders: Order[] = []): BestSellerItem[] {
  const sold = new Map<string, number>();
  orders.filter((o) => PAID_STATUSES.has(o.paymentStatus)).forEach((o) => {
    (o.items || []).forEach((it) => {
      if (!it.book?.id) return;
      sold.set(it.book.id, (sold.get(it.book.id) || 0) + (it.quantity || 1));
    });
  });
  return [...sold.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, units]) => {
      const book = books.find((b) => b.id === id);
      return {
        id,
        title: book?.name || id,
        author: book?.author || '-',
        category: book?.category || '-',
        soldUnits: units,
        stockRemaining: book?.stock ?? 0,
        targetUnits: Math.max(units, 50),
        revenue: units * (book?.harga || 0),
        coverImage: book?.coverBuku
      };
    });
}

// Kompatibilitas nama lama (kosong — tidak ada lagi data seed)
export const DAILY_ANALYTICS: TimeSeriesDataPoint[] = [];
export const WEEKLY_ANALYTICS: TimeSeriesDataPoint[] = [];
export const MONTHLY_ANALYTICS: TimeSeriesDataPoint[] = [];
export const CATEGORY_SALES_DISTRIBUTION: CategorySalesData[] = [];
export const RECENT_FEEDBACK_STREAM: InquiryOrReview[] = [];
export const CALENDAR_EVENTS: CalendarEvent[] = [];
export const SEED_ADMIN_ORDERS: Order[] = [];
