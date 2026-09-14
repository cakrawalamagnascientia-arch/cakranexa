/**
 * Data royalti pesanan buku cetak (fase 5 Langkah 2), dikumpulkan sejak src/db/print_orders_royalty_migration.sql.
 * Hanya menambah kolom saat pesanan disimpan ke Supabase; harga, total, respons API, dan pembayaran tidak berubah.
 *  - hje_at_sale: harga jual eceran per eksemplar saat transaksi (harga coret bila buku sedang promo, selain itu harga katalog).
 *  - discount_amount: selisih HJE dengan harga yang benar-benar dibayar (promo + harga member), per baris dan total.
 *  - tax_amount: PPN yang terkandung dalam harga buku (PPN_PERCENT, default 0 sampai status PKP dikonfirmasi).
 *  - gateway_fee_estimate: perkiraan fee payment gateway atas total pembayaran termasuk ongkir (Midtrans tidak mengirim
 *    fee sebenarnya di notifikasi); tarif per metode bayar dari GATEWAY_FEE_RATES. Transfer manual = 0.
 *  - channel: 'member' bila harga member diterapkan, selain itu 'direct'. is_test: pembeli di DIGITAL_BETA_EMAILS.
 */

export interface GatewayFeeRate {
  /** Persen dari nominal pembayaran. */
  pct: number;
  /** Biaya tetap per transaksi (Rupiah). */
  flat: number;
}

/** Perkiraan tarif per metode (bukan tagihan Midtrans sebenarnya); sesuaikan lewat GATEWAY_FEE_RATES. */
export const DEFAULT_GATEWAY_FEE_RATES: Record<string, GatewayFeeRate> = {
  bca_va: { pct: 0, flat: 4000 },
  bni_va: { pct: 0, flat: 4000 },
  bri_va: { pct: 0, flat: 4000 },
  permata_va: { pct: 0, flat: 4000 },
  mandiri_bill: { pct: 0, flat: 4000 },
  qris: { pct: 0.7, flat: 0 },
  gopay: { pct: 2, flat: 0 },
  shopeepay: { pct: 2, flat: 0 },
  ovo: { pct: 2, flat: 0 },
  dana: { pct: 2, flat: 0 },
  linkaja: { pct: 2, flat: 0 },
  credit_card: { pct: 2.9, flat: 2000 },
  manual_mandiri: { pct: 0, flat: 0 }
};

export interface PrintRoyaltyConfig {
  ppnPercent: number;
  feeRates: Record<string, GatewayFeeRate>;
}

const nonNegative = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** PPN_PERCENT (0–100, default 0) dan GATEWAY_FEE_RATES (JSON, mis. {"qris":{"pct":0.7,"flat":0}}) menimpa tarif bawaan. */
export const loadPrintRoyaltyConfig = (env: NodeJS.ProcessEnv = process.env): PrintRoyaltyConfig => {
  const ppn = nonNegative(env.PPN_PERCENT ?? 0);
  const feeRates: Record<string, GatewayFeeRate> = { ...DEFAULT_GATEWAY_FEE_RATES };
  if (env.GATEWAY_FEE_RATES) {
    try {
      const parsed = JSON.parse(env.GATEWAY_FEE_RATES) as Record<string, { pct?: unknown; flat?: unknown }>;
      for (const [method, rate] of Object.entries(parsed || {})) {
        const pct = nonNegative(rate?.pct ?? 0);
        const flat = nonNegative(rate?.flat ?? 0);
        if (pct !== null && flat !== null && pct <= 100) feeRates[method] = { pct, flat };
      }
    } catch {
      console.warn('⚠️  GATEWAY_FEE_RATES bukan JSON valid; memakai tarif bawaan.');
    }
  }
  return { ppnPercent: ppn !== null && ppn <= 100 ? ppn : 0, feeRates };
};

/** Harga jual eceran: harga coret bila buku sedang promo (lebih tinggi dari harga jual), selain itu harga katalog. */
export const hjeOf = (harga: number, originalHarga?: number | null): number =>
  originalHarga && originalHarga > harga ? originalHarga : harga;

export const estimateGatewayFee = (method: string | undefined, amount: number, rates: Record<string, GatewayFeeRate>): number => {
  const rate = method ? rates[method] : undefined;
  if (!rate || !(amount > 0)) return 0;
  return Math.round((amount * rate.pct) / 100 + rate.flat);
};

/** PPN yang sudah termasuk dalam harga (harga bruto = DPP + PPN). */
export const includedTax = (amount: number, ppnPercent: number): number =>
  ppnPercent > 0 && amount > 0 ? Math.round((amount * ppnPercent) / (100 + ppnPercent)) : 0;

export interface PrintRoyaltyInput {
  items: Array<{ harga: number; originalHarga?: number | null; unitPrice: number; quantity: number }>;
  /** Subtotal buku (tanpa ongkir). */
  subtotal: number;
  /** Total pembayaran (termasuk ongkir). */
  total: number;
  paymentMethod?: string;
  memberPrice: boolean;
  isTest: boolean;
  config: PrintRoyaltyConfig;
}

export const printOrderRoyaltyFields = (input: PrintRoyaltyInput) => {
  const items = input.items.map((item) => {
    const hje = hjeOf(item.harga, item.originalHarga);
    return { hje_at_sale: hje, discount_amount: Math.max(0, (hje - item.unitPrice) * item.quantity) };
  });
  return {
    order: {
      channel: input.memberPrice ? 'member' : 'direct',
      discount_amount: items.reduce((sum, item) => sum + item.discount_amount, 0),
      tax_amount: includedTax(input.subtotal, input.config.ppnPercent),
      gateway_fee_estimate: estimateGatewayFee(input.paymentMethod, input.total, input.config.feeRates),
      refund_status: 'none' as const,
      is_test: input.isTest
    },
    items
  };
};
