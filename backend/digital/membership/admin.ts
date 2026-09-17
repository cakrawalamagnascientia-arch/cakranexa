import crypto from 'crypto';
import express, { type Request, type Response, type Router } from 'express';
import { asyncRoute, httpError } from '../errors';
import type { DigitalContext } from '../context';
import { deviceLabel } from '../access';
import { productRefs } from '../admin';
import { isEntitlementUsable, maxDevicesForUser } from '../entitlements';
import { OPEN_SUBSCRIPTION_STATUSES } from '../store';
import { JAKARTA_OFFSET_MS, jakartaDate, jakartaMonthStart } from '../time';
import { decryptToken } from './gateway';
import { formatWhatsAppNumber, normalizeWhatsAppNumber, whatsappTestMessage } from './whatsapp';
import { BILLING_CYCLES, EMPTY_PAYMENT, MEMBERSHIP_ORDER_PREFIX, periodEndFor, type MembershipService } from './service';
import type {
  BillingCycle,
  InvoiceRecord,
  InvoiceStatus,
  PlanPatch,
  PlanRecord,
  ShelfAccess,
  SubscriptionRecord,
  SubscriptionStatus
} from '../types';

/**
 * Admin keanggotaan (Langkah 8): ringkasan, daftar & detail langganan, aksi manual, edit paket, ekspor CSV.
 * Semua aksi tercatat di subscription_events (admin_*). Pengembalian dana tetap manual di dashboard Midtrans.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['pending', 'active', 'past_due', 'grace', 'canceled', 'expired'];
const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'issued', 'paid', 'failed', 'void'];
const PAID_STATES: SubscriptionStatus[] = ['active', 'past_due', 'grace'];
const SHELF_ACCESS: ShelfAccess[] = ['none', 'pick', 'full'];
const MAX_ROWS = 100000;
const MAX_PRICE = 100_000_000;

const bodyOf = (req: Request) => (req.body || {}) as Record<string, unknown>;
const noteOf = (body: Record<string, unknown>) => (typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null);
const requireConfirm = (body: Record<string, unknown>) => {
  if (body.confirm !== true) throw httpError(400, 'confirm_required', 'Konfirmasi diperlukan.');
};

/** Nomor tagihan untuk pembayaran yang dicatat admin (tidak pernah dikirim ke Midtrans). */
const adminOrderRef = (now: Date) => `${MEMBERSHIP_ORDER_PREFIX}ADM-${jakartaDate(now).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/** Waktu WIB "YYYY-MM-DD HH:mm" untuk CSV akuntansi. */
const wib = (iso: string | null | undefined) => (iso ? new Date(Date.parse(iso) + JAKARTA_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ') : '');

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Cegah formula injection saat CSV dibuka di spreadsheet.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV UTF-8 dengan BOM (Excel membaca huruf non-ASCII dengan benar). */
export const toCsv = (header: string[], rows: unknown[][]): string =>
  `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

const sendCsv = (res: Response, filename: string, body: string) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
};

const readInt = (body: Record<string, unknown>, key: string, min: number, max: number, nullable: boolean): number | null | undefined => {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (nullable && (value === null || value === '')) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw httpError(400, 'invalid_plan', `${key} harus bilangan bulat ${min}–${max}.`);
  return n;
};

const dayStartIso = (value: unknown, offsetDays = 0): string | undefined => {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const ms = Date.parse(`${text}T00:00:00+07:00`);
  return Number.isFinite(ms) ? new Date(ms + offsetDays * 24 * 60 * 60 * 1000).toISOString() : undefined;
};

export const createMembershipAdminRouter = (ctx: DigitalContext, service: MembershipService): Router => {
  const router = express.Router();
  const admin = ctx.requireAdmin;
  const store = ctx.store;

  const planMap = async () => new Map((await service.plans()).map((p) => [p.id, p]));

  const adminSubscription = (s: SubscriptionRecord, plans: Map<string, PlanRecord>) => ({
    id: s.id,
    userId: s.userId,
    email: s.customerEmail,
    name: s.customerName,
    planCode: plans.get(s.planId)?.code ?? null,
    planName: plans.get(s.planId)?.nameId ?? null,
    billingCycle: s.billingCycle,
    status: s.status,
    isFounding: s.isFounding,
    priceLocked: s.priceLocked,
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    graceEndsAt: service.graceEndsAt(s),
    accessEndsAt: service.accessEndsAt(s),
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    canceledAt: s.canceledAt,
    endedAt: s.endedAt,
    endedReason: s.endedReason,
    paymentMethod: s.paymentMethod,
    autodebit: service.autodebitActive(s),
    whatsappNumber: s.whatsappNumber,
    whatsappOptIn: s.whatsappOptIn,
    pendingPlanCode: s.pendingPlanId ? plans.get(s.pendingPlanId)?.code ?? null : null,
    pendingBillingCycle: s.pendingBillingCycle,
    foundingEndsAt: s.foundingEndsAt,
    extraGraceDays: s.extraGraceDays,
    language: s.language,
    isTest: s.isTest,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt
  });

  const adminInvoice = (i: InvoiceRecord, plans: Map<string, PlanRecord>) => ({
    id: i.id,
    subscriptionId: i.subscriptionId,
    kind: i.kind,
    planCode: plans.get(i.planId)?.code ?? null,
    billingCycle: i.billingCycle,
    periodStart: i.periodStart,
    periodEnd: i.periodEnd,
    amount: i.amount,
    status: i.status,
    orderRef: i.orderRef,
    midtransOrderId: i.midtransOrderId,
    midtransTransactionId: i.midtransTransactionId,
    paymentType: i.paymentType,
    isFoundingPrice: i.isFoundingPrice,
    issuedAt: i.issuedAt,
    paidAt: i.paidAt,
    dueAt: i.dueAt,
    attempt: i.attempt,
    failureReason: i.failureReason,
    isTest: i.isTest,
    createdAt: i.createdAt
  });

  const loadSubscription = async (req: Request) => {
    const id = String(req.params.id);
    const sub = UUID_RE.test(id) ? await store.getSubscription(id) : null;
    if (!sub) throw httpError(404, 'subscription_not_found', 'Langganan tidak ditemukan.');
    return sub;
  };

  const respond = async (res: Response, sub: SubscriptionRecord, extra: Record<string, unknown> = {}) => {
    const fresh = (await store.getSubscription(sub.id)) ?? sub;
    res.json({ subscription: adminSubscription(fresh, await planMap()), ...extra });
  };

  /** Jadwal auto-debit Midtrans mengikuti akhir periode baru: dihentikan lalu dibuat ulang dari token tersimpan. */
  const resetAutodebit = async (before: SubscriptionRecord, after: SubscriptionRecord): Promise<SubscriptionRecord> => {
    if (!before.midtransSubscriptionId) return after;
    await service.safeRemote(before, 'cancel_on_admin_change', () => service.gateway.cancelSubscription(before.midtransSubscriptionId!));
    const cleared = (await store.updateSubscription(after.id, { midtransSubscriptionId: null })) ?? after;
    if (!PAID_STATES.includes(cleared.status) || cleared.cancelAtPeriodEnd) return cleared;
    return (await service.setupAutodebit(cleared, EMPTY_PAYMENT, decryptToken(service.cfg.tokenKey, before.midtransToken))) ?? cleared;
  };

  // ---- Ringkasan (tanpa langganan uji)
  router.get('/api/admin/membership/summary', admin, asyncRoute(async (_req, res) => {
    const now = ctx.now();
    const monthStart = jakartaMonthStart(now);
    const nextMonth = jakartaMonthStart(now, 1);
    const startMs = Date.parse(monthStart);
    const endMs = Date.parse(nextMonth);
    const inMonth = (iso: string | null) => {
      if (!iso) return false;
      const t = Date.parse(iso);
      return t >= startMs && t < endMs;
    };
    const plans = await service.plans();
    const all = await store.listSubscriptions({ limit: MAX_ROWS });
    const subs = all.filter((s) => !s.isTest);
    const paid = await store.listInvoices({ statuses: ['paid'], paidFrom: monthStart, paidTo: nextMonth, isTest: false, limit: MAX_ROWS });
    const active = subs.filter((s) => PAID_STATES.includes(s.status));
    // Aktif di awal bulan (perkiraan sederhana): pernah dibayar, dibuat sebelum bulan ini, belum berakhir sebelum bulan ini.
    const activeAtMonthStart = subs.filter((s) => s.currentPeriodStart !== null && Date.parse(s.createdAt) < startMs && (!s.endedAt || Date.parse(s.endedAt) >= startMs)).length;
    const canceledThisMonth = subs.filter((s) => s.status === 'canceled' && s.currentPeriodStart !== null && inMonth(s.endedAt)).length;
    const expiredThisMonth = subs.filter((s) => s.status === 'expired' && s.currentPeriodStart !== null && inMonth(s.endedAt)).length;
    const revenue = paid.reduce((sum, i) => sum + i.amount, 0);
    const revenueYearly = paid.filter((i) => i.billingCycle === 'yearly').reduce((sum, i) => sum + i.amount, 0);
    res.json({
      month: jakartaDate(now).slice(0, 7),
      activeTotal: active.length,
      activeByPlan: plans.filter((p) => p.code !== 'free').map((p) => {
        const list = active.filter((s) => s.planId === p.id);
        return { code: p.code, name: p.nameId, active: list.length, yearly: list.filter((s) => s.billingCycle === 'yearly').length, founding: list.filter((s) => s.isFounding).length };
      }),
      newThisMonth: paid.filter((i) => i.kind === 'initial').length,
      cancelRequestsThisMonth: subs.filter((s) => inMonth(s.canceledAt)).length,
      canceledThisMonth,
      expiredThisMonth,
      pastDue: active.filter((s) => s.status === 'past_due').length,
      grace: active.filter((s) => s.status === 'grace').length,
      revenueThisMonth: revenue,
      revenueYearlyShare: revenue > 0 ? revenueYearly / revenue : 0,
      activeYearlyShare: active.length > 0 ? active.filter((s) => s.billingCycle === 'yearly').length / active.length : 0,
      activeAtMonthStart,
      churnRate: activeAtMonthStart > 0 ? (canceledThisMonth + expiredThisMonth) / activeAtMonthStart : null,
      founding: plans.filter((p) => p.foundingCap !== null).map((p) => ({ code: p.code, cap: p.foundingCap, used: p.foundingCount, remaining: Math.max(0, (p.foundingCap ?? 0) - p.foundingCount) })),
      flags: service.flags(),
      testSubscriptions: all.length - subs.length
    });
  }));

  // ---- Paket
  router.get('/api/admin/membership/plans', admin, asyncRoute(async (_req, res) => {
    res.json({ plans: await service.plans(), benefits: await store.listPlanBenefits(), flags: service.flags() });
  }));

  // Edit harga, kuota Founding, batas perangkat, akses rak, diskon cetak, aktif — tanpa deploy.
  router.patch('/api/admin/membership/plans/:code', admin, asyncRoute(async (req, res) => {
    const plan = await service.planByCode(String(req.params.code));
    if (!plan) throw httpError(404, 'plan_not_found', 'Paket tidak ditemukan.');
    const body = bodyOf(req);
    const patch: PlanPatch = {};
    const priceMonthly = readInt(body, 'priceMonthly', 0, MAX_PRICE, false);
    const priceYearly = readInt(body, 'priceYearly', 0, MAX_PRICE, false);
    const foundingPriceYearly = readInt(body, 'foundingPriceYearly', 0, MAX_PRICE, true);
    const foundingCap = readInt(body, 'foundingCap', 0, 1_000_000, true);
    const maxDevices = readInt(body, 'maxDevices', 1, 10, false);
    const printDiscountPercent = readInt(body, 'printDiscountPercent', 0, 50, false);
    if (priceMonthly !== undefined) patch.priceMonthly = priceMonthly as number;
    if (priceYearly !== undefined) patch.priceYearly = priceYearly as number;
    if (foundingPriceYearly !== undefined) patch.foundingPriceYearly = foundingPriceYearly;
    if (foundingCap !== undefined) patch.foundingCap = foundingCap;
    if (maxDevices !== undefined) patch.maxDevices = maxDevices as number;
    if (printDiscountPercent !== undefined) patch.printDiscountPercent = printDiscountPercent as number;
    // Kuota fase 6 (null = tanpa batas / tidak berlaku).
    const ebookTitlesPerPeriod = readInt(body, 'ebookTitlesPerPeriod', 0, 100, true);
    const audioHoursPerPeriod = readInt(body, 'audioHoursPerPeriod', 0, 1000, true);
    const frontlistDays = readInt(body, 'frontlistDays', 0, 3650, true);
    const offlineTitles = readInt(body, 'offlineTitles', 0, 100, false);
    const familyAccounts = readInt(body, 'familyAccounts', 0, 10, false);
    if (ebookTitlesPerPeriod !== undefined) patch.ebookTitlesPerPeriod = ebookTitlesPerPeriod;
    if (audioHoursPerPeriod !== undefined) patch.audioHoursPerPeriod = audioHoursPerPeriod;
    if (frontlistDays !== undefined) patch.frontlistDays = frontlistDays;
    if (offlineTitles !== undefined) patch.offlineTitles = offlineTitles as number;
    if (familyAccounts !== undefined) patch.familyAccounts = familyAccounts as number;
    if ('shelfAccess' in body) {
      if (!SHELF_ACCESS.includes(body.shelfAccess as ShelfAccess)) throw httpError(400, 'invalid_plan', 'shelfAccess harus none, pick, atau full.');
      patch.shelfAccess = body.shelfAccess as ShelfAccess;
    }
    if ('isActive' in body) {
      if (typeof body.isActive !== 'boolean') throw httpError(400, 'invalid_plan', 'isActive harus boolean.');
      patch.isActive = body.isActive;
    }
    if (Object.keys(patch).length === 0) throw httpError(400, 'no_change', 'Tidak ada perubahan.');

    const next = { ...plan, ...patch };
    const freePlan = plan.code === 'free' || plan.code === 'blue';
    if (freePlan && (next.priceMonthly > 0 || next.priceYearly > 0 || next.foundingCap !== null || next.shelfAccess !== 'none')) {
      throw httpError(400, 'invalid_plan', 'Paket gratis tetap gratis, tanpa kuota Founding dan tanpa akses rak.');
    }
    if (next.shelfAccess === 'pick' && next.ebookTitlesPerPeriod === null && !['reader'].includes(plan.code)) {
      throw httpError(400, 'invalid_plan', 'Paket berjatah wajib punya jumlah judul per bulan.');
    }
    if (!freePlan && (next.priceMonthly <= 0 || next.priceYearly <= 0)) throw httpError(400, 'invalid_plan', 'Harga paket berbayar harus lebih dari 0.');
    if ((next.foundingCap === null) !== (next.foundingPriceYearly === null)) throw httpError(400, 'invalid_plan', 'Harga dan kuota Founding diisi atau dikosongkan bersamaan.');
    if (next.foundingCap !== null && next.foundingCap < plan.foundingCount) {
      throw httpError(400, 'founding_cap_below_count', `Kuota Founding tidak boleh di bawah kursi yang sudah terpakai (${plan.foundingCount}).`);
    }
    const warnings: string[] = [];
    if (next.priceYearly !== next.priceMonthly * 10) warnings.push('Harga tahunan bukan 10× harga bulanan (aturan brief fase 3).');
    if (next.foundingPriceYearly !== null && next.foundingPriceYearly >= next.priceYearly) warnings.push('Harga Founding tidak lebih murah dari harga tahunan reguler.');
    const updated = await store.updatePlan(plan.id, patch);
    service.ctx.membership?.clearPlanCache();
    console.log(`[membership] admin mengubah paket ${plan.code}: ${JSON.stringify(patch)}`);
    res.json({
      plan: updated,
      warnings,
      note: 'Berlaku untuk pendaftaran dan invoice perpanjangan yang terbit setelah ini. Invoice yang sudah terbit dan hak akses periode berjalan tidak berubah.'
    });
  }));

  // ---- Langganan
  router.get('/api/admin/membership/subscriptions', admin, asyncRoute(async (req, res) => {
    const plans = await planMap();
    const planCode = String(req.query.plan || '');
    const plan = planCode ? [...plans.values()].find((p) => p.code === planCode) ?? null : null;
    if (planCode && !plan) return res.json({ subscriptions: [], total: 0 });
    const status = String(req.query.status || '');
    const statuses = status === 'open'
      ? OPEN_SUBSCRIPTION_STATUSES
      : SUBSCRIPTION_STATUSES.includes(status as SubscriptionStatus) ? [status as SubscriptionStatus] : undefined;
    const founding = String(req.query.founding || '');
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 100);
    // Pendaftaran yang tidak pernah dibayar disembunyikan kecuali ?all=1.
    const includeAbandoned = req.query.all === '1';
    const rows = (await store.listSubscriptions({
      planId: plan?.id,
      statuses,
      isFounding: founding === 'true' ? true : founding === 'false' ? false : undefined,
      limit: MAX_ROWS
    }))
      .filter((s) => includeAbandoned || s.currentPeriodStart !== null || OPEN_SUBSCRIPTION_STATUSES.includes(s.status))
      .filter((s) => !q || s.customerEmail.toLowerCase().includes(q) || s.customerName.toLowerCase().includes(q) || s.id === q || s.userId === q);
    return res.json({ subscriptions: rows.slice(0, 500).map((s) => adminSubscription(s, plans)), total: rows.length });
  }));

  router.get('/api/admin/membership/subscriptions/:id', admin, asyncRoute(async (req, res) => {
    const sub = await loadSubscription(req);
    const plans = await planMap();
    const now = ctx.now();
    const [invoices, events, entitlements, devices, picks, history, profiles] = await Promise.all([
      store.listInvoices({ subscriptionId: sub.id, limit: 200 }),
      store.listSubscriptionEvents({ subscriptionId: sub.id, limit: 200 }),
      store.listEntitlements({ userId: sub.userId }),
      store.listDevices(sub.userId, true),
      store.listPicks({ subscriptionId: sub.id }),
      store.listSubscriptions({ userId: sub.userId }),
      store.getUserProfiles([sub.userId])
    ]);
    const products = await productRefs(ctx, [...entitlements.map((e) => e.productId), ...picks.map((p) => p.productId)]);
    res.json({
      subscription: adminSubscription(sub, plans),
      user: profiles[0] ?? { id: sub.userId, email: sub.customerEmail, fullName: sub.customerName },
      maxDevices: await maxDevicesForUser(ctx, sub.userId),
      invoices: invoices.map((i) => adminInvoice(i, plans)),
      events,
      entitlements: entitlements
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((e) => ({ ...e, usable: isEntitlementUsable(e, now), product: e.productId ? products.get(e.productId) ?? null : null })),
      devices: devices
        .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
        .map((d) => ({ id: d.id, label: d.label || deviceLabel(d.userAgent), firstSeen: d.firstSeen, lastSeen: d.lastSeen, releasedAt: d.releasedAt, releasedBy: d.releasedBy })),
      picks: picks.map((p) => ({ ...p, product: products.get(p.productId) ?? null })),
      history: history.filter((h) => h.id !== sub.id).map((h) => adminSubscription(h, plans))
    });
  }));

  // Perpanjang manual (pembayaran offline): invoice 'manual' berstatus paid untuk periode berikutnya.
  // Body: { confirm: true, amount?, note? } — amount default = nominal perpanjangan reguler.
  router.post('/api/admin/membership/subscriptions/:id/extend', admin, asyncRoute(async (req, res) => {
    const sub = await loadSubscription(req);
    const body = bodyOf(req);
    requireConfirm(body);
    if (sub.status === 'pending' || !sub.currentPeriodStart || !sub.currentPeriodEnd) {
      throw httpError(409, 'not_activated', 'Langganan belum pernah aktif; minta anggota menyelesaikan pembayaran pertama.');
    }
    const reopen = sub.status === 'expired' || sub.status === 'canceled';
    if (reopen) {
      const open = await service.openSubscription(sub.userId);
      if (open && open.id !== sub.id) throw httpError(409, 'user_has_open_subscription', 'Pengguna sudah memiliki langganan lain yang berjalan.');
    } else if (sub.cancelAtPeriodEnd) {
      throw httpError(409, 'canceled', 'Langganan dijadwalkan berakhir. Minta anggota membatalkan pembatalan, atau perpanjang setelah periode berakhir.');
    }
    const target = await service.renewalTarget(sub);
    const amount = body.amount === undefined || body.amount === null || body.amount === '' ? target.amount : Number(body.amount);
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_PRICE) throw httpError(400, 'invalid_amount', 'Jumlah harus bilangan bulat rupiah.');
    const now = ctx.now();
    const start = reopen ? now.toISOString() : sub.currentPeriodEnd;
    // Tagihan online periode itu tidak lagi dibayar.
    for (const open of await store.listInvoices({ subscriptionId: sub.id, kinds: ['renewal', 'manual'], statuses: ['issued', 'failed', 'draft'] })) {
      await service.voidInvoice(open, 'paid_offline');
    }
    const invoice = await store.createInvoice({
      subscriptionId: sub.id,
      userId: sub.userId,
      kind: 'manual',
      planId: target.plan.id,
      billingCycle: target.cycle,
      periodStart: start,
      periodEnd: periodEndFor(start, target.cycle),
      amount,
      status: 'issued',
      orderRef: adminOrderRef(now),
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
      dueAt: start,
      attempt: 0,
      failureReason: null,
      isTest: sub.isTest
    });
    const result = await service.applyPaid(invoice, EMPTY_PAYMENT, null);
    if (result !== 'success') throw httpError(409, 'extend_failed', 'Perpanjangan tidak dapat diterapkan (status langganan berubah). Muat ulang halaman.');
    const updated = await resetAutodebit(sub, (await store.getSubscription(sub.id)) ?? sub);
    await service.event(updated, 'admin_extended', { invoiceId: invoice.id, amount, note: noteOf(body), reopened: reopen });
    const plans = await planMap();
    await respond(res, updated, { invoice: adminInvoice((await store.getInvoice(invoice.id)) ?? invoice, plans) });
  }));

  // Masa tenggang tambahan untuk periode berjalan. Body: { days: 1–30, note? }.
  router.post('/api/admin/membership/subscriptions/:id/grace', admin, asyncRoute(async (req, res) => {
    const sub = await loadSubscription(req);
    const body = bodyOf(req);
    const days = Number(body.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) throw httpError(400, 'invalid_days', 'Jumlah hari harus 1–30.');
    if (!PAID_STATES.includes(sub.status)) {
      throw httpError(409, 'not_open', 'Masa tenggang hanya untuk langganan yang masih berjalan. Gunakan perpanjang manual untuk langganan yang sudah berakhir.');
    }
    const updated = await store.updateSubscription(sub.id, { extraGraceDays: sub.extraGraceDays + days }, PAID_STATES);
    if (!updated) throw httpError(409, 'state_changed', 'Status langganan berubah. Muat ulang halaman.');
    if (!updated.cancelAtPeriodEnd) await service.restoreAccess(updated);
    await service.event(updated, 'admin_grace', { days, total: updated.extraGraceDays, graceEndsAt: service.graceEndsAt(updated), note: noteOf(body) });
    await respond(res, updated);
  }));

  // Batalkan. Body: { confirm: true, immediate?: boolean, note? }. Default: di akhir periode (akses tetap sampai akhir periode).
  router.post('/api/admin/membership/subscriptions/:id/cancel', admin, asyncRoute(async (req, res) => {
    const sub = await loadSubscription(req);
    const body = bodyOf(req);
    requireConfirm(body);
    const note = noteOf(body);
    if (sub.status === 'pending') {
      await service.voidPending(sub, 'canceled_by_admin');
      await service.event(sub, 'admin_canceled', { immediate: true, pending: true, note });
      return respond(res, sub);
    }
    if (!PAID_STATES.includes(sub.status)) throw httpError(409, 'already_ended', 'Langganan sudah berakhir.');
    const immediate = body.immediate === true || sub.status !== 'active';
    if (!immediate) {
      if (sub.cancelAtPeriodEnd) throw httpError(409, 'already_canceled', 'Langganan sudah dijadwalkan berakhir.');
      await service.cancel({ id: sub.userId, email: sub.customerEmail, name: sub.customerName });
    } else {
      const nowIso = ctx.now().toISOString();
      const updated = await store.updateSubscription(sub.id, {
        status: 'canceled',
        cancelAtPeriodEnd: true,
        canceledAt: sub.canceledAt ?? nowIso,
        endedAt: nowIso,
        endedReason: 'canceled_by_admin'
      }, PAID_STATES);
      if (!updated) throw httpError(409, 'state_changed', 'Status langganan berubah. Muat ulang halaman.');
      const membershipIds = new Set((await service.membershipEntitlements(sub)).map((e) => e.id));
      await service.limitAccessTo(sub, nowIso);
      const sessions = (await store.listOpenSessions({ userId: sub.userId })).filter((s) => s.entitlementId && membershipIds.has(s.entitlementId)).map((s) => s.id);
      if (sessions.length > 0) await store.endSessions({ ids: sessions }, 'revoked');
      for (const invoice of await store.listInvoices({ subscriptionId: sub.id, statuses: ['issued', 'failed', 'draft'] })) {
        await service.voidInvoice(invoice, 'canceled_by_admin');
      }
      if (sub.midtransSubscriptionId) {
        await service.safeRemote(sub, 'cancel_by_admin', () => service.gateway.cancelSubscription(sub.midtransSubscriptionId!));
        await store.updateSubscription(sub.id, { midtransSubscriptionId: null });
      }
      const plan = await service.planById(sub.planId);
      service.notify(updated, 'canceled', { planName: plan ? service.planName(plan, updated.language) : '', date: nowIso });
    }
    await service.event(sub, 'admin_canceled', { immediate, note });
    return respond(res, sub, { refundNote: 'Pengembalian dana (bila ada) dilakukan manual di dashboard Midtrans.' });
  }));

  // Ubah paket. Body: { plan_code, billing_cycle?, when: 'now' | 'period_end', note? }.
  // 'now' tanpa tagihan (koreksi/kompensasi): periode tetap, akses paket baru mulai sekarang.
  router.post('/api/admin/membership/subscriptions/:id/change-plan', admin, asyncRoute(async (req, res) => {
    const sub = await loadSubscription(req);
    const body = bodyOf(req);
    const target = await service.planByCode(String(body.plan_code || ''));
    const cycle = String(body.billing_cycle || sub.billingCycle) as BillingCycle;
    const when = body.when === 'period_end' ? 'period_end' : 'now';
    if (!target || target.code === 'free' || !BILLING_CYCLES.includes(cycle)) throw httpError(400, 'plan_unavailable', 'Paket tidak tersedia.');
    if (!PAID_STATES.includes(sub.status) || !sub.currentPeriodStart || !sub.currentPeriodEnd) throw httpError(409, 'not_open', 'Langganan tidak sedang berjalan.');
    if (target.id === sub.planId && cycle === sub.billingCycle) throw httpError(400, 'no_change', 'Paket dan siklus sama dengan yang berjalan.');
    const from = await service.planById(sub.planId);
    let updated: SubscriptionRecord | null;
    if (when === 'period_end') {
      updated = await store.updateSubscription(sub.id, {
        pendingPlanId: target.id === sub.planId ? null : target.id,
        pendingBillingCycle: cycle === sub.billingCycle ? null : cycle
      }, PAID_STATES);
      if (!updated) throw httpError(409, 'state_changed', 'Status langganan berubah. Muat ulang halaman.');
    } else {
      const nowIso = ctx.now().toISOString();
      updated = await store.updateSubscription(sub.id, { planId: target.id, billingCycle: cycle, pendingPlanId: null, pendingBillingCycle: null }, PAID_STATES);
      if (!updated) throw httpError(409, 'state_changed', 'Status langganan berubah. Muat ulang halaman.');
      await service.limitAccessTo(sub, nowIso);
      await service.grantAccess(updated, target, nowIso, updated.currentPeriodEnd!);
      if (updated.cancelAtPeriodEnd) await service.limitAccessTo(updated, updated.currentPeriodEnd!);
    }
    await service.reissueRenewal(updated);
    await service.event(updated, 'admin_plan_changed', { from: from?.code ?? null, to: target.code, cycle, when, note: noteOf(body) });
    await respond(res, updated);
  }));

  // Tandai / hapus status Founding. Body: { is_founding: boolean, note? }. Kursi Founding paket ikut diambil/dilepas.
  router.post('/api/admin/membership/subscriptions/:id/founding', admin, asyncRoute(async (req, res) => {
    const sub = await loadSubscription(req);
    const body = bodyOf(req);
    if (typeof body.is_founding !== 'boolean') throw httpError(400, 'invalid_request', 'is_founding harus boolean.');
    if (body.is_founding === sub.isFounding) throw httpError(400, 'no_change', 'Status Founding tidak berubah.');
    const plan = await service.planById(sub.planId);
    if (!plan) throw httpError(404, 'plan_not_found', 'Paket tidak ditemukan.');
    let updated: SubscriptionRecord | null;
    if (body.is_founding) {
      if (plan.foundingCap === null || plan.foundingPriceYearly === null) throw httpError(400, 'founding_unavailable', 'Paket ini tidak memiliki kuota Founding.');
      if (!sub.currentPeriodEnd || sub.billingCycle !== 'yearly') throw httpError(400, 'founding_yearly_only', 'Founding hanya untuk langganan tahunan yang sudah aktif.');
      if (!(await store.claimFoundingSlot(plan.id))) {
        throw httpError(409, 'founding_full', 'Kuota Founding paket ini sudah penuh. Naikkan kuota di pengaturan paket bila perlu.');
      }
      updated = await store.updateSubscription(sub.id, { isFounding: true, foundingEndsAt: sub.foundingEndsAt ?? sub.currentPeriodEnd });
      if (!updated) {
        await store.releaseFoundingSlot(plan.id);
        throw httpError(404, 'subscription_not_found', 'Langganan tidak ditemukan.');
      }
    } else {
      updated = await store.updateSubscription(sub.id, { isFounding: false, foundingEndsAt: null });
      if (!updated) throw httpError(404, 'subscription_not_found', 'Langganan tidak ditemukan.');
      await store.releaseFoundingSlot(plan.id);
    }
    await service.event(updated, 'admin_founding', { isFounding: body.is_founding, note: noteOf(body) });
    await respond(res, updated, { note: 'Harga terkunci (price_locked) tidak diubah; perpanjangan tetap memakai harga reguler.' });
  }));

  // ---- Pengingat WhatsApp: status gateway (nomor tersambung vs WHATSAPP_SENDER_NUMBER) dan kirim pesan uji. Body: { to? }.
  router.post('/api/admin/membership/whatsapp/test', admin, asyncRoute(async (req, res) => {
    const cfg = ctx.config.whatsapp;
    const sender = service.whatsapp;
    if (!sender) {
      throw httpError(409, 'whatsapp_disabled', cfg.provider === 'off'
        ? 'Pengingat WhatsApp belum diaktifkan (WHATSAPP_PROVIDER=off).'
        : `WHATSAPP_PROVIDER=${cfg.provider}, tetapi token/kredensial belum diisi.`);
    }
    const status = await sender.status().catch((err: any) => ({ ok: false, detail: String(err?.message || err), connectedNumber: null }));
    const rawTo = bodyOf(req).to;
    let sentTo: string | null = null;
    if (rawTo !== undefined && rawTo !== null && String(rawTo).trim() !== '') {
      const to = normalizeWhatsAppNumber(rawTo);
      if (!to) throw httpError(400, 'invalid_whatsapp', 'Nomor tujuan tidak valid.');
      try {
        await sender.send(to, whatsappTestMessage(), 'id');
      } catch (err: any) {
        throw httpError(502, 'whatsapp_send_failed', `Gagal mengirim pesan uji: ${String(err?.message || err).slice(0, 300)}`);
      }
      sentTo = formatWhatsAppNumber(to);
    }
    res.json({
      provider: sender.provider,
      senderNumber: formatWhatsAppNumber(cfg.senderNumber),
      connectedNumber: status.connectedNumber ? formatWhatsAppNumber(status.connectedNumber) : null,
      matchesSender: status.connectedNumber ? status.connectedNumber === cfg.senderNumber : null,
      gatewayOk: status.ok,
      detail: status.detail,
      sentTo
    });
  }));

  // ---- Ekspor CSV untuk akuntansi (waktu dalam WIB)
  router.get('/api/admin/membership/export/subscriptions.csv', admin, asyncRoute(async (req, res) => {
    const plans = await planMap();
    const includeAbandoned = req.query.all === '1';
    const rows = (await store.listSubscriptions({ limit: MAX_ROWS }))
      .filter((s) => includeAbandoned || s.currentPeriodStart !== null || OPEN_SUBSCRIPTION_STATUSES.includes(s.status));
    const header = [
      'subscription_id', 'user_id', 'email', 'nama', 'paket', 'siklus', 'status', 'founding', 'harga_terkunci',
      'periode_mulai_wib', 'periode_akhir_wib', 'akhir_tenggang_wib', 'batal_di_akhir_periode', 'dibatalkan_wib', 'berakhir_wib',
      'alasan_berakhir', 'metode_bayar', 'auto_debit', 'paket_berikutnya', 'siklus_berikutnya', 'founding_berakhir_wib', 'uji', 'dibuat_wib'
    ];
    const data = rows.map((s) => [
      s.id, s.userId, s.customerEmail, s.customerName, plans.get(s.planId)?.code ?? '', s.billingCycle, s.status, s.isFounding ? 'ya' : 'tidak', s.priceLocked,
      wib(s.currentPeriodStart), wib(s.currentPeriodEnd), wib(service.graceEndsAt(s)), s.cancelAtPeriodEnd ? 'ya' : 'tidak', wib(s.canceledAt), wib(s.endedAt),
      s.endedReason ?? '', s.paymentMethod, service.autodebitActive(s) ? 'ya' : 'tidak',
      s.pendingPlanId ? plans.get(s.pendingPlanId)?.code ?? '' : '', s.pendingBillingCycle ?? '', wib(s.foundingEndsAt), s.isTest ? 'ya' : 'tidak', wib(s.createdAt)
    ]);
    sendCsv(res, `keanggotaan-langganan-${jakartaDate(ctx.now()).replace(/-/g, '')}.csv`, toCsv(header, data));
  }));

  // ?from=YYYY-MM-DD&to=YYYY-MM-DD (tanggal bayar WIB, inklusif), ?status=paid|issued|...
  router.get('/api/admin/membership/export/invoices.csv', admin, asyncRoute(async (req, res) => {
    const plans = await planMap();
    const status = String(req.query.status || '');
    const invoices = await store.listInvoices({
      statuses: INVOICE_STATUSES.includes(status as InvoiceStatus) ? [status as InvoiceStatus] : undefined,
      paidFrom: dayStartIso(req.query.from),
      paidTo: dayStartIso(req.query.to, 1),
      limit: MAX_ROWS
    });
    const subs = new Map((await store.listSubscriptions({ limit: MAX_ROWS })).map((s) => [s.id, s]));
    const header = [
      'nomor_tagihan', 'order_id_midtrans', 'transaction_id_midtrans', 'subscription_id', 'email', 'nama', 'jenis', 'paket', 'siklus',
      'periode_mulai_wib', 'periode_akhir_wib', 'jumlah', 'status', 'metode', 'harga_founding', 'terbit_wib', 'jatuh_tempo_wib', 'dibayar_wib',
      'percobaan', 'alasan', 'uji'
    ];
    const data = invoices.map((i) => {
      const s = subs.get(i.subscriptionId);
      return [
        i.orderRef, i.midtransOrderId ?? '', i.midtransTransactionId ?? '', i.subscriptionId, s?.customerEmail ?? '', s?.customerName ?? '', i.kind,
        plans.get(i.planId)?.code ?? '', i.billingCycle, wib(i.periodStart), wib(i.periodEnd), i.amount, i.status, i.paymentType ?? (i.kind === 'manual' ? 'offline' : ''),
        i.isFoundingPrice ? 'ya' : 'tidak', wib(i.issuedAt), wib(i.dueAt), wib(i.paidAt), i.attempt, i.failureReason ?? '', i.isTest ? 'ya' : 'tidak'
      ];
    });
    sendCsv(res, `keanggotaan-invoice-${jakartaDate(ctx.now()).replace(/-/g, '')}.csv`, toCsv(header, data));
  }));

  return router;
};
