import type { DigitalContext } from './context';
import type { EntitlementRecord } from './types';

/**
 * Resolusi hak akses. Sumber apa pun (purchase, membership, institution, admin_grant, author) diperlakukan sama:
 * akses sah bila ADA satu entitlement 'active' dengan starts_at <= sekarang dan (ends_at NULL atau > sekarang).
 * Fase 3–5 cukup menambah baris entitlement dengan source lain; logika ini tidak berubah.
 */
export type AccessDenialReason = 'no_entitlement' | 'suspended' | 'expired';

export const isEntitlementUsable = (entitlement: EntitlementRecord, now: Date): boolean =>
  entitlement.status === 'active'
  && Date.parse(entitlement.startsAt) <= now.getTime()
  && (!entitlement.endsAt || Date.parse(entitlement.endsAt) > now.getTime());

export interface EntitlementResolution {
  entitlement: EntitlementRecord | null;
  reason: AccessDenialReason | null;
  all: EntitlementRecord[];
}

/** Pilih entitlement yang berlaku dari daftar milik satu user + produk (murni, tanpa I/O). */
export const pickEntitlement = (
  all: EntitlementRecord[],
  now: Date
): { entitlement: EntitlementRecord | null; reason: AccessDenialReason | null } => {
  const usable = all.filter((e) => isEntitlementUsable(e, now));
  if (usable.length > 0) {
    // Utamakan hak seumur hidup, lalu yang berakhir paling lambat.
    const rank = (e: EntitlementRecord) => (e.endsAt ? Date.parse(e.endsAt) : Number.POSITIVE_INFINITY);
    usable.sort((a, b) => rank(b) - rank(a));
    return { entitlement: usable[0], reason: null };
  }
  // Penangguhan menang atas kedaluwarsa: pembeli perlu menghubungi admin, bukan membeli ulang.
  if (all.some((e) => e.status === 'suspended')) return { entitlement: null, reason: 'suspended' };
  if (all.some((e) => e.status === 'expired' || (e.status === 'active' && e.endsAt && Date.parse(e.endsAt) <= now.getTime()))) {
    return { entitlement: null, reason: 'expired' };
  }
  // Tidak ada, belum mulai, atau dicabut (refund): arahkan ke pembelian / keanggotaan.
  return { entitlement: null, reason: 'no_entitlement' };
};

export const resolveEntitlement = async (ctx: DigitalContext, userId: string, productId: string): Promise<EntitlementResolution> => {
  const all = await ctx.store.listEntitlements({ userId, productId });
  return { ...pickEntitlement(all, ctx.now()), all };
};

/** Batas perangkat per USER (bukan per entitlement) = max_devices tertinggi di antara entitlement yang sedang berlaku. */
export const maxDevicesForUser = async (ctx: DigitalContext, userId: string): Promise<number> => {
  const now = ctx.now();
  const usable = (await ctx.store.listEntitlements({ userId })).filter((e) => isEntitlementUsable(e, now));
  return usable.length > 0 ? Math.max(...usable.map((e) => e.maxDevices)) : ctx.config.defaultMaxDevices;
};
