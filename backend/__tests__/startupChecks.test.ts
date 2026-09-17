import { describe, expect, it } from 'vitest';
import { checkSupabase, evaluateStartup, REQUIRED_SCHEMA, type SupabaseCheckResult } from '../startupChecks';

/** Tiruan PostgREST: tabel -> kolom yang ada; `down` meniru kunci salah/jaringan putus. */
const fakeClient = (schema: Record<string, string[]>, options: { down?: string; hang?: boolean } = {}) => ({
  from: (table: string) => ({
    select: (columns: string) => ({
      limit: () => ({
        abortSignal: async (signal: AbortSignal) => {
          if (options.hang) {
            await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('The operation was aborted due to timeout'))));
          }
          if (options.down) return { data: null, error: { code: '', message: options.down } };
          if (!schema[table]) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } };
          const wanted = columns === '*' ? [] : columns.split(',');
          const absent = wanted.find((c) => !schema[table].includes(c));
          if (absent) return { data: null, error: { code: '42703', message: `column ${table}.${absent} does not exist` } };
          return { data: [], error: null };
        }
      })
    })
  })
});

/** Skema lengkap sesuai REQUIRED_SCHEMA. */
const fullSchema = (): Record<string, string[]> => {
  const schema: Record<string, string[]> = {};
  for (const r of REQUIRED_SCHEMA) schema[r.table] = [...(schema[r.table] || []), ...(r.columns || [])];
  return schema;
};

describe('checkSupabase', () => {
  it('skema lengkap -> terhubung tanpa objek hilang', async () => {
    const result = await checkSupabase(fakeClient(fullSchema()) as any);
    expect(result).toMatchObject({ connected: true, error: null, missing: [] });
  });

  it('migration fase 2 belum dijalankan -> daftar objek beserta file migration', async () => {
    const schema = fullSchema();
    for (const r of REQUIRED_SCHEMA.filter((x) => x.migration.includes('phase2') && !x.columns)) delete schema[r.table];
    schema.digital_products = [];
    const result = await checkSupabase(fakeClient(schema) as any);
    expect(result.connected).toBe(true);
    // Fase 3 memperluas tabel entitlements fase 2 dan fase 6 memperluas reading_events, jadi keduanya ikut dilaporkan.
    expect(new Set(result.missing.map((m) => m.migration))).toEqual(new Set(['src/db/digital_phase2_migration.sql', 'src/db/membership_phase3_migration.sql', 'src/db/membership_phase6_migration.sql']));
    expect(result.missing.map((m) => m.object)).toContain('digital_products.processing_status/storage_path');
    expect(result.missing.map((m) => m.object)).toContain('entitlements');
  });

  it('migration fase 3 belum dijalankan -> objek fase 3 (dan kolom fase 6 pada tabel plans)', async () => {
    const schema = fullSchema();
    for (const r of REQUIRED_SCHEMA.filter((x) => x.migration.includes('phase3') && !x.columns)) delete schema[r.table];
    schema.entitlements = [];
    delete schema.plans;
    delete schema.plan_benefits;
    const result = await checkSupabase(fakeClient(schema) as any);
    expect(result.connected).toBe(true);
    expect(new Set(result.missing.map((m) => m.migration))).toEqual(new Set(['src/db/membership_phase3_migration.sql', 'src/db/membership_phase6_migration.sql']));
    expect(result.missing.map((m) => m.object)).toEqual(expect.arrayContaining([
      'entitlements.scope', 'plans.print_discount_percent', 'plan_benefits.feature_flag', 'subscriptions', 'subscription_invoices', 'subscription_events', 'digital_member_picks'
    ]));
  });

  it('kunci salah / jaringan putus -> tidak terhubung, berhenti di pemeriksaan pertama', async () => {
    const result = await checkSupabase(fakeClient(fullSchema(), { down: 'Invalid API key' }) as any);
    expect(result).toMatchObject({ connected: false, missing: [] });
    expect(result.error).toContain('Invalid API key');
  });

  it('Supabase tidak menjawab -> timeout dianggap tidak terhubung', async () => {
    const result = await checkSupabase(fakeClient(fullSchema(), { hang: true }) as any, REQUIRED_SCHEMA, 50);
    expect(result.connected).toBe(false);
    expect(result.error).toMatch(/abort|timeout/i);
  });
});

describe('evaluateStartup', () => {
  const ok: SupabaseCheckResult = { connected: true, error: null, missing: [], checkedAt: '' };
  const down: SupabaseCheckResult = { connected: false, error: 'books: Invalid API key', missing: [], checkedAt: '' };
  const incomplete: SupabaseCheckResult = {
    connected: true, error: null, checkedAt: '',
    missing: [{ migration: 'src/db/digital_phase2_migration.sql', object: 'entitlements' }, { migration: 'src/db/digital_phase2_migration.sql', object: 'digital_orders.is_test' }]
  };

  it('Render tanpa Supabase -> berhenti', () => {
    expect(evaluateStartup({ RENDER: 'true' }, false, null)).toMatchObject({ required: true, fatal: true });
  });

  it('Render dengan Supabase tak terjangkau atau skema belum lengkap -> berhenti dengan pesan per migration', () => {
    expect(evaluateStartup({ RENDER: 'true' }, true, down).fatal).toBe(true);
    const evaluation = evaluateStartup({ RENDER: 'true' }, true, incomplete);
    expect(evaluation.fatal).toBe(true);
    expect(evaluation.problems).toEqual(['Skema belum lengkap — jalankan src/db/digital_phase2_migration.sql (belum ada: entitlements, digital_orders.is_test).']);
  });

  it('env terisi tetapi klien gagal dibuat (Node 20) -> berhenti dengan error asli, bukan "belum di-set"', () => {
    const evaluation = evaluateStartup({ RENDER: 'true' }, false, null, 'Node.js detected but native WebSocket not found.');
    expect(evaluation.fatal).toBe(true);
    expect(evaluation.problems).toEqual([
      'Klien Supabase gagal dibuat (env sudah terisi): Node.js detected but native WebSocket not found. — jalankan Node 22 atau lebih baru.'
    ]);
  });

  it('Render dengan Supabase lengkap -> jalan', () => {
    expect(evaluateStartup({ RENDER: 'true' }, true, ok)).toEqual({ required: true, problems: [], fatal: false });
  });

  it('override darurat, dev lokal, dan Vercel tidak dihentikan (masalah tetap dilaporkan)', () => {
    expect(evaluateStartup({ RENDER: 'true', ALLOW_START_WITHOUT_SUPABASE: 'true' }, false, null)).toMatchObject({ required: false, fatal: false });
    expect(evaluateStartup({}, false, null)).toMatchObject({ required: false, fatal: false, problems: ['SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set.'] });
    expect(evaluateStartup({ RENDER: 'true', VERCEL: '1' }, false, null).fatal).toBe(false);
  });
});
