import crypto from 'crypto';
import { ConflictError, httpError } from '../errors';
import type { DigitalContext } from '../context';
import { mapMidtransToOrderStatus, verifyMidtransSignature, type MidtransClient } from '../checkout';
import { OPEN_SUBSCRIPTION_STATUSES } from '../store';
import { isEntitlementUsable, isProductOnShelf } from '../entitlements';
import { addDays, addMonths, DAY_MS, jakartaDate } from '../time';
import { PLAN_RANK } from './plans';
import { decryptToken, encryptToken, midtransUserRef, parseMidtransTime, type MembershipGateway } from './gateway';
import { membershipEmail, type MembershipEmailData, type MembershipEmailKind } from './email';
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

export const PAYMENT_METHODS: MembershipPaymentMethod[] = ['card', 'gopay', 'va', 'qris', 'other'];
export const BILLING_CYCLES: BillingCycle[] = ['monthly', 'yearly'];
const PAID_STATES: SubscriptionStatus[] = ['active', 'past_due', 'grace'];
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,100}$/;
const HOUR_MS = 60 * 60 * 1000;
/** Token Snap dipakai ulang selama belum mendekati kedaluwarsa (Snap berlaku 24 jam). */
const SNAP_REUSE_MS = 23 * HOUR_MS;
const ENABLED_PAYMENTS: Record<MembershipPaymentMethod, string[] | null> = {
  card: ['credit_card'],
  gopay: ['gopay'],
  va: ['bank_transfer', 'echannel'],
  qris: ['other_qris'],
  other: null
};
const LANGUAGE_PREFIX: Record<string, string> = { id: '', en: '/en', zh: '/zh' };

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
}

export class MembershipService {
  constructor(
    readonly ctx: DigitalContext,
    readonly gateway: MembershipGateway,
    private readonly snap: MidtransClient,
    /** Gateway pengingat WhatsApp; null = hanya email. */
    readonly whatsapp: WhatsAppSender | null = null
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
      ENABLE_AUTODEBIT: this.cfg.autodebitEnabled
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
    const plan = (await this.planById(sub.pendingPlanId)) ?? (await this.planById(sub.planId));
    if (!plan) throw new Error(`Paket langganan ${sub.id} tidak ditemukan`);
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
    const shelf = await this.store.listEntitlements({ userId: sub.userId, scope: 'shelf', source: 'membership', sourceRef: sub.id });
    const pickIds = (await this.store.listPicks({ subscriptionId: sub.id })).map((p) => p.entitlementId).filter((id): id is string => Boolean(id));
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
    const shelf = (await this.store.listEntitlements({ userId: sub.userId, scope: 'shelf', source: 'membership', sourceRef: sub.id }))
      .filter((e) => e.status === 'active' && Date.parse(e.startsAt) >= Date.parse(sub.currentPeriodStart!) - 1000);
    if (shelf.length > 0) await this.store.updateEntitlementsEndsAt(shelf.map((e) => e.id), graceEnd);
    for (const pick of await this.store.listPicks({ subscriptionId: sub.id })) {
      if (!pick.entitlementId || Date.parse(pick.periodEnd) <= Date.parse(this.iso())) continue;
      const pickEnd = addDays(pick.periodEnd, this.cfg.graceDays);
      await this.store.updateEntitlementsEndsAt([pick.entitlementId], Date.parse(pickEnd) < Date.parse(graceEnd) ? pickEnd : graceEnd);
    }
  }

  /** Hak akses paket untuk satu periode (paket full -> satu baris scope 'shelf'). */
  async grantAccess(sub: SubscriptionRecord, plan: PlanRecord, start: string, end: string): Promise<void> {
    if (this.effectiveShelfAccess(plan) !== 'full') return;
    await this.store.insertEntitlements([{
      userId: sub.userId,
      productId: null,
      scope: 'shelf',
      source: 'membership',
      sourceRef: sub.id,
      startsAt: start,
      endsAt: addDays(end, this.cfg.graceDays + sub.extraGraceDays),
      maxDevices: plan.maxDevices,
      statusChangedBy: 'membership'
    }]);
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
      redirectUrl: fresh ? invoice.snapRedirectUrl : null
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
    if (!sub) return { subscription: null, invoices: [], openInvoice: null, printDiscountPercent: 0, autodebitAvailable: this.cfg.autodebitEnabled };
    const plans = await this.plans();
    const planOf = (id: string) => plans.find((p) => p.id === id) ?? null;
    const invoices = await this.store.listInvoices({ subscriptionId: sub.id, limit: 24 });
    const openInvoice = invoices.find((i) => i.status === 'issued' || (i.status === 'failed' && i.kind === 'renewal')) ?? null;
    return {
      subscription: await this.publicSubscription(sub),
      invoices: invoices.map((i) => this.publicInvoice(i, planOf(i.planId))),
      openInvoice: openInvoice ? this.publicInvoice(openInvoice, planOf(openInvoice.planId)) : null,
      printDiscountPercent: this.printDiscountFor(sub, planOf(sub.planId)),
      autodebitAvailable: this.cfg.autodebitEnabled
    };
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
      if (invoice && invoice.status === 'issued' && plan) invoice = await this.prepareSnap(invoice, existing, plan);
      return { subscription: await this.publicSubscription(existing), invoice: invoice ? this.publicInvoice(invoice, plan) : null, reused: true };
    }

    if (!this.ctx.midtrans.enabled) throw httpError(503, 'payment_unavailable', 'Pembayaran online belum dikonfigurasi.');
    const plan = await this.planByCode(planCode);
    if (!plan || !plan.isActive || plan.code === 'free' || priceFor(plan, cycle) <= 0) throw httpError(400, 'plan_unavailable', 'Paket tidak tersedia.');

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
    } catch (err) {
      if (claimed) await this.store.releaseFoundingSlot(plan.id);
      if (err instanceof ConflictError) throw httpError(409, 'subscription_in_progress', 'Pendaftaran lain sedang diproses. Muat ulang halaman.');
      throw err;
    }

    let invoice = await this.store.createInvoice({
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
      claimsFounding: claimed,
      isFoundingPrice: claimed,
      issuedAt: nowIso,
      paidAt: null,
      dueAt: new Date(now.getTime() + this.cfg.pendingTtlHours * HOUR_MS).toISOString(),
      attempt: 0,
      failureReason: null,
      isTest
    });
    await this.event(sub, 'created', { planCode, cycle, method, amount, founding: claimed });
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
        priceLocked: invoice.amount,
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
    this.notify(withRemote ?? updated, 'welcome', { planName: this.planName(plan, updated.language), cycle: updated.billingCycle, date: end, invoiceRef: invoice.orderRef });
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
        priceLocked: invoice.amount,
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
    await this.event(updated, changed ? 'downgraded' : 'renewed', { invoiceId: invoice.id, amount: invoice.amount, kind: invoice.kind, applied: changed, reopened: reopen });
    if (changed) this.notify(updated, 'planChanged', { change: 'downgrade_applied', planName: this.planName(plan, updated.language), cycle: updated.billingCycle, date: end });
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
    await this.store.endSessions({ userId: sub.userId }, 'revoked');
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
    let invoice: InvoiceRecord;
    try {
      invoice = await this.store.createInvoice({
        subscriptionId: sub.id,
        userId: sub.userId,
        kind: 'renewal',
        planId: target.plan.id,
        billingCycle: target.cycle,
        periodStart: sub.currentPeriodEnd,
        periodEnd: periodEndFor(sub.currentPeriodEnd, target.cycle),
        amount: target.amount,
        status: 'issued',
        orderRef: newOrderRef(now),
        midtransOrderId: null,
        midtransSnapToken: null,
        snapRedirectUrl: null,
        snapCreatedAt: null,
        midtransTransactionId: null,
        paymentType: null,
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
    this.notify(sub, days === Math.max(...this.cfg.reminderDays) ? 'invoice' : 'reminder', { planName, amount: invoice.amount, date: invoice.dueAt, days, autodebit: false, invoiceRef: invoice.orderRef });
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
    if (!target || !target.isActive || target.code === 'free' || !BILLING_CYCLES.includes(cycle)) throw httpError(400, 'plan_unavailable', 'Paket tidak tersedia.');
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
    let invoice = await this.store.createInvoice({
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
      claimsFounding: claimed,
      isFoundingPrice: claimed,
      issuedAt: nowIso,
      paidAt: null,
      dueAt: new Date(now.getTime() + this.cfg.pendingTtlHours * HOUR_MS).toISOString(),
      attempt: 0,
      failureReason: null,
      isTest: sub.isTest
    });
    if (amount <= 0) {
      await this.applyPaid(invoice, EMPTY_PAYMENT, null);
      return { invoice: null, applied: true, credit, price, subscription: await this.publicSubscription((await this.store.getSubscription(sub.id))!) };
    }
    if (!this.ctx.midtrans.enabled) {
      await this.voidInvoice(invoice, 'payment_unavailable');
      throw httpError(503, 'payment_unavailable', 'Pembayaran online belum dikonfigurasi.');
    }
    const method = PAYMENT_METHODS.includes(rawMethod as MembershipPaymentMethod) ? rawMethod as MembershipPaymentMethod : sub.paymentMethod;
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

  /** Slot Pick bulanan di dalam periode tagihan (paket tahunan tetap 1 Pick per bulan). */
  pickSlot(sub: SubscriptionRecord): { start: string; end: string } {
    const now = this.ctx.now().getTime();
    let k = 0;
    while (k < 24 && Date.parse(addMonths(sub.currentPeriodStart!, k + 1)) <= now) k += 1;
    const start = addMonths(sub.currentPeriodStart!, k);
    const next = addMonths(sub.currentPeriodStart!, k + 1);
    return { start, end: Date.parse(next) < Date.parse(sub.currentPeriodEnd!) ? next : sub.currentPeriodEnd! };
  }

  private async pickState(user: AuthUser) {
    const sub = await this.openSubscription(user.id);
    if (!sub || !PAID_STATES.includes(sub.status) || !sub.currentPeriodStart || !sub.currentPeriodEnd) return null;
    const plan = await this.planById(sub.planId);
    if (!plan || this.effectiveShelfAccess(plan) !== 'pick') return null;
    const slot = this.pickSlot(sub);
    const current = (await this.store.listPicks({ subscriptionId: sub.id })).find((p) => p.periodStart === slot.start) ?? null;
    return { sub, plan, slot, current };
  }

  private async productCard(product: ProductRecord, progress: Array<{ productId: string; position: number; percent: number; updatedAt: string }>) {
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
      purchasable: product.isActive && product.availabilityStatus === 'available' && product.price > 0,
      price: product.price,
      progress: p ? { position: p.position, percent: p.percent, updatedAt: p.updatedAt } : null
    };
  }

  async pickOptions(user: AuthUser) {
    const state = await this.pickState(user);
    if (!state) return { enabled: false, slot: null, current: null, options: [] };
    const progress = await this.store.listProgress(user.id);
    const options = await Promise.all((await this.shelfProducts()).map((p) => this.productCard(p, progress)));
    return {
      enabled: true,
      slot: state.slot,
      current: state.current ? { productId: state.current.productId, periodStart: state.current.periodStart, periodEnd: state.current.periodEnd } : null,
      options
    };
  }

  async pick(user: AuthUser, rawProductId: unknown) {
    const state = await this.pickState(user);
    if (!state) throw httpError(403, 'pick_unavailable', 'Digital Member Pick tidak tersedia untuk paket Anda.');
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

  /** Tab "Rak Digital" Pustaka Saya: judul rak (paket full), Pick (Reader), dan "Segera masuk rak". */
  async shelfView(user: AuthUser) {
    const now = this.ctx.now();
    const shelfRows = (await this.store.listEntitlements({ userId: user.id, scope: 'shelf' })).filter((e) => isEntitlementUsable(e, now));
    const accessEndsAt = shelfRows.length > 0 ? shelfRows.map((e) => e.endsAt).filter((d): d is string => Boolean(d)).sort().pop() ?? null : null;
    const sub = (await this.openSubscription(user.id)) ?? (await this.latestSubscription(user.id));
    const progress = await this.store.listProgress(user.id);
    const items = shelfRows.length > 0 ? await Promise.all((await this.shelfProducts()).map((p) => this.productCard(p, progress))) : [];
    const upcoming = await Promise.all((await this.upcomingProducts()).slice(0, 24).map((p) => this.productCard(p, progress)));
    const pick = await this.pickOptions(user);
    return {
      membership: sub && sub.currentPeriodStart ? await this.publicSubscription(sub) : null,
      access: shelfRows.length > 0 ? 'full' as const : pick.enabled ? 'pick' as const : 'none' as const,
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
