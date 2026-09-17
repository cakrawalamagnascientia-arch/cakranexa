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

  const USD_DETAIL: PrintOrderDetail = {
    ...DETAIL,
    uniqueCode: null,
    uniqueDiscount: 0,
    total: 200000,
    paymentDueAt: '2026-09-22T03:00:00.000Z',
    transferCurrency: 'USD',
    transferDueBusinessDays: 5,
    bankAccounts: [
      { bankName: 'Bank Mandiri', accountNumber: '167-00-1171867-2', accountHolder: 'PT CAKRAWALA MAGNA SCIENTIA', branch: null, currency: 'USD', swiftCode: 'BMRIIDJA' },
      { bankName: 'Bank Mandiri', accountNumber: '167-00-1164499-3', accountHolder: 'PT CAKRAWALA MAGNA SCIENTIA', branch: null, currency: 'IDR', swiftCode: null }
    ]
  };

  it('rekening IDR utama, rekening USD di bawahnya berjudul "Untuk pembayaran dari luar negeri" dengan pemilik, nomor, dan SWIFT', () => {
    const html = renderToStaticMarkup(<TransferInstructions detail={USD_DETAIL} language="id" copied={null} onCopy={() => undefined} />);
    const idrAt = html.indexOf('167-00-1164499-3');
    const titleAt = html.indexOf('Untuk pembayaran dari luar negeri');
    const usdAt = html.indexOf('167-00-1171867-2');
    expect(idrAt).toBeGreaterThan(-1);
    expect(titleAt).toBeGreaterThan(idrAt);
    expect(usdAt).toBeGreaterThan(titleAt);
    expect(html.slice(titleAt)).toContain('PT CAKRAWALA MAGNA SCIENTIA');
    expect(html).toContain('BMRIIDJA');
    expect(html).toContain('nomor pesanan CNX-202609-000123 di berita transfer');
    expect(html).toContain('Rp200.000');
    expect(html).toContain('tanpa kode unik');
    expect(html).toContain('5 hari kerja');
    expect(html).not.toContain('Potongan kode unik');
    expect(html).not.toContain('24 jam');
  });

  it('jalur IDR tetap menampilkan kode unik dan batas jam; rekening USD tetap tercantum untuk pembayaran luar negeri', () => {
    const html = renderToStaticMarkup(<TransferInstructions detail={{ ...DETAIL, bankAccounts: USD_DETAIL.bankAccounts }} language="id" copied={null} onCopy={() => undefined} />);
    expect(html).toContain('Potongan kode unik (417)');
    expect(html).toContain('24 jam');
    expect(html).toContain('Untuk pembayaran dari luar negeri');
    expect(html).not.toContain('hari kerja');
  });
});

describe('checkout buku cetak: pilihan transfer dari luar negeri', () => {
  it('muncul hanya bila rekening USD aktif; terpilih -> keterangan 5 hari kerja', () => {
    const props = { methods: ['bank_transfer' as const], selected: 'bank_transfer' as const, onSelect: () => undefined, transferDueHours: 24, onForeignTransferChange: () => undefined };
    const hidden = renderToStaticMarkup(<PrintPaymentMethodPicker {...props} usdTransfer={{ available: false, dueBusinessDays: 5 }} foreignTransfer={false} />);
    expect(hidden).not.toContain('data-foreign-transfer');
    const offered = renderToStaticMarkup(<PrintPaymentMethodPicker {...props} usdTransfer={{ available: true, dueBusinessDays: 5 }} foreignTransfer={false} />);
    expect(offered).toContain('Saya membayar dari luar negeri (transfer USD)');
    expect(offered).toContain('24 jam');
    const chosen = renderToStaticMarkup(<PrintPaymentMethodPicker {...props} usdTransfer={{ available: true, dueBusinessDays: 5 }} foreignTransfer />);
    expect(chosen).toContain('checked=""');
    expect(chosen).toContain('batas waktu 5 hari kerja tampil setelah pesanan dibuat');
  });
});
