import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import sharp from 'sharp';
import { createTestApp, mintUserToken, USER_A, USER_B } from './harness';
import { assetPaths } from '../storage';

/**
 * Verifikasi fase 2 (Langkah 9, poin 4, 5, 8, 9, 10). Poin 1, 2, 3, 6, 7 ada di checkout.test.ts dan
 * access.test.ts; poin 11 (isi build) di scripts/check-build-secrets.mjs.
 */

const SERVER_KEY = 'SB-Mid-server-UJI';
const device = (n: number) => `perangkat-verif-${n}-abcdefghij`;
const PLAYLIST = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n'
  + '#EXT-X-KEY:METHOD=AES-128,URI="enc.key"\n#EXTINF:10.000000,\nseg_0.ts\n#EXTINF:5.000000,\nseg_1.ts\n#EXT-X-ENDLIST\n';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const binary = (res: any, callback: (err: Error | null, body: any) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

const notification = (orderId: string, amount: number, status: string) => {
  const gross = `${amount}.00`;
  const statusCode = status === 'settlement' ? '200' : '202';
  return {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: gross,
    transaction_status: status,
    signature_key: crypto.createHash('sha512').update(`${orderId}${statusCode}${gross}${SERVER_KEY}`).digest('hex')
  };
};

const setup = async (pageTexts: string[] = ['Halaman satu tentang audit.', 'Halaman dua.', 'Halaman tiga.']) => {
  const clock = { now: new Date() };
  const t = await createTestApp({
    now: () => clock.now,
    fetchImpl: (async () => new Response(JSON.stringify({ token: 'snap-verif', redirect_url: null }), { status: 201 })) as unknown as typeof fetch
  });
  cleanups.push(t.cleanup);
  const png = await sharp({ create: { width: 300, height: 420, channels: 3, background: '#ffffff' } }).png().toBuffer();
  for (let n = 1; n <= pageTexts.length; n++) await t.storage.upload(assetPaths.ebookPage('prod-ebook-1', n), png, 'image/png');
  await t.store.updateProduct('prod-ebook-1', { processingStatus: 'ready', pageCount: pageTexts.length, storagePath: 'ebooks/prod-ebook-1/source.pdf', processedAt: clock.now.toISOString() });
  await t.store.replacePages('prod-ebook-1', pageTexts.map((text, i) => ({ pageNumber: i + 1, text })));
  await t.storage.upload(assetPaths.audioPlaylist('prod-audio-1'), Buffer.from(PLAYLIST), 'application/vnd.apple.mpegurl');
  await t.storage.upload(assetPaths.audioKey('prod-audio-1'), crypto.randomBytes(16), 'application/octet-stream');
  for (const n of [0, 1]) await t.storage.upload(assetPaths.audioSegment('prod-audio-1', n), Buffer.from(`seg-${n}`), 'video/mp2t');
  await t.store.updateProduct('prod-audio-1', { processingStatus: 'ready', durationSeconds: 15, storagePath: 'audiobooks/prod-audio-1/source.mp3', processedAt: clock.now.toISOString() });

  const tokenA = await mintUserToken(USER_A);
  const tokenB = await mintUserToken(USER_B);
  const grant = async (userId: string, productId: string) => {
    await t.store.insertEntitlements([{ userId, productId, source: 'purchase', sourceRef: `verif-${crypto.randomUUID()}`, startsAt: new Date(clock.now.getTime() - 60_000).toISOString() }]);
    return t.store.entitlements[t.store.entitlements.length - 1];
  };
  const open = async (token: string, productId: string, n = 1) =>
    (await request(t.app).post(`/api/access/${productId}/session/start`).set('Authorization', `Bearer ${token}`).send({ deviceId: device(n) }));
  const page = (jwt: string | null, sessionToken: string | null, n = 1) => {
    const req = request(t.app).get(`/api/reader/prod-ebook-1/pages/${n}`);
    if (jwt) req.set('Authorization', `Bearer ${jwt}`);
    if (sessionToken) req.set('X-Session-Token', sessionToken);
    return req;
  };
  const media = (url: string) => request(t.app).get(url).buffer(true).parse(binary);
  const mediaCode = async (url: string) => {
    const res = await media(url);
    return { status: res.status, code: res.status === 200 ? null : JSON.parse((res.body as Buffer).toString('utf8')).code };
  };
  const playerUrls = async (jwt: string, sessionToken: string) => {
    const { playlistUrl } = (await request(t.app).get('/api/player/prod-audio-1/meta').set('Authorization', `Bearer ${jwt}`).set('X-Session-Token', sessionToken)).body.stream;
    const text = ((await media(playlistUrl)).body as Buffer).toString('utf8');
    const base = `http://uji${playlistUrl}`;
    const resolve = (ref: string) => { const u = new URL(ref, base); return `${u.pathname}${u.search}`; };
    return {
      playlistUrl,
      keyUrl: resolve(text.match(/URI="([^"]+)"/)![1]),
      segmentUrl: resolve(text.split('\n').find((l) => l.startsWith('seg/'))!)
    };
  };
  const advance = (ms: number) => { clock.now = new Date(clock.now.getTime() + ms); };
  return { ...t, clock, tokenA, tokenB, grant, open, page, media, mediaCode, playerUrls, advance };
};

describe('Verifikasi 4: refund mencabut akses dan reader menolak', () => {
  it('pembelian -> baca -> refund -> sesi berakhir, sesi baru ditolak no_entitlement', async () => {
    const t = await setup();
    const checkout = await request(t.app).post('/api/digital/checkout').set('Authorization', `Bearer ${t.tokenA}`)
      .send({ items: ['prod-ebook-1'], idempotency_key: `verif-${crypto.randomUUID()}`, license_accepted: true });
    const orderNumber = checkout.body.order.orderNumber;
    await t.phase2.handleMidtransNotification!(notification(orderNumber, 99000, 'settlement'));
    const sessionToken = (await t.open(t.tokenA, 'prod-ebook-1')).body.sessionToken;
    expect((await t.page(t.tokenA, sessionToken)).status).toBe(200);

    expect((await t.phase2.handleMidtransNotification!(notification(orderNumber, 99000, 'refund'))).status).toBe(200);
    expect(t.store.entitlements[0].status).toBe('revoked');
    const after = await t.page(t.tokenA, sessionToken);
    expect(after.status).toBe(401);
    expect(after.body).toMatchObject({ code: 'session_ended', endReason: 'revoked' });
    const reopen = await t.open(t.tokenA, 'prod-ebook-1');
    expect(reopen.status).toBe(403);
    expect(reopen.body.code).toBe('no_entitlement');
  });
});

describe('Verifikasi 5: halaman/segmen/key tanpa JWT, tanpa sesi, sesi user lain, atau entitlement suspended', () => {
  it('halaman e-book', async () => {
    const t = await setup();
    const entA = await t.grant(USER_A.id, 'prod-ebook-1');
    await t.grant(USER_B.id, 'prod-ebook-1');
    const sA = (await t.open(t.tokenA, 'prod-ebook-1', 1)).body.sessionToken;
    const sB = (await t.open(t.tokenB, 'prod-ebook-1', 2)).body.sessionToken;

    expect((await t.page(null, sA)).status).toBe(401); // tanpa JWT
    expect((await t.page(null, sA)).body.code).toBe('unauthenticated');
    expect((await t.page(t.tokenA, null)).body).toMatchObject({ code: 'session_required' }); // tanpa token sesi
    expect((await t.page(t.tokenA, sB)).body).toMatchObject({ code: 'session_invalid' }); // sesi user lain
    expect((await t.page(t.tokenB, sA)).body).toMatchObject({ code: 'session_invalid' });
    expect((await t.page('bukan.jwt.valid', sA)).body.code).toBe('invalid_token');
    expect((await t.page(t.tokenA, sA)).status).toBe(200);

    await t.store.updateEntitlements([entA.id], { status: 'suspended', statusChangedBy: 'admin' });
    const suspended = await t.page(t.tokenA, sA);
    expect(suspended.status).toBe(403);
    expect(suspended.body.code).toBe('suspended');
    // Pengguna lain tidak terpengaruh.
    expect((await t.page(t.tokenB, sB)).status).toBe(200);
  });

  it('segmen, key, dan playlist audiobook', async () => {
    const t = await setup();
    const entA = await t.grant(USER_A.id, 'prod-audio-1');
    await t.grant(USER_B.id, 'prod-audio-1');
    const sA = (await t.open(t.tokenA, 'prod-audio-1', 1)).body.sessionToken;
    const sB = (await t.open(t.tokenB, 'prod-audio-1', 2)).body.sessionToken;
    const a = await t.playerUrls(t.tokenA, sA);
    const b = await t.playerUrls(t.tokenB, sB);
    expect((await t.mediaCode(a.segmentUrl)).status).toBe(200);
    expect((await t.mediaCode(a.keyUrl)).status).toBe(200);

    const strip = (url: string) => url.replace(/\?t=.*$/, '');
    for (const url of [a.playlistUrl, a.segmentUrl, a.keyUrl]) {
      expect((await t.mediaCode(strip(url))).code, url).toBe('invalid_media_token'); // tanpa token
      expect((await t.mediaCode(`${strip(url)}?t=palsu.token`)).code, url).toBe('invalid_media_token');
    }
    // Token sesi user B yang diubah menjadi milik user A: tanda tangan tidak cocok.
    const [bodyB, sigB] = new URL(b.segmentUrl, 'http://uji').searchParams.get('t')!.split('.');
    const payload = JSON.parse(Buffer.from(bodyB, 'base64url').toString('utf8'));
    const forged = `${Buffer.from(JSON.stringify({ ...payload, u: USER_A.id })).toString('base64url')}.${sigB}`;
    expect((await t.mediaCode(`${strip(b.segmentUrl)}?t=${forged}`)).code).toBe('invalid_media_token');

    // Tanpa JWT: endpoint meta/stream menolak (media bertoken tidak butuh JWT, tetapi token hanya didapat lewat meta berlogin).
    expect((await request(t.app).get('/api/player/prod-audio-1/meta').set('X-Session-Token', sA)).status).toBe(401);
    expect((await request(t.app).get('/api/player/prod-audio-1/stream').set('Authorization', `Bearer ${t.tokenA}`)).body.code).toBe('session_required');
    expect((await request(t.app).get('/api/player/prod-audio-1/stream').set('Authorization', `Bearer ${t.tokenA}`).set('X-Session-Token', sB)).body.code).toBe('session_invalid');

    await t.store.updateEntitlements([entA.id], { status: 'suspended', statusChangedBy: 'admin' });
    expect(await t.mediaCode(a.segmentUrl)).toEqual({ status: 403, code: 'suspended' });
    expect((await t.mediaCode(b.segmentUrl)).status).toBe(200);
  });
});

describe('Verifikasi 8: pencarian tidak pernah mengembalikan >200 karakter per hasil', () => {
  it('teks halaman panjang dengan kata kunci di awal, tengah, dan akhir', async () => {
    const long = (at: 'start' | 'middle' | 'end') => {
      const filler = 'pajak pertambahan nilai '.repeat(120);
      return at === 'start' ? `audit ${filler}` : at === 'middle' ? `${filler} audit ${filler}` : `${filler} audit`;
    };
    const t = await setup([long('start'), long('middle'), long('end'), 'audit'.repeat(300)]);
    await t.grant(USER_A.id, 'prod-ebook-1');
    const s = (await t.open(t.tokenA, 'prod-ebook-1')).body.sessionToken;
    const res = await request(t.app).get('/api/reader/prod-ebook-1/search?q=audit').set('Authorization', `Bearer ${t.tokenA}`).set('X-Session-Token', s);
    expect(res.body.results.length).toBe(4);
    for (const r of res.body.results) expect(r.snippet.length).toBeLessThanOrEqual(200);
  });
});

describe('Verifikasi 9: reading_events tidak wajar dibuang', () => {
  it('dwell 100 ms dan halaman 9999 ditolak; event wajar diterima', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    const s = (await t.open(t.tokenA, 'prod-ebook-1')).body.sessionToken;
    await t.page(t.tokenA, s, 1);
    t.advance(30_000);
    const res = await request(t.app).post('/api/reader/prod-ebook-1/events').set('Authorization', `Bearer ${t.tokenA}`).set('X-Session-Token', s)
      .send({ events: [{ page: 1, dwellMs: 100 }, { page: 9999, dwellMs: 10_000 }, { page: -1, dwellMs: 10_000 }, { page: 1, dwellMs: 'x' }, { page: 1, dwellMs: 10_000 }] });
    expect(res.body).toEqual({ accepted: 1, rejected: 4 });
    expect(t.store.events.map((e) => [e.unitStart, e.dwellMs])).toEqual([[1, 10_000]]);
  });
});

describe('Verifikasi 10: aset privat tidak dapat diakses langsung', () => {
  it('tidak ada rute yang menyajikan objek penyimpanan; respons API tidak memuat path/bucket', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    await t.grant(USER_A.id, 'prod-audio-1');
    for (const path of [
      '/ebooks/prod-ebook-1/pages/1.png',
      '/ebooks/prod-ebook-1/source.pdf',
      '/audiobooks/prod-audio-1/hls/enc.key',
      '/audiobooks/prod-audio-1/hls/seg_0.ts',
      '/digital-assets/ebooks/prod-ebook-1/pages/1.png',
      '/storage/v1/object/digital-assets/ebooks/prod-ebook-1/source.pdf',
      '/api/reader/prod-ebook-1/pages/..%2F..%2Fsource.pdf'
    ]) {
      const res = await request(t.app).get(path).set('Authorization', `Bearer ${t.tokenA}`);
      expect(res.status, path).toBeGreaterThanOrEqual(400);
      expect(res.headers['content-type'] ?? '', path).not.toMatch(/image|pdf|mp2t|octet-stream/);
    }
    const sE = (await t.open(t.tokenA, 'prod-ebook-1', 1)).body.sessionToken;
    const sA = (await t.open(t.tokenA, 'prod-audio-1', 1)).body.sessionToken;
    const auth = (req: request.Test, token?: string) => (token ? req.set('Authorization', `Bearer ${t.tokenA}`).set('X-Session-Token', token) : req.set('Authorization', `Bearer ${t.tokenA}`));
    const bodies = [
      (await auth(request(t.app).get('/api/library'))).body,
      (await auth(request(t.app).get('/api/reader/prod-ebook-1/meta'), sE)).body,
      (await auth(request(t.app).get('/api/player/prod-audio-1/meta'), sA)).body,
      (await request(t.app).get('/api/admin/digital/processing/prod-ebook-1').set('x-test-admin', '1')).body
    ];
    for (const body of bodies) expect(JSON.stringify(body)).not.toMatch(/digital-assets|ebooks\/|audiobooks\/|source\.(pdf|mp3)|enc\.key|seg_\d|storagePath/);
  });
});
