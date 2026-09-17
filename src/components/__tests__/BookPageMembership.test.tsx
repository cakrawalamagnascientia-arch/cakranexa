import React from 'react';
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { INITIAL_BOOKS } from '../../data/booksData';
import { INITIAL_DIGITAL_PRODUCTS } from '../../data/digitalProducts';
import { buildDigitalCatalog, DigitalCatalogContext } from '../../hooks/useDigitalCatalog';
import { addDaysToDate, jakartaToday } from '../../data/digitalShelf';
import { availabilityByPlan, titleAccessView } from '../../data/titleAccess';
import type { TitleStatus } from '../../services/membershipApi';
import type { DigitalProduct } from '../../types';
import { DigitalDetailView } from '../digital/DigitalDetailView';
import { DigitalFormatPanel } from '../digital/FormatSelector';
import { MembershipView } from '../digital/MembershipView';
import { MembershipTermsView } from '../digital/MembershipTermsView';
import { AccessGate } from '../reader/AccessGate';

/** Fase 6 Langkah 3: tombol halaman buku sesuai status, tanpa "Beli satuan"; /membership empat paket + perbandingan. */

const LOCALES = path.resolve(__dirname, '../../i18n/locales/id');

beforeAll(async () => {
  const resources = Object.fromEntries(fs.readdirSync(LOCALES).filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace('.json', ''), JSON.parse(fs.readFileSync(path.join(LOCALES, f), 'utf8'))]));
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({ lng: 'id', resources: { id: resources }, ns: Object.keys(resources), defaultNS: 'common', interpolation: { escapeValue: false } });
  } else {
    for (const [ns, bundle] of Object.entries(resources)) i18next.addResourceBundle('id', ns, bundle, true, true);
    await i18next.changeLanguage('id');
  }
});

const today = jakartaToday();
const products: DigitalProduct[] = INITIAL_DIGITAL_PRODUCTS.slice(0, 4).map((p, i) => ({
  ...p,
  isActive: true,
  availabilityStatus: 'available',
  price: 99000,
  shelfEntryDate: i === 0 ? addDaysToDate(today, -30) : '2025-01-01'
}));
const catalog = buildDigitalCatalog(INITIAL_BOOKS, products, true);
const withCatalog = (node: React.ReactNode) => renderToStaticMarkup(<DigitalCatalogContext.Provider value={catalog}>{node}</DigitalCatalogContext.Provider>);

const ready = (status: Partial<TitleStatus> & Pick<TitleStatus, 'status'>) =>
  ({ kind: 'ready', status: { productId: 'p', format: 'ebook', planCode: 'silver', upgrade: true, ...status } as TitleStatus }) as const;

describe('tombol utama halaman buku (fungsi murni)', () => {
  it('tamu: sampel + mulai gratis + paket; Blue: sampel + paket', () => {
    const guest = titleAccessView({ state: { kind: 'guest' }, format: 'ebook', hasSample: true });
    expect(guest.primary).toMatchObject({ kind: 'sample', key: 'readSample' });
    expect(guest.secondary.map((a) => a.kind)).toEqual(['startFree', 'plans']);
    const blue = titleAccessView({ state: ready({ status: 'sample_only', planCode: null }), format: 'audiobook', hasSample: true });
    expect(blue.primary).toMatchObject({ kind: 'sample', key: 'listenSample' });
    expect(blue.secondary.map((a) => a.kind)).toEqual(['plans']);
    expect(blue.notice?.key).toBe('blue');
  });

  it('jatah x dari y, baca sekarang, jatah habis, tersedia pada tanggal, jam audio habis', () => {
    const quota = titleAccessView({ state: ready({ status: 'quota_available', quota: { used: 1, limit: 2, resetsAt: '2026-10-13T17:00:00.000Z' } }), format: 'ebook', hasSample: true });
    expect(quota.primary).toEqual({ kind: 'pick', key: 'pick', params: { next: 2, limit: 2 } });
    expect(quota.notice).toMatchObject({ key: 'quotaAvailable', params: { remaining: 1, limit: 2, date: '2026-10-14' } });

    const open = titleAccessView({ state: ready({ status: 'open', via: 'quota', endsAt: '2026-10-13T17:00:00.000Z' }), format: 'ebook', hasSample: true });
    expect(open.primary).toMatchObject({ kind: 'open', key: 'readNow' });
    expect(open.secondary).toEqual([]);

    const full = titleAccessView({ state: ready({ status: 'quota_full', quota: { used: 2, limit: 2, resetsAt: '2026-10-14T03:00:00.000Z' } }), format: 'ebook', hasSample: true });
    expect(full.primary?.kind).toBe('upgrade');
    expect(full.notice?.tone).toBe('warning');

    const later = titleAccessView({ state: ready({ status: 'opens_on', planCode: 'gold', openDate: '2026-09-29', upgradeOpenDate: '2026-08-15' }), format: 'ebook', hasSample: true });
    expect(later.primary).toBeNull();
    expect(later.notice).toMatchObject({ key: 'opensOn', params: { date: '2026-09-29' } });
    expect(later.secondary.map((a) => a.key)).toEqual(['readSample', 'upgradeEarlier']);

    const platinumWait = titleAccessView({ state: ready({ status: 'quota_full', planCode: 'platinum', upgrade: false, quota: { used: 1, limit: 1, resetsAt: '2026-10-14T03:00:00.000Z' } }), format: 'ebook', hasSample: false });
    expect(platinumWait.primary).toBeNull();

    const audio = titleAccessView({ state: ready({ status: 'audio_exhausted', format: 'audiobook', resetsAt: '2026-10-14T03:00:00.000Z' }), format: 'audiobook', hasSample: true });
    expect(audio.primary?.kind).toBe('upgrade');
    expect(audio.notice?.key).toBe('audioExhausted');
  });

  it('tidak ada aksi pembelian di status mana pun', () => {
    const states: TitleStatus['status'][] = ['open', 'quota_available', 'quota_full', 'opens_on', 'audio_exhausted', 'sample_only', 'coming_soon', 'suspended', 'expired'];
    for (const status of states) {
      const view = titleAccessView({
        state: ready({ status, quota: { used: 0, limit: 2, resetsAt: '2026-10-14T03:00:00.000Z' }, resetsAt: '2026-10-14T03:00:00.000Z', openDate: null, endsAt: null, via: 'access' } as never),
        format: 'ebook',
        hasSample: true
      });
      const kinds = [view.primary, ...view.secondary].filter(Boolean).map((a) => a!.kind);
      expect(kinds, status).not.toContain('buy');
    }
  });

  it('ketersediaan per paket: Blue sampel, Silver +90, Gold +45, Platinum hari itu, instansi +45', () => {
    expect(availabilityByPlan('2026-08-15', { silver: 90, gold: 45, platinum: 0 }, 45)).toEqual([
      { plan: 'blue', openDate: null },
      { plan: 'silver', openDate: '2026-11-13' },
      { plan: 'gold', openDate: '2026-09-29' },
      { plan: 'platinum', openDate: '2026-08-15' },
      { plan: 'institution', openDate: '2026-09-29' }
    ]);
  });
});

describe('halaman buku digital', () => {
  it('tanpa blok "Beli satuan" dan tanpa harga; panel akses + ketersediaan per paket + versi cetak', () => {
    const entry = catalog.entries[0];
    const html = withCatalog(
      <DigitalDetailView entry={entry} format={entry.product.format} onNavigate={() => undefined} onOpenProduct={() => undefined} onOpenSample={() => undefined} onOpenPrintBook={() => undefined} />
    );
    expect(html).not.toMatch(/Beli satuan|Bayar sekali|Rp\s?\d|btn-digital-buy/);
    expect(html).toContain('id="digital-access-panel"');
    expect(html).toContain('id="btn-digital-access-sample"');
    expect(html).toContain('id="btn-digital-access-startFree"');
    expect(html).toContain('id="digital-availability"');
    for (const plan of ['blue', 'silver', 'gold', 'platinum', 'institution']) expect(html).toContain(`data-plan="${plan}"`);
    expect(html).toContain('Tidak ada pembelian satuan');
    expect(html).toContain('id="btn-digital-print-version"');
  });

  it('panel format di halaman buku cetak: detail digital + paket, tanpa tombol beli', () => {
    const html = withCatalog(<DigitalFormatPanel product={products[0]} onViewDetail={() => undefined} />);
    expect(html).toContain('id="btn-detail-view-digital"');
    expect(html).toContain('id="btn-detail-digital-plans"');
    expect(html).not.toMatch(/dibeli terpisah|btn-detail-buy-digital|Rp\s?\d/);
  });
});

describe('halaman /membership', () => {
  it('empat paket, tahunan bawaan dengan "Hemat 2 bulan", Gold "Paling populer", tanpa Founding', () => {
    const html = renderToStaticMarkup(<MembershipView onNavigate={() => undefined} />);
    for (const key of ['blue', 'silver', 'gold', 'platinum']) expect(html).toContain(`id="membership-plan-${key}"`);
    expect(html).not.toMatch(/membership-plan-(readerCircle|professionalSociety|authorGuild|freeCircle)/);
    expect(html).toMatch(/id="billing-annual"[^>]*aria-checked="true"/);
    expect(html).toContain('Hemat 2 bulan');
    expect(html).toMatch(/id="membership-plan-gold"[\s\S]*?id="membership-most-popular"[\s\S]*?Paling populer/);
    expect(html.match(/id="membership-most-popular"/g)).toHaveLength(1);
    expect(html).not.toMatch(/Founding/);
    // Harga tahunan = 10 × bulanan.
    expect(html).toMatch(/id="price-gold"[^>]*>Rp\s?990\.000/);
  });

  it('tabel perbandingan, jadwal buka judul baru, tanpa uji coba gratis, FAQ jatah & perangkat', () => {
    const html = renderToStaticMarkup(<MembershipView onNavigate={() => undefined} />);
    for (const row of ['price', 'ebook', 'audiobook', 'newTitles', 'notes', 'family', 'devices']) {
      expect(html, row).toContain(`id="compare-row-${row}"`);
    }
    // ENABLE_OFFLINE / ENABLE_CROSS_FORMAT_SYNC mati (bawaan): baris dan manfaatnya tidak tampil sampai Langkah 5.
    expect(html).not.toMatch(/compare-row-(offline|formatSync)|offline|Lanjutkan e-book dari audio/i);
    expect(html).toContain('2 judul per bulan');
    expect(html).toContain('60 jam per bulan');
    expect(html).toContain('Hari masuk rak');
    expect(html).toContain('90 hari kemudian');
    expect(html).toContain('id="membership-no-trial"');
    for (const key of ['samples', 'titleQuota', 'audioHours', 'devices', 'family', 'unitPurchase']) expect(html).toContain(`id="membership-faq-${key}"`);
    expect(html).not.toMatch(/dibeli satuan|dijual satuan|Kartu kredit|Virtual Account|QRIS/);
  });

  it('ketentuan: bagian jatah, tanpa Founding dan tanpa penjualan satuan', () => {
    const html = renderToStaticMarkup(<MembershipTermsView onNavigate={() => undefined} />);
    expect(html).toContain('2. Jatah judul dan jam audio');
    expect(html).not.toMatch(/Founding|dibeli satuan|dijual satuan|Midtrans|kartu/i);
  });
});

describe('sesi dipindahkan ke perangkat lain', () => {
  it.each(['takeover', 'single_session'])('alasan %s: pesan informasi, bukan error', (reason) => {
    const html = renderToStaticMarkup(
      <AccessGate state={{ status: 'ended', reason }} productId="p" onTakeover={() => undefined} onRetry={() => undefined} onReleaseDevice={async () => null} onExit={() => undefined} />
    );
    expect(html).toContain('id="access-moved"');
    expect(html).toContain('Sesi dipindahkan ke perangkat lain');
    expect(html).toContain('id="btn-access-resume"');
    expect(html).not.toContain('Sesi berakhir');
  });

  it('alasan lain tetap "Sesi berakhir"', () => {
    const html = renderToStaticMarkup(
      <AccessGate state={{ status: 'ended', reason: 'expired' }} productId="p" onTakeover={() => undefined} onRetry={() => undefined} onReleaseDevice={async () => null} onExit={() => undefined} />
    );
    expect(html).toContain('id="access-ended"');
    expect(html).toContain('Sesi berakhir');
  });
});
