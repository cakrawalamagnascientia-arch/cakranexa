import crypto from 'crypto';
import type { Request } from 'express';
import type { Book, PaymentMethod } from '../../src/types';
import {
  DEFAULT_PRINT_CHECKOUT_SETTINGS,
  INDONESIA_PROVINCES,
  isIndonesiaProvince,
  quoteShipping,
  validatePrintCheckoutSettings,
  type PrintCheckoutSettings
} from '../../src/data/shippingZones';
import {
  DEFAULT_BOOK_WEIGHT_GRAM,
  destinationAddress,
  regionName,
  shippingRateLabel,
  sortRates,
  type ShippingDestination,
  type ShippingRate,
  type ShippingRatesResponse
} from '../../src/data/shippingRates';
import {
  allowedProviders,
  enabledPrintMethods,
  normalizeRouting,
  printProviderFor,
  ROUTING_METHODS,
  type RoutingEntry,
  type RoutingMethod,
  type RoutingProvider
} from '../../src/data/paymentRouting';
import { DEFAULT_BANK_ACCOUNTS } from '../../src/services/paymentService';
import { transferConfirmationText } from '../../src/utils/transferConfirmation';
import { toTitleCase } from '../../src/utils/formatters';
import { ORDER_NOT_SAVED_MESSAGE, placePrintOrder } from '../printOrders';
import { printOrderRoyaltyFields, type PrintRoyaltyConfig } from '../printOrderRoyalty';
import type { AssetStorage } from '../digital/storage';
import type { CompanyBankAccount } from '../digital/institution/types';
import { printOrderEmail, type PrintOrderEmailKind } from './emails';
import { fail } from './errors';
import { PROOF_CONTENT_TYPE, receiveProof } from './proofUpload';
import type { RajaOngkirClient } from './rajaongkir';
import type { ApiUsageSnapshot } from './apiUsage';
import type { PrintOrderStore } from './store';
import { pickUniqueCode, type UniqueCode } from './uniqueCode';
import {
  ADMIN_PAYABLE_STATUSES,
  PAID_STATUSES,
  PRINT_ORDER_STATUSES,
  UNPAID_STATUSES,
  type ShippingSource,
  type PrintOrderItemRow,
  type PrintOrderRow,
  type PrintOrderWithItems
} from './types';

/**
 * Checkout buku cetak:
 *  - Ongkir dihitung server, angka dari browser tidak dipercaya (berbeda -> 409, pembeli memilih ulang): tarif kurir
 *    RajaOngkir untuk kecamatan tujuan (hasil pencarian yang ditandatangani server) dan berat buku dari katalog.
 *  - Tarif kurir tidak tersedia (API key/lokasi asal belum diatur, RajaOngkir gagal/timeout, kuota harian habis):
 *    cadangan sesuai pengaturan: tabel zona (bawaan; pesanan ditandai zone_fallback dan bisa dikoreksi admin) atau
 *    tahan pesanan ("menunggu ongkir"). Pesanan >= N eksemplar dan tujuan tanpa layanan kurir selalu menunggu ongkir.
 *  - Transfer bank ke rekening PT -> awaiting_transfer dengan batas waktu (bawaan 24 jam) dan kode unik opsional;
 *    lewat batas -> expired + email; admin bisa memperpanjang.
 *  - Efek "lunas" (stok, email pembeli, masuk antrean kirim) hanya lewat markOrderPaid: konfirmasi admin dan webhook
 *    Midtrans memakai fungsi yang sama, dan update bersyarat menjamin efek hanya terjadi sekali.
 *  - Metode pembayaran mengikuti payment_routing (bawaan: hanya transfer bank).
 */

export interface PrintCheckoutDeps {
  store: PrintOrderStore;
  /** Bucket privat untuk bukti transfer; null = unggah bukti tidak tersedia. */
  storage: AssetStorage | null;
  loadCatalog(): Promise<Book[]>;
  memberPrintDiscount(authorization: string | undefined): Promise<{ percent: number; planCode: string } | null>;
  /** null = harga member tidak berlaku (harga katalog). */
  memberPrintPrice(harga: number, originalHarga: number | undefined, percent: number): number | null;
  royaltyConfig: PrintRoyaltyConfig;
  isTestBuyer(email: string): boolean;
  createSnap(order: any): Promise<string | null>;
  notifyAdmin(order: any): Promise<void>;
  sendMail(message: { to: string[]; subject: string; html: string }): Promise<void>;
  listBankAccounts(): Promise<CompanyBankAccount[]>;
  adminEmails: string[];
  midtrans: { enabled: boolean; isProduction: boolean };
  siteUrl: string;
  financeWhatsapp: string;
  companyName: string;
  /** Rahasia penanda tautan halaman pesanan (HMAC nomor pesanan). */
  tokenSecret: string;
  /** Klien RajaOngkir; null = API key belum di-set (tarif kurir tidak tersedia, checkout memakai cadangan). */
  shippingRates?: RajaOngkirClient | null;
  /** Penghitung pemakaian API harian (tampil di admin; kuota habis -> checkout memakai cadangan). */
  apiUsage?: { snapshot(): Promise<ApiUsageSnapshot> } | null;
  now?: () => Date;
  random?: () => number;
  log?: Pick<Console, 'error' | 'warn'>;
}

export type MarkPaidResult =
  | { result: 'paid'; order: PrintOrderWithItems }
  | { result: 'duplicate' | 'invalid_state' | 'amount_mismatch'; order: PrintOrderWithItems }
  | { result: 'not_found' };

/** Ongkir pesanan yang dihitung server (createOrder). */
type ShippingPlan = { source: ShippingSource; fee: number; zoneId: string | null; label: string | null; rate: ShippingRate | null };

const CACHE_MS = 60_000;
const HOUR_MS = 3_600_000;
const ORDER_NUMBER_RE = /^[A-Za-z0-9-]{4,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAYMENT_METHODS_ACCEPTED = new Set<string>([
  'bank_transfer', 'manual_mandiri', 'bca_va', 'mandiri_bill', 'bni_va', 'bri_va', 'permata_va', 'qris', 'gopay', 'ovo',
  'dana', 'shopeepay', 'linkaja', 'credit_card'
]);

const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const languagePrefix = (language: string) => (language === 'en' || language === 'zh' ? `/${language}` : '');

/** Status notifikasi Midtrans -> status pesanan cetak. */
export const mapMidtransStatus = (transactionStatus: string, fraudStatus?: string): string => {
  if (transactionStatus === 'capture') return fraudStatus === 'challenge' ? 'pending' : 'paid';
  if (transactionStatus === 'settlement') return 'paid';
  if (['cancel', 'deny', 'expire'].includes(transactionStatus)) return 'cancelled';
  if (transactionStatus === 'failure') return 'failed';
  return 'pending';
};

export class PrintCheckoutService {
  private settingsCache: { at: number; value: PrintCheckoutSettings } | null = null;
  private routingCache: { at: number; value: RoutingEntry[] } | null = null;

  constructor(private readonly deps: PrintCheckoutDeps) {}

  private now() {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private get log() {
    return this.deps.log ?? console;
  }

  get store() {
    return this.deps.store;
  }

  // ---------------------------------------------------------------- pengaturan
  async settings(): Promise<PrintCheckoutSettings> {
    if (this.settingsCache && Date.now() - this.settingsCache.at < CACHE_MS) return this.settingsCache.value;
    let value = DEFAULT_PRINT_CHECKOUT_SETTINGS;
    try {
      const stored = await this.deps.store.getSettings();
      if (stored) {
        const merged = validatePrintCheckoutSettings({ ...DEFAULT_PRINT_CHECKOUT_SETTINGS, ...stored, zones: stored.zones ?? DEFAULT_PRINT_CHECKOUT_SETTINGS.zones });
        if ('settings' in merged) value = merged.settings;
        else this.log.warn('[print] pengaturan checkout tersimpan tidak valid, memakai bawaan:', merged.error);
      }
    } catch (err: any) {
      this.log.warn('[print] gagal membaca pengaturan checkout, memakai bawaan:', err?.message || err);
    }
    this.settingsCache = { at: Date.now(), value };
    return value;
  }

  async routing(): Promise<RoutingEntry[]> {
    if (this.routingCache && Date.now() - this.routingCache.at < CACHE_MS) return this.routingCache.value;
    let value = normalizeRouting([]);
    try {
      value = normalizeRouting(await this.deps.store.getRouting());
    } catch (err: any) {
      this.log.warn('[print] gagal membaca payment_routing, memakai bawaan:', err?.message || err);
    }
    this.routingCache = { at: Date.now(), value };
    return value;
  }

  async saveSettings(input: unknown): Promise<PrintCheckoutSettings> {
    const validated = validatePrintCheckoutSettings(input);
    if ('error' in validated) throw fail(400, 'invalid_settings', validated.error);
    await this.deps.store.saveSettings(validated.settings);
    this.settingsCache = null;
    return this.settings();
  }

  async saveRouting(input: unknown): Promise<RoutingEntry[]> {
    const list = Array.isArray((input as any)?.routing) ? (input as any).routing : Array.isArray(input) ? input : null;
    if (!list) throw fail(400, 'invalid_routing', 'Daftar routing tidak valid.');
    for (const entry of list as Array<Record<string, unknown>>) {
      const method = String(entry?.method) as RoutingMethod;
      const provider = String(entry?.provider) as RoutingProvider;
      if (entry?.transactionType !== 'print' || !(ROUTING_METHODS as readonly string[]).includes(method)) {
        throw fail(400, 'invalid_routing', `Baris routing tidak dikenal: ${String(entry?.transactionType)}/${String(entry?.method)}.`);
      }
      if (!allowedProviders(method).includes(provider)) throw fail(400, 'invalid_routing', `Provider ${provider} tidak tersedia untuk ${method}.`);
    }
    const routing = normalizeRouting(list);
    await this.deps.store.saveRouting(routing);
    this.routingCache = null;
    return this.routing();
  }

  async publicConfig() {
    const [settings, routing] = await Promise.all([this.settings(), this.routing()]);
    return {
      fallbackMode: settings.fallbackMode,
      /** true = checkout menampilkan pencarian kecamatan dan tarif kurir RajaOngkir (false: cadangan). */
      courierRates: this.courierRatesAvailable(settings) && !(await this.quotaExhausted()),
      provinces: INDONESIA_PROVINCES,
      zones: settings.zones,
      manualQuoteMinCopies: settings.manualQuoteMinCopies,
      uniqueCodeEnabled: settings.uniqueCodeEnabled,
      transferDueHours: settings.transferDueHours,
      methods: enabledPrintMethods(routing, { midtransEnabled: this.deps.midtrans.enabled })
    };
  }

  // ------------------------------------------------------------ tautan pembeli
  orderToken(orderNumber: string): string {
    return crypto.createHmac('sha256', this.deps.tokenSecret).update(`print-order:${orderNumber}`).digest('base64url').slice(0, 32);
  }

  verifyToken(orderNumber: string, token: unknown): boolean {
    const expected = Buffer.from(this.orderToken(orderNumber));
    const given = Buffer.from(String(token ?? ''));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  orderPath(orderNumber: string, language: string): string {
    return `${languagePrefix(language)}/pesanan/${encodeURIComponent(orderNumber)}?t=${this.orderToken(orderNumber)}`;
  }

  async bankAccounts(): Promise<CompanyBankAccount[]> {
    try {
      const accounts = await this.deps.listBankAccounts();
      if (accounts.length > 0) return accounts;
    } catch (err: any) {
      this.log.warn('[print] gagal membaca rekening perusahaan, memakai rekening bawaan:', err?.message || err);
    }
    return DEFAULT_BANK_ACCOUNTS.filter((a) => a.isActive).map((a) => ({
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      accountHolder: a.accountHolder,
      branch: a.branch || null
    }));
  }

  // ------------------------------------------------------- ongkir RajaOngkir
  get rajaOngkirConfigured(): boolean {
    return Boolean(this.deps.shippingRates);
  }

  /** Tarif kurir dipakai checkout: API key ada dan lokasi asal sudah diatur admin. */
  courierRatesAvailable(settings: PrintCheckoutSettings): boolean {
    return Boolean(this.deps.shippingRates) && Boolean(settings.origin);
  }

  private async quotaExhausted(): Promise<boolean> {
    return Boolean((await this.apiUsage())?.exhausted);
  }

  /** Pemakaian API RajaOngkir hari ini (tab Management Pengiriman); null = RajaOngkir belum dikonfigurasi. */
  async apiUsage(): Promise<ApiUsageSnapshot | null> {
    if (!this.deps.apiUsage) return null;
    return this.deps.apiUsage.snapshot().catch((err: any) => {
      this.log.warn('[print] gagal membaca pemakaian API RajaOngkir:', err?.message || err);
      return null;
    });
  }

  private destinationToken(d: ShippingDestination): string {
    const payload = JSON.stringify([d.id, d.label, d.province, d.city, d.district, d.subdistrict, d.zipCode]);
    return crypto.createHmac('sha256', this.deps.tokenSecret).update(`ship-destination:${payload}`).digest('base64url').slice(0, 32);
  }

  /** Wilayah tujuan dari browser hanya dipakai bila tanda tangannya cocok dengan hasil pencarian server. */
  private verifiedDestination(input: unknown): ShippingDestination | null {
    const raw = (input && typeof input === 'object' ? input : null) as Record<string, unknown> | null;
    if (!raw) return null;
    const d: ShippingDestination = {
      id: Number(raw.id),
      label: String(raw.label ?? ''),
      province: String(raw.province ?? ''),
      city: String(raw.city ?? ''),
      district: String(raw.district ?? ''),
      subdistrict: String(raw.subdistrict ?? ''),
      zipCode: String(raw.zipCode ?? '')
    };
    if (!Number.isInteger(d.id) || d.id <= 0) return null;
    const expected = Buffer.from(this.destinationToken(d));
    const given = Buffer.from(String(raw.token ?? ''));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? d : null;
  }

  /** GET /api/shipping/destinations?q= : kecamatan/kelurahan/kode pos tujuan (ditandatangani). */
  async searchDestinations(query: unknown) {
    const q = text(query, 60).replace(/\s+/g, ' ');
    if (q.length < 3) throw fail(400, 'query_too_short', 'Ketik minimal 3 huruf nama kecamatan, kota, atau kode pos.');
    if (!this.deps.shippingRates) throw fail(503, 'rajaongkir_unavailable', 'Pencarian wilayah pengiriman belum tersedia.');
    try {
      const list = await this.deps.shippingRates.searchDestinations(q);
      return { destinations: list.map((d) => ({ ...d, token: this.destinationToken(d) })) };
    } catch (err: any) {
      this.log.warn('[print] pencarian wilayah RajaOngkir gagal:', err?.message || err);
      if (err?.status === 429) throw fail(503, 'rajaongkir_quota', 'Pencarian wilayah sedang tidak tersedia. Isi alamat tanpa pencarian.');
      throw fail(502, 'rajaongkir_error', 'Pencarian wilayah sedang bermasalah. Coba lagi sebentar lagi.');
    }
  }

  /** Berat kiriman: berat buku di katalog (bawaan 500 g per eksemplar) + kemasan dari pengaturan. */
  private weightOf(items: Array<{ book: Partial<Book>; quantity: number }>, settings: PrintCheckoutSettings): number {
    const books = items.reduce((sum, it) => sum + (Number(it.book.beratGram) > 0 ? Number(it.book.beratGram) : DEFAULT_BOOK_WEIGHT_GRAM) * it.quantity, 0);
    return Math.max(1, Math.round(books + settings.packagingGram));
  }

  /** Tarif kurir RajaOngkir, termurah dulu; null = tidak tersedia (belum dikonfigurasi atau API gagal). */
  private async courierRates(settings: PrintCheckoutSettings, destinationId: number, weightGram: number): Promise<ShippingRate[] | null> {
    if (!this.courierRatesAvailable(settings) || !settings.origin) return null;
    try {
      const rates = await this.deps.shippingRates!.domesticCost({ origin: settings.origin.id, destination: destinationId, weightGram, couriers: settings.couriers });
      return sortRates(rates.filter((r) => settings.couriers.includes(r.courier)));
    } catch (err: any) {
      this.log.warn('[print] tarif RajaOngkir gagal:', err?.message || err);
      return null;
    }
  }

  private cartItems(rawItems: unknown, catalog: Book[]): Array<{ book: Book; quantity: number }> {
    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 100) throw fail(400, 'invalid_items', 'Keranjang kosong.');
    return rawItems.map((it: any) => {
      const bookId = it?.book_id ?? it?.book?.id;
      const book = catalog.find((b) => b.id === bookId);
      if (!book) throw fail(400, 'book_not_found', `Buku ${bookId} tidak ditemukan di katalog.`);
      return { book, quantity: Math.max(1, Math.min(1000, Math.floor(Number(it?.qty ?? it?.quantity) || 1))) };
    });
  }

  /** POST /api/shipping/quote { destination, items[{ book_id, qty }] } : tarif kurir untuk isi keranjang (berat dari katalog). */
  async quoteRates(body: unknown): Promise<ShippingRatesResponse> {
    const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const settings = await this.settings();
    const destination = this.verifiedDestination(raw.destination);
    if (!destination) throw fail(400, 'destination_invalid', 'Pilih ulang kecamatan tujuan dari daftar pencarian.');
    const items = this.cartItems(raw.items, await this.deps.loadCatalog());
    const weightGram = this.weightOf(items, settings);
    const copies = items.reduce((sum, it) => sum + it.quantity, 0);
    if (copies >= settings.manualQuoteMinCopies) return { status: 'manual', reason: 'bulk', weightGram, rates: [] };
    const rates = await this.courierRates(settings, destination.id, weightGram);
    if (rates && rates.length > 0) return { status: 'ok', weightGram, rates };
    if (rates) return { status: 'manual', reason: 'no_service', weightGram, rates: [] };
    // Tarif kurir tidak tersedia (API gagal/timeout/kuota habis): cadangan sesuai pengaturan.
    const estimate = this.zoneFallback(settings, regionName(destination.province), regionName(destination.city), copies);
    if (estimate) return { status: 'estimate', weightGram, fee: estimate.fee, zoneName: estimate.zoneName, rates: [] };
    return { status: 'manual', reason: 'unavailable', weightGram, rates: [] };
  }

  /** Cadangan saat tarif kurir tidak tersedia: ongkir estimasi dari tabel zona (fallbackMode 'zone_table'). */
  private zoneFallback(settings: PrintCheckoutSettings, province: string, city: string, copies: number): { fee: number; zoneId: string; zoneName: string } | null {
    if (settings.fallbackMode !== 'zone_table') return null;
    const quote = quoteShipping(settings, { province, city, copies });
    return quote.kind === 'zone' ? { fee: quote.fee, zoneId: quote.zoneId, zoneName: quote.zoneName } : null;
  }

  /** Admin: tarif RajaOngkir untuk pesanan yang menunggu ongkir (tujuan & berat tersimpan di pesanan). */
  async adminOrderRates(orderId: string) {
    const order = await this.deps.store.getOrder(orderId);
    if (!order) throw fail(404, 'order_not_found', 'Pesanan tidak ditemukan.');
    const settings = await this.settings();
    const destinationLabel = order.shipping_destination_label ?? null;
    if (!order.shipping_destination_id) {
      return { available: false, message: 'Pesanan ini dibuat tanpa kecamatan RajaOngkir; cek tarif kurir secara manual.', rates: [] as ShippingRate[], weightGram: order.shipping_weight_gram ?? null, destinationLabel };
    }
    if (!this.courierRatesAvailable(settings)) {
      return { available: false, message: 'RajaOngkir belum aktif (API key atau lokasi asal belum diatur).', rates: [] as ShippingRate[], weightGram: order.shipping_weight_gram ?? null, destinationLabel };
    }
    const catalog = await this.deps.loadCatalog().catch(() => [] as Book[]);
    const weightGram = order.shipping_weight_gram
      || this.weightOf(order.order_items.map((i) => ({ book: catalog.find((b) => b.id === i.book_id) ?? {}, quantity: i.quantity })), settings);
    const rates = await this.courierRates(settings, order.shipping_destination_id, weightGram);
    if (!rates) return { available: false, message: 'Tarif RajaOngkir sedang tidak dapat dimuat. Coba lagi.', rates: [] as ShippingRate[], weightGram, destinationLabel };
    return { available: true, message: null, rates, weightGram, destinationLabel };
  }

  private async planShipping(settings: PrintCheckoutSettings, input: {
    customer: { province: string; city: string; courierCode: string; shippingService: string };
    destination: ShippingDestination | null;
    copies: number;
    weightGram: number;
    clientShipping: unknown;
  }): Promise<ShippingPlan> {
    const differs = (fee: number) => input.clientShipping !== undefined && input.clientShipping !== null && Math.round(Number(input.clientShipping)) !== fee;
    const manual: ShippingPlan = { source: 'manual', fee: 0, zoneId: null, label: null, rate: null };
    if (input.copies >= settings.manualQuoteMinCopies) return manual;
    if (input.destination) {
      const rates = await this.courierRates(settings, input.destination.id, input.weightGram);
      if (rates && rates.length > 0) {
        const chosen = rates.find((r) => r.courier === input.customer.courierCode && r.service === input.customer.shippingService);
        if (!chosen || differs(chosen.cost)) {
          throw fail(409, 'shipping_changed', 'Tarif ongkos kirim berubah. Pilih ulang layanan kurir, lalu buat pesanan lagi.');
        }
        return { source: 'rajaongkir', fee: chosen.cost, zoneId: null, label: shippingRateLabel(chosen), rate: chosen };
      }
      // Tidak ada layanan kurir ke tujuan: admin mengecek langsung.
      if (rates) return manual;
    }
    // RajaOngkir tidak tersedia (belum dikonfigurasi, gagal/timeout, kuota habis) atau alamat diisi tanpa pencarian.
    const estimate = this.zoneFallback(settings, input.customer.province, input.customer.city, input.copies);
    if (!estimate) return manual;
    if (differs(estimate.fee)) throw fail(409, 'shipping_changed', 'Ongkos kirim telah diperbarui. Muat ulang halaman untuk melihat ongkos kirim terbaru.');
    return { source: 'zone_fallback', fee: estimate.fee, zoneId: estimate.zoneId, label: estimate.zoneName, rate: null };
  }

  /** Label ongkir untuk pembeli: layanan kurir (RajaOngkir) atau nama zona. */
  private shippingLabel(order: PrintOrderRow, settings: PrintCheckoutSettings): string | null {
    if (order.shipping_source === 'rajaongkir') return order.courier ? order.courier.replace(' - ', ' ') : null;
    return settings.zones.find((z) => z.id === order.shipping_zone)?.name ?? null;
  }

  private manualQuoteReason(order: PrintOrderWithItems, settings: PrintCheckoutSettings): 'bulk' | 'rates' {
    const copies = order.copies ?? order.order_items.reduce((sum, item) => sum + item.quantity, 0);
    return copies >= settings.manualQuoteMinCopies ? 'bulk' : 'rates';
  }

  private async uniqueCodeFor(base: number, settings: PrintCheckoutSettings): Promise<UniqueCode | null> {
    if (!settings.uniqueCodeEnabled) return null;
    const open = await this.deps.store.listByStatus(['awaiting_transfer']);
    return pickUniqueCode(base, new Set(open.map((o) => Math.round(Number(o.total_amount)))), this.deps.random);
  }

  // ------------------------------------------------------------ buat pesanan
  async createOrder(body: unknown, authorization: string | undefined) {
    const order = (body && typeof body === 'object' ? body : {}) as Record<string, any>;
    const c = (order.customer && typeof order.customer === 'object' ? order.customer : {}) as Record<string, unknown>;
    const orderNumber = String(order.orderNumber ?? '');
    if (!ORDER_NUMBER_RE.test(orderNumber) || !Array.isArray(order.items) || order.items.length === 0) {
      throw fail(400, 'invalid_order', 'Pesanan tidak valid: item kosong.');
    }
    const customer = {
      name: text(c.name, 120),
      phone: text(c.phone, 40),
      email: text(c.email, 200),
      address: text(c.address, 500),
      province: text(c.province, 60),
      city: text(c.city, 80),
      district: text(c.district, 80),
      postalCode: text(c.postalCode, 10),
      courier: text(c.courier, 100),
      shippingService: text(c.shippingService, 60),
      courierCode: text(c.courierCode, 20).toLowerCase(),
      notes: text(c.notes, 500)
    };
    const [settings, routing] = await Promise.all([this.settings(), this.routing()]);
    // Wilayah tujuan dari pencarian RajaOngkir harus bertanda tangan server; tanpa wilayah (pencarian tidak tersedia)
    // pesanan memakai provinsi/kota dan ongkir cadangan.
    const destination = c.destination ? this.verifiedDestination(c.destination) : null;
    if (c.destination && !destination) throw fail(400, 'destination_invalid', 'Pilih ulang kecamatan tujuan pengiriman dari daftar pencarian.');
    if (destination) {
      customer.province = regionName(destination.province).slice(0, 60);
      customer.city = regionName(destination.city).slice(0, 80);
      customer.district = regionName(destination.district).slice(0, 80);
      customer.postalCode = destination.zipCode || customer.postalCode || '-';
    }
    if (!customer.name || !customer.phone || !EMAIL_RE.test(customer.email) || !customer.address || !customer.city || !customer.postalCode) {
      throw fail(400, 'customer_incomplete', 'Data pelanggan belum lengkap.');
    }
    if (!destination && !isIndonesiaProvince(customer.province)) throw fail(400, 'invalid_province', 'Pilih provinsi tujuan pengiriman.');
    if (await this.deps.store.getOrder(orderNumber)) throw fail(409, 'duplicate_order', 'Nomor pesanan sudah terdaftar.');

    const requested = String(order.paymentMethod || 'bank_transfer');
    const method = (requested === 'manual_mandiri' ? 'bank_transfer' : requested) as PaymentMethod;
    const provider = PAYMENT_METHODS_ACCEPTED.has(method) ? printProviderFor(routing, method, { midtransEnabled: this.deps.midtrans.enabled }) : 'off';
    if (provider === 'off') throw fail(400, 'method_unavailable', 'Metode pembayaran ini sedang tidak tersedia. Muat ulang halaman.');

    // Harga member (fase 3 Langkah 7) untuk anggota aktif yang mengirim token login; selain itu harga katalog.
    const memberDiscount = await this.deps.memberPrintDiscount(authorization);
    const catalog = await this.deps.loadCatalog();
    let subtotal = 0;
    const items = (order.items as any[]).map((it) => {
      const book = catalog.find((b) => b.id === it?.book?.id);
      if (!book) throw fail(400, 'book_not_found', `Buku ${it?.book?.id} tidak ditemukan di katalog.`);
      const quantity = Math.max(1, Math.min(1000, Math.floor(Number(it.quantity) || 1)));
      if (!book.harga || book.harga <= 0) throw fail(400, 'book_unavailable', `"${book.name}" belum dapat dipesan (harga belum ditetapkan / segera terbit).`);
      if (typeof book.stock === 'number' && book.stock < quantity) throw fail(409, 'out_of_stock', `Stok "${book.name}" tidak mencukupi (tersisa ${book.stock}).`);
      const unitPrice = memberDiscount ? this.deps.memberPrintPrice(book.harga, book.originalHarga, memberDiscount.percent) : null;
      subtotal += (unitPrice ?? book.harga) * quantity;
      return unitPrice !== null ? { book, quantity, unitPrice } : { book, quantity };
    });

    const copies = items.reduce((sum, it) => sum + it.quantity, 0);
    const weightGram = this.weightOf(items, settings);
    const plan = await this.planShipping(settings, { customer, destination, copies, weightGram, clientShipping: order.shippingCost });
    const shippingFee = plan.fee;

    // Pesanan besar dan pesanan yang tarif kurirnya belum tersedia lewat transfer setelah admin mengisi ongkir.
    const manualQuote = plan.source === 'manual';
    const transfer = provider === 'manual' || manualQuote;
    const status = manualQuote ? 'awaiting_shipping_quote' : transfer ? 'awaiting_transfer' : 'pending';
    const paymentMethod: PaymentMethod = transfer ? 'bank_transfer' : method;
    const unique = status === 'awaiting_transfer' ? await this.uniqueCodeFor(subtotal + shippingFee, settings) : null;
    const total = subtotal + shippingFee - (unique?.discount ?? 0);
    const now = this.now();
    const nowIso = now.toISOString();
    const dueAt = status === 'awaiting_transfer' ? new Date(now.getTime() + settings.transferDueHours * HOUR_MS).toISOString() : null;
    const language = ['id', 'en', 'zh'].includes(order.language) ? String(order.language) : 'id';

    const royalty = printOrderRoyaltyFields({
      items: items.map(({ book, quantity, unitPrice }: any) => ({ harga: book.harga, originalHarga: book.originalHarga, unitPrice: unitPrice ?? book.harga, quantity })),
      subtotal,
      total,
      paymentMethod,
      memberPrice: Boolean(memberDiscount),
      isTest: this.deps.isTestBuyer(customer.email),
      config: this.deps.royaltyConfig
    });

    // Bentuk yang dipakai pembuat Snap dan email "Pesanan Baru" ke admin (tidak berubah dari sebelumnya).
    const normalized = {
      orderNumber,
      items,
      subtotal,
      shippingCost: shippingFee,
      total,
      customer,
      paymentMethod,
      paymentStatus: status,
      language,
      createdAt: nowIso,
      ...(memberDiscount ? { memberDiscount } : {})
    };

    const row: PrintOrderRow = {
      order_id: orderNumber,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_email: customer.email,
      shipping_address: `${customer.address}, ${destination
        ? destinationAddress(destination)
        : `${customer.district ? customer.district + ', ' : ''}${customer.city}, ${customer.province}`} (${customer.postalCode})`,
      courier: plan.rate ? `${plan.rate.courierName} - ${plan.rate.service}` : `${customer.courier || '-'} - ${customer.shippingService || 'Reguler'}`,
      shipping_fee: shippingFee,
      total_amount: total,
      payment_method: paymentMethod,
      payment_status: status,
      va_number: null,
      payment_proof_url: null,
      tracking_number: typeof order.trackingNumber === 'string' ? order.trackingNumber.slice(0, 100) : null,
      customer_notes: customer.notes || null,
      language,
      ...royalty.order,
      province: customer.province,
      city: customer.city,
      shipping_zone: plan.zoneId,
      shipping_source: plan.source,
      shipping_destination_id: destination?.id ?? null,
      shipping_destination_label: destination?.label ?? null,
      shipping_weight_gram: weightGram,
      shipping_etd: plan.rate?.etd || null,
      copies,
      subtotal_amount: subtotal,
      unique_code: unique?.code ?? null,
      unique_discount: unique?.discount ?? 0,
      payment_due_at: dueAt,
      paid_at: null,
      payment_confirmed_by: null,
      payment_reference: null,
      expired_at: null,
      due_extended_count: 0,
      payment_proof_path: null,
      payment_proof_uploaded_at: null,
      shipping_quoted_at: null,
      created_at: nowIso
    };
    const itemRows: PrintOrderItemRow[] = items.map(({ book, quantity, unitPrice }: any, index: number) => ({
      order_id: orderNumber,
      book_id: book.id,
      quantity,
      unit_price: unitPrice ?? book.harga,
      subtotal: (unitPrice ?? book.harga) * quantity,
      ...royalty.items[index]
    }));

    // Simpan dulu; Snap (hanya pesanan gateway) dan email admin dibuat setelah orders + order_items tersimpan.
    const placed = await placePrintOrder({
      db: this.deps.store,
      createSnap: status === 'pending' ? this.deps.createSnap : async () => null,
      notifyAdmin: this.deps.notifyAdmin,
      log: this.log
    }, normalized, { order: row as unknown as Record<string, unknown>, items: itemRows as unknown as Record<string, unknown>[] });
    if (!placed.ok) throw fail(placed.status, 'order_not_saved', placed.error);

    if (status !== 'pending') {
      await this.emailBuyer(status === 'awaiting_shipping_quote' ? 'awaitingQuote' : 'instructions', { ...row, order_items: itemRows });
    }

    return {
      success: true,
      orderId: orderNumber,
      orderNumber,
      accessToken: this.orderToken(orderNumber),
      orderPath: this.orderPath(orderNumber, language),
      paymentStatus: status,
      paymentMethod,
      subtotal,
      shippingCost: shippingFee,
      shippingZone: plan.label,
      shippingSource: plan.source,
      shippingEtd: plan.rate?.etd || null,
      manualShippingQuote: manualQuote,
      uniqueCode: unique?.code ?? null,
      uniqueDiscount: unique?.discount ?? 0,
      total,
      paymentDueAt: dueAt,
      snapToken: placed.snapToken,
      paymentMode: placed.snapToken ? (this.deps.midtrans.isProduction ? 'midtrans_production' : 'midtrans_sandbox') : transfer ? 'manual' : 'unavailable',
      ...(memberDiscount ? { memberDiscount } : {})
    };
  }

  // ----------------------------------------------------------- lunas & efek
  /**
   * Satu-satunya jalan ke status "paid": update bersyarat (hanya dari status belum lunas), lalu efek lunas sekali:
   * stok berkurang (buku yang stoknya dikelola) dan email konfirmasi ke pembeli. Pesanan lunas masuk antrean kirim
   * di tab Pesanan & Dispatcher.
   */
  async markOrderPaid(orderId: string, info: { by: string; reference?: string | null; amount?: number; allowClosed?: boolean }): Promise<MarkPaidResult> {
    const order = await this.deps.store.getOrder(orderId);
    if (!order) return { result: 'not_found' };
    if (info.amount !== undefined && Math.round(Number(order.total_amount)) !== Math.round(info.amount)) return { result: 'amount_mismatch', order };
    const from = info.allowClosed ? ADMIN_PAYABLE_STATUSES : UNPAID_STATUSES;
    const updated = await this.deps.store.updateOrder(orderId, {
      payment_status: 'paid',
      paid_at: this.now().toISOString(),
      payment_confirmed_by: info.by.slice(0, 100),
      payment_reference: info.reference ? String(info.reference).slice(0, 200) : null,
      expired_at: null
    }, from);
    if (!updated) return { result: PAID_STATUSES.includes(order.payment_status) ? 'duplicate' : 'invalid_state', order };
    const paid: PrintOrderWithItems = { ...order, ...updated, order_items: order.order_items };
    await this.decrementStock(order.order_items);
    await this.emailBuyer('paid', paid);
    return { result: 'paid', order: paid };
  }

  private async decrementStock(items: PrintOrderItemRow[]) {
    const catalog = await this.deps.loadCatalog().catch(() => [] as Book[]);
    for (const item of items) {
      const book = catalog.find((b) => b.id === item.book_id);
      if (typeof book?.stock !== 'number') continue; // stok tidak dikelola untuk buku ini
      try {
        await this.deps.store.decrementStock(item.book_id, item.quantity);
      } catch (err: any) {
        this.log.error('[print] gagal mengurangi stok:', { bookId: item.book_id, error: err?.message || err });
      }
    }
  }

  async confirmPayment(orderId: string, body: Record<string, unknown>) {
    const result = await this.markOrderPaid(orderId, { by: 'admin', reference: text(body?.reference, 200) || null, allowClosed: true });
    if (result.result === 'not_found') throw fail(404, 'order_not_found', 'Pesanan tidak ditemukan.');
    if (result.result === 'duplicate') throw fail(409, 'already_paid', 'Pembayaran pesanan ini sudah dikonfirmasi.');
    if (result.result !== 'paid') throw fail(409, 'invalid_state', result.order.payment_status === 'awaiting_shipping_quote'
      ? 'Isi ongkos kirim terlebih dahulu sebelum mengonfirmasi pembayaran.'
      : `Pesanan berstatus ${result.order.payment_status} tidak dapat dikonfirmasi.`);
    return { order: this.adminRow(result.order) };
  }

  // ------------------------------------------------------ batas waktu transfer
  private async expireRow(order: PrintOrderRow): Promise<PrintOrderRow | null> {
    if (order.payment_status !== 'awaiting_transfer' || !order.payment_due_at) return null;
    const now = this.now();
    if (Date.parse(order.payment_due_at) > now.getTime()) return null;
    const updated = await this.deps.store.updateOrder(order.order_id, { payment_status: 'expired', expired_at: now.toISOString() }, ['awaiting_transfer']);
    if (!updated) return null;
    const full = await this.deps.store.getOrder(order.order_id);
    await this.emailBuyer('expired', full ?? { ...order, ...updated, order_items: [] });
    return updated;
  }

  /** Job (tiap 15 menit + POST /api/internal/cron): tutup pesanan transfer yang lewat batas waktu. */
  async expireOverdue(): Promise<{ checked: number; expired: number }> {
    const open = await this.deps.store.listByStatus(['awaiting_transfer']);
    let expired = 0;
    for (const order of open) {
      try {
        if (await this.expireRow(order)) expired += 1;
      } catch (err: any) {
        this.log.error('[print] gagal menutup pesanan kedaluwarsa:', { orderId: order.order_id, error: err?.message || err });
      }
    }
    return { checked: open.length, expired };
  }

  runJob() {
    return this.expireOverdue();
  }

  private async withLazyExpiry(order: PrintOrderWithItems): Promise<PrintOrderWithItems> {
    const expired = await this.expireRow(order).catch(() => null);
    return expired ? { ...order, ...expired, order_items: order.order_items } : order;
  }

  async extendDeadline(orderId: string, body: Record<string, unknown>) {
    const settings = await this.settings();
    const hours = body?.hours === undefined ? settings.transferDueHours : Number(body.hours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw fail(400, 'invalid_hours', 'Perpanjangan harus 1–168 jam.');
    const order = await this.deps.store.getOrder(orderId);
    if (!order) throw fail(404, 'order_not_found', 'Pesanan tidak ditemukan.');
    if (!['awaiting_transfer', 'expired'].includes(order.payment_status)) throw fail(409, 'invalid_state', 'Hanya pesanan yang menunggu transfer atau kedaluwarsa yang bisa diperpanjang.');
    const nowMs = this.now().getTime();
    const base = Math.max(nowMs, order.payment_due_at ? Date.parse(order.payment_due_at) : nowMs);
    const updated = await this.deps.store.updateOrder(orderId, {
      payment_status: 'awaiting_transfer',
      payment_due_at: new Date(base + hours * HOUR_MS).toISOString(),
      expired_at: null,
      due_extended_count: (order.due_extended_count ?? 0) + 1
    }, ['awaiting_transfer', 'expired']);
    if (!updated) throw fail(409, 'state_changed', 'Status pesanan berubah. Muat ulang.');
    const extended = { ...order, ...updated, order_items: order.order_items };
    await this.emailBuyer('extended', extended);
    return { order: this.adminRow(extended) };
  }

  // -------------------------------------------------------- ongkir manual
  async setShippingQuote(orderId: string, body: Record<string, unknown>) {
    const fee = Number(body?.shippingFee);
    if (!Number.isInteger(fee) || fee < 0 || fee > 10_000_000) throw fail(400, 'invalid_fee', 'Ongkos kirim harus angka bulat Rupiah (0–10.000.000).');
    const order = await this.deps.store.getOrder(orderId);
    if (!order) throw fail(404, 'order_not_found', 'Pesanan tidak ditemukan.');
    // Koreksi: pesanan berongkir estimasi (zone_fallback) yang belum dibayar ditagih ulang dengan ongkir sebenarnya.
    const correcting = order.shipping_source === 'zone_fallback' && ['awaiting_transfer', 'expired'].includes(order.payment_status);
    if (order.payment_status !== 'awaiting_shipping_quote' && !correcting) throw fail(409, 'invalid_state', 'Pesanan ini tidak sedang menunggu ongkos kirim.');
    const settings = await this.settings();
    const subtotal = Number(order.subtotal_amount ?? order.total_amount);
    const unique = await this.uniqueCodeFor(subtotal + fee, settings);
    const now = this.now();
    const updated = await this.deps.store.updateOrder(orderId, {
      shipping_fee: fee,
      total_amount: subtotal + fee - (unique?.discount ?? 0),
      unique_code: unique?.code ?? null,
      unique_discount: unique?.discount ?? 0,
      payment_method: 'bank_transfer',
      gateway_fee_estimate: 0,
      payment_status: 'awaiting_transfer',
      payment_due_at: new Date(now.getTime() + settings.transferDueHours * HOUR_MS).toISOString(),
      shipping_quoted_at: now.toISOString(),
      shipping_source: 'manual',
      expired_at: null
    }, correcting ? ['awaiting_transfer', 'expired'] : ['awaiting_shipping_quote']);
    if (!updated) throw fail(409, 'state_changed', 'Status pesanan berubah. Muat ulang.');
    const quoted = { ...order, ...updated, order_items: order.order_items };
    await this.emailBuyer('quoted', quoted);
    // Kurir yang dipilih admin (mis. dari daftar tarif RajaOngkir) dicatat untuk Dispatcher.
    const courier = text(body?.courier, 100);
    if (courier) await this.deps.store.updateOrder(orderId, { courier });
    return { order: this.adminRow(quoted) };
  }

  // ------------------------------------------------------------- admin lain
  adminRow(order: PrintOrderWithItems) {
    return { ...order, has_proof: Boolean(order.payment_proof_path) };
  }

  async adminList() {
    await this.expireOverdue().catch((err) => this.log.warn('[print] pemeriksaan kedaluwarsa gagal:', err?.message || err));
    return (await this.deps.store.listOrders()).map((order) => this.adminRow(order));
  }

  /** PATCH /api/orders/:id (dropdown status & nomor resi di Dispatcher). Status lunas selalu lewat markOrderPaid. */
  async adminUpdate(orderId: string, body: Record<string, unknown>) {
    const order = await this.deps.store.getOrder(orderId);
    if (!order) throw fail(404, 'order_not_found', 'Pesanan tidak ditemukan.');
    const paymentStatus = body?.paymentStatus as string | undefined;
    if (paymentStatus !== undefined && !(PRINT_ORDER_STATUSES as readonly string[]).includes(paymentStatus)) {
      throw fail(400, 'invalid_status', `paymentStatus harus salah satu dari: ${PRINT_ORDER_STATUSES.join(', ')}`);
    }
    let current = order.payment_status;
    if (paymentStatus && PAID_STATUSES.includes(paymentStatus) && !PAID_STATUSES.includes(current)) {
      if (current === 'awaiting_shipping_quote') throw fail(409, 'invalid_state', 'Isi ongkos kirim terlebih dahulu sebelum mengonfirmasi pembayaran.');
      const paid = await this.markOrderPaid(orderId, { by: 'admin', allowClosed: true });
      if (paid.result === 'paid') current = 'paid';
    }
    const patch: Partial<PrintOrderRow> = {};
    if (paymentStatus && paymentStatus !== current) patch.payment_status = paymentStatus;
    if (body?.trackingNumber !== undefined) patch.tracking_number = body.trackingNumber ? text(body.trackingNumber, 100) : null;
    if (Object.keys(patch).length > 0) await this.deps.store.updateOrder(orderId, patch);
    return { success: true, message: 'Status pesanan berhasil diperbarui' };
  }

  async setTest(orderId: string, body: Record<string, unknown>) {
    if (typeof body?.isTest !== 'boolean') throw fail(400, 'invalid_request', 'isTest harus true atau false.');
    const updated = await this.deps.store.updateOrder(orderId, { is_test: body.isTest });
    if (!updated) throw fail(404, 'order_not_found', 'Pesanan tidak ditemukan.');
    return { isTest: Boolean(updated.is_test) };
  }

  // ---------------------------------------------------------------- pembeli
  async publicStatus(orderId: string) {
    const found = await this.deps.store.getOrder(orderId);
    if (!found) throw fail(404, 'order_not_found', 'Pesanan tidak ditemukan');
    const order = await this.withLazyExpiry(found);
    return { orderNumber: orderId, paymentStatus: order.payment_status, trackingNumber: order.tracking_number ?? null };
  }

  private async authorizedOrder(orderId: string, token: unknown): Promise<PrintOrderWithItems> {
    const order = this.verifyToken(orderId, token) ? await this.deps.store.getOrder(orderId) : null;
    if (!order) throw fail(404, 'order_not_found', 'Pesanan tidak ditemukan. Buka tautan dari email pesanan Anda.');
    return order;
  }

  /** Halaman pesanan pembeli (/pesanan/<nomor>?t=...): instruksi transfer, status, dan bukti transfer. */
  async orderDetail(orderId: string, token: unknown) {
    const order = await this.withLazyExpiry(await this.authorizedOrder(orderId, token));
    const [catalog, settings] = await Promise.all([this.deps.loadCatalog().catch(() => [] as Book[]), this.settings()]);
    const showPayment = ['awaiting_transfer', 'expired'].includes(order.payment_status);
    const total = Math.round(Number(order.total_amount));
    return {
      orderNumber: order.order_id,
      status: order.payment_status,
      paymentMethod: order.payment_method,
      language: order.language,
      createdAt: order.created_at ?? null,
      buyerName: order.customer_name,
      shippingAddress: order.shipping_address,
      items: order.order_items.map((item) => ({
        bookId: item.book_id,
        title: toTitleCase(catalog.find((b) => b.id === item.book_id)?.name || item.book_id),
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        subtotal: Number(item.subtotal)
      })),
      subtotal: Number(order.subtotal_amount ?? Number(order.total_amount) - Number(order.shipping_fee || 0) + Number(order.unique_discount || 0)),
      shippingFee: Number(order.shipping_fee || 0),
      shippingZone: this.shippingLabel(order, settings),
      shippingEtd: order.shipping_source === 'rajaongkir' ? order.shipping_etd ?? null : null,
      manualQuoteReason: this.manualQuoteReason(order, settings),
      copies: order.copies ?? order.order_items.reduce((sum, item) => sum + item.quantity, 0),
      uniqueCode: order.unique_code ?? null,
      uniqueDiscount: Number(order.unique_discount || 0),
      total,
      paymentDueAt: order.payment_due_at ?? null,
      paidAt: order.paid_at ?? null,
      trackingNumber: order.tracking_number ?? null,
      bankAccounts: showPayment ? await this.bankAccounts() : [],
      financeWhatsapp: this.deps.financeWhatsapp,
      whatsappText: transferConfirmationText({ orderNumber: order.order_id, amount: total, buyerName: order.customer_name }),
      hasProof: Boolean(order.payment_proof_path),
      proofUploadedAt: order.payment_proof_uploaded_at ?? null,
      canUploadProof: showPayment && Boolean(this.deps.storage),
      manualQuoteMinCopies: settings.manualQuoteMinCopies,
      transferDueHours: settings.transferDueHours,
      companyName: this.deps.companyName
    };
  }

  async uploadProof(orderId: string, token: unknown, req: Request) {
    const order = await this.authorizedOrder(orderId, token);
    if (PAID_STATUSES.includes(order.payment_status)) throw fail(409, 'already_paid', 'Pembayaran pesanan ini sudah dikonfirmasi.');
    if (!['awaiting_transfer', 'expired'].includes(order.payment_status)) throw fail(409, 'invalid_state', 'Pesanan ini belum menunggu transfer.');
    if (!this.deps.storage) throw fail(503, 'upload_unavailable', 'Unggah bukti sedang tidak tersedia. Kirim bukti lewat WhatsApp Finance.');
    const file = await receiveProof(req);
    const objectPath = `print-order-proofs/${order.order_id}/${this.now().getTime()}-${crypto.randomBytes(4).toString('hex')}.${file.extension}`;
    await this.deps.storage.upload(objectPath, file.buffer, PROOF_CONTENT_TYPE[file.extension]);
    const uploadedAt = this.now().toISOString();
    await this.deps.store.updateOrder(orderId, { payment_proof_path: objectPath, payment_proof_uploaded_at: uploadedAt });
    if (this.deps.adminEmails.length > 0) {
      this.deps.sendMail({
        to: this.deps.adminEmails,
        subject: `[Bukti Transfer] ${order.order_id} - ${order.customer_name}`,
        html: `<p>Pembeli mengunggah bukti transfer untuk pesanan <strong>${order.order_id}</strong> (${order.customer_name}).</p>` +
          `<p>Nominal tagihan: <strong>Rp${new Intl.NumberFormat('id-ID').format(Number(order.total_amount))}</strong>.</p>` +
          '<p>Buka tab Pesanan &amp; Dispatcher di dasbor admin untuk melihat bukti dan mengonfirmasi pembayaran.</p>'
      }).catch((err) => this.log.warn('[print] email bukti transfer ke admin gagal:', err?.message || err));
    }
    return { hasProof: true, proofUploadedAt: uploadedAt };
  }

  async adminProof(orderId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const order = await this.deps.store.getOrder(orderId);
    if (!order) throw fail(404, 'order_not_found', 'Pesanan tidak ditemukan.');
    if (!order.payment_proof_path) throw fail(404, 'proof_not_found', 'Belum ada bukti transfer.');
    if (!this.deps.storage) throw fail(503, 'storage_unavailable', 'Penyimpanan bukti tidak tersedia.');
    const extension = order.payment_proof_path.split('.').pop() || '';
    return { buffer: await this.deps.storage.download(order.payment_proof_path), contentType: PROOF_CONTENT_TYPE[extension] || 'application/octet-stream' };
  }

  // ------------------------------------------------------------- Midtrans
  /** Notifikasi Midtrans pesanan cetak (signature sudah diverifikasi server.ts). */
  async handleMidtransNotification(n: Record<string, any>): Promise<{ status: number; body: Record<string, unknown> }> {
    const orderId = String(n.order_id ?? '');
    const transactionStatus = String(n.transaction_status ?? '');
    if (['refund', 'partial_refund', 'chargeback', 'partial_chargeback'].includes(transactionStatus)) {
      // Refund cetak ditangani manual oleh admin (fase 5 mencatat refund_status); status pesanan tidak diubah.
      this.log.warn(`[print] notifikasi ${transactionStatus} untuk ${orderId}: tangani refund secara manual.`);
      return { status: 200, body: { status: 'ignored' } };
    }
    const target = mapMidtransStatus(transactionStatus, n.fraud_status);
    if (target === 'paid') {
      const result = await this.markOrderPaid(orderId, { by: 'midtrans', reference: n.transaction_id ?? null, amount: Math.round(Number(n.gross_amount)) });
      if (result.result === 'not_found') return { status: 404, body: { error: 'Pesanan tidak ditemukan' } };
      if (result.result === 'amount_mismatch') {
        this.log.error('[print] nominal notifikasi Midtrans tidak sama dengan total pesanan:', { orderId, grossAmount: n.gross_amount, total: result.order.total_amount });
        return { status: 400, body: { error: 'Nominal tidak sesuai' } };
      }
      return { status: 200, body: { status: 'success', result: result.result } };
    }
    // Status lain hanya mengubah pesanan yang masih pending (notifikasi terlambat tidak menimpa pesanan lunas).
    if (target !== 'pending') await this.deps.store.updateOrder(orderId, { payment_status: target }, ['pending']);
    return { status: 200, body: { status: 'success', received: true } };
  }

  // ------------------------------------------------------------------ email
  private async emailBuyer(kind: PrintOrderEmailKind, order: PrintOrderWithItems) {
    try {
      const [catalog, settings, bankAccounts] = await Promise.all([
        this.deps.loadCatalog().catch(() => [] as Book[]),
        this.settings(),
        ['instructions', 'quoted', 'extended'].includes(kind) ? this.bankAccounts() : Promise.resolve([] as CompanyBankAccount[])
      ]);
      const total = Math.round(Number(order.total_amount));
      const { subject, html } = printOrderEmail(kind, {
        language: order.language,
        orderNumber: order.order_id,
        buyerName: order.customer_name,
        items: order.order_items.map((item) => ({
          title: toTitleCase(catalog.find((b) => b.id === item.book_id)?.name || item.book_id),
          quantity: item.quantity,
          subtotal: Number(item.subtotal)
        })),
        subtotal: Number(order.subtotal_amount ?? total - Number(order.shipping_fee || 0) + Number(order.unique_discount || 0)),
        shippingFee: Number(order.shipping_fee || 0),
        shippingZone: this.shippingLabel(order, settings),
        uniqueCode: order.unique_code ?? null,
        uniqueDiscount: Number(order.unique_discount || 0),
        total,
        dueAt: order.payment_due_at ?? null,
        dueHours: settings.transferDueHours,
        manualQuoteMinCopies: settings.manualQuoteMinCopies,
        manualQuoteReason: this.manualQuoteReason(order, settings),
        bankAccounts,
        financeWhatsapp: this.deps.financeWhatsapp,
        orderUrl: `${this.deps.siteUrl.replace(/\/$/, '')}${this.orderPath(order.order_id, order.language)}`,
        companyName: this.deps.companyName,
        trackingNumber: order.tracking_number
      });
      await this.deps.sendMail({ to: [order.customer_email], subject, html });
    } catch (err: any) {
      this.log.error(`[print] email ${kind} ke pembeli gagal:`, { orderId: order.order_id, error: err?.message || err });
    }
  }
}

export { ORDER_NOT_SAVED_MESSAGE };
