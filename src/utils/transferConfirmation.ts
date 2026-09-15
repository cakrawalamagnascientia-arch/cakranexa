/**
 * Teks konfirmasi transfer ke WhatsApp Finance (halaman instruksi pesanan dan email pembeli memakai teks yang sama).
 */

/** 198417 -> "Rp198.417" */
export const formatRupiahPlain = (amount: number): string =>
  `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(amount))}`;

export const transferConfirmationText = (input: { orderNumber: string; amount: number; buyerName: string }): string =>
  `Konfirmasi pembayaran pesanan #${input.orderNumber}, ${formatRupiahPlain(input.amount)}, atas nama ${input.buyerName}`;

/** "+62 852-8614-6806" / "0852..." -> "6285286146806". */
export const whatsappNumber = (phone: string): string => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
};

export const whatsappLink = (phone: string, text: string): string =>
  `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`;

/** Nomor WhatsApp Finance bawaan (dapat ditimpa FINANCE_WHATSAPP di server). */
export const DEFAULT_FINANCE_WHATSAPP = '+6285286146806';
