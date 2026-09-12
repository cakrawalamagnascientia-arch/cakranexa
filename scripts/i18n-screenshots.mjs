// npm run i18n:screenshots — screenshot halaman utama dalam id/en/zh (desktop & mobile) + pemeriksaan otomatis:
// <html lang>, judul, meta description, canonical, hreflang, overflow horizontal (layout rusak), error JavaScript,
// serta perilaku pemilih bahasa. Jalankan setelah `npm run build` dan server hidup:
//   BASE_URL=http://127.0.0.1:3000 npm run i18n:screenshots
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const OUT = process.env.OUT_DIR || 'i18n-screenshots';
const BOOK_SLUG = process.env.BOOK_SLUG || 'audit-investigatif-kontemporer-konsep-dan-teknik';

const PAGES = [
  ['home', '/'], ['catalog', '/katalog'], ['book', `/katalog/${BOOK_SLUG}`], ['authors', '/katalog/penulis'],
  ['publishing', '/penerbitan'], ['training', '/pelatihan'], ['journal', '/jurnal'], ['about', '/tentang-kami'],
  ['blog', '/blog'], ['career', '/karir'], ['contact', '/kontak']
];
const LANGS = [['id', ''], ['en', '/en'], ['zh', '/zh']];
const VIEWPORTS = [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

const pageInfo = (page) => page.evaluate(() => ({
  lang: document.documentElement.lang,
  path: location.pathname + location.search,
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
  hreflang: document.querySelectorAll('link[rel="alternate"][hreflang]').length,
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
}));

const settle = async (page) => {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
};

// Jalankan satu pemeriksaan perilaku; kegagalan dicatat, tidak menghentikan script.
const runCheck = async (name, fn) => {
  try {
    await fn();
  } catch (err) {
    check(name, false, String(err.message || err).split('\n')[0]);
  }
};

for (const [viewportName, viewport] of VIEWPORTS) {
  // locale en-US: memastikan bahasa browser TIDAK mengubah bahasa URL Indonesia (seperti Googlebot).
  const context = await browser.newContext({ viewport, locale: 'en-US' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  for (const [lang, prefix] of LANGS) {
    for (const [name, pagePath] of PAGES) {
      errors.length = 0;
      await page.goto(`${BASE}${prefix}${pagePath === '/' && prefix ? '' : pagePath}`, { waitUntil: 'domcontentloaded' });
      await settle(page);
      const info = await pageInfo(page);
      await page.screenshot({ path: path.join(OUT, `${viewportName}-${lang}-${name}.png`) });
      results.push({ viewport: viewportName, expectedLang: lang, page: name, ...info, errors: [...new Set(errors)] });
    }
  }

  if (viewportName === 'mobile') {
    await runCheck('Pemilih bahasa tampil di menu mobile', async () => {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await settle(page);
      await page.click('#btn-mobile-menu-toggle');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, 'mobile-menu-open.png') });
      const switcherVisible = await page.getByRole('button', { name: '中文', exact: true }).first().isVisible();
      check('Pemilih bahasa tampil di menu mobile', switcherVisible);
    });
  }
  await context.close();
}
// Simpan hasil halaman lebih dulu agar tetap ada walau pemeriksaan perilaku di bawah gagal.
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, checks }, null, 2));

// Perilaku pemilih bahasa (desktop, konteks baru tanpa localStorage).
// Nama aksesibel tombol = teks yang tampil ("EN", "中文"); nama bahasa lengkap ada di atribut title.
await runCheck('Pemilih bahasa desktop', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'id-ID' });
  const page = await context.newPage();
  await page.goto(`${BASE}/katalog`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.evaluate(() => { window.__noReloadMarker = 42; });
  const titleBefore = await page.title();
  await page.getByRole('button', { name: 'EN', exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(900);
  const after = await pageInfo(page);
  const marker = await page.evaluate(() => window.__noReloadMarker);
  check('Klik EN: URL menjadi /en/katalog', after.path === '/en/katalog', after.path);
  check('Klik EN: <html lang="en">', after.lang === 'en', after.lang);
  check('Klik EN: judul halaman berganti', after.title !== titleBefore, `${titleBefore} -> ${after.title}`);
  check('Klik EN: tanpa reload halaman', marker === 42);
  await page.screenshot({ path: path.join(OUT, 'switcher-after-en.png') });

  await page.getByRole('button', { name: '中文', exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(900);
  const zh = await pageInfo(page);
  check('Klik 中文: URL /zh/katalog & lang zh-CN', zh.path === '/zh/katalog' && zh.lang === 'zh-CN', `${zh.path} ${zh.lang}`);

  // Pengunjung kembali ke URL tanpa prefix setelah memilih bahasa -> diarahkan ke prefix bahasanya
  await page.goto(`${BASE}/penerbitan`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  const returning = await pageInfo(page);
  check('Kunjungan ulang ke /penerbitan dengan pilihan tersimpan zh -> /zh/penerbitan', returning.path === '/zh/penerbitan', returning.path);

  // Tombol Back mengembalikan bahasa sesuai URL sebelumnya
  await page.goBack();
  await page.waitForTimeout(900);
  const back = await pageInfo(page);
  check('Back dari /zh/penerbitan -> kembali ke /zh/katalog (bahasa zh)', back.path === '/zh/katalog' && back.lang === 'zh-CN', `${back.path} ${back.lang}`);
  await context.close();
});
await runCheck('?lang=en pada /blog -> /en/blog', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/blog?lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  const info = await pageInfo(page);
  check('?lang=en pada /blog -> /en/blog', info.path === '/en/blog' && info.lang === 'en', `${info.path} ${info.lang}`);
  await context.close();
});
await browser.close();

// Ringkasan
const bad = results.filter((r) => {
  const expectedHtmlLang = r.expectedLang === 'zh' ? 'zh-CN' : r.expectedLang;
  return r.lang !== expectedHtmlLang || r.overflowX > 0 || r.errors.length > 0 || r.hreflang < 4 || !r.description;
});
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, checks }, null, 2));
console.log(`Screenshot: ${results.length} halaman -> ${OUT}/`);
console.log('\nPemeriksaan perilaku:');
checks.forEach((c) => console.log(`  ${c.ok ? 'OK   ' : 'GAGAL'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`));
console.log(`\nHalaman bermasalah (lang salah / overflow horizontal / error JS / hreflang < 4 / tanpa description): ${bad.length}`);
bad.forEach((r) => console.log(`  - ${r.viewport} ${r.expectedLang} ${r.page}: lang=${r.lang} overflowX=${r.overflowX} hreflang=${r.hreflang} errors=${r.errors.join(' | ').slice(0, 200)}`));
console.log('\nJudul per halaman (desktop):');
results.filter((r) => r.viewport === 'desktop').forEach((r) => console.log(`  [${r.expectedLang}] ${r.page.padEnd(10)} ${r.title}`));
process.exit(checks.every((c) => c.ok) && bad.length === 0 ? 0 : 1);
