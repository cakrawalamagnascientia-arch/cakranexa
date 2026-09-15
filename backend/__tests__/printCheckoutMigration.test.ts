import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { REQUIRED_SCHEMA } from '../startupChecks';
import { PRINT_CHECKOUT_ORDER_COLUMNS, PRINT_ORDER_STATUSES } from '../printCheckout/types';
import { DEFAULT_PAYMENT_ROUTING } from '../../src/data/paymentRouting';

const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(path.join(root, 'src/db/print_checkout_migration.sql'), 'utf8');
const checkSchema = fs.readFileSync(path.join(root, 'src/db/check_schema.sql'), 'utf8');
const MIGRATION = 'src/db/print_checkout_migration.sql';

describe('migration checkout buku cetak (src/db/print_checkout_migration.sql)', () => {
  it('CHECK payment_status memuat tepat status yang dipakai kode', () => {
    const list = sql.match(/payment_status IN \(([^)]*)\)/)![1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
    expect(list.sort()).toEqual([...PRINT_ORDER_STATUSES].sort());
  });

  it('setiap kolom baru dibuat dengan IF NOT EXISTS; objek di REQUIRED_SCHEMA dan check_schema ada di migration', () => {
    for (const column of PRINT_CHECKOUT_ORDER_COLUMNS) {
      expect(sql, column).toMatch(new RegExp(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ${column}\\b`));
    }
    const required = REQUIRED_SCHEMA.filter((r) => r.migration === MIGRATION);
    expect(required.length).toBeGreaterThan(0);
    for (const r of required) {
      if (r.columns && r.table === 'orders') {
        for (const column of r.columns) expect(PRINT_CHECKOUT_ORDER_COLUMNS as readonly string[]).toContain(column);
      } else if (r.columns) {
        for (const column of r.columns) expect(sql, column).toMatch(new RegExp(`ALTER TABLE ${r.table} ADD COLUMN IF NOT EXISTS ${column}\\b`));
      } else {
        expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${r.table}`);
        expect(checkSchema).toContain(`'${MIGRATION}', '${r.table}', 'table'`);
      }
    }
  });

  it('seed payment_routing sama dengan bawaan kode: hanya transfer bank (manual), metode lain off', () => {
    for (const entry of DEFAULT_PAYMENT_ROUTING) expect(sql).toContain(`('print', '${entry.method}', '${entry.provider}')`);
    expect(sql).toContain('ON CONFLICT (transaction_type, method) DO NOTHING');
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('pesanan uji lama ditandai is_test (data contoh form checkout lama), dan form checkout tidak lagi terisi data contoh', () => {
    expect(sql).toMatch(/UPDATE orders SET is_test = TRUE/);
    expect(sql).toContain("'ahmad.fauzi@universitas.ac.id'");
    const modal = fs.readFileSync(path.join(root, 'src/components/CheckoutModal.tsx'), 'utf8');
    expect(modal).not.toContain('ahmad.fauzi@universitas.ac.id');
    expect(modal).not.toContain('Dr. Ahmad Fauzi');
  });
});
