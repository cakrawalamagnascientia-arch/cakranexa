import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createTestApp, mintUserToken, USER_A, USER_B } from './harness';
import type { NewEntitlement } from '../types';

const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const device = (n: number) => `perangkat-uji-${n}-abcdefghij`;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

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
  const iso = (offsetMs: number) => new Date(clock.now.getTime() + offsetMs).toISOString();
  const grant = async (userId: string, productId: string, extra: Partial<NewEntitlement> = {}) => {
    await t.store.insertEntitlements([{ userId, productId, source: 'purchase', sourceRef: `uji-${crypto.randomUUID()}`, startsAt: iso(-MINUTE), ...extra }]);
    return t.store.entitlements[t.store.entitlements.length - 1];
  };
  const start = (token: string, productId: string, deviceId: string, body: Record<string, unknown> = {}, ua = UA_WINDOWS) =>
    request(t.app).post(`/api/access/${productId}/session/start`).set('Authorization', `Bearer ${token}`).set('User-Agent', ua).send({ deviceId, ...body });
  const heartbeat = (token: string, productId: string, sessionToken?: string) => {
    const req = request(t.app).post(`/api/access/${productId}/session/heartbeat`).set('Authorization', `Bearer ${token}`);
    if (sessionToken) req.set('X-Session-Token', sessionToken);
    return req.send();
  };
  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  const deniedReasons = () => t.store.logs
    .filter((l) => l.action === 'denied')
    .map((l) => (l.meta as Record<string, unknown> | undefined)?.reason);
  return { ...t, tokenA, tokenB, iso, grant, start, heartbeat, advance, deniedReasons };
};

describe('akses: requireEntitlement', () => {
  it('menolak dengan kode alasan + info produk; entitlement dari sumber apa pun berlaku', async () => {
    const t = await setup();
    const none = await t.start(t.tokenA, 'prod-ebook-1', device(1));
    expect(none.status).toBe(403);
    expect(none.body).toMatchObject({ code: 'no_entitlement', reason: 'no_entitlement', product: { id: 'prod-ebook-1', format: 'ebook', purchasable: true } });
    const soon = await t.start(t.tokenA, 'prod-soon', device(1));
    expect(soon.body).toMatchObject({ code: 'no_entitlement', product: { purchasable: false } });

    await t.grant(USER_A.id, 'prod-ebook-1', { source: 'membership', startsAt: t.iso(-10 * DAY), endsAt: t.iso(-DAY) });
    expect((await t.start(t.tokenA, 'prod-ebook-1', device(1))).body.code).toBe('expired');

    // Penangguhan menang atas kedaluwarsa (pembeli perlu menghubungi admin, bukan membeli ulang).
    const bought = await t.grant(USER_A.id, 'prod-ebook-1');
    await t.store.updateEntitlements([bought.id], { status: 'suspended', statusChangedBy: 'admin' });
    expect((await t.start(t.tokenA, 'prod-ebook-1', device(1))).body.code).toBe('suspended');

    await t.grant(USER_A.id, 'prod-audio-1', { source: 'membership', endsAt: t.iso(30 * DAY) });
    const ok = await t.start(t.tokenA, 'prod-audio-1', device(1));
    expect(ok.status).toBe(201);
    expect(ok.body.entitlement.source).toBe('membership');
    expect(ok.body.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ok.headers['cache-control']).toMatch(/no-store/);
    // Server hanya menyimpan hash token.
    expect(t.store.sessions[0].tokenHash).not.toBe(ok.body.sessionToken);
    expect(t.deniedReasons()).toEqual(['no_entitlement', 'no_entitlement', 'expired', 'suspended']);
    // Penolakan hak akses tidak mendaftarkan perangkat.
    expect(t.store.devices).toHaveLength(1);
  });

  it('validasi login, produk, dan ID perangkat', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    expect((await request(t.app).post('/api/access/prod-ebook-1/session/start').send({ deviceId: device(1) })).status).toBe(401);
    expect((await t.start(t.tokenA, 'tidak-ada', device(1))).body.code).toBe('product_not_found');
    expect((await t.start(t.tokenA, 'prod-ebook-1', 'pendek')).body.code).toBe('invalid_device');
  });
});

describe('akses: perangkat', () => {
  it('batas 2 perangkat per user untuk semua sumber hak (fase 6), berapa pun max_devices entitlement', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1'); // max_devices 2
    expect((await t.start(t.tokenA, 'prod-ebook-1', device(1))).status).toBe(201);
    expect((await t.start(t.tokenA, 'prod-ebook-1', device(2), { takeover: true })).status).toBe(201);
    const third = await t.start(t.tokenA, 'prod-ebook-1', device(3), { takeover: true });
    expect(third.status).toBe(403);
    expect(third.body).toMatchObject({ code: 'device_limit', maxDevices: 2 });
    expect(third.body.devices).toHaveLength(2);
    expect(third.body.devices[0]).toMatchObject({ label: 'Chrome · Windows', isCurrent: false });

    // Entitlement dengan max_devices lebih besar (berlaku atau tidak) tidak menaikkan batas.
    await t.grant(USER_A.id, 'prod-audio-1', { source: 'admin_grant', maxDevices: 5, startsAt: t.iso(-10 * DAY), endsAt: t.iso(-DAY) });
    await t.grant(USER_A.id, 'prod-ebook-2', { source: 'admin_grant', maxDevices: 3, endsAt: t.iso(30 * DAY) });
    expect((await t.start(t.tokenA, 'prod-ebook-1', device(3), { takeover: true })).body).toMatchObject({ code: 'device_limit', maxDevices: 2 });
    const fourth = await t.start(t.tokenA, 'prod-ebook-2', device(4));
    expect(fourth.body).toMatchObject({ code: 'device_limit', maxDevices: 2 });
    expect(t.deniedReasons().filter((r) => r === 'device_limit')).toHaveLength(3);

    // Perangkat user lain tidak ikut dihitung.
    await t.grant(USER_B.id, 'prod-ebook-1');
    expect((await t.start(t.tokenB, 'prod-ebook-1', device(9))).status).toBe(201);
  });

  it('lepas perangkat mengakhiri sesinya; pengguna hanya boleh melepas sekali per 30 hari', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    await t.grant(USER_A.id, 'prod-audio-1');
    const s1 = (await t.start(t.tokenA, 'prod-ebook-1', device(1))).body.sessionToken;
    // Satu sesi per pengguna: judul lain di perangkat lain -> 409 kecuali takeover.
    expect((await t.start(t.tokenA, 'prod-audio-1', device(2), {}, UA_ANDROID)).body).toMatchObject({ code: 'session_conflict', takeover: true });
    const s2 = (await t.start(t.tokenA, 'prod-audio-1', device(2), { takeover: true }, UA_ANDROID)).body.sessionToken;
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-1', s1)).body).toMatchObject({ code: 'session_ended', endReason: 'takeover' });

    const list = await request(t.app).get(`/api/devices?current=${device(1)}`).set('Authorization', `Bearer ${t.tokenA}`);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ maxDevices: 2, releaseAvailableAt: null, cooldownDays: 30 });
    expect(list.body.devices).toHaveLength(2);
    const current = list.body.devices.find((d: { isCurrent: boolean }) => d.isCurrent);
    const phone = list.body.devices.find((d: { isCurrent: boolean }) => !d.isCurrent);
    expect(current.label).toBe('Chrome · Windows');
    expect(phone.label).toBe('Chrome · Android');
    // ID perangkat mentah maupun hash-nya tidak pernah dikembalikan.
    expect(JSON.stringify(list.body)).not.toContain(device(1));
    expect(JSON.stringify(list.body)).not.toMatch(/fingerprint/i);

    const release = (token: string, id: string) =>
      request(t.app).post(`/api/devices/${id}/release`).set('Authorization', `Bearer ${token}`).send({ currentDeviceId: device(1) });
    expect((await release(t.tokenB, phone.id)).status).toBe(404);
    const released = await release(t.tokenA, phone.id);
    expect(released.status).toBe(200);
    expect(released.body.devices).toHaveLength(1);
    expect(released.body.devices[0].isCurrent).toBe(true);
    expect(Date.parse(released.body.releaseAvailableAt)).toBe(Date.parse(t.iso(30 * DAY)));

    const hb2 = await t.heartbeat(t.tokenA, 'prod-audio-1', s2);
    expect(hb2.status).toBe(401);
    expect(hb2.body).toMatchObject({ code: 'session_ended', endReason: 'device_released' });
    expect((await t.start(t.tokenA, 'prod-ebook-1', device(1))).status).toBe(201);

    const again = await release(t.tokenA, current.id);
    expect(again.status).toBe(429);
    expect(again.body.code).toBe('release_cooldown');

    t.advance(31 * DAY);
    expect((await release(t.tokenA, current.id)).status).toBe(200);
    // Slot kosong: perangkat baru boleh masuk.
    expect((await t.start(t.tokenA, 'prod-ebook-1', device(3))).status).toBe(201);
  });
});

describe('akses: satu sesi aktif per produk', () => {
  it('perangkat lain -> 409 session_conflict; takeover mengakhiri sesi lama; perangkat sama membuka ulang', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    const s1 = (await t.start(t.tokenA, 'prod-ebook-1', device(1))).body.sessionToken;
    const conflict = await t.start(t.tokenA, 'prod-ebook-1', device(2), {}, UA_ANDROID);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: 'session_conflict', takeover: true, activeSession: { deviceLabel: 'Chrome · Windows' } });

    const s2 = (await t.start(t.tokenA, 'prod-ebook-1', device(2), { takeover: true }, UA_ANDROID)).body.sessionToken;
    const hb1 = await t.heartbeat(t.tokenA, 'prod-ebook-1', s1);
    expect(hb1.status).toBe(401);
    expect(hb1.body).toMatchObject({ code: 'session_ended', endReason: 'takeover' });
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-1', s2)).status).toBe(200);

    // Perangkat yang sama (mis. muat ulang halaman) mengganti sesinya sendiri tanpa dialog.
    expect((await t.start(t.tokenA, 'prod-ebook-1', device(2), {}, UA_ANDROID)).status).toBe(201);
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-1', s2)).body.endReason).toBe('reopened');
    expect(t.store.sessions.filter((s) => !s.endedAt)).toHaveLength(1);
    expect(t.store.logs.filter((l) => l.action === 'session_start')).toHaveLength(3);
  });

  it('sesi tanpa heartbeat lebih dari 2 menit berakhir otomatis', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    const s1 = (await t.start(t.tokenA, 'prod-ebook-1', device(1))).body.sessionToken;
    t.advance(3 * MINUTE);
    const s2 = await t.start(t.tokenA, 'prod-ebook-1', device(2));
    expect(s2.status).toBe(201);
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-1', s1)).body).toMatchObject({ code: 'session_ended', endReason: 'expired' });

    t.advance(MINUTE);
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-1', s2.body.sessionToken)).status).toBe(200);
    t.advance(90 * 1000);
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-1', s2.body.sessionToken)).status).toBe(200);
    t.advance(2 * MINUTE + 1000);
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-1', s2.body.sessionToken)).body).toMatchObject({ code: 'session_ended', endReason: 'expired' });
  });

  it('sendBeacon: /session/end menerima token di body text/plain tanpa Authorization', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    const s1 = (await t.start(t.tokenA, 'prod-ebook-1', device(1))).body.sessionToken;
    const end = await request(t.app).post('/api/access/prod-ebook-1/session/end')
      .set('Content-Type', 'text/plain').send(JSON.stringify({ sessionToken: s1 }));
    expect(end.status).toBe(204);
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-1', s1)).body).toMatchObject({ code: 'session_ended', endReason: 'closed' });
    expect(t.store.logs.filter((l) => l.action === 'session_end')).toHaveLength(1);
    // Token palsu tetap 204: endpoint ini tidak membocorkan apakah sebuah token ada.
    const fake = await request(t.app).post('/api/access/prod-ebook-1/session/end')
      .set('Content-Type', 'text/plain').send('{"sessionToken":"palsu"}');
    expect(fake.status).toBe(204);
  });

  it('entitlement yang ditangguhkan atau berakhir di tengah sesi langsung menghentikan sesi', async () => {
    const t = await setup();
    const bought = await t.grant(USER_A.id, 'prod-ebook-1');
    const s1 = (await t.start(t.tokenA, 'prod-ebook-1', device(1))).body.sessionToken;
    await t.store.updateEntitlements([bought.id], { status: 'suspended', statusChangedBy: 'anomaly' });
    const hb = await t.heartbeat(t.tokenA, 'prod-ebook-1', s1);
    expect(hb.status).toBe(403);
    expect(hb.body).toMatchObject({ code: 'suspended', product: { id: 'prod-ebook-1' } });
    expect(t.store.sessions[0].endReason).toBe('revoked');
    expect(t.store.sessions[0].endedAt).toBeTruthy();

    await t.grant(USER_A.id, 'prod-ebook-2', { source: 'membership', endsAt: t.iso(MINUTE) });
    const s2 = (await t.start(t.tokenA, 'prod-ebook-2', device(1))).body.sessionToken;
    t.advance(90 * 1000);
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-2', s2)).body.code).toBe('expired');
  });

  it('token sesi terikat ke user dan produk', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    await t.grant(USER_A.id, 'prod-audio-1');
    await t.grant(USER_B.id, 'prod-ebook-1');
    const sA = (await t.start(t.tokenA, 'prod-ebook-1', device(1))).body.sessionToken;
    expect((await t.heartbeat(t.tokenB, 'prod-ebook-1', sA)).body.code).toBe('session_invalid');
    expect((await t.heartbeat(t.tokenA, 'prod-audio-1', sA)).body.code).toBe('session_invalid');
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-1')).body.code).toBe('session_required');
    expect((await t.heartbeat(t.tokenA, 'prod-ebook-1', sA)).status).toBe(200);
  });

  it('rate limit per user (heartbeat 10/menit) tidak memengaruhi user lain', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    await t.grant(USER_B.id, 'prod-ebook-1');
    const sA = (await t.start(t.tokenA, 'prod-ebook-1', device(1))).body.sessionToken;
    const sB = (await t.start(t.tokenB, 'prod-ebook-1', device(2))).body.sessionToken;
    for (let i = 0; i < 10; i++) expect((await t.heartbeat(t.tokenA, 'prod-ebook-1', sA)).status).toBe(200);
    const limited = await t.heartbeat(t.tokenA, 'prod-ebook-1', sA);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('rate_limited');
    expect((await t.heartbeat(t.tokenB, 'prod-ebook-1', sB)).status).toBe(200);
    expect(t.deniedReasons()).toContain('rate_limited');
  });
});

describe('Pustaka Saya', () => {
  it('daftar produk + status akses + progres, tanpa data penyimpanan; yang dicabut disembunyikan', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    const audio = await t.grant(USER_A.id, 'prod-audio-1');
    const refunded = await t.grant(USER_A.id, 'prod-ebook-2');
    await t.store.updateEntitlements([audio.id], { status: 'suspended', statusChangedBy: 'admin' });
    await t.store.updateEntitlements([refunded.id], { status: 'revoked', revokedReason: 'refund', statusChangedBy: 'webhook' });
    await t.store.upsertProgress(USER_A.id, 'prod-ebook-1', { position: 12, percent: 42 });
    await t.store.updateProduct('prod-ebook-1', { storagePath: 'ebooks/prod-ebook-1', processingStatus: 'ready' });

    expect((await request(t.app).get('/api/library')).status).toBe(401);
    const res = await request(t.app).get('/api/library').set('Authorization', `Bearer ${t.tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { productId: string }) => i.productId)).toEqual(['prod-ebook-1', 'prod-audio-1']);
    expect(res.body.items[0]).toMatchObject({
      format: 'ebook',
      title: 'Reformulasi Mekanisme PPN',
      slug: 'reformulasi-mekanisme-ppn',
      ready: true,
      access: { status: 'active', entitlement: { source: 'purchase', endsAt: null } },
      progress: { position: 12, percent: 42 }
    });
    expect(res.body.items[1].access.status).toBe('suspended');
    expect(res.body.devices).toEqual({ count: 0, max: 2 });
    expect(JSON.stringify(res.body)).not.toMatch(/storagePath|ebooks\/|source\.pdf|m3u8|digital-assets/);

    const other = await request(t.app).get('/api/library').set('Authorization', `Bearer ${t.tokenB}`);
    expect(other.body.items).toEqual([]);
  });

  it('penjaga hapus produk fase 1: hasEntitlements', async () => {
    const t = await setup();
    await t.grant(USER_A.id, 'prod-ebook-1');
    expect(await t.phase2.hasEntitlements!('prod-ebook-1')).toBe(true);
    expect(await t.phase2.hasEntitlements!('prod-soon')).toBe(false);
  });
});
