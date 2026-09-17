import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { REQUIRED_SCHEMA } from '../startupChecks';
import { MAX_TERM_YEARS } from '../manuscripts/rules';

const root = path.resolve(__dirname, '../..');
const MIGRATION = 'src/db/manuscript_contracts_migration.sql';
const sql = fs.readFileSync(path.join(root, MIGRATION), 'utf8');
const checkSchema = fs.readFileSync(path.join(root, 'src/db/check_schema.sql'), 'utf8');

describe('migration kontrak naskah fase 5R (src/db/manuscript_contracts_migration.sql)', () => {
  it('dua tabel baru, aman diulang, hanya untuk server (RLS tanpa policy), tanpa operasi hapus data', () => {
    for (const table of ['manuscript_contracts', 'manuscript_payments']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(REQUIRED_SCHEMA).toContainEqual({ migration: MIGRATION, table });
      expect(checkSchema).toContain(`'${MIGRATION}', '${table}', 'table'`);
    }
    expect(sql).not.toMatch(/\b(DROP TABLE|DELETE FROM|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it('jual putus saja; jangka waktu paling lama 25 tahun dan tanggal hak kembali dicek database; tanpa kolom royalti atau data pajak teks', () => {
    expect(sql).toContain("CHECK (contract_type = 'jual_putus')");
    expect(sql).toContain(`CHECK (term_years BETWEEN 1 AND ${MAX_TERM_YEARS})`);
    expect(sql).toContain('CHECK (rights_revert_at = (signed_at + make_interval(years => term_years))::date)');
    for (const right of ['print', 'ebook', 'audiobook', 'translation', 'derivative']) expect(sql).toContain(`rights_${right} BOOLEAN NOT NULL`);
    expect(sql.replace(/--.*$/gm, '')).not.toMatch(/royalt|npwp|account_number|rekening/i);
  });
});
