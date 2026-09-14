/**
 * Tawaran keanggotaan setelah pembelian buku cetak sukses (fase 3 Langkah 6): paling sering sekali per 30 hari
 * per pengguna. Waktu tampil terakhir disimpan di localStorage per user id (atau 'guest').
 */
export const MEMBERSHIP_OFFER_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export const membershipOfferStorageKey = (userId: string | null | undefined): string =>
  `cakranexa_membership_offer_v1:${userId || 'guest'}`;

/** true bila belum pernah tampil atau terakhir tampil >= 30 hari lalu. */
export const isMembershipOfferDue = (lastShownMs: number | null, nowMs: number): boolean =>
  lastShownMs === null || !Number.isFinite(lastShownMs) || nowMs - lastShownMs >= MEMBERSHIP_OFFER_INTERVAL_MS || lastShownMs > nowMs;

export const readMembershipOfferShownAt = (userId: string | null | undefined): number | null => {
  try {
    const raw = window.localStorage.getItem(membershipOfferStorageKey(userId));
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

export const markMembershipOfferShown = (userId: string | null | undefined, nowMs: number): void => {
  try {
    window.localStorage.setItem(membershipOfferStorageKey(userId), String(nowMs));
  } catch {
    // localStorage diblokir (mode privat / kebijakan browser): tawaran tetap boleh tampil.
  }
};
