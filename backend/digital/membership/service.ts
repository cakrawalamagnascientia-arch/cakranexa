import crypto from 'crypto';
import { ConflictError, httpError, ORDER_NOT_SAVED_MESSAGE, StoreRuleError } from '../errors';
import type { DigitalContext } from '../context';
import { mapMidtransToOrderStatus, verifyMidtransSignature, type MidtransClient } from '../checkout';
import type { Request } from 'express';
import { pickUniqueCode, formatUniqueCode } from '../../printCheckout/uniqueCode';
import { PROOF_CONTENT_TYPE, receiveProof } from '../../printCheckout/proofUpload';
import { PrintCheckoutError } from '../../printCheckout/errors';
import { transferConfirmationText, whatsappLink } from '../../../src/utils/transferConfirmation';
import type { CompanyBankAccount } from '../institution/types';
import { DEFAULT_BANK_ACCOUNTS } from '../../../src/services/paymentService';
import { unitSalesOpen } from '../access';
import { OPEN_SUBSCRIPTION_STATUSES } from '../store';
import { isEntitlementUsable, isProductOnShelf, resolveEntitlement } from '../entitlements';
import { addDays, addMonths, DAY_MS, jakartaDate } from '../time';
import { PLAN_RANK } from './plans';
import { INSTITUTION_FRONTLIST_DAYS, isOpenFor, monthSlot, openDateFor, planGrantsShelfRow, shelfCoversFormat } from './quota';
import { enabledRoutingMethods, type RoutingMethod } from '../../../src/data/paymentRouting';
import { decryptToken, encryptToken, midtransUserRef, parseMidtransTime, type MembershipGateway } from './gateway';
import { escapeHtml, membershipEmail, type MembershipEmailData, type MembershipEmailKind } from './email';
import { formatWhatsAppNumber, isWhatsAppKind, membershipWhatsApp, normalizeWhatsAppNumber, type WhatsAppSender } from './whatsapp';
import type {
  AuthUser,
  BillingCycle,
  EntitlementRecord,
  InvoiceRecord,
  MembershipPaymentMethod,
  PlanRecord,
  ProductRecord,
  ShelfAccess,
  SubscriptionEventType,
  SubscriptionRecord,
  SubscriptionStatus
} from '../types';

/**
 * Keanggotaan berbayar (docs/PHASE-3-BRIEF.md):
 *  - Pendaftaran: langganan 'pending' + invoice pertama + Snap. Kursi Founding diambil atomik saat pendaftaran
 *    (tahunan, kuota tersisa, belum pernah menjadi anggota berbayar) dan dilepas bila tidak dibayar.
 *  - Hak akses HANYA dibuat dari notifikasi Midtrans yang terverifikasi: scope 'shelf' (paket full) per periode,
 *    starts_at = awal periode, ends_at = akhir periode + masa tenggang. Reader Circle mendapat hak per judul saat
 *    memilih Digital Member Pick.
 *  - Notifikasi: order_id "SUB-<ref>-<percobaan>" (Snap) diverifikasi signature; tagihan otomatis Midtrans Subscriptions
 *    dikenali lewat ID langganan Midtrans dan statusnya diambil ulang dari API Midtrans (isi notifikasi tidak dipercaya).
 *  - Semua transisi memakai update bersyarat, sehingga webhook ganda atau job yang berjalan ulang tidak menggandakan apa pun.
 */

export const MEMBERSHIP_ORDER_PREFIX = 'SUB-';
export const isMembershipOrderId = (value: unknown): value is string => typeof value === 'string' && value.startsWith(MEMBERSHIP_ORDER_PREFIX);

const remoteSubscriptionIdOf = (n: Record<string, any>): string | null => {
  const value = n?.subscription_id ?? n?.subscription?.id ?? n?.transaction?.subscription_id;
  return typeof value === 'string' && value ? value : null;
};

/** Notifikasi Midtrans milik keanggotaan: order_id SUB-... atau tagihan Midtrans Subscriptions. */
export const isMembershipNotification = (n: Record<string, any>): boolean => {
  const tx = n?.transaction && typeof n.transaction === 'object' ? n.transaction : null;
  return isMembershipOrderId(n?.order_id) || isMembershipOrderId(tx?.order_id) || Boolean(remoteSubscriptionIdOf(n));
};

export const PAYMENT_METHODS: MembershipPaymentMethod[] = ['card', 'gopay', 'va', 'qris', 'other', 'bank_transfer'];

/** Fase 6 Langkah 4: dependensi transfer bank keanggotaan (rekening perusahaan, WhatsApp Finance, kode unik lintas modul). */
export interface MembershipTransferDeps {
  listBankAccounts?: () => Promise<CompanyBankAccount[]>;
  /** Nomor WhatsApp Finance dari pengaturan admin Pembayaran (env hanya cadangan). */
  financeWhatsapp?: () => Promise<string>;
  /** Nominal pesanan cetak yang masih menunggu transfer: kode unik keanggotaan tidak boleh menghasilkan nominal yang sama. */
  otherOpenTransferTotals?: () => Promise<number[]>;
}

/** Tagihan transfer bank manual (bukan Snap): payment_type 'bank_transfer' tanpa order Midtrans. */
export const isTransferInvoice = (invoice: Pick<InvoiceRecord, 'paymentType' | 'midtransOrderId'>): boolean =>
  invoice.paymentType === 'bank_transfer' && !invoice.midtransOrderId;

export interface PublicTransfer {
  uniqueCode: string | null;
  uniqueDiscount: number;
  /** Harga paket sebelum potongan kode unik. */
  baseAmount: number;
  hasProof: boolean;
  proofUploadedAt: string | null;
}
export const BILLING_CYCLES: BillingCycle[] = ['monthly', 'yearly'];
const PAID_STATES: SubscriptionStatus[] = ['active', 'past_due', 'grace'];

/**
 * Status tombol utama halaman buku (fase 6 Langkah 3):
 *  open            baca/dengarkan sekarang (via: jatah, instansi, atau hak lain)
 *  quota_available buka dengan jatah (x dari y)      quota_full    jatah bulan ini habis (upgrade)
 *  opens_on        tersedia untuk paket Anda pada <openDate>; upgradeOpenDate = tanggal di paket teratas
 *  audio_exhausted jam audio bulan ini habis        sample_only   hanya sampel (Blue / format tidak termasuk)
 *  coming_soon     belum masuk rak                  suspended / expired  hak ditangguhkan / berakhir
 */
export type TitleStatus = {
  productId: string;
  format: ProductRecord['format'];
  planCode: string | null;
  upgrade: boolean;
} & (
  | { status: 'open'; via: 'quota' | 'institution' | 'access'; endsAt: string | null }
  | { status: 'quota_available' | 'quota_full'; quota: { used: number; limit: number; resetsAt: string } }
  | { status: 'opens_on'; openDate: string | null; upgradeOpenDate?: string | null }
  | { status: 'audio_exhausted'; resetsAt: string }
  | { status: 'sample_only' | 'coming_soon' | 'suspended' | 'expired' }
);
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,100}$/;
const HOUR_MS = 60 * 60 * 1000;
/** Token Snap dipakai ulang selama belum mendekati kedaluwarsa (Snap berlaku 24 jam). */
const SNAP_REUSE_MS = 23 * HOUR_MS;
const ENABLED_PAYMENTS: Record<MembershipPaymentMethod, string[] | null> = {
  card: ['credit_card'],
  gopay: ['gopay'],
  va: ['bank_transfer', 'echannel'],
  qris: ['other_qris'],
  other: null,
  bank_transfer: null
};
const LANGUAGE_PREFIX: Record<string, string> = { id: '', en: '/en', zh: '/zh' };
/** Metode keanggotaan (Snap) -> baris payment_routing 'membership' yang harus diarahkan ke Midtrans. */
const ROUTING_FOR_METHOD: Record<MembershipPaymentMethod, RoutingMethod[]> = {
  card: ['card'],
  gopay: ['gopay'],
  va: ['va_bni', 'va_mandiri', 'va_bri', 'va_bca'],
  bank_transfer: ['bank_transfer'],
  qris: ['qris'],
  other: ['va_bni', 'va_mandiri', 'va_bri', 'va_bca', 'qris', 'gopay', 'ovo', 'dana', 'shopeepay', 'card']
};
/** Pemberitahuan pindah ke paket penerus (paket lama tidak dijual lagi), hari sebelum perpanjangan. */
export const PLAN_MIGRATION_NOTICE_DAYS = 30;

export const periodEndFor = (start: string, cycle: BillingCycle): string => addMonths(start, cycle === 'monthly' ? 1 : 12);
export const priceFor = (plan: PlanRecord, cycle: BillingCycle): number => (cycle === 'monthly' ? plan.priceMonthly : plan.priceYearly);
export const orderRefOf = (orderId: string): string => orderId.replace(/-\d+$/, '');
const newOrderRef = (now: Date) => `${MEMBERSHIP_ORDER_PREFIX}${jakartaDate(now).replace(/-/g, '')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
/** Nama langganan Midtrans (maks. 15 karakter untuk PATCH). */
export const remoteName = (subscriptionId: string): string => `CNX${subscriptionId.replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase()}`;

export interface PaymentInfo {
  transactionId: string | null;
  paymentType: string | null;
  savedTokenId: string | null;
  savedTokenExpiresAt: string | null;
  gopayAccountId: string | null;
}

export const EMPTY_PAYMENT: PaymentInfo ={ transactionId: null, paymentType: null, savedTokenId: null, savedTokenExpiresAt: null, gopayAccountId: null };

export const paymentInfoOf = (s: Record<string, any>): PaymentInfo => ({
  transactionId: s.transaction_id ? String(s.transaction_id) : null,
  paymentType: s.payment_type ? String(s.payment_type) : null,
  savedTokenId: s.saved_token_id ? String(s.saved_token_id) : null,
  savedTokenExpiresAt: s.saved_token_id_expired_at ? String(s.saved_token_id_expired_at) : null,
  gopayAccountId: s.metadata?.extra_info?.account_id ? String(s.metadata.extra_info.account_id) : s.gopay?.account_id ? String(s.gopay.account_id) : null
});

export interface PublicInvoice {
  id: string;
  orderRef: string;
  kind: InvoiceRecord['kind'];
  planCode: string | null;
  billingCycle: BillingCycle;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: InvoiceRecord['status'];
  isFoundingPrice: boolean;
  issuedAt: string | null;
  paidAt: string | null;
  dueAt: string | null;
  paymentType: string | null;
  snapToken: string | null;
  redirectUrl: string | null;
  /** Transfer bank manual (fase 6); null untuk tagihan Snap/admin. */
  transfer: PublicTransfer | null;
}

export class MembershipService {
  constructor(
    readonly ctx: DigitalContext,
    readonly gateway: MembershipGateway,
    private readonly snap: MidtransClient,
    /** Gateway pengingat WhatsApp; null = hanya email. */
    readonly whatsapp: WhatsAppSender | null = null,
    readonly transferDeps: MembershipTransferDeps = {}
  ) {}

  get cfg() {
    return this.ctx.config.membership;
  }

  private get store() {
    return this.ctx.store;
  }

  private iso(): string {
    return this.ctx.now().toISOString();
  }

  // -------------------------------------------------------------------------
  // Paket
  // -------------------------------------------------------------------------
  plans(): Promise<PlanRecord[]> {
    return this.store.listPlans();
  }

  async planById(id: string | null): Promise<PlanRecord | null> {
    if (!id) return null;
    return (await this.plans()).find((p) => p.id === id) ?? null;
  }

  async planByCode(code: string): Promise<PlanRecord | null> {
    return (await this.plans()).find((p) => p.code === code) ?? null;
  }

  /** Flag env untuk plan_benefits.feature_flag ("!" = tampil bila flag MATI). */
  flagOn(flag: string | null): boolean {
    if (!flag) return true;
    const negate = flag.startsWith('!');
    const name = negate ? flag.slice(1) : flag;
    const values: Record<string, boolean> = {
      ENABLE_READER_DIGITAL_PICK: this.cfg.readerDigitalPick,
      ENABLE_AUTHOR_GUILD_SHELF: this.cfg.authorGuildShelf,
      ENABLE_MEMBER_PRINT_DISCOUNT: this.cfg.memberPrintDiscount,
      MEMBERSHIP_EXTENDED_BENEFITS: this.cfg.extendedBenefits,
      ENABLE_AUTODEBIT: this.cfg.autodebitEnabled,
      ENABLE_OFFLINE: this.cfg.offlineEnabled,
      ENABLE_CROSS_FORMAT_SYNC: this.cfg.crossFormatSync
    };
    const value = values[name] ?? false;
    return negate ? !value : value;
  }

  /** Akses rak efektif: nilai tabel plans, dibatasi flag env Reader Pick dan rak Author Guild. */
  effectiveShelfAccess(plan: PlanRecord): ShelfAccess {
    if (plan.code === 'reader' && !this.cfg.readerDigitalPick) return 'none';
    if (plan.code === 'author' && !this.cfg.authorGuildShelf) return 'none';
    return plan.shelfAccess;
  }

  planName(plan: PlanRecord, language: string): string {
    return language === 'id' ? plan.nameId : plan.nameEn;
  }

  async publicPlans() {
    const [plans, benefits] = await Promise.all([this.plans(), this.store.listPlanBenefits()]);
    return plans.filter((p) => p.isActive).map((p) => ({
      code: p.code,
      name: { id: p.nameId, en: p.nameEn },
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      founding: p.foundingPriceYearly !== null && p.foundingCap !== null
        ? { priceYearly: p.foundingPriceYearly, cap: p.foundingCap, remaining: Math.max(0, p.foundingCap - p.foundingCount) }
        : null,
      maxDevices: p.maxDevices,
      shelfAccess: this.effectiveShelfAccess(p),
      ebookTitlesPerPeriod: p.ebookTitlesPerPeriod,
      audioHoursPerPeriod: p.audioHoursPerPeriod,
      frontlistDays: p.frontlistDays,
      offlineTitles: p.offlineTitles,
      familyAccounts: p.familyAccounts,
      printDiscountPercent: this.cfg.memberPrintDiscount ? p.printDiscountPercent : 0,
      benefits: benefits
        .filter((b) => b.planId === p.id && this.flagOn(b.featureFlag))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((b) => b.benefitKey)
    }));
  }

  flags() {
    return {
      autodebit: this.cfg.autodebitEnabled,
      printDiscount: this.cfg.memberPrintDiscount,
      readerPick: this.cfg.readerDigitalPick,
      authorShelf: this.cfg.authorGuildShelf,
      extendedBenefits: this.cfg.extendedBenefits,
      offline: this.cfg.offlineEnabled,
      crossFormatSync: this.cfg.crossFormatSync,
      graceDays: this.cfg.graceDays,
      /** Pengingat WhatsApp tersedia (gateway terpasang) dan nomor pengirimnya. */
      whatsapp: this.whatsapp !== null,
      whatsappSender: this.whatsapp ? formatWhatsAppNumber(this.ctx.config.whatsapp.senderNumber) : null
    };
  }

  // -------------------------------------------------------------------------
  // Utilitas langganan
  // -------------------------------------------------------------------------
  async openSubscription(userId: string): Promise<SubscriptionRecord | null> {
    return (await this.store.listSubscriptions({ userId, statuses: OPEN_SUBSCRIPTION_STATUSES, limit: 1 }))[0] ?? null;
  }

  async latestSubscription(userId: string): Promise<SubscriptionRecord | null> {
    return (await this.store.listSubscriptions({ userId, limit: 1 }))[0] ?? null;
  }

  graceEndsAt(sub: SubscriptionRecord): string | null {
    return sub.currentPeriodEnd ? addDays(sub.currentPeriodEnd, this.cfg.graceDays + sub.extraGraceDays) : null;
  }

  /** Akhir akses: akhir periode bila dibatalkan, selain itu akhir periode + masa tenggang. */
  accessEndsAt(sub: SubscriptionRecord): string | null {
    if (!sub.currentPeriodEnd) return null;
    return sub.cancelAtPeriodEnd ? sub.currentPeriodEnd : this.graceEndsAt(sub);
  }

  autodebitActive(sub: SubscriptionRecord): boolean {
    return this.cfg.autodebitEnabled && Boolean(sub.midtransSubscriptionId);
  }

  async hadPaidSubscription(userId: string): Promise<boolean> {
    return (await this.store.listSubscriptions({ userId })).some((s) => s.currentPeriodStart !== null);
  }

  /** Paket, siklus, dan nominal perpanjangan berikutnya (perubahan terjadwal diterapkan; harga Founding hanya tahun pertama). */
  async renewalTarget(sub: SubscriptionRecord): Promise<{ plan: PlanRecord; cycle: BillingCycle; amount: number }> {
    let plan = (await this.planById(sub.pendingPlanId)) ?? (await this.planById(sub.planId));
    if (!plan) throw new Error(`Paket langganan ${sub.id} tidak ditemukan`);
    // Paket fase 3 tidak dijual lagi: perpanjangan memakai paket penerusnya (fase 6).
    if (!plan.isActive && plan.successorPlanId) plan = (await this.planById(plan.successorPlanId)) ?? plan;
    const cycle = sub.pendingBillingCycle ?? sub.billingCycle;
    return { plan, cycle, amount: priceFor(plan, cycle) };
  }

  event(sub: SubscriptionRecord, type: SubscriptionEventType, meta: Record<string, unknown> = {}, dedupeKey: string | null = null): Promise<boolean> {
    return this.store.insertSubscriptionEvent({ subscriptionId: sub.id, type, meta, dedupeKey });
  }

  /**
   * Pemberitahuan anggota: email selalu; WhatsApp untuk tagihan/pengingat/gagal bayar/tenggang/akses dikunci/Founding
   * bila gateway terpasang dan anggota menyetujui. Pemanggil sudah men-dedupe lewat subscription_events.
   */
  notify(sub: SubscriptionRecord, kind: MembershipEmailKind, data: Partial<MembershipEmailData> = {}): void {
    const payload: MembershipEmailData = {
      language: sub.language,
      name: sub.customerName || sub.customerEmail,
      siteUrl: this.ctx.config.siteUrl,
      graceDays: this.cfg.graceDays,
      retentionMonths: 12,
      ...data
    };
    if (sub.customerEmail) {
      this.ctx.defer(async () => {
        const message = membershipEmail(kind, payload);
        await this.ctx.mailer.send({ to: [sub.customerEmail], subject: message.subject, html: message.html });
      });
    }
    const whatsapp = this.whatsapp;
    const to = sub.whatsappNumber;
    if (whatsapp && sub.whatsappOptIn && to && isWhatsAppKind(kind)) {
      this.ctx.defer(async () => {
        try {
          await whatsapp.send(to, membershipWhatsApp(kind, payload, this.ctx.config.whatsapp.templatePrefix), payload.language);
        } catch (err: any) {
          console.warn(`[membership] WhatsApp ${kind} gagal (${sub.id}):`, err?.message || err);
          await this.event(sub, 'whatsapp_failed', { kind, message: String(err?.message || err).slice(0, 300) });
        }
      });
    }
  }

  /** Hak keanggotaan milik langganan ini: baris rak (source_ref = id langganan) + hak Digital Member Pick. */
  async membershipEntitlements(sub: SubscriptionRecord): Promise<EntitlementRecord[]> {
    // Baris rak pemilik dan anggota keluarga (source_ref = langganan pemilik).
    const shelf = await this.store.listEntitlements({ scope: 'shelf', source: 'membership', sourceRef: sub.id });
    const pickIds = [...await this.store.listPicks({ subscriptionId: sub.id }), ...await this.store.listTitlePicks({ subscriptionId: sub.id })]
      .map((p) => p.entitlementId).filter((id): id is string => Boolean(id));
    const picks = pickIds.length > 0 ? await this.store.listEntitlements({ ids: pickIds }) : [];
    return [...shelf, ...picks];
  }

  /** Batasi akses aktif sampai `endsAt` (pembatalan / pergantian paket). Baris yang baru mulai setelahnya dicabut. */
  async limitAccessTo(sub: SubscriptionRecord, endsAt: string): Promise<void> {
    const limit = Date.parse(endsAt);
    const rows = (await this.membershipEntitlements(sub)).filter((e) => e.status === 'active' && (!e.endsAt || Date.parse(e.endsAt) > limit));
    const current = rows.filter((e) => Date.parse(e.startsAt) < limit).map((e) => e.id);
    const future = rows.filter((e) => Date.parse(e.startsAt) >= limit).map((e) => e.id);
    if (current.length > 0) await this.store.updateEntitlementsEndsAt(current, endsAt);
    if (future.length > 0) await this.store.updateEntitlements(future, { status: 'revoked', revokedReason: 'membership_ended', statusChangedBy: 'membership' });
  }

  /** Kembalikan akhir akses normal (akhir periode + tenggang; Pick sampai akhir slotnya) setelah pembatalan dibatalkan. */
  async restoreAccess(sub: SubscriptionRecord): Promise<void> {
    const graceEnd = this.graceEndsAt(sub);
    if (!graceEnd || !sub.currentPeriodStart) return;
    const shelf = (await this.store.listEntitlements({ scope: 'shelf', source: 'membership', sourceRef: sub.id }))
      .filter((e) => e.status === 'active' && Date.parse(e.startsAt) >= Date.parse(sub.currentPeriodStart!) - 1000);
    if (shelf.length > 0) await this.store.updateEntitlementsEndsAt(shelf.map((e) => e.id), graceEnd);
    // Judul jatah fase 6: sampai akhir slot bulannya.
    for (const pick of await this.store.listTitlePicks({ subscriptionId: sub.id })) {
      if (!pick.entitlementId || Date.parse(pick.periodEnd) <= Date.parse(this.iso())) continue;
      await this.store.updateEntitlementsEndsAt([pick.entitlementId], Date.parse(pick.periodEnd) < Date.parse(graceEnd) ? pick.periodEnd : graceEnd);
    }
    for (const pick of await this.store.listPicks({ subscriptionId: sub.id })) {
      if (!pick.entitlementId || Date.parse(pick.periodEnd) <= Date.parse(this.iso())) continue;
      const pickEnd = addDays(pick.periodEnd, this.cfg.graceDays);
      await this.store.updateEntitlementsEndsAt([pick.entitlementId], Date.parse(pickEnd) < Date.parse(graceEnd) ? pickEnd : graceEnd);
    }
  }

  /**
   * Hak akses paket untuk satu periode: satu baris scope 'shelf' per akun (pemilik + anggota keluarga aktif) bila
   * paketnya membuka rak (seluruh rak, atau audiobook untuk paket berjatah). Cakupan format dan tanggal buka per
   * paket dicek saat akses (MembershipAccess.coversProduct).
   */
  async grantAccess(sub: SubscriptionRecord, plan: PlanRecord, start: string, end: string): Promise<void> {
    const access = this.effectiveShelfAccess(plan);
    if (!(access === 'full' || (access === 'pick' && planGrantsShelfRow(plan)))) return;
    const family = plan.familyAccounts > 0
      ? (await this.store.listFamilyMembers({ ownerSubscriptionId: sub.id, status: 'active' })).slice(0, plan.familyAccounts)
      : [];
    const endsAt = addDays(end, this.cfg.graceDays + sub.extraGraceDays);
    await this.store.insertEntitlements([sub.userId, ...family.map((m) => m.userId)].map((userId) => ({
      userId,
      productId: null,
      scope: 'shelf' as const,
      source: 'membership' as const,
      sourceRef: sub.id,
      startsAt: start,
      endsAt,
      maxDevices: plan.maxDevices,
      statusChangedBy: 'membership'
    })));
  }

  /** Metode keanggotaan yang dapat dipilih sekarang (payment_routing 'membership'); fase 6 bawaan: transfer bank saja. */
  async availableMethods(): Promise<MembershipPaymentMethod[]> {
    const routes = enabledRoutingMethods(await this.ctx.paymentRouting(), 'membership', { midtransEnabled: this.ctx.midtrans.enabled });
    const methods: MembershipPaymentMethod[] = [];
    if (routes.some((r) => r.method === 'bank_transfer' && r.provider === 'manual')) methods.push('bank_transfer');
    for (const method of ['va', 'qris', 'card', 'gopay'] as const) {
      if (routes.some((r) => r.provider === 'midtrans' && ROUTING_FOR_METHOD[method].includes(r.method))) methods.push(method);
    }
    return methods;
  }

  /** Tagihan langganan ini dibayar lewat transfer manual? (dipilih saat daftar, atau metode Snap-nya sudah tidak diarahkan) */
  async usesTransfer(sub: SubscriptionRecord): Promise<boolean> {
    if (this.autodebitActive(sub)) return false;
    const methods = await this.availableMethods();
    if (sub.paymentMethod === 'bank_transfer') return true;
    return methods.includes('bank_transfer') && !methods.includes(sub.paymentMethod);
  }

  /** Nominal transfer dengan kode unik yang belum dipakai tagihan/pesanan lain yang masih menunggu transfer. */
  async transferPricing(base: number): Promise<{ amount: number; uniqueCode: number | null; uniqueDiscount: number }> {
    const open = await this.store.listInvoices({ statuses: ['issued'], limit: 5000 });
    const taken = new Set(open.filter((i) => isTransferInvoice(i)).map((i) => i.amount));
    for (const total of (await this.transferDeps.otherOpenTransferTotals?.()) ?? []) taken.add(Math.round(total));
    const picked = pickUniqueCode(base, taken);
    return picked ? { amount: picked.total, uniqueCode: picked.code, uniqueDiscount: picked.discount } : { amount: base, uniqueCode: null, uniqueDiscount: 0 };
  }

  /** Kolom invoice untuk tagihan transfer (nominal berkode unik, tanpa Snap). */
  private async transferFields(base: number) {
    const pricing = await this.transferPricing(base);
    return { amount: pricing.amount, uniqueCode: pricing.uniqueCode, uniqueDiscount: pricing.uniqueDiscount, paymentType: 'bank_transfer' as string | null };
  }

  /** Data email/WhatsApp instruksi transfer. */
  async transferNotice(invoice: InvoiceRecord, sub: SubscriptionRecord, plan: PlanRecord | null): Promise<Partial<MembershipEmailData>> {
    const accounts = (await this.bankAccounts()).map((a) => ({ bankName: a.bankName, accountNumber: a.accountNumber, accountHolder: a.accountHolder }));
    return {
      planName: plan ? this.planName(plan, sub.language) : '',
      cycle: invoice.billingCycle,
      amount: invoice.amount,
      date: invoice.dueAt,
      invoiceRef: invoice.orderRef,
      transfer: {
        accounts,
        uniqueCode: invoice.uniqueCode === null ? null : formatUniqueCode(invoice.uniqueCode),
        whatsappUrl: await this.financeWhatsappUrl(invoice, sub)
      }
    };
  }

  /** Rekening IDR dari CMS; bila kosong memakai rekening bawaan yang sama dengan checkout buku cetak. */
  private async bankAccounts(): Promise<CompanyBankAccount[]> {
    let rows: CompanyBankAccount[] = [];
    try {
      rows = (await this.transferDeps.listBankAccounts?.()) ?? [];
    } catch (err: any) {
      console.warn('[membership] rekening perusahaan gagal dimuat:', err?.message || err);
    }
    const idr = rows.filter((a) => (a.currency ?? 'IDR') === 'IDR');
    if (idr.length > 0) return idr;
    return DEFAULT_BANK_ACCOUNTS
      .filter((a) => (a.currency ?? 'IDR') === 'IDR')
      .map((a) => ({ bankName: a.bankName, accountNumber: a.accountNumber, accountHolder: a.accountHolder, branch: a.branch || '', currency: 'IDR' as const }));
  }

  private async financeWhatsappUrl(invoice: InvoiceRecord, sub: SubscriptionRecord): Promise<string | null> {
    const phone = (await this.transferDeps.financeWhatsapp?.().catch(() => '')) || '';
    if (!phone) return null;
    return whatsappLink(phone, transferConfirmationText({ orderNumber: invoice.orderRef, amount: invoice.amount, buyerName: sub.customerName || sub.customerEmail }));
  }

  /** Metode Snap ini diarahkan ke Midtrans di payment_routing 'membership'? (fase 6: bawaan transfer manual saja) */
  private async assertMethodRouted(method: MembershipPaymentMethod): Promise<void> {
    const routes = enabledRoutingMethods(await this.ctx.paymentRouting(), 'membership', { midtransEnabled: this.ctx.midtrans.enabled });
    if (!routes.some((r) => r.provider === 'midtrans' && ROUTING_FOR_METHOD[method].includes(r.method))) {
      throw httpError(400, 'method_unavailable', 'Metode pembayaran ini sedang tidak tersedia untuk keanggotaan.');
    }
  }

  // -------------------------------------------------------------------------
  // Tampilan publik
  // -------------------------------------------------------------------------
  publicInvoice(invoice: InvoiceRecord, plan: PlanRecord | null): PublicInvoice {
    const fresh = invoice.status === 'issued' && invoice.midtransSnapToken && invoice.snapCreatedAt
      && this.ctx.now().getTime() - Date.parse(invoice.snapCreatedAt) < SNAP_REUSE_MS;
    return {
      id: invoice.id,
      orderRef: invoice.orderRef,
      kind: invoice.kind,
      planCode: plan?.code ?? null,
      billingCycle: invoice.billingCycle,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      amount: invoice.amount,
      status: invoice.status,
      isFoundingPrice: invoice.isFoundingPrice,
      issuedAt: invoice.issuedAt,
      paidAt: invoice.paidAt,
      dueAt: invoice.dueAt,
      paymentType: invoice.paymentType,
      snapToken: fresh ? invoice.midtransSnapToken : null,
      redirectUrl: fresh ? invoice.snapRedirectUrl : null,
      transfer: isTransferInvoice(invoice)
        ? {
          uniqueCode: invoice.uniqueCode === null ? null : formatUniqueCode(invoice.uniqueCode),
          uniqueDiscount: invoice.uniqueDiscount,
          baseAmount: invoice.amount + invoice.uniqueDiscount,
          hasProof: Boolean(invoice.paymentProofPath),
          proofUploadedAt: invoice.paymentProofUploadedAt
        }
        : null
    };
  }

  async publicSubscription(sub: SubscriptionRecord) {
    const plan = await this.planById(sub.planId);
    const pendingPlan = await this.planById(sub.pendingPlanId);
    const renewal = sub.status === 'active' && !sub.cancelAtPeriodEnd && sub.currentPeriodEnd && plan ? await this.renewalTarget(sub) : null;
    return {
      id: sub.id,
      planCode: plan?.code ?? null,
      planName: plan ? { id: plan.nameId, en: plan.nameEn } : null,
      billingCycle: sub.billingCycle,
      status: sub.status,
      isFounding: sub.isFounding,
      priceLocked: sub.priceLocked,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      accessEndsAt: this.accessEndsAt(sub),
      graceEndsAt: this.graceEndsAt(sub),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      canceledAt: sub.canceledAt,
      endedAt: sub.endedAt,
      endedReason: sub.endedReason,
      paymentMethod: sub.paymentMethod,
      autodebit: this.autodebitActive(sub),
      whatsappNumber: sub.whatsappNumber,
      whatsappOptIn: sub.whatsappOptIn,
      foundingEndsAt: sub.foundingEndsAt,
      regularYearlyPrice: plan?.priceYearly ?? null,
      pendingChange: sub.pendingPlanId || sub.pendingBillingCycle
        ? { planCode: (pendingPlan ?? plan)?.code ?? null, billingCycle: sub.pendingBillingCycle ?? sub.billingCycle, effectiveAt: sub.currentPeriodEnd }
        : null,
      nextRenewal: renewal ? { date: sub.currentPeriodEnd, amount: renewal.amount, planCode: renewal.plan.code, billingCycle: renewal.cycle } : null,
      maxDevices: plan?.maxDevices ?? null,
      shelfAccess: plan ? this.effectiveShelfAccess(plan) : 'none',
      ebookTitlesPerPeriod: plan?.ebookTitlesPerPeriod ?? null,
      audioHoursPerPeriod: plan?.audioHoursPerPeriod ?? null,
      frontlistDays: plan?.frontlistDays ?? null,
      offlineTitles: plan?.offlineTitles ?? 0,
      familyAccounts: plan?.familyAccounts ?? 0,
      /** Paket tidak dijual lagi: perpanjangan berikutnya memakai paket ini. */
      successorPlanCode: plan && !plan.isActive && plan.successorPlanId ? (await this.planById(plan.successorPlanId))?.code ?? null : null,
      createdAt: sub.createdAt
    };
  }

  printDiscountFor(sub: SubscriptionRecord | null, plan: PlanRecord | null): number {
    if (!this.cfg.memberPrintDiscount || !sub || !plan || !PAID_STATES.includes(sub.status)) return 0;
    return plan.printDiscountPercent;
  }

  async me(user: AuthUser) {
    const open = await this.openSubscription(user.id);
    const latest = open ?? (await this.latestSubscription(user.id));
    // Langganan pending yang dibatalkan sebelum pernah aktif tidak ditampilkan sebagai keanggotaan.
    const sub = latest && (latest.currentPeriodStart !== null || OPEN_SUBSCRIPTION_STATUSES.includes(latest.status)) ? latest : null;
    if (!sub) return { subscription: null, invoices: [], openInvoice: null, printDiscountPercent: 0, autodebitAvailable: this.cfg.autodebitEnabled, audio: null };
    const plans = await this.plans();
    const planOf = (id: string) => plans.find((p) => p.id === id) ?? null;
    const invoices = await this.store.listInvoices({ subscriptionId: sub.id, limit: 24 });
    const openInvoice = invoices.find((i) => i.status === 'issued' || (i.status === 'failed' && i.kind === 'renewal')) ?? null;
    return {
      subscription: await this.publicSubscription(sub),
      invoices: invoices.map((i) => this.publicInvoice(i, planOf(i.planId))),
      openInvoice: openInvoice ? this.publicInvoice(openInvoice, planOf(openInvoice.planId)) : null,
      printDiscountPercent: this.printDiscountFor(sub, planOf(sub.planId)),
      autodebitAvailable: this.cfg.autodebitEnabled,
      audio: await this.audioMeter(user, sub)
    };
  }

  /** Meter jam audio bulan ini (fase 6): dihitung dari hak rak keanggotaan pengguna; null = paket tanpa batas jam. */
  private async audioMeter(user: AuthUser, sub: SubscriptionRecord) {
    const hook = this.ctx.membership;
    if (!hook || !PAID_STATES.includes(sub.status)) return null;
    const shelf = (await this.store.listEntitlements({ userId: user.id, scope: 'shelf', source: 'membership' }))
      .find((e) => isEntitlementUsable(e, this.ctx.now()));
    if (!shelf) return null;
    const quota = await hook.audioQuota(shelf, user.id, true);
    return quota ? { usedSeconds: Math.min(quota.usedSeconds, quota.limitSeconds), limitSeconds: quota.limitSeconds, resetsAt: quota.resetsAt, exhausted: quota.exhausted } : null;
  }

  // -------------------------------------------------------------------------
  // Pendaftaran & Snap
  // -------------------------------------------------------------------------
  async subscribe(user: AuthUser, body: Record<string, unknown>) {
    const planCode = String(body.plan_code || '');
    const cycle = String(body.billing_cycle || '') as BillingCycle;
    const method = String(body.payment_method || '') as MembershipPaymentMethod;
    const key = String(body.idempotency_key || '');
    const language = ['id', 'en', 'zh'].includes(String(body.language)) ? String(body.language) : 'id';
    if (!IDEMPOTENCY_RE.test(key)) throw httpError(400, 'invalid_request', 'idempotency_key tidak valid.');
    if (!BILLING_CYCLES.includes(cycle)) throw httpError(400, 'invalid_request', 'Siklus tagihan tidak valid.');
    if (!PAYMENT_METHODS.includes(method)) throw httpError(400, 'invalid_request', 'Metode pembayaran tidak valid.');
    if (body.accept_terms !== true) throw httpError(400, 'terms_required', 'Setujui ketentuan keanggotaan terlebih dahulu.');
    if (body.accept_license !== true) throw httpError(400, 'license_required', 'Setujui ketentuan lisensi digital terlebih dahulu.');
    if (!user.email) throw httpError(400, 'email_required', 'Akun tanpa email tidak dapat berlangganan.');
    // Pengingat WhatsApp: opsional, hanya dengan persetujuan eksplisit.
    const whatsappOptIn = body.whatsapp_opt_in === true;
    const whatsappNumber = whatsappOptIn ? normalizeWhatsAppNumber(body.whatsapp_number) : null;
    if (whatsappOptIn && !whatsappNumber) throw httpError(400, 'invalid_whatsapp', 'Nomor WhatsApp tidak valid.');

    // Kunci yang sama -> pendaftaran yang sama (klik ganda, koneksi putus).
    const existing = await this.store.getSubscriptionByIdempotencyKey(key);
    if (existing) {
      if (existing.userId !== user.id) throw httpError(409, 'idempotency_conflict', 'Kunci idempotensi sudah dipakai.');
      const plan = await this.planById(existing.planId);
      let invoice = (await this.store.listInvoices({ subscriptionId: existing.id, kinds: ['initial'], limit: 1 }))[0] ?? null;
      if (invoice && invoice.status === 'issued' && plan && !isTransferInvoice(invoice)) invoice = await this.prepareSnap(invoice, existing, plan);
      return { subscription: await this.publicSubscription(existing), invoice: invoice ? this.publicInvoice(invoice, plan) : null, reused: true };
    }

    // Fase 6: transfer bank manual tidak bergantung Midtrans; metode Snap tetap butuh Midtrans dan routing.
    const transfer = method === 'bank_transfer';
    if (!transfer && !this.ctx.midtrans.enabled) throw httpError(503, 'payment_unavailable', 'Pembayaran online belum dikonfigurasi.');
    const plan = await this.planByCode(planCode);
    if (!plan || !plan.isActive || priceFor(plan, cycle) <= 0) throw httpError(400, 'plan_unavailable', 'Paket tidak tersedia.');
    if (transfer) {
      if (!(await this.availableMethods()).includes('bank_transfer')) throw httpError(400, 'method_unavailable', 'Metode pembayaran ini sedang tidak tersedia untuk keanggotaan.');
    } else {
      await this.assertMethodRouted(method);
    }

    const open = await this.openSubscription(user.id);
    if (open && open.status !== 'pending') {
      throw httpError(409, 'already_subscribed', 'Anda sudah memiliki keanggotaan. Gunakan ubah paket.', { planCode: (await this.planById(open.planId))?.code ?? null });
    }
    if (open) await this.voidPending(open, 'replaced');

    // Founding: tahunan, kuota tersisa, dan belum pernah menjadi anggota berbayar (berlangganan lagi = harga reguler).
    const eligible = cycle === 'yearly' && plan.foundingPriceYearly !== null && plan.foundingCap !== null && !(await this.hadPaidSubscription(user.id));
    const claimed = eligible ? await this.store.claimFoundingSlot(plan.id) : false;
    const amount = claimed ? plan.foundingPriceYearly! : priceFor(plan, cycle);
    const now = this.ctx.now();
    const nowIso = now.toISOString();
    const isTest = this.ctx.feature.isBeta(user.email);

    let sub: SubscriptionRecord;
    try {
      sub = await this.store.createSubscription({
        userId: user.id,
        planId: plan.id,
        billingCycle: cycle,
        status: 'pending',
        isFounding: claimed,
        priceLocked: amount,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
        endedReason: null,
        paymentMethod: method,
        midtransSubscriptionId: null,
        midtransToken: null,
        midtransTokenExpiresAt: null,
        midtransAccountId: null,
        pendingPlanId: null,
        pendingBillingCycle: null,
        foundingEndsAt: null,
        extraGraceDays: 0,
        customerEmail: user.email,
        customerName: user.name || user.email,
        language,
        whatsappNumber,
        whatsappOptIn,
        whatsappOptInAt: whatsappOptIn ? nowIso : null,
        idempotencyKey: key,
        isTest
      });
    } catch (err: any) {
      if (claimed) await this.releaseFoundingQuietly(plan.id);
      if (err instanceof ConflictError) throw httpError(409, 'subscription_in_progress', 'Pendaftaran lain sedang diproses. Muat ulang halaman.');
      console.error('[membership] Langganan tidak tersimpan; transaksi pembayaran tidak dibuat:', { userId: user.id, planCode, error: err?.message || err });
      throw httpError(503, 'order_not_saved', ORDER_NOT_SAVED_MESSAGE);
    }

    let invoice: InvoiceRecord;
    try {
      invoice = await this.store.createInvoice({
        subscriptionId: sub.id,
        userId: user.id,
        kind: 'initial',
        planId: plan.id,
        billingCycle: cycle,
        periodStart: nowIso,
        periodEnd: periodEndFor(nowIso, cycle),
        amount,
        status: 'issued',
        orderRef: newOrderRef(now),
        midtransOrderId: null,
        midtransSnapToken: null,
        snapRedirectUrl: null,
        snapCreatedAt: null,
        midtransTransactionId: null,
        paymentType: null,
        ...(transfer ? await this.transferFields(amount) : {}),
        claimsFounding: claimed,
        isFoundingPrice: claimed,
        issuedAt: nowIso,
        paidAt: null,
        dueAt: new Date(now.getTime() + this.cfg.pendingTtlHours * HOUR_MS).toISOString(),
        attempt: 0,
        failureReason: null,
        isTest
      });
    } catch (err: any) {
      // Tagihan tidak tersimpan: langganan pending ditutup dan kursi Founding dilepas, tanpa transaksi pembayaran.
      console.error('[membership] Tagihan tidak tersimpan; transaksi pembayaran tidak dibuat:', { subscriptionId: sub.id, userId: user.id, error: err?.message || err });
      try {
        await this.voidPending(sub, 'invoice_error');
      } catch (cleanupErr: any) {
        console.error('[membership] Gagal menutup langganan pending:', { subscriptionId: sub.id, error: cleanupErr?.message || cleanupErr });
      }
      if (claimed) await this.releaseFoundingQuietly(plan.id);
      throw httpError(503, 'order_not_saved', ORDER_NOT_SAVED_MESSAGE);
    }
    await this.event(sub, 'created', { planCode, cycle, method, amount: invoice.amount, founding: claimed });
    if (transfer) {
      // Instruksi transfer (email + WhatsApp bila disetujui); paket aktif setelah Finance mengonfirmasi.
      this.notify(sub, 'transferInstructions', await this.transferNotice(invoice, sub, plan));
      return { subscription: await this.publicSubscription(sub), invoice: this.publicInvoice(invoice, plan), reused: false };
    }
    try {
      invoice = await this.prepareSnap(invoice, sub, plan);
    } catch (err: any) {
      console.error('[membership] Snap gagal:', err?.message || err);
      await this.voidPending(sub, 'snap_error');
      throw httpError(502, 'payment_error', 'Gagal memulai pembayaran. Coba lagi.');
    }
    return { subscription: await this.publicSubscription(sub), invoice: this.publicInvoice(invoice, plan), reused: false };
  }

  /** Token Snap untuk invoice (dipakai ulang bila masih segar); percobaan baru = order_id baru `${orderRef}-${n}`. */
  async prepareSnap(invoice: InvoiceRecord, sub: SubscriptionRecord, plan: PlanRecord, methodOverride: MembershipPaymentMethod | null = null): Promise<InvoiceRecord> {
    const now = this.ctx.now();
    const method = methodOverride ?? sub.paymentMethod;
    const reusable = invoice.status === 'issued' && invoice.midtransSnapToken && invoice.snapCreatedAt
      && now.getTime() - Date.parse(invoice.snapCreatedAt) < SNAP_REUSE_MS && !methodOverride;
    if (reusable) return invoice;
    const attempt = invoice.attempt + 1;
    const orderId = `${invoice.orderRef}-${attempt}`;
    const tokenize = this.cfg.autodebitEnabled && (method === 'card' || method === 'gopay') && invoice.kind !== 'manual';
    const finish = `${this.ctx.config.siteUrl}${LANGUAGE_PREFIX[sub.language] ?? ''}/account/membership?invoice=${encodeURIComponent(invoice.orderRef)}`;
    const enabled = ENABLED_PAYMENTS[method];
    const payload: Record<string, unknown> = {
      transaction_details: { order_id: orderId, gross_amount: invoice.amount },
      item_details: [{
        id: `${plan.code}-${invoice.billingCycle}`,
        price: invoice.amount,
        quantity: 1,
        name: `${plan.nameId} (${invoice.billingCycle === 'yearly' ? 'tahunan' : 'bulanan'})`.slice(0, 50)
      }],
      // Hanya nama & email; tidak ada data kartu yang pernah melewati server ini.
      customer_details: { first_name: sub.customerName.slice(0, 50), email: sub.customerEmail },
      expiry: { unit: 'hours', duration: this.cfg.pendingTtlHours },
      callbacks: { finish },
      custom_field1: invoice.orderRef,
      ...(enabled ? { enabled_payments: enabled } : {}),
      ...(tokenize ? { user_id: midtransUserRef(sub.userId) } : {}),
      ...(tokenize && method === 'card' ? { credit_card: { secure: true, save_card: true } } : {}),
      ...(tokenize && method === 'gopay' ? { gopay: { enable_callback: true, callback_url: finish, tokenization: true } } : {})
    };
    const snap = await this.snap.createTransaction(payload);
    const updated = await this.store.updateInvoice(invoice.id, {
      status: 'issued',
      midtransOrderId: orderId,
      midtransSnapToken: snap.token,
      snapRedirectUrl: snap.redirectUrl,
      snapCreatedAt: now.toISOString(),
      attempt
    }, ['issued', 'failed']);
    if (!updated) throw httpError(409, 'invoice_closed', 'Tagihan ini sudah tidak dapat dibayar.');
    return updated;
  }

  /** Lepas kursi Founding tanpa menutupi error asal (dipakai saat penyimpanan gagal). */
  private async releaseFoundingQuietly(planId: string): Promise<void> {
    try {
      await this.store.releaseFoundingSlot(planId);
    } catch (err: any) {
      console.error('[membership] Gagal melepas kursi Founding:', { planId, error: err?.message || err });
    }
  }

  async voidInvoice(invoice: InvoiceRecord, reason: string): Promise<InvoiceRecord | null> {
    const voided = await this.store.updateInvoice(invoice.id, { status: 'void', failureReason: reason, midtransSnapToken: null, claimsFounding: false }, ['issued', 'draft', 'failed']);
    if (voided && invoice.claimsFounding) await this.store.releaseFoundingSlot(invoice.planId);
    return voided;
  }

  /** Langganan pending dibatalkan (diganti, Snap gagal, atau kedaluwarsa): invoice di-void dan kursi Founding dilepas. */
  async voidPending(sub: SubscriptionRecord, reason: string): Promise<void> {
    const updated = await this.store.updateSubscription(sub.id, { status: 'expired', endedAt: this.iso(), endedReason: reason }, ['pending']);
    if (!updated) return;
    for (const invoice of await this.store.listInvoices({ subscriptionId: sub.id, statuses: ['issued', 'draft', 'failed'] })) {
      await this.voidInvoice(invoice, reason);
    }
  }

  async payInvoice(user: AuthUser, invoiceId: string, body: Record<string, unknown>) {
    const invoice = await this.store.getInvoice(invoiceId);
    if (!invoice || invoice.userId !== user.id) throw httpError(404, 'invoice_not_found', 'Tagihan tidak ditemukan.');
    if (!(invoice.status === 'issued' || (invoice.status === 'failed' && invoice.kind === 'renewal'))) {
      throw httpError(409, 'invoice_closed', 'Tagihan ini sudah tidak dapat dibayar.');
    }
    const sub = await this.store.getSubscription(invoice.subscriptionId);
    const plan = await this.planById(invoice.planId);
    if (!sub || !plan) throw httpError(404, 'invoice_not_found', 'Tagihan tidak ditemukan.');
    // Fase 6: tagihan transfer -> instruksi transfer (nominal berkode unik); tagihan lama tanpa Snap ikut diubah ke transfer.
    if (isTransferInvoice(invoice)) return this.publicInvoice(invoice, plan);
    if (!invoice.midtransOrderId && body.payment_method !== undefined ? body.payment_method === 'bank_transfer' : await this.usesTransfer(sub)) {
      if (!(await this.availableMethods()).includes('bank_transfer')) throw httpError(400, 'method_unavailable', 'Metode pembayaran ini sedang tidak tersedia untuk keanggotaan.');
      const converted = await this.store.updateInvoice(invoice.id, await this.transferFields(invoice.amount + invoice.uniqueDiscount), ['issued', 'failed']);
      if (!converted) throw httpError(409, 'invoice_closed', 'Tagihan ini sudah tidak dapat dibayar.');
      this.notify(sub, 'transferInstructions', await this.transferNotice(converted, sub, plan));
      return this.publicInvoice(converted, plan);
    }
    if (!this.ctx.midtrans.enabled) throw httpError(503, 'payment_unavailable', 'Pembayaran online belum dikonfigurasi.');
    const override = PAYMENT_METHODS.includes(body.payment_method as MembershipPaymentMethod) ? body.payment_method as MembershipPaymentMethod : null;
    try {
      return this.publicInvoice(await this.prepareSnap(invoice, sub, plan, override), plan);
    } catch (err: any) {
      if (err?.status) throw err;
      console.error('[membership] Snap gagal:', err?.message || err);
      throw httpError(502, 'payment_error', 'Gagal memulai pembayaran. Coba lagi.');
    }
  }

  // -------------------------------------------------------------------------
  // Transfer bank (fase 6 Langkah 4): instruksi, bukti, konfirmasi Finance
  // -------------------------------------------------------------------------
  private async ownTransferInvoice(user: AuthUser, invoiceId: string) {
    const invoice = await this.store.getInvoice(invoiceId);
    if (!invoice || invoice.userId !== user.id) throw httpError(404, 'invoice_not_found', 'Tagihan tidak ditemukan.');
    const sub = await this.store.getSubscription(invoice.subscriptionId);
    if (!sub) throw httpError(404, 'invoice_not_found', 'Tagihan tidak ditemukan.');
    return { invoice, sub };
  }

  /** Halaman instruksi: nominal berkode unik, rekening perusahaan, batas waktu, status bukti, tautan WhatsApp Finance. */
  async transferDetail(user: AuthUser, invoiceId: string) {
    const { invoice, sub } = await this.ownTransferInvoice(user, invoiceId);
    const plan = await this.planById(invoice.planId);
    const open = invoice.status === 'issued' && isTransferInvoice(invoice);
    return {
      invoice: this.publicInvoice(invoice, plan),
      planName: plan ? { id: plan.nameId, en: plan.nameEn } : null,
      subscriptionStatus: sub.status,
      // Rekening dan tautan konfirmasi hanya selama tagihan masih menunggu transfer.
      bankAccounts: open ? await this.bankAccounts() : [],
      financeWhatsappUrl: open ? await this.financeWhatsappUrl(invoice, sub) : null,
      expired: invoice.status === 'void' && invoice.failureReason === 'payment_expired'
    };
  }

  async uploadProof(user: AuthUser, invoiceId: string, req: Request) {
    const { invoice, sub } = await this.ownTransferInvoice(user, invoiceId);
    if (invoice.status === 'paid') throw httpError(409, 'already_paid', 'Pembayaran tagihan ini sudah dikonfirmasi.');
    if (invoice.status !== 'issued' || !isTransferInvoice(invoice)) throw httpError(409, 'invoice_closed', 'Tagihan ini tidak lagi menerima pembayaran.');
    let file: { buffer: Buffer; extension: string };
    try {
      file = await receiveProof(req);
    } catch (err) {
      if (err instanceof PrintCheckoutError) throw httpError(err.status, err.code, err.message);
      throw err;
    }
    const now = this.ctx.now();
    const objectPath = `membership-proofs/${invoice.id}/${now.getTime()}-${crypto.randomBytes(4).toString('hex')}.${file.extension}`;
    await this.ctx.storage.upload(objectPath, file.buffer, PROOF_CONTENT_TYPE[file.extension]);
    const updated = await this.store.updateInvoice(invoice.id, { paymentProofPath: objectPath, paymentProofUploadedAt: now.toISOString() }, ['issued']);
    if (!updated) throw httpError(409, 'invoice_closed', 'Tagihan ini tidak lagi menerima pembayaran.');
    await this.event(sub, 'transfer_proof', { invoiceId: invoice.id, amount: invoice.amount });
    if (this.ctx.adminEmails.length > 0) {
      this.ctx.defer(async () => {
        await this.ctx.mailer.send({
          to: this.ctx.adminEmails,
          subject: `[Bukti Transfer Keanggotaan] ${invoice.orderRef} - ${sub.customerName}`,
          html: `<p>Anggota mengunggah bukti transfer untuk tagihan keanggotaan <strong>${escapeHtml(invoice.orderRef)}</strong> (${escapeHtml(sub.customerName)}).</p>`
            + `<p>Nominal tagihan: <strong>Rp${new Intl.NumberFormat('id-ID').format(invoice.amount)}</strong>.</p>`
            + '<p>Buka tab Keanggotaan &gt; Transfer menunggu konfirmasi di dasbor admin untuk memeriksa mutasi dan mengonfirmasi.</p>'
        });
      });
    }
    return this.publicInvoice(updated, await this.planById(updated.planId));
  }

  /** Antrian Finance: tagihan transfer yang menunggu (atau baru kedaluwarsa, untuk transfer yang terlambat). */
  async adminTransfers(includeExpired = false) {
    const statuses: InvoiceRecord['status'][] = includeExpired ? ['issued', 'void'] : ['issued'];
    const invoices = (await this.store.listInvoices({ statuses, limit: 1000 }))
      .filter((i) => isTransferInvoice(i) && (i.status === 'issued' || i.failureReason === 'payment_expired'))
      .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
    const rows: Array<PublicInvoice & Record<string, unknown>> = [];
    for (const invoice of invoices) {
      const sub = await this.store.getSubscription(invoice.subscriptionId);
      const plan = await this.planById(invoice.planId);
      rows.push({
        ...this.publicInvoice(invoice, plan),
        subscriptionId: invoice.subscriptionId,
        subscriptionStatus: sub?.status ?? null,
        customerName: sub?.customerName ?? '',
        customerEmail: sub?.customerEmail ?? '',
        isTest: invoice.isTest,
        failureReason: invoice.failureReason,
        dueExtendedCount: invoice.dueExtendedCount
      });
    }
    return rows;
  }

  /** Konfirmasi Finance: satu-satunya jalan tagihan transfer menjadi lunas (sama dengan webhook: applyPaid). */
  async confirmTransfer(invoiceId: string, body: Record<string, unknown>) {
    const invoice = await this.store.getInvoice(invoiceId);
    if (!invoice || !isTransferInvoice(invoice)) throw httpError(404, 'invoice_not_found', 'Tagihan transfer tidak ditemukan.');
    if (invoice.status === 'paid') throw httpError(409, 'already_paid', 'Tagihan ini sudah dikonfirmasi.');
    const lateExpired = invoice.status === 'void' && invoice.failureReason === 'payment_expired';
    if (invoice.status !== 'issued' && !(lateExpired && body.allow_expired === true)) {
      throw httpError(409, 'invoice_closed', lateExpired
        ? 'Tagihan sudah kedaluwarsa. Centang "transfer terlambat" untuk tetap mengonfirmasi.'
        : 'Tagihan ini tidak lagi menunggu pembayaran.');
    }
    const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 120) : '';
    const result = await this.applyPaid(invoice, { ...EMPTY_PAYMENT, paymentType: 'bank_transfer' }, null);
    if (result === 'duplicate') throw httpError(409, 'already_paid', 'Tagihan ini sudah dikonfirmasi.');
    await this.store.updateInvoice(invoice.id, { paymentConfirmedBy: 'admin', paymentReference: reference || null });
    const sub = await this.store.getSubscription(invoice.subscriptionId);
    if (sub) await this.event(sub, 'transfer_confirmed', { invoiceId: invoice.id, amount: invoice.amount, late: lateExpired, result });
    if (result === 'orphan') throw httpError(409, 'payment_orphan', 'Pembayaran dicatat, tetapi tidak dapat diterapkan ke langganan (mis. anggota sudah punya langganan lain). Tangani manual/refund.');
    return this.publicInvoice((await this.store.getInvoice(invoice.id))!, await this.planById(invoice.planId));
  }

  /** Perpanjang batas transfer tagihan pendaftaran/upgrade (1–168 jam). */
  async extendTransfer(invoiceId: string, body: Record<string, unknown>) {
    const hours = Number(body.hours ?? this.cfg.pendingTtlHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw httpError(400, 'invalid_hours', 'Perpanjangan harus 1–168 jam.');
    const invoice = await this.store.getInvoice(invoiceId);
    if (!invoice || !isTransferInvoice(invoice)) throw httpError(404, 'invoice_not_found', 'Tagihan transfer tidak ditemukan.');
    if (invoice.status !== 'issued' || invoice.kind === 'renewal') {
      throw httpError(409, 'invoice_closed', 'Hanya tagihan pendaftaran/upgrade yang masih menunggu yang dapat diperpanjang. Untuk perpanjangan langganan gunakan masa tenggang.');
    }
    const base = Math.max(this.ctx.now().getTime(), Date.parse(invoice.dueAt ?? this.iso()));
    const updated = await this.store.updateInvoice(invoice.id, {
      dueAt: new Date(base + hours * HOUR_MS).toISOString(),
      dueExtendedCount: invoice.dueExtendedCount + 1
    }, ['issued']);
    if (!updated) throw httpError(409, 'invoice_closed', 'Tagihan ini tidak lagi menunggu pembayaran.');
    return this.publicInvoice(updated, await this.planById(updated.planId));
  }

  async transferProof(invoiceId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const invoice = await this.store.getInvoice(invoiceId);
    if (!invoice?.paymentProofPath) throw httpError(404, 'proof_not_found', 'Belum ada bukti transfer.');
    const extension = invoice.paymentProofPath.split('.').pop() ?? '';
    const buffer = await this.ctx.storage.download(invoice.paymentProofPath);
    return { buffer, contentType: PROOF_CONTENT_TYPE[extension] ?? 'application/octet-stream' };
  }

  /** Tagihan transfer melewati batas: di-void dan anggota diberi tahu (langganan pending ikut ditutup). */
  async expireTransfer(sub: SubscriptionRecord, invoice: InvoiceRecord): Promise<boolean> {
    if (invoice.kind === 'initial' && sub.status === 'pending') await this.voidPending(sub, 'payment_expired');
    else if (!(await this.voidInvoice(invoice, 'payment_expired'))) return false;
    const plan = await this.planById(invoice.planId);
    this.notify(sub, 'transferExpired', { planName: plan ? this.planName(plan, sub.language) : '', amount: invoice.amount, invoiceRef: invoice.orderRef });
    return true;
  }

  // -------------------------------------------------------------------------
  // Notifikasi Midtrans
  // -------------------------------------------------------------------------
  async handleNotification(n: Record<string, any>): Promise<{ status: number; body: Record<string, unknown> }> {
    const tx = n.transaction && typeof n.transaction === 'object' ? n.transaction : n;
    const orderId = String(tx.order_id || n.order_id || '');
    const remoteId = remoteSubscriptionIdOf(n);

    if (isMembershipOrderId(orderId)) {
      let source: Record<string, any> | null = null;
      if (verifyMidtransSignature(this.ctx.midtrans.serverKey, n)) source = n;
      else if (!n.signature_key) source = await this.gateway.getTransactionStatus(orderId);
      if (!source) {
        console.warn('[membership] notifikasi dengan signature tidak valid ditolak:', orderId);
        return { status: 403, body: { error: 'Invalid signature' } };
      }
      const invoice = await this.store.getInvoiceByOrderRef(orderRefOf(orderId));
      if (!invoice) return { status: 404, body: { error: 'Invoice not found' } };
      if (Math.round(Number(source.gross_amount)) !== invoice.amount) {
        console.error(`[membership] nominal ${source.gross_amount} tidak sama dengan invoice ${invoice.orderRef} (${invoice.amount})`);
        return { status: 400, body: { error: 'Amount mismatch' } };
      }
      return this.applyNotification(invoice, source, orderId, false);
    }

    if (remoteId) {
      const sub = (await this.store.listSubscriptions({ midtransSubscriptionId: remoteId, limit: 1 }))[0];
      if (!sub) return { status: 404, body: { error: 'Subscription not found' } };
      // Tagihan otomatis: isi notifikasi tidak dipercaya, status diambil ulang dari API Midtrans.
      const lookup = orderId || String(tx.transaction_id || '');
      const verified = lookup ? await this.gateway.getTransactionStatus(lookup) : null;
      if (!verified) return { status: 403, body: { error: 'Unverifiable notification' } };
      const verifiedOrderId = String(verified.order_id || orderId);
      if (await this.isOrderApplied(sub, verifiedOrderId)) return { status: 200, body: { status: 'duplicate' } };
      const invoice = await this.issueRenewalInvoice(sub, true);
      if (!invoice) return { status: 200, body: { status: 'ignored' } };
      return this.applyNotification(invoice, verified, verifiedOrderId, true);
    }
    return { status: 404, body: { error: 'Not a membership notification' } };
  }

  async isOrderApplied(sub: SubscriptionRecord, orderId: string): Promise<boolean> {
    return (await this.store.listInvoices({ subscriptionId: sub.id, statuses: ['paid'] })).some((i) => i.midtransOrderId === orderId);
  }

  private async applyNotification(invoice: InvoiceRecord, source: Record<string, any>, orderId: string, autodebit: boolean) {
    const target = mapMidtransToOrderStatus(String(source.transaction_status), source.fraud_status);
    const info = paymentInfoOf(source);
    if (target === 'paid') return { status: 200, body: { status: await this.applyPaid(invoice, info, orderId) } };
    if (target === 'refunded') {
      await this.applyRefund(invoice, String(source.transaction_status));
      return { status: 200, body: { status: 'refunded' } };
    }
    if (target === 'failed' || target === 'cancelled' || target === 'expired') {
      // Percobaan Snap lama (order_id attempt sebelumnya) yang kedaluwarsa tidak memengaruhi tagihan.
      if (!autodebit && invoice.midtransOrderId && orderId !== invoice.midtransOrderId) return { status: 200, body: { status: 'ignored' } };
      await this.applyFailed(invoice, target, autodebit, orderId);
      return { status: 200, body: { status: target } };
    }
    if (info.paymentType) await this.store.updateInvoice(invoice.id, { paymentType: info.paymentType });
    return { status: 200, body: { status: 'pending' } };
  }

  /** Invoice dibayar (webhook, pencocokan ulang, pembayaran offline admin). Idempoten: hanya transisi pertama yang berlaku. */
  async applyPaid(invoice: InvoiceRecord, info: PaymentInfo, orderId: string | null): Promise<'success' | 'duplicate' | 'orphan'> {
    const paid = await this.store.updateInvoice(invoice.id, {
      status: 'paid',
      paidAt: this.iso(),
      midtransOrderId: orderId ?? invoice.midtransOrderId,
      midtransTransactionId: info.transactionId,
      paymentType: info.paymentType ?? invoice.paymentType,
      midtransSnapToken: null,
      failureReason: null
    }, ['issued', 'draft', 'failed', 'void']);
    if (!paid) return 'duplicate';
    const sub = await this.store.getSubscription(paid.subscriptionId);
    if (!sub) return 'orphan';
    // Invoice Founding yang sudah di-void lalu tetap dibayar: ambil lagi kursinya (harga tetap dihormati).
    if (invoice.status === 'void' && paid.isFoundingPrice) await this.store.claimFoundingSlot(paid.planId);
    if (paid.kind === 'initial') return this.activate(sub, paid, info);
    if (paid.kind === 'upgrade') return this.applyUpgrade(sub, paid, info);
    return this.applyRenewal(sub, paid, info);
  }

  private async orphan(sub: SubscriptionRecord, invoice: InvoiceRecord): Promise<'orphan'> {
    await this.event(sub, 'payment_orphan', { invoiceId: invoice.id, orderRef: invoice.orderRef, amount: invoice.amount });
    console.error(`[membership] pembayaran ${invoice.orderRef} tidak dapat diterapkan ke langganan ${sub.id} — perlu penanganan admin (refund).`);
    return 'orphan';
  }

  private async activate(sub: SubscriptionRecord, invoice: InvoiceRecord, info: PaymentInfo) {
    const plan = await this.planById(invoice.planId);
    if (!plan) return this.orphan(sub, invoice);
    const start = this.iso();
    const end = periodEndFor(start, invoice.billingCycle);
    let updated: SubscriptionRecord | null = null;
    try {
      updated = await this.store.updateSubscription(sub.id, {
        status: 'active',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        priceLocked: invoice.amount + invoice.uniqueDiscount,
        isFounding: invoice.isFoundingPrice,
        foundingEndsAt: invoice.isFoundingPrice ? end : null,
        endedAt: null,
        endedReason: null
      }, ['pending', 'expired']);
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
    }
    if (!updated) return this.orphan(sub, invoice);
    await this.store.updateInvoice(invoice.id, { periodStart: start, periodEnd: end });
    await this.grantAccess(updated, plan, start, end);
    await this.event(updated, 'activated', { invoiceId: invoice.id, amount: invoice.amount, founding: invoice.isFoundingPrice });
    const withRemote = await this.setupAutodebit(updated, info);
    this.notify(withRemote ?? updated, 'welcome', {
      planName: this.planName(plan, updated.language),
      cycle: updated.billingCycle,
      date: end,
      invoiceRef: invoice.orderRef,
      pickTitles: this.effectiveShelfAccess(plan) === 'pick' ? plan.ebookTitlesPerPeriod ?? undefined : undefined
    });
    return 'success' as const;
  }

  private async applyRenewal(sub: SubscriptionRecord, invoice: InvoiceRecord, info: PaymentInfo) {
    const plan = await this.planById(invoice.planId);
    if (!plan) return this.orphan(sub, invoice);
    // Dibayar setelah langganan berakhir (Snap lama/offline): periode baru mulai sekarang.
    const reopen = sub.status === 'expired' || sub.status === 'canceled';
    const start = reopen ? this.iso() : invoice.periodStart;
    const end = reopen ? new Date(Date.parse(start) + (Date.parse(invoice.periodEnd) - Date.parse(invoice.periodStart))).toISOString() : invoice.periodEnd;
    const changed = invoice.planId !== sub.planId || invoice.billingCycle !== sub.billingCycle;
    let updated: SubscriptionRecord | null = null;
    try {
      updated = await this.store.updateSubscription(sub.id, {
        status: 'active',
        planId: invoice.planId,
        billingCycle: invoice.billingCycle,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        priceLocked: invoice.amount + invoice.uniqueDiscount,
        pendingPlanId: null,
        pendingBillingCycle: null,
        endedAt: null,
        endedReason: null,
        // Tenggang tambahan dari admin hanya untuk periode yang sudah lewat.
        extraGraceDays: 0,
        ...(reopen ? { cancelAtPeriodEnd: false, canceledAt: null } : {})
      }, reopen ? ['expired', 'canceled'] : OPEN_SUBSCRIPTION_STATUSES);
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
    }
    if (!updated) return this.orphan(sub, invoice);
    if (reopen) await this.store.updateInvoice(invoice.id, { periodStart: start, periodEnd: end });
    // Perubahan paket terjadwal berlaku: akses paket lama berakhir tepat di akhir periode lama.
    if (changed && sub.currentPeriodEnd && !reopen) await this.limitAccessTo(sub, sub.currentPeriodEnd);
    await this.grantAccess(updated, plan, start, end);
    const previousPlan = changed ? await this.planById(sub.planId) : null;
    const migrated = Boolean(previousPlan && !previousPlan.isActive && previousPlan.successorPlanId === invoice.planId);
    await this.event(updated, migrated ? 'plan_migrated' : changed ? 'downgraded' : 'renewed', {
      invoiceId: invoice.id, amount: invoice.amount, kind: invoice.kind, applied: changed, reopened: reopen, ...(migrated ? { from: previousPlan!.code, to: plan.code } : {})
    });
    if (changed) this.notify(updated, 'planChanged', { change: migrated ? 'upgrade' : 'downgrade_applied', planName: this.planName(plan, updated.language), cycle: updated.billingCycle, date: end });
    // Dibayar dengan kartu/GoPay yang ditokenisasi (mis. pindah dari VA ke auto-debit): mulai tagihan otomatis.
    if (!updated.midtransSubscriptionId && (info.savedTokenId || info.gopayAccountId)) await this.setupAutodebit(updated, info);
    return 'success' as const;
  }

  private async applyUpgrade(sub: SubscriptionRecord, invoice: InvoiceRecord, info: PaymentInfo) {
    const plan = await this.planById(invoice.planId);
    const fromPlan = await this.planById(sub.planId);
    if (!plan) return this.orphan(sub, invoice);
    const start = this.iso();
    const end = periodEndFor(start, invoice.billingCycle);
    const periodPrice = invoice.isFoundingPrice && plan.foundingPriceYearly !== null ? plan.foundingPriceYearly : priceFor(plan, invoice.billingCycle);
    const updated = await this.store.updateSubscription(sub.id, {
      planId: plan.id,
      billingCycle: invoice.billingCycle,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      priceLocked: periodPrice,
      isFounding: sub.isFounding || invoice.isFoundingPrice,
      foundingEndsAt: invoice.isFoundingPrice ? end : null,
      pendingPlanId: null,
      pendingBillingCycle: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      extraGraceDays: 0
    }, ['active']);
    if (!updated) return this.orphan(sub, invoice);
    await this.store.updateInvoice(invoice.id, { periodStart: start, periodEnd: end });
    const old = (await this.membershipEntitlements(sub)).filter((e) => e.status === 'active');
    if (old.length > 0) await this.store.updateEntitlements(old.map((e) => e.id), { status: 'revoked', revokedReason: 'upgraded', statusChangedBy: 'membership' });
    for (const renewal of await this.store.listInvoices({ subscriptionId: sub.id, kinds: ['renewal'], statuses: ['issued', 'failed'] })) {
      await this.voidInvoice(renewal, 'upgraded');
    }
    await this.grantAccess(updated, plan, start, end);
    // Jadwal Midtrans lama tidak cocok dengan periode baru: dibatalkan, lalu dibuat ulang dengan token tersimpan.
    let current = updated;
    const previousToken = decryptToken(this.cfg.tokenKey, sub.midtransToken);
    if (sub.midtransSubscriptionId) {
      await this.safeRemote(sub, 'cancel_on_upgrade', () => this.gateway.cancelSubscription(sub.midtransSubscriptionId!));
      current = (await this.store.updateSubscription(sub.id, { midtransSubscriptionId: null })) ?? current;
    }
    current = (await this.setupAutodebit(current, info, previousToken)) ?? current;
    await this.event(current, 'upgraded', { from: fromPlan?.code ?? null, to: plan.code, cycle: invoice.billingCycle, amount: invoice.amount });
    this.notify(current, 'planChanged', { change: 'upgrade', planName: this.planName(plan, current.language), cycle: current.billingCycle, date: end });
    return 'success' as const;
  }

  /** Mulai tagihan otomatis Midtrans Subscriptions dari token pembayaran (hanya bila ENABLE_AUTODEBIT). */
  async setupAutodebit(sub: SubscriptionRecord, info: PaymentInfo, fallbackToken: string | null = null): Promise<SubscriptionRecord | null> {
    if (!this.cfg.autodebitEnabled || (sub.paymentMethod !== 'card' && sub.paymentMethod !== 'gopay') || !sub.currentPeriodEnd) return null;
    let token: string | null = null;
    let accountId: string | null = sub.midtransAccountId;
    let expiresAt: string | null = sub.midtransTokenExpiresAt;
    if (sub.paymentMethod === 'card') {
      token = info.savedTokenId ?? fallbackToken;
      expiresAt = parseMidtransTime(info.savedTokenExpiresAt) ?? expiresAt;
    } else {
      const account = await this.safeRemote(sub, 'gopay_account', () => this.gateway.getGopayAccount(midtransUserRef(sub.userId)));
      token = account?.token ?? fallbackToken;
      accountId = account?.accountId ?? info.gopayAccountId ?? accountId;
    }
    if (!token) {
      await this.event(sub, 'autodebit_error', { reason: 'no_token' });
      return null;
    }
    const target = await this.renewalTarget(sub);
    const remote = await this.safeRemote(sub, 'create', () => this.gateway.createSubscription({
      name: remoteName(sub.id),
      amount: target.amount,
      paymentType: sub.paymentMethod === 'card' ? 'credit_card' : 'gopay',
      token: token!,
      gopayAccountId: accountId,
      intervalMonths: target.cycle === 'monthly' ? 1 : 12,
      maxInterval: target.cycle === 'monthly' ? 120 : 10,
      startTime: sub.currentPeriodEnd!,
      retryDays: this.cfg.autodebitRetryDays,
      customer: { firstName: sub.customerName, email: sub.customerEmail },
      metadata: { subscription_id: sub.id }
    }));
    if (!remote?.id) return null;
    return this.store.updateSubscription(sub.id, {
      midtransSubscriptionId: remote.id,
      midtransToken: encryptToken(this.cfg.tokenKey, token),
      midtransTokenExpiresAt: expiresAt,
      midtransAccountId: accountId
    });
  }

  async safeRemote<T>(sub: SubscriptionRecord, action: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err: any) {
      console.warn(`[membership] Midtrans ${action} gagal (${sub.id}):`, err?.message || err);
      await this.event(sub, 'autodebit_error', { action, message: String(err?.message || err).slice(0, 300) });
      return null;
    }
  }

  async applyFailed(invoice: InvoiceRecord, target: 'failed' | 'cancelled' | 'expired', autodebit: boolean, orderId: string): Promise<void> {
    const sub = await this.store.getSubscription(invoice.subscriptionId);
    if (!sub) return;
    if (invoice.kind === 'initial') {
      await this.voidPending(sub, `payment_${target}`);
      return;
    }
    if (invoice.kind === 'upgrade') {
      if (await this.voidInvoice(invoice, `payment_${target}`)) await this.event(sub, 'payment_failed', { invoiceId: invoice.id, kind: 'upgrade', status: target });
      return;
    }
    if (autodebit) {
      const attempt = invoice.attempt + 1;
      await this.store.updateInvoice(invoice.id, { status: 'failed', attempt, failureReason: target, midtransOrderId: orderId }, ['issued', 'failed']);
      const updated = (await this.store.updateSubscription(sub.id, { status: 'past_due' }, ['active', 'grace', 'past_due'])) ?? sub;
      await this.event(updated, 'payment_failed', { invoiceId: invoice.id, attempt, status: target }, `payment_failed:${invoice.id}:${attempt}`);
      // Satu email per tagihan (Midtrans mengulang H+1..H+3; email "akses dikunci" menyusul bila tetap gagal).
      if (await this.event(updated, 'payment_failed', { invoiceId: invoice.id, notified: true }, `payment_failed_email:${invoice.id}`)) {
        const plan = await this.planById(invoice.planId);
        this.notify(updated, 'paymentFailed', { planName: plan ? this.planName(plan, updated.language) : '', amount: invoice.amount, invoiceRef: invoice.orderRef });
      }
      return;
    }
    // Snap manual gagal/kedaluwarsa: tagihan tetap terbuka; pembayaran berikutnya membuat percobaan baru.
    await this.store.updateInvoice(invoice.id, { midtransSnapToken: null, failureReason: target }, ['issued']);
  }

  /** Refund/chargeback tagihan keanggotaan: akses dicabut dan langganan diakhiri (penanganan lanjut oleh admin). */
  async applyRefund(invoice: InvoiceRecord, status: string): Promise<void> {
    const voided = await this.store.updateInvoice(invoice.id, { status: 'void', failureReason: status }, ['paid']);
    if (!voided) return;
    const sub = await this.store.getSubscription(invoice.subscriptionId);
    if (!sub) return;
    const rows = (await this.membershipEntitlements(sub)).filter((e) => e.status === 'active');
    if (rows.length > 0) await this.store.updateEntitlements(rows.map((e) => e.id), { status: 'revoked', revokedReason: `membership_${status}`, statusChangedBy: 'webhook' });
    for (const userId of new Set([sub.userId, ...rows.map((e) => e.userId)])) await this.store.endSessions({ userId }, 'revoked');
    if (sub.midtransSubscriptionId) await this.safeRemote(sub, 'cancel_on_refund', () => this.gateway.cancelSubscription(sub.midtransSubscriptionId!));
    await this.store.updateSubscription(sub.id, { status: 'canceled', endedAt: this.iso(), endedReason: 'refunded', midtransSubscriptionId: null });
    await this.event(sub, 'refunded', { invoiceId: invoice.id, status });
  }

  // -------------------------------------------------------------------------
  // Perpanjangan
  // -------------------------------------------------------------------------
  /** Invoice perpanjangan periode berikutnya (H-7, atau `force` saat tagihan otomatis/jatuh tempo). Satu per periode. */
  async issueRenewalInvoice(sub: SubscriptionRecord, force = false): Promise<InvoiceRecord | null> {
    if (!sub.currentPeriodEnd || !PAID_STATES.includes(sub.status)) return null;
    if (sub.cancelAtPeriodEnd) return null;
    const now = this.ctx.now();
    const due = Date.parse(sub.currentPeriodEnd);
    if (!force && now.getTime() < due - Math.max(...this.cfg.reminderDays) * DAY_MS) return null;
    const find = async () => (await this.store.listInvoices({ subscriptionId: sub.id, kinds: ['renewal'] }))
      .find((i) => i.periodStart === sub.currentPeriodEnd && i.status !== 'void') ?? null;
    const existing = await find();
    if (existing) return existing;
    const target = await this.renewalTarget(sub);
    const pricing = (await this.usesTransfer(sub)) ? await this.transferFields(target.amount) : { amount: target.amount, paymentType: null };
    let invoice: InvoiceRecord;
    try {
      invoice = await this.store.createInvoice({
        ...pricing,
        subscriptionId: sub.id,
        userId: sub.userId,
        kind: 'renewal',
        planId: target.plan.id,
        billingCycle: target.cycle,
        periodStart: sub.currentPeriodEnd,
        periodEnd: periodEndFor(sub.currentPeriodEnd, target.cycle),
        status: 'issued',
        orderRef: newOrderRef(now),
        midtransOrderId: null,
        midtransSnapToken: null,
        snapRedirectUrl: null,
        snapCreatedAt: null,
        midtransTransactionId: null,
        claimsFounding: false,
        isFoundingPrice: false,
        issuedAt: now.toISOString(),
        paidAt: null,
        dueAt: sub.currentPeriodEnd,
        attempt: 0,
        failureReason: null,
        isTest: sub.isTest
      });
    } catch (err) {
      if (err instanceof ConflictError) return find();
      throw err;
    }
    await this.event(sub, 'invoice_issued', { invoiceId: invoice.id, amount: invoice.amount, due: sub.currentPeriodEnd }, `invoice_issued:${invoice.id}`);
    if (this.autodebitActive(sub)) await this.syncRemote(sub, target);
    return invoice;
  }

  /** Samakan nominal/interval langganan Midtrans dengan perpanjangan berikutnya (Founding -> reguler, downgrade). */
  private async syncRemote(sub: SubscriptionRecord, target: { plan: PlanRecord; cycle: BillingCycle; amount: number }): Promise<void> {
    if (!sub.midtransSubscriptionId || !sub.currentPeriodEnd) return;
    if (sub.midtransTokenExpiresAt && Date.parse(sub.midtransTokenExpiresAt) <= Date.parse(sub.currentPeriodEnd)) {
      // Token kartu kedaluwarsa sebelum tanggal tagih: berhenti auto-debit, perpanjangan lewat tagihan manual.
      await this.safeRemote(sub, 'cancel_token_expired', () => this.gateway.cancelSubscription(sub.midtransSubscriptionId!));
      await this.store.updateSubscription(sub.id, { midtransSubscriptionId: null, midtransToken: null });
      await this.event(sub, 'autodebit_error', { reason: 'token_expired' });
      return;
    }
    const token = decryptToken(this.cfg.tokenKey, sub.midtransToken);
    if (!token) return;
    await this.safeRemote(sub, 'update', () => this.gateway.updateSubscription(sub.midtransSubscriptionId!, {
      name: remoteName(sub.id),
      amount: target.amount,
      token,
      gopayAccountId: sub.midtransAccountId,
      intervalMonths: target.cycle === 'monthly' ? 1 : 12
    }));
  }

  /** Pencocokan ulang ke Midtrans sebelum grace/expired (notifikasi bisa hilang). true = pembayaran ditemukan & diterapkan. */
  async reconcile(invoice: InvoiceRecord, sub: SubscriptionRecord): Promise<boolean> {
    try {
      if (sub.midtransSubscriptionId && invoice.kind === 'renewal') {
        const remote = await this.gateway.getSubscription(sub.midtransSubscriptionId);
        for (const txId of [...(remote?.transactionIds ?? [])].reverse().slice(0, 5)) {
          const status = await this.gateway.getTransactionStatus(txId);
          if (!status) continue;
          const orderId = String(status.order_id || txId);
          if (await this.isOrderApplied(sub, orderId)) continue;
          if (mapMidtransToOrderStatus(String(status.transaction_status), status.fraud_status) === 'paid'
            && await this.applyPaid(invoice, paymentInfoOf(status), orderId) === 'success') {
            await this.event(sub, 'reconciled', { invoiceId: invoice.id, orderId });
            return true;
          }
        }
        return false;
      }
      if (invoice.midtransOrderId) {
        const status = await this.gateway.getTransactionStatus(invoice.midtransOrderId);
        if (status && mapMidtransToOrderStatus(String(status.transaction_status), status.fraud_status) === 'paid'
          && Math.round(Number(status.gross_amount)) === invoice.amount
          && await this.applyPaid(invoice, paymentInfoOf(status), invoice.midtransOrderId) === 'success') {
          await this.event(sub, 'reconciled', { invoiceId: invoice.id, orderId: invoice.midtransOrderId });
          return true;
        }
      }
    } catch (err: any) {
      console.warn(`[membership] pencocokan ulang ${invoice.orderRef} gagal:`, err?.message || err);
    }
    return false;
  }

  async markPastDue(sub: SubscriptionRecord, invoice: InvoiceRecord): Promise<boolean> {
    const updated = await this.store.updateSubscription(sub.id, { status: 'past_due' }, ['active']);
    if (!updated) return false;
    if (await this.event(updated, 'payment_failed', { invoiceId: invoice.id, reason: 'not_charged_by_due' }, `payment_failed_email:${invoice.id}`)) {
      const plan = await this.planById(invoice.planId);
      this.notify(updated, 'paymentFailed', { planName: plan ? this.planName(plan, updated.language) : '', amount: invoice.amount, invoiceRef: invoice.orderRef });
    }
    return true;
  }

  async startGrace(sub: SubscriptionRecord, invoice: InvoiceRecord): Promise<boolean> {
    const updated = await this.store.updateSubscription(sub.id, { status: 'grace' }, ['active']);
    if (!updated) return false;
    if (await this.event(updated, 'grace_started', { invoiceId: invoice.id, graceEndsAt: this.graceEndsAt(updated) }, `grace:${invoice.id}`)) {
      const plan = await this.planById(invoice.planId);
      this.notify(updated, 'grace', { planName: plan ? this.planName(plan, updated.language) : '', amount: invoice.amount, date: this.graceEndsAt(updated), invoiceRef: invoice.orderRef });
    }
    return true;
  }

  /** Masa tenggang habis tanpa pembayaran: akses berakhir alami (ends_at = akhir periode + tenggang). */
  async expire(sub: SubscriptionRecord, invoice: InvoiceRecord | null): Promise<boolean> {
    const updated = await this.store.updateSubscription(sub.id, { status: 'expired', endedAt: this.iso(), endedReason: 'unpaid' }, ['grace', 'past_due']);
    if (!updated) return false;
    if (invoice) await this.voidInvoice(invoice, 'unpaid');
    if (sub.midtransSubscriptionId) {
      await this.safeRemote(sub, 'cancel_on_expire', () => this.gateway.cancelSubscription(sub.midtransSubscriptionId!));
      await this.store.updateSubscription(sub.id, { midtransSubscriptionId: null });
    }
    if (await this.event(updated, 'expired', { invoiceId: invoice?.id ?? null }, `expired:${sub.id}:${sub.currentPeriodEnd}`)) {
      const plan = await this.planById(sub.planId);
      this.notify(updated, 'locked', { planName: plan ? this.planName(plan, updated.language) : '' });
    }
    return true;
  }

  /** Akhir periode setelah pembatalan: status canceled, langganan Midtrans dihentikan permanen. */
  async finishCanceled(sub: SubscriptionRecord): Promise<boolean> {
    const updated = await this.store.updateSubscription(sub.id, { status: 'canceled', endedAt: this.iso(), endedReason: 'canceled' }, ['active', 'past_due', 'grace']);
    if (!updated) return false;
    if (sub.midtransSubscriptionId) {
      await this.safeRemote(sub, 'cancel', () => this.gateway.cancelSubscription(sub.midtransSubscriptionId!));
      await this.store.updateSubscription(sub.id, { midtransSubscriptionId: null });
    }
    for (const invoice of await this.store.listInvoices({ subscriptionId: sub.id, statuses: ['issued', 'failed'] })) await this.voidInvoice(invoice, 'canceled');
    if (sub.currentPeriodEnd) await this.limitAccessTo(sub, sub.currentPeriodEnd);
    await this.event(updated, 'canceled', { final: true }, `ended:${sub.id}`);
    return true;
  }

  /**
   * Paket fase 3 tidak dijual lagi: 30 hari sebelum perpanjangan anggota diberi tahu paket penerus dan harganya.
   * Sekali per periode. true = pemberitahuan baru dikirim.
   */
  async sendPlanMigrationNotice(sub: SubscriptionRecord): Promise<boolean> {
    if (sub.status !== 'active' || sub.cancelAtPeriodEnd || !sub.currentPeriodEnd || sub.pendingPlanId) return false;
    const current = await this.planById(sub.planId);
    if (!current || current.isActive || !current.successorPlanId) return false;
    const due = Date.parse(sub.currentPeriodEnd);
    const now = this.ctx.now().getTime();
    if (now < due - PLAN_MIGRATION_NOTICE_DAYS * DAY_MS || now >= due) return false;
    const target = await this.renewalTarget(sub);
    if (!(await this.event(sub, 'plan_migration_notice', { from: current.code, to: target.plan.code, amount: target.amount, effectiveAt: sub.currentPeriodEnd },
      `plan_migration_notice:${sub.id}:${sub.currentPeriodEnd}`))) return false;
    this.notify(sub, 'planMigration', {
      fromPlanName: this.planName(current, sub.language),
      planName: this.planName(target.plan, sub.language),
      cycle: target.cycle,
      amount: target.amount,
      date: sub.currentPeriodEnd
    });
    return true;
  }

  /** Pengingat H-7/H-3/H-1/H0 (manual) atau satu pemberitahuan H-7 (auto-debit); tercatat sekali per hari-H. */
  async sendReminders(sub: SubscriptionRecord, invoice: InvoiceRecord): Promise<number> {
    const now = this.ctx.now().getTime();
    const due = Date.parse(invoice.dueAt ?? sub.currentPeriodEnd ?? this.iso());
    const plan = await this.planById(invoice.planId);
    const planName = plan ? this.planName(plan, sub.language) : '';
    if (this.autodebitActive(sub)) {
      if (!(await this.event(sub, 'reminder_sent', { invoiceId: invoice.id, days: 7, autodebit: true }, `reminder:${invoice.id}:auto`))) return 0;
      this.notify(sub, 'invoice', { planName, amount: invoice.amount, date: invoice.dueAt, autodebit: true, invoiceRef: invoice.orderRef });
      return 1;
    }
    const crossed = this.cfg.reminderDays.filter((d) => now >= due - d * DAY_MS).sort((a, b) => a - b);
    if (crossed.length === 0) return 0;
    let fresh = false;
    for (const days of crossed) {
      if (await this.event(sub, 'reminder_sent', { invoiceId: invoice.id, days }, `reminder:${invoice.id}:${days}`)) fresh = true;
    }
    if (!fresh) return 0;
    // Hanya pengingat terbaru yang dikirim (job yang terlambat tidak mengirim beberapa email sekaligus).
    const days = crossed[0];
    this.notify(sub, days === Math.max(...this.cfg.reminderDays) ? 'invoice' : 'reminder', {
      planName, amount: invoice.amount, date: invoice.dueAt, days, autodebit: false, invoiceRef: invoice.orderRef,
      ...(isTransferInvoice(invoice) ? { transfer: (await this.transferNotice(invoice, sub, await this.planById(invoice.planId))).transfer } : {})
    });
    return 1;
  }

  // -------------------------------------------------------------------------
  // Ubah paket, batal, metode bayar
  // -------------------------------------------------------------------------
  async changePlan(user: AuthUser, body: Record<string, unknown>) {
    const sub = await this.openSubscription(user.id);
    if (!sub || sub.status === 'pending' || !sub.currentPeriodStart || !sub.currentPeriodEnd) throw httpError(404, 'no_subscription', 'Anda belum memiliki keanggotaan aktif.');
    if (sub.status !== 'active') throw httpError(409, 'payment_required', 'Selesaikan tagihan yang tertunggak lebih dulu.');
    const target = await this.planByCode(String(body.plan_code || ''));
    const cycle = String(body.billing_cycle || '') as BillingCycle;
    if (!target || !target.isActive || !BILLING_CYCLES.includes(cycle) || priceFor(target, cycle) <= 0) throw httpError(400, 'plan_unavailable', 'Paket tidak tersedia.');
    const current = await this.planById(sub.planId);
    if (!current) throw new Error('Paket langganan tidak ditemukan');
    if (target.id === sub.planId && cycle === sub.billingCycle) throw httpError(400, 'no_change', 'Paket dan siklus sama dengan yang berjalan.');

    const planUp = PLAN_RANK[target.code] > PLAN_RANK[current.code];
    const planSame = target.id === current.id;
    const cycleUp = sub.billingCycle === 'monthly' && cycle === 'yearly';
    const cycleDown = sub.billingCycle === 'yearly' && cycle === 'monthly';
    // Upgrade dan bulanan -> tahunan berlaku seketika (prorata); downgrade dan tahunan -> bulanan di akhir periode.
    if ((planUp && !cycleDown) || (planSame && cycleUp)) {
      return { mode: 'immediate' as const, ...(await this.startUpgrade(sub, target, cycle, body.payment_method)) };
    }
    if (sub.cancelAtPeriodEnd) throw httpError(409, 'canceled', 'Batalkan pembatalan terlebih dahulu untuk menjadwalkan perubahan paket.');
    const updated = await this.store.updateSubscription(sub.id, {
      pendingPlanId: planSame ? null : target.id,
      pendingBillingCycle: cycle === sub.billingCycle ? null : cycle
    }, ['active']);
    if (!updated) throw httpError(409, 'payment_required', 'Status keanggotaan berubah. Muat ulang halaman.');
    await this.reissueRenewal(updated);
    await this.event(updated, 'downgraded', { to: target.code, cycle, effectiveAt: sub.currentPeriodEnd, scheduled: true });
    this.notify(updated, 'planChanged', { change: 'downgrade_scheduled', planName: this.planName(target, updated.language), cycle, date: sub.currentPeriodEnd });
    return { mode: 'scheduled' as const, subscription: await this.publicSubscription(updated), invoice: null, credit: 0, price: priceFor(target, cycle) };
  }

  private async startUpgrade(sub: SubscriptionRecord, target: PlanRecord, cycle: BillingCycle, rawMethod: unknown) {
    const now = this.ctx.now();
    const nowIso = now.toISOString();
    const start = Date.parse(sub.currentPeriodStart!);
    const end = Date.parse(sub.currentPeriodEnd!);
    // Kredit prorata = bagian harga periode berjalan yang belum terpakai.
    const credit = Math.round(sub.priceLocked * Math.max(0, end - now.getTime()) / Math.max(1, end - start));
    for (const previous of await this.store.listInvoices({ subscriptionId: sub.id, kinds: ['upgrade'], statuses: ['issued', 'failed'] })) {
      await this.voidInvoice(previous, 'replaced');
    }
    // Founding hanya ikut bila paket tujuan tahunan dan kuotanya masih ada.
    const claimed = cycle === 'yearly' && target.foundingPriceYearly !== null && target.foundingCap !== null ? await this.store.claimFoundingSlot(target.id) : false;
    const price = claimed ? target.foundingPriceYearly! : priceFor(target, cycle);
    const amount = Math.max(0, price - credit);
    const transfer = amount > 0 && (rawMethod !== undefined && rawMethod !== null && rawMethod !== ''
      ? rawMethod === 'bank_transfer'
      : await this.usesTransfer(sub));
    if (transfer && !(await this.availableMethods()).includes('bank_transfer')) {
      if (claimed) await this.releaseFoundingQuietly(target.id);
      throw httpError(400, 'method_unavailable', 'Metode pembayaran ini sedang tidak tersedia untuk keanggotaan.');
    }
    let invoice: InvoiceRecord;
    try {
      invoice = await this.store.createInvoice({
        subscriptionId: sub.id,
        userId: sub.userId,
        kind: 'upgrade',
        planId: target.id,
        billingCycle: cycle,
        periodStart: nowIso,
        periodEnd: periodEndFor(nowIso, cycle),
        amount,
        status: 'issued',
        orderRef: newOrderRef(now),
        midtransOrderId: null,
        midtransSnapToken: null,
        snapRedirectUrl: null,
        snapCreatedAt: null,
        midtransTransactionId: null,
        paymentType: null,
        ...(transfer ? await this.transferFields(amount) : {}),
        claimsFounding: claimed,
        isFoundingPrice: claimed,
        issuedAt: nowIso,
        paidAt: null,
        dueAt: new Date(now.getTime() + this.cfg.pendingTtlHours * HOUR_MS).toISOString(),
        attempt: 0,
        failureReason: null,
        isTest: sub.isTest
      });
    } catch (err: any) {
      // Tagihan upgrade tidak tersimpan: kursi Founding dilepas, tanpa transaksi pembayaran; keanggotaan berjalan tidak berubah.
      console.error('[membership] Tagihan upgrade tidak tersimpan; transaksi pembayaran tidak dibuat:', { subscriptionId: sub.id, target: target.code, error: err?.message || err });
      if (claimed) await this.releaseFoundingQuietly(target.id);
      throw httpError(503, 'order_not_saved', ORDER_NOT_SAVED_MESSAGE);
    }
    if (amount <= 0) {
      await this.applyPaid(invoice, EMPTY_PAYMENT, null);
      return { invoice: null, applied: true, credit, price, subscription: await this.publicSubscription((await this.store.getSubscription(sub.id))!) };
    }
    if (transfer) {
      this.notify(sub, 'transferInstructions', await this.transferNotice(invoice, sub, target));
      return { invoice: this.publicInvoice(invoice, target), applied: false, credit, price, subscription: await this.publicSubscription(sub) };
    }
    if (!this.ctx.midtrans.enabled) {
      await this.voidInvoice(invoice, 'payment_unavailable');
      throw httpError(503, 'payment_unavailable', 'Pembayaran online belum dikonfigurasi.');
    }
    const method = PAYMENT_METHODS.includes(rawMethod as MembershipPaymentMethod) ? rawMethod as MembershipPaymentMethod : sub.paymentMethod;
    try {
      await this.assertMethodRouted(method);
    } catch (err) {
      await this.voidInvoice(invoice, 'method_unavailable');
      throw err;
    }
    try {
      invoice = await this.prepareSnap(invoice, sub, target, method);
    } catch (err: any) {
      await this.voidInvoice(invoice, 'snap_error');
      if (err?.status) throw err;
      throw httpError(502, 'payment_error', 'Gagal memulai pembayaran. Coba lagi.');
    }
    return { invoice: this.publicInvoice(invoice, target), applied: false, credit, price, subscription: await this.publicSubscription(sub) };
  }

  /** Invoice perpanjangan yang sudah terbit mengikuti paket/siklus terbaru: di-void lalu diterbitkan ulang. */
  async reissueRenewal(sub: SubscriptionRecord): Promise<void> {
    for (const invoice of await this.store.listInvoices({ subscriptionId: sub.id, kinds: ['renewal'], statuses: ['issued', 'failed'] })) {
      await this.voidInvoice(invoice, 'plan_changed');
    }
    await this.issueRenewalInvoice(sub);
  }

  async cancelChange(user: AuthUser) {
    const sub = await this.openSubscription(user.id);
    if (!sub || (!sub.pendingPlanId && !sub.pendingBillingCycle)) throw httpError(404, 'no_pending_change', 'Tidak ada perubahan paket terjadwal.');
    const updated = await this.store.updateSubscription(sub.id, { pendingPlanId: null, pendingBillingCycle: null });
    if (!updated) throw httpError(404, 'no_pending_change', 'Tidak ada perubahan paket terjadwal.');
    await this.reissueRenewal(updated);
    await this.event(updated, 'change_canceled', {});
    return this.publicSubscription(updated);
  }

  async cancel(user: AuthUser) {
    const sub = await this.openSubscription(user.id);
    if (!sub || sub.status === 'pending' || !sub.currentPeriodEnd) throw httpError(404, 'no_subscription', 'Anda belum memiliki keanggotaan aktif.');
    if (sub.cancelAtPeriodEnd) throw httpError(409, 'already_canceled', 'Keanggotaan sudah dibatalkan.');
    const plan = await this.planById(sub.planId);
    const nowIso = this.iso();
    let updated: SubscriptionRecord | null;
    let accessEndsAt: string;
    if (sub.status === 'active') {
      updated = await this.store.updateSubscription(sub.id, { cancelAtPeriodEnd: true, canceledAt: nowIso }, ['active']);
      accessEndsAt = sub.currentPeriodEnd;
    } else {
      // Masa tenggang / tunggakan: periode sudah lewat, akses berakhir sekarang.
      updated = await this.store.updateSubscription(sub.id, { status: 'canceled', cancelAtPeriodEnd: true, canceledAt: nowIso, endedAt: nowIso, endedReason: 'canceled_by_member' }, ['past_due', 'grace']);
      accessEndsAt = nowIso;
    }
    if (!updated) throw httpError(409, 'state_changed', 'Status keanggotaan berubah. Muat ulang halaman.');
    await this.limitAccessTo(sub, accessEndsAt);
    for (const invoice of await this.store.listInvoices({ subscriptionId: sub.id, kinds: ['renewal', 'upgrade'], statuses: ['issued', 'failed'] })) {
      await this.voidInvoice(invoice, 'canceled');
    }
    // Tidak ada tagihan berikutnya: langganan Midtrans dinonaktifkan (bisa diaktifkan lagi bila pembatalan dibatalkan).
    if (sub.midtransSubscriptionId) {
      await this.safeRemote(sub, sub.status === 'active' ? 'disable' : 'cancel', () =>
        sub.status === 'active' ? this.gateway.disableSubscription(sub.midtransSubscriptionId!) : this.gateway.cancelSubscription(sub.midtransSubscriptionId!));
    }
    await this.event(updated, 'canceled', { atPeriodEnd: sub.status === 'active', accessEndsAt });
    this.notify(updated, 'canceled', { planName: plan ? this.planName(plan, updated.language) : '', date: accessEndsAt });
    return this.publicSubscription(updated);
  }

  async resume(user: AuthUser) {
    const sub = await this.openSubscription(user.id);
    if (!sub || sub.status !== 'active' || !sub.cancelAtPeriodEnd || !sub.currentPeriodEnd) throw httpError(404, 'nothing_to_resume', 'Tidak ada pembatalan yang bisa dibatalkan.');
    if (this.ctx.now().getTime() >= Date.parse(sub.currentPeriodEnd)) throw httpError(409, 'period_ended', 'Periode sudah berakhir.');
    const updated = await this.store.updateSubscription(sub.id, { cancelAtPeriodEnd: false, canceledAt: null }, ['active']);
    if (!updated) throw httpError(409, 'state_changed', 'Status keanggotaan berubah. Muat ulang halaman.');
    await this.restoreAccess(updated);
    let current = updated;
    if (sub.midtransSubscriptionId) {
      const enabled = await this.safeRemote(sub, 'enable', () => this.gateway.enableSubscription(sub.midtransSubscriptionId!).then(() => true));
      if (!enabled) {
        // Tidak bisa diaktifkan lagi: buat ulang dari token tersimpan (bila ada), selain itu perpanjangan manual.
        await this.safeRemote(sub, 'cancel', () => this.gateway.cancelSubscription(sub.midtransSubscriptionId!));
        current = (await this.store.updateSubscription(sub.id, { midtransSubscriptionId: null })) ?? current;
        current = (await this.setupAutodebit(current, EMPTY_PAYMENT, decryptToken(this.cfg.tokenKey, sub.midtransToken))) ?? current;
      }
    }
    await this.event(current, 'cancel_reverted', {});
    await this.issueRenewalInvoice(current);
    return this.publicSubscription(current);
  }

  async changePaymentMethod(user: AuthUser, body: Record<string, unknown>) {
    const method = String(body.payment_method || '') as MembershipPaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) throw httpError(400, 'invalid_request', 'Metode pembayaran tidak valid.');
    const sub = await this.openSubscription(user.id);
    if (!sub || sub.status === 'pending') throw httpError(404, 'no_subscription', 'Anda belum memiliki keanggotaan aktif.');
    if (method === sub.paymentMethod) return this.publicSubscription(sub);
    // Token kartu dan GoPay tidak bisa dipertukarkan: tagihan otomatis lama dihentikan; metode baru berlaku pada
    // pembayaran berikutnya (kartu/GoPay ditokenisasi saat membayar tagihan itu bila auto-debit aktif).
    if (sub.midtransSubscriptionId) await this.safeRemote(sub, 'cancel_on_method_change', () => this.gateway.cancelSubscription(sub.midtransSubscriptionId!));
    const updated = await this.store.updateSubscription(sub.id, { paymentMethod: method, midtransSubscriptionId: null, midtransToken: null, midtransTokenExpiresAt: null, midtransAccountId: null });
    if (!updated) throw httpError(409, 'state_changed', 'Status keanggotaan berubah. Muat ulang halaman.');
    for (const invoice of await this.store.listInvoices({ subscriptionId: sub.id, statuses: ['issued'] })) {
      await this.store.updateInvoice(invoice.id, { midtransSnapToken: null }, ['issued']);
    }
    await this.event(updated, 'payment_method_changed', { from: sub.paymentMethod, to: method });
    return this.publicSubscription(updated);
  }

  /** Nyalakan/matikan pengingat WhatsApp. Body: { opt_in: boolean, whatsapp_number? }. Mematikan menghapus nomor. */
  async updateWhatsApp(user: AuthUser, body: Record<string, unknown>) {
    const sub = (await this.openSubscription(user.id)) ?? (await this.latestSubscription(user.id));
    if (!sub) throw httpError(404, 'no_subscription', 'Anda belum memiliki keanggotaan.');
    const optIn = body.opt_in === true;
    const provided = body.whatsapp_number !== undefined && body.whatsapp_number !== null && String(body.whatsapp_number).trim() !== '';
    const number = provided ? normalizeWhatsAppNumber(body.whatsapp_number) : sub.whatsappNumber;
    if (optIn && !number) throw httpError(400, 'invalid_whatsapp', 'Nomor WhatsApp tidak valid.');
    const unchanged = optIn && sub.whatsappOptIn && number === sub.whatsappNumber;
    const updated = await this.store.updateSubscription(sub.id, {
      whatsappNumber: optIn ? number : null,
      whatsappOptIn: optIn,
      whatsappOptInAt: optIn ? (unchanged ? sub.whatsappOptInAt : this.iso()) : null
    });
    if (!updated) throw httpError(409, 'state_changed', 'Status keanggotaan berubah. Muat ulang halaman.');
    return this.publicSubscription(updated);
  }

  // -------------------------------------------------------------------------
  // Digital Reading Shelf & Digital Member Pick
  // -------------------------------------------------------------------------
  async shelfProducts(): Promise<ProductRecord[]> {
    const today = jakartaDate(this.ctx.now());
    return (await this.store.listProductsWithShelfDate()).filter((p) => isProductOnShelf(p, today));
  }

  async upcomingProducts(): Promise<ProductRecord[]> {
    const today = jakartaDate(this.ctx.now());
    return (await this.store.listProductsWithShelfDate())
      .filter((p) => p.shelfEntryDate! > today)
      .sort((a, b) => a.shelfEntryDate!.localeCompare(b.shelfEntryDate!));
  }

  /** Slot bulanan di dalam periode tagihan (paket tahunan: jatah judul dan jam audio tetap per bulan). */
  pickSlot(sub: SubscriptionRecord): { start: string; end: string } {
    return monthSlot(sub.currentPeriodStart!, sub.currentPeriodEnd!, this.ctx.now());
  }

  private async pickState(user: AuthUser) {
    const sub = await this.openSubscription(user.id);
    if (!sub || !PAID_STATES.includes(sub.status) || !sub.currentPeriodStart || !sub.currentPeriodEnd) return null;
    const plan = await this.planById(sub.planId);
    if (!plan || this.effectiveShelfAccess(plan) !== 'pick') return null;
    const slot = this.pickSlot(sub);
    // Fase 6: jatah N judul e-book per bulan. Paket Reader fase 3: satu Digital Member Pick per bulan.
    if (plan.ebookTitlesPerPeriod !== null) {
      const picks = await this.store.listTitlePicks({ subscriptionId: sub.id, userId: user.id, periodStart: slot.start });
      return { sub, plan, slot, mode: 'quota' as const, limit: plan.ebookTitlesPerPeriod, picks, current: null };
    }
    const current = (await this.store.listPicks({ subscriptionId: sub.id })).find((p) => p.periodStart === slot.start) ?? null;
    return { sub, plan, slot, mode: 'legacy' as const, limit: 1, picks: [], current };
  }

  /** Judul yang boleh dipilih dengan jatah paket ini hari ini (e-book, terbuka untuk paket). */
  private async quotaOptions(plan: PlanRecord): Promise<ProductRecord[]> {
    const today = jakartaDate(this.ctx.now());
    return (await this.store.listProductsWithShelfDate()).filter((p) => p.format === 'ebook' && isOpenFor(p, plan.frontlistDays, today));
  }

  private async productCard(
    product: ProductRecord,
    progress: Array<{ productId: string; position: number; percent: number; updatedAt: string }>,
    unitSales = false
  ) {
    const book = await this.ctx.getBook(product.bookId);
    const p = progress.find((x) => x.productId === product.id);
    return {
      productId: product.id,
      format: product.format,
      bookId: product.bookId,
      slug: book?.slug ?? product.bookId,
      title: book?.title ?? '',
      author: book?.author ?? '',
      coverUrl: book?.coverUrl ?? '',
      pageCount: product.pageCount,
      durationSeconds: product.durationSeconds,
      shelfEntryDate: product.shelfEntryDate,
      purchasable: unitSales && product.isActive && product.availabilityStatus === 'available' && product.price > 0,
      price: product.price,
      progress: p ? { position: p.position, percent: p.percent, updatedAt: p.updatedAt } : null
    };
  }

  async pickOptions(user: AuthUser) {
    const state = await this.pickState(user);
    if (!state) return { enabled: false, mode: null, slot: null, current: null, limit: 0, used: 0, picks: [], options: [] };
    const progress = await this.store.listProgress(user.id);
    const products = state.mode === 'quota' ? await this.quotaOptions(state.plan) : await this.shelfProducts();
    const unitSales = await unitSalesOpen(this.ctx);
    const options = await Promise.all(products.map((p) => this.productCard(p, progress, unitSales)));
    return {
      enabled: true,
      mode: state.mode,
      slot: state.slot,
      current: state.current ? { productId: state.current.productId, periodStart: state.current.periodStart, periodEnd: state.current.periodEnd } : null,
      limit: state.limit,
      used: state.mode === 'quota' ? state.picks.length : state.current ? 1 : 0,
      picks: state.picks.map((p) => ({ productId: p.productId, periodStart: p.periodStart, periodEnd: p.periodEnd, pickedAt: p.pickedAt })),
      options
    };
  }

  /**
   * Fase 6 Langkah 3: status tombol utama halaman buku untuk pengguna ini. Satu sumber kebenaran dengan
   * requireEntitlement (resolveEntitlement) dan jatah judul (pickState), tanpa membuat hak baru.
   */
  async titleStatus(user: AuthUser, rawProductId: unknown): Promise<TitleStatus> {
    const productId = String(rawProductId || '');
    const product = /^[A-Za-z0-9_-]{1,64}$/.test(productId) ? await this.store.getProduct(productId) : null;
    if (!product || !product.isActive) throw httpError(404, 'product_not_found', 'Produk digital tidak ditemukan.');
    const now = this.ctx.now();
    const today = jakartaDate(now);
    const sub = await this.openSubscription(user.id);
    const paid = sub && PAID_STATES.includes(sub.status) ? sub : null;
    const plan = paid ? await this.planById(paid.planId) : null;
    const plans = await this.plans();
    const topRank = Math.max(...plans.filter((p) => p.isActive).map((p) => PLAN_RANK[p.code] ?? 0));
    const base = {
      productId: product.id,
      format: product.format,
      planCode: plan?.code ?? null,
      upgrade: !plan || (PLAN_RANK[plan.code] ?? 0) < topRank
    };
    if (product.availabilityStatus !== 'available' || !product.shelfEntryDate) return { ...base, status: 'coming_soon' };

    const { entitlement, reason } = await resolveEntitlement(this.ctx, user.id, product);
    if (entitlement) {
      if (product.format === 'audiobook' && this.ctx.membership) {
        // Pemakaian terbaru (tanpa cache) agar tombol tidak menawarkan "Dengarkan" saat jam sudah habis.
        const quota = await this.ctx.membership.audioQuota(entitlement, user.id, true);
        if (quota?.exhausted) return { ...base, status: 'audio_exhausted', resetsAt: quota.resetsAt };
      }
      const pick = entitlement.source === 'membership' && entitlement.scope === 'product';
      return { ...base, status: 'open', via: entitlement.source === 'institution' ? 'institution' : pick ? 'quota' : 'access', endsAt: entitlement.endsAt };
    }
    if (reason === 'suspended') return { ...base, status: 'suspended' };

    // Anggota instansi tanpa paket pribadi: judul baru terbuka shelf_entry_date + 45 hari.
    if (!plan) {
      const institutionRows = (await this.store.listEntitlements({ userId: user.id, scope: 'shelf' }))
        .filter((e) => e.source === 'institution' && isEntitlementUsable(e, now));
      if (institutionRows.length > 0 && !isOpenFor(product, INSTITUTION_FRONTLIST_DAYS, today)) {
        return { ...base, status: 'opens_on', openDate: openDateFor(product, INSTITUTION_FRONTLIST_DAYS) };
      }
      return { ...base, status: reason === 'expired' ? 'expired' : 'sample_only' };
    }

    const earliest = product.shelfEntryDate;
    if (!isOpenFor(product, plan.frontlistDays, today)) {
      return { ...base, status: 'opens_on', openDate: openDateFor(product, plan.frontlistDays), upgradeOpenDate: base.upgrade ? earliest : null };
    }
    if (product.format === 'ebook') {
      const state = await this.pickState(user);
      if (state?.mode === 'quota') {
        const used = state.picks.length;
        const quota = { used, limit: state.limit, resetsAt: state.slot.end };
        if (!isProductOnShelf(product, today)) return { ...base, status: 'coming_soon' };
        return { ...base, status: used < state.limit ? 'quota_available' : 'quota_full', quota };
      }
    }
    // Paket berbayar yang tidak mencakup format ini (atau aset belum siap): hanya sampel.
    return { ...base, status: isProductOnShelf(product, today) ? 'sample_only' : 'coming_soon' };
  }

  async pick(user: AuthUser, rawProductId: unknown) {
    const state = await this.pickState(user);
    if (!state) throw httpError(403, 'pick_unavailable', 'Jatah judul tidak tersedia untuk paket Anda.');
    if (state.mode === 'quota') return this.pickWithQuota(user, state, rawProductId);
    if (state.current) {
      throw httpError(409, 'pick_locked', 'Pick periode ini sudah dipilih dan dikunci.', { current: { productId: state.current.productId, periodEnd: state.current.periodEnd } });
    }
    const productId = String(rawProductId || '');
    const product = /^[A-Za-z0-9_-]{1,64}$/.test(productId) ? await this.store.getProduct(productId) : null;
    if (!product || !isProductOnShelf(product, jakartaDate(this.ctx.now()))) throw httpError(400, 'not_on_shelf', 'Judul ini belum masuk Digital Reading Shelf.');
    let pick;
    try {
      pick = await this.store.createPick({ subscriptionId: state.sub.id, userId: user.id, productId, periodStart: state.slot.start, periodEnd: state.slot.end });
    } catch (err) {
      if (err instanceof ConflictError) throw httpError(409, 'pick_locked', 'Pick periode ini sudah dipilih dan dikunci.');
      throw err;
    }
    const accessEnd = this.accessEndsAt(state.sub)!;
    const pickEnd = addDays(state.slot.end, this.cfg.graceDays);
    const endsAt = Date.parse(pickEnd) < Date.parse(accessEnd) ? pickEnd : accessEnd;
    await this.store.insertEntitlements([{
      userId: user.id,
      productId,
      scope: 'product',
      source: 'membership',
      sourceRef: pick.id,
      startsAt: this.iso(),
      endsAt,
      maxDevices: state.plan.maxDevices,
      statusChangedBy: 'membership'
    }]);
    const [row] = await this.store.listEntitlements({ userId: user.id, productId, source: 'membership', sourceRef: pick.id });
    if (row) await this.store.setPickEntitlement(pick.id, row.id);
    await this.event(state.sub, 'pick_selected', { productId, periodStart: state.slot.start, periodEnd: state.slot.end });
    const book = await this.ctx.getBook(product.bookId);
    this.notify(state.sub, 'pickLocked', { productTitle: book?.title ?? productId, date: state.slot.end });
    return { productId, periodStart: state.slot.start, periodEnd: state.slot.end, entitlementEndsAt: endsAt };
  }

  /** Fase 6: buka satu judul e-book dengan jatah bulan ini (Silver 2, Gold 6). Hanya sampai akhir slot bulanan. */
  private async pickWithQuota(
    user: AuthUser,
    state: { sub: SubscriptionRecord; plan: PlanRecord; slot: { start: string; end: string }; limit: number; picks: Array<{ productId: string }> },
    rawProductId: unknown
  ) {
    const productId = String(rawProductId || '');
    const product = /^[A-Za-z0-9_-]{1,64}$/.test(productId) ? await this.store.getProduct(productId) : null;
    const today = jakartaDate(this.ctx.now());
    if (!product || product.format !== 'ebook') throw httpError(400, 'not_on_shelf', 'Judul ini tidak bisa dipilih dengan jatah.');
    if (!isOpenFor(product, state.plan.frontlistDays, today)) {
      throw httpError(400, 'not_open_for_plan', 'Judul ini belum tersedia untuk paket Anda.', { openDate: openDateFor(product, state.plan.frontlistDays) });
    }
    if (state.picks.some((p) => p.productId === productId)) throw httpError(409, 'title_already_picked', 'Judul ini sudah dibuka bulan ini.');
    if (state.picks.length >= state.limit) {
      throw httpError(409, 'title_quota_full', `Jatah ${state.limit} judul bulan ini sudah terpakai.`, { limit: state.limit, used: state.picks.length, resetsAt: state.slot.end });
    }
    let pick;
    try {
      pick = await this.store.createTitlePick({ subscriptionId: state.sub.id, userId: user.id, productId, periodStart: state.slot.start, periodEnd: state.slot.end });
    } catch (err) {
      if (err instanceof ConflictError) throw httpError(409, 'title_already_picked', 'Judul ini sudah dibuka bulan ini.');
      if (err instanceof StoreRuleError) {
        throw httpError(409, 'title_quota_full', `Jatah ${state.limit} judul bulan ini sudah terpakai.`, { limit: state.limit, used: state.limit, resetsAt: state.slot.end });
      }
      throw err;
    }
    // Hanya selama slot bulan ini (keputusan fase 6 no. 4), dan tidak melewati akhir akses keanggotaan.
    const accessEnd = this.accessEndsAt(state.sub)!;
    const endsAt = Date.parse(state.slot.end) < Date.parse(accessEnd) ? state.slot.end : accessEnd;
    await this.store.insertEntitlements([{
      userId: user.id,
      productId,
      scope: 'product',
      source: 'membership',
      sourceRef: pick.id,
      startsAt: this.iso(),
      endsAt,
      maxDevices: state.plan.maxDevices,
      statusChangedBy: 'membership'
    }]);
    const [row] = await this.store.listEntitlements({ userId: user.id, productId, source: 'membership', sourceRef: pick.id });
    if (row) await this.store.setTitlePickEntitlement(pick.id, row.id);
    const used = state.picks.length + 1;
    await this.event(state.sub, 'title_picked', { productId, periodStart: state.slot.start, periodEnd: state.slot.end, used, limit: state.limit });
    const book = await this.ctx.getBook(product.bookId);
    this.notify(state.sub, 'titlePicked', { productTitle: book?.title ?? productId, date: endsAt, used, limit: state.limit });
    return { productId, periodStart: state.slot.start, periodEnd: state.slot.end, entitlementEndsAt: endsAt, used, limit: state.limit };
  }

  // -------------------------------------------------------------------------
  // Akun keluarga Platinum
  // -------------------------------------------------------------------------
  /** Langganan berbayar milik pemilik dengan jatah akun keluarga. */
  private async familyOwnerState(user: AuthUser) {
    const sub = await this.openSubscription(user.id);
    if (!sub || !PAID_STATES.includes(sub.status) || !sub.currentPeriodStart || !sub.currentPeriodEnd) return null;
    const plan = await this.planById(sub.planId);
    if (!plan || plan.familyAccounts <= 0) return null;
    return { sub, plan };
  }

  async family(user: AuthUser) {
    const owner = await this.familyOwnerState(user);
    const membership = (await this.store.listFamilyMembers({ userId: user.id, status: 'active' }))[0] ?? null;
    const memberOf = membership ? await this.store.getSubscription(membership.ownerSubscriptionId) : null;
    if (!owner) {
      return {
        available: false,
        limit: 0,
        members: [],
        memberOf: memberOf ? { ownerName: memberOf.customerName, accessEndsAt: this.accessEndsAt(memberOf), addedAt: membership!.addedAt } : null
      };
    }
    const rows = await this.store.listFamilyMembers({ ownerSubscriptionId: owner.sub.id, status: 'active' });
    const profiles = await this.store.getUserProfiles(rows.map((m) => m.userId));
    return {
      available: true,
      limit: owner.plan.familyAccounts,
      members: rows.map((m) => {
        const profile = profiles.find((u) => u.id === m.userId);
        return { id: m.id, email: profile?.email ?? '', name: profile?.fullName ?? '', addedAt: m.addedAt };
      }),
      memberOf: null
    };
  }

  /** Tambah akun keluarga (akun terdaftar dengan email itu). Anggota mendapat rak sendiri sampai akhir akses pemilik. */
  async addFamilyMember(user: AuthUser, body: Record<string, unknown>) {
    const owner = await this.familyOwnerState(user);
    if (!owner) throw httpError(403, 'family_unavailable', 'Akun keluarga hanya tersedia untuk paket Platinum aktif.');
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw httpError(400, 'invalid_email', 'Email tidak valid.');
    const member = await this.store.findUserByEmail(email);
    if (!member) throw httpError(404, 'family_user_not_found', 'Belum ada akun CakraNexa dengan email ini. Minta anggota keluarga mendaftar lebih dulu.');
    if (member.id === user.id) throw httpError(400, 'family_owner', 'Pemilik langganan tidak perlu ditambahkan.');
    const own = await this.openSubscription(member.id);
    if (own && own.status !== 'pending') throw httpError(409, 'family_member_subscribed', 'Akun ini sudah memiliki keanggotaan sendiri.');
    let record;
    try {
      record = await this.store.addFamilyMember({ ownerSubscriptionId: owner.sub.id, userId: member.id });
    } catch (err) {
      if (err instanceof ConflictError) throw httpError(409, 'family_member_taken', 'Akun ini sudah menjadi anggota keluarga di langganan lain.');
      if (err instanceof StoreRuleError) {
        if (err.rule === 'family_owner') throw httpError(400, 'family_owner', 'Pemilik langganan tidak perlu ditambahkan.');
        throw httpError(409, 'family_full', `Batas ${owner.plan.familyAccounts} akun keluarga tercapai.`, { limit: owner.plan.familyAccounts });
      }
      throw err;
    }
    const accessEnd = this.accessEndsAt(owner.sub)!;
    await this.store.insertEntitlements([{
      userId: member.id,
      productId: null,
      scope: 'shelf',
      source: 'membership',
      sourceRef: owner.sub.id,
      startsAt: this.iso(),
      endsAt: accessEnd,
      maxDevices: owner.plan.maxDevices,
      statusChangedBy: 'family'
    }]);
    await this.event(owner.sub, 'family_added', { memberId: record.id, userId: member.id });
    this.notify({ ...owner.sub, customerEmail: member.email, customerName: member.fullName || member.email, whatsappOptIn: false }, 'familyAdded', {
      ownerName: owner.sub.customerName,
      planName: this.planName(owner.plan, owner.sub.language),
      date: accessEnd
    });
    return this.family(user);
  }

  /** Lepas akun keluarga: haknya berakhir sekarang dan sesinya ditutup. */
  async removeFamilyMember(user: AuthUser, memberId: string) {
    const owner = await this.familyOwnerState(user);
    if (!owner) throw httpError(403, 'family_unavailable', 'Akun keluarga hanya tersedia untuk paket Platinum aktif.');
    const row = (await this.store.listFamilyMembers({ ownerSubscriptionId: owner.sub.id, status: 'active' })).find((m) => m.id === memberId);
    if (!row) throw httpError(404, 'family_member_not_found', 'Anggota keluarga tidak ditemukan.');
    const nowIso = this.iso();
    await this.store.removeFamilyMember(row.id, nowIso);
    const rows = (await this.store.listEntitlements({ userId: row.userId, scope: 'shelf', source: 'membership', sourceRef: owner.sub.id }))
      .filter((e) => e.status === 'active' && (!e.endsAt || Date.parse(e.endsAt) > Date.parse(nowIso)));
    const current = rows.filter((e) => Date.parse(e.startsAt) < Date.parse(nowIso)).map((e) => e.id);
    const future = rows.filter((e) => Date.parse(e.startsAt) >= Date.parse(nowIso)).map((e) => e.id);
    if (current.length > 0) await this.store.updateEntitlementsEndsAt(current, nowIso);
    if (future.length > 0) await this.store.updateEntitlements(future, { status: 'revoked', revokedReason: 'family_removed', statusChangedBy: 'family' });
    await this.store.endSessions({ userId: row.userId }, 'revoked');
    await this.event(owner.sub, 'family_removed', { memberId: row.id, userId: row.userId });
    return this.family(user);
  }

  /** Tab "Rak Digital" Pustaka Saya: judul rak (paket full), Pick (Reader), dan "Segera masuk rak". */
  async shelfView(user: AuthUser) {
    const now = this.ctx.now();
    const shelfRows = (await this.store.listEntitlements({ userId: user.id, scope: 'shelf' })).filter((e) => isEntitlementUsable(e, now));
    const accessEndsAt = shelfRows.length > 0 ? shelfRows.map((e) => e.endsAt).filter((d): d is string => Boolean(d)).sort().pop() ?? null : null;
    const sub = (await this.openSubscription(user.id)) ?? (await this.latestSubscription(user.id));
    const progress = await this.store.listProgress(user.id);
    // Paket yang memberi hak rak (milik sendiri atau langganan pemilik akun keluarga).
    const membershipRow = shelfRows.find((e) => e.source === 'membership') ?? null;
    const shelfPlan = membershipRow && this.ctx.membership ? await this.ctx.membership.planFor(await this.ctx.membership.subscriptionFor(membershipRow)) : null;
    const today = jakartaDate(now);
    const listed = await this.store.listProductsWithShelfDate();
    const covered = shelfRows.length === 0 ? [] : shelfPlan
      ? listed.filter((p) => shelfCoversFormat(shelfPlan, p.format) && isOpenFor(p, shelfPlan.frontlistDays ?? 0, today))
      : await this.shelfProducts();
    const unitSales = await unitSalesOpen(this.ctx);
    const items = await Promise.all(covered.map((p) => this.productCard(p, progress, unitSales)));
    const frontlist = shelfPlan?.frontlistDays ?? 0;
    const upcomingProducts = listed
      .filter((p) => p.isActive && p.processingStatus === 'ready' && (openDateFor(p, frontlist) ?? '') > today)
      .sort((a, b) => (openDateFor(a, frontlist) ?? '').localeCompare(openDateFor(b, frontlist) ?? ''));
    const upcoming = await Promise.all(upcomingProducts.slice(0, 24).map(async (p) => ({ ...(await this.productCard(p, progress, unitSales)), openDate: openDateFor(p, frontlist) })));
    const pick = await this.pickOptions(user);
    return {
      membership: sub && sub.currentPeriodStart ? await this.publicSubscription(sub) : null,
      access: shelfRows.length > 0 && (!shelfPlan || shelfPlan.shelfAccess === 'full') ? 'full' as const : pick.enabled ? 'pick' as const : shelfRows.length > 0 ? 'full' as const : 'none' as const,
      plan: shelfPlan ? { code: shelfPlan.code, frontlistDays: shelfPlan.frontlistDays, audioHoursPerPeriod: shelfPlan.audioHoursPerPeriod, ebookTitlesPerPeriod: shelfPlan.ebookTitlesPerPeriod } : null,
      accessEndsAt,
      items,
      upcoming,
      pick
    };
  }

  /** Langkah 7: persen harga member buku cetak untuk pemilik token (null bila flag mati / bukan anggota aktif). */
  async memberPrintDiscount(authorization: string | undefined): Promise<{ percent: number; planCode: string } | null> {
    if (!this.cfg.memberPrintDiscount) return null;
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return null;
    let user: AuthUser;
    try {
      user = await this.ctx.verifier.verify(token);
    } catch {
      return null;
    }
    const sub = await this.openSubscription(user.id);
    const plan = sub ? await this.planById(sub.planId) : null;
    const percent = this.printDiscountFor(sub, plan);
    return percent > 0 && plan ? { percent, planCode: plan.code } : null;
  }
}

/** Harga member per eksemplar (dibulatkan ke rupiah). */
export const memberUnitPrice = (price: number, percent: number): number => Math.round((price * (100 - percent)) / 100);

/**
 * Harga member buku cetak (Langkah 7): persen dari harga dasar (harga coret bila buku sedang promo), dan hanya dipakai
 * bila lebih murah dari harga jual saat ini — tidak bertumpuk dengan promo. null = harga katalog biasa.
 */
export const memberPrintPrice = (harga: number, originalHarga: number | null | undefined, percent: number): number | null => {
  if (!(percent > 0) || !(harga > 0)) return null;
  const base = originalHarga && originalHarga > harga ? originalHarga : harga;
  const price = memberUnitPrice(base, percent);
  return price < harga ? price : null;
};
