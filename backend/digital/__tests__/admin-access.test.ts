import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createTestApp, mintUserToken, USER_A, USER_B } from './harness';

const device = (n: number) => `perangkat-admin-${n}-abcdefghij`;
const DAY = 24 * 60 * 60 * 1000;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const setup = async () => {
  const clock = { now: new Date() };
  const t = await createTestApp({ now: () => clock.now });
  cleanups.push(t.cleanup);
  const tokenA = await mintUserToken(USER_A);
  const tokenB = await mintUserToken(USER_B);
  const adminReq = (method: 'get' | 'post' | 'patch', path: string) => request(t.app)[method](path).set('x-test-admin', '1');
  const start = (token: string, productId: string, n = 1) =>
    request(t.app).post(`/api/access/${productId}/session/start`).set('Authorization', `Bearer ${token}`).send({ deviceId: device(n) });
  const grantPurchase = (userId: string, productId: string) =>
    t.store.insertEntitlements([{ userId, productId, source: 'purchase', sourceRef: `uji-${crypto.randomUUID()}`, startsAt: new Date(clock.now.getTime() - 60_000).toISOString() }]);
  return { ...t, clock, tokenA, tokenB, adminReq, start, grantPurchase };
};

describe('admin: Entitlement & Akses', () => {
  it('semua endpoint wajib admin', async () => {
    const t = await setup();
    for (const [method, path] of [
      ['get', '/api/admin/digital-access/users?q=a'],
      ['get', `/api/admin/digital-access/users/${USER_A.id}`],
      ['post', '/api/admin/digital-access/entitlements'],
      ['patch', '/api/admin/digital-access/entitlements/x'],
      ['post', '/api/admin/digital-access/devices/x/release'],
      ['post', `/api/admin/digital-access/users/${USER_A.id}/end-sessions`]
    ] as const) {
      expect((await request(t.app)[method](path).set('Authorization', `Bearer ${t.tokenA}`)).status, path).toBe(401);
    }
  });

  it('cari pengguna dan lihat detail akses: hak akses, perangkat, sesi, pesanan, log', async () => {
    const t = await setup();
    await t.grantPurchase(USER_A.id, 'prod-ebook-1');
    expect((await t.start(t.tokenA, 'prod-ebook-1')).status).toBe(201);
    expect((await t.start(t.tokenA, 'prod-audio-1')).body.code).toBe('no_entitlement');

    const found = await t.adminReq('get', '/api/admin/digital-access/users?q=pembaca.a');
    expect(found.body.users.map((u: { email: string }) => u.email)).toEqual([USER_A.email]);

    const detail = await t.adminReq('get', `/api/admin/digital-access/users/${USER_A.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.user).toMatchObject({ email: USER_A.email, fullName: USER_A.name });
    expect(detail.body.maxDevices).toBe(2);
    expect(detail.body.entitlements).toHaveLength(1);
    expect(detail.body.entitlements[0]).toMatchObject({ source: 'purchase', status: 'active', usable: true, product: { id: 'prod-ebook-1', title: 'Reformulasi Mekanisme PPN', format: 'ebook' } });
    expect(detail.body.devices).toHaveLength(1);
    expect(detail.body.sessions).toHaveLength(1);
    expect(detail.body.sessions[0]).toMatchObject({ productId: 'prod-ebook-1', alive: true });
    expect(detail.body.logs.map((l: { action: string }) => l.action)).toEqual(expect.arrayContaining(['session_start', 'denied']));
    expect(JSON.stringify(detail.body)).not.toMatch(/fingerprint|tokenHash|session_token|storagePath/i);
    expect((await t.adminReq('get', '/api/admin/digital-access/users/bukan-uuid')).status).toBe(404);
  });

  it('beri akses (admin_grant) dengan batas perangkat & masa berlaku; validasi input', async () => {
    const t = await setup();
    const path = '/api/admin/digital-access/entitlements';
    expect((await t.adminReq('post', path).send({ userId: USER_B.id, productId: 'tidak-ada' })).body.code).toBe('product_not_found');
    expect((await t.adminReq('post', path).send({ userId: USER_B.id, productId: 'prod-audio-1', endsAt: new Date(t.clock.now.getTime() - DAY).toISOString() })).body.code).toBe('invalid_ends_at');
    expect((await t.adminReq('post', path).send({ userId: USER_B.id, productId: 'prod-audio-1', maxDevices: 99 })).body.code).toBe('invalid_max_devices');

    const endsAt = new Date(t.clock.now.getTime() + 30 * DAY).toISOString();
    const granted = await t.adminReq('post', path).send({ userId: USER_B.id, productId: 'prod-audio-1', endsAt, maxDevices: 3 });
    expect(granted.status).toBe(201);
    expect(granted.body.entitlement).toMatchObject({ userId: USER_B.id, productId: 'prod-audio-1', source: 'admin_grant', status: 'active', endsAt, maxDevices: 3, statusChangedBy: 'admin' });
    expect((await t.start(t.tokenB, 'prod-audio-1')).status).toBe(201);
    // Fase 6: batas perangkat per pengguna tetap 2 (nilai max_devices entitlement hanya tersimpan).
    expect((await t.adminReq('get', `/api/admin/digital-access/users/${USER_B.id}`)).body.maxDevices).toBe(2);

    // Setelah masa berlaku lewat: expired.
    t.clock.now = new Date(t.clock.now.getTime() + 31 * DAY);
    expect((await t.start(t.tokenB, 'prod-audio-1', 2)).body.code).toBe('expired');
  });

  it('tangguhkan -> sesi berakhir & akses ditolak; aktifkan kembali; cabut menyembunyikan dari Pustaka', async () => {
    const t = await setup();
    await t.grantPurchase(USER_A.id, 'prod-ebook-1');
    const entitlementId = t.store.entitlements[0].id;
    const sessionToken = (await t.start(t.tokenA, 'prod-ebook-1')).body.sessionToken;
    const patch = (body: Record<string, unknown>) => t.adminReq('patch', `/api/admin/digital-access/entitlements/${entitlementId}`).send(body);

    expect((await patch({ status: 'expired' })).body.code).toBe('invalid_status');
    const suspended = await patch({ status: 'suspended', reason: 'Tinjauan manual' });
    expect(suspended.body.entitlement).toMatchObject({ status: 'suspended', revokedReason: 'Tinjauan manual', statusChangedBy: 'admin' });
    const heartbeat = await request(t.app).post('/api/access/prod-ebook-1/session/heartbeat').set('Authorization', `Bearer ${t.tokenA}`).set('X-Session-Token', sessionToken);
    expect(heartbeat.body).toMatchObject({ code: 'session_ended', endReason: 'admin' });
    expect((await t.start(t.tokenA, 'prod-ebook-1')).body.code).toBe('suspended');

    expect((await patch({ status: 'active' })).body.entitlement).toMatchObject({ status: 'active', revokedReason: null });
    expect((await t.start(t.tokenA, 'prod-ebook-1')).status).toBe(201);

    await patch({ status: 'revoked', reason: 'refund manual' });
    const library = await request(t.app).get('/api/library').set('Authorization', `Bearer ${t.tokenA}`);
    expect(library.body.items).toEqual([]);
    expect((await t.adminReq('patch', '/api/admin/digital-access/entitlements/tidak-ada').send({ status: 'active' })).status).toBe(404);
  });

  it('lepas perangkat oleh admin: sesi berakhir, tanpa jeda 30 hari untuk pengguna; akhiri semua sesi', async () => {
    const t = await setup();
    await t.grantPurchase(USER_A.id, 'prod-ebook-1');
    await t.grantPurchase(USER_A.id, 'prod-audio-1');
    await t.start(t.tokenA, 'prod-ebook-1', 1);
    // Satu sesi per pengguna: perangkat 2 mengambil alih.
    await request(t.app).post('/api/access/prod-audio-1/session/start').set('Authorization', `Bearer ${t.tokenA}`).send({ deviceId: device(2), takeover: true });
    const detail = (await t.adminReq('get', `/api/admin/digital-access/users/${USER_A.id}`)).body;
    const target = t.store.sessions.find((s) => !s.endedAt)!.deviceId!;
    const released = await t.adminReq('post', `/api/admin/digital-access/devices/${target}/release`);
    expect(released.body).toMatchObject({ released: true, sessionsEnded: 1 });
    expect((await t.adminReq('post', `/api/admin/digital-access/devices/${target}/release`)).status).toBe(409);

    // Pelepasan oleh admin tidak memicu jeda: pengguna masih bisa melepas perangkat lain sendiri.
    const own = await request(t.app).get('/api/devices').set('Authorization', `Bearer ${t.tokenA}`);
    expect(own.body.releaseAvailableAt).toBeNull();
    const other = own.body.devices[0].id;
    expect((await request(t.app).post(`/api/devices/${other}/release`).set('Authorization', `Bearer ${t.tokenA}`).send({})).status).toBe(200);

    await t.start(t.tokenA, 'prod-ebook-1', 3);
    expect((await t.adminReq('post', `/api/admin/digital-access/users/${USER_A.id}/end-sessions`)).body.sessionsEnded).toBe(1);
    expect(t.store.sessions.filter((s) => !s.endedAt)).toHaveLength(0);
  });
});
