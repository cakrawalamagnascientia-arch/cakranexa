/**
 * orderUtils.ts — satu sumber format nomor pesanan & timestamp untuk seluruh alur checkout.
 * Format Order Number: CNX-YYYYMM-XXXXXX  (contoh: CNX-202609-483920)
 * Midtrans mensyaratkan order_id unik, maks 50 karakter, hanya [A-Za-z0-9-_.~].
 */
export const generateOrderNumber = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `CNX-${y}${m}-${rand}`;
};

export const generateOrderId = (): string => `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Selalu simpan ISO string agar bisa diurutkan & diparse ulang; format tampilan pakai formatOrderDate() */
export const nowIso = (): string => new Date().toISOString();

export const formatOrderDate = (iso: string | undefined, style: 'medium' | 'long' = 'medium'): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // data lama yang tersimpan sebagai string lokal
  return d.toLocaleString('id-ID', { dateStyle: style, timeStyle: 'short' });
};

/** Nomor VA simulasi (hanya dipakai saat Midtrans belum dikonfigurasi) */
export const generateSimulatedVa = (phone?: string): string => {
  const digits = (phone || '').replace(/\D/g, '').slice(-8);
  return `88012${digits.padStart(8, '0')}`;
};
