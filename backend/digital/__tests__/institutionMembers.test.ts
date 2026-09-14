import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, mintUserToken, type TestAppOptions } from './harness';
import { isEntitlementUsable, ownsPermanently, pickEntitlement } from '../entitlements';
import { emailDomainCandidates, ipInCidr, parseEmailList } from '../institution/members';
import type { MemoryInstitutionStore } from '../institution/memoryStore';
import type { EntitlementRecord } from '../types';
import type { Phase1ProductLike } from '../memoryStore';

/**
 * Fase 4 Langkah 3 — anggota institusi (docs/PHASE-4-BRIEF 3 & 9): undangan, domain, kode, IP (flag), entitlement saat
 * bergabung/lunas, pencabutan & pengakhiran sesi, batas pengguna bersamaan, koleksi custom, urutan hak.
 */

const START = '2026-09-14T03:00:00.000Z';
const MINUTE = 60_000;
const DAY = 86_400_000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const PRODUCTS: Phase1ProductLike[] = [
  { id: 'prod-a', bookId: 'book-3', format: 'ebook', price: 99000, isActive: true, availabilityStatus: 'available', pageCount: 300, durationSeconds: null, shelfEntryDate: '2026-01-01' },
  { id: 'prod-b', bookId: 'book-24', format: 'ebook', price: 89000, isActive: true, availabilityStatus: 'available', pageCount: 200, durationSeconds: null, shelfEntryDate: '2026-02-01' }
];

type TestUser = { id: string; email: string; name: string };
const person = (n: number, email: string): TestUser => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, email, name: `Pengguna ${n}` });
const device = (n: number) => `perangkat-anggota-${n}-abcdefgh`;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const setup = async (extra: Partial<TestAppOptions> = {}) => {
  const clock = { t: Date.parse(START) };
  const t = await createTestApp({ products: PRODUCTS.map((p) => ({ ...p })), now: () => new Date(clock.t), ...extra });
  cleanups.push(t.cleanup);
  for (const p of t.products) await t.store.updateProduct(p.id, { processingStatus: 'ready' });
  const istore = t.phase2.institution!.store as MemoryInstitutionStore;
  const admin = (method: 'get' | 'post' | 'patch', path: string, body: Record<string, unknown> = {}) =>
    request(t.app)[method](path).set('x-test-admin', '1').send(body);
  const as = async (user: TestUser) => {
    const token = await mintUserToken(user);
    const auth = (r: request.Test, headers: Record<string, string>) => {
      r.set('Authorization', `Bearer ${token}`).set('User-Agent', UA);
      for (const [k, v] of Object.entries(headers)) r.set(k, v);
      return r;
    };
    return {
      user,
      get: (path: string, headers: Record<string, string> = {}) => auth(request(t.app).get(path), headers),
      post: (path: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) => auth(request(t.app).post(path), headers).send(body),
      patch: (path: string, body: Record<string, unknown> = {}) => auth(request(t.app).patch(path), {}).send(body),
      start: (productId: string, deviceNo: number, body: Record<string, unknown> = {}) => auth(request(t.app).post(`/api/access/${productId}/session/start`), {}).send({ deviceId: device(deviceNo), ...body }),
      heartbeat: (productId: string, sessionToken: string) => auth(request(t.app).post(`/api/access/${productId}/session/heartbeat`), { 'X-Session-Token': sessionToken }).send()
    };
  };
  /** Institusi + kontrak Starter (5 pengguna bersamaan, 1 kursi admin); lunas kecuali paid: false. */
  const createInstitution = async (options: { domains?: string[]; contract?: Record<string, unknown>; paid?: boolean } = {}) => {
    const created = await admin('post', '/api/admin/institution/institutions', {
      name: 'Universitas Kampus', type: 'university', contactEmail: 'kontak@kampus.ac.id', emailDomains: options.domains ?? ['kampus.ac.id']
    });
    expect(created.status).toBe(201);
    const institution = created.body.institution as { id: string; slug: string };
    const contract = await admin('post', `/api/admin/institution/institutions/${institution.id}/contracts`, { tier: 'starter', ...options.contract });
    expect(contract.status).toBe(201);
    const issued = await admin('post', `/api/admin/institution/contracts/${contract.body.contract.id}/issue`, { sendEmail: false });
    const invoiceId = issued.body.invoice.id as string;
    const pay = async () => {
      await request(t.app).post(`/api/admin/institution/invoices/${invoiceId}/proof`).set('x-test-admin', '1').attach('file', PNG, { filename: 'bukti.png', contentType: 'image/png' });
      const paid = await admin('post', `/api/admin/institution/invoices/${invoiceId}/mark-paid`, { confirm: true, method: 'transfer' });
      expect(paid.status).toBe(200);
    };
    if (options.paid !== false) await pay();
    return { institution, contractId: contract.body.contract.id as string, pay };
  };
  /** Admin CakraNexa mengundang admin institusi; undangan diterima saat pengguna membuka akunnya. */
  const makeInstitutionAdmin = async (institutionId: string, user: TestUser) => {
    const invited = await admin('post', `/api/admin/institution/institutions/${institutionId}/members/invite`, { emails: [user.email], role: 'admin' });
    expect(invited.status).toBe(201);
    const client = await as(user);
    expect((await client.get('/api/institution/me')).body.memberships).toHaveLength(1);
    return client;
  };
  const institutionEntitlements = async (userId: string) => t.store.listEntitlements({ userId, source: 'institution' });
  return { ...t, clock, istore, admin, as, createInstitution, makeInstitutionAdmin, institutionEntitlements };
};

describe('anggota institusi: undangan', () => {
  it('admin CakraNexa mengundang admin institusi; diterima otomatis hanya bila email terverifikasi; admin institusi mengundang lewat CSV', async () => {
    const t = await setup();
    const { institution } = await t.createInstitution();
    const adminUser = person(1, 'admin.perpus@kampus.ac.id');
    const invited = await t.admin('post', `/api/admin/institution/institutions/${institution.id}/members/invite`, { emails: [adminUser.email], role: 'admin' });
    expect(invited.status).toBe(201);
    expect(invited.body).toMatchObject({ invited: 1, skipped: [], invalid: [] });
    await t.phase2.idle!();
    const mail = t.mails.find((m) => m.to.includes(adminUser.email))!;
    expect(mail.subject).toBe('Undangan akses CakraNexa dari Universitas Kampus');
    expect(mail.html).toContain(`/institutions/join/${institution.slug}?invite=1`);
    expect(mail.html).toContain('admin institusi');
    // Starter: 1 kursi admin (undangan admin yang tertunda ikut dihitung).
    expect((await t.admin('post', `/api/admin/institution/institutions/${institution.id}/members/invite`, { emails: 'dosen@kampus.ac.id', role: 'admin' })).body.code).toBe('admin_seats_full');

    const client = await t.as(adminUser);
    t.store.unverifiedUsers.add(adminUser.id);
    expect((await client.get('/api/institution/me')).body).toMatchObject({ memberships: [], emailVerified: false });
    expect(await t.institutionEntitlements(adminUser.id)).toHaveLength(0);
    t.store.unverifiedUsers.delete(adminUser.id);
    const me = await client.get('/api/institution/me');
    expect(me.body.joinedNow).toEqual([institution.id]);
    expect(me.body.memberships[0]).toMatchObject({ role: 'admin', joinedVia: 'invite', access: { status: 'active', trial: false, concurrentUsers: 5, collection: 'full' } });
    expect((await t.institutionEntitlements(adminUser.id)).every((e) => isEntitlementUsable(e, new Date(t.clock.t)))).toBe(true);
    expect(await t.institutionEntitlements(adminUser.id)).toHaveLength(1);

    const list = await client.get(`/api/institution/admin/${institution.id}/members`);
    expect(list.status).toBe(200);
    expect(list.body.members[0]).toMatchObject({ email: adminUser.email, role: 'admin', status: 'active' });

    const csv = await client.post(`/api/institution/admin/${institution.id}/members/invite`, {
      emails: 'email,nama\nmhs1@kampus.ac.id,Budi Santoso\nmhs2@kampus.ac.id;bukan@email\nMHS1@kampus.ac.id',
      groupLabel: 'Prodi Akuntansi 2026'
    });
    expect(csv.status).toBe(201);
    expect(csv.body).toMatchObject({ invited: 2, invalid: ['bukan@email'] });
    expect((await client.post(`/api/institution/admin/${institution.id}/members/invite`, { emails: 'mhs1@kampus.ac.id' })).body.skipped).toEqual([{ email: 'mhs1@kampus.ac.id', reason: 'already_invited' }]);
    const invitedList = (await client.get(`/api/institution/admin/${institution.id}/members?status=invited`)).body.members;
    expect(invitedList.map((m: any) => m.email).sort()).toEqual(['mhs1@kampus.ac.id', 'mhs2@kampus.ac.id']);
    expect(invitedList[0].groupLabel).toBe('Prodi Akuntansi 2026');

    const outsider = await t.as(person(9, 'luar@gmail.com'));
    expect((await outsider.get(`/api/institution/admin/${institution.id}/members`)).body.code).toBe('not_institution_admin');
    expect((await client.patch(`/api/institution/admin/${institution.id}/members/${list.body.members[0].id}`, { status: 'disabled' })).body.code).toBe('cannot_disable_self');
  });

  it('kontrak belum lunas: anggota undangan belum punya akses, domain belum bisa dipakai; setelah lunas semua anggota aktif mendapat entitlement', async () => {
    const t = await setup();
    const { institution, pay } = await t.createInstitution({ paid: false });
    const users = [person(21, 'a@kampus.ac.id'), person(22, 'b@kampus.ac.id')];
    await t.admin('post', `/api/admin/institution/institutions/${institution.id}/members/invite`, { emails: users.map((u) => u.email) });
    for (const u of users) {
      const me = await (await t.as(u)).get('/api/institution/me');
      expect(me.body.memberships[0]).toMatchObject({ access: null });
      expect(await t.institutionEntitlements(u.id)).toHaveLength(0);
    }
    expect((await (await t.as(person(23, 'c@kampus.ac.id'))).post('/api/institution/join/domain', { slug: institution.slug })).body.code).toBe('institution_inactive');
    expect((await (await t.as(users[0])).start('prod-a', 1)).status).toBe(403);

    await pay();
    for (const u of users) expect(await t.institutionEntitlements(u.id)).toHaveLength(1);
    expect((await (await t.as(users[0])).start('prod-a', 1)).status).toBe(201);
  });
});

describe('anggota institusi: domain & kode gabung', () => {
  it('domain (termasuk subdomain) terverifikasi; domain lain & email belum terverifikasi ditolak; kode dengan kuota & batas waktu', async () => {
    const t = await setup();
    const { institution } = await t.createInstitution();
    const mhs = await t.as(person(2, 'mhs@kampus.ac.id'));
    const joined = await mhs.post('/api/institution/join/domain', { slug: institution.slug });
    expect(joined.status).toBe(201);
    expect(joined.body.institution).toMatchObject({ slug: institution.slug, name: 'Universitas Kampus' });
    expect((await mhs.post('/api/institution/join/domain', { slug: institution.slug })).status).toBe(200);
    expect(await t.institutionEntitlements(mhs.user.id)).toHaveLength(1);
    expect((await (await t.as(person(3, 'dosen@fe.kampus.ac.id'))).post('/api/institution/join/domain', { slug: institution.slug })).status).toBe(201);

    const outsider = await (await t.as(person(4, 'orang@gmail.com'))).post('/api/institution/join/domain', { slug: institution.slug });
    expect(outsider.status).toBe(403);
    expect(outsider.body).toMatchObject({ code: 'domain_mismatch', domains: ['kampus.ac.id'] });
    const unverified = person(5, 'baru@kampus.ac.id');
    t.store.unverifiedUsers.add(unverified.id);
    expect((await (await t.as(unverified)).post('/api/institution/join/domain', { slug: institution.slug })).body.code).toBe('email_unverified');
    expect((await (await t.as(person(6, 'calon@kampus.ac.id'))).get('/api/institution/me')).body.domainOffers).toEqual([expect.objectContaining({ slug: institution.slug })]);
    expect((await request(t.app).get(`/api/institution/public/${institution.slug}`)).body).toMatchObject({ name: 'Universitas Kampus', joinable: true, domains: ['kampus.ac.id'], ipAccess: false });

    const admin = await t.makeInstitutionAdmin(institution.id, person(1, 'admin.perpus@kampus.ac.id'));
    const code = await admin.post(`/api/institution/admin/${institution.id}/codes`, { code: 'AKUN-2026', maxUses: 1, expiresOn: '2026-12-31', groupLabel: 'Akuntansi' });
    expect(code.status).toBe(201);
    expect(code.body.code).toMatchObject({ code: 'AKUN-2026', maxUses: 1, usedCount: 0, groupLabel: 'Akuntansi' });
    expect((await admin.post(`/api/institution/admin/${institution.id}/codes`, { code: 'akun-2026' })).body.code).toBe('code_taken');

    const x = await t.as(person(7, 'x@gmail.com'));
    expect((await x.post('/api/institution/join/code', { code: ' akun-2026 ' })).status).toBe(201);
    expect((await x.post('/api/institution/join/code', { code: 'AKUN-2026' })).status).toBe(200); // sudah anggota: kuota tidak dipakai
    expect((await admin.get(`/api/institution/admin/${institution.id}/codes`)).body.codes[0].usedCount).toBe(1);
    const members = (await admin.get(`/api/institution/admin/${institution.id}/members?q=x@gmail`)).body.members;
    expect(members[0]).toMatchObject({ email: 'x@gmail.com', joinedVia: 'code', groupLabel: 'Akuntansi' });

    const y = await t.as(person(8, 'y@gmail.com'));
    expect((await y.post('/api/institution/join/code', { code: 'AKUN-2026' })).body.code).toBe('code_unavailable');
    await admin.post(`/api/institution/admin/${institution.id}/codes`, { code: 'LAMA-2026', expiresOn: '2026-09-15' });
    t.clock.t += 2 * DAY;
    expect((await y.post('/api/institution/join/code', { code: 'LAMA-2026' })).body.code).toBe('code_unavailable');
    expect((await y.post('/api/institution/join/code', { code: 'TIDAK-ADA' })).body.code).toBe('code_not_found');
    const off = await admin.post(`/api/institution/admin/${institution.id}/codes`, { code: 'DOSEN-2026' });
    await admin.post(`/api/institution/admin/${institution.id}/codes/${off.body.code.id}/disable`);
    expect((await y.post('/api/institution/join/code', { code: 'DOSEN-2026' })).body.code).toBe('code_unavailable');
  });
});

describe('anggota institusi: akses & pengguna bersamaan', () => {
  it('Starter 5 slot: anggota ke-6 dapat 429 institution_busy; anggota berlangganan individu tidak memakan slot; judul kedua dihitung sekali; slot lepas setelah heartbeat habis', async () => {
    const t = await setup();
    const { institution } = await t.createInstitution();
    const clients: Array<Awaited<ReturnType<typeof t.as>>> = [];
    for (let n = 1; n <= 7; n += 1) {
      const client = await t.as(person(30 + n, `anggota${n}@kampus.ac.id`));
      expect((await client.post('/api/institution/join/domain', { slug: institution.slug })).status).toBe(201);
      clients.push(client);
    }
    // Anggota ke-7 juga punya keanggotaan individu aktif.
    await t.store.insertEntitlements([{
      userId: clients[6].user.id, productId: null, scope: 'shelf', source: 'membership', sourceRef: 'langganan-individu',
      startsAt: new Date(t.clock.t - DAY).toISOString(), endsAt: new Date(t.clock.t + 30 * DAY).toISOString(), maxDevices: 2
    }]);

    const tokens: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const started = await clients[i].start('prod-a', i);
      expect(started.status).toBe(201);
      expect(started.body.entitlement.source).toBe('institution');
      tokens.push(started.body.sessionToken);
    }
    const busy = await clients[5].start('prod-a', 5);
    expect(busy.status).toBe(429);
    expect(busy.body).toMatchObject({ code: 'institution_busy', inUse: 5, capacity: 5 });
    expect(busy.body.error).toContain('(5/5)');
    const denied = t.store.logs.filter((l) => l.action === 'denied' && (l.meta as any)?.reason === 'institution_busy');
    expect(denied).toHaveLength(1);
    expect(denied[0].meta).toMatchObject({ institution_id: institution.id, in_use: 5, capacity: 5 });

    const individual = await clients[6].start('prod-a', 6);
    expect(individual.status).toBe(201);
    expect(individual.body.entitlement.source).toBe('membership');
    expect(t.store.sessions.find((s) => s.userId === clients[6].user.id)!.institutionId).toBeNull();
    expect((await clients[5].start('prod-a', 5)).status).toBe(429);

    // Anggota yang sudah memakai slot boleh membuka judul lain (dihitung sekali).
    expect((await clients[0].start('prod-b', 0)).status).toBe(201);
    expect(t.store.sessions.filter((s) => s.institutionId === institution.id && !s.endedAt)).toHaveLength(6);

    // 90 detik: anggota 1–4 mengirim heartbeat, anggota 5 tidak. 40 detik kemudian sesi anggota 5 habis (>2 menit).
    t.clock.t += 90_000;
    for (let i = 0; i < 4; i += 1) expect((await clients[i].heartbeat('prod-a', tokens[i])).status).toBe(200);
    t.clock.t += 40_000;
    const sixth = await clients[5].start('prod-a', 5);
    expect(sixth.status).toBe(201);
    expect(sixth.body.entitlement.source).toBe('institution');
  });

  it('koleksi custom: anggota hanya membuka judul yang dipilih di kontrak', async () => {
    const t = await setup();
    const { institution } = await t.createInstitution({ contract: { collectionScope: 'custom', productIds: ['prod-a'] } });
    const member = await t.as(person(40, 'pembaca@kampus.ac.id'));
    await member.post('/api/institution/join/domain', { slug: institution.slug });
    expect((await member.start('prod-a', 1)).status).toBe(201);
    const outside = await member.start('prod-b', 1);
    expect(outside.status).toBe(403);
    expect(outside.body.code).toBe('no_entitlement');
  });

  it('dinonaktifkan admin: entitlement dicabut, sesi berjalan diakhiri, tidak bisa bergabung ulang sendiri; keluar sendiri bisa bergabung lagi', async () => {
    const t = await setup();
    const { institution } = await t.createInstitution();
    const admin = await t.makeInstitutionAdmin(institution.id, person(1, 'admin.perpus@kampus.ac.id'));
    const a = await t.as(person(50, 'a@kampus.ac.id'));
    const b = await t.as(person(51, 'b@kampus.ac.id'));
    await a.post('/api/institution/join/domain', { slug: institution.slug });
    await b.post('/api/institution/join/domain', { slug: institution.slug });
    const session = await a.start('prod-a', 1);
    expect(session.status).toBe(201);

    const memberA = (await admin.get(`/api/institution/admin/${institution.id}/members?q=a@kampus`)).body.members[0];
    const disabled = await admin.patch(`/api/institution/admin/${institution.id}/members/${memberA.id}`, { status: 'disabled' });
    expect(disabled.body.member).toMatchObject({ status: 'disabled', disabledBy: 'admin' });
    expect((await t.institutionEntitlements(a.user.id)).map((e) => e.status)).toEqual(['revoked']);
    expect(t.store.sessions.find((s) => s.userId === a.user.id)).toMatchObject({ endReason: 'revoked' });
    expect((await a.heartbeat('prod-a', session.body.sessionToken)).body.code).toBe('session_ended');
    expect((await a.post('/api/institution/join/domain', { slug: institution.slug })).body.code).toBe('member_disabled');
    expect((await a.get('/api/institution/me')).body.domainOffers).toEqual([]);

    // Admin mengaktifkan kembali: baris entitlement yang sama aktif lagi.
    await admin.patch(`/api/institution/admin/${institution.id}/members/${memberA.id}`, { status: 'active' });
    expect((await t.institutionEntitlements(a.user.id)).map((e) => e.status)).toEqual(['active']);

    expect((await b.post(`/api/institution/${institution.id}/leave`, { confirm: true })).status).toBe(200);
    expect((await t.institutionEntitlements(b.user.id))[0].status).toBe('revoked');
    expect((await b.get('/api/institution/me')).body).toMatchObject({ memberships: [], domainOffers: [expect.objectContaining({ slug: institution.slug })] });
    expect((await b.post('/api/institution/join/domain', { slug: institution.slug })).status).toBe(201);
    expect((await t.institutionEntitlements(b.user.id)).map((e) => e.status)).toEqual(['active']);
  });

  it('batas perangkat anggota institusi = 2', async () => {
    const t = await setup();
    const { institution } = await t.createInstitution();
    const member = await t.as(person(60, 'perangkat@kampus.ac.id'));
    await member.post('/api/institution/join/domain', { slug: institution.slug });
    expect((await member.start('prod-a', 1)).status).toBe(201);
    expect((await member.start('prod-a', 2, { takeover: true })).status).toBe(201);
    const third = await member.start('prod-a', 3, { takeover: true });
    expect(third.status).toBe(403);
    expect(third.body).toMatchObject({ code: 'device_limit', maxDevices: 2 });
  });
});

describe('anggota institusi: akses jaringan (ENABLE_IP_ACCESS)', () => {
  it('flag mati -> 404; flag hidup -> anggota tamu 4 jam dari IP kampus, IP lain ditolak', async () => {
    const off = await setup();
    const offInstitution = (await off.createInstitution()).institution;
    await off.istore.updateInstitution(offInstitution.id, { ipRanges: ['10.20.0.0/16'] });
    const offGuest = await off.as(person(70, 'tamu@gmail.com'));
    expect((await offGuest.post('/api/institution/join/ip', {}, { 'X-Forwarded-For': '10.20.3.4' })).body.code).toBe('ip_access_disabled');

    const t = await setup({ env: { ENABLE_IP_ACCESS: 'true' } });
    const { institution } = await t.createInstitution();
    await t.istore.updateInstitution(institution.id, { ipRanges: ['10.20.0.0/16', '2001:db8::/32'] });
    const guest = await t.as(person(71, 'tamu@gmail.com'));
    expect((await guest.post('/api/institution/join/ip', {}, { 'X-Forwarded-For': '192.168.1.5' })).body.code).toBe('ip_not_recognized');
    const joined = await guest.post('/api/institution/join/ip', {}, { 'X-Forwarded-For': '10.20.3.4' });
    expect(joined.status).toBe(201);
    const expiresAt = new Date(Date.parse(START) + 4 * 3_600_000).toISOString();
    expect(joined.body.expiresAt).toBe(expiresAt);
    expect((await t.institutionEntitlements(guest.user.id))[0].endsAt).toBe(expiresAt);
    expect((await request(t.app).get(`/api/institution/public/${institution.slug}`)).body.ipAccess).toBe(true);
    // Tamu dihitung dalam slot bersamaan seperti anggota lain.
    expect((await guest.start('prod-a', 1)).body.entitlement.source).toBe('institution');
    t.clock.t += 4 * 3_600_000 + MINUTE;
    expect((await guest.get('/api/institution/me')).body.memberships).toEqual([]);
  });
});

describe('urutan hak & utilitas', () => {
  const now = new Date(START);
  const row = (over: Partial<EntitlementRecord>): EntitlementRecord => ({
    id: Math.random().toString(36).slice(2), userId: 'u', productId: null, scope: 'shelf', source: 'membership', sourceRef: null, status: 'active',
    startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-12-31T00:00:00.000Z', maxDevices: 2, revokedReason: null, statusChangedAt: null, statusChangedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z', ...over
  });

  it('permanen -> individu -> institusi (institusi hanya bila tidak ada hak lain); lisensi institusi bukan milik pengguna', () => {
    const institution = row({ source: 'institution', endsAt: '2027-12-31T00:00:00.000Z' });
    const membership = row({ source: 'membership', endsAt: '2026-10-01T00:00:00.000Z' });
    const purchase = row({ source: 'purchase', scope: 'product', productId: 'p', endsAt: null });
    expect(pickEntitlement([institution, membership, purchase], now).entitlement).toBe(purchase);
    expect(pickEntitlement([institution, membership], now).entitlement).toBe(membership);
    expect(pickEntitlement([institution], now).entitlement).toBe(institution);
    expect(ownsPermanently([row({ source: 'institution', scope: 'product', productId: 'p', endsAt: null })], now)).toBe(false);
    expect(ownsPermanently([purchase], now)).toBe(true);
  });

  it('daftar email CSV, domain induk, dan pencocokan CIDR', () => {
    expect(parseEmailList('email,nama\nA@x.ac.id,Budi\nb@x.ac.id; salah@email\n a@x.ac.id ')).toEqual({ valid: ['a@x.ac.id', 'b@x.ac.id'], invalid: ['salah@email'] });
    expect(emailDomainCandidates('mhs@fe.ui.ac.id')).toEqual(['fe.ui.ac.id', 'ui.ac.id', 'ac.id']);
    expect([ipInCidr('10.20.3.4', '10.20.0.0/16'), ipInCidr('10.21.0.1', '10.20.0.0/16'), ipInCidr('::ffff:10.20.9.9', '10.20.0.0/16')]).toEqual([true, false, true]);
    expect([ipInCidr('2001:db8:abcd::1', '2001:db8::/32'), ipInCidr('2001:db9::1', '2001:db8::/32'), ipInCidr('1.2.3.4', '1.2.3.4')]).toEqual([true, false, true]);
  });
});
