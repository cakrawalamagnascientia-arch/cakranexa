import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabasePrintOrderDb, type DbError, type PrintOrderDb } from '../printOrders';
import type { PrintCheckoutSettings } from '../../src/data/shippingZones';
import type { RoutingEntry } from '../../src/data/paymentRouting';
import type { PrintOrderItemRow, PrintOrderRow, PrintOrderWithItems } from './types';

/** Penyimpanan pesanan cetak, pengaturan checkout, dan payment_routing (Supabase di produksi, memori di dev/tes). */
export interface PrintOrderStore extends PrintOrderDb {
  readonly kind: 'memory' | 'supabase';
  getOrder(orderId: string): Promise<PrintOrderWithItems | null>;
  listOrders(): Promise<PrintOrderWithItems[]>;
  /** Update bersyarat: hanya bila status sekarang termasuk `from` (bila diberikan). null = tidak ada baris yang cocok. */
  updateOrder(orderId: string, patch: Partial<PrintOrderRow>, from?: string[]): Promise<PrintOrderRow | null>;
  listByStatus(statuses: string[]): Promise<PrintOrderRow[]>;
  /** Pengaturan tersimpan (null = belum pernah disimpan admin). */
  getSettings(): Promise<Partial<PrintCheckoutSettings> | null>;
  saveSettings(settings: PrintCheckoutSettings): Promise<void>;
  getRouting(): Promise<RoutingEntry[] | null>;
  saveRouting(entries: RoutingEntry[]): Promise<void>;
  /** Pemakaian API RajaOngkir per tanggal WIB (tabel shipping_api_usage). */
  getApiUsage(date: string): Promise<number>;
  saveApiUsage(date: string, count: number): Promise<void>;
}

type StockHook = (bookId: string, quantity: number) => void;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class MemoryPrintOrderStore implements PrintOrderStore {
  readonly kind = 'memory' as const;
  orders: PrintOrderRow[] = [];
  items: PrintOrderItemRow[] = [];
  settings: PrintCheckoutSettings | null = null;
  routing: RoutingEntry[] | null = null;
  apiUsage = new Map<string, number>();

  constructor(private readonly onDecrementStock: StockHook = () => undefined) {}

  async insertOrder(row: Record<string, unknown>): Promise<{ error: DbError | null }> {
    if (this.orders.some((o) => o.order_id === row.order_id)) {
      return { error: { message: 'duplicate key value violates unique constraint "orders_order_id_key"', code: '23505' } };
    }
    const now = new Date().toISOString();
    this.orders.push({ id: crypto.randomUUID(), created_at: now, updated_at: now, ...(clone(row) as unknown as PrintOrderRow) });
    return { error: null };
  }

  async insertItems(rows: Record<string, unknown>[]): Promise<{ error: DbError | null }> {
    this.items.push(...(clone(rows) as unknown as PrintOrderItemRow[]));
    return { error: null };
  }

  async markOrderFailed(orderId: string): Promise<{ error: DbError | null }> {
    await this.updateOrder(orderId, { payment_status: 'failed' });
    return { error: null };
  }

  async decrementStock(bookId: string, quantity: number): Promise<void> {
    this.onDecrementStock(bookId, quantity);
  }

  private withItems(row: PrintOrderRow): PrintOrderWithItems {
    return { ...clone(row), order_items: clone(this.items.filter((i) => i.order_id === row.order_id)) };
  }

  async getOrder(orderId: string) {
    const row = this.orders.find((o) => o.order_id === orderId);
    return row ? this.withItems(row) : null;
  }

  async listOrders() {
    return [...this.orders]
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
      .map((row) => this.withItems(row));
  }

  async updateOrder(orderId: string, patch: Partial<PrintOrderRow>, from?: string[]) {
    const row = this.orders.find((o) => o.order_id === orderId);
    if (!row || (from && !from.includes(row.payment_status))) return null;
    Object.assign(row, clone(patch), { updated_at: new Date().toISOString() });
    return clone(row);
  }

  async listByStatus(statuses: string[]) {
    return clone(this.orders.filter((o) => statuses.includes(o.payment_status)));
  }

  async getSettings() {
    return this.settings ? clone(this.settings) : null;
  }

  async saveSettings(settings: PrintCheckoutSettings) {
    this.settings = clone(settings);
  }

  async getRouting() {
    return this.routing ? clone(this.routing) : null;
  }

  async saveRouting(entries: RoutingEntry[]) {
    this.routing = clone(entries);
  }

  async getApiUsage(date: string) {
    return this.apiUsage.get(date) ?? 0;
  }

  async saveApiUsage(date: string, count: number) {
    this.apiUsage.set(date, count);
  }
}

const check = <T>(result: { data: T; error: { message: string } | null }, what: string): T => {
  if (result.error) throw new Error(`Supabase ${what}: ${result.error.message}`);
  return result.data;
};

export class SupabasePrintOrderStore implements PrintOrderStore {
  readonly kind = 'supabase' as const;
  private readonly db: PrintOrderDb;

  constructor(private readonly client: SupabaseClient, private readonly onDecrementStock: StockHook = () => undefined) {
    this.db = supabasePrintOrderDb(client);
  }

  insertOrder(row: Record<string, unknown>) {
    return this.db.insertOrder(row);
  }

  insertItems(rows: Record<string, unknown>[]) {
    return this.db.insertItems(rows);
  }

  markOrderFailed(orderId: string) {
    return this.db.markOrderFailed(orderId);
  }

  async decrementStock(bookId: string, quantity: number) {
    await this.db.decrementStock(bookId, quantity);
    this.onDecrementStock(bookId, quantity);
  }

  async getOrder(orderId: string) {
    const data = check(await this.client.from('orders').select('*, order_items(*)').eq('order_id', orderId).maybeSingle(), 'orders');
    return (data as PrintOrderWithItems | null) ?? null;
  }

  async listOrders() {
    const data = check(await this.client.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }), 'orders');
    return (data ?? []) as PrintOrderWithItems[];
  }

  async updateOrder(orderId: string, patch: Partial<PrintOrderRow>, from?: string[]) {
    let query = this.client.from('orders').update({ ...patch, updated_at: new Date().toISOString() }).eq('order_id', orderId);
    if (from) query = query.in('payment_status', from);
    const data = check(await query.select('*').maybeSingle(), 'orders update');
    return (data as PrintOrderRow | null) ?? null;
  }

  async listByStatus(statuses: string[]) {
    const data = check(await this.client.from('orders').select('*').in('payment_status', statuses), 'orders');
    return (data ?? []) as PrintOrderRow[];
  }

  async getSettings() {
    const row = check(await this.client.from('print_checkout_settings').select('*').eq('id', 1).maybeSingle(), 'print_checkout_settings') as any;
    if (!row) return null;
    const originId = Number(row.origin_id);
    return {
      ...(row.fallback_mode ? { fallbackMode: row.fallback_mode } : {}),
      ...(row.daily_quota ? { dailyQuota: Number(row.daily_quota) } : {}),
      origin: Number.isInteger(originId) && originId > 0 ? { id: originId, label: String(row.origin_label || `ID ${originId}`) } : null,
      ...(Array.isArray(row.couriers) && row.couriers.length > 0 ? { couriers: row.couriers } : {}),
      ...(row.packaging_gram !== undefined && row.packaging_gram !== null ? { packagingGram: Number(row.packaging_gram) } : {}),
      ...(Array.isArray(row.zones) ? { zones: row.zones } : {}),
      manualQuoteMinCopies: Number(row.manual_quote_min_copies),
      uniqueCodeEnabled: row.unique_code_enabled !== false,
      transferDueHours: Number(row.transfer_due_hours),
      financeWhatsapp: row.finance_whatsapp ? String(row.finance_whatsapp) : ''
    };
  }

  async saveSettings(settings: PrintCheckoutSettings) {
    check(await this.client.from('print_checkout_settings').upsert({
      id: 1,
      fallback_mode: settings.fallbackMode,
      daily_quota: settings.dailyQuota,
      origin_id: settings.origin?.id ?? null,
      origin_label: settings.origin?.label ?? null,
      couriers: settings.couriers,
      packaging_gram: settings.packagingGram,
      zones: settings.zones,
      manual_quote_min_copies: settings.manualQuoteMinCopies,
      unique_code_enabled: settings.uniqueCodeEnabled,
      transfer_due_hours: settings.transferDueHours,
      finance_whatsapp: settings.financeWhatsapp || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' }), 'print_checkout_settings upsert');
  }

  async getRouting() {
    const rows = check(await this.client.from('payment_routing').select('transaction_type, method, provider'), 'payment_routing') as any[] | null;
    if (!rows || rows.length === 0) return null;
    return rows.map((r) => ({ transactionType: r.transaction_type, method: r.method, provider: r.provider })) as RoutingEntry[];
  }

  async saveRouting(entries: RoutingEntry[]) {
    check(await this.client.from('payment_routing').upsert(entries.map((e) => ({
      transaction_type: e.transactionType,
      method: e.method,
      provider: e.provider,
      updated_at: new Date().toISOString()
    })), { onConflict: 'transaction_type,method' }), 'payment_routing upsert');
  }

  async getApiUsage(date: string) {
    const row = check(await this.client.from('shipping_api_usage').select('request_count').eq('usage_date', date).maybeSingle(), 'shipping_api_usage') as any;
    return Number(row?.request_count) || 0;
  }

  async saveApiUsage(date: string, count: number) {
    check(await this.client.from('shipping_api_usage').upsert({
      usage_date: date,
      request_count: count,
      updated_at: new Date().toISOString()
    }, { onConflict: 'usage_date' }), 'shipping_api_usage upsert');
  }
}
