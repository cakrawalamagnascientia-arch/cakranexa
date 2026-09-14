import type { Book, CartItem } from '../types';

/**
 * Harga member buku cetak (fase 3 Langkah 7, flag server ENABLE_MEMBER_PRINT_DISCOUNT).
 *
 * Salinan PERSIS `memberPrintPrice` di backend/digital/membership/service.ts: POST /api/orders menghitung ulang
 * dengan rumus yang sama, jadi total yang tampil sebelum bayar = total yang ditagih server.
 * Persen dari harga dasar (harga coret bila buku sedang promo), dan hanya dipakai bila lebih murah dari harga jual
 * saat ini — tidak bertumpuk dengan promo. null = harga katalog biasa.
 */
export const memberPrintPrice = (harga: number, originalHarga: number | null | undefined, percent: number): number | null => {
  if (!(percent > 0) || !(harga > 0)) return null;
  const base = originalHarga && originalHarga > harga ? originalHarga : harga;
  const price = Math.round((base * (100 - percent)) / 100);
  return price < harga ? price : null;
};

/** Harga satuan yang dibayar: harga member bila berlaku, selain itu harga katalog. */
export const printUnitPrice = (book: Pick<Book, 'harga' | 'originalHarga'>, percent: number): number =>
  memberPrintPrice(book.harga, book.originalHarga, percent) ?? book.harga;

/** Subtotal barang cetak dengan harga member (percent 0 = subtotal katalog biasa). */
export const printSubtotal = (items: CartItem[], percent: number): number =>
  items.reduce((sum, item) => sum + printUnitPrice(item.book, percent) * item.quantity, 0);

/** Status keanggotaan yang aktif (termasuk tunggakan/masa tenggang): akses & harga member masih berlaku. */
export const ACTIVE_MEMBER_STATUSES: readonly string[] = ['active', 'past_due', 'grace'];

/** Bagian respons GET /api/membership/plans yang dipakai toko buku cetak. */
export interface MembershipPlansSummary {
  plans?: Array<{ code: string; printDiscountPercent?: number | null }>;
  flags?: { printDiscount?: boolean };
  current?: { planCode: string | null; status: string } | null;
}

export interface MemberPrintPricing {
  /** Persen harga member buku cetak; 0 = tidak berlaku (tampilan & pesanan persis seperti biasa). */
  percent: number;
  planCode: string | null;
  /** Punya keanggotaan aktif; null = tidak diketahui (endpoint gagal/tidak tersedia). */
  isActiveMember: boolean | null;
}

/**
 * Harga member hanya berlaku bila flag server aktif, pengguna punya keanggotaan aktif/past_due/grace,
 * dan paketnya punya printDiscountPercent > 0. Respons gagal (null) = tanpa diskon, status tidak diketahui.
 */
export const resolveMemberPrintPricing = (res: MembershipPlansSummary | null | undefined): MemberPrintPricing => {
  if (!res) return { percent: 0, planCode: null, isActiveMember: null };
  const current = res.current ?? null;
  const isActiveMember = Boolean(current && ACTIVE_MEMBER_STATUSES.includes(current.status));
  if (!res.flags?.printDiscount || !isActiveMember || !current?.planCode) return { percent: 0, planCode: null, isActiveMember };
  const plan = (res.plans ?? []).find((p) => p.code === current.planCode);
  const percent = Number(plan?.printDiscountPercent) || 0;
  return percent > 0 ? { percent, planCode: current.planCode, isActiveMember } : { percent: 0, planCode: null, isActiveMember };
};
