import { useSyncExternalStore } from 'react';
import { apiUrl, fetchWithTimeout } from './apiClient';
import { getAccessToken } from './memberSession';

/**
 * Flag fitur digital dari server (DIGITAL_ENABLED + DIGITAL_BETA_EMAILS di Render), sehingga frontend Vercel
 * tidak perlu di-build ulang saat flag berubah. Nilai terakhir disimpan di localStorage agar menu tidak berkedip.
 * Ini hanya menyembunyikan UI; endpoint pembeli di server tetap memeriksa flag sendiri.
 */
export interface DigitalFeatureState {
  enabled: boolean;
  /** Sudah mendapat jawaban server (atau gagal menghubungi server) sejak halaman dimuat. */
  known: boolean;
}

const CACHE_KEY = 'cakranexa_digital_enabled';

const readCache = (): boolean => {
  try {
    return localStorage.getItem(CACHE_KEY) === '1';
  } catch {
    return false;
  }
};

let state: DigitalFeatureState = { enabled: typeof window !== 'undefined' && readCache(), known: false };
const listeners = new Set<() => void>();

const setState = (next: DigitalFeatureState) => {
  state = next;
  try {
    localStorage.setItem(CACHE_KEY, next.enabled ? '1' : '0');
  } catch {
    // abaikan
  }
  listeners.forEach((listener) => listener());
};

let latestRequest = 0;

/** Ambil ulang status (saat halaman dimuat dan setiap kali pengguna masuk/keluar). */
export const refreshDigitalFeature = async (): Promise<void> => {
  const ticket = ++latestRequest;
  try {
    const token = await getAccessToken();
    const res = await fetchWithTimeout(apiUrl('/api/digital/status'), { headers: token ? { Authorization: `Bearer ${token}` } : {} }, 15000);
    const body = res.ok ? await res.json() : null;
    if (ticket === latestRequest) setState({ enabled: body?.enabled === true, known: true });
  } catch {
    // Server tidak terjangkau: pertahankan nilai terakhir.
    if (ticket === latestRequest) setState({ enabled: state.enabled, known: true });
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useDigitalFeature = (): DigitalFeatureState => useSyncExternalStore(subscribe, () => state, () => state);
