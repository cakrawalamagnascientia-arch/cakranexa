import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createTestApp, mintUserToken, USER_A, USER_B } from './harness';
import type { AccessLogRecord } from '../types';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const setup = async (env: Record<string, string> = {}) => {
  const t = await createTestApp({ env });
  cleanups.push(t.cleanup);
  const tokenA = await mintUserToken(USER_A);
  const tokenB = await mintUserToken(USER_B);
  // Pengguna tercatat di store (profil untuk email & admin).
  await request(t.app).get('/api/library').set('Authorization', `Bearer ${tokenA}`);
  await request(t.app).get('/api/library').set('Authorization', `Bearer ${tokenB}`);
  let seq = 0;
  const log = (row: Partial<AccessLogRecord> & Pick<AccessLogRecord, 'userId' | 'action'>, at: Date) => {
    seq += 1;
    t.store.logs.push({ id: `uji-${seq}`, productId: null, meta: {}, ...row, createdAt: at.toISOString() });
  };
  const admin = (method: 'get' | 'post', path: string) => request(t.app)[method](path).set('x-test-admin', '1');
  return { ...t, tokenA, tokenB, log, admin };
};

/** Pola akses mencurigakan untuk ketiga aturan. */
const seedAnomalies = async (t: Awaited<ReturnType<typeof setup>>) => {
  const now = Date.now();
  // page_speed: 3 jendela 10 detik dengan 31 halaman masing-masing (user A, e-book).
  for (const w of [1, 2, 3]) {
    const windowStart = Math.floor((now - w * 60_000) / 10_000) * 10_000;
    for (let i = 0; i < 31; i++) t.log({ userId: USER_A.id, productId: 'prod-ebook-1', action: 'page_view', meta: { page: i + 1 } }, new Date(windowStart + 100 + i));
  }
  // ip_spread: 6 IP berbeda dalam 24 jam (user A, audiobook).
  for (let i = 0; i < 6; i++) t.log({ userId: USER_A.id, productId: 'prod-audio-1', action: 'segment', ip: `10.0.0.${i + 1}` }, new Date(now - (i + 1) * 3600_000));
  // device_limit_denials: 4 penolakan batas perangkat (user B).
  for (let i = 0; i < 4; i++) t.log({ userId: USER_B.id, action: 'denied', meta: { reason: 'device_limit' } }, new Date(now - (i + 1) * 600_000));
};

describe('deteksi anomali', () => {
  it('menandai 3 aturan, menangguhkan otomatis hanya kecepatan halaman, email admin sekali; tidak menduplikasi', async () => {
    const t = await setup();
    await t.store.insertEntitlements([
      { userId: USER_A.id, productId: 'prod-ebook-1', source: 'purchase', sourceRef: `uji-${crypto.randomUUID()}` },
      { userId: USER_A.id, productId: 'prod-audio-1', source: 'purchase', sourceRef: `uji-${crypto.randomUUID()}` }
    ]);
    const sessionToken = (await request(t.app).post('/api/access/prod-ebook-1/session/start').set('Authorization', `Bearer ${t.tokenA}`).send({ deviceId: 'perangkat-anomali-abcdefgh' })).body.sessionToken;
    expect(sessionToken).toBeTruthy();
    await seedAnomalies(t);

    expect((await request(t.app).post('/api/admin/digital-access/anomalies/scan')).status).toBe(401);
    const scan = await t.admin('post', '/api/admin/digital-access/anomalies/scan');
    expect(scan.body).toEqual({ candidates: 3, created: 3 });

    const ebook = t.store.entitlements.find((e) => e.productId === 'prod-ebook-1')!;
    const audio = t.store.entitlements.find((e) => e.productId === 'prod-audio-1')!;
    expect(ebook).toMatchObject({ status: 'suspended', revokedReason: 'anomaly:page_speed', statusChangedBy: 'anomaly' });
    expect(audio.status).toBe('active'); // ip_spread hanya ditandai
    expect(t.store.sessions.find((s) => s.productId === 'prod-ebook-1')?.endReason).toBe('revoked');

    expect(t.mails).toHaveLength(1);
    expect(t.mails[0].to).toEqual(['admin@uji.id']);
    expect(t.mails[0].subject).toContain('3 anomali');
    expect(t.mails[0].html).toContain(USER_A.email);
    expect(t.mails[0].html).toContain('Reformulasi Mekanisme PPN');

    // Pemeriksaan berikutnya tidak menduplikasi anomali yang masih terbuka.
    expect((await t.admin('post', '/api/admin/digital-access/anomalies/scan')).body.created).toBe(0);
    expect(t.mails).toHaveLength(1);

    const list = await t.admin('get', '/api/admin/digital-access/anomalies?status=open');
    expect(list.body.anomalies).toHaveLength(3);
    const pageSpeed = list.body.anomalies.find((a: { rule: string }) => a.rule === 'page_speed');
    expect(pageSpeed).toMatchObject({ actionTaken: 'suspended', user: { email: USER_A.email }, product: { title: 'Reformulasi Mekanisme PPN' } });
    expect(pageSpeed.suspendedEntitlementIds).toEqual([ebook.id]);
    const denials = list.body.anomalies.find((a: { rule: string }) => a.rule === 'device_limit_denials');
    expect(denials).toMatchObject({ actionTaken: 'flagged', productId: null, user: { email: USER_B.email } });
  });

  it('menyelesaikan anomali: aktifkan kembali akses, catatan tersimpan, tidak ditandai ulang dalam jendela aturan', async () => {
    const t = await setup();
    await t.store.insertEntitlements([{ userId: USER_A.id, productId: 'prod-ebook-1', source: 'purchase', sourceRef: `uji-${crypto.randomUUID()}` }]);
    await seedAnomalies(t);
    await t.admin('post', '/api/admin/digital-access/anomalies/scan');
    const pageSpeed = t.store.anomalies.find((a) => a.rule === 'page_speed')!;

    const resolved = await t.admin('post', `/api/admin/digital-access/anomalies/${pageSpeed.id}/resolve`).send({ note: 'Pembaca cepat, sudah dikonfirmasi.', reactivate: true });
    expect(resolved.body).toEqual({ resolved: true, reactivated: 1 });
    expect(t.store.entitlements[0].status).toBe('active');
    expect(t.store.anomalies.find((a) => a.id === pageSpeed.id)).toMatchObject({ resolvedBy: 'admin', resolutionNote: 'Pembaca cepat, sudah dikonfirmasi.' });
    expect((await t.admin('post', `/api/admin/digital-access/anomalies/${pageSpeed.id}/resolve`).send({})).status).toBe(409);

    // Log yang sama masih dalam jendela 1 jam: tidak ditangguhkan lagi.
    expect((await t.admin('post', '/api/admin/digital-access/anomalies/scan')).body.created).toBe(0);
    expect(t.store.entitlements[0].status).toBe('active');
    expect((await t.admin('get', '/api/admin/digital-access/anomalies?status=resolved')).body.anomalies).toHaveLength(1);
  });

  it('endpoint cron: wajib CRON_SECRET; tidak ada bila rahasia belum di-set', async () => {
    const t = await setup();
    await seedAnomalies(t);
    expect((await request(t.app).post('/api/internal/cron')).status).toBe(401);
    expect((await request(t.app).post('/api/internal/cron').set('Authorization', 'Bearer salah')).status).toBe(401);
    const ok = await request(t.app).post('/api/internal/cron').set('Authorization', 'Bearer rahasia-cron-tes');
    expect(ok.status).toBe(200);
    expect(ok.body.created).toBe(3);

    const noSecret = await setup({ CRON_SECRET: '' });
    expect((await request(noSecret.app).post('/api/internal/cron').set('Authorization', 'Bearer apa-saja')).status).toBe(404);
  });
});
