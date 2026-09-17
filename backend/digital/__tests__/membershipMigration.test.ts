import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS, DEFAULT_PLAN_BENEFITS } from '../membership/plans';
import { MemoryDigitalStore } from '../memoryStore';
import { REQUIRED_SCHEMA } from '../../startupChecks';

/**
 * Migration fase 3 (src/db/membership_phase3_migration.sql) harus sama dengan kode: seed paket/manfaat = plans.ts,
 * dan setiap kolom yang ditulis/dibaca SupabaseDigitalStore (camelCase -> snake_case) ada di CREATE TABLE.
 * Perilaku SQL (constraint, fungsi, RLS) diuji terpisah di PGlite.
 */
const sql = fs.readFileSync(path.resolve(__dirname, '../../../src/db/membership_phase3_migration.sql'), 'utf8');

const tableColumns = (table: string): string[] => {
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!match) throw new Error(`tabel ${table} tidak ada di migration`);
  // Baris kolom = "nama_kolom TIPE ..." (tipe bisa enum huruf kecil); CONSTRAINT/PRIMARY KEY/daftar CHECK tidak cocok.
  return match[1].split('\n').map((line) => line.trim()).filter((line) => /^[a-z_]+ [A-Za-z]/.test(line)).map((line) => line.split(' ')[0]);
};

/** Baris VALUES dari INSERT seed sebuah tabel. */
const seedBlock = (table: string): string => {
  const match = sql.match(new RegExp(`INSERT INTO ${table} \\([^)]*\\) VALUES\\n([\\s\\S]*?)\\nON CONFLICT`));
  if (!match) throw new Error(`seed ${table} tidak ada di migration`);
  return match[1];
};

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
/** Nama kolom yang tidak sama persis dengan properti record. */
const COLUMN_ALIASES: Record<string, string> = { productId: 'digital_product_id' };
const columnsOf = (record: object) => Object.keys(record).map((key) => COLUMN_ALIASES[key] ?? snake(key));

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('migration fase 3', () => {
  it('seed paket sama dengan DEFAULT_PLANS (angka final brief)', () => {
    const rows = [...seedBlock('plans').matchAll(/^\s+\('(plan-[a-z]+)', '([a-z]+)', (.*)\),?$/gm)];
    expect(rows.map((r) => r[1])).toEqual(DEFAULT_PLANS.map((p) => p.id));
    for (const row of rows) {
      const plan = DEFAULT_PLANS.find((p) => p.id === row[1])!;
      const [nameId, nameEn, ...rest] = row[3].split(/,\s*/);
      const num = (v: string) => (v === 'NULL' ? null : Number(v));
      const [priceMonthly, priceYearly, foundingPriceYearly, foundingCap, foundingCount, maxDevices, shelfAccess, printDiscountPercent, sortOrder, isActive] = rest;
      expect({
        code: row[2],
        nameId: nameId.replace(/'/g, ''),
        nameEn: nameEn.replace(/'/g, ''),
        priceMonthly: num(priceMonthly),
        priceYearly: num(priceYearly),
        foundingPriceYearly: num(foundingPriceYearly),
        foundingCap: num(foundingCap),
        foundingCount: num(foundingCount),
        maxDevices: num(maxDevices),
        shelfAccess: shelfAccess.replace(/'/g, ''),
        printDiscountPercent: num(printDiscountPercent),
        sortOrder: num(sortOrder),
        isActive: isActive === 'TRUE'
      }).toEqual({
        code: plan.code,
        nameId: plan.nameId,
        nameEn: plan.nameEn,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        foundingPriceYearly: plan.foundingPriceYearly,
        foundingCap: plan.foundingCap,
        foundingCount: plan.foundingCount,
        maxDevices: plan.maxDevices,
        shelfAccess: plan.shelfAccess,
        printDiscountPercent: plan.printDiscountPercent,
        sortOrder: plan.sortOrder,
        isActive: plan.isActive
      });
    }
  });

  it('seed plan_benefits sama dengan DEFAULT_PLAN_BENEFITS', () => {
    const rows = [...seedBlock('plan_benefits').matchAll(/^\s+\('(plan-[a-z]+)', '([A-Za-z]+)', (\d+), (NULL|'([^']*)')\),?$/gm)]
      .map((r) => ({ planId: r[1], benefitKey: r[2], sortOrder: Number(r[3]), featureFlag: r[4] === 'NULL' ? null : r[5] }));
    expect(rows).toEqual(DEFAULT_PLAN_BENEFITS);
  });

  it('semua kolom record keanggotaan ada di tabel migration', async () => {
    const store = new MemoryDigitalStore(async () => [
      { id: 'prod-1', bookId: 'book-1', format: 'ebook', price: 1000, isActive: true, availabilityStatus: 'available', pageCount: 10, durationSeconds: null, shelfEntryDate: '2026-01-01' }
    ]);
    const [plan] = await store.listPlans();
    const [benefit] = await store.listPlanBenefits();
    const sub = await store.createSubscription({
      userId: USER, planId: 'plan-reader', billingCycle: 'yearly', status: 'pending', isFounding: false, priceLocked: 390000,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null, endedAt: null, endedReason: null,
      paymentMethod: 'va', midtransSubscriptionId: null, midtransToken: null, midtransTokenExpiresAt: null, midtransAccountId: null,
      pendingPlanId: null, pendingBillingCycle: null, foundingEndsAt: null, extraGraceDays: 0, customerEmail: 'a@uji.id',
      customerName: 'A', language: 'id', whatsappNumber: '6281234567890', whatsappOptIn: true, whatsappOptInAt: '2026-09-01T00:00:00.000Z',
      idempotencyKey: 'kunci-idempotensi-uji-01', isTest: false
    });
    const invoice = await store.createInvoice({
      subscriptionId: sub.id, userId: USER, kind: 'initial', planId: 'plan-reader', billingCycle: 'yearly',
      periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2027-09-01T00:00:00.000Z', amount: 390000, status: 'issued',
      orderRef: 'SUB-20260901-AAAAAAAAAA', midtransOrderId: null, midtransSnapToken: null, snapRedirectUrl: null, snapCreatedAt: null,
      midtransTransactionId: null, paymentType: null, claimsFounding: false, isFoundingPrice: false, issuedAt: '2026-09-01T00:00:00.000Z',
      paidAt: null, dueAt: null, attempt: 0, failureReason: null, isTest: false
    });
    await store.insertSubscriptionEvent({ subscriptionId: sub.id, type: 'created', meta: {}, dedupeKey: 'x' });
    const [event] = await store.listSubscriptionEvents({ subscriptionId: sub.id });
    const pick = await store.createPick({ subscriptionId: sub.id, userId: USER, productId: 'prod-1', periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' });

    const cases: Array<[string, object]> = [
      ['plans', plan],
      ['plan_benefits', benefit],
      ['subscriptions', sub],
      ['subscription_invoices', invoice],
      ['subscription_events', event],
      ['digital_member_picks', pick]
    ];
    for (const [table, record] of cases) {
      const columns = tableColumns(table);
      const missing = columnsOf(record).filter((c) => !columns.includes(c));
      expect({ table, missing }).toEqual({ table, missing: [] });
    }
  });

  it('memperluas entitlements hanya dengan scope, digital_product_id nullable, dan indeks unik rak', () => {
    const alters = [...sql.matchAll(/ALTER TABLE entitlements ([^;]+);/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
    expect(alters).toEqual([
      "ADD COLUMN IF NOT EXISTS scope entitlement_scope NOT NULL DEFAULT 'product'",
      'ALTER COLUMN digital_product_id DROP NOT NULL',
      expect.stringMatching(/^ADD CONSTRAINT entitlements_scope_product_check CHECK/),
      'ENABLE ROW LEVEL SECURITY'
    ].slice(0, alters.length));
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS entitlements_shelf_unique\s+ON entitlements \(user_id, source, source_ref, starts_at\) WHERE scope = 'shelf'/);
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i);
  });

  it('objek fase 3 di REQUIRED_SCHEMA dibuat oleh migration ini', () => {
    for (const r of REQUIRED_SCHEMA.filter((x) => x.migration.endsWith('membership_phase3_migration.sql'))) {
      if (r.table === 'entitlements') expect(sql).toContain('ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS scope');
      else {
        const columns = tableColumns(r.table);
        for (const c of r.columns ?? []) expect(columns).toContain(c);
      }
    }
  });
});
