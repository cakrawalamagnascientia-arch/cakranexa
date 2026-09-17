import type { PaymentMethod } from '../types';

/**
 * payment_routing (docs/PAYMENT-PROVIDER-BRIEF.md Langkah 1): per jenis transaksi dan metode -> provider.
 *  - 'print' (checkout buku cetak): bawaan hanya "Transfer Bank ke rekening PT" (provider 'manual').
 *  - 'digital' (pembelian satuan e-book/audiobook): bawaan semua 'off' — fase 6 tidak menjual satuan.
 *  - 'membership' (langganan Blue/Silver/Gold/Platinum): bawaan transfer bank manual; Midtrans off.
 * Semua metode lain 'off' sampai diaktifkan admin. Xendit belum terpasang, jadi 'xendit' diperlakukan seperti 'off'.
 */
export const ROUTING_TRANSACTION_TYPES = ['print', 'digital', 'membership', 'institution'] as const;
export type RoutingTransactionType = (typeof ROUTING_TRANSACTION_TYPES)[number];

export const ROUTING_METHODS = [
  'bank_transfer', 'va_bni', 'va_mandiri', 'va_bri', 'va_bca', 'qris', 'gopay', 'ovo', 'dana', 'shopeepay', 'card'
] as const;
export type RoutingMethod = (typeof ROUTING_METHODS)[number];

export const ROUTING_PROVIDERS = ['manual', 'midtrans', 'xendit', 'off'] as const;
export type RoutingProvider = (typeof ROUTING_PROVIDERS)[number];

export interface RoutingEntry {
  transactionType: RoutingTransactionType;
  method: RoutingMethod;
  provider: RoutingProvider;
}

/** Provider yang boleh dipilih per metode (transfer manual hanya 'manual'/'off'). */
export const allowedProviders = (method: RoutingMethod): RoutingProvider[] =>
  method === 'bank_transfer' ? ['manual', 'off'] : ['midtrans', 'xendit', 'off'];

/** Jenis transaksi yang routingnya dikelola admin (institusi memakai invoice VA sendiri). */
export const MANAGED_ROUTING_TYPES = ['print', 'digital', 'membership'] as const satisfies readonly RoutingTransactionType[];
export type ManagedRoutingType = (typeof MANAGED_ROUTING_TYPES)[number];

const defaultProvider = (type: ManagedRoutingType, method: RoutingMethod): RoutingProvider =>
  type !== 'digital' && method === 'bank_transfer' ? 'manual' : 'off';

export const DEFAULT_PAYMENT_ROUTING: RoutingEntry[] = MANAGED_ROUTING_TYPES.flatMap((transactionType) =>
  ROUTING_METHODS.map((method) => ({ transactionType, method, provider: defaultProvider(transactionType, method) })));

/** Nilai payment_method pesanan -> metode routing. */
export const ROUTING_METHOD_OF: Partial<Record<PaymentMethod, RoutingMethod>> = {
  bank_transfer: 'bank_transfer',
  manual_mandiri: 'bank_transfer',
  bca_va: 'va_bca',
  mandiri_bill: 'va_mandiri',
  bni_va: 'va_bni',
  bri_va: 'va_bri',
  qris: 'qris',
  gopay: 'gopay',
  ovo: 'ovo',
  dana: 'dana',
  shopeepay: 'shopeepay',
  credit_card: 'card'
};

/** Metode routing -> nilai payment_method yang disimpan di pesanan. */
export const PAYMENT_METHOD_OF: Record<RoutingMethod, PaymentMethod> = {
  bank_transfer: 'bank_transfer',
  va_bni: 'bni_va',
  va_mandiri: 'mandiri_bill',
  va_bri: 'bri_va',
  va_bca: 'bca_va',
  qris: 'qris',
  gopay: 'gopay',
  ovo: 'ovo',
  dana: 'dana',
  shopeepay: 'shopeepay',
  card: 'credit_card'
};

/** Lengkapi dan bersihkan routing tersimpan; baris yang hilang atau tidak valid memakai bawaan. */
export const normalizeRouting = (rows: unknown): RoutingEntry[] => {
  const list = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  return DEFAULT_PAYMENT_ROUTING.map((fallback) => {
    const stored = list.find((r) => r?.transactionType === fallback.transactionType && r?.method === fallback.method);
    const provider = stored?.provider as RoutingProvider | undefined;
    return provider && allowedProviders(fallback.method).includes(provider) ? { ...fallback, provider } : fallback;
  });
};

/** Metode aktif untuk satu jenis transaksi (Midtrans hanya bila server terkonfigurasi; Xendit belum terpasang). */
export const enabledRoutingMethods = (
  routing: RoutingEntry[],
  transactionType: ManagedRoutingType,
  options: { midtransEnabled: boolean }
): Array<{ method: RoutingMethod; provider: 'manual' | 'midtrans' }> =>
  normalizeRouting(routing)
    .filter((r) => r.transactionType === transactionType)
    .filter((r) => r.provider === 'manual' || (r.provider === 'midtrans' && options.midtransEnabled))
    .map((r) => ({ method: r.method, provider: r.provider as 'manual' | 'midtrans' }));

/**
 * Pembelian satuan produk digital terbuka? Checkout satuan hanya lewat Midtrans Snap, jadi minimal satu metode
 * 'digital' harus diarahkan ke Midtrans (bawaan fase 6: semua off).
 */
export const digitalUnitSalesEnabled = (routing: RoutingEntry[], options: { midtransEnabled: boolean }): boolean =>
  enabledRoutingMethods(routing, 'digital', options).some((r) => r.provider === 'midtrans');

/** Metode checkout buku cetak yang aktif, dalam urutan ROUTING_METHODS. */
export const enabledPrintMethods = (routing: RoutingEntry[], options: { midtransEnabled: boolean }): PaymentMethod[] =>
  normalizeRouting(routing)
    .filter((r) => r.transactionType === 'print')
    .filter((r) => r.provider === 'manual' || (r.provider === 'midtrans' && options.midtransEnabled))
    .map((r) => PAYMENT_METHOD_OF[r.method]);

/** Provider untuk metode pesanan cetak ('off' bila tidak aktif). */
export const printProviderFor = (routing: RoutingEntry[], method: PaymentMethod, options: { midtransEnabled: boolean }): RoutingProvider => {
  const routingMethod = ROUTING_METHOD_OF[method];
  if (!routingMethod) return 'off';
  const entry = normalizeRouting(routing).find((r) => r.transactionType === 'print' && r.method === routingMethod);
  if (!entry) return 'off';
  if (entry.provider === 'midtrans' && !options.midtransEnabled) return 'off';
  return entry.provider === 'xendit' ? 'off' : entry.provider;
};
