import type { SupabaseClient } from '@supabase/supabase-js';
import { ORDER_NOT_SAVED_MESSAGE } from './digital/errors';

/**
 * Menyimpan pesanan buku cetak sebelum pembayaran dibuat. Transaksi Midtrans (Snap) dan email admin hanya dibuat
 * setelah baris orders dan order_items tersimpan; bila penyimpanan gagal, pembeli mendapat 503 dan tidak ada
 * transaksi pembayaran untuk pesanan yang tidak tercatat. Stok tidak dikurangi di sini: pengurangan stok adalah efek
 * "lunas" (backend/printCheckout/service.ts markOrderPaid).
 */
export { ORDER_NOT_SAVED_MESSAGE };

export interface DbError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface PrintOrderDb {
  insertOrder(row: Record<string, unknown>): Promise<{ error: DbError | null }>;
  insertItems(rows: Record<string, unknown>[]): Promise<{ error: DbError | null }>;
  /** Baris orders sudah masuk tetapi order_items gagal: pesanan ditandai gagal (tidak dihapus). */
  markOrderFailed(orderId: string): Promise<{ error: DbError | null }>;
  /** Dipakai markOrderPaid (efek lunas), bukan saat pesanan dibuat. */
  decrementStock(bookId: string, quantity: number): Promise<void>;
}

export interface PrintOrderRows {
  order: Record<string, unknown>;
  items: Record<string, unknown>[];
}

export interface PlacePrintOrderDeps {
  /** null = tanpa database (mode lokal in-memory). */
  db: PrintOrderDb | null;
  createSnap(order: any): Promise<string | null>;
  notifyAdmin(order: any): Promise<void>;
  log?: Pick<Console, 'error'>;
}

export type PlacePrintOrderResult =
  | { ok: true; snapToken: string | null }
  | { ok: false; status: 503; error: string };

const errorDetail = (err: unknown): DbError => {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as DbError;
    return { message: String(e.message), code: e.code, details: e.details ?? null, hint: e.hint ?? null };
  }
  return { message: String(err) };
};

/** Jalankan operasi database; error yang dilempar (mis. jaringan) diperlakukan sama dengan error dari Supabase. */
const attempt = async (op: () => Promise<{ error: DbError | null }>): Promise<DbError | null> => {
  try {
    const { error } = await op();
    return error ? errorDetail(error) : null;
  } catch (err) {
    return errorDetail(err);
  }
};

export async function placePrintOrder(deps: PlacePrintOrderDeps, order: any, rows: PrintOrderRows): Promise<PlacePrintOrderResult> {
  const log = deps.log ?? console;
  const notSaved = { ok: false as const, status: 503 as const, error: ORDER_NOT_SAVED_MESSAGE };

  if (deps.db) {
    const db = deps.db;
    const orderError = await attempt(() => db.insertOrder(rows.order));
    if (orderError) {
      log.error('[orders] Pesanan tidak tersimpan; transaksi pembayaran tidak dibuat.', {
        orderId: order.orderNumber, stage: 'orders', ...orderError
      });
      return notSaved;
    }
    const itemsError = await attempt(() => db.insertItems(rows.items));
    if (itemsError) {
      const markError = await attempt(() => db.markOrderFailed(order.orderNumber));
      log.error('[orders] Item pesanan tidak tersimpan; pesanan ditandai gagal dan transaksi pembayaran tidak dibuat.', {
        orderId: order.orderNumber, stage: 'order_items', ...itemsError, markedFailed: !markError
      });
      return notSaved;
    }
  }

  // Midtrans Snap token hanya boleh dibuat dari backend yang memiliki Server Key.
  const snapToken = order.paymentMethod === 'manual_mandiri' ? null : await deps.createSnap(order);

  try {
    await deps.notifyAdmin(order);
  } catch (emailError) {
    log.error('Order email notification failed:', emailError);
  }
  return { ok: true, snapToken };
}

/** Adapter Supabase (service role) untuk placePrintOrder. */
export const supabasePrintOrderDb = (client: SupabaseClient): PrintOrderDb => ({
  insertOrder: async (row) => {
    const { error } = await client.from('orders').insert(row);
    return { error };
  },
  insertItems: async (rows) => {
    const { error } = await client.from('order_items').insert(rows);
    return { error };
  },
  markOrderFailed: async (orderId) => {
    const { error } = await client.from('orders')
      .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
      .eq('order_id', orderId);
    return { error };
  },
  decrementStock: async (bookId, quantity) => {
    // Lihat schema.sql: decrement_book_stock
    await client.rpc('decrement_book_stock', { p_book_id: bookId, p_qty: quantity });
  }
});
