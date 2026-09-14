import { useEffect, useSyncExternalStore } from 'react';
import { memberRequest } from '../services/digitalApi';
import { useMemberSession } from '../services/memberSession';
import { resolveMemberPrintPricing, type MembershipPlansSummary, type MemberPrintPricing } from '../utils/memberPrice';

/**
 * Harga member buku cetak untuk pengguna yang sedang login (fase 3 Langkah 7).
 *
 * Status diambil dari GET /api/membership/plans (token dikirim otomatis oleh memberRequest) dan di-cache per user id
 * di tingkat modul, jadi banyak kartu buku = satu permintaan. Ganti pengguna / logout = cache dibuang, login lagi =
 * diambil ulang. Tamu tidak memicu permintaan apa pun. Endpoint gagal (mis. 503/offline) = tanpa diskon.
 */
export interface MemberPrintDiscount extends MemberPrintPricing {
  /** Harga member berlaku: tampilkan harga coret + "Harga member" dan kirim token saat membuat pesanan. */
  applies: boolean;
  /** false selama sesi login dipulihkan atau status keanggotaan sedang dimuat. */
  isResolved: boolean;
  userId: string | null;
}

interface Entry {
  userId: string;
  loading: boolean;
  value: MemberPrintPricing;
}

const UNKNOWN: MemberPrintPricing = { percent: 0, planCode: null, isActiveMember: null };

let entry: Entry | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => entry;

const load = (userId: string) => {
  if (entry?.userId === userId) return;
  const pending: Entry = { userId, loading: true, value: UNKNOWN };
  entry = pending;
  emit();
  memberRequest<MembershipPlansSummary>('/api/membership/plans', { timeoutMs: 15000 })
    .then(resolveMemberPrintPricing, () => resolveMemberPrintPricing(null))
    .then((value) => {
      if (entry !== pending) return; // pengguna berganti sebelum respons tiba
      entry = { userId, loading: false, value };
      emit();
    });
};

const reset = () => {
  if (!entry) return;
  entry = null;
  emit();
};

export const useMemberPrintDiscount = (): MemberPrintDiscount => {
  const session = useMemberSession();
  const userId = session.isLoggedIn ? session.userId : null;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (userId) load(userId);
    else if (!session.isLoading) reset();
  }, [userId, session.isLoading]);

  if (!userId) {
    return { percent: 0, planCode: null, isActiveMember: session.isLoading ? null : false, applies: false, isResolved: !session.isLoading, userId: null };
  }
  const own = snapshot && snapshot.userId === userId && !snapshot.loading ? snapshot.value : null;
  if (!own) return { ...UNKNOWN, applies: false, isResolved: false, userId };
  return { ...own, applies: own.percent > 0, isResolved: true, userId };
};
