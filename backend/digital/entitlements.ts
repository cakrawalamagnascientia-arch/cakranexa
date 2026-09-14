import type { DigitalContext } from './context';
import { jakartaDate } from './time';
import type { EntitlementRecord, ProductRecord } from './types';

/**
 * Resolusi hak akses. Sumber apa pun (purchase, membership, institution, admin_grant, author) diperlakukan sama:
 * akses sah bila ADA satu entitlement 'active' dengan starts_at <= sekarang dan (ends_at NULL atau > sekarang).
 *
 * Fase 3 menambah scope 'shelf' (satu baris per anggota per periode, digital_product_id NULL): berlaku untuk
 * produk yang memenuhi syarat rak (is_active, processing_status 'ready', shelf_entry_date <= hari ini WIB).
 * Aturan yang sama ada di fungsi SQL is_product_on_shelf (membership_phase3_migration.sql).
 */
export type AccessDenialReason = 'no_entitlement' | 'suspended' | 'expired';

export const isEntitlementUsable = (entitlement: EntitlementRecord, now: Date): boolean =>
  entitlement.status === 'active'
  && Date.parse(entitlement.startsAt) <= now.getTime()
  && (!entitlement.endsAt || Date.parse(entitlement.endsAt) > now.getTime());

/** Syarat Digital Reading Shelf; `today` = tanggal Jakarta (YYYY-MM-DD). */
export const isProductOnShelf = (product: Pick<ProductRecord, 'isActive' | 'processingStatus' | 'shelfEntryDate'>, today: string): boolean =>
  product.isActive && product.processingStatus === 'ready' && product.shelfEntryDate !== null && product.shelfEntryDate <= today;

export interface EntitlementResolution {
  entitlement: EntitlementRecord | null;
  reason: AccessDenialReason | null;
  all: EntitlementRecord[];
}

/** Pilih entitlement yang berlaku dari daftar kandidat (murni, tanpa I/O). */
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

export const resolveEntitlement = async (ctx: DigitalContext, userId: string, product: ProductRecord): Promise<EntitlementResolution> => {
  const now = ctx.now();
  const productRows = await ctx.store.listEntitlements({ userId, productId: product.id });
  const onShelf = isProductOnShelf(product, jakartaDate(now));
  const shelfRows = onShelf ? await ctx.store.listEntitlements({ userId, scope: 'shelf' }) : [];
  const all = [...productRows, ...shelfRows];
  const own = pickEntitlement(productRows, now);
  if (own.entitlement) return { ...own, all };
  // Penangguhan per judul (pembelian, Pick, atau blokir anomali) mengalahkan akses rak untuk judul itu.
  if (own.reason === 'suspended') return { ...own, all };
  return { ...pickEntitlement(all, now), all };
};

/** Memiliki produk seumur hidup (pembelian/grant tanpa ends_at)? Akses rak dan Pick tidak dihitung "sudah dimiliki". */
export const ownsPermanently = (rows: EntitlementRecord[], now: Date): boolean =>
  rows.some((e) => e.scope === 'product' && e.endsAt === null && isEntitlementUsable(e, now));

/** Batas perangkat per USER (bukan per entitlement) = max_devices tertinggi di antara entitlement yang sedang berlaku. */
export const maxDevicesForUser = async (ctx: DigitalContext, userId: string): Promise<number> => {
  const now = ctx.now();
  const usable = (await ctx.store.listEntitlements({ userId })).filter((e) => isEntitlementUsable(e, now));
  return usable.length > 0 ? Math.max(...usable.map((e) => e.maxDevices)) : ctx.config.defaultMaxDevices;
};
