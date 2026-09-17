import express, { type RequestHandler, type Router } from 'express';
import { asyncRoute, httpError } from './errors';
import { clientInfo, type DigitalContext } from './context';
import { audioQuotaExhausted, publicAudioQuota, requireSession } from './access';
import { resolveEntitlement } from './entitlements';
import { createUserRateLimiter } from './rateLimits';
import { AssetNotFoundError, assetPaths } from './storage';
import { signMediaToken, verifyMediaToken, type MediaTokenKind } from './tokens';
import type { EntitlementRecord, ProductRecord, ReadingEventInput, SessionRecord } from './types';
import type { AudioQuota } from './membership/quota';

/**
 * Player audiobook (langkah 6): HLS AES-128 lewat proxy server.
 *  - Browser tidak pernah menerima URL bucket. Playlist ditulis ulang: key & segmen menjadi URL relatif bertoken HMAC
 *    (terikat user + produk + sesi, berlaku 2 jam) karena pemutar HLS native (Safari) tidak bisa mengirim header.
 *  - Setiap permintaan playlist/segmen/key tetap memeriksa sesi yang hidup (heartbeat) dan entitlement yang berlaku.
 *  - Segmen dicatat di access_logs 1 dari 6 (±1 menit audio); key setiap kali diminta.
 *  - Progres (detik) dan listening events tervalidasi: kecepatan <= 2×, segmen harus benar-benar dikirim di sesi ini.
 *  - Fase 6: jam audio paket per bulan per akun. Kuota habis -> playlist/segmen ditolak 403 audio_quota_exhausted
 *    (player berhenti dan menawarkan upgrade). Event dengar menyimpan subscription_id untuk agregasi kuota.
 */

export const MEDIA_TOKEN_TTL_SECONDS = 2 * 60 * 60;
const SEGMENT_SECONDS = 10;
const SEGMENT_LOG_EVERY = 6;
const MIN_LISTEN_MS = 5000;
const MAX_LISTEN_MS = 5 * 60 * 1000;
const MAX_SPEED = 2;
const EVENT_TOLERANCE_MS = 5000;
const SEGMENT_CACHE_BYTES = 32 * 1024 * 1024;
const SERVED_TTL_MS = 6 * 60 * 60 * 1000;

interface MediaAccess {
  userId: string;
  product: ProductRecord;
  session: SessionRecord;
  entitlement: EntitlementRecord;
  segment?: number;
}

/** Playlist asli (URI "enc.key", baris "seg_N.ts") -> URI relatif bertoken, di-resolve terhadap URL playlist. */
export const rewritePlaylist = (playlist: string, sign: (kind: 'seg' | 'key', segment?: number) => string): string =>
  playlist.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXT-X-KEY:')) return trimmed.replace(/URI="[^"]*"/, `URI="key?t=${sign('key')}"`);
    const segment = trimmed.match(/^seg_(\d+)\.ts$/);
    if (segment) return `seg/${segment[1]}.ts?t=${sign('seg', Number(segment[1]))}`;
    return line;
  }).join('\n');

const requireReadyAudiobook: RequestHandler = (req, _res, next) => {
  const { product } = req.digitalAccess!;
  if (product.format !== 'audiobook') return next(httpError(400, 'wrong_format', 'Produk ini bukan audiobook.'));
  if (product.processingStatus !== 'ready' || !product.durationSeconds) return next(httpError(409, 'not_ready', 'Audiobook ini sedang disiapkan.'));
  return next();
};

/** Cache byte kecil (LRU) untuk segmen yang sering diminta ulang (seek, beberapa pendengar). */
class ByteCache {
  private readonly entries = new Map<string, Buffer>();
  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  async get(key: string, load: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const buffer = await load();
    this.entries.set(key, buffer);
    this.bytes += buffer.length;
    while (this.bytes > this.maxBytes && this.entries.size > 1) {
      const oldest = this.entries.keys().next().value as string;
      this.bytes -= this.entries.get(oldest)!.length;
      this.entries.delete(oldest);
    }
    return buffer;
  }
}

const noStore = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff'
};

export const createPlayerRouter = (ctx: DigitalContext): Router => {
  const router = express.Router();
  const secret = ctx.config.accessTokenSecret;
  const limits = {
    meta: createUserRateLimiter(ctx, 'playerMeta'),
    playlist: createUserRateLimiter(ctx, 'playlist'),
    segment: createUserRateLimiter(ctx, 'segment'),
    key: createUserRateLimiter(ctx, 'key'),
    progress: createUserRateLimiter(ctx, 'progress'),
    events: createUserRateLimiter(ctx, 'events')
  };
  const player = (limiter: RequestHandler): RequestHandler[] => [ctx.requireUser, limiter, requireSession(ctx), requireReadyAudiobook];
  const segments = new ByteCache(SEGMENT_CACHE_BYTES);

  // Segmen yang benar-benar dikirim per sesi (dasar validasi listening events). Per proses: satu instance Render.
  const servedSegments = new Map<string, { segments: Set<number>; touchedAt: number }>();
  const markServed = (sessionId: string, segment: number) => {
    let entry = servedSegments.get(sessionId);
    if (!entry) {
      entry = { segments: new Set(), touchedAt: Date.now() };
      servedSegments.set(sessionId, entry);
      if (servedSegments.size > 5000) {
        const cutoff = Date.now() - SERVED_TTL_MS;
        for (const [id, value] of servedSegments) if (value.touchedAt < cutoff) servedSegments.delete(id);
      }
    }
    entry.segments.add(segment);
    entry.touchedAt = Date.now();
  };

  const streamFor = (userId: string, productId: string, sessionId: string) => {
    const exp = Math.floor(ctx.now().getTime() / 1000) + MEDIA_TOKEN_TTL_SECONDS;
    const token = signMediaToken(secret, { k: 'playlist', p: productId, s: sessionId, u: userId, exp });
    return {
      playlistUrl: `/api/player/${encodeURIComponent(productId)}/playlist.m3u8?t=${token}`,
      expiresAt: new Date(exp * 1000).toISOString()
    };
  };

  /** Token media (query ?t=) + sesi hidup + entitlement berlaku. Tidak memakai header (Safari HLS native). */
  const requireMedia = (kind: MediaTokenKind): RequestHandler => asyncRoute(async (req, res, next) => {
    const productId = String(req.params.productId);
    let segment: number | undefined;
    if (kind === 'seg') {
      const match = String(req.params.file || '').match(/^(\d{1,6})\.ts$/);
      if (!match) throw httpError(400, 'invalid_segment', 'Segmen tidak valid.');
      segment = Number(match[1]);
    }
    const payload = verifyMediaToken(secret, String(req.query.t || ''), { kind, productId, segment }, ctx.now().getTime());
    if (!payload) throw httpError(403, 'invalid_media_token', 'Token media tidak valid atau kedaluwarsa.');
    const session = await ctx.store.getSession(payload.s);
    if (!session || session.userId !== payload.u || session.productId !== productId) {
      throw httpError(403, 'invalid_media_token', 'Token media tidak valid.');
    }
    if (session.endedAt || ctx.now().getTime() - Date.parse(session.lastHeartbeat) >= ctx.config.heartbeatWindowMs) {
      throw httpError(403, 'session_ended', 'Sesi dengar telah berakhir.');
    }
    const product = await ctx.store.getProduct(productId);
    if (!product || product.format !== 'audiobook' || product.processingStatus !== 'ready') throw httpError(404, 'not_ready', 'Audiobook tidak tersedia.');
    const { entitlement, reason } = await resolveEntitlement(ctx, payload.u, product);
    if (!entitlement) {
      await ctx.store.endSessions({ ids: [session.id] }, 'revoked');
      const { ip, userAgent } = clientInfo(req);
      ctx.log({ userId: payload.u, productId, sessionId: session.id, action: 'denied', ip, userAgent, meta: { reason: reason ?? 'no_entitlement', media: kind } });
      throw httpError(403, reason ?? 'no_entitlement', 'Hak akses tidak berlaku.');
    }
    // Kunci rate limit per user (tidak ada JWT pada permintaan media).
    req.digitalUser = { id: payload.u, email: '', name: '' };
    if (kind !== 'key' && ctx.membership) {
      const quota = await ctx.membership.audioQuota(entitlement, payload.u);
      if (quota?.exhausted) throw audioQuotaExhausted(ctx, req, payload.u, product, quota);
    }
    res.locals.media = { userId: payload.u, product, session, entitlement, segment } satisfies MediaAccess;
    next();
  });

  router.get('/api/player/:productId/meta', ...player(limits.meta), asyncRoute(async (req, res) => {
    const { user, product, entitlement, session } = req.digitalAccess!;
    const duration = product.durationSeconds!;
    const [book, chapters, progress, quota] = await Promise.all([
      ctx.getBook(product.bookId),
      ctx.store.listChapters(product.id),
      ctx.store.getProgress(user.id, product.id),
      ctx.membership ? ctx.membership.audioQuota(entitlement, user.id) : Promise.resolve(null)
    ]);
    res.json({
      product: { id: product.id, bookId: product.bookId, durationSeconds: duration },
      title: book?.title ?? '',
      author: book?.author ?? '',
      coverUrl: book?.coverUrl ?? '',
      chapters: chapters
        .filter((c) => c.startSeconds !== null && c.startSeconds >= 0 && c.startSeconds < duration)
        .map((c) => ({ number: c.chapterNumber, title: c.title, start: c.startSeconds })),
      progress: progress && progress.position > 0 ? { position: Math.min(progress.position, duration), percent: progress.percent } : null,
      legalNoticeAccepted: Boolean(progress?.legalNoticeAcceptedAt),
      watermark: { name: user.name || user.email, email: user.email, entitlementId: entitlement.id },
      stream: streamFor(user.id, product.id, session.id),
      audioQuota: quota ? publicAudioQuota(quota) : null
    });
  }));

  // URL playlist baru (token diperbarui sebelum kedaluwarsa atau setelah ditolak).
  router.get('/api/player/:productId/stream', ...player(limits.playlist), (req, res) => {
    const { user, product, session } = req.digitalAccess!;
    res.json(streamFor(user.id, product.id, session.id));
  });

  router.get('/api/player/:productId/playlist.m3u8', requireMedia('playlist'), limits.playlist, asyncRoute(async (_req, res) => {
    const media = res.locals.media as MediaAccess;
    let source: string;
    try {
      source = (await ctx.storage.download(assetPaths.audioPlaylist(media.product.id))).toString('utf8');
    } catch (err) {
      if (err instanceof AssetNotFoundError) throw httpError(404, 'not_ready', 'Playlist tidak ditemukan.');
      throw err;
    }
    const exp = Math.floor(ctx.now().getTime() / 1000) + MEDIA_TOKEN_TTL_SECONDS;
    const base = { p: media.product.id, s: media.session.id, u: media.userId, exp };
    const body = rewritePlaylist(source, (kind, n) => signMediaToken(secret, kind === 'seg' ? { ...base, k: 'seg', n } : { ...base, k: 'key' }));
    res.set({ ...noStore, 'Content-Type': 'application/vnd.apple.mpegurl' });
    res.send(body);
  }));

  router.get('/api/player/:productId/seg/:file', requireMedia('seg'), limits.segment, asyncRoute(async (req, res) => {
    const media = res.locals.media as MediaAccess;
    const n = media.segment!;
    let data: Buffer;
    try {
      data = await segments.get(`${media.product.id}:${media.product.processedAt}:${n}`, () => ctx.storage.download(assetPaths.audioSegment(media.product.id, n)));
    } catch (err) {
      if (err instanceof AssetNotFoundError) throw httpError(404, 'segment_not_found', 'Segmen tidak ditemukan.');
      throw err;
    }
    markServed(media.session.id, n);
    if (n % SEGMENT_LOG_EVERY === 0) {
      const { ip, userAgent } = clientInfo(req);
      ctx.log({ userId: media.userId, productId: media.product.id, entitlementId: media.entitlement.id, sessionId: media.session.id, action: 'segment', ip, userAgent, meta: { segment: n } });
    }
    res.set({ ...noStore, 'Content-Type': 'video/mp2t' });
    res.send(data);
  }));

  router.get('/api/player/:productId/key', requireMedia('key'), limits.key, asyncRoute(async (req, res) => {
    const media = res.locals.media as MediaAccess;
    let key: Buffer;
    try {
      key = await ctx.storage.download(assetPaths.audioKey(media.product.id));
    } catch (err) {
      if (err instanceof AssetNotFoundError) throw httpError(404, 'not_ready', 'Kunci audio tidak ditemukan.');
      throw err;
    }
    const { ip, userAgent } = clientInfo(req);
    ctx.log({ userId: media.userId, productId: media.product.id, entitlementId: media.entitlement.id, sessionId: media.session.id, action: 'key', ip, userAgent, meta: {} });
    res.set({ ...noStore, 'Content-Type': 'application/octet-stream' });
    res.send(key);
  }));

  router.put('/api/player/:productId/progress', ...player(limits.progress), asyncRoute(async (req, res) => {
    const { user, product } = req.digitalAccess!;
    const duration = product.durationSeconds!;
    const position = Number((req.body || {}).position);
    if (!Number.isFinite(position) || position < 0 || position > duration + 1) throw httpError(400, 'invalid_position', 'Posisi putar tidak valid.');
    const seconds = Math.min(Math.round(position), duration);
    const percent = Math.round((seconds / duration) * 1000) / 10;
    await ctx.store.upsertProgress(user.id, product.id, { position: seconds, percent });
    res.json({ position: seconds, percent });
  }));

  router.post('/api/player/:productId/events', ...player(limits.events), asyncRoute(async (req, res) => {
    const { user, product, entitlement, session } = req.digitalAccess!;
    const duration = product.durationSeconds!;
    const raw = (req.body || {}).events;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 60) throw httpError(400, 'invalid_events', 'Data aktivitas dengar tidak valid.');
    const now = ctx.now();
    let budget = Math.max(0, now.getTime() - Date.parse(session.lastEventAt ?? session.startedAt)) + EVENT_TOLERANCE_MS;
    const served = servedSegments.get(session.id)?.segments;
    const accepted: ReadingEventInput[] = [];
    const subscription = ctx.membership ? await ctx.membership.subscriptionFor(entitlement) : null;
    for (const item of raw) {
      const event = (item || {}) as Record<string, unknown>;
      const from = Number(event.from);
      const to = Number(event.to);
      const wallMs = Math.round(Number(event.wallMs));
      if (![from, to, wallMs].every(Number.isFinite) || from < 0 || to <= from || to > duration + 1) continue;
      if (wallMs < MIN_LISTEN_MS || wallMs > MAX_LISTEN_MS) continue;
      // Kecepatan putar maksimal 2× (toleransi 1 detik).
      if ((to - from) * 1000 > wallMs * MAX_SPEED + 1000) continue;
      if (wallMs > budget) continue;
      const first = Math.floor(from / SEGMENT_SECONDS);
      const last = Math.floor(Math.max(from, to - 0.001) / SEGMENT_SECONDS);
      let covered = Boolean(served);
      for (let s = first; covered && s <= last; s++) if (!served!.has(s)) covered = false;
      if (!covered) continue;
      budget -= wallMs;
      accepted.push({
        userId: user.id,
        productId: product.id,
        sessionId: session.id,
        entitlementId: entitlement.id,
        unit: 'second',
        unitStart: Math.floor(from),
        unitEnd: Math.ceil(to),
        dwellMs: wallMs,
        institutionId: session.institutionId,
        subscriptionId: subscription?.id ?? null,
        occurredAt: now.toISOString()
      });
    }
    let quota: AudioQuota | null = null;
    if (accepted.length > 0) {
      await ctx.store.insertReadingEvents(accepted);
      await ctx.store.updateSession(session.id, { lastEventAt: now.toISOString() });
      if (subscription && ctx.membership) {
        quota = await ctx.membership.audioQuota(entitlement, user.id);
        if (quota) {
          ctx.membership.recordUsage(quota, accepted.reduce((sum, e) => sum + (e.unitEnd - e.unitStart), 0));
          quota = await ctx.membership.audioQuota(entitlement, user.id);
        }
      }
    }
    res.json({ accepted: accepted.length, rejected: raw.length - accepted.length, audioQuota: quota ? publicAudioQuota(quota) : null });
  }));

  return router;
};
