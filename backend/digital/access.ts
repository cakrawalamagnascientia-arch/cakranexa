import express, { type Request, type RequestHandler, type Router } from 'express';
import { asyncRoute, ConflictError, httpError } from './errors';
import { clientInfo, type DigitalContext } from './context';
import { maxDevicesForUser, pickEntitlement, resolveEntitlement, type AccessDenialReason } from './entitlements';
import { hashFingerprint, hashToken, newSessionToken } from './tokens';
import { createUserRateLimiter } from './rateLimits';
import type { DeviceRecord, EntitlementRecord, ProductRecord, SessionRecord } from './types';
import type { AudioQuota } from './membership/quota';

/**
 * Lapisan akses fase 2 (dipakai reader & player di langkah 5–6):
 *  - requireEntitlement: hak akses dari tabel entitlements (sumber apa pun). Ditolak -> 403 dengan kode alasan
 *    no_entitlement | suspended | expired + info produk, agar frontend mengarahkan ke pembelian atau /membership.
 *  - Perangkat dihitung per USER; batas 2 untuk semua paket dan instansi (fase 6). Perangkat baru di atas batas ->
 *    403 device_limit + daftar perangkat. Pengguna boleh melepas 1 perangkat per 30 hari.
 *  - Sesi: satu sesi aktif per USER (fase 6, termasuk anggota instansi). Membuka judul lain di perangkat yang sama
 *    menutup sesi sebelumnya; perangkat lain -> 409 session_conflict (takeover: true); takeover mengakhiri sesi lama.
 *    Heartbeat tiap 30 dtk; tanpa heartbeat 2 menit = berakhir.
 *  - Audiobook lewat paket berbatas jam: kuota habis -> 403 audio_quota_exhausted (tawaran upgrade).
 *  - requireSession: X-Session-Token (hanya hash-nya di DB) + entitlement dicek ulang di setiap permintaan.
 */

export const HEARTBEAT_INTERVAL_MS = 30_000;
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Supabase memakai UUID; store memori (tes/dev) memakai id sederhana. Id tidak valid = 404, bukan error SQL. */
export const isValidRecordId = (ctx: DigitalContext, id: string): boolean =>
  (ctx.store.kind === 'supabase' ? UUID_RE : LOCAL_ID_RE).test(id);

const DENIAL_MESSAGES: Record<AccessDenialReason, string> = {
  no_entitlement: 'Anda belum memiliki akses ke produk ini.',
  suspended: 'Akses produk ini sedang ditangguhkan. Hubungi kami untuk bantuan.',
  expired: 'Masa akses produk ini telah berakhir.'
};

const publicProduct = (product: ProductRecord) => ({
  id: product.id,
  format: product.format,
  bookId: product.bookId,
  purchasable: product.isActive && product.availabilityStatus === 'available' && product.price > 0
});

const publicEntitlement = (e: EntitlementRecord) => ({
  id: e.id,
  scope: e.scope,
  source: e.source,
  status: e.status,
  startsAt: e.startsAt,
  endsAt: e.endsAt
});

const denyAccess = (ctx: DigitalContext, req: Request, userId: string, product: ProductRecord, reason: AccessDenialReason, sessionId?: string) => {
  const { ip, userAgent } = clientInfo(req);
  ctx.log({ userId, productId: product.id, sessionId: sessionId ?? null, action: 'denied', ip, userAgent, meta: { reason } });
  return httpError(403, reason, DENIAL_MESSAGES[reason], { reason, product: publicProduct(product) });
};

/** Ringkasan kuota audio untuk browser (detik). */
export const publicAudioQuota = (q: AudioQuota) => ({
  limitSeconds: q.limitSeconds,
  usedSeconds: Math.min(q.usedSeconds, q.limitSeconds),
  remainingSeconds: q.remainingSeconds,
  resetsAt: q.resetsAt,
  exhausted: q.exhausted
});

export const audioQuotaExhausted = (ctx: DigitalContext, req: Request, userId: string, product: ProductRecord, quota: AudioQuota) => {
  const { ip, userAgent } = clientInfo(req);
  ctx.log({ userId, productId: product.id, action: 'denied', ip, userAgent, meta: { reason: 'audio_quota_exhausted', used_seconds: quota.usedSeconds, limit_seconds: quota.limitSeconds } });
  return httpError(403, 'audio_quota_exhausted', 'Jam audio paket Anda bulan ini sudah habis.', {
    reason: 'audio_quota_exhausted',
    upgrade: true,
    audioQuota: publicAudioQuota(quota),
    product: publicProduct(product)
  });
};

/** Produk dicari tanpa syarat aktif/tersedia: pemilik tetap bisa membuka produk yang dinonaktifkan dari katalog. */
const loadProduct = async (ctx: DigitalContext, productId: string): Promise<ProductRecord> => {
  const product = isValidRecordId(ctx, productId) ? await ctx.store.getProduct(productId) : null;
  if (!product) throw httpError(404, 'product_not_found', 'Produk digital tidak ditemukan.');
  return product;
};

/** Middleware (setelah requireUser): wajib punya entitlement yang berlaku untuk :productId. */
export const requireEntitlement = (ctx: DigitalContext): RequestHandler => asyncRoute(async (req, _res, next) => {
  const user = req.digitalUser!;
  const product = await loadProduct(ctx, String(req.params.productId));
  const { entitlement, reason } = await resolveEntitlement(ctx, user.id, product);
  if (!entitlement) throw denyAccess(ctx, req, user.id, product, reason ?? 'no_entitlement');
  req.digitalGrant = { product, entitlement };
  next();
});

/**
 * Middleware (setelah requireUser) untuk endpoint aset reader/player: sesi hidup milik user ini untuk :productId,
 * dan entitlement masih berlaku (refund/penangguhan di tengah sesi langsung menghentikan akses).
 */
export const requireSession = (ctx: DigitalContext): RequestHandler => asyncRoute(async (req, _res, next) => {
  const user = req.digitalUser!;
  const token = String(req.headers['x-session-token'] || '');
  if (!token || token.length > 200) throw httpError(401, 'session_required', 'Sesi baca/dengar diperlukan.');
  const productId = String(req.params.productId);
  const session = await ctx.store.getSessionByTokenHash(hashToken(token));
  if (!session || session.userId !== user.id || session.productId !== productId) {
    throw httpError(401, 'session_invalid', 'Sesi baca/dengar tidak valid.');
  }
  if (session.endedAt) throw httpError(401, 'session_ended', 'Sesi baca/dengar telah berakhir.', { endReason: session.endReason });
  if (ctx.now().getTime() - Date.parse(session.lastHeartbeat) >= ctx.config.heartbeatWindowMs) {
    await ctx.store.endSessions({ ids: [session.id] }, 'expired');
    throw httpError(401, 'session_ended', 'Sesi baca/dengar kedaluwarsa.', { endReason: 'expired' });
  }
  const product = await loadProduct(ctx, productId);
  const { entitlement, reason } = await resolveEntitlement(ctx, user.id, product);
  if (!entitlement) {
    await ctx.store.endSessions({ ids: [session.id] }, 'revoked');
    throw denyAccess(ctx, req, user.id, product, reason ?? 'no_entitlement', session.id);
  }
  req.digitalAccess = { user, product, entitlement, session };
  next();
});

// ---------------------------------------------------------------------------
// Perangkat
// ---------------------------------------------------------------------------

/** Label ramah pengguna dari User-Agent, mis. "Chrome · Windows". */
export const deviceLabel = (userAgent: string | null): string => {
  const ua = userAgent || '';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
      : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
        : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
            : /Safari\//.test(ua) ? 'Safari'
              : 'Browser';
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
        : /Windows/.test(ua) ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
            : /CrOS/.test(ua) ? 'ChromeOS'
              : /Linux/.test(ua) ? 'Linux'
                : '?';
  return `${browser} · ${os}`;
};

const currentDeviceHash = (raw: unknown): string | null =>
  typeof raw === 'string' && DEVICE_ID_RE.test(raw) ? hashFingerprint(raw) : null;

/** Perangkat aktif user + batas + kapan boleh melepas lagi (jeda dihitung dari pelepasan oleh user sendiri). */
const devicesOverview = async (ctx: DigitalContext, userId: string, currentHash: string | null) => {
  const all = await ctx.store.listDevices(userId, true);
  const cooldownMs = ctx.config.deviceReleaseCooldownDays * DAY_MS;
  const lastUserRelease = Math.max(0, ...all.filter((d) => d.releasedBy === 'user' && d.releasedAt).map((d) => Date.parse(d.releasedAt!)));
  const releaseAvailableAt = lastUserRelease > 0 && lastUserRelease + cooldownMs > ctx.now().getTime()
    ? new Date(lastUserRelease + cooldownMs).toISOString()
    : null;
  return {
    devices: all
      .filter((d) => !d.releasedAt)
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
      .map((d) => ({
        id: d.id,
        label: d.label || deviceLabel(d.userAgent),
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
        isCurrent: currentHash !== null && d.fingerprintHash === currentHash
      })),
    maxDevices: await maxDevicesForUser(ctx, userId),
    releaseAvailableAt,
    cooldownDays: ctx.config.deviceReleaseCooldownDays
  };
};

/** Perangkat yang sudah terdaftar dipakai ulang; perangkat baru hanya bila masih di bawah batas per user. */
const registerDevice = async (ctx: DigitalContext, req: Request, userId: string, productId: string, rawDeviceId: unknown): Promise<DeviceRecord> => {
  const deviceId = typeof rawDeviceId === 'string' ? rawDeviceId : '';
  if (!DEVICE_ID_RE.test(deviceId)) throw httpError(400, 'invalid_device', 'ID perangkat tidak valid.');
  const fingerprintHash = hashFingerprint(deviceId);
  const { ip, userAgent } = clientInfo(req);
  const nowIso = ctx.now().toISOString();
  const active = await ctx.store.listDevices(userId);
  const known = active.find((d) => d.fingerprintHash === fingerprintHash);
  const maxDevices = await maxDevicesForUser(ctx, userId);
  // Setelah downgrade (mis. Professional 2 -> Reader 1) perangkat terdaftar bisa melebihi batas baru:
  // sesi berikutnya meminta pengguna melepas perangkat, termasuk dari perangkat yang sudah dikenal.
  if (known && active.length <= maxDevices) {
    await ctx.store.updateDevice(known.id, { lastSeen: nowIso, userAgent });
    return { ...known, lastSeen: nowIso, userAgent };
  }
  if (known || active.length >= maxDevices) {
    ctx.log({ userId, productId, action: 'denied', ip, userAgent, meta: { reason: 'device_limit', max_devices: maxDevices, active_devices: active.length } });
    throw httpError(403, 'device_limit', `Batas ${maxDevices} perangkat tercapai. Lepaskan salah satu perangkat untuk melanjutkan.`,
      await devicesOverview(ctx, userId, fingerprintHash));
  }
  try {
    return await ctx.store.insertDevice({ userId, fingerprintHash, userAgent, label: deviceLabel(userAgent) });
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    // Permintaan paralel dari perangkat yang sama sudah mendaftarkannya.
    const existing = (await ctx.store.listDevices(userId)).find((d) => d.fingerprintHash === fingerprintHash);
    if (!existing) throw err;
    return existing;
  }
};

const sessionConflict = async (ctx: DigitalContext, open: SessionRecord | null) => {
  const device = open?.deviceId ? await ctx.store.getDevice(open.deviceId) : null;
  return httpError(409, 'session_conflict', 'Akun ini sedang membaca atau mendengarkan di perangkat lain.', {
    takeover: true,
    activeSession: open
      ? { deviceLabel: device ? device.label || deviceLabel(device.userAgent) : null, startedAt: open.startedAt, lastHeartbeat: open.lastHeartbeat }
      : null
  });
};

/** Token sesi untuk /session/end: header, atau body JSON/text (navigator.sendBeacon tidak bisa mengirim header). */
const tokenFromEndRequest = (req: Request): string => {
  const header = req.headers['x-session-token'];
  if (typeof header === 'string' && header) return header;
  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const token = body && typeof body === 'object' ? (body as Record<string, unknown>).sessionToken : null;
  return typeof token === 'string' ? token : '';
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

interface LibraryItemPayload {
  productId: string;
  format: ProductRecord['format'];
  bookId: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string;
  pageCount: number | null;
  durationSeconds: number | null;
  ready: boolean;
  access: { status: 'active' | AccessDenialReason | null; entitlement: ReturnType<typeof publicEntitlement> | null };
  progress: { position: number; percent: number; updatedAt: string } | null;
  acquiredAt: string;
}

export const createAccessRouter = (ctx: DigitalContext): Router => {
  const router = express.Router();
  const startLimiter = createUserRateLimiter(ctx, 'sessionStart');
  const heartbeatLimiter = createUserRateLimiter(ctx, 'heartbeat');
  const deviceLimiter = createUserRateLimiter(ctx, 'devices');
  const libraryLimiter = createUserRateLimiter(ctx, 'library');

  // Mulai sesi baca/dengar. Body: { deviceId, takeover? }.
  router.post('/api/access/:productId/session/start', ctx.requireUser, startLimiter, requireEntitlement(ctx), asyncRoute(async (req, res) => {
    const user = req.digitalUser!;
    const { product, entitlement } = req.digitalGrant!;
    const body = (req.body || {}) as Record<string, unknown>;
    const takeover = body.takeover === true;
    const device = await registerDevice(ctx, req, user.id, product.id, body.deviceId);
    const now = ctx.now();
    const { ip, userAgent } = clientInfo(req);

    // Kuota jam audio paket (fase 6): habis -> tidak ada sesi baru, tawarkan upgrade.
    const audioQuota = product.format === 'audiobook' && ctx.membership ? await ctx.membership.audioQuota(entitlement, user.id, true) : null;
    if (audioQuota?.exhausted) throw audioQuotaExhausted(ctx, req, user.id, product, audioQuota);

    // Satu sesi aktif per pengguna (semua judul).
    const open = await ctx.store.listOpenSessions({ userId: user.id });
    const alive = (x: SessionRecord) => now.getTime() - Date.parse(x.lastHeartbeat) < ctx.config.heartbeatWindowMs;
    const expired = open.filter((x) => !alive(x)).map((x) => x.id);
    if (expired.length > 0) await ctx.store.endSessions({ ids: expired }, 'expired');
    const elsewhere = open.filter((x) => alive(x) && x.deviceId !== device.id);
    if (elsewhere.length > 0 && !takeover) throw await sessionConflict(ctx, elsewhere[0]);
    for (const x of open.filter(alive)) {
      const reason = x.deviceId !== device.id ? 'takeover' : x.productId === product.id ? 'reopened' : 'switched';
      await ctx.store.endSessions({ ids: [x.id] }, reason);
    }

    const sessionToken = newSessionToken();
    const row = {
      userId: user.id,
      productId: product.id,
      deviceId: device.id,
      entitlementId: entitlement.id,
      tokenHash: hashToken(sessionToken),
      ip,
      userAgent,
      startedAt: now.toISOString(),
      lastHeartbeat: now.toISOString(),
      institutionId: null
    };
    let session: SessionRecord;
    try {
      // Hak institusi (fase 4): slot pengguna bersamaan diklaim atomik bersama pembuatan sesi.
      const claim = entitlement.source === 'institution' && ctx.institution ? await ctx.institution.claimSession(entitlement, row) : null;
      if (claim && 'busy' in claim) {
        const { inUse, capacity, institutionId } = claim.busy;
        ctx.log({
          userId: user.id,
          productId: product.id,
          entitlementId: entitlement.id,
          action: 'denied',
          ip,
          userAgent,
          meta: { reason: 'institution_busy', institution_id: institutionId, in_use: inUse, capacity }
        });
        throw httpError(429, 'institution_busy', `Semua slot institusi sedang dipakai (${inUse}/${capacity}). Coba lagi sebentar atau beli akses individu.`, {
          inUse,
          capacity,
          product: publicProduct(product)
        });
      }
      session = claim ? claim.session : await ctx.store.insertSession(row);
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      // Perangkat lain memulai sesi pada saat yang sama.
      throw await sessionConflict(ctx, (await ctx.store.listOpenSessions({ userId: user.id }))[0] ?? null);
    }
    ctx.log({
      userId: user.id,
      productId: product.id,
      entitlementId: entitlement.id,
      sessionId: session.id,
      action: 'session_start',
      ip,
      userAgent,
      meta: { device_id: device.id, takeover }
    });
    res.status(201).json({
      sessionToken,
      session: { id: session.id, startedAt: session.startedAt, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, expiresInMs: ctx.config.heartbeatWindowMs },
      entitlement: publicEntitlement(entitlement),
      product: {
        id: product.id,
        format: product.format,
        bookId: product.bookId,
        pageCount: product.pageCount,
        durationSeconds: product.durationSeconds,
        ready: product.processingStatus === 'ready'
      },
      device: { id: device.id, label: device.label || deviceLabel(device.userAgent) },
      audioQuota: audioQuota ? publicAudioQuota(audioQuota) : null
    });
  }));

  router.post('/api/access/:productId/session/heartbeat', ctx.requireUser, heartbeatLimiter, requireSession(ctx), asyncRoute(async (req, res) => {
    const { session } = req.digitalAccess!;
    const nowIso = ctx.now().toISOString();
    await ctx.store.updateSession(session.id, { lastHeartbeat: nowIso });
    if (session.deviceId) await ctx.store.updateDevice(session.deviceId, { lastSeen: nowIso });
    res.json({ ok: true, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, expiresInMs: ctx.config.heartbeatWindowMs });
  }));

  // Akhiri sesi (menutup reader/player). Tanpa Authorization: token sesi 32 byte acak sudah membuktikan kepemilikan.
  // Selalu 204 agar endpoint ini tidak bisa dipakai menebak token.
  router.post('/api/access/:productId/session/end', express.text({ type: 'text/plain', limit: '2kb' }), asyncRoute(async (req, res) => {
    const token = tokenFromEndRequest(req);
    if (token && token.length <= 200) {
      const session = await ctx.store.getSessionByTokenHash(hashToken(token));
      if (session && !session.endedAt && session.productId === String(req.params.productId)) {
        await ctx.store.endSessions({ ids: [session.id] }, 'closed');
        const { ip, userAgent } = clientInfo(req);
        ctx.log({
          userId: session.userId,
          productId: session.productId,
          entitlementId: session.entitlementId,
          sessionId: session.id,
          action: 'session_end',
          ip,
          userAgent,
          meta: { reason: 'closed' }
        });
      }
    }
    res.status(204).end();
  }));

  // Perangkat saya. ?current=<ID perangkat browser ini> menandai perangkat yang sedang dipakai.
  router.get('/api/devices', ctx.requireUser, deviceLimiter, asyncRoute(async (req, res) => {
    res.json(await devicesOverview(ctx, req.digitalUser!.id, currentDeviceHash(req.query.current)));
  }));

  // Lepas perangkat (maks. sekali per 30 hari oleh pengguna; admin tanpa jeda di langkah 7). Body: { currentDeviceId? }.
  router.post('/api/devices/:deviceId/release', ctx.requireUser, deviceLimiter, asyncRoute(async (req, res) => {
    const user = req.digitalUser!;
    const deviceId = String(req.params.deviceId);
    const device = isValidRecordId(ctx, deviceId) ? await ctx.store.getDevice(deviceId) : null;
    if (!device || device.userId !== user.id || device.releasedAt) throw httpError(404, 'device_not_found', 'Perangkat tidak ditemukan.');
    const before = await devicesOverview(ctx, user.id, null);
    if (before.releaseAvailableAt) {
      throw httpError(429, 'release_cooldown', `Perangkat hanya dapat dilepas sekali setiap ${ctx.config.deviceReleaseCooldownDays} hari.`, {
        releaseAvailableAt: before.releaseAvailableAt,
        cooldownDays: ctx.config.deviceReleaseCooldownDays
      });
    }
    await ctx.store.updateDevice(device.id, { releasedAt: ctx.now().toISOString(), releasedBy: 'user' });
    await ctx.store.endSessions({ deviceId: device.id }, 'device_released');
    res.json(await devicesOverview(ctx, user.id, currentDeviceHash((req.body || {}).currentDeviceId)));
  }));

  // Beranda digital: "Lanjutkan membaca" — judul dengan progres 1–99% (termasuk judul rak keanggotaan), terbaru dulu.
  router.get('/api/library/continue', ctx.requireUser, libraryLimiter, asyncRoute(async (req, res) => {
    const progress = (await ctx.store.listProgress(req.digitalUser!.id))
      .filter((p) => p.percent > 0 && p.percent < 99)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 12);
    const items: Array<{ productId: string; format: ProductRecord['format']; bookId: string; percent: number; position: number; updatedAt: string }> = [];
    for (const p of progress) {
      const product = await ctx.store.getProduct(p.productId);
      if (!product || !product.isActive) continue;
      items.push({ productId: product.id, format: product.format, bookId: product.bookId, percent: p.percent, position: p.position, updatedAt: p.updatedAt });
    }
    res.json({ items });
  }));

  // Pustaka Saya: semua produk yang pernah diberikan ke user (kecuali yang dicabut), status akses, dan progres.
  router.get('/api/library', ctx.requireUser, libraryLimiter, asyncRoute(async (req, res) => {
    const user = req.digitalUser!;
    const now = ctx.now();
    const [entitlements, progress, devices] = await Promise.all([
      ctx.store.listEntitlements({ userId: user.id }),
      ctx.store.listProgress(user.id),
      ctx.store.listDevices(user.id)
    ]);
    // Hanya hak per produk (pembelian, grant, karya sendiri, Digital Member Pick). Akses rak keanggotaan ada di
    // /api/membership/shelf (tab "Rak Digital").
    const byProduct = new Map<string, EntitlementRecord[]>();
    for (const e of entitlements) {
      if (e.status === 'revoked' || !e.productId) continue;
      byProduct.set(e.productId, [...(byProduct.get(e.productId) || []), e]);
    }
    const items: LibraryItemPayload[] = [];
    for (const [productId, list] of byProduct) {
      const product = await ctx.store.getProduct(productId);
      if (!product) continue;
      const book = await ctx.getBook(product.bookId);
      const { entitlement, reason } = pickEntitlement(list, now);
      const shown = entitlement
        ?? (reason === 'suspended'
          ? list.find((e) => e.status === 'suspended')
          : [...list].sort((a, b) => (b.endsAt || '').localeCompare(a.endsAt || ''))[0])
        ?? null;
      const p = progress.find((x) => x.productId === productId);
      items.push({
        productId,
        format: product.format,
        bookId: product.bookId,
        slug: book?.slug ?? product.bookId,
        title: book?.title ?? '',
        author: book?.author ?? '',
        coverUrl: book?.coverUrl ?? '',
        pageCount: product.pageCount,
        durationSeconds: product.durationSeconds,
        ready: product.processingStatus === 'ready',
        access: { status: entitlement ? 'active' : reason, entitlement: shown ? publicEntitlement(shown) : null },
        progress: p ? { position: p.position, percent: p.percent, updatedAt: p.updatedAt } : null,
        acquiredAt: list.map((e) => e.createdAt).sort()[0]
      });
    }
    // Terakhir dibaca/didengar lebih dulu, lalu yang terbaru didapat.
    items.sort((a, b) => (b.progress?.updatedAt ?? b.acquiredAt).localeCompare(a.progress?.updatedAt ?? a.acquiredAt));
    res.json({ items, devices: { count: devices.length, max: await maxDevicesForUser(ctx, user.id) } });
  }));

  return router;
};
