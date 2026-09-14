import { spawnSync } from 'child_process';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pemeriksaan saat server start (dipakai server.ts dan /api/health):
 *  - Supabase benar-benar terhubung (bukan sekadar env terisi) dan skema hasil migration lengkap.
 *  - Di Render, server MENOLAK start bila Supabase tidak dikonfigurasi, tidak terhubung, atau skemanya belum lengkap:
 *    tanpa database, pesanan dan data produk digital hanya ada di memori dan hilang saat restart. Deploy yang gagal
 *    membuat Render tetap menjalankan versi sebelumnya. Darurat saja: ALLOW_START_WITHOUT_SUPABASE=true.
 * Daftar objek di sini sama dengan src/db/check_schema.sql (kueri pemeriksaan untuk SQL Editor).
 */

export interface SchemaRequirement {
  migration: string;
  table: string;
  /** Kolom yang ditambahkan migration setelah tabelnya dibuat. */
  columns?: string[];
}

export const REQUIRED_SCHEMA: SchemaRequirement[] = [
  { migration: 'schema.sql', table: 'books' },
  { migration: 'schema.sql', table: 'orders' },
  { migration: 'schema.sql', table: 'order_items' },
  { migration: 'schema.sql', table: 'seo_settings' },
  { migration: 'schema.sql', table: 'site_content' },
  { migration: 'src/db/authors_schema.sql', table: 'authors' },
  { migration: 'src/db/authors_schema.sql', table: 'book_authors' },
  { migration: 'src/db/i18n_content_migration.sql', table: 'books', columns: ['i18n'] },
  { migration: 'src/db/i18n_content_migration.sql', table: 'authors', columns: ['i18n'] },
  { migration: 'src/db/i18n_content_migration.sql', table: 'orders', columns: ['language'] },
  { migration: 'src/db/digital_products_migration.sql', table: 'digital_products' },
  { migration: 'src/db/digital_products_migration.sql', table: 'institution_inquiries' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'digital_products', columns: ['processing_status', 'storage_path'] },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'digital_product_pages' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'digital_product_chapters' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'digital_orders', columns: ['is_test'] },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'digital_order_items' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'entitlements' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'user_devices' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'access_sessions' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'access_logs' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'reading_progress' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'reading_events' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'user_notes' },
  { migration: 'src/db/digital_phase2_migration.sql', table: 'access_anomalies' },
  { migration: 'src/db/membership_phase3_migration.sql', table: 'entitlements', columns: ['scope'] },
  { migration: 'src/db/membership_phase3_migration.sql', table: 'plans', columns: ['print_discount_percent'] },
  { migration: 'src/db/membership_phase3_migration.sql', table: 'plan_benefits', columns: ['feature_flag'] },
  { migration: 'src/db/membership_phase3_migration.sql', table: 'subscriptions' },
  { migration: 'src/db/membership_phase3_migration.sql', table: 'subscription_invoices' },
  { migration: 'src/db/membership_phase3_migration.sql', table: 'subscription_events' },
  { migration: 'src/db/membership_phase3_migration.sql', table: 'digital_member_picks' },
  // Data royalti pesanan cetak: setiap pesanan baru menulis kolom ini (backend/printOrderRoyalty.ts).
  { migration: 'src/db/print_orders_royalty_migration.sql', table: 'orders', columns: ['channel', 'discount_amount', 'tax_amount', 'gateway_fee_estimate', 'refund_status', 'is_test'] },
  { migration: 'src/db/print_orders_royalty_migration.sql', table: 'order_items', columns: ['hje_at_sale', 'discount_amount'] },
  // Akses institusi fase 4 (backend/digital/institution): admin kontrak, invoice, dan job per jam memakai tabel ini.
  { migration: 'src/db/institution_phase4_migration.sql', table: 'institution_config' },
  { migration: 'src/db/institution_phase4_migration.sql', table: 'institution_tiers' },
  { migration: 'src/db/institution_phase4_migration.sql', table: 'institutions', columns: ['language'] },
  { migration: 'src/db/institution_phase4_migration.sql', table: 'institution_contracts' },
  { migration: 'src/db/institution_phase4_migration.sql', table: 'institution_contract_collections' },
  { migration: 'src/db/institution_phase4_migration.sql', table: 'institution_invoices', columns: ['snap_redirect_url'] },
  { migration: 'src/db/institution_phase4_migration.sql', table: 'institution_members', columns: ['disabled_by'] },
  { migration: 'src/db/institution_phase4_migration.sql', table: 'institution_join_codes' },
  { migration: 'src/db/institution_phase4_migration.sql', table: 'institution_events' },
  { migration: 'src/db/institution_phase4_migration.sql', table: 'institution_usage_daily' }
];

export interface MissingSchemaObject {
  migration: string;
  object: string;
}

export interface SupabaseCheckResult {
  connected: boolean;
  /** Pesan error koneksi/otorisasi (bukan objek skema yang hilang). */
  error: string | null;
  missing: MissingSchemaObject[];
  checkedAt: string;
}

/** Klien minimal yang dipakai pemeriksaan (SupabaseClient memenuhinya; tes memakai tiruan). */
type ProbeClient = Pick<SupabaseClient, 'from'>;

// PGRST205: tabel tidak ada di schema cache; PGRST204/42703: kolom tidak ada; 42P01: relasi tidak ada.
const SCHEMA_ERROR_CODES = new Set(['PGRST205', 'PGRST204', '42P01', '42703']);
const isSchemaError = (error: { code?: string; message?: string }) =>
  SCHEMA_ERROR_CODES.has(String(error.code || '')) || /does not exist|could not find/i.test(String(error.message || ''));

const probe = async (client: ProbeClient, table: string, columns: string[] | undefined, timeoutMs: number) => {
  try {
    // limit(0): tidak ada baris yang dikirim; PostgREST tetap memvalidasi tabel dan kolom.
    const { error } = await client.from(table).select(columns?.length ? columns.join(',') : '*').limit(0).abortSignal(AbortSignal.timeout(timeoutMs));
    return error ? { code: String(error.code || ''), message: String(error.message || 'error tanpa pesan') } : null;
  } catch (err: any) {
    return { code: 'network', message: String(err?.message || err) };
  }
};

export const checkSupabase = async (
  client: ProbeClient,
  requirements: SchemaRequirement[] = REQUIRED_SCHEMA,
  timeoutMs = 10_000,
  now: () => Date = () => new Date()
): Promise<SupabaseCheckResult> => {
  const missing: MissingSchemaObject[] = [];
  const result = (connected: boolean, error: string | null): SupabaseCheckResult => ({ connected, error, missing, checkedAt: now().toISOString() });
  for (const requirement of requirements) {
    const error = await probe(client, requirement.table, requirement.columns, timeoutMs);
    if (!error) continue;
    // Error selain objek skema yang hilang (kunci salah, jaringan, timeout) = tidak terhubung.
    if (!isSchemaError(error)) return result(false, `${requirement.table}: ${error.message}`);
    missing.push({
      migration: requirement.migration,
      object: requirement.columns?.length ? `${requirement.table}.${requirement.columns.join('/')}` : requirement.table
    });
  }
  return result(true, null);
};

export interface StartupEvaluation {
  /** Supabase wajib (Render, tanpa override darurat). */
  required: boolean;
  problems: string[];
  /** true = server harus berhenti. */
  fatal: boolean;
}

export const evaluateStartup = (
  env: NodeJS.ProcessEnv,
  supabaseConfigured: boolean,
  check: SupabaseCheckResult | null,
  /** Env terisi tetapi createClient melempar error (mis. Node < 22 tanpa WebSocket bawaan). */
  initError: string | null = null
): StartupEvaluation => {
  const required = Boolean(env.RENDER) && env.VERCEL !== '1' && env.ALLOW_START_WITHOUT_SUPABASE !== 'true';
  const problems: string[] = [];
  if (!supabaseConfigured && initError) {
    problems.push(`Klien Supabase gagal dibuat (env sudah terisi): ${initError}${/WebSocket/i.test(initError) ? ' — jalankan Node 22 atau lebih baru.' : ''}`);
  } else if (!supabaseConfigured) {
    problems.push('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set.');
  } else if (check && !check.connected) {
    problems.push(`Supabase tidak dapat dihubungi: ${check.error}`);
  } else if (check && check.missing.length > 0) {
    const byMigration = new Map<string, string[]>();
    for (const item of check.missing) byMigration.set(item.migration, [...(byMigration.get(item.migration) || []), item.object]);
    for (const [migration, objects] of byMigration) problems.push(`Skema belum lengkap — jalankan ${migration} (belum ada: ${objects.join(', ')}).`);
  }
  return { required, problems, fatal: required && problems.length > 0 };
};

/** Alat pemrosesan e-book/audiobook (terpasang di image Docker Render). */
export const checkProcessingTools = (paths: { ffmpeg: string; pdftoppm: string; pdftotext: string }): Record<'ffmpeg' | 'pdftoppm' | 'pdftotext', boolean> => {
  const available = (bin: string, flag: string) => {
    const run = spawnSync(bin, [flag], { timeout: 5000, stdio: 'ignore' });
    return !run.error && run.status === 0;
  };
  return {
    ffmpeg: available(paths.ffmpeg, '-version'),
    pdftoppm: available(paths.pdftoppm, '-v'),
    pdftotext: available(paths.pdftotext, '-v')
  };
};
