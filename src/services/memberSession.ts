import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getAuthClient, isAuthConfigured } from './authClient';

/**
 * Sesi akun pembeli (Supabase Auth). Menu "Pustaka Saya", checkout digital, reader, dan player
 * memakai hook ini; admin tetap memakai login password terpisah.
 */
export interface MemberSession {
  isLoggedIn: boolean;
  /** Sesi tersimpan sedang dipulihkan saat halaman dibuka. */
  isLoading: boolean;
  /** false bila Supabase Auth belum dikonfigurasi di build ini (login tidak tersedia). */
  isAvailable: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
}

const guest = (available: boolean): MemberSession => ({
  isLoggedIn: false,
  isLoading: false,
  isAvailable: available,
  userId: null,
  email: null,
  displayName: null
});

let snapshot: MemberSession = { ...guest(isAuthConfigured()), isLoading: isAuthConfigured() };
const listeners = new Set<() => void>();
let initialized = false;

const apply = (session: Session | null) => {
  const user = session?.user;
  snapshot = user
    ? {
        isLoggedIn: true,
        isLoading: false,
        isAvailable: true,
        userId: user.id,
        email: user.email ?? null,
        displayName: String(user.user_metadata?.full_name || user.email || '')
      }
    : guest(true);
  listeners.forEach((listener) => listener());
};

/** Memulihkan sesi tersimpan dan mengikuti perubahan login/logout (dipanggil sekali). */
export const initMemberSession = (): void => {
  if (initialized) return;
  initialized = true;
  const client = getAuthClient();
  if (!client) return;
  client.auth.getSession().then(({ data }) => apply(data.session), () => apply(null));
  client.auth.onAuthStateChange((_event, session) => apply(session));
};

const subscribe = (listener: () => void) => {
  initMemberSession();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => snapshot;

export const useMemberSession = (): MemberSession => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/** Access token Supabase untuk header Authorization ke API (diperbarui otomatis oleh supabase-js). */
export const getAccessToken = async (): Promise<string | null> => {
  const client = getAuthClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
};

// ---------------------------------------------------------------------------
// Aksi akun (halaman /account/*). Error dikembalikan sebagai kode agar teksnya diterjemahkan UI.
// ---------------------------------------------------------------------------
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'user_exists'
  | 'weak_password'
  | 'rate_limited'
  | 'unavailable'
  | 'unknown';

const mapAuthError = (error: { message?: string; status?: number; code?: string } | null): AuthErrorCode | null => {
  if (!error) return null;
  const code = error.code || '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(error.message || '')) return 'invalid_credentials';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(error.message || '')) return 'email_not_confirmed';
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(error.message || '')) return 'user_exists';
  if (code === 'weak_password' || /password should be/i.test(error.message || '')) return 'weak_password';
  if (error.status === 429 || code.startsWith('over_')) return 'rate_limited';
  return 'unknown';
};

export const signInWithPassword = async (email: string, password: string): Promise<AuthErrorCode | null> => {
  const client = getAuthClient();
  if (!client) return 'unavailable';
  const { error } = await client.auth.signInWithPassword({ email, password });
  return mapAuthError(error);
};

export const signUpWithPassword = async (input: {
  email: string;
  password: string;
  fullName: string;
  language: string;
  redirectTo: string;
}): Promise<{ error: AuthErrorCode | null; needsConfirmation: boolean }> => {
  const client = getAuthClient();
  if (!client) return { error: 'unavailable', needsConfirmation: false };
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: input.redirectTo,
      data: { full_name: input.fullName, language: input.language }
    }
  });
  if (error) return { error: mapAuthError(error), needsConfirmation: false };
  // Supabase mengembalikan user tanpa identities bila email sudah terdaftar (anti-enumerasi).
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: 'user_exists', needsConfirmation: false };
  }
  return { error: null, needsConfirmation: !data.session };
};

/** Login Google (keputusan fase 6 no. 12): hanya tampil bila VITE_ENABLE_GOOGLE_LOGIN=true dan Supabase Auth siap. */
export const isGoogleLoginEnabled = (): boolean =>
  String(import.meta.env.VITE_ENABLE_GOOGLE_LOGIN ?? '').toLowerCase() === 'true' && isAuthConfigured();

export const signInWithGoogle = async (redirectTo: string): Promise<AuthErrorCode | null> => {
  const client = getAuthClient();
  if (!client) return 'unavailable';
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  return mapAuthError(error);
};

/** Preferensi onboarding disimpan di user_metadata Supabase (tanpa tabel baru); cadangan: localStorage. */
export const saveOnboarding = async (input: { interests: string[]; format: string }): Promise<void> => {
  const payload = { interests: input.interests, favorite_format: input.format, onboarded_at: new Date().toISOString() };
  try {
    window.localStorage.setItem('cakranexa-onboarding', JSON.stringify(payload));
  } catch {
    // penyimpanan lokal tidak wajib
  }
  const client = getAuthClient();
  if (client) await client.auth.updateUser({ data: payload }).catch(() => undefined);
};

export const onboardingDone = (): boolean => {
  try {
    return Boolean(window.localStorage.getItem('cakranexa-onboarding'));
  } catch {
    return false;
  }
};

export const signOut = async (): Promise<void> => {
  const client = getAuthClient();
  if (client) await client.auth.signOut();
};

export const requestPasswordReset = async (email: string, redirectTo: string): Promise<AuthErrorCode | null> => {
  const client = getAuthClient();
  if (!client) return 'unavailable';
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  return mapAuthError(error);
};

export const updatePassword = async (password: string): Promise<AuthErrorCode | null> => {
  const client = getAuthClient();
  if (!client) return 'unavailable';
  const { error } = await client.auth.updateUser({ password });
  return mapAuthError(error);
};
