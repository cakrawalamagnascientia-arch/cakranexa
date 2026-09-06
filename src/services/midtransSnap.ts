/**
 * midtransSnap.ts — memuat Snap.js Midtrans & membuka popup pembayaran.
 * Client key diambil dari VITE_MIDTRANS_CLIENT_KEY (aman dipublikasikan).
 * Server Key TIDAK PERNAH ada di browser; token Snap dibuat oleh backend (POST /api/orders).
 */
export interface SnapResult {
  order_id: string;
  transaction_status: string;
  status_code?: string;
  payment_type?: string;
  va_numbers?: Array<{ bank: string; va_number: string }>;
  [key: string]: any;
}

export interface SnapCallbacks {
  onSuccess?: (result: SnapResult) => void;
  onPending?: (result: SnapResult) => void;
  onError?: (result: SnapResult) => void;
  onClose?: () => void;
}

declare global {
  interface Window {
    snap?: { pay: (token: string, callbacks: SnapCallbacks) => void };
  }
}

const getClientKey = (): string => {
  try {
    return String((import.meta as any).env?.VITE_MIDTRANS_CLIENT_KEY || '');
  } catch {
    return '';
  }
};

export const isMidtransClientConfigured = (): boolean => {
  const key = getClientKey();
  return Boolean(key && !key.includes('xxxx'));
};

let loadingPromise: Promise<boolean> | null = null;

/** Memuat Snap.js sekali; otomatis memilih sandbox/production berdasarkan prefix client key. */
export const loadSnapScript = (): Promise<boolean> => {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.snap) return Promise.resolve(true);
  if (loadingPromise) return loadingPromise;

  const clientKey = getClientKey();
  if (!isMidtransClientConfigured()) return Promise.resolve(false);

  const isProduction = !clientKey.startsWith('SB-');
  const src = isProduction ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js';

  loadingPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.setAttribute('data-client-key', clientKey);
    script.async = true;
    script.onload = () => resolve(Boolean(window.snap));
    script.onerror = () => {
      loadingPromise = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return loadingPromise;
};

/** Membuka popup Snap. Mengembalikan false jika Snap tidak tersedia (fallback ke simulasi). */
export const openSnapPayment = async (token: string, callbacks: SnapCallbacks): Promise<boolean> => {
  const ready = await loadSnapScript();
  if (!ready || !window.snap) return false;
  window.snap.pay(token, callbacks);
  return true;
};
