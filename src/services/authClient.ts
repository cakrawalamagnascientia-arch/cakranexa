import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Klien Supabase Auth untuk akun pembeli (sesi login disimpan di browser dan diperbarui otomatis).
 * Terpisah dari klien katalog read-only di supabaseClient.ts agar perilaku katalog tidak berubah.
 * Hanya memakai anon key — service-role key tidak pernah ada di browser.
 */
const env = (import.meta as any).env || {};
const supabaseUrl: string = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey: string = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isAuthConfigured = (): boolean =>
  Boolean(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project') && !supabaseAnonKey.includes('your-anon-key'));

let client: SupabaseClient | null = null;

export const getAuthClient = (): SupabaseClient | null => {
  if (typeof window === 'undefined' || !isAuthConfigured()) return null;
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'cakranexa-auth'
      }
    });
  }
  return client;
};
