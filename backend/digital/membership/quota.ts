import type { DigitalContext } from '../context';
import { addDays, addMonths, DAY_MS, jakartaDate } from '../time';
import type { EntitlementRecord, PlanRecord, ProductRecord, SubscriptionRecord } from '../types';

/**
 * Aturan kuota fase 6 (docs/PHASE-6-BRIEF.md Langkah 1, keputusan 17-09-2026):
 *  - Tanggal buka per paket = shelf_entry_date + frontlist_days (Silver 90, Gold 45, Platinum 0; instansi 45; Blue tidak).
 *  - Silver/Gold: e-book lewat jatah judul per bulan (period_title_picks); audiobook seluruh rak dengan batas jam.
 *    Platinum: seluruh rak. Paket rak penuh fase 3: seluruh rak tanpa batas jam.
 *  - Jam audio dihitung per bulan per akun (paket tahunan juga per bulan) dari detik konten tervalidasi; sampel tidak dihitung.
 */

export const INSTITUTION_FRONTLIST_DAYS = 45;

/** YYYY-MM-DD + n hari (kalender). */
export const addDaysToDate = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Tanggal judul terbuka untuk paket dengan frontlist_days ini; null bila belum ada tanggal rak atau paket tanpa rak. */
export const openDateFor = (product: Pick<ProductRecord, 'shelfEntryDate'>, frontlistDays: number | null): string | null =>
  product.shelfEntryDate && frontlistDays !== null ? addDaysToDate(product.shelfEntryDate, frontlistDays) : null;

/** Judul siap dan sudah terbuka untuk paket ini pada `today` (tanggal Jakarta). */
export const isOpenFor = (
  product: Pick<ProductRecord, 'isActive' | 'processingStatus' | 'shelfEntryDate'>,
  frontlistDays: number | null,
  today: string
): boolean => {
  const open = openDateFor(product, frontlistDays);
  return product.isActive && product.processingStatus === 'ready' && open !== null && open <= today;
};

/** Hak rak keanggotaan paket ini mencakup format produk? */
export const shelfCoversFormat = (plan: Pick<PlanRecord, 'shelfAccess' | 'audioHoursPerPeriod'>, format: ProductRecord['format']): boolean => {
  if (plan.shelfAccess === 'full') return true;
  if (plan.shelfAccess === 'pick') return format === 'audiobook' && (plan.audioHoursPerPeriod ?? 0) > 0;
  return false;
};

/** Paket memberi baris hak rak (seluruh rak, atau audiobook untuk paket berjatah). */
export const planGrantsShelfRow = (plan: Pick<PlanRecord, 'shelfAccess' | 'audioHoursPerPeriod'>): boolean =>
  plan.shelfAccess === 'full' || (plan.shelfAccess === 'pick' && (plan.audioHoursPerPeriod ?? 0) > 0);

/** Slot bulanan di dalam periode tagihan (paket tahunan: 12 slot). */
export const monthSlot = (periodStart: string, periodEnd: string, now: Date): { start: string; end: string } => {
  const t = now.getTime();
  let k = 0;
  while (k < 24 && Date.parse(addMonths(periodStart, k + 1)) <= t) k += 1;
  const start = addMonths(periodStart, k);
  const next = addMonths(periodStart, k + 1);
  return { start, end: Date.parse(next) < Date.parse(periodEnd) ? next : periodEnd };
};

export interface AudioQuota {
  subscriptionId: string;
  userId: string;
  limitSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  slotStart: string;
  /** Jatah jam baru terbuka pada waktu ini. */
  resetsAt: string;
  exhausted: boolean;
}

const PLAN_CACHE_MS = 60_000;
const USAGE_CACHE_MS = 30_000;

/**
 * Hook akses keanggotaan untuk lapisan akses fase 2 (dipasang index.ts): cakupan hak rak per paket, kuota audio,
 * dan langganan asal sebuah entitlement (untuk reading_events.subscription_id).
 */
export class MembershipAccess {
  private planCache: { at: number; plans: PlanRecord[] } | null = null;
  private usage = new Map<string, { at: number; seconds: number }>();

  constructor(private readonly ctx: DigitalContext) {}

  async plans(): Promise<PlanRecord[]> {
    const now = Date.now();
    if (this.planCache && now - this.planCache.at < PLAN_CACHE_MS) return this.planCache.plans;
    const plans = await this.ctx.store.listPlans();
    this.planCache = { at: now, plans };
    return plans;
  }

  clearPlanCache(): void {
    this.planCache = null;
  }

  /** Langganan yang memberi entitlement keanggotaan ini (baris rak: source_ref; judul jatah: lewat period_title_picks). */
  async subscriptionFor(entitlement: EntitlementRecord): Promise<SubscriptionRecord | null> {
    if (entitlement.source !== 'membership' || !entitlement.sourceRef) return null;
    if (entitlement.scope === 'shelf') return this.ctx.store.getSubscription(entitlement.sourceRef);
    const [pick] = (await this.ctx.store.listTitlePicks({ userId: entitlement.userId })).filter((p) => p.id === entitlement.sourceRef);
    if (pick) return this.ctx.store.getSubscription(pick.subscriptionId);
    const [legacy] = (await this.ctx.store.listPicks({ userId: entitlement.userId })).filter((p) => p.id === entitlement.sourceRef);
    return legacy ? this.ctx.store.getSubscription(legacy.subscriptionId) : null;
  }

  async planFor(sub: SubscriptionRecord | null): Promise<PlanRecord | null> {
    if (!sub) return null;
    return (await this.plans()).find((p) => p.id === sub.planId) ?? null;
  }

  /** Hak rak keanggotaan membuka produk ini hari ini? (format sesuai paket dan tanggal buka per paket) */
  async coversProduct(entitlement: EntitlementRecord, product: ProductRecord): Promise<boolean> {
    const plan = await this.planFor(await this.subscriptionFor(entitlement));
    if (!plan) return false;
    return shelfCoversFormat(plan, product.format) && isOpenFor(product, plan.frontlistDays ?? 0, jakartaDate(this.ctx.now()));
  }

  private usageKey(subscriptionId: string, userId: string, slotStart: string) {
    return `${subscriptionId}:${userId}:${slotStart}`;
  }

  /** Kuota audio untuk entitlement keanggotaan; null = tidak dibatasi (bukan keanggotaan atau paket tanpa batas jam). */
  async audioQuota(entitlement: EntitlementRecord, userId: string, fresh = false): Promise<AudioQuota | null> {
    const sub = await this.subscriptionFor(entitlement);
    const plan = await this.planFor(sub);
    if (!sub || !plan || plan.audioHoursPerPeriod === null || !sub.currentPeriodStart || !sub.currentPeriodEnd) return null;
    const now = this.ctx.now();
    // Masa tenggang: slot terakhir diperpanjang sampai akses berakhir (tidak membuka jatah baru).
    const slot = now.getTime() < Date.parse(sub.currentPeriodEnd)
      ? monthSlot(sub.currentPeriodStart, sub.currentPeriodEnd, now)
      : { start: addMonths(sub.currentPeriodEnd, -1), end: addDays(sub.currentPeriodEnd, 365) };
    const key = this.usageKey(sub.id, userId, slot.start);
    const cached = this.usage.get(key);
    let used: number;
    if (!fresh && cached && Date.now() - cached.at < USAGE_CACHE_MS) used = cached.seconds;
    else {
      used = await this.ctx.store.audioSecondsUsed(sub.id, userId, slot.start, slot.end);
      this.usage.set(key, { at: Date.now(), seconds: used });
    }
    const limit = plan.audioHoursPerPeriod * 3600;
    return {
      subscriptionId: sub.id,
      userId,
      limitSeconds: limit,
      usedSeconds: used,
      remainingSeconds: Math.max(0, limit - used),
      slotStart: slot.start,
      resetsAt: slot.end,
      exhausted: used >= limit
    };
  }

  /** Detik baru yang diterima endpoint events ditambahkan ke cache (pemakaian terlihat tanpa menunggu query berikutnya). */
  recordUsage(quota: AudioQuota, seconds: number): void {
    const key = this.usageKey(quota.subscriptionId, quota.userId, quota.slotStart);
    const cached = this.usage.get(key);
    this.usage.set(key, { at: cached?.at ?? Date.now(), seconds: (cached?.seconds ?? quota.usedSeconds) + seconds });
  }
}
