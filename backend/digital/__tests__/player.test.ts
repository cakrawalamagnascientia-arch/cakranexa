import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTestApp, mintUserToken, USER_A, USER_B } from './harness';
import { createCliTools } from '../processing';
import { rewritePlaylist } from '../player';
import { assetPaths } from '../storage';

const device = (n: number) => `perangkat-dengar-${n}-abcdefghij`;
const PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:10',
  '#EXT-X-MEDIA-SEQUENCE:0',
  '#EXT-X-PLAYLIST-TYPE:VOD',
  '#EXT-X-KEY:METHOD=AES-128,URI="enc.key"',
  '#EXTINF:10.000000,',
  'seg_0.ts',
  '#EXTINF:10.000000,',
  'seg_1.ts',
  '#EXTINF:5.000000,',
  'seg_2.ts',
  '#EXT-X-ENDLIST',
  ''
].join('\n');

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

const toolPaths = { ffmpeg: process.env.FFMPEG_PATH || '', pdftoppm: '', pdftotext: '' };
const hasFfmpeg = Boolean(toolPaths.ffmpeg && fs.existsSync(toolPaths.ffmpeg));

const setup = async (options: { tools?: ReturnType<typeof createCliTools>; synthetic?: boolean } = {}) => {
  const clock = { now: new Date() };
  const t = await createTestApp({ now: () => clock.now, tools: options.tools });
  cleanups.push(t.cleanup);
  const key = crypto.randomBytes(16);
  const segmentData = [0, 1, 2].map((n) => Buffer.from(`segmen-${n}-`.repeat(20)));
  if (options.synthetic !== false) {
    await t.storage.upload(assetPaths.audioPlaylist('prod-audio-1'), Buffer.from(PLAYLIST), 'application/vnd.apple.mpegurl');
    await t.storage.upload(assetPaths.audioKey('prod-audio-1'), key, 'application/octet-stream');
    for (const n of [0, 1, 2]) await t.storage.upload(assetPaths.audioSegment('prod-audio-1', n), segmentData[n], 'video/mp2t');
    await t.store.updateProduct('prod-audio-1', { processingStatus: 'ready', durationSeconds: 25, storagePath: 'audiobooks/prod-audio-1/source.mp3', processedAt: clock.now.toISOString() });
    await t.store.replaceChapters('prod-audio-1', [
      { chapterNumber: 1, title: 'Pembuka', startSeconds: 0, startPage: null },
      { chapterNumber: 2, title: 'Bab 1', startSeconds: 10, startPage: null }
    ]);
  }
  const tokenA = await mintUserToken(USER_A);
  const tokenB = await mintUserToken(USER_B);
  const grant = async (userId: string, productId = 'prod-audio-1') => {
    await t.store.insertEntitlements([{ userId, productId, source: 'purchase', sourceRef: `uji-${crypto.randomUUID()}`, startsAt: new Date(clock.now.getTime() - 60_000).toISOString() }]);
    return t.store.entitlements[t.store.entitlements.length - 1];
  };
  const open = async (token: string, productId = 'prod-audio-1', n = 1) =>
    (await request(t.app).post(`/api/access/${productId}/session/start`).set('Authorization', `Bearer ${token}`).send({ deviceId: device(n) })).body.sessionToken as string;
  const member = (method: 'get' | 'put' | 'post', token: string, url: string, sessionToken?: string) => {
    const req = request(t.app)[method](url).set('Authorization', `Bearer ${token}`);
    if (sessionToken) req.set('X-Session-Token', sessionToken);
    return req;
  };
  /** Permintaan media seperti hls.js/Safari: tanpa header Authorization. */
  const media = (url: string) => request(t.app).get(url).buffer(true).parse(binary);
  const resolve = (playlistUrl: string, ref: string) => {
    const u = new URL(ref, `http://uji${playlistUrl}`);
    return `${u.pathname}${u.search}`;
  };
  const fetchPlaylist = async (playlistUrl: string) => {
    const res = await media(playlistUrl);
    const text = (res.body as Buffer).toString('utf8');
    const keyUri = text.match(/URI="([^"]+)"/)?.[1] ?? '';
    const segmentUris = text.split('\n').filter((l) => l.startsWith('seg/'));
    return { res, text, keyUrl: resolve(playlistUrl, keyUri), segmentUrls: segmentUris.map((s) => resolve(playlistUrl, s)) };
  };
  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  return { ...t, clock, key, segmentData, tokenA, tokenB, grant, open, member, media, fetchPlaylist, advance };
};

describe('player: meta & playlist', () => {
  it('meta berisi durasi, bab (detik), watermark, dan URL playlist bertoken; wajib sesi & audiobook siap', async () => {
    const t = await setup();
    const ent = await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const meta = await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s);
    expect(meta.status).toBe(200);
    // Berisi URL playlist bertoken: tidak boleh disimpan cache.
    expect(meta.headers['cache-control']).toMatch(/no-store/);
    expect(meta.body).toMatchObject({
      product: { id: 'prod-audio-1', durationSeconds: 25 },
      title: 'Audit Investigatif Kontemporer',
      chapters: [{ number: 1, title: 'Pembuka', start: 0 }, { number: 2, title: 'Bab 1', start: 10 }],
      progress: null,
      legalNoticeAccepted: false,
      watermark: { name: USER_A.name, email: USER_A.email, entitlementId: ent.id }
    });
    expect(meta.body.stream.playlistUrl).toMatch(/^\/api\/player\/prod-audio-1\/playlist\.m3u8\?t=[\w-]+\.[\w-]+$/);
    expect(JSON.stringify(meta.body)).not.toMatch(/audiobooks\/|enc\.key|seg_\d/);
    expect((await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta')).body.code).toBe('session_required');

    await t.grant(USER_A.id, 'prod-ebook-1');
    const sEbook = await t.open(t.tokenA, 'prod-ebook-1');
    expect((await t.member('get', t.tokenA, '/api/player/prod-ebook-1/meta', sEbook)).body.code).toBe('wrong_format');
  });

  it('playlist ditulis ulang: key & segmen bertoken; isi key/segmen sama dengan aset; log segmen 1 dari 6', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const { playlistUrl } = (await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s)).body.stream;
    const pl = await t.fetchPlaylist(playlistUrl);
    expect(pl.res.status).toBe(200);
    expect(pl.res.headers['content-type']).toMatch(/application\/vnd\.apple\.mpegurl/);
    expect(pl.res.headers['cache-control']).toMatch(/no-store/);
    expect(pl.text).toMatch(/#EXT-X-KEY:METHOD=AES-128,URI="key\?t=[\w-]+\.[\w-]+"/);
    expect(pl.text).not.toMatch(/enc\.key|seg_\d/);
    expect(pl.segmentUrls).toHaveLength(3);
    expect(pl.segmentUrls[0]).toMatch(/^\/api\/player\/prod-audio-1\/seg\/0\.ts\?t=/);

    const key = await t.media(pl.keyUrl);
    expect(key.status).toBe(200);
    expect((key.body as Buffer).equals(t.key)).toBe(true);
    for (const n of [0, 1, 2]) {
      const seg = await t.media(pl.segmentUrls[n]);
      expect(seg.status).toBe(200);
      expect(seg.headers['content-type']).toBe('video/mp2t');
      expect(seg.headers['cache-control']).toMatch(/no-store/);
      expect((seg.body as Buffer).equals(t.segmentData[n])).toBe(true);
    }
    expect(t.store.logs.filter((l) => l.action === 'segment').map((l) => l.meta)).toEqual([{ segment: 0 }]);
    expect(t.store.logs.filter((l) => l.action === 'key')).toHaveLength(1);
  });

  it('token terikat ke jenis, segmen, produk; token rusak/tanpa token ditolak', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const { playlistUrl } = (await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s)).body.stream;
    const pl = await t.fetchPlaylist(playlistUrl);
    const token1 = new URL(pl.segmentUrls[1], 'http://uji').searchParams.get('t');
    const keyToken = new URL(pl.keyUrl, 'http://uji').searchParams.get('t');
    const denied = async (url: string) => JSON.parse(((await t.media(url)).body as Buffer).toString('utf8')).code;
    expect(await denied(`/api/player/prod-audio-1/seg/2.ts?t=${token1}`)).toBe('invalid_media_token');
    expect(await denied(`/api/player/prod-audio-1/seg/1.ts?t=${keyToken}`)).toBe('invalid_media_token');
    expect(await denied(`/api/player/prod-ebook-1/seg/1.ts?t=${token1}`)).toBe('invalid_media_token');
    expect(await denied(`/api/player/prod-audio-1/seg/1.ts?t=${token1}x`)).toBe('invalid_media_token');
    expect(await denied('/api/player/prod-audio-1/playlist.m3u8')).toBe('invalid_media_token');
    expect((await t.media(`/api/player/prod-audio-1/seg/1.ts?t=${token1}`)).status).toBe(200);
  });
});

describe('player: sesi & hak akses di setiap permintaan media', () => {
  it('sesi berakhir (ditutup / tanpa heartbeat) -> segmen ditolak', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const { playlistUrl } = (await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s)).body.stream;
    const pl = await t.fetchPlaylist(playlistUrl);
    t.advance(3 * 60_000);
    const stale = await t.media(pl.segmentUrls[0]);
    expect(stale.status).toBe(403);
    expect(JSON.parse((stale.body as Buffer).toString('utf8')).code).toBe('session_ended');

    const s2 = await t.open(t.tokenA, 'prod-audio-1', 2);
    const fresh = await t.fetchPlaylist((await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s2)).body.stream.playlistUrl);
    expect((await t.media(fresh.segmentUrls[0])).status).toBe(200);
    await request(t.app).post('/api/access/prod-audio-1/session/end').set('Content-Type', 'text/plain').send(JSON.stringify({ sessionToken: s2 }));
    expect((await t.media(fresh.segmentUrls[0])).status).toBe(403);
  });

  it('entitlement ditangguhkan di tengah mendengar -> segmen ditolak dengan kode alasan, sesi diakhiri', async () => {
    const t = await setup();
    const ent = await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const pl = await t.fetchPlaylist((await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s)).body.stream.playlistUrl);
    await t.store.updateEntitlements([ent.id], { status: 'suspended', statusChangedBy: 'anomaly' });
    const res = await t.media(pl.segmentUrls[1]);
    expect(res.status).toBe(403);
    expect(JSON.parse((res.body as Buffer).toString('utf8')).code).toBe('suspended');
    expect(t.store.sessions[0].endReason).toBe('revoked');
  });

  it('token media kedaluwarsa setelah 2 jam; /stream memberi URL baru selama sesi hidup', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const pl = await t.fetchPlaylist((await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s)).body.stream.playlistUrl);
    t.advance(2 * 60 * 60 * 1000 + 60_000);
    t.store.sessions[0].lastHeartbeat = t.clock.now.toISOString(); // heartbeat tetap berjalan selama itu
    const expired = await t.media(pl.segmentUrls[0]);
    expect(JSON.parse((expired.body as Buffer).toString('utf8')).code).toBe('invalid_media_token');
    const stream = await t.member('get', t.tokenA, '/api/player/prod-audio-1/stream', s);
    expect(Date.parse(stream.body.expiresAt)).toBeGreaterThan(t.clock.now.getTime());
    const renewed = await t.fetchPlaylist(stream.body.playlistUrl);
    expect((await t.media(renewed.segmentUrls[0])).status).toBe(200);
  });

  it('token user A tidak berlaku setelah user B mengambil sesi (sesi terikat user)', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    await t.grant(USER_B.id);
    const sA = await t.open(t.tokenA);
    const plA = await t.fetchPlaylist((await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', sA)).body.stream.playlistUrl);
    const tokenA = new URL(plA.segmentUrls[0], 'http://uji').searchParams.get('t')!;
    // Mengganti bagian payload token dengan user lain merusak tanda tangan.
    const [body, sig] = tokenA.split('.');
    const forged = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    forged.u = USER_B.id;
    const forgedToken = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`;
    expect((await t.media(`/api/player/prod-audio-1/seg/0.ts?t=${forgedToken}`)).status).toBe(403);
  });
});

describe('player: progres & verified listening', () => {
  it('progres dalam detik dihitung server; di luar durasi ditolak', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    expect((await t.member('put', t.tokenA, '/api/player/prod-audio-1/progress', s).send({ position: 12 })).body).toEqual({ position: 12, percent: 48 });
    expect((await t.member('put', t.tokenA, '/api/player/prod-audio-1/progress', s).send({ position: 60 })).body.code).toBe('invalid_position');
    expect((await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s)).body.progress).toEqual({ position: 12, percent: 48 });
  });

  it('listening events: segmen harus dikirim di sesi ini, kecepatan <= 2×, total <= waktu berlalu', async () => {
    const t = await setup();
    const ent = await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const pl = await t.fetchPlaylist((await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s)).body.stream.playlistUrl);
    await t.media(pl.segmentUrls[0]);
    await t.media(pl.segmentUrls[1]);
    t.advance(25_000);
    const res = await t.member('post', t.tokenA, '/api/player/prod-audio-1/events', s).send({
      events: [
        { from: 0, to: 10, wallMs: 10_000 }, // diterima
        { from: 10, to: 20, wallMs: 4_000 }, // < 5 detik
        { from: 10, to: 20, wallMs: 6_000 }, // diterima (1,67×)
        { from: 20, to: 25, wallMs: 5_000 }, // segmen 2 belum pernah dikirim
        { from: 0, to: 20, wallMs: 6_000 } // 3,3× — lebih cepat dari 2×
      ]
    });
    expect(res.body).toEqual({ accepted: 2, rejected: 3, audioQuota: null });
    expect(t.store.events).toHaveLength(2);
    expect(t.store.events[0]).toMatchObject({ unit: 'second', unitStart: 0, unitEnd: 10, dwellMs: 10_000, entitlementId: ent.id });
    // Hampir tidak ada waktu berlalu sejak batch terakhir.
    expect((await t.member('post', t.tokenA, '/api/player/prod-audio-1/events', s).send({ events: [{ from: 0, to: 10, wallMs: 10_000 }] })).body.accepted).toBe(0);
  });

  it('rate limit segmen: 60 per menit per user', async () => {
    const t = await setup();
    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const pl = await t.fetchPlaylist((await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s)).body.stream.playlistUrl);
    for (let i = 0; i < 60; i++) expect((await t.media(pl.segmentUrls[1])).status).toBe(200);
    const limited = await t.media(pl.segmentUrls[1]);
    expect(limited.status).toBe(429);
  }, 30_000);

  it('rewritePlaylist hanya mengganti URI key dan nama segmen', () => {
    const out = rewritePlaylist(PLAYLIST, (kind, n) => (kind === 'seg' ? `S${n}` : 'K'));
    expect(out).toContain('#EXT-X-KEY:METHOD=AES-128,URI="key?t=K"');
    expect(out).toContain('seg/2.ts?t=S2');
    expect(out).toContain('#EXTINF:5.000000,');
    expect(out).toContain('#EXT-X-ENDLIST');
  });
});

describe.skipIf(!hasFfmpeg)('player: HLS nyata dari ffmpeg', () => {
  it('segmen dari proxy dapat didekripsi dengan key dari proxy (IV = nomor segmen)', async () => {
    const t = await setup({ tools: createCliTools(toolPaths), synthetic: false });
    const mp3 = path.join(os.tmpdir(), `cnx-player-${Date.now()}.mp3`);
    execFileSync(toolPaths.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=22', '-c:a', 'libmp3lame', '-b:a', '96k', mp3]);
    cleanups.push(async () => fs.rmSync(mp3, { force: true }));
    expect((await request(t.app).post('/api/admin/digital/processing/prod-audio-1/master').set('x-test-admin', '1')
      .attach('file', mp3, { filename: 'buku.mp3', contentType: 'audio/mpeg' })).status).toBe(202);
    await t.phase2.queue!.waitIdle();
    expect((await t.store.getProduct('prod-audio-1'))?.processingStatus).toBe('ready');

    await t.grant(USER_A.id);
    const s = await t.open(t.tokenA);
    const pl = await t.fetchPlaylist((await t.member('get', t.tokenA, '/api/player/prod-audio-1/meta', s)).body.stream.playlistUrl);
    expect(pl.segmentUrls.length).toBe(3);
    const key = (await t.media(pl.keyUrl)).body as Buffer;
    for (const n of [0, 1]) {
      const encrypted = (await t.media(pl.segmentUrls[n])).body as Buffer;
      const iv = Buffer.alloc(16);
      iv.writeUInt32BE(n, 12);
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      expect(plain[0]).toBe(0x47);
    }
  });
});
