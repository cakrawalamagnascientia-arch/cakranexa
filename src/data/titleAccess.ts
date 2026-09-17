import type { TitleStatusState } from '../hooks/useTitleStatus';
import type { ShelfPlanCode } from './digitalShelf';
import { addDaysToDate } from './digitalShelf';

/**
 * Tombol halaman buku digital (fase 6 Langkah 3), tanpa penjualan satuan:
 * sampel / buka dengan jatah x dari y / baca sekarang / tersedia untuk paket Anda pada <tanggal> / upgrade.
 * Fungsi murni: komponen hanya menerjemahkan `key` dan menjalankan `action`.
 */
export type TitleActionKind = 'sample' | 'startFree' | 'open' | 'pick' | 'plans' | 'upgrade' | 'renew' | 'contact';

export type TitleActionKey =
  | 'readSample' | 'listenSample' | 'startFree' | 'viewPlans' | 'upgrade' | 'upgradeEarlier'
  | 'readNow' | 'listenNow' | 'pick' | 'renew' | 'contact';

export type TitleNoticeKey =
  | 'guest' | 'unknown' | 'blue' | 'notIncluded' | 'openedWithQuota' | 'institution' | 'quotaAvailable'
  | 'quotaFull' | 'opensOn' | 'audioExhausted' | 'comingSoon' | 'suspended' | 'expired';

export interface TitleAction {
  kind: TitleActionKind;
  /** Kunci teks di digital.json (detail.access.actions.*). */
  key: TitleActionKey;
  params?: Record<string, string | number>;
}

export interface TitleNotice {
  /** Kunci teks di digital.json (detail.access.notices.*). */
  key: TitleNoticeKey;
  params?: Record<string, string | number>;
  tone: 'info' | 'success' | 'warning';
}

export interface TitleAccessView {
  /** null = hanya pemberitahuan (mis. belum terbuka untuk paket ini). */
  primary: TitleAction | null;
  secondary: TitleAction[];
  notice: TitleNotice | null;
  loading: boolean;
}

interface Input {
  state: TitleStatusState;
  format: 'ebook' | 'audiobook';
  hasSample: boolean;
}

const sample = (format: Input['format']): TitleAction => ({ kind: 'sample', key: format === 'ebook' ? 'readSample' : 'listenSample' });
const plans: TitleAction = { kind: 'plans', key: 'viewPlans' };
const upgrade: TitleAction = { kind: 'upgrade', key: 'upgrade' };

export const titleAccessView = ({ state, format, hasSample }: Input): TitleAccessView => {
  const samples = hasSample ? [sample(format)] : [];
  const view = (primary: TitleAction | null, secondary: TitleAction[], notice: TitleNotice | null = null): TitleAccessView => ({
    primary,
    secondary: secondary.filter((a) => a.kind !== primary?.kind),
    notice,
    loading: false
  });

  switch (state.kind) {
    case 'loading':
      return { primary: null, secondary: samples, notice: null, loading: true };
    case 'guest':
      return view(
        hasSample ? sample(format) : { kind: 'startFree', key: 'startFree' },
        [{ kind: 'startFree', key: 'startFree' }, plans],
        { key: 'guest', tone: 'info' }
      );
    case 'error':
      return view(samples[0] ?? plans, [plans], { key: 'unknown', tone: 'info' });
    case 'ready':
      break;
  }

  const s = state.status;
  const openKey = format === 'ebook' ? 'readNow' : 'listenNow';
  const offerUpgrade = s.upgrade ? [upgrade] : [];
  switch (s.status) {
    case 'open': {
      const notice: TitleNotice | null = s.via === 'quota' && s.endsAt
        ? { key: 'openedWithQuota', params: { date: jakartaDateOf(s.endsAt) }, tone: 'success' }
        : s.via === 'institution'
          ? { key: 'institution', tone: 'success' }
          : null;
      return view({ kind: 'open', key: openKey }, [], notice);
    }
    case 'quota_available':
      return view(
        { kind: 'pick', key: 'pick', params: { next: s.quota.used + 1, limit: s.quota.limit } },
        samples,
        { key: 'quotaAvailable', params: { remaining: s.quota.limit - s.quota.used, limit: s.quota.limit, date: jakartaDateOf(s.quota.resetsAt) }, tone: 'info' }
      );
    case 'quota_full':
      return view(
        offerUpgrade[0] ?? null,
        samples,
        { key: 'quotaFull', params: { used: s.quota.used, limit: s.quota.limit, date: jakartaDateOf(s.quota.resetsAt) }, tone: 'warning' }
      );
    case 'opens_on': {
      const earlier: TitleAction[] = s.upgrade && s.upgradeOpenDate ? [{ ...upgrade, key: 'upgradeEarlier' }] : [];
      return view(
        null,
        [...samples, ...earlier],
        s.openDate ? { key: 'opensOn', params: { date: s.openDate }, tone: 'info' } : { key: 'notIncluded', tone: 'info' }
      );
    }
    case 'audio_exhausted':
      return view(offerUpgrade[0] ?? null, samples, { key: 'audioExhausted', params: { date: jakartaDateOf(s.resetsAt) }, tone: 'warning' });
    case 'sample_only':
      return view(samples[0] ?? (s.planCode ? upgrade : plans), [s.planCode ? upgrade : plans], {
        key: s.planCode ? 'notIncluded' : 'blue',
        tone: 'info'
      });
    case 'coming_soon':
      return view(null, samples, { key: 'comingSoon', tone: 'info' });
    case 'suspended':
      return view({ kind: 'contact', key: 'contact' }, [], { key: 'suspended', tone: 'warning' });
    case 'expired':
      return view({ kind: 'renew', key: 'renew' }, samples, { key: 'expired', tone: 'warning' });
  }
};

/** Tanggal Jakarta (YYYY-MM-DD) dari waktu ISO — batas jatah dihitung dalam WIB. */
export const jakartaDateOf = (iso: string): string => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);

/** Ketersediaan per paket di halaman buku: tanggal buka (atau null = hanya sampel) untuk tiap paket dan instansi. */
export const availabilityByPlan = (
  shelfEntryDate: string | null,
  frontlist: Record<ShelfPlanCode, number>,
  institutionDays: number
): Array<{ plan: ShelfPlanCode | 'institution' | 'blue'; openDate: string | null }> => [
  { plan: 'blue', openDate: null },
  ...(['silver', 'gold', 'platinum'] as const).map((plan) => ({
    plan,
    openDate: shelfEntryDate ? addDaysToDate(shelfEntryDate, frontlist[plan]) : null
  })),
  { plan: 'institution', openDate: shelfEntryDate ? addDaysToDate(shelfEntryDate, institutionDays) : null }
];
