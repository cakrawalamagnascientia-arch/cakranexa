/**
 * Query redirect Midtrans untuk /payment/success dan /payment/failed (Midtrans menambahkan
 * ?order_id=&status_code=&transaction_status=). Hanya dipakai untuk memilih jenis pesanan dan teks alasan;
 * status bayar selalu dibaca dari server.
 */
export type PaymentOrderKind = 'print' | 'digital' | 'membership' | 'institution' | 'unknown';

const ORDER_ID_RE = /^[A-Za-z0-9._-]{3,80}$/;

/** Status pesanan buku cetak (GET /api/orders/:id/status) yang berarti sudah dibayar / gagal. */
export const PAID_ORDER_STATUSES = new Set(['paid', 'processing', 'shipped']);
export const FAILED_ORDER_STATUSES = new Set(['failed', 'cancelled']);

export const paymentOrderKind = (orderId: string | null): PaymentOrderKind => {
  if (!orderId) return 'unknown';
  if (orderId.startsWith('DIG-')) return 'digital';
  if (orderId.startsWith('SUB-')) return 'membership';
  if (orderId.startsWith('INST-')) return 'institution';
  return 'print';
};

/** Nomor pesanan & status Midtrans dari query redirect; nomor dengan format tidak wajar diabaikan. */
export const parsePaymentQuery = (query: string): { orderId: string | null; kind: PaymentOrderKind; transactionStatus: string } => {
  const params = new URLSearchParams(query);
  const raw = (params.get('order_id') || params.get('order') || '').trim();
  const orderId = ORDER_ID_RE.test(raw) ? raw : null;
  return { orderId, kind: paymentOrderKind(orderId), transactionStatus: (params.get('transaction_status') || '').toLowerCase() };
};
