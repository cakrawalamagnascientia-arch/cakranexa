/**
 * adminAuth.ts — penyimpanan sesi admin di browser.
 * Token diterbitkan oleh server (POST /api/admin/login) dan hanya berlaku 12 jam.
 * Disimpan di sessionStorage agar hilang saat tab ditutup.
 */
const TOKEN_KEY = 'cakranexa_admin_token';
const EXPIRES_KEY = 'cakranexa_admin_token_expires';

export const getAdminToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const expires = sessionStorage.getItem(EXPIRES_KEY);
    if (!token) return null;
    if (expires && new Date(expires).getTime() < Date.now()) {
      clearAdminToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

export const setAdminToken = (token: string, expiresAt?: string): void => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    if (expiresAt) sessionStorage.setItem(EXPIRES_KEY, expiresAt);
    window.dispatchEvent(new CustomEvent('cakranexa_admin_auth_changed', { detail: { authenticated: true } }));
  } catch {
    // ignore
  }
};

export const clearAdminToken = (): void => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
    window.dispatchEvent(new CustomEvent('cakranexa_admin_auth_changed', { detail: { authenticated: false } }));
  } catch {
    // ignore
  }
};

export const isAdminAuthenticated = (): boolean => Boolean(getAdminToken());
