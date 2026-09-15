/**
 * Kode unik 3 digit untuk transfer manual. Nominal transfer = (subtotal + ongkir) - 1000 + kode, jadi pembeli membayar
 * 1–999 rupiah LEBIH SEDIKIT (potongan diambil dari ongkir/pembulatan), tidak pernah lebih. Contoh: dasar Rp199.000,
 * kode 417 -> Rp198.417. Kode dipilih agar nominalnya berbeda dari pesanan lain yang masih menunggu transfer, sehingga
 * Finance bisa mencocokkan mutasi rekening hanya dari nominal.
 */
export interface UniqueCode {
  code: number;
  discount: number;
  total: number;
}

export const pickUniqueCode = (base: number, takenTotals: Set<number>, random: () => number = Math.random): UniqueCode | null => {
  if (!Number.isFinite(base) || base < 1000) return null;
  const start = Math.floor(Math.max(0, Math.min(0.999999, random())) * 999);
  for (let i = 0; i < 999; i += 1) {
    const code = ((start + i) % 999) + 1;
    const total = base - 1000 + code;
    if (!takenTotals.has(total)) return { code, discount: 1000 - code, total };
  }
  return null;
};

/** 7 -> "007" */
export const formatUniqueCode = (code: number): string => String(code).padStart(3, '0');
