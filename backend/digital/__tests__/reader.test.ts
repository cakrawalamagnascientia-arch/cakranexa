import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import sharp from 'sharp';
import { createTestApp, mintUserToken, USER_A, USER_B } from './harness';
import { buildWatermarkSvg, searchSnippet, watermarkText } from '../reader';
import { assetPaths } from '../storage';

const device = (n: number) => `perangkat-baca-${n}-abcdefghij`;
const PAGE_TEXTS = [
  'Pendahuluan tentang pajak pertambahan nilai.',
  'Bab dua membahas audit investigatif secara mendalam.',
  'Penutup dan daftar pustaka.'
];

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** Parser supertest untuk respons biner (gambar halaman). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const binary = (res: any, callback: (err: Error | null, body: any) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

const setup = async () => {
  const clock = { now: new Date() };
  const t = await createTestApp({ now: () => clock.now });
  cleanups.push(t.cleanup);
  const png = await sharp({ create: { width: 400, height: 560, channels: 3, background: '#ffffff' } }).png().toBuffer();
  for (let n = 1; n <= 3; n++) await t.storage.upload(assetPaths.ebookPage('prod-ebook-1', n), png, 'image/png');
  await t.store.updateProduct('prod-ebook-1', { processingStatus: 'ready', pageCount: 3, storagePath: 'ebooks/prod-ebook-1', processedAt: clock.now.toISOString() });
  await t.store.replacePages('prod-ebook-1', PAGE_TEXTS.map((text, i) => ({ pageNumber: i + 1, text })));
  await t.store.replaceChapters('prod-ebook-1', [
    { chapterNumber: 1, title: 'Pendahuluan', startPage: 1, startSeconds: null },
    { chapterNumber: 2, title: 'Audit', startPage: 2, startSeconds: null }
  ]);
  const tokenA = await mintUserToken(USER_A);
  const tokenB = await mintUserToken(USER_B);
  const grant = async (userId: string, productId = 'prod-ebook-1') => {
    await t.store.insertEntitlements([{
      userId,
      productId,
      source: 'purchase',
      sourceRef: `uji-${crypto.randomUUID()}`,
      startsAt: new Date(clock.now.getTime() - 60_000).toISOString()
    }]);
    return t.store.entitlements[t.store.entitlements.length - 1];
  };
  const open = async (token: string, productId = 'prod-ebook-1', n = 1) =>
    (await request(t.app).post(`/api/access/${productId}/session/start`).set('Authorization', `Bearer ${token}`).send({ deviceId: device(n) })).body.sessionToken as string;
  const get = (token: string, path: string, sessionToken?: string) => {
    const req = request(t.app).get(path).set('Authorization', `Bearer ${token}`);
    if (sessionToken) req.set('X-Session-Token', sessionToken);
    return req;
  };
  const send = (method: 'post' | 'put' | 'patch' | 'delete', token: string, path: string, sessionToken: string, body?: unknown) => {
    const req = request(t.app)[method](path).set('Authorization', `Bearer ${token}`).set('X-Session-Token', sessionToken);
    return body === undefined ? req.send() : req.send(body as object);
  };
  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  return { ...t, tokenA, tokenB, grant, open, get, send, advance };
};

describe('reader: meta & format', () => {
  it('meta berisi jumlah halaman, bab, watermark; tanpa path penyimpanan; wajib sesi, e-book siap', async () => {
    const t = await setup();
    const ent = await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const meta = await t.get(t.tokenA, '/api/reader/prod-ebook-1/meta', s);
    expect(meta.status).toBe(200);
    expect(meta.body).toMatchObject({
      product: { id: 'prod-ebook-1', pageCount: 3 },
      title: 'Reformulasi Mekanisme PPN',
      chapters: [{ number: 1, title: 'Pendahuluan', page: 1 }, { number: 2, title: 'Audit', page: 2 }],
      progress: null,
      legalNoticeAccepted: false,
      watermark: { name: USER_A.name, email: USER_A.email, entitlementId: ent.id }
    });
    expect(JSON.stringify(meta.body)).not.toMatch(/ebooks\/|storagePath|\.png/);
    expect((await t.get(t.tokenA, '/api/reader/prod-ebook-1/meta')).body.code).toBe('session_required');

    await t.grant(USER_A.id, 'prod-audio-1');
    const sAudio = await t.open(t.tokenA, 'prod-audio-1');
    expect((await t.get(t.tokenA, '/api/reader/prod-audio-1/meta', sAudio)).body.code).toBe('wrong_format');

    await t.grant(USER_A.id, 'prod-ebook-2');
    const sNotReady = await t.open(t.tokenA, 'prod-ebook-2');
    const notReady = await t.get(t.tokenA, '/api/reader/prod-ebook-2/meta', sNotReady);
    expect(notReady.status).toBe(409);
    expect(notReady.body.code).toBe('not_ready');
  });
});

describe('reader: halaman ber-watermark', () => {
  it('WebP ber-watermark, no-store, dicatat sebagai page_view; halaman di luar rentang ditolak', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const res = await t.get(t.tokenA, '/api/reader/prod-ebook-1/pages/1', s).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    const body = res.body as Buffer;
    expect(body.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(body.subarray(8, 12).toString('ascii')).toBe('WEBP');
    // Halaman sumber putih polos: piksel gelap berarti watermark tergambar.
    const stats = await sharp(body).stats();
    expect(stats.channels[0].min).toBeLessThan(250);

    for (const bad of ['0', '4', 'abc']) {
      expect((await t.get(t.tokenA, `/api/reader/prod-ebook-1/pages/${bad}`, s)).body.code).toBe('invalid_page');
    }
    const views = t.store.logs.filter((l) => l.action === 'page_view');
    expect(views).toHaveLength(1);
    expect(views[0].meta).toEqual({ page: 1 });
    expect(views[0].sessionId).toBeTruthy();

    // Token sesi A tidak berlaku untuk user B.
    await t.grant(USER_B.id);
    expect((await t.get(t.tokenB, '/api/reader/prod-ebook-1/pages/1', s)).body.code).toBe('session_invalid');
  });

  it('teks watermark: nama · email · ID entitlement 3× + footer, di-escape, tanpa nomor telepon', () => {
    const text = watermarkText({ id: 'u-1', email: 'budi@uji.id', name: 'Budi <Admin> & Co' }, 'ent-123', new Date('2026-09-13T10:00:00Z'));
    const svg = buildWatermarkSvg(1000, 1400, text);
    expect(svg.match(/ent-123/g)).toHaveLength(4);
    expect(svg.match(/budi@uji\.id/g)).toHaveLength(4);
    expect(svg).toContain('Budi &lt;Admin&gt; &amp; Co');
    expect(svg).not.toContain('<Admin>');
    expect(text.footer).toContain('2026-09-13 10:00 UTC');
    expect(svg).not.toMatch(/\+62|08\d{8}/);
  });

  it('rate limit halaman: 120 per menit per user', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    for (let i = 0; i < 120; i++) {
      expect((await t.get(t.tokenA, '/api/reader/prod-ebook-1/pages/1', s)).status).toBe(200);
    }
    const limited = await t.get(t.tokenA, '/api/reader/prod-ebook-1/pages/1', s);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('rate_limited');
  }, 60_000);
});

describe('reader: pencarian', () => {
  it('mengembalikan halaman + cuplikan; kata kunci tidak dicatat di log', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const res = await t.get(t.tokenA, '/api/reader/prod-ebook-1/search?q=audit', s);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].page).toBe(2);
    expect(res.body.results[0].snippet).toContain('audit investigatif');
    expect((await t.get(t.tokenA, '/api/reader/prod-ebook-1/search?q=a', s)).body.code).toBe('invalid_query');
    const log = t.store.logs.find((l) => l.action === 'search');
    expect(log?.meta).toEqual({ query_length: 5, results: 1 });
  });

  it('cuplikan ±80 karakter, maksimal 200 karakter', () => {
    const text = `${'a'.repeat(500)} kata-kunci ${'b'.repeat(500)}`;
    const snippet = searchSnippet(text, 'kata-kunci');
    expect(snippet.length).toBeLessThanOrEqual(200);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('kata-kunci');
    expect(searchSnippet('Teks pendek.', 'tidak ada')).toBe('Teks pendek.');
  });
});

describe('reader: catatan & sorotan', () => {
  it('CRUD milik sendiri; validasi rect, warna, halaman; user lain tidak bisa mengubah', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    await t.grant(USER_B.id);
    const sA = await t.open(t.tokenA, 'prod-ebook-1', 1);
    const sB = await t.open(t.tokenB, 'prod-ebook-1', 2);
    const path = '/api/reader/prod-ebook-1/notes';

    const created = await t.send('post', t.tokenA, path, sA, { page: 2, rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }], color: 'yellow', text: 'Penting' });
    expect(created.status).toBe(201);
    expect(created.body.note).toMatchObject({ page: 2, color: 'yellow', text: 'Penting', rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }] });
    const noteId = created.body.note.id;

    expect((await t.send('post', t.tokenA, path, sA, { page: 2, rects: [{ x: 0.8, y: 0.2, w: 0.5, h: 0.05 }], color: 'yellow' })).body.code).toBe('invalid_note');
    expect((await t.send('post', t.tokenA, path, sA, { page: 2, rects: [{ x: 0.1, y: 0.2, w: 0.2, h: 0.05 }], color: 'ungu' })).body.code).toBe('invalid_note');
    expect((await t.send('post', t.tokenA, path, sA, { page: 9, rects: [{ x: 0.1, y: 0.2, w: 0.2, h: 0.05 }], color: 'blue' })).body.code).toBe('invalid_page');

    const updated = await t.send('patch', t.tokenA, `${path}/${noteId}`, sA, { color: 'green', text: '' });
    expect(updated.status).toBe(200);
    expect(updated.body.note).toMatchObject({ color: 'green', text: null });

    expect((await t.send('patch', t.tokenB, `${path}/${noteId}`, sB, { color: 'pink' })).status).toBe(404);
    expect((await t.send('delete', t.tokenB, `${path}/${noteId}`, sB)).status).toBe(404);
    expect((await t.get(t.tokenB, path, sB)).body.notes).toEqual([]);

    expect((await t.get(t.tokenA, path, sA)).body.notes).toHaveLength(1);
    expect((await t.send('delete', t.tokenA, `${path}/${noteId}`, sA)).status).toBe(204);
    expect((await t.get(t.tokenA, path, sA)).body.notes).toEqual([]);
    expect(t.store.logs.some((l) => l.action === 'note')).toBe(true);
  });
});

describe('reader: progres, verified reading, ketentuan', () => {
  it('progres dihitung server; muncul di meta', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const saved = await t.send('put', t.tokenA, '/api/reader/prod-ebook-1/progress', s, { page: 2, percent: 100 });
    expect(saved.body).toEqual({ page: 2, percent: 66.7 });
    expect((await t.send('put', t.tokenA, '/api/reader/prod-ebook-1/progress', s, { page: 5 })).body.code).toBe('invalid_page');
    expect((await t.get(t.tokenA, '/api/reader/prod-ebook-1/meta', s)).body.progress).toEqual({ page: 2, percent: 66.7 });
  });

  it('reading_events hanya untuk halaman yang dikirim di sesi ini dan tidak melebihi waktu yang berlalu', async () => {
    const t = await setup();
    const ent = await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    await t.get(t.tokenA, '/api/reader/prod-ebook-1/pages/1', s);
    await t.get(t.tokenA, '/api/reader/prod-ebook-1/pages/2', s);
    t.advance(20_000);

    const events = '/api/reader/prod-ebook-1/events';
    const res = await t.send('post', t.tokenA, events, s, {
      events: [
        { page: 1, dwellMs: 12_000 }, // diterima (sisa jatah 13 dtk)
        { page: 3, dwellMs: 3_000 }, // halaman 3 tidak pernah dikirim
        { page: 2, dwellMs: 1_000 }, // < 2 dtk: sekadar membalik halaman
        { page: 2, dwellMs: 6_000 }, // diterima (sisa jatah 7 dtk)
        { page: 1, dwellMs: 9_000 } // melebihi waktu yang berlalu
      ]
    });
    expect(res.body).toEqual({ accepted: 2, rejected: 3 });
    expect(t.store.events).toHaveLength(2);
    expect(t.store.events[0]).toMatchObject({ userId: USER_A.id, productId: 'prod-ebook-1', entitlementId: ent.id, unit: 'page', unitStart: 1, unitEnd: 1, dwellMs: 12_000 });

    // Langsung setelahnya hampir tidak ada waktu berlalu.
    expect((await t.send('post', t.tokenA, events, s, { events: [{ page: 1, dwellMs: 6_000 }] })).body).toEqual({ accepted: 0, rejected: 1 });
    expect((await t.send('post', t.tokenA, events, s, { events: 'bukan array' })).body.code).toBe('invalid_events');
  });

  it('persetujuan ketentuan disimpan sekali per produk dan wajib entitlement', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const path = '/api/access/prod-ebook-1/legal-notice';
    expect((await request(t.app).post(path).set('Authorization', `Bearer ${t.tokenB}`)).body.code).toBe('no_entitlement');
    const first = await request(t.app).post(path).set('Authorization', `Bearer ${t.tokenA}`);
    expect(first.status).toBe(200);
    t.advance(60_000);
    const second = await request(t.app).post(path).set('Authorization', `Bearer ${t.tokenA}`);
    expect(second.body.acceptedAt).toBe(first.body.acceptedAt);
    const meta = await t.get(t.tokenA, '/api/reader/prod-ebook-1/meta', s);
    expect(meta.body.legalNoticeAccepted).toBe(true);
    expect(meta.body.progress).toBeNull();
  });
});
