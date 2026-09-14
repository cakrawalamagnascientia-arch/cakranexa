import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { clientInfo, type DigitalContext } from './context';

/**
 * Batas permintaan per PENGGUNA per menit (bukan per IP: pembaca di jaringan kantor/kampus berbagi IP).
 * page/segment/search dipasang pada endpoint reader & player (langkah 5–6).
 */
export const RATE_LIMITS = {
  page: 120,
  segment: 60,
  search: 30,
  sessionStart: 20,
  heartbeat: 10,
  devices: 20,
  library: 60,
  readerMeta: 30,
  notes: 60,
  progress: 30,
  events: 20,
  legal: 10,
  playerMeta: 30,
  playlist: 30,
  key: 30,
  membershipRead: 60,
  membershipWrite: 10,
  institutionRead: 60,
  institutionJoin: 10,
  institutionAdmin: 60
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** Dipasang SETELAH requireUser. Penyimpanan hitungan di memori proses (satu instance Render). */
export const createUserRateLimiter = (ctx: DigitalContext, name: RateLimitName): RequestHandler =>
  rateLimit({
    windowMs: 60_000,
    limit: RATE_LIMITS[name],
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${name}:${req.digitalUser?.id ?? 'anonim'}`,
    // Kunci per user, bukan IP: validasi bawaan terkait IP/proxy tidak relevan.
    validate: { trustProxy: false, xForwardedForHeader: false },
    handler: (req, res) => {
      const { ip, userAgent } = clientInfo(req);
      const productId = typeof req.params?.productId === 'string' ? req.params.productId : null;
      ctx.log({ userId: req.digitalUser?.id ?? null, productId, action: 'denied', ip, userAgent, meta: { reason: 'rate_limited', limit: name } });
      res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.', code: 'rate_limited', retryAfterSeconds: 60 });
    }
  });
