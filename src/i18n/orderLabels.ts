import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrderStatus, PaymentMethod, ShippingMethod } from '../types';
import { DEFAULT_SHIPPING_METHODS } from '../services/shippingService';
import { DEFAULT_PAYMENT_SETTINGS } from '../services/paymentService';
import { useCmsText } from './hooks';

/**
 * Label tampilan untuk nilai data pesanan.
 * Nilai data (status 'pending', metode 'bca_va', id kurir 'jne-reg') tetap disimpan apa adanya;
 * hanya labelnya yang diterjemahkan lewat checkout:status.*, checkout:paymentMethods.*,
 * dan checkout:shippingMethods.*. Nilai yang tidak dikenal ditampilkan apa adanya.
 */
export const ORDER_STATUSES = [
  'pending', 'paid', 'processing', 'shipped', 'failed', 'cancelled'
] as const satisfies readonly OrderStatus[];

export const PAYMENT_METHODS = [
  'bca_va', 'mandiri_bill', 'bni_va', 'bri_va', 'permata_va', 'qris', 'gopay', 'ovo', 'dana',
  'shopeepay', 'linkaja', 'credit_card', 'manual_mandiri'
] as const satisfies readonly PaymentMethod[];

/** Metode yang punya label versi pendek (checkout:paymentMethodsShort.*), mis. daftar di CheckoutModal. */
const SHORT_LABEL_METHODS = ['mandiri_bill'] as const satisfies readonly PaymentMethod[];
type ShortLabelMethod = (typeof SHORT_LABEL_METHODS)[number];

export type PaymentMethodLabelVariant = 'default' | 'short';

const isOrderStatus = (value: string): value is OrderStatus =>
  (ORDER_STATUSES as readonly string[]).includes(value);
const isPaymentMethod = (value: string): value is PaymentMethod =>
  (PAYMENT_METHODS as readonly string[]).includes(value);
const hasShortLabel = (value: PaymentMethod): value is ShortLabelMethod =>
  (SHORT_LABEL_METHODS as readonly string[]).includes(value);

/** statusLabel('pending') -> "Menunggu Pembayaran"; paymentMethodLabel('bca_va') -> "BCA Virtual Account". */
export const useOrderLabels = () => {
  const { t } = useTranslation('checkout');
  return useMemo(() => ({
    statusLabel: (status: string): string => (isOrderStatus(status) ? t(`status.${status}`) : status),
    paymentMethodLabel: (method: string, variant: PaymentMethodLabelVariant = 'default'): string => {
      if (!isPaymentMethod(method)) return method;
      if (variant === 'short' && hasShortLabel(method)) return t(`paymentMethodsShort.${method}`);
      return t(`paymentMethods.${method}`);
    }
  }), [t]);
};

/** Id metode kirim bawaan (DEFAULT_SHIPPING_METHODS) -> kunci di checkout:shippingMethods. */
const SHIPPING_METHOD_KEYS = {
  'jne-reg': 'jneReg',
  'jne-yes': 'jneYes',
  'jnt-ez': 'jntEz',
  'pos-kilat': 'posKilat',
  'sicepat-best': 'sicepatBest',
  'sicepat-reg': 'sicepatReg',
  'tiki-reg': 'tikiReg'
} as const;

const shippingMethodKey = (id: string) =>
  SHIPPING_METHOD_KEYS[id as keyof typeof SHIPPING_METHOD_KEYS] as
    | (typeof SHIPPING_METHOD_KEYS)[keyof typeof SHIPPING_METHOD_KEYS]
    | undefined;

export interface ShippingMethodText {
  service: string;
  estimatedDays: string;
  description: string;
}

/**
 * Teks metode kirim (layanan, estimasi, deskripsi) dalam bahasa aktif.
 * Data metode kirim bisa diubah admin: teks yang masih sama dengan bawaan diterjemahkan,
 * teks yang sudah diubah admin ditampilkan apa adanya (lihat src/i18n/cms.ts).
 */
export const useShippingMethodText = () => {
  const { t } = useTranslation('checkout');
  const cmsText = useCmsText();
  return (method: ShippingMethod): ShippingMethodText => {
    const key = shippingMethodKey(method.id);
    const defaults = DEFAULT_SHIPPING_METHODS.find((m) => m.id === method.id);
    if (!key || !defaults) {
      return { service: method.service, estimatedDays: method.estimatedDays, description: method.description };
    }
    // Teks kosong tetap kosong (mis. deskripsi yang dihapus admin tetap disembunyikan).
    const localize = (value: string, indonesianDefault: string, translated: string) =>
      value ? cmsText(value, indonesianDefault, translated) : value;
    return {
      service: localize(method.service, defaults.service, t(`shippingMethods.${key}.service`)),
      estimatedDays: localize(method.estimatedDays, defaults.estimatedDays, t(`shippingMethods.${key}.estimatedDays`)),
      description: localize(method.description, defaults.description, t(`shippingMethods.${key}.description`))
    };
  };
};

/**
 * Petunjuk transfer manual dari pengaturan pembayaran (bisa diubah admin).
 * Bila kosong dipakai teks cadangan yang sebelumnya tertulis langsung di komponen.
 */
export const useManualTransferInstructions = () => {
  const { t } = useTranslation('checkout');
  const cmsText = useCmsText();
  return (instructions: string | undefined): string =>
    instructions
      ? cmsText(instructions, DEFAULT_PAYMENT_SETTINGS.manualTransferInstructions, t('bank.instructions.default'))
      : t('bank.instructions.fallback');
};
