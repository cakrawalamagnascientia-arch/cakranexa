import { OPEN_SUBSCRIPTION_STATUSES } from '../store';
import { DAY_MS } from '../time';
import { priceFor, type MembershipService } from './service';

/**
 * Job keanggotaan per jam (proses server Render + POST /api/internal/cron). Idempoten: semua langkah memakai
 * update bersyarat dan event ber-dedupe_key, jadi aman dijalankan berulang atau bersamaan dengan webhook.
 *  1. Langganan/upgrade pending tanpa pembayaran > 24 jam: dicocokkan ulang ke Midtrans, lalu di-void (kursi Founding dilepas).
 *  2. Founding: pemberitahuan harga reguler 30 hari sebelum ulang tahun pertama.
 *  2b. Paket fase 3 (tidak dijual lagi): pemberitahuan paket penerus dan harganya 30 hari sebelum perpanjangan.
 *  3. Dibatalkan & periode habis: status canceled, langganan Midtrans dihentikan.
 *  4. H-7: invoice perpanjangan terbit; pengingat H-7/H-3/H-1/H0 (manual) atau satu pemberitahuan (auto-debit).
 *  5. Jatuh tempo belum dibayar: cocokkan ulang -> grace (manual) atau past_due (auto-debit). Akses tetap terbuka.
 *  6. Masa tenggang habis: cocokkan ulang -> expired; akses berakhir alami, progres dan catatan tetap tersimpan.
 */
export interface MembershipJobResult {
  checked: number;
  pendingVoided: number;
  invoicesIssued: number;
  reminders: number;
  graceStarted: number;
  pastDue: number;
  expired: number;
  canceled: number;
  foundingNotices: number;
  planMigrationNotices: number;
  reconciled: number;
  errors: number;
}

const HOUR_MS = 60 * 60 * 1000;

export const runMembershipJob = async (service: MembershipService): Promise<MembershipJobResult> => {
  const { ctx } = service;
  const store = ctx.store;
  const cfg = ctx.config.membership;
  const now = ctx.now().getTime();
  const result: MembershipJobResult = {
    checked: 0, pendingVoided: 0, invoicesIssued: 0, reminders: 0, graceStarted: 0, pastDue: 0, expired: 0, canceled: 0, foundingNotices: 0, planMigrationNotices: 0, reconciled: 0, errors: 0
  };
  const ttlMs = (cfg.pendingTtlHours + 1) * HOUR_MS;

  for (const listed of await store.listSubscriptions({ statuses: OPEN_SUBSCRIPTION_STATUSES, limit: 10000 })) {
    result.checked += 1;
    try {
      // 1. Pendaftaran yang tidak dibayar.
      if (listed.status === 'pending') {
        const initial = (await store.listInvoices({ subscriptionId: listed.id, kinds: ['initial'], statuses: ['issued'] }))[0];
        const issuedAt = Date.parse(initial?.issuedAt ?? listed.createdAt);
        if (now - issuedAt >= ttlMs) {
          if (initial && await service.reconcile(initial, listed)) result.reconciled += 1;
          else {
            await service.voidPending(listed, 'payment_expired');
            result.pendingVoided += 1;
          }
        }
        continue;
      }
      for (const upgrade of await store.listInvoices({ subscriptionId: listed.id, kinds: ['upgrade'], statuses: ['issued'] })) {
        if (upgrade.issuedAt && now - Date.parse(upgrade.issuedAt) >= ttlMs) {
          if (await service.reconcile(upgrade, listed)) result.reconciled += 1;
          else await service.voidInvoice(upgrade, 'payment_expired');
        }
      }

      let sub = await store.getSubscription(listed.id);
      if (!sub || !sub.currentPeriodEnd || !OPEN_SUBSCRIPTION_STATUSES.includes(sub.status)) continue;
      const periodEnd = Date.parse(sub.currentPeriodEnd);

      // 2. Pemberitahuan harga Founding.
      if (sub.status === 'active' && sub.isFounding && sub.foundingEndsAt && !sub.cancelAtPeriodEnd) {
        const foundingEnd = Date.parse(sub.foundingEndsAt);
        if (now >= foundingEnd - cfg.foundingNoticeDays * DAY_MS && now < foundingEnd) {
          const plan = await service.planById(sub.planId);
          const regularPrice = plan ? priceFor(plan, 'yearly') : 0;
          if (await service.event(sub, 'founding_notice', { foundingEndsAt: sub.foundingEndsAt, regularPrice }, `founding_notice:${sub.id}:${sub.foundingEndsAt}`)) {
            service.notify(sub, 'foundingNotice', { date: sub.foundingEndsAt, regularPrice, planName: plan ? service.planName(plan, sub.language) : '' });
            result.foundingNotices += 1;
          }
        }
      }

      // 2b. Paket lama -> paket penerus.
      if (await service.sendPlanMigrationNotice(sub)) result.planMigrationNotices += 1;

      // 3. Pembatalan berlaku di akhir periode.
      if (sub.cancelAtPeriodEnd) {
        if (now >= periodEnd && await service.finishCanceled(sub)) result.canceled += 1;
        continue;
      }

      // 4. Invoice H-7 + pengingat.
      const before = await store.listInvoices({ subscriptionId: sub.id, kinds: ['renewal'] });
      let renewal = await service.issueRenewalInvoice(sub);
      if (renewal && !before.some((i) => i.id === renewal!.id)) result.invoicesIssued += 1;
      if (renewal && renewal.status !== 'paid') result.reminders += await service.sendReminders(sub, renewal);

      // 5. Jatuh tempo.
      if (now >= periodEnd && (sub.status === 'active' || sub.status === 'past_due')) {
        renewal = renewal ?? await service.issueRenewalInvoice(sub, true);
        if (renewal && renewal.status !== 'paid') {
          if (await service.reconcile(renewal, sub)) {
            result.reconciled += 1;
            continue;
          }
          if (sub.status === 'active') {
            if (service.autodebitActive(sub)) {
              if (await service.markPastDue(sub, renewal)) result.pastDue += 1;
            } else if (await service.startGrace(sub, renewal)) {
              result.graceStarted += 1;
            }
          }
        }
      }

      // 6. Masa tenggang habis.
      sub = await store.getSubscription(sub.id);
      if (!sub || !sub.currentPeriodEnd) continue;
      const graceEnd = Date.parse(sub.currentPeriodEnd) + (cfg.graceDays + sub.extraGraceDays) * DAY_MS;
      if (now >= graceEnd && (sub.status === 'grace' || sub.status === 'past_due')) {
        const unpaid = (await store.listInvoices({ subscriptionId: sub.id, kinds: ['renewal'], statuses: ['issued', 'failed'] }))
          .find((i) => i.periodStart === sub!.currentPeriodEnd) ?? null;
        if (unpaid && await service.reconcile(unpaid, sub)) {
          result.reconciled += 1;
          continue;
        }
        if (await service.expire(sub, unpaid)) result.expired += 1;
      }
    } catch (err: any) {
      result.errors += 1;
      console.warn(`[membership] job gagal untuk langganan ${listed.id}:`, err?.message || err);
    }
  }
  return result;
};

/** Job per jam di proses server (pertama kali 2 menit setelah start). Mengembalikan fungsi penghenti. */
export const startMembershipJob = (service: MembershipService): (() => void) => {
  const run = () => {
    runMembershipJob(service)
      .then((result) => {
        const changed = result.pendingVoided + result.invoicesIssued + result.reminders + result.graceStarted + result.pastDue + result.expired + result.canceled + result.foundingNotices + result.planMigrationNotices + result.reconciled;
        if (changed > 0 || result.errors > 0) console.log('[membership] job:', JSON.stringify(result));
      })
      .catch((err) => console.warn('[membership] job gagal:', err?.message || err));
  };
  const first = setTimeout(run, 2 * 60 * 1000);
  const timer = setInterval(run, HOUR_MS);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
};
