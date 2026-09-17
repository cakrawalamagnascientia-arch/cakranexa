import React from 'react';
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { INITIAL_BOOKS } from '../../data/booksData';
import { INITIAL_DIGITAL_PRODUCTS } from '../../data/digitalProducts';
import { buildDigitalCatalog, DigitalCatalogContext } from '../../hooks/useDigitalCatalog';
import { jakartaToday, addDaysToDate } from '../../data/digitalShelf';
import { DigitalHomeView } from '../digital/DigitalHomeView';
import { DigitalShelfCard } from '../digital/DigitalShelfCard';
import { DigitalNavbar } from '../digital/DigitalNavbar';
import { DigitalListingView } from '../digital/DigitalListingView';
import { parseLocation, buildPath } from '../../utils/router';
import type { DigitalProduct } from '../../types';

// Status login beranda diatur per tes; selain itu modul sesi anggota asli.
const sessionState = vi.hoisted(() => ({ loggedIn: false }));
vi.mock('../../services/memberSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberSession')>();
  return {
    ...actual,
    useMemberSession: () => ({
      ...actual.useMemberSession(),
      isLoggedIn: sessionState.loggedIn,
      userId: sessionState.loggedIn ? 'pengguna-uji' : null
    })
  };
});

/** Fase 6 Langkah 2: beranda digital, kartu rak 2:3, navbar area digital, dan rute /digital. */

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
// Katalog uji: judul lama (Silver), baru 30 hari (Gold/Platinum), dan yang masuk rak 20 hari lagi (Segera).
const products: DigitalProduct[] = INITIAL_DIGITAL_PRODUCTS.slice(0, 6).map((p, i) => ({
  ...p,
  isActive: true,
  availabilityStatus: 'available',
  shelfEntryDate: i < 2 ? '2025-01-01' : i < 4 ? addDaysToDate(today, -30) : addDaysToDate(today, 20)
}));
const catalog = buildDigitalCatalog(INITIAL_BOOKS, products, true);
const withCatalog = (node: React.ReactNode) => renderToStaticMarkup(<DigitalCatalogContext.Provider value={catalog}>{node}</DigitalCatalogContext.Provider>);

describe('beranda digital', () => {
  it('hero dua baris, 5 manfaat, Mulai gratis + Lihat paket, mockup dengan sampul CakraNexa; rak baru, kategori, segera', () => {
    const html = withCatalog(<DigitalHomeView onOpenProduct={() => undefined} />);
    expect(html).toContain('Buku ilmiah Indonesia,');
    expect(html).toContain('kapan saja Anda butuh.');
    expect(html.match(/lucide-check/g)?.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain('id="btn-digital-start-free"');
    expect(html).toContain('Mulai gratis');
    expect(html).toContain('Lihat paket');
    expect(html).toMatch(/src="[^"]*\/images\/books\/[^"]+"/);
    expect(html).not.toMatch(/unsplash|pexels/i);
    expect(html).toContain('id="shelf-new"');
    expect(html).toContain('Baru masuk rak');
    expect(html).toContain('id="shelf-coming-soon"');
    expect(html).toContain('Tanggal buka paling awal (Platinum)');
    expect(html).toMatch(/id="shelf-category-[a-z-]+"/);
    // Tanpa login: tidak ada rak "Lanjutkan membaca"; populer baru tampil setelah data server.
    expect(html).not.toContain('id="shelf-continue"');
    // Tanpa bintang rating di area digital.
    expect(html).not.toContain('lucide-star');
    expect(html).not.toContain('Buka Pustaka Saya');
  });

  it('hero: tamu melihat "Mulai gratis" + "Lihat paket"; yang sudah login melihat "Buka Pustaka Saya"', () => {
    sessionState.loggedIn = true;
    try {
      const html = withCatalog(<DigitalHomeView onOpenProduct={() => undefined} />);
      expect(html).toContain('id="btn-digital-open-library"');
      expect(html).toContain('Buka Pustaka Saya');
      expect(html).not.toContain('id="btn-digital-start-free"');
      expect(html).toContain('Lihat paket');
    } finally {
      sessionState.loggedIn = false;
    }
  });

  it('kartu: sampul 2:3, ikon format, badge paket/sampel/segera, tanpa harga dan tanpa bintang', () => {
    const entry = catalog.entries[0];
    const plan = renderToStaticMarkup(<DigitalShelfCard entry={entry} badge={{ kind: 'plan', plan: 'silver' }} onOpen={() => undefined} />);
    expect(plan).toContain('aspect-[2/3]');
    expect(plan).toContain('Termasuk Silver');
    expect(plan).toContain('data-badge="silver"');
    expect(plan).not.toMatch(/Rp|lucide-star|Beli/);
    const sample = renderToStaticMarkup(<DigitalShelfCard entry={entry} badge={{ kind: 'sample' }} onOpen={() => undefined} progress={42} />);
    expect(sample).toContain('Sampel');
    expect(sample).toContain('42% selesai');
    const soon = renderToStaticMarkup(<DigitalShelfCard entry={entry} badge={{ kind: 'soon', date: null }} onOpen={() => undefined} openDate="2026-10-04" />);
    expect(soon).toContain('Segera');
    expect(soon).toMatch(/Buka .*2026/);
  });

  it('halaman daftar: kartu 2:3 dan filter kategori dari URL', () => {
    const category = catalog.entries[0].book.category;
    const html = withCatalog(<DigitalListingView format="ebook" initialCategory={category} onNavigate={() => undefined} onOpenProduct={() => undefined} />);
    expect(html).toContain('aspect-[2/3]');
    expect(html).toMatch(/aria-pressed="true"[^>]*>[^<]*/);
    expect(html).not.toContain('lucide-star');
  });
});

describe('navbar area digital', () => {
  it('Audiobook · E-book · Kategori · Gabung · Mulai gratis · cari; menu lama di "Lainnya"', () => {
    const html = renderToStaticMarkup(
      <DigitalNavbar activePage="digital" subSection="ebook" onNavigate={() => undefined} cartCount={2} onOpenCart={() => undefined} onOpenSearch={() => undefined} />
    );
    for (const id of ['dnav-audiobook', 'dnav-ebook', 'dnav-categories', 'dnav-join', 'dnav-start-free', 'btn-search-trigger', 'dnav-more', 'btn-cart-trigger']) {
      expect(html, id).toContain(`id="${id}"`);
    }
    expect(html).toContain('data-variant="digital"');
    for (const label of ['Audiobook', 'E-book', 'Kategori', 'Gabung', 'Mulai gratis', 'Lainnya']) expect(html, label).toContain(label);
    // E-book aktif.
    expect(html).toMatch(/id="dnav-ebook"[^>]*text-gold-400/);
  });
});

describe('rute /digital', () => {
  it('/digital = beranda; daftar menyimpan ?kategori=; detail tetap', () => {
    expect(parseLocation('/digital', '')).toEqual({ page: 'digital' });
    expect(parseLocation('/en/digital/', '')).toEqual({ page: 'digital' });
    expect(parseLocation('/digital/audiobook', '?kategori=Hukum')).toEqual({ page: 'digital', subSection: 'audiobook', query: 'kategori=Hukum' });
    expect(parseLocation('/digital/ebook/judul-buku', '')).toEqual({ page: 'digital', subSection: 'ebook', digitalItem: 'judul-buku' });
    expect(buildPath({ page: 'digital' })).toBe('/digital');
    expect(buildPath({ page: 'digital', subSection: 'ebook', query: 'kategori=Hukum' })).toBe('/digital/ebook?kategori=Hukum');
    expect(buildPath({ page: 'digital', subSection: 'audiobook', digitalItem: 'x' })).toBe('/digital/audiobook/x');
  });
});
