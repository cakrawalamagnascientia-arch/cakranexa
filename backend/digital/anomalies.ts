import crypto from 'crypto';
import express, { type Router } from 'express';
import { asyncRoute, httpError } from './errors';
import type { DigitalContext } from './context';
import { anomalyAlertEmail, type AnomalyAlertItem } from './email';
import { productRefs, publicAnomaly } from './admin';
import { isEntitlementUsable, resolveEntitlement } from './entitlements';
import { DAY_MS } from './time';
import type { AnomalyRecord, AnomalyRule } from './types';

/** Baris blokir per judul untuk anggota rak (A4): diselesaikan admin = dicabut (bukan diaktifkan). */
export const ANOMALY_TITLE_BLOCK_REASON = 'anomaly:page_speed:title_block';
const SHELF_ESCALATION_WINDOW_MS = 30 * DAY_MS;

/**
 * Deteksi anomali akses (keputusan #7 & #9):
 *  - Berjalan tiap jam di proses server (Render) + endpoint `POST /api/internal/cron` (Authorization: Bearer CRON_SECRET)
 *    untuk penjadwal eksternal opsional.
 *  - Aturan (fungsi SQL digital_anomaly_candidates): >5 IP / 24 jam per produk, >3 penolakan batas perangkat / 24 jam,
 *    dan membalik halaman terlalu cepat (>=3 jendela 10 detik dengan >30 halaman dalam 1 jam).
 *  - Semua anomali ditandai dan dikirim ke email admin. HANYA aturan kecepatan halaman yang otomatis menangguhkan
 *    entitlement pengguna untuk produk tersebut; admin memulihkannya saat menyelesaikan anomali.
 */

const HOUR_MS = 60 * 60 * 1000;
/** Jendela pengamatan tiap aturan: anomali yang baru diselesaikan admin tidak ditandai ulang dalam jendela ini. */
const RULE_WINDOW_MS: Record<AnomalyRule, number> = {
  ip_spread: 24 * HOUR_MS,
  device_limit_denials: 24 * HOUR_MS,
  page_speed: HOUR_MS
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AnomalyScanResult {
  candidates: number;
  created: AnomalyRecord[];
}

export const runAnomalyScan = async (ctx: DigitalContext): Promise<AnomalyScanResult> => {
  const now = ctx.now();
  const candidates = await ctx.store.findAnomalyCandidates(now);
  const created: AnomalyRecord[] = [];
  for (const candidate of candidates) {
    const previous = (await ctx.store.listAnomalies({ userId: candidate.userId, limit: 200 }))
      .filter((a) => a.rule === candidate.rule && a.productId === candidate.productId);
    const recentlyHandled = previous.some((a) => !a.resolvedAt || now.getTime() - Date.parse(a.resolvedAt) < RULE_WINDOW_MS[candidate.rule]);
    if (recentlyHandled) continue;

    let suspendedEntitlementIds: string[] = [];
    let details: Record<string, unknown> = candidate.details;
    if (candidate.rule === 'page_speed' && candidate.productId) {
      const active = (await ctx.store.listEntitlements({ userId: candidate.userId, productId: candidate.productId })).filter((e) => e.status === 'active');
      const product = active.length === 0 ? await ctx.store.getProduct(candidate.productId) : null;
      const access = product ? await resolveEntitlement(ctx, candidate.userId, product) : null;
      if (active.length > 0) {
        // Hak per judul (pembelian, grant, Pick): ditangguhkan seperti fase 2.
        suspendedEntitlementIds = active.map((e) => e.id);
        await ctx.store.updateEntitlements(suspendedEntitlementIds, { status: 'suspended', revokedReason: 'anomaly:page_speed', statusChangedBy: 'anomaly' });
        await ctx.store.endSessions({ userId: candidate.userId, productId: candidate.productId }, 'revoked');
      } else if (access?.entitlement?.scope === 'shelf') {
        // Dibaca lewat rak keanggotaan (A4): pelanggaran pertama memblokir judul itu saja; pelanggaran kedua dalam 30 hari
        // menangguhkan seluruh rak.
        const previousViaShelf = (await ctx.store.listAnomalies({ userId: candidate.userId, limit: 200 }))
          .filter((a) => a.rule === 'page_speed' && a.details?.via === 'shelf' && now.getTime() - Date.parse(a.detectedAt) < SHELF_ESCALATION_WINDOW_MS);
        if (previousViaShelf.length > 0) {
          suspendedEntitlementIds = (await ctx.store.listEntitlements({ userId: candidate.userId, scope: 'shelf' }))
            .filter((e) => isEntitlementUsable(e, now))
            .map((e) => e.id);
          await ctx.store.updateEntitlements(suspendedEntitlementIds, { status: 'suspended', revokedReason: 'anomaly:page_speed:shelf', statusChangedBy: 'anomaly' });
          await ctx.store.endSessions({ userId: candidate.userId }, 'revoked');
          details = { ...candidate.details, via: 'shelf', action: 'shelf_suspended', previous_anomaly_id: previousViaShelf[0].id };
        } else {
          const sourceRef = crypto.randomUUID();
          await ctx.store.insertEntitlements([{
            userId: candidate.userId,
            productId: candidate.productId,
            scope: 'product',
            source: 'membership',
            sourceRef,
            startsAt: now.toISOString(),
            endsAt: access.entitlement.endsAt,
            maxDevices: access.entitlement.maxDevices,
            statusChangedBy: 'anomaly'
          }]);
          const [block] = await ctx.store.listEntitlements({ userId: candidate.userId, productId: candidate.productId, source: 'membership', sourceRef });
          if (block) {
            await ctx.store.updateEntitlements([block.id], { status: 'suspended', revokedReason: ANOMALY_TITLE_BLOCK_REASON, statusChangedBy: 'anomaly' });
            suspendedEntitlementIds = [block.id];
          }
          await ctx.store.endSessions({ userId: candidate.userId, productId: candidate.productId }, 'revoked');
          details = { ...candidate.details, via: 'shelf', action: 'title_blocked' };
        }
      }
    }
    const record = await ctx.store.insertAnomaly({
      ...candidate,
      details,
      actionTaken: suspendedEntitlementIds.length > 0 ? 'suspended' : 'flagged',
      suspendedEntitlementIds
    });
    if (record) created.push(record);
  }

  if (created.length > 0 && ctx.adminEmails.length > 0) {
    try {
      const profiles = new Map((await ctx.store.getUserProfiles([...new Set(created.map((a) => a.userId))])).map((u) => [u.id, u]));
      const products = await productRefs(ctx, created.map((a) => a.productId));
      const items: AnomalyAlertItem[] = created.map((a) => {
        const product = a.productId ? products.get(a.productId) : undefined;
        return {
          rule: a.rule,
          userEmail: profiles.get(a.userId)?.email || a.userId,
          userName: profiles.get(a.userId)?.fullName || '',
          productTitle: product ? `${product.title} (${product.format === 'ebook' ? 'E-Book' : 'Audiobook'})` : null,
          actionTaken: a.actionTaken,
          details: a.details
        };
      });
      const email = anomalyAlertEmail(items, `${ctx.config.siteUrl}/admin`);
      await ctx.mailer.send({ to: ctx.adminEmails, subject: email.subject, html: email.html });
    } catch (err: any) {
      console.warn('[digital] email anomali gagal:', err?.message || err);
    }
  }
  return { candidates: candidates.length, created };
};

/** Job per jam di proses server (pertama kali 5 menit setelah start). Mengembalikan fungsi penghenti. */
export const startAnomalyJob = (ctx: DigitalContext): (() => void) => {
  const run = () => {
    runAnomalyScan(ctx)
      .then((result) => {
        if (result.created.length > 0) console.log(`[digital] deteksi anomali: ${result.created.length} anomali baru.`);
      })
      .catch((err) => console.warn('[digital] deteksi anomali gagal:', err?.message || err));
  };
  const first = setTimeout(run, 5 * 60 * 1000);
  const timer = setInterval(run, HOUR_MS);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
};

const secretMatches = (provided: string, secret: string) => {
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** `cronJobs`: job lain yang ikut dijalankan oleh POST /api/internal/cron (mis. keanggotaan fase 3). */
export const createAnomalyRouter = (ctx: DigitalContext, cronJobs: Record<string, () => Promise<unknown>> = {}): Router => {
  const router = express.Router();
  const admin = ctx.requireAdmin;
  const idOk = (id: string) => (ctx.store.kind === 'supabase' ? UUID_RE : /^[A-Za-z0-9_-]{1,64}$/).test(id);

  router.get('/api/admin/digital-access/anomalies', admin, asyncRoute(async (req, res) => {
    const status = String(req.query.status || 'open');
    const open = status === 'open' ? true : status === 'resolved' ? false : undefined;
    const anomalies = await ctx.store.listAnomalies({ open, limit: 200 });
    const users = new Map((await ctx.store.getUserProfiles([...new Set(anomalies.map((a) => a.userId))])).map((u) => [u.id, u]));
    const products = await productRefs(ctx, anomalies.map((a) => a.productId));
    res.json({ anomalies: anomalies.map((a) => publicAnomaly(a, users, products)) });
  }));

  // Selesaikan anomali; opsional aktifkan kembali entitlement yang ditangguhkan otomatis oleh anomali ini.
  router.post('/api/admin/digital-access/anomalies/:id/resolve', admin, asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const anomaly = idOk(id) ? await ctx.store.getAnomaly(id) : null;
    if (!anomaly) throw httpError(404, 'anomaly_not_found', 'Anomali tidak ditemukan.');
    if (anomaly.resolvedAt) throw httpError(409, 'already_resolved', 'Anomali sudah diselesaikan.');
    const body = (req.body || {}) as Record<string, unknown>;
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null;
    let reactivated = 0;
    if (body.reactivate === true && anomaly.suspendedEntitlementIds.length > 0) {
      const suspended = (await ctx.store.listEntitlements({ ids: anomaly.suspendedEntitlementIds })).filter((e) => e.status === 'suspended');
      // Baris blokir judul tidak memberi akses: dipulihkan dengan mencabutnya, sehingga akses rak berlaku lagi.
      const blocks = suspended.filter((e) => e.revokedReason === ANOMALY_TITLE_BLOCK_REASON).map((e) => e.id);
      const ids = suspended.filter((e) => e.revokedReason !== ANOMALY_TITLE_BLOCK_REASON).map((e) => e.id);
      if (blocks.length > 0) await ctx.store.updateEntitlements(blocks, { status: 'revoked', revokedReason: 'anomaly:resolved', statusChangedBy: 'admin' });
      if (ids.length > 0) await ctx.store.updateEntitlements(ids, { status: 'active', revokedReason: null, statusChangedBy: 'admin' });
      reactivated = blocks.length + ids.length;
    }
    await ctx.store.resolveAnomaly(id, 'admin', note);
    res.json({ resolved: true, reactivated });
  }));

  router.post('/api/admin/digital-access/anomalies/scan', admin, asyncRoute(async (_req, res) => {
    const result = await runAnomalyScan(ctx);
    res.json({ candidates: result.candidates, created: result.created.length });
  }));

  // Penjadwal eksternal (opsional). Tanpa CRON_SECRET endpoint ini tidak ada.
  router.post('/api/internal/cron', asyncRoute(async (req, res) => {
    const secret = ctx.config.cronSecret;
    if (!secret) throw httpError(404, 'not_found', 'Tidak ditemukan.');
    const header = String(req.headers.authorization || '');
    const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.headers['x-cron-secret'] || '');
    if (!provided || !secretMatches(provided, secret)) throw httpError(401, 'unauthorized', 'Rahasia cron tidak valid.');
    const result = await runAnomalyScan(ctx);
    const jobs: Record<string, unknown> = {};
    for (const [name, job] of Object.entries(cronJobs)) {
      try {
        jobs[name] = await job();
      } catch (err: any) {
        console.warn(`[digital] job cron ${name} gagal:`, err?.message || err);
        jobs[name] = { error: String(err?.message || err) };
      }
    }
    res.json({ candidates: result.candidates, created: result.created.length, jobs });
  }));

  return router;
};
