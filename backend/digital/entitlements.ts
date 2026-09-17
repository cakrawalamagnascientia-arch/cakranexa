import type { DigitalContext } from './context';
import { jakartaDate } from './time';
import { INSTITUTION_FRONTLIST_DAYS, isOpenFor } from './membership/quota';
import type { EntitlementRecord, ProductRecord } from './types';

/**
 * Resolusi hak akses. Akses sah bila ADA satu entitlement 'active' dengan starts_at <= sekarang dan (ends_at NULL atau
 * > sekarang), dari sumber apa pun (purchase, membership, institution, admin_grant, author).
 *
 * Fase 3 menambah scope 'shelf' (satu baris per anggota per periode, digital_product_id NULL): berlaku untuk
 * produk yang memenuhi syarat rak (is_active, processing_status 'ready', shelf_entry_date <= hari ini WIB).
 * Aturan yang sama ada di fungsi SQL is_product_on_shelf (membership_phase3_migration.sql).
 *
 * Fase 4: bila beberapa hak berlaku, urutannya permanen -> individu -> institusi, sehingga pengguna yang punya akses
 * sendiri tidak memakan slot pengguna bersamaan institusinya. Hak rak institusi berkoleksi custom hanya membuka
 * judul yang dipilih di kontrak.
 *
 * Fase 6: hak rak keanggotaan hanya membuka format dan tanggal buka paketnya (shelf_entry_date + frontlist_days;
 * Silver/Gold: audiobook saja, e-book lewat jatah judul). Hak rak institusi terbuka shelf_entry_date + 45 hari.
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

/** Kelas prioritas: 0 = hak permanen milik pengguna, 1 = hak individu lain (keanggotaan, Pick, grant berbatas), 2 = institusi. */
export const entitlementPriority = (e: EntitlementRecord): number => (e.source === 'institution' ? 2 : e.endsAt === null ? 0 : 1);

/** Pilih entitlement yang berlaku dari daftar kandidat (murni, tanpa I/O). */
export const pickEntitlement = (
  all: EntitlementRecord[],
  now: Date
): { entitlement: EntitlementRecord | null; reason: AccessDenialReason | null } => {
  const usable = all.filter((e) => isEntitlementUsable(e, now));
  if (usable.length > 0) {
    // Urutan kelas (permanen -> individu -> institusi), lalu yang berakhir paling lambat.
    const end = (e: EntitlementRecord) => (e.endsAt ? Date.parse(e.endsAt) : Number.POSITIVE_INFINITY);
    usable.sort((a, b) => entitlementPriority(a) - entitlementPriority(b) || end(b) - end(a));
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
  const today = jakartaDate(now);
  const onShelf = isProductOnShelf(product, today);
  const shelfRows: EntitlementRecord[] = [];
  for (const e of onShelf ? await ctx.store.listEntitlements({ userId, scope: 'shelf' }) : []) {
    // Baris yang tidak berlaku hanya dipakai untuk alasan penolakan; cakupan dicek untuk baris yang berlaku.
    if (isEntitlementUsable(e, now)) {
      if (e.source === 'institution') {
        if (!isOpenFor(product, INSTITUTION_FRONTLIST_DAYS, today)) continue;
        // Kontrak institusi berkoleksi custom hanya membuka judul yang dipilih (fase 4).
        if (ctx.institution && !(await ctx.institution.coversProduct(e, product))) continue;
      } else if (e.source === 'membership' && ctx.membership && !(await ctx.membership.coversProduct(e, product))) {
        continue;
      }
    }
    shelfRows.push(e);
  }
  const all = [...productRows, ...shelfRows];
  // Hak per judul milik pengguna sendiri (pembelian, grant, Pick, blokir anomali) lebih dulu. Lisensi institusi per judul
  // ikut urutan prioritas bersama akses rak.
  const own = pickEntitlement(productRows.filter((e) => e.source !== 'institution'), now);
  if (own.entitlement) return { ...own, all };
  // Penangguhan per judul (pembelian, Pick, atau blokir anomali) mengalahkan akses rak untuk judul itu.
  if (own.reason === 'suspended') return { ...own, all };
  return { ...pickEntitlement(all, now), all };
};

/**
 * Memiliki produk seumur hidup (pembelian/grant tanpa ends_at)? Akses rak, Pick, dan lisensi institusi tidak dihitung
 * "sudah dimiliki" pengguna.
 */
export const ownsPermanently = (rows: EntitlementRecord[], now: Date): boolean =>
  rows.some((e) => e.scope === 'product' && e.endsAt === null && e.source !== 'institution' && isEntitlementUsable(e, now));

/** Batas perangkat per USER: 2 untuk semua paket, pembelian lama, dan instansi (fase 6 keputusan 10). */
export const maxDevicesForUser = async (ctx: DigitalContext, _userId: string): Promise<number> => ctx.config.defaultMaxDevices;
