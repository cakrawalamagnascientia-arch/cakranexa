import { DigitalApiError, jsonBody, memberBlob, memberRequest } from './digitalApi';

/**
 * Klien API keanggotaan fase 3 (backend/digital/membership/router.ts). Paket dibaca dari server (tabel plans),
 * sehingga harga, kuota Founding, dan manfaat yang tampil selalu sama dengan yang ditagih.
 * Tidak ada data kartu di sini: pembayaran lewat Midtrans Snap dengan token dari server.
 */

export type PlanCode = 'free' | 'reader' | 'professional' | 'author';
export type BillingCycle = 'monthly' | 'yearly';
export type PaymentMethod = 'card' | 'gopay' | 'va' | 'qris';
export type ShelfAccess = 'none' | 'pick' | 'full';
export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'grace' | 'canceled' | 'expired';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'failed' | 'void';

export const PAYMENT_METHODS: PaymentMethod[] = ['va', 'qris', 'card', 'gopay'];

export interface PublicPlan {
  code: PlanCode;
  name: { id: string; en: string };
  priceMonthly: number;
  priceYearly: number;
  /** remaining null = belum diketahui (data cadangan tanpa server). */
  founding: { priceYearly: number; cap: number; remaining: number | null } | null;
  maxDevices: number;
  shelfAccess: ShelfAccess;
  printDiscountPercent: number;
  benefits: string[];
}

export interface MembershipFlags {
  autodebit: boolean;
  printDiscount: boolean;
  readerPick: boolean;
  authorShelf: boolean;
  extendedBenefits: boolean;
  graceDays: number;
  /** Pengingat WhatsApp tersedia (gateway terpasang di server). */
  whatsapp: boolean;
  /** Nomor resmi pengirim pengingat, mis. "+62 852 8614 6806". */
  whatsappSender: string | null;
}

export interface MembershipPlans {
  plans: PublicPlan[];
  flags: MembershipFlags;
  paymentAvailable: boolean;
  /** Pendaftaran dibuka (flag fitur digital atau email beta). */
  purchaseEnabled: boolean;
  current: { planCode: PlanCode | null; billingCycle: BillingCycle; status: SubscriptionStatus; cancelAtPeriodEnd: boolean } | null;
  foundingEligible: boolean;
}

export interface MembershipInvoice {
  id: string;
  orderRef: string;
  kind: 'initial' | 'renewal' | 'upgrade' | 'manual';
  planCode: PlanCode | null;
  billingCycle: BillingCycle;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: InvoiceStatus;
  isFoundingPrice: boolean;
  issuedAt: string | null;
  paidAt: string | null;
  dueAt: string | null;
  paymentType: string | null;
  snapToken: string | null;
  redirectUrl: string | null;
}

export interface MembershipSubscription {
  id: string;
  planCode: PlanCode | null;
  planName: { id: string; en: string } | null;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  isFounding: boolean;
  priceLocked: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  accessEndsAt: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  paymentMethod: PaymentMethod | 'other';
  autodebit: boolean;
  /** Nomor WhatsApp anggota (628…) bila pengingat WhatsApp aktif. */
  whatsappNumber: string | null;
  whatsappOptIn: boolean;
  foundingEndsAt: string | null;
  regularYearlyPrice: number | null;
  pendingChange: { planCode: PlanCode | null; billingCycle: BillingCycle; effectiveAt: string | null } | null;
  nextRenewal: { date: string | null; amount: number; planCode: PlanCode; billingCycle: BillingCycle } | null;
  maxDevices: number | null;
  shelfAccess: ShelfAccess;
  createdAt: string;
}

export interface MyMembership {
  subscription: MembershipSubscription | null;
  invoices: MembershipInvoice[];
  openInvoice: MembershipInvoice | null;
  printDiscountPercent: number;
  autodebitAvailable: boolean;
}

export interface ShelfCard {
  productId: string;
  format: 'ebook' | 'audiobook';
  bookId: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string;
  pageCount: number | null;
  durationSeconds: number | null;
  shelfEntryDate: string | null;
  purchasable: boolean;
  price: number;
  progress: { position: number; percent: number; updatedAt: string } | null;
}

export interface PickOptions {
  enabled: boolean;
  slot: { start: string; end: string } | null;
  current: { productId: string; periodStart: string; periodEnd: string } | null;
  options: ShelfCard[];
}

export interface MembershipShelf {
  membership: MembershipSubscription | null;
  access: ShelfAccess;
  accessEndsAt: string | null;
  items: ShelfCard[];
  upcoming: ShelfCard[];
  pick: PickOptions;
}

export interface PlanChangeResult {
  mode: 'immediate' | 'scheduled';
  invoice: MembershipInvoice | null;
  applied?: boolean;
  credit: number;
  price: number;
  subscription: MembershipSubscription;
}

/** Kode error server (dipetakan ke teks terjemahan), 'network', atau 'unknown'. */
export const membershipErrorCode = (err: unknown): string => (err instanceof DigitalApiError ? err.code : 'unknown');

export const getMembershipPlans = () => memberRequest<MembershipPlans>('/api/membership/plans', { timeoutMs: 15000 });

/** Nomor seluler Indonesia yang diterima server (08…, 628…, +62 8…); spasi dan tanda hubung diabaikan. */
export const isValidWhatsAppNumber = (value: string): boolean => /^(\+?62|0)8\d{7,11}$/.test(value.trim().replace(/[\s().-]/g, ''));

/** "6281234567890" -> "+62 812 3456 7890". */
export const formatWhatsAppNumber = (digits: string | null): string =>
  digits ? `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)} ${digits.slice(9)}`.trim() : '';

export const updateMembershipWhatsApp = (optIn: boolean, whatsappNumber: string) =>
  memberRequest<{ subscription: MembershipSubscription }>('/api/membership/whatsapp', {
    method: 'POST',
    body: jsonBody({ opt_in: optIn, whatsapp_number: whatsappNumber })
  });

export const subscribeMembership = (input: {
  planCode: PlanCode;
  cycle: BillingCycle;
  method: PaymentMethod;
  idempotencyKey: string;
  language: string;
  whatsappOptIn?: boolean;
  whatsappNumber?: string;
}) =>
  memberRequest<{ subscription: MembershipSubscription; invoice: MembershipInvoice | null; reused: boolean }>('/api/membership/subscribe', {
    method: 'POST',
    body: jsonBody({
      plan_code: input.planCode,
      billing_cycle: input.cycle,
      payment_method: input.method,
      idempotency_key: input.idempotencyKey,
      accept_terms: true,
      accept_license: true,
      language: input.language,
      ...(input.whatsappOptIn ? { whatsapp_opt_in: true, whatsapp_number: input.whatsappNumber ?? '' } : {})
    })
  });

export const getMyMembership = () => memberRequest<MyMembership>('/api/membership/me');

export const getMembershipShelf = () => memberRequest<MembershipShelf>('/api/membership/shelf');

export const payMembershipInvoice = (invoiceId: string, method?: PaymentMethod) =>
  memberRequest<{ invoice: MembershipInvoice }>(`/api/membership/invoices/${encodeURIComponent(invoiceId)}/pay`, {
    method: 'POST',
    body: jsonBody(method ? { payment_method: method } : {})
  });

/** Periksa status pembayaran ke Midtrans (setelah kembali dari Snap). */
export const refreshMembershipInvoice = (invoiceId: string) =>
  memberRequest<MyMembership & { paid: boolean }>(`/api/membership/invoices/${encodeURIComponent(invoiceId)}/refresh`, { method: 'POST', body: jsonBody({}) });

/**
 * Bukti pembayaran (HTML dari server, butuh token login): jendela dibuka lebih dulu agar tidak diblokir popup blocker,
 * lalu diarahkan ke blob setelah unduhan selesai.
 */
export const openMembershipReceipt = async (invoiceId: string, language: string): Promise<void> => {
  const win = window.open('', '_blank');
  try {
    const blob = await memberBlob(`/api/membership/invoices/${encodeURIComponent(invoiceId)}/receipt?lang=${encodeURIComponent(language)}`);
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else window.location.assign(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    win?.close();
    throw err;
  }
};

export const changeMembershipPlan = (planCode: PlanCode, cycle: BillingCycle, method?: PaymentMethod) =>
  memberRequest<PlanChangeResult>('/api/membership/change', {
    method: 'POST',
    body: jsonBody({ plan_code: planCode, billing_cycle: cycle, ...(method ? { payment_method: method } : {}) })
  });

export const cancelMembershipChange = () =>
  memberRequest<{ subscription: MembershipSubscription }>('/api/membership/change/cancel', { method: 'POST', body: jsonBody({}) });

export const cancelMembership = () =>
  memberRequest<{ subscription: MembershipSubscription }>('/api/membership/cancel', { method: 'POST', body: jsonBody({ confirm: true }) });

export const resumeMembership = () =>
  memberRequest<{ subscription: MembershipSubscription }>('/api/membership/resume', { method: 'POST', body: jsonBody({}) });

export const changeMembershipPaymentMethod = (method: PaymentMethod) =>
  memberRequest<{ subscription: MembershipSubscription }>('/api/membership/payment-method', { method: 'POST', body: jsonBody({ payment_method: method }) });

export const getMemberPicks = () => memberRequest<PickOptions>('/api/membership/picks');

export const chooseMemberPick = (productId: string) =>
  memberRequest<{ pick: { productId: string; periodStart: string; periodEnd: string; entitlementEndsAt: string } }>('/api/membership/picks', {
    method: 'POST',
    body: jsonBody({ product_id: productId })
  });

/** Status yang masih memberi manfaat keanggotaan (akses tetap terbuka selama tenggang/percobaan ulang). */
export const isPaidStatus = (status: SubscriptionStatus | null | undefined): boolean =>
  status === 'active' || status === 'past_due' || status === 'grace';
