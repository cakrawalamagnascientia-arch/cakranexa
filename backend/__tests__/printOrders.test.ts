import { describe, expect, it, vi } from 'vitest';
import { ORDER_NOT_SAVED_MESSAGE, placePrintOrder, type PrintOrderDb, type PrintOrderRows } from '../printOrders';

const ORDER = { orderNumber: 'CNX-202609-000001', paymentMethod: 'bca_va', total: 199000 };
const ROWS: PrintOrderRows = {
  order: { order_id: ORDER.orderNumber, total_amount: 199000 },
  items: [{ order_id: ORDER.orderNumber, book_id: 'book-28', quantity: 1 }],
  stock: [{ bookId: 'book-28', quantity: 1 }]
};

const setup = (db: Partial<PrintOrderDb> | null) => {
  const calls: string[] = [];
  const fullDb: PrintOrderDb | null = db === null ? null : {
    insertOrder: vi.fn(async () => { calls.push('orders'); return { error: null }; }),
    insertItems: vi.fn(async () => { calls.push('order_items'); return { error: null }; }),
    markOrderFailed: vi.fn(async () => { calls.push('mark_failed'); return { error: null }; }),
    decrementStock: vi.fn(async () => { calls.push('stock'); }),
    ...db
  };
  const createSnap = vi.fn(async () => { calls.push('midtrans'); return 'snap-token'; });
  const notifyAdmin = vi.fn(async () => { calls.push('email'); });
  const log = { error: vi.fn() };
  return { calls, db: fullDb, createSnap, notifyAdmin, log, deps: { db: fullDb, createSnap, notifyAdmin, log } };
};

describe('pesanan buku cetak: simpan dulu, baru buat transaksi Midtrans', () => {
  it('insert orders gagal -> 503, tidak ada panggilan ke Midtrans maupun email, error dicatat dengan detail', async () => {
    const t = setup({ insertOrder: vi.fn(async () => ({ error: { message: 'duplicate key value', code: '23505', details: 'Key (order_id) exists', hint: null } })) });
    const result = await placePrintOrder(t.deps, ORDER, ROWS);
    expect(result).toEqual({ ok: false, status: 503, error: ORDER_NOT_SAVED_MESSAGE });
    expect(t.createSnap).not.toHaveBeenCalled();
    expect(t.notifyAdmin).not.toHaveBeenCalled();
    expect(t.db!.insertItems).not.toHaveBeenCalled();
    expect(t.db!.decrementStock).not.toHaveBeenCalled();
    expect(t.log.error).toHaveBeenCalledWith(expect.stringContaining('tidak tersimpan'), expect.objectContaining({
      orderId: ORDER.orderNumber, stage: 'orders', code: '23505', message: 'duplicate key value', details: 'Key (order_id) exists'
    }));
  });

  it('database tidak terjangkau (insert melempar error) -> 503 tanpa Midtrans', async () => {
    const t = setup({ insertOrder: vi.fn(async () => { throw new Error('fetch failed'); }) });
    const result = await placePrintOrder(t.deps, ORDER, ROWS);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 503 });
    expect(t.createSnap).not.toHaveBeenCalled();
    expect(t.log.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ stage: 'orders', message: 'fetch failed' }));
  });

  it('insert order_items gagal -> pesanan ditandai gagal (tidak dihapus), 503, tanpa Midtrans dan stok tidak berkurang', async () => {
    const t = setup({ insertItems: vi.fn(async () => { t.calls.push('order_items'); return { error: { message: 'violates foreign key', code: '23503' } }; }) });
    const result = await placePrintOrder(t.deps, ORDER, ROWS);
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(t.db!.markOrderFailed).toHaveBeenCalledWith(ORDER.orderNumber);
    expect(t.calls).toEqual(['orders', 'order_items', 'mark_failed']);
    expect(t.log.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ stage: 'order_items', code: '23503', markedFailed: true }));
  });

  it('berhasil: urutan orders -> order_items -> stok -> Midtrans -> email admin', async () => {
    const t = setup({});
    const result = await placePrintOrder(t.deps, ORDER, ROWS);
    expect(result).toEqual({ ok: true, snapToken: 'snap-token' });
    expect(t.calls).toEqual(['orders', 'order_items', 'stock', 'midtrans', 'email']);
    expect(t.db!.insertOrder).toHaveBeenCalledWith(ROWS.order);
    expect(t.db!.insertItems).toHaveBeenCalledWith(ROWS.items);
  });

  it('transfer manual: tersimpan tanpa transaksi Midtrans', async () => {
    const t = setup({});
    const result = await placePrintOrder(t.deps, { ...ORDER, paymentMethod: 'manual_mandiri' }, ROWS);
    expect(result).toEqual({ ok: true, snapToken: null });
    expect(t.createSnap).not.toHaveBeenCalled();
    expect(t.calls).toEqual(['orders', 'order_items', 'stock', 'email']);
  });

  it('email admin gagal tidak membatalkan pesanan yang sudah tersimpan', async () => {
    const t = setup({});
    t.notifyAdmin.mockRejectedValueOnce(new Error('Resend 500'));
    const result = await placePrintOrder(t.deps, ORDER, ROWS);
    expect(result).toEqual({ ok: true, snapToken: 'snap-token' });
    expect(t.log.error).toHaveBeenCalledWith('Order email notification failed:', expect.any(Error));
  });

  it('tanpa database (mode lokal): perilaku lama, Snap tetap dibuat', async () => {
    const t = setup(null);
    const result = await placePrintOrder(t.deps, ORDER, ROWS);
    expect(result).toEqual({ ok: true, snapToken: 'snap-token' });
    expect(t.calls).toEqual(['midtrans', 'email']);
  });
});
