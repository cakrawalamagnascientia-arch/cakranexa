import React from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import checkoutId from '../../i18n/locales/id/checkout.json';
import { PrintPaymentMethodPicker } from '../PrintPaymentMethodPicker';
import { ProofUploader, TransferInstructions } from '../TransferInstructions';
import { CourierRateList } from '../ShippingDestinationPicker';
import type { PrintOrderDetail } from '../../services/printCheckoutApi';

// Checkout buku cetak: satu metode = tanpa pilihan (poin 4); instruksi pesanan & bukti transfer (poin 5).
const DETAIL: PrintOrderDetail = {
  orderNumber: 'CNX-202609-000123',
  status: 'awaiting_transfer',
  paymentMethod: 'bank_transfer',
  language: 'id',
  createdAt: '2026-09-15T03:00:00.000Z',
  buyerName: 'Pembeli Uji',
  shippingAddress: 'Jl. Uji 1, Jakarta Pusat, DKI Jakarta (10410)',
  items: [{ bookId: 'book-a', title: 'Buku Uji Satu', quantity: 1, unitPrice: 185000, subtotal: 185000 }],
  subtotal: 185000,
  shippingFee: 15000,
  shippingZone: 'Jabodetabek',
  copies: 1,
  uniqueCode: 417,
  uniqueDiscount: 583,
  total: 199417,
  paymentDueAt: '2026-09-16T03:00:00.000Z',
  paidAt: null,
  trackingNumber: null,
  bankAccounts: [{ bankName: 'Bank Mandiri', accountNumber: '167-00-1164499-3', accountHolder: 'PT CAKRAWALA MAGNA SCIENTIA', branch: null }],
  financeWhatsapp: '+6285286146806',
  whatsappText: 'Konfirmasi pembayaran pesanan #CNX-202609-000123, Rp199.417, atas nama Pembeli Uji',
  hasProof: false,
  proofUploadedAt: null,
  canUploadProof: true,
  manualQuoteMinCopies: 5,
  transferDueHours: 24,
  companyName: 'PT Cakrawala Magna Scientia'
};

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({ lng: 'id', resources: { id: { checkout: checkoutId } }, ns: ['checkout'], defaultNS: 'checkout', interpolation: { escapeValue: false } });
  } else {
    i18next.addResourceBundle('id', 'checkout', checkoutId, true, true);
    await i18next.changeLanguage('id');
  }
});

describe('checkout buku cetak: metode pembayaran', () => {
  it('hanya satu metode aktif -> tidak ada pilihan, langsung keterangan transfer ke rekening PT', () => {
    const html = renderToStaticMarkup(<PrintPaymentMethodPicker methods={['bank_transfer']} selected="bank_transfer" onSelect={() => undefined} transferDueHours={24} />);
    expect(html).not.toContain('type="radio"');
    expect(html).toContain('Transfer Bank ke rekening PT Cakrawala Magna Scientia');
    expect(html).toContain('24 jam');
  });

  it('lebih dari satu metode -> pilihan radio', () => {
    const html = renderToStaticMarkup(<PrintPaymentMethodPicker methods={['bank_transfer', 'bca_va']} selected="bank_transfer" onSelect={() => undefined} transferDueHours={24} />);
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('BCA Virtual Account');
  });
});

describe('checkout buku cetak: ongkir RajaOngkir', () => {
  const RATES = [
    { courier: 'jne', courierName: 'JNE', service: 'REG', description: 'Layanan Reguler', cost: 18000, etd: '2-3 day' },
    { courier: 'pos', courierName: 'POS Indonesia', service: 'Pos Reguler', description: '240', cost: 21000, etd: '3 day' }
  ];

  it('daftar layanan kurir dengan tarif, estimasi, dan berat kiriman; layanan terpilih tercentang', () => {
    const html = renderToStaticMarkup(
      <CourierRateList state={{ status: 'ok', rates: RATES, weightGram: 700 }} selected={RATES[0]} onSelect={() => undefined} onRetry={() => undefined} minCopies={5} />
    );
    expect(html.match(/name="courier-rate"/g)).toHaveLength(2);
    for (const expected of ['JNE REG', 'Layanan Reguler', 'Estimasi 2-3 hari', 'POS Indonesia Pos Reguler', 'Estimasi 3 hari', 'Berat kiriman 0,7 kg', 'RajaOngkir']) {
      expect(html, expected).toContain(expected);
    }
    expect(html).toMatch(/18\.000/);
    expect(html).toMatch(/checked="" value="jne:REG"/);
    expect(html).not.toMatch(/checked="" value="pos:/);
    expect(html).not.toContain('240');
  });

  it('tarif tidak tersedia + cadangan tabel zona -> ongkir estimasi dengan catatan', () => {
    const html = renderToStaticMarkup(
      <CourierRateList state={{ status: 'estimate', rates: [], fee: 15000, zoneName: 'Jabodetabek' }} selected={null} onSelect={() => undefined} onRetry={() => undefined} minCopies={5} />
    );
    expect(html).toContain('Estimasi zona Jabodetabek');
    expect(html).toMatch(/15\.000/);
    expect(html).toContain('estimasi dari tabel zona');
    expect(html).not.toContain('courier-rate');
  });

  it('tarif tidak tersedia -> keterangan ongkir dicek admin (tanpa angka); pesanan besar -> keterangan N eksemplar', () => {
    const unavailable = renderToStaticMarkup(<CourierRateList state={{ status: 'manual', rates: [], reason: 'unavailable' }} selected={null} onSelect={() => undefined} onRetry={() => undefined} minCopies={5} />);
    expect(unavailable).toContain('cek langsung ke kurir');
    expect(unavailable).not.toContain('courier-rate');
    const bulk = renderToStaticMarkup(<CourierRateList state={{ status: 'manual', rates: [], reason: 'bulk' }} selected={null} onSelect={() => undefined} onRetry={() => undefined} minCopies={5} />);
    expect(bulk).toContain('5 eksemplar atau lebih');
  });
});

describe('halaman pesanan: instruksi transfer', () => {
  it('nominal persis, rincian kode unik, rekening PT, batas waktu WIB, tombol WhatsApp dengan teks otomatis, unggah bukti', () => {
    const html = renderToStaticMarkup(
      <TransferInstructions detail={DETAIL} language="id" copied={null} onCopy={() => undefined}>
        <ProofUploader language="id" hasProof={false} proofUploadedAt={null} uploading={false} error={null} onUpload={() => undefined} />
      </TransferInstructions>
    );
    for (const expected of ['Rp199.417', 'Rp185.000', 'Rp15.000', 'Ongkos kirim (Jabodetabek)', 'Potongan kode unik (417)', 'Bank Mandiri',
      '167-00-1164499-3', 'PT CAKRAWALA MAGNA SCIENTIA', 'WIB', 'Konfirmasi via WhatsApp', 'Unggah bukti transfer (opsional)']) {
      expect(html, expected).toContain(expected);
    }
    const wa = `https://wa.me/6285286146806?text=${encodeURIComponent(DETAIL.whatsappText)}`;
    expect(html).toContain(`href="${wa}"`);
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,application/pdf"');
  });
});
