import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  INSTITUTION_CATALOG_PRICE_BANDS,
  INSTITUTION_PROGRAM,
  INSTITUTION_TIERS,
  institutionAnnualPrice,
  acquisitionWalletAmount
} from '../../../src/data/membership';

/**
 * Migration fase 4 (src/db/institution_phase4_migration.sql) harus sama dengan angka fase 1 (src/data/membership.ts)
 * dan brief fase 4. Perilaku SQL (constraint, fungsi atomik, RLS) diuji terpisah di PGlite.
 */
const sql = fs.readFileSync(path.resolve(__dirname, '../../../src/db/institution_phase4_migration.sql'), 'utf8');

const seedBlock = (table: string): string => {
  const match = sql.match(new RegExp(`INSERT INTO ${table} \\([^)]*\\) VALUES\\n([\\s\\S]*?)\\nON CONFLICT`));
  if (!match) throw new Error(`seed ${table} tidak ada`);
  return match[1];
};
const configValue = (key: string): unknown => {
  const match = seedBlock('institution_config').match(new RegExp(`\\('${key}', '([^']*)'`));
  if (!match) throw new Error(`config ${key} tidak ada`);
  return JSON.parse(match[1]);
};
const num = (v: string) => (v === 'NULL' ? null : Number(v));

describe('migration fase 4', () => {
  it('seed tier sama dengan tier fase 1 (pengguna bersamaan, harga penuh, admin, webinar, diskon cetak, bulk, reading list)', () => {
    const rows = [...seedBlock('institution_tiers').matchAll(/^\s+\('([a-z]+)', '[^']+', (.*)\),?$/gm)].map((r) => {
      const [concurrent, admins, price, cadence, webinars, printPct, bulk, lists, manager] = r[2].split(/,\s*/);
      return {
        tier: r[1],
        concurrentUsers: num(concurrent),
        adminAccounts: num(admins),
        annualPrice: num(price),
        usageReports: cadence === 'NULL' ? null : cadence.replace(/'/g, ''),
        webinarsPerYear: num(webinars),
        printDiscountPercent: num(printPct),
        bulkOrderMin: num(bulk),
        readingListsPerYear: num(lists),
        accountManager: manager === 'TRUE'
      };
    });
    const cadence: Record<string, string> = { quarterly: 'quarterly', monthly: 'monthly', monthlyAnalysis: 'monthly_analysis' };
    expect(rows).toEqual(INSTITUTION_TIERS.map((t) => ({
      tier: t.key === 'consortium' ? 'enterprise' : t.key,
      concurrentUsers: t.concurrentUsers,
      adminAccounts: t.adminAccounts,
      annualPrice: t.annualPrice,
      usageReports: t.usageReports ? cadence[t.usageReports] : null,
      webinarsPerYear: t.webinarsPerYear,
      printDiscountPercent: t.printDiscountPercent,
      bulkOrderMin: t.bulkOrderMin,
      readingListsPerYear: t.readingListsPerYear,
      accountManager: t.key === 'network' || t.key === 'consortium'
    })));
  });

  it('konfigurasi: EBA 40% / 90 hari (fase 6 mengubah kredit menjadi 20%), Founding 15% untuk 30 institusi, skala katalog, PPN 0, lisensi e-book × 5', () => {
    // Seed fase 4 tetap 40; membership_phase6_migration.sql mengubahnya menjadi 20 (dicek phase6Migration.test.ts).
    expect(configValue('eba_pct')).toBe(40);
    expect(configValue('eba_expiry_days')).toBe(90);
    expect(configValue('founding_cap')).toBe(INSTITUTION_PROGRAM.founding.cap);
    expect(configValue('founding_discount_pct')).toBe(INSTITUTION_PROGRAM.founding.discountPercent);
    expect(configValue('catalog_scale')).toEqual(INSTITUTION_CATALOG_PRICE_BANDS.map((b) => ({ min_titles: b.minTitles, pct: b.percent })));
    expect(configValue('ppn_pct')).toBe(0);
    expect(configValue('grace_days')).toBe(14);
    expect(configValue('invoice_due_days')).toBe(14);
    expect(configValue('trial_days')).toBe(30);
    expect(configValue('renewal_notice_days')).toEqual([60, 30]);
    expect(configValue('license_price_multiplier')).toBe(5);
  });

  it('contoh perhitungan brief: Starter 23 judul 3.960.000 / Founding 3.366.000; kredit 20% (fase 6) 792.000 / 673.200', () => {
    const starter = INSTITUTION_TIERS.find((t) => t.key === 'starter')!;
    expect(institutionAnnualPrice(starter, 23)).toBe(3_960_000);
    expect(institutionAnnualPrice(starter, 23, true)).toBe(3_366_000);
    expect(acquisitionWalletAmount(3_960_000)).toBe(792_000);
    expect(acquisitionWalletAmount(3_366_000)).toBe(673_200);
  });

  it('hanya menambah: kolom institution_id pada tabel fase 2, tanpa DROP TABLE / DELETE / TRUNCATE', () => {
    const alters = [...sql.matchAll(/ALTER TABLE (access_sessions|reading_events) ([^;]+);/g)].map((m) => `${m[1]}: ${m[2].replace(/\s+/g, ' ')}`);
    expect(alters).toEqual([
      'access_sessions: ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL',
      'reading_events: ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL'
    ]);
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i);
  });
});
