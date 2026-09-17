import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createTestApp, mintUserToken, USER_A, USER_B } from './harness';
import { ConflictError } from '../errors';

/**
 * Fase 6 Langkah 2 (backend beranda digital): rak "Populer bulan ini", "Lanjutkan membaca", dan satu sesi aktif
 * per pengguna yang dijaga penyimpanan (indeks unik parsial access_sessions_one_active_user).
 */

const DAY = 86_400_000;
const NOW = '2026-09-14T03:00:00.000Z';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const setup = async () => {
  const clock = { t: Date.parse(NOW) };
  const t = await createTestApp({ now: () => new Date(clock.t) });
  cleanups.push(t.cleanup);
  const event = (userId: string, productId: string, daysAgo: number) => t.store.insertReadingEvents([{
    userId, productId, sessionId: crypto.randomUUID(), entitlementId: null, unit: 'page', unitStart: 1, unitEnd: 1, dwellMs: 5000,
    occurredAt: new Date(clock.t - daysAgo * DAY).toISOString()
  }]);
  return { ...t, clock, event };
};

describe('beranda digital: populer & lanjutkan membaca', () => {
  it('populer = pembaca berbeda 30 hari terakhir, hanya id produk; publik tanpa login', async () => {
    const t = await setup();
    await t.event(USER_A.id, 'prod-audio-1', 1);
    await t.event(USER_B.id, 'prod-audio-1', 2);
    await t.event(USER_A.id, 'prod-audio-1', 3); // pembaca yang sama tidak dihitung dua kali
    await t.event(USER_A.id, 'prod-ebook-2', 5);
    await t.event(USER_A.id, 'prod-ebook-1', 45); // di luar 30 hari
    await t.event(USER_B.id, 'prod-ebook-1', 40);
    const res = await request(t.app).get('/api/digital/popular');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ productIds: ['prod-audio-1', 'prod-ebook-2'] });
    expect(res.headers['cache-control']).toContain('public');
  });

  it('lanjutkan membaca: progres 1–99%, terbaru dulu, wajib login', async () => {
    const t = await setup();
    expect((await request(t.app).get('/api/library/continue')).status).toBe(401);
    await t.store.upsertProgress(USER_A.id, 'prod-ebook-1', { position: 30, percent: 10 });
    await new Promise((r) => setTimeout(r, 5));
    await t.store.upsertProgress(USER_A.id, 'prod-audio-1', { position: 600, percent: 3 });
    await t.store.upsertProgress(USER_A.id, 'prod-ebook-2', { position: 200, percent: 100 });
    await t.store.upsertProgress(USER_B.id, 'prod-ebook-2', { position: 20, percent: 10 });
    const token = await mintUserToken(USER_A);
    const res = await request(t.app).get('/api/library/continue').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: any) => [i.productId, i.format, i.percent])).toEqual([['prod-audio-1', 'audiobook', 3], ['prod-ebook-1', 'ebook', 10]]);
  });

  it('penyimpanan menolak sesi terbuka kedua untuk pengguna yang sama (judul lain sekalipun)', async () => {
    const t = await setup();
    const row = (productId: string, userId = USER_A.id) => ({
      userId, productId, deviceId: null, entitlementId: null, tokenHash: crypto.randomUUID(), ip: null, userAgent: null,
      startedAt: NOW, lastHeartbeat: NOW, institutionId: null
    });
    const first = await t.store.insertSession(row('prod-ebook-1'));
    await expect(t.store.insertSession(row('prod-audio-1'))).rejects.toBeInstanceOf(ConflictError);
    await t.store.insertSession(row('prod-audio-1', USER_B.id));
    await t.store.endSessions({ ids: [first.id] }, 'closed');
    await t.store.insertSession(row('prod-audio-1'));
  });
});

describe('halaman buku: daftar bab publik (fase 6 Langkah 3)', () => {
  it('nomor, judul, dan posisi bab saja, terurut; produk tidak dikenal 404; tanpa login', async () => {
    const t = await setup();
    await t.store.replaceChapters('prod-audio-1', [
      { chapterNumber: 2, title: 'Bab Dua', startSeconds: 1800, startPage: null },
      { chapterNumber: 1, title: 'Pendahuluan', startSeconds: 0, startPage: null }
    ]);
    const res = await request(t.app).get('/api/digital/chapters/prod-audio-1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ chapters: [
      { number: 1, title: 'Pendahuluan', startSeconds: 0, startPage: null },
      { number: 2, title: 'Bab Dua', startSeconds: 1800, startPage: null }
    ] });
    expect(res.headers['cache-control']).toContain('public');
    expect((await request(t.app).get('/api/digital/chapters/prod-ebook-2')).body).toEqual({ chapters: [] });
    expect((await request(t.app).get('/api/digital/chapters/tidak-ada')).status).toBe(404);
  });
});
