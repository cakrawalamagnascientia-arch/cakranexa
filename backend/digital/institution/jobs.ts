import { DAY_MS } from '../time';
import { OPEN_INVOICE_STATUSES } from './types';
import type { InstitutionService } from './service';

/**
 * Job kontrak institusi per jam (proses server Render + POST /api/internal/cron). Idempoten: update bersyarat dan event
 * ber-dedupe_key, jadi aman dijalankan berulang atau bersamaan dengan webhook.
 *  1. Invoice: pengingat H-3 sebelum jatuh tempo; lewat jatuh tempo -> overdue + email (sekali).
 *  2. Kontrak terbit yang sudah lunas dan periodenya mulai -> active (kontrak lama/trial diakhiri). Invoice perpanjangan
 *     yang belum dibayar `renewalVoidDays` (30) hari setelah periode sebelumnya berakhir -> void, kontraknya dibatalkan.
 *  3. Kontrak aktif: pemberitahuan institusi H-60 (draf perpanjangan, harga skala saat ini), email admin CakraNexa H-45,
 *     invoice perpanjangan terbit otomatis H-30 dan dikirim bersama pemberitahuan H-30. "Tidak diperpanjang" menghentikan
 *     semuanya.
 *  4. Akhir periode tanpa perpanjangan lunas -> grace (akses tetap) -> setelah grace_days -> expired.
 *     Entitlement anggota berakhir alami (ends_at = period_end + grace_days); trial tanpa tenggang.
 */
export interface InstitutionJobResult {
  checked: number;
  activated: number;
  graceStarted: number;
  expired: number;
  renewalNotices: number;
  renewalAdminNotices: number;
  renewalInvoicesIssued: number;
  renewalsVoided: number;
  invoiceReminders: number;
  invoicesOverdue: number;
  errors: number;
}

const HOUR_MS = 60 * 60 * 1000;
/** Pengingat invoice sekian hari sebelum jatuh tempo. */
const INVOICE_REMINDER_DAYS = 3;

export const runInstitutionJob = async (service: InstitutionService): Promise<InstitutionJobResult> => {
  const store = service.store;
  const now = service.ctx.now().getTime();
  const config = await service.config();
  const result: InstitutionJobResult = {
    checked: 0, activated: 0, graceStarted: 0, expired: 0, renewalNotices: 0, renewalAdminNotices: 0, renewalInvoicesIssued: 0,
    renewalsVoided: 0, invoiceReminders: 0, invoicesOverdue: 0, errors: 0
  };

  for (const invoice of await store.listInvoices({ statuses: OPEN_INVOICE_STATUSES })) {
    try {
      if (invoice.status !== 'issued' || !invoice.dueAt) continue;
      const due = Date.parse(invoice.dueAt);
      if (now >= due) {
        const overdue = await store.updateInvoice(invoice.id, { status: 'overdue' }, ['issued']);
        if (overdue && await service.event(invoice.institutionId, invoice.contractId, 'invoice_overdue', { number: invoice.number }, `invoice_overdue:${invoice.id}`)) {
          service.sendInvoiceEmail(overdue, 'invoiceOverdue');
          result.invoicesOverdue += 1;
        }
      } else if (now >= due - INVOICE_REMINDER_DAYS * DAY_MS
        && await service.event(invoice.institutionId, invoice.contractId, 'invoice_reminder', { number: invoice.number }, `invoice_reminder:${invoice.id}`)) {
        service.sendInvoiceEmail(invoice, 'invoiceReminder');
        result.invoiceReminders += 1;
      }
    } catch (err: any) {
      result.errors += 1;
      console.warn(`[institution] job gagal untuk invoice ${invoice.number}:`, err?.message || err);
    }
  }

  for (const listed of await store.listContracts({ statuses: ['issued', 'active', 'grace'] })) {
    result.checked += 1;
    try {
      // Dibaca ulang: aktivasi kontrak lain pada putaran ini bisa sudah mengakhiri kontrak ini.
      const contract = await store.getContract(listed.id);
      if (!contract) continue;
      const end = Date.parse(contract.periodEnd);
      if (contract.status === 'issued') {
        if (Date.parse(contract.periodStart) <= now && await service.activateContract(contract)) result.activated += 1;
        else if (await service.autoVoidUnpaidRenewal(contract)) result.renewalsVoided += 1;
        continue;
      }
      if (contract.status !== 'active' && contract.status !== 'grace') continue;
      if (now >= end) {
        const renewal = await service.paidRenewal(contract);
        if (renewal && Date.parse(renewal.periodStart) <= now && await service.activateContract(renewal)) {
          result.activated += 1;
          continue;
        }
        const graceEnd = end + contract.graceDays * DAY_MS;
        if (contract.status === 'active' && now < graceEnd) {
          if (await service.startGrace(contract)) result.graceStarted += 1;
        } else if (now >= graceEnd) {
          if (await service.expireContract(contract, contract.isTrial ? 'trial_ended' : contract.status === 'grace' ? 'grace_ended' : 'period_ended')) result.expired += 1;
        }
        continue;
      }
      if (contract.status === 'active' && !contract.isTrial) {
        if (now >= end - config.renewalAdminNoticeDays * DAY_MS && await service.sendRenewalAdminNotice(contract)) result.renewalAdminNotices += 1;
        if (now >= end - config.renewalInvoiceDays * DAY_MS && (await service.autoIssueRenewal(contract))?.created) result.renewalInvoicesIssued += 1;
        // Ambang terkecil yang sudah tercapai (mis. job pertama kali jalan di H-25 -> hanya pemberitahuan H-30).
        const threshold = [...config.renewalNoticeDays].sort((a, b) => a - b).find((days) => now >= end - days * DAY_MS);
        if (threshold !== undefined && await service.sendRenewalNotice(contract, threshold)) result.renewalNotices += 1;
      }
    } catch (err: any) {
      result.errors += 1;
      console.warn(`[institution] job gagal untuk kontrak ${listed.id}:`, err?.message || err);
    }
  }
  return result;
};

/** Job per jam di proses server (pertama kali 3 menit setelah start). Mengembalikan fungsi penghenti. */
export const startInstitutionJob = (service: InstitutionService): (() => void) => {
  const run = () => {
    runInstitutionJob(service)
      .then((result) => {
        const changed = result.activated + result.graceStarted + result.expired + result.renewalNotices + result.renewalAdminNotices
          + result.renewalInvoicesIssued + result.renewalsVoided + result.invoiceReminders + result.invoicesOverdue;
        if (changed > 0 || result.errors > 0) console.log('[institution] job:', JSON.stringify(result));
      })
      .catch((err) => console.warn('[institution] job gagal:', err?.message || err));
  };
  const first = setTimeout(run, 3 * 60 * 1000);
  const timer = setInterval(run, HOUR_MS);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
};
