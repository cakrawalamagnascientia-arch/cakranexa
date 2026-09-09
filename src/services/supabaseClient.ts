import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client sisi browser (ANON KEY, read-only berdasarkan RLS).
 * Semua penulisan dilakukan lewat Express API (service role). Lihat schema.sql.
 */
const env = (import.meta as any).env || {};

const supabaseUrl: string = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey: string = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean =>
  Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes('your-project') &&
      !supabaseAnonKey.includes('your-anon-key')
  );

let clientInstance: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) return null;
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return clientInstance;
};

export const supabase = getSupabaseClient();
