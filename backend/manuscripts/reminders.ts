import { addYears } from './rules';
import type { EffectiveTerms } from './addenda';
import type { ReminderKind } from './adminStore';
import type { ManuscriptContract, ManuscriptPayment } from './types';

/**
 * Pengingat kontrak naskah (fase 5R Langkah 2): tahap honor yang jatuh tempo dalam 7 hari atau terlambat, dan hak yang
 * akan kembali ke penulis dalam 12 bulan (nilai efektif setelah addendum). Hanya kontrak yang sudah ditandatangani.
 */

export interface ReminderItem {
  kind: ReminderKind;
  /** Tahap pembayaran (pembayaran) atau kontrak (hak kembali). */
  refId: string;
  /** Jatuh tempo atau tanggal hak kembali (YYYY-MM-DD). */
  refDate: string;
  contractId: string;
  contractNumber: string;
  authorName: string;
  bookTitle: string;
  stage: string | null;
  amount: number | null;
  /** Negatif = sudah lewat. */
  daysLeft: number;
}

export interface ReminderEntry {
  contract: ManuscriptContract;
  effective: EffectiveTerms;
  payments: ManuscriptPayment[];
}

export const DUE_SOON_DAYS = 7;

const DAY_MS = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export const collectReminders = (input: {
  entries: ReminderEntry[];
  today: string;
  authorName: (authorId: string) => string;
  bookTitle: (bookId: string | null) => string;
  dueSoonDays?: number;
}): ReminderItem[] => {
  const dueSoonDays = input.dueSoonDays ?? DUE_SOON_DAYS;
  const horizon = addYears(input.today, 1);
  const items: ReminderItem[] = [];
  for (const { contract, effective, payments } of input.entries) {
    if (contract.status !== 'signed') continue;
    const base = {
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      authorName: input.authorName(contract.authorId),
      bookTitle: input.bookTitle(contract.bookId)
    };
    for (const payment of payments) {
      if (payment.paidAt) continue;
      const daysLeft = daysBetween(input.today, payment.dueDate);
      if (daysLeft > dueSoonDays) continue;
      items.push({
        ...base,
        kind: daysLeft < 0 ? 'payment_overdue' : 'payment_due_soon',
        refId: payment.id,
        refDate: payment.dueDate,
        stage: payment.stage,
        amount: payment.amount,
        daysLeft
      });
    }
    if (effective.rightsRevertAt <= horizon) {
      items.push({
        ...base,
        kind: 'rights_revert_12m',
        refId: contract.id,
        refDate: effective.rightsRevertAt,
        stage: null,
        amount: null,
        daysLeft: daysBetween(input.today, effective.rightsRevertAt)
      });
    }
  }
  return items.sort((a, b) => a.daysLeft - b.daysLeft || a.contractNumber.localeCompare(b.contractNumber));
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const rupiah = (n: number) => `Rp${new Intl.NumberFormat('id-ID').format(n)}`;

export const reminderLabel = (item: ReminderItem): string => {
  if (item.kind === 'rights_revert_12m') {
    return item.daysLeft < 0
      ? `Hak sudah kembali ke penulis sejak ${item.refDate}`
      : `Hak kembali ke penulis pada ${item.refDate} (${item.daysLeft} hari lagi)`;
  }
  const amount = item.amount !== null ? rupiah(item.amount) : '';
  return item.kind === 'payment_overdue'
    ? `${item.stage} ${amount} terlambat ${-item.daysLeft} hari (jatuh tempo ${item.refDate})`
    : `${item.stage} ${amount} jatuh tempo ${item.refDate}${item.daysLeft === 0 ? ' (hari ini)' : ` (${item.daysLeft} hari lagi)`}`;
};

/** Email ringkasan untuk admin berisi pengingat yang baru (belum pernah dikirim). */
export const reminderEmail = (items: ReminderItem[], adminUrl: string) => {
  const rows = items.map((item) =>
    `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(item.contractNumber)}</td>` +
    `<td style="padding:4px 12px 4px 0">${escapeHtml(item.authorName)}</td>` +
    `<td style="padding:4px 12px 4px 0">${escapeHtml(item.bookTitle)}</td>` +
    `<td style="padding:4px 0">${escapeHtml(reminderLabel(item))}</td></tr>`).join('');
  const payments = items.filter((i) => i.kind !== 'rights_revert_12m').length;
  const rights = items.length - payments;
  return {
    subject: `[Kontrak Naskah] ${payments} pembayaran & ${rights} hak kembali perlu ditindaklanjuti`,
    html: `<p>Pengingat kontrak naskah jual putus:</p>` +
      `<table style="border-collapse:collapse;font-size:14px"><thead><tr><th align="left">Kontrak</th><th align="left">Penulis</th><th align="left">Judul</th><th align="left">Pengingat</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p>Buka <a href="${escapeHtml(adminUrl)}">dasbor admin → Kontrak Naskah</a> untuk menindaklanjuti.</p>`
  };
};
