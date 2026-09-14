import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GATEWAY_FEE_RATES,
  estimateGatewayFee,
  hjeOf,
  includedTax,
  loadPrintRoyaltyConfig,
  printOrderRoyaltyFields
} from '../printOrderRoyalty';
import { REQUIRED_SCHEMA } from '../startupChecks';

const config = loadPrintRoyaltyConfig({});

describe('data royalti pesanan cetak', () => {
  it('HJE = harga coret saat promo, selain itu harga katalog', () => {
    expect(hjeOf(185000)).toBe(185000);
    expect(hjeOf(150000, 185000)).toBe(185000);
    expect(hjeOf(185000, 150000)).toBe(185000);
  });

  it('kanal direct tanpa harga member: diskon = promo, PPN 0 bawaan, fee VA flat', () => {
    const fields = printOrderRoyaltyFields({
      items: [{ harga: 150000, originalHarga: 185000, unitPrice: 150000, quantity: 2 }, { harga: 99000, unitPrice: 99000, quantity: 1 }],
      subtotal: 399000,
      total: 417000,
      paymentMethod: 'bca_va',
      memberPrice: false,
      isTest: false,
      config
    });
    expect(fields.items).toEqual([{ hje_at_sale: 185000, discount_amount: 70000 }, { hje_at_sale: 99000, discount_amount: 0 }]);
    expect(fields.order).toEqual({ channel: 'direct', discount_amount: 70000, tax_amount: 0, gateway_fee_estimate: 4000, refund_status: 'none', is_test: false });
  });

  it('harga member -> kanal member, diskon = HJE - harga member', () => {
    const fields = printOrderRoyaltyFields({
      items: [{ harga: 185000, unitPrice: 157250, quantity: 1 }],
      subtotal: 157250,
      total: 175250,
      paymentMethod: 'qris',
      memberPrice: true,
      isTest: true,
      config
    });
    expect(fields.order).toMatchObject({ channel: 'member', discount_amount: 27750, gateway_fee_estimate: Math.round(175250 * 0.007), is_test: true });
  });

  it('PPN termasuk harga dan tarif gateway dapat diatur lewat env; nilai tidak valid diabaikan', () => {
    expect(includedTax(111000, 11)).toBe(11000);
    expect(includedTax(100000, 0)).toBe(0);
    const custom = loadPrintRoyaltyConfig({ PPN_PERCENT: '11', GATEWAY_FEE_RATES: '{"qris":{"pct":0.3},"gopay":{"pct":-1},"bca_va":{"flat":4440}}' });
    expect(custom.ppnPercent).toBe(11);
    expect(custom.feeRates.qris).toEqual({ pct: 0.3, flat: 0 });
    expect(custom.feeRates.gopay).toEqual(DEFAULT_GATEWAY_FEE_RATES.gopay);
    expect(custom.feeRates.bca_va).toEqual({ pct: 0, flat: 4440 });
    expect(loadPrintRoyaltyConfig({ PPN_PERCENT: 'abc', GATEWAY_FEE_RATES: '{rusak' }).ppnPercent).toBe(0);
    expect(estimateGatewayFee('manual_mandiri', 500000, config.feeRates)).toBe(0);
    expect(estimateGatewayFee(undefined, 500000, config.feeRates)).toBe(0);
    expect(estimateGatewayFee('credit_card', 100000, config.feeRates)).toBe(4900);
  });

  it('migration menambah semua kolom yang ditulis server, dan server menolak start tanpa kolom itu', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../src/db/print_orders_royalty_migration.sql'), 'utf8');
    const fields = printOrderRoyaltyFields({ items: [{ harga: 1, unitPrice: 1, quantity: 1 }], subtotal: 1, total: 1, memberPrice: false, isTest: false, config });
    for (const column of Object.keys(fields.order)) expect(sql).toContain(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ${column} `);
    for (const column of Object.keys(fields.items[0])) expect(sql).toContain(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS ${column} `);
    const required = REQUIRED_SCHEMA.filter((r) => r.migration === 'src/db/print_orders_royalty_migration.sql');
    expect(required.find((r) => r.table === 'orders')?.columns?.sort()).toEqual(Object.keys(fields.order).sort());
    expect(required.find((r) => r.table === 'order_items')?.columns?.sort()).toEqual(Object.keys(fields.items[0]).sort());
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE|UPDATE orders/i);
  });
});
