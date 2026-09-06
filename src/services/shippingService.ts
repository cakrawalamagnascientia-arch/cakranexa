import { ShippingMethod } from '../types';

export const DEFAULT_SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: 'jne-reg',
    courierCode: 'JNE',
    name: 'JNE Express',
    service: 'REG (Reguler)',
    estimatedDays: '2 - 3 Hari',
    baseRatePerKg: 14000,
    minCost: 14000,
    freeShippingThreshold: 300000,
    isActive: true,
    description: 'Layanan reguler terpercaya menjangkau seluruh kecamatan dan instansi kampus'
  },
  {
    id: 'jne-yes',
    courierCode: 'JNE',
    name: 'JNE Express',
    service: 'YES (Yakin Esok Sampai)',
    estimatedDays: '1 Hari Kerja',
    baseRatePerKg: 25000,
    minCost: 25000,
    freeShippingThreshold: 500000,
    isActive: true,
    description: 'Prioritas penerbangan ekspres khusus dokumen, monografi & modul penting'
  },
  {
    id: 'jnt-ez',
    courierCode: 'J&T',
    name: 'J&T Express',
    service: 'EZ (Standar)',
    estimatedDays: '2 - 3 Hari',
    baseRatePerKg: 13000,
    minCost: 13000,
    freeShippingThreshold: 300000,
    isActive: true,
    description: 'Penjemputan dan pengantaran 365 hari tanpa libur ke seluruh penjuru Indonesia'
  },
  {
    id: 'pos-kilat',
    courierCode: 'POS',
    name: 'POS Indonesia',
    service: 'Kilat Khusus',
    estimatedDays: '2 - 4 Hari',
    baseRatePerKg: 12000,
    minCost: 12000,
    freeShippingThreshold: 250000,
    isActive: true,
    description: 'Spesialis pengiriman instansi universitas, perpustakaan daerah, dan pelosok'
  },
  {
    id: 'sicepat-best',
    courierCode: 'SICEPAT',
    name: 'SiCepat Ekspres',
    service: 'BEST (Besok Sampai)',
    estimatedDays: '1 Hari Kerja',
    baseRatePerKg: 24000,
    minCost: 24000,
    freeShippingThreshold: 500000,
    isActive: true,
    description: 'Kecepatan optimal untuk ibu kota provinsi dan kota-kota besar universitas'
  },
  {
    id: 'sicepat-reg',
    courierCode: 'SICEPAT',
    name: 'SiCepat Ekspres',
    service: 'REG (Reguler)',
    estimatedDays: '2 - 3 Hari',
    baseRatePerKg: 13500,
    minCost: 13500,
    freeShippingThreshold: 300000,
    isActive: true,
    description: 'Ekonomis dengan pelacakan barcode digital real-time akurat'
  },
  {
    id: 'tiki-reg',
    courierCode: 'TIKI',
    name: 'TIKI',
    service: 'REG (Reguler)',
    estimatedDays: '2 - 3 Hari',
    baseRatePerKg: 13000,
    minCost: 13000,
    freeShippingThreshold: 300000,
    isActive: true,
    description: 'Jaringan kurir berpengalaman dengan jaminan penanganan paket buku aman'
  }
];

const SHIPPING_STORAGE_KEY = 'cakranexa_shipping_methods';

export const getStoredShippingMethods = (): ShippingMethod[] => {
  if (typeof window === 'undefined') return DEFAULT_SHIPPING_METHODS;
  try {
    const raw = localStorage.getItem(SHIPPING_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SHIPPING_STORAGE_KEY, JSON.stringify(DEFAULT_SHIPPING_METHODS));
      return DEFAULT_SHIPPING_METHODS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return DEFAULT_SHIPPING_METHODS;
  } catch (err) {
    console.error('Error reading shipping methods from localStorage:', err);
    return DEFAULT_SHIPPING_METHODS;
  }
};

export const saveStoredShippingMethods = (methods: ShippingMethod[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHIPPING_STORAGE_KEY, JSON.stringify(methods));
    window.dispatchEvent(new CustomEvent('cakranexa_shipping_methods_updated', { detail: methods }));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.error('Error saving shipping methods to localStorage:', err);
  }
};

export const resetDefaultShippingMethods = (): ShippingMethod[] => {
  saveStoredShippingMethods(DEFAULT_SHIPPING_METHODS);
  return DEFAULT_SHIPPING_METHODS;
};

// Regional rate multiplier by postal code
export const getZoneMultiplier = (postalCode: string): number => {
  if (!postalCode || postalCode.length < 2) return 1.0;
  const prefix = parseInt(postalCode.slice(0, 2), 10);
  // Jabodetabek (10 - 17)
  if (prefix >= 10 && prefix <= 17) return 1.0;
  // Jawa Barat & Banten (40 - 46, 18)
  if ((prefix >= 40 && prefix <= 46) || prefix === 18) return 1.15;
  // Jawa Tengah & DIY (50 - 59)
  if (prefix >= 50 && prefix <= 59) return 1.25;
  // Jawa Timur (60 - 69)
  if (prefix >= 60 && prefix <= 69) return 1.35;
  // Sumatera (20 - 39)
  if (prefix >= 20 && prefix <= 39) return 1.6;
  // Bali & Nusa Tenggara (80 - 87)
  if (prefix >= 80 && prefix <= 87) return 1.7;
  // Kalimantan (70 - 79)
  if (prefix >= 70 && prefix <= 79) return 2.0;
  // Sulawesi (90 - 98)
  if (prefix >= 90 && prefix <= 98) return 2.2;
  // Papua & Maluku (97 - 99)
  if (prefix >= 97 && prefix <= 99) return 2.8;

  return 1.2;
};

export interface ShippingCalculationResult {
  fee: number;
  originalFee: number;
  isFree: boolean;
  weightKg: number;
  zoneMultiplier: number;
  discountAmount: number;
}

export const calculateShippingFee = (
  method: ShippingMethod,
  totalWeightGram: number,
  postalCode: string,
  subtotal: number
): ShippingCalculationResult => {
  const weightKg = Math.max(1, Math.ceil(totalWeightGram / 1000));
  const zoneMultiplier = getZoneMultiplier(postalCode);

  // Base raw cost
  const rawCost = Math.round(method.baseRatePerKg * weightKg * zoneMultiplier);
  const originalFee = Math.max(method.minCost, rawCost);

  // Check free shipping threshold
  const threshold = method.freeShippingThreshold ?? 0;
  const isFree = threshold > 0 && subtotal >= threshold;

  return {
    fee: isFree ? 0 : originalFee,
    originalFee,
    isFree,
    weightKg,
    zoneMultiplier,
    discountAmount: isFree ? originalFee : 0
  };
};

/**
 * Auto-generate a unique CakraNexa Tracking / Waybill Code
 * Format: CNX-YYYY-MMDD-XXXX (e.g., CNX-2026-0905-4821)
 */
export const generateCakraNexaTrackingNumber = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `CNX-${year}-${month}${day}-${randomSuffix}`;
};

