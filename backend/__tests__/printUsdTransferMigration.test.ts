import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { SWIFT_RE } from '../bankAccounts';

const sql = fs.readFileSync(path.resolve(__dirname, '../../src/db/print_usd_transfer_migration.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');

describe('migration jalur transfer USD (src/db/print_usd_transfer_migration.sql)', () => {
  it('kolom baru idempoten dengan CHECK yang sama dengan kode', () => {
    expect(code).toMatch(/ALTER TABLE public\.admin_bank_accounts\s+ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'IDR' CHECK \(currency IN \('IDR', 'USD'\)\)/);
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS swift_code TEXT CHECK/);
    expect(code).toContain(`'${SWIFT_RE.source}'`);
    expect(code).toMatch(/ALTER TABLE orders ADD COLUMN IF NOT EXISTS transfer_currency TEXT/);
    expect(code).toMatch(/transfer_currency IN \('IDR', 'USD'\)/);
    expect(code).toMatch(/ALTER TABLE orders ADD COLUMN IF NOT EXISTS usd_amount_received NUMERIC\(14, 2\)/);
    expect(code).toMatch(/usd_amount_received > 0/);
  });

  it('tidak menghapus data; satu-satunya UPDATE mengisi SWIFT rekening USD Mandiri yang masih kosong', () => {
    expect(code).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i);
    const updates = code.match(/UPDATE[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain("SET swift_code = 'BMRIIDJA'");
    expect(updates[0]).toMatch(/currency = 'USD'/);
    expect(updates[0]).toMatch(/swift_code IS NULL/);
    expect(SWIFT_RE.test('BMRIIDJA')).toBe(true);
    expect(SWIFT_RE.test('BMRIIDJAXXX')).toBe(true);
    expect(SWIFT_RE.test('bmriidja')).toBe(false);
    expect(SWIFT_RE.test('BMRI1DJA')).toBe(false);
  });
});

describe('pendaftaran migration transfer USD di pemeriksaan skema', () => {
  it('REQUIRED_SCHEMA dan check_schema memuat kolom yang dibuat migration', async () => {
    const { REQUIRED_SCHEMA } = await import('../startupChecks');
    const checkSchema = fs.readFileSync(path.resolve(__dirname, '../../src/db/check_schema.sql'), 'utf8');
    const MIGRATION = 'src/db/print_usd_transfer_migration.sql';
    const required = REQUIRED_SCHEMA.filter((r) => r.migration === MIGRATION);
    expect(required).toHaveLength(2);
    for (const r of required) {
      for (const column of r.columns ?? []) {
        expect(code, column).toMatch(new RegExp(`ALTER TABLE (public\\.)?${r.table}\\s+ADD COLUMN IF NOT EXISTS ${column}\\b`));
      }
    }
    for (const object of ['admin_bank_accounts.swift_code', 'orders.transfer_currency', 'orders.usd_amount_received']) {
      expect(checkSchema).toContain(`(12, '${MIGRATION}', '${object}', 'column')`);
    }
  });
});
