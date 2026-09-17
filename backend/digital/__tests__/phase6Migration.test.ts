import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { LEGACY_SUCCESSOR, PHASE6_PLAN_BENEFITS, PHASE6_PLANS } from '../membership/plans';
import { MemoryDigitalStore } from '../memoryStore';
import { REQUIRED_SCHEMA } from '../../startupChecks';
import { DEFAULT_PAYMENT_ROUTING } from '../../../src/data/paymentRouting';

/**
 * Migration fase 6 Langkah 1 (src/db/membership_phase6_migration.sql) harus sama dengan kode: UPSERT paket = PHASE6_PLANS,
 * manfaat = PHASE6_PLAN_BENEFITS, routing = DEFAULT_PAYMENT_ROUTING, penerus paket lama = LEGACY_SUCCESSOR, dan kolom
 * record fase 6 ada di tabel. Perilaku SQL (trigger kuota, fungsi agregasi) diuji di PGlite.
 */
const root = path.resolve(__dirname, '../../..');
const MIGRATION = 'src/db/membership_phase6_migration.sql';
const sql = fs.readFileSync(path.join(root, MIGRATION), 'utf8');
const code = sql.replace(/--.*$/gm, '');
const phase3 = fs.readFileSync(path.join(root, 'src/db/membership_phase3_migration.sql'), 'utf8');
const checkSchema = fs.readFileSync(path.join(root, 'src/db/check_schema.sql'), 'utf8');

const block = (start: string): string => {
  const at = code.indexOf(start);
  if (at < 0) throw new Error(`blok ${start} tidak ada`);
  return code.slice(at, code.indexOf(';', at));
};
const num = (v: string) => (v === 'NULL' ? null : Number(v));
const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe('migration fase 6 Langkah 1', () => {
  it('UPSERT paket = PHASE6_PLANS (harga, kuota, 2 perangkat, tanpa Founding), menimpa nilai lama', () => {
    const rows = [...block('INSERT INTO plans').matchAll(/^\s+\('(plan-[a-z]+)', '([a-z]+)', '([^']+)', '([^']+)', (.*)\),?$/gm)];
    expect(rows.map((r) => r[1])).toEqual(PHASE6_PLANS.map((p) => p.id));
    for (const row of rows) {
      const plan = PHASE6_PLANS.find((p) => p.id === row[1])!;
      const [priceMonthly, priceYearly, foundingPrice, foundingCap, foundingCount, maxDevices, shelf, print, sort, active, titles, hours, frontlist, offline, family, successor] = row[5].split(/,\s*/);
      expect({
        code: row[2], nameId: row[3], nameEn: row[4], priceMonthly: num(priceMonthly), priceYearly: num(priceYearly),
        foundingPriceYearly: num(foundingPrice), foundingCap: num(foundingCap), foundingCount: num(foundingCount), maxDevices: num(maxDevices),
        shelfAccess: shelf.replace(/'/g, ''), printDiscountPercent: num(print), sortOrder: num(sort), isActive: active === 'TRUE',
        ebookTitlesPerPeriod: num(titles), audioHoursPerPeriod: num(hours), frontlistDays: num(frontlist), offlineTitles: num(offline),
        familyAccounts: num(family), successorPlanId: successor === 'NULL' ? null : successor
      }).toEqual({
        code: plan.code, nameId: plan.nameId, nameEn: plan.nameEn, priceMonthly: plan.priceMonthly, priceYearly: plan.priceYearly,
        foundingPriceYearly: plan.foundingPriceYearly, foundingCap: plan.foundingCap, foundingCount: plan.foundingCount, maxDevices: plan.maxDevices,
        shelfAccess: plan.shelfAccess, printDiscountPercent: plan.printDiscountPercent, sortOrder: plan.sortOrder, isActive: plan.isActive,
        ebookTitlesPerPeriod: plan.ebookTitlesPerPeriod, audioHoursPerPeriod: plan.audioHoursPerPeriod, frontlistDays: plan.frontlistDays,
        offlineTitles: plan.offlineTitles, familyAccounts: plan.familyAccounts, successorPlanId: plan.successorPlanId
      });
      expect(plan.priceYearly).toBe(plan.priceMonthly * 10);
    }
    expect(block('INSERT INTO plans')).toMatch(/ON CONFLICT \(id\) DO UPDATE SET/);
  });

  it('paket lama dinonaktifkan dengan penerus (tidak dihapus); manfaat paket baru = seed kode', () => {
    for (const [legacy, successor] of Object.entries(LEGACY_SUCCESSOR)) {
      expect(code).toContain(`UPDATE plans SET is_active = FALSE, max_devices = 2, successor_plan_id = '${successor}' WHERE id = 'plan-${legacy}';`);
    }
    const benefits = [...block('INSERT INTO plan_benefits').matchAll(/^\s+\('(plan-[a-z]+)', '([A-Za-z]+)', (\d+), (NULL|'([^']*)')\),?$/gm)]
      .map((r) => ({ planId: r[1], benefitKey: r[2], sortOrder: Number(r[3]), featureFlag: r[4] === 'NULL' ? null : r[5] }));
    expect(benefits).toEqual(PHASE6_PLAN_BENEFITS);
  });

  it('routing: digital semua off, keanggotaan transfer manual; pilihan admin tidak ditimpa', () => {
    const routing = block("INSERT INTO payment_routing");
    for (const entry of DEFAULT_PAYMENT_ROUTING.filter((r) => r.transactionType !== 'print')) {
      expect(routing).toContain(`('${entry.transactionType}', '${entry.method}', '${entry.provider}')`);
    }
    expect(routing).toContain('ON CONFLICT (transaction_type, method) DO NOTHING');
  });

  it('daftar jenis event sama di migration fase 3 dan fase 6 (menjalankan ulang salah satunya aman)', () => {
    const list = (text: string) => text.match(/subscription_events_type_check CHECK \(type IN \(([\s\S]*?)\)\)/)![1]
      .replace(/--.*$/gm, '').match(/'([a-z_]+)'/g)!.sort();
    expect(list(phase3)).toEqual(list(sql));
    expect(list(sql)).toEqual(expect.arrayContaining(["'plan_migration_notice'", "'plan_migrated'", "'title_picked'", "'family_added'", "'family_removed'"]));
  });

  it('kolom record fase 6 ada di tabel; kuota dijaga trigger; hanya server yang menulis', async () => {
    const store = new MemoryDigitalStore(async () => []);
    const [plan] = await store.listPlans();
    const tableColumns = (table: string) => {
      const body = code.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`))![1];
      return body.split('\n').map((l) => l.trim()).filter((l) => /^[a-z_]+ [A-Z]/.test(l)).map((l) => l.split(' ')[0]);
    };
    const alias: Record<string, string> = { productId: 'digital_product_id' };
    const columnsOf = (keys: string[]) => keys.map((k) => alias[k] ?? snake(k));
    expect(columnsOf(['id', 'subscriptionId', 'userId', 'productId', 'periodStart', 'periodEnd', 'entitlementId', 'pickedAt']))
      .toEqual(expect.arrayContaining(tableColumns('period_title_picks')));
    expect(tableColumns('period_title_picks')).toEqual(expect.arrayContaining(columnsOf(['id', 'subscriptionId', 'userId', 'productId', 'periodStart', 'periodEnd', 'entitlementId', 'pickedAt'])));
    expect(tableColumns('family_members')).toEqual(expect.arrayContaining(columnsOf(['id', 'ownerSubscriptionId', 'userId', 'status', 'addedAt', 'removedAt'])));
    for (const key of ['ebookTitlesPerPeriod', 'audioHoursPerPeriod', 'frontlistDays', 'offlineTitles', 'familyAccounts', 'successorPlanId'] as const) {
      expect(plan).toHaveProperty(key);
      expect(code).toContain(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS ${snake(key)} `);
    }
    expect(code).toContain('ALTER TABLE reading_events ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL');
    expect(code).toMatch(/RAISE EXCEPTION 'title_quota_full'/);
    expect(code).toMatch(/RAISE EXCEPTION 'family_full'/);
    for (const table of ['period_title_picks', 'family_members']) {
      expect(code).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(code).toMatch(new RegExp(`CREATE POLICY "${table}_select_own" ON ${table} FOR SELECT TO authenticated`));
    }
    expect(code).toContain('GRANT EXECUTE ON FUNCTION membership_audio_seconds(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role');
  });

  it('tidak menghapus data; kredit instansi 40 -> 20 hanya bila masih nilai bawaan', () => {
    expect(code).not.toMatch(/\b(DELETE FROM|DROP TABLE|DROP COLUMN|TRUNCATE)\b/i);
    expect(code).toContain(`WHERE key = 'eba_pct' AND value = '40'::jsonb`);
    expect(code).toContain('ALTER TABLE institution_contracts ALTER COLUMN eba_pct SET DEFAULT 20');
  });

  it('terdaftar di REQUIRED_SCHEMA dan check_schema', () => {
    const required = REQUIRED_SCHEMA.filter((r) => r.migration === MIGRATION);
    expect(required.map((r) => r.table).sort()).toEqual(['family_members', 'period_title_picks', 'plans', 'reading_events']);
    for (const r of required) {
      if (r.columns) for (const column of r.columns) expect(code).toMatch(new RegExp(`ALTER TABLE ${r.table} ADD COLUMN IF NOT EXISTS ${column}\\b`));
      else expect(checkSchema).toContain(`(13, '${MIGRATION}', '${r.table}', 'table')`);
    }
    expect(checkSchema).toContain(`(13, '${MIGRATION}', 'membership_audio_seconds', 'function')`);
  });
});
