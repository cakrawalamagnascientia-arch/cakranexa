import { useEffect, useState } from 'react';
import { DEFAULT_PRINT_CHECKOUT_SETTINGS, INDONESIA_PROVINCES, type PrintCheckoutSettings } from '../data/shippingZones';
import { getPrintCheckoutConfig, type PrintCheckoutConfig } from '../services/printCheckoutApi';

/**
 * Konfigurasi checkout buku cetak dari server (zona ongkir, batas eksemplar ongkir manual, kode unik, metode aktif).
 * Selama server belum menjawab dipakai bawaan (hanya transfer bank); server tetap menghitung ulang ongkir saat pesanan
 * dibuat dan menolak angka yang berbeda. Satu permintaan dipakai bersama; hasil disimpan 60 detik.
 */
export const FALLBACK_PRINT_CHECKOUT_CONFIG: PrintCheckoutConfig = {
  fallbackMode: DEFAULT_PRINT_CHECKOUT_SETTINGS.fallbackMode,
  courierRates: false,
  provinces: [...INDONESIA_PROVINCES],
  zones: DEFAULT_PRINT_CHECKOUT_SETTINGS.zones,
  manualQuoteMinCopies: DEFAULT_PRINT_CHECKOUT_SETTINGS.manualQuoteMinCopies,
  uniqueCodeEnabled: DEFAULT_PRINT_CHECKOUT_SETTINGS.uniqueCodeEnabled,
  transferDueHours: DEFAULT_PRINT_CHECKOUT_SETTINGS.transferDueHours,
  methods: ['bank_transfer']
};

export const settingsOfConfig = (config: PrintCheckoutConfig): PrintCheckoutSettings => ({
  ...DEFAULT_PRINT_CHECKOUT_SETTINGS,
  fallbackMode: config.fallbackMode ?? DEFAULT_PRINT_CHECKOUT_SETTINGS.fallbackMode,
  zones: config.zones,
  manualQuoteMinCopies: config.manualQuoteMinCopies,
  uniqueCodeEnabled: config.uniqueCodeEnabled,
  transferDueHours: config.transferDueHours
});

const CACHE_MS = 60_000;
let cached: { at: number; config: PrintCheckoutConfig } | null = null;
let inflight: Promise<PrintCheckoutConfig | null> | null = null;

const loadConfig = (): Promise<PrintCheckoutConfig | null> => {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.config);
  if (!inflight) {
    inflight = getPrintCheckoutConfig()
      .then((config) => {
        cached = { at: Date.now(), config };
        return config;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

export const usePrintCheckoutConfig = (enabled = true): { config: PrintCheckoutConfig; loaded: boolean } => {
  const [config, setConfig] = useState<PrintCheckoutConfig>(() => cached?.config ?? FALLBACK_PRINT_CHECKOUT_CONFIG);
  const [loaded, setLoaded] = useState<boolean>(() => Boolean(cached));

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadConfig().then((next) => {
      if (!active) return;
      if (next) setConfig(next);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return { config, loaded };
};
