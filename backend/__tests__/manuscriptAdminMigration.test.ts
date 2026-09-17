import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(path.join(root, 'src/db/manuscript_admin_migration.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');

describe('migration admin kontrak naskah fase 5R Langkah 2 (src/db/manuscript_admin_migration.sql)', () => {
  it('akun login penulis: kolom nullable, satu akun untuk satu penulis, log tanpa FK agar tetap ada', () => {
    expect(code).toContain('ALTER TABLE authors ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL');
    expect(code).toContain('ALTER TABLE authors ADD COLUMN IF NOT EXISTS user_link_source TEXT');
    expect(code).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_authors_user_id ON authors (user_id) WHERE user_id IS NOT NULL');
    const log = code.match(/CREATE TABLE IF NOT EXISTS author_account_links \(([\s\S]*?)\n\);/)![1];
    expect(log).not.toMatch(/REFERENCES/);
  });

  it('addendum merujuk kontrak induk (RESTRICT), wajib berisi perubahan, jangka waktu maks. 25 tahun; pengingat unik per tahap & tanggal', () => {
    expect(code).toContain('contract_id UUID NOT NULL REFERENCES manuscript_contracts(id) ON DELETE RESTRICT');
    expect(code).toContain('term_years INTEGER CHECK (term_years IS NULL OR term_years BETWEEN 1 AND 25)');
    expect(code).toMatch(/num_nonnulls\([\s\S]*?\) > 0/);
    expect(code).toContain('CONSTRAINT manuscript_reminders_unique UNIQUE (kind, ref_id, ref_date)');
  });

  it('aman diulang, hanya server (RLS tanpa policy), tanpa hapus data atau kolom royalti/data pajak teks', () => {
    for (const table of ['author_account_links', 'manuscript_contract_addenda', 'manuscript_reminders']) {
      expect(code).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(code).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(code).not.toMatch(/\b(DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE)\b|CREATE POLICY/i);
    expect(code).not.toMatch(/royalt|npwp|rekening/i);
  });
});

describe('pendaftaran migration Langkah 2 di pemeriksaan skema', () => {
  it('REQUIRED_SCHEMA dan check_schema memuat objek yang dibuat migration', async () => {
    const { REQUIRED_SCHEMA } = await import('../startupChecks');
    const checkSchema = fs.readFileSync(path.join(root, 'src/db/check_schema.sql'), 'utf8');
    const MIGRATION = 'src/db/manuscript_admin_migration.sql';
    const required = REQUIRED_SCHEMA.filter((r) => r.migration === MIGRATION);
    expect(required.map((r) => r.table).sort()).toEqual(['author_account_links', 'authors', 'manuscript_contract_addenda', 'manuscript_reminders']);
    for (const r of required) {
      if (r.columns) {
        for (const column of r.columns) expect(code, column).toMatch(new RegExp(`ALTER TABLE ${r.table} ADD COLUMN IF NOT EXISTS ${column}\\b`));
      } else {
        expect(checkSchema).toContain(`(11, '${MIGRATION}', '${r.table}', 'table')`);
      }
    }
    expect(checkSchema).toContain(`(11, '${MIGRATION}', 'authors.user_id', 'column')`);
  });
});
