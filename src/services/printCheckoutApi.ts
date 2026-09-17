import { ApiError, apiUrl, fetchWithTimeout } from './apiClient';
import { clearAdminToken, getAdminToken } from './adminAuth';
import type { PaymentMethod } from '../types';
import type { PrintCheckoutSettings, ShippingFallbackMode, ShippingZone } from '../data/shippingZones';
import type { RoutingEntry } from '../data/paymentRouting';
import type { ShippingRate, ShippingRatesResponse, SignedShippingDestination } from '../data/shippingRates';

/**
 * Klien checkout buku cetak (backend/printCheckout/router.ts): konfigurasi checkout, halaman pesanan pembeli
 * (bertoken), unggah bukti transfer, dan aksi admin (konfirmasi pembayaran, ongkir manual, perpanjang, tanda uji,
 * zona ongkir, kode unik, payment_routing).
 */

export interface PrintCheckoutConfig {
  /** Cadangan saat tarif kurir tidak tersedia: tabel zona (ongkir estimasi) atau ongkir diisi admin. */
  fallbackMode: ShippingFallbackMode;
  /** true = pencarian kecamatan + tarif kurir RajaOngkir; false = cadangan (belum dikonfigurasi / kuota habis). */
  courierRates: boolean;
  provinces: string[];
  zones: ShippingZone[];
  manualQuoteMinCopies: number;
  uniqueCodeEnabled: boolean;
  transferDueHours: number;
  methods: PaymentMethod[];
  /** Transfer dari luar negeri ke rekening USD (bila ada rekening USD aktif). */
  usdTransfer?: { available: boolean; dueBusinessDays: number };
}

export interface OrderBankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string | null;
  currency?: 'IDR' | 'USD';
  swiftCode?: string | null;
}

export interface PrintOrderDetail {
  orderNumber: string;
  status: string;
  paymentMethod: string;
  language: string;
  createdAt: string | null;
  buyerName: string;
  shippingAddress: string;
  items: Array<{ bookId: string; title: string; quantity: number; unitPrice: number; subtotal: number }>;
  subtotal: number;
  shippingFee: number;
  shippingZone: string | null;
  shippingEtd?: string | null;
  /** Ongkir diisi admin karena pesanan besar (bulk) atau tarif kurir tidak tersedia (rates). */
  manualQuoteReason?: 'bulk' | 'rates';
  copies: number;
  uniqueCode: number | null;
  uniqueDiscount: number;
  total: number;
  paymentDueAt: string | null;
  paidAt: string | null;
  trackingNumber: string | null;
  bankAccounts: OrderBankAccount[];
  financeWhatsapp: string;
  whatsappText: string;
  hasProof: boolean;
  proofUploadedAt: string | null;
  canUploadProof: boolean;
  manualQuoteMinCopies: number;
  transferDueHours: number;
  /** 'USD' = pembeli membayar dari luar negeri (tanpa kode unik, batas hari kerja). */
  transferCurrency?: 'IDR' | 'USD' | null;
  transferDueBusinessDays?: number | null;
  companyName: string;
}

const TIMEOUT_MS = 60000;

const parse = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // bukan JSON
    }
    if (res.status === 401) clearAdminToken();
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
};

const adminHeaders = (json = true): Record<string, string> => {
  const token = getAdminToken();
  return {
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

const orderPath = (orderNumber: string) => `/api/orders/${encodeURIComponent(orderNumber)}`;
const adminOrderPath = (orderNumber: string) => `/api/admin/print-orders/${encodeURIComponent(orderNumber)}`;

// ------------------------------------------------------------------ publik
export const getPrintCheckoutConfig = async (): Promise<PrintCheckoutConfig> =>
  parse(await fetchWithTimeout(apiUrl('/api/print-checkout/config'), { headers: { Accept: 'application/json' } }, TIMEOUT_MS));

export const getOrderDetail = async (orderNumber: string, token: string): Promise<PrintOrderDetail> =>
  parse(await fetchWithTimeout(apiUrl(`${orderPath(orderNumber)}/detail?t=${encodeURIComponent(token)}`), { headers: { Accept: 'application/json' } }, TIMEOUT_MS));

export const searchShippingDestinations = async (query: string): Promise<SignedShippingDestination[]> =>
  (await parse<{ destinations: SignedShippingDestination[] }>(
    await fetchWithTimeout(apiUrl(`/api/shipping/destinations?q=${encodeURIComponent(query)}`), { headers: { Accept: 'application/json' } }, 20000)
  )).destinations;

export const getShippingQuote = async (body: {
  destination: SignedShippingDestination;
  items: Array<{ book_id: string; qty: number }>;
}): Promise<ShippingRatesResponse> =>
  parse(await fetchWithTimeout(apiUrl('/api/shipping/quote'), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, 30000));

export const uploadOrderProof = async (orderNumber: string, token: string, file: File): Promise<{ hasProof: boolean; proofUploadedAt: string }> => {
  const form = new FormData();
  form.append('file', file);
  return parse(await fetchWithTimeout(apiUrl(`${orderPath(orderNumber)}/proof?t=${encodeURIComponent(token)}`), { method: 'POST', body: form }, TIMEOUT_MS));
};

// ------------------------------------------------------------------- admin
const adminSend = async <T>(path: string, method: 'POST' | 'PUT' | 'PATCH', body: unknown): Promise<T> =>
  parse(await fetchWithTimeout(apiUrl(path), { method, headers: adminHeaders(), body: JSON.stringify(body ?? {}) }, TIMEOUT_MS));

const adminGet = async <T>(path: string): Promise<T> =>
  parse(await fetchWithTimeout(apiUrl(path), { headers: adminHeaders() }, TIMEOUT_MS));

export const confirmOrderPayment = (orderNumber: string, reference?: string, usdAmountReceived?: string) =>
  adminSend(`${adminOrderPath(orderNumber)}/confirm-payment`, 'POST', {
    ...(reference ? { reference } : {}),
    ...(usdAmountReceived ? { usdAmountReceived } : {})
  });

export const setOrderShippingQuote = (orderNumber: string, shippingFee: number, courier?: string) =>
  adminSend(`${adminOrderPath(orderNumber)}/shipping-quote`, 'POST', courier ? { shippingFee, courier } : { shippingFee });

export interface AdminOrderShippingRates {
  available: boolean;
  message: string | null;
  rates: ShippingRate[];
  weightGram: number | null;
  destinationLabel: string | null;
}

/** Tarif RajaOngkir untuk pesanan yang menunggu ongkir (tujuan & berat dari pesanan). */
export const getOrderShippingRates = (orderNumber: string) =>
  adminGet<AdminOrderShippingRates>(`${adminOrderPath(orderNumber)}/shipping-rates`);

export const extendOrderDeadline = (orderNumber: string) =>
  adminSend(`${adminOrderPath(orderNumber)}/extend`, 'POST', {});

export const setOrderTest = (orderNumber: string, isTest: boolean) =>
  adminSend<{ isTest: boolean }>(`${adminOrderPath(orderNumber)}/test`, 'PATCH', { isTest });

/** Bukti transfer (bucket privat) sebagai URL blob sementara untuk dibuka di tab baru. */
export const fetchOrderProofUrl = async (orderNumber: string): Promise<string> => {
  const res = await fetchWithTimeout(apiUrl(`${adminOrderPath(orderNumber)}/proof`), { headers: adminHeaders(false) }, TIMEOUT_MS);
  if (!res.ok) await parse(res);
  return URL.createObjectURL(await res.blob());
};

export const getPrintCheckoutSettings = async (): Promise<PrintCheckoutSettings> =>
  (await adminGet<{ settings: PrintCheckoutSettings }>('/api/admin/print-checkout/settings')).settings;

/** Pemakaian API RajaOngkir hari ini (tanggal WIB); warning = >= 80% kuota. */
export interface ShippingApiUsageInfo {
  date: string;
  count: number;
  limit: number;
  percent: number;
  warning: boolean;
  exhausted: boolean;
}

/** Pengaturan + status API key + pemakaian API RajaOngkir hari ini (tab Management Pengiriman). */
export const getPrintCheckoutAdmin = async (): Promise<{
  settings: PrintCheckoutSettings;
  rajaongkir: { configured: boolean };
  usage: ShippingApiUsageInfo | null;
}> => adminGet('/api/admin/print-checkout/settings');

export const savePrintCheckoutSettings = async (settings: PrintCheckoutSettings): Promise<PrintCheckoutSettings> =>
  (await adminSend<{ settings: PrintCheckoutSettings }>('/api/admin/print-checkout/settings', 'PUT', { settings })).settings;

export const getPaymentRouting = async (): Promise<RoutingEntry[]> =>
  (await adminGet<{ routing: RoutingEntry[] }>('/api/admin/payment-routing')).routing;

export const savePaymentRouting = async (routing: RoutingEntry[]): Promise<RoutingEntry[]> =>
  (await adminSend<{ routing: RoutingEntry[] }>('/api/admin/payment-routing', 'PUT', { routing })).routing;
