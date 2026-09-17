// npm run phase6:screenshots — verifikasi visual area digital fase 6 (docs/PHASE-6-BRIEF.md) di desktop & mobile:
// /digital, halaman buku digital, /membership, Pustaka Saya, reader, dan player. Setiap halaman diperiksa: error
// JavaScript, overflow horizontal, dan tidak ada bintang rating di area digital.
//
// Jalankan setelah `npm run build` dan server hidup:
//   BASE_URL=http://127.0.0.1:3000 npm run phase6:screenshots
// Halaman yang butuh login (Pustaka, reader, player) memakai akun uji bila MEMBER_EMAIL & MEMBER_PASSWORD diisi;
// tanpa itu yang direkam adalah layar ajakan login. EBOOK_ID / AUDIOBOOK_ID memilih produk untuk reader/player.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const OUT = process.env.OUT_DIR || 'phase6-screenshots';
const STEP = process.env.STEP || 'langkah';
const BOOK_SLUG = process.env.BOOK_SLUG || 'audit-investigatif-kontemporer-konsep-dan-teknik';
const EBOOK_ID = process.env.EBOOK_ID || '';
const AUDIOBOOK_ID = process.env.AUDIOBOOK_ID || '';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL || '';
const MEMBER_PASSWORD = process.env.MEMBER_PASSWORD || '';

const PAGES = [
  ['digital-home', '/digital', false],
  ['digital-ebooks', '/digital/ebook', false],
  ['digital-book', `/digital/ebook/${BOOK_SLUG}`, false],
  ['membership', '/membership', false],
  ['library', '/library', true],
  ...(EBOOK_ID ? [['reader', `/library/read/${EBOOK_ID}`, true]] : []),
  ...(AUDIOBOOK_ID ? [['player', `/library/listen/${AUDIOBOOK_ID}`, true]] : [])
];
const VIEWPORTS = [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]];

const dir = path.join(OUT, STEP);
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const results = [];

const settle = async (page) => {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
};

const login = async (page) => {
  await page.goto(`${BASE}/account/login`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', MEMBER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/account/login'), { timeout: 15000 });
};

// Mode lokal (server scratch tanpa Supabase): sesi uji ditandatangani LOCAL_JWT_SECRET (sama dengan SUPABASE_JWT_SECRET
// server scratch) lalu disimpan di localStorage seperti sesi supabase-js. Frontend harus di-build dengan
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY tiruan. ADMIN_PASSWORD + GRANT_PRODUCTS: akses judul lewat admin_grant.
const LOCAL_JWT_SECRET = process.env.LOCAL_JWT_SECRET || '';
const LOCAL_USER_ID = process.env.LOCAL_USER_ID || '6d0f4f3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const GRANT_PRODUCTS = (process.env.GRANT_PRODUCTS || '').split(',').map((s) => s.trim()).filter(Boolean);

const localSession = async () => {
  const { SignJWT } = await import('jose');
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({ role: 'authenticated', email: MEMBER_EMAIL, user_metadata: { full_name: 'Akun Uji CakraNexa' } })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(LOCAL_USER_ID).setAudience('authenticated').setIssuedAt(now).setExpirationTime(now + 3 * 3600)
    .sign(new TextEncoder().encode(LOCAL_JWT_SECRET));
  return {
    access_token: accessToken,
    refresh_token: 'lokal-tidak-dipakai',
    token_type: 'bearer',
    expires_in: 3 * 3600,
    expires_at: now + 3 * 3600,
    user: { id: LOCAL_USER_ID, aud: 'authenticated', role: 'authenticated', email: MEMBER_EMAIL, user_metadata: { full_name: 'Akun Uji CakraNexa' }, app_metadata: {} }
  };
};

const grantLocalAccess = async (session) => {
  if (!ADMIN_PASSWORD || GRANT_PRODUCTS.length === 0) return;
  // Pengguna harus dikenal server dulu (store memori mencatatnya saat permintaan pertama).
  await fetch(`${BASE}/api/account/me`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const login = await (await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PASSWORD }) })).json();
  for (const productId of GRANT_PRODUCTS) {
    const res = await fetch(`${BASE}/api/admin/digital-access/entitlements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ userId: LOCAL_USER_ID, productId, maxDevices: 2, note: 'Akun uji screenshot (paket Gold via admin_grant)' })
    });
    console.log(`admin_grant ${productId}: ${res.status}`);
  }
};

let sessionForLocal = null;
if (LOCAL_JWT_SECRET && MEMBER_EMAIL) {
  sessionForLocal = await localSession();
  await grantLocalAccess(sessionForLocal);
}

for (const [viewportName, viewport] of VIEWPORTS) {
  const context = await browser.newContext({ viewport, locale: 'id-ID' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let loggedIn = false;
  if (sessionForLocal) {
    await context.addInitScript((value) => {
      window.localStorage.setItem('cakranexa-auth', value);
    }, JSON.stringify(sessionForLocal));
    loggedIn = true;
  } else if (MEMBER_EMAIL && MEMBER_PASSWORD) {
    try {
      await login(page);
      loggedIn = true;
    } catch (err) {
      results.push({ viewport: viewportName, page: 'login', ok: false, detail: String(err.message || err).split('\n')[0] });
    }
  }
  for (const [name, pagePath, needsLogin] of PAGES) {
    errors.length = 0;
    await page.goto(`${BASE}${pagePath}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const info = await page.evaluate(() => ({
      path: location.pathname + location.search,
      title: document.title,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // Area digital fase 6 tanpa bintang rating (ikon lucide "star" di dalam konten utama).
      stars: document.querySelectorAll('main svg.lucide-star, #root svg.lucide-star').length,
      // Judul area digital memakai Playfair Display (keputusan fase 6 no. 11).
      headingFont: (() => { const h = document.querySelector('.digital-area h1, .digital-area h2'); return h ? getComputedStyle(h).fontFamily : null; })()
    }));
    const file = `${viewportName}-${name}${needsLogin && !loggedIn ? '-login' : ''}.png`;
    await page.screenshot({ path: path.join(dir, file), fullPage: true });
    const problems = [
      ...(info.overflowX > 1 ? [`overflow horizontal ${info.overflowX}px`] : []),
      ...(info.stars > 0 ? [`${info.stars} ikon bintang`] : []),
      ...(info.headingFont && !/Playfair/i.test(info.headingFont) ? [`judul bukan serif (${info.headingFont.slice(0, 40)})`] : []),
      ...[...new Set(errors)].map((e) => `JS: ${e.slice(0, 160)}`)
    ];
    results.push({ viewport: viewportName, page: name, file, ...info, loggedIn: needsLogin ? loggedIn : null, ok: problems.length === 0, problems });
  }
  await context.close();
}
await browser.close();

fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'CEK '} ${r.viewport.padEnd(7)} ${r.page.padEnd(14)} ${r.file ?? ''} ${r.problems?.length ? `— ${r.problems.join('; ')}` : r.detail ?? ''}`);
}
console.log(`\nScreenshot & laporan: ${dir}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
