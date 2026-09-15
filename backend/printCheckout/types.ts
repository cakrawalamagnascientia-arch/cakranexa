/**
 * Pesanan buku cetak (tabel orders + order_items). Kolom baru dari src/db/print_checkout_migration.sql bernilai null
 * pada pesanan lama.
 */
export const PRINT_ORDER_STATUSES = [
  'pending', 'awaiting_transfer', 'awaiting_shipping_quote', 'paid', 'processing', 'shipped', 'failed', 'cancelled', 'expired'
] as const;
export type PrintOrderStatus = (typeof PRINT_ORDER_STATUSES)[number];

/** Belum dibayar dan masih dapat dilunasi. Pesanan expired harus checkout ulang. */
export const UNPAID_STATUSES: string[] = ['pending', 'awaiting_transfer'];
/** Status yang boleh dipulihkan admin; expired adalah terminal dan tidak boleh dibayar lagi. */
export const ADMIN_PAYABLE_STATUSES: string[] = [...UNPAID_STATUSES, 'cancelled', 'failed'];
export const PAID_STATUSES: string[] = ['paid', 'processing', 'shipped'];

/** Kolom orders yang ditambahkan print_checkout_migration.sql (dicek tes migration). */
export const PRINT_CHECKOUT_ORDER_COLUMNS = [
  'province', 'city', 'shipping_zone', 'copies', 'subtotal_amount', 'unique_code', 'unique_discount', 'payment_due_at',
  'paid_at', 'payment_confirmed_by', 'payment_reference', 'expired_at', 'due_extended_count', 'payment_proof_path',
  'payment_proof_uploaded_at', 'shipping_quoted_at', 'shipping_source', 'shipping_destination_id', 'shipping_destination_label',
  'shipping_weight_gram', 'shipping_etd'
] as const;

/**
 * Asal ongkir pesanan: tarif kurir RajaOngkir, estimasi tabel zona saat RajaOngkir tidak tersedia (cadangan, admin bisa
 * mengoreksi), atau diisi admin (pesanan besar / tidak ada layanan / cadangan "tahan pesanan" / hasil koreksi).
 */
export type ShippingSource = 'rajaongkir' | 'zone_fallback' | 'manual';

export interface PrintOrderRow {
  id?: string;
  order_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  shipping_address: string;
  courier: string;
  shipping_fee: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  tracking_number: string | null;
  payment_proof_url?: string | null;
  va_number?: string | null;
  customer_notes: string | null;
  language: string;
  // Data royalti (print_orders_royalty_migration.sql)
  channel?: string;
  discount_amount?: number;
  tax_amount?: number;
  gateway_fee_estimate?: number;
  refund_status?: string;
  refund_amount?: number | null;
  is_test?: boolean;
  // Checkout transfer manual (print_checkout_migration.sql)
  province: string | null;
  city: string | null;
  shipping_zone: string | null;
  copies: number | null;
  subtotal_amount: number | null;
  unique_code: number | null;
  unique_discount: number | null;
  payment_due_at: string | null;
  paid_at: string | null;
  payment_confirmed_by: string | null;
  payment_reference: string | null;
  expired_at: string | null;
  due_extended_count: number | null;
  payment_proof_path: string | null;
  payment_proof_uploaded_at: string | null;
  shipping_quoted_at: string | null;
  // Ongkir RajaOngkir (null pada pesanan lama)
  shipping_source?: ShippingSource | null;
  shipping_destination_id?: number | null;
  shipping_destination_label?: string | null;
  shipping_weight_gram?: number | null;
  shipping_etd?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PrintOrderItemRow {
  order_id: string;
  book_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  hje_at_sale?: number;
  discount_amount?: number;
}

export type PrintOrderWithItems = PrintOrderRow & { order_items: PrintOrderItemRow[] };
