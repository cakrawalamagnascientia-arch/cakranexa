import crypto from 'crypto';
import express, { type Router } from 'express';
import { asyncRoute, httpError } from './errors';
import type { DigitalContext } from './context';
import { deviceLabel } from './access';
import { isEntitlementUsable, maxDevicesForUser } from './entitlements';
import type { AnomalyRecord, EntitlementStatus, OrderRecord, UserProfile } from './types';

/**
 * Admin produk digital:
 *  - Ringkasan penjualan TANPA pesanan uji (is_test = pembeli di DIGITAL_BETA_EMAILS) dan hapus pesanan uji
 *    (HANYA pesanan is_test beserta entitlement pembeliannya; transaksi Midtrans tidak ikut dibatalkan).
 *  - Tab "Entitlement & Akses": cari pengguna, lihat hak akses/perangkat/sesi/pesanan/log, beri akses (admin_grant),
 *    tangguhkan/aktifkan/cabut, lepas perangkat tanpa jeda 30 hari, akhiri sesi.
 */

const MAX_ORDERS = 5000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ADMIN_ACTOR = 'admin';

const summarize = (orders: OrderRecord[]) => {
  const paid = orders.filter((o) => o.status === 'paid');
  const refunded = orders.filter((o) => o.status === 'refunded');
  return {
    paidCount: paid.length,
    revenue: paid.reduce((sum, o) => sum + o.amount, 0),
    itemsSold: paid.reduce((sum, o) => sum + o.items.length, 0),
    pendingCount: orders.filter((o) => o.status === 'pending' || o.status === 'challenge').length,
    refundedCount: refunded.length,
    refundedAmount: refunded.reduce((sum, o) => sum + o.amount, 0)
  };
};

export const adminOrder = (o: OrderRecord) => ({
  orderNumber: o.orderNumber,
  status: o.status,
  amount: o.amount,
  customerName: o.customerName,
  customerEmail: o.customerEmail,
  createdAt: o.createdAt,
  paidAt: o.paidAt,
  isTest: o.isTest,
  items: o.items.map((item) => ({ title: item.title, format: item.format, unitPrice: item.unitPrice }))
});

export interface AdminProductRef {
  id: string;
  format: 'ebook' | 'audiobook';
  bookId: string;
  title: string;
}

/** Judul produk untuk tampilan admin (id -> ringkasan), tanpa path penyimpanan. */
export const productRefs = async (ctx: DigitalContext, ids: Array<string | null>): Promise<Map<string, AdminProductRef>> => {
  const refs = new Map<string, AdminProductRef>();
  for (const id of new Set(ids)) {
    if (!id) continue;
    const product = await ctx.store.getProduct(id);
    if (!product) continue;
    const book = await ctx.getBook(product.bookId);
    refs.set(id, { id, format: product.format, bookId: product.bookId, title: book?.title || product.bookId });
  }
  return refs;
};

export const publicAnomaly = (a: AnomalyRecord, users: Map<string, UserProfile>, products: Map<string, AdminProductRef>) => ({
  id: a.id,
  userId: a.userId,
  user: users.get(a.userId) ?? null,
  productId: a.productId,
  product: a.productId ? products.get(a.productId) ?? null : null,
  rule: a.rule,
  details: a.details,
  actionTaken: a.actionTaken,
  suspendedEntitlementIds: a.suspendedEntitlementIds,
  detectedAt: a.detectedAt,
  resolvedAt: a.resolvedAt,
  resolvedBy: a.resolvedBy,
  resolutionNote: a.resolutionNote
});

/** ID pengguna Supabase selalu UUID; ID lain mengikuti store (UUID di Supabase, sederhana di store memori). */
const assertUserId = (id: string) => {
  if (!UUID_RE.test(id)) throw httpError(404, 'user_not_found', 'Pengguna tidak ditemukan.');
};
const recordIdOk = (ctx: DigitalContext, id: string) => (ctx.store.kind === 'supabase' ? UUID_RE : LOCAL_ID_RE).test(id);

export const createAdminDigitalRouter = (ctx: DigitalContext): Router => {
  const router = express.Router();
  const admin = ctx.requireAdmin;

  // ---- Penjualan
  router.get('/api/admin/digital-access/orders/summary', admin, asyncRoute(async (_req, res) => {
    const [real, tests] = await Promise.all([
      ctx.store.listOrders({ isTest: false, limit: MAX_ORDERS }),
      ctx.store.listOrders({ isTest: true, limit: MAX_ORDERS })
    ]);
    const paidTests = tests.filter((o) => o.status === 'paid');
    res.json({
      featureEnabled: ctx.feature.enabled,
      betaEmailCount: ctx.config.betaEmails.length,
      summary: summarize(real),
      recent: real.slice(0, 20).map(adminOrder),
      test: {
        count: tests.length,
        paidCount: paidTests.length,
        paidAmount: paidTests.reduce((sum, o) => sum + o.amount, 0),
        orders: tests.slice(0, 20).map(adminOrder)
      }
    });
  }));

  router.delete('/api/admin/digital-access/test-orders', admin, asyncRoute(async (req, res) => {
    if ((req.body || {}).confirm !== true) throw httpError(400, 'confirm_required', 'Konfirmasi penghapusan diperlukan.');
    // Filter ganda: hanya baris yang benar-benar ditandai is_test.
    const orderIds = (await ctx.store.listOrders({ isTest: true, limit: MAX_ORDERS })).filter((o) => o.isTest).map((o) => o.id);
    let entitlementsDeleted = 0;
    if (orderIds.length > 0) {
      const entitlements = (await Promise.all(orderIds.map((id) => ctx.store.listEntitlements({ source: 'purchase', sourceRef: id })))).flat();
      for (const e of entitlements) await ctx.store.endSessions({ userId: e.userId, productId: e.productId ?? undefined }, 'revoked');
      if (entitlements.length > 0) await ctx.store.deleteEntitlements(entitlements.map((e) => e.id));
      entitlementsDeleted = entitlements.length;
      await ctx.store.deleteOrders(orderIds);
    }
    console.log(`[digital] admin menghapus ${orderIds.length} pesanan uji dan ${entitlementsDeleted} entitlement terkait.`);
    res.json({ ordersDeleted: orderIds.length, entitlementsDeleted });
  }));

  // ---- Entitlement & Akses
  router.get('/api/admin/digital-access/users', admin, asyncRoute(async (req, res) => {
    const query = String(req.query.q || '').trim().slice(0, 100);
    res.json({ users: await ctx.store.findUsers(query, 25) });
  }));

  router.get('/api/admin/digital-access/users/:userId', admin, asyncRoute(async (req, res) => {
    const userId = String(req.params.userId);
    assertUserId(userId);
    const now = ctx.now();
    const [profiles, entitlements, devices, sessions, orders, logs, anomalies] = await Promise.all([
      ctx.store.getUserProfiles([userId]),
      ctx.store.listEntitlements({ userId }),
      ctx.store.listDevices(userId, true),
      ctx.store.listOpenSessions({ userId }),
      ctx.store.listOrdersForUser(userId),
      ctx.store.listAccessLogs(userId, 100),
      ctx.store.listAnomalies({ userId, limit: 50 })
    ]);
    const user = profiles[0] ?? { id: userId, email: '', fullName: '' };
    const products = await productRefs(ctx, [
      ...entitlements.map((e) => e.productId),
      ...sessions.map((s) => s.productId),
      ...logs.map((l) => l.productId),
      ...anomalies.map((a) => a.productId)
    ]);
    const deviceById = new Map(devices.map((d) => [d.id, d]));
    res.json({
      user,
      maxDevices: await maxDevicesForUser(ctx, userId),
      entitlements: entitlements
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((e) => ({ ...e, usable: isEntitlementUsable(e, now), product: e.productId ? products.get(e.productId) ?? null : null })),
      devices: devices
        .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
        .map((d) => ({
          id: d.id,
          label: d.label || deviceLabel(d.userAgent),
          userAgent: d.userAgent,
          firstSeen: d.firstSeen,
          lastSeen: d.lastSeen,
          releasedAt: d.releasedAt,
          releasedBy: d.releasedBy
        })),
      sessions: sessions.map((s) => ({
        id: s.id,
        productId: s.productId,
        product: products.get(s.productId) ?? null,
        deviceId: s.deviceId,
        deviceLabel: s.deviceId && deviceById.get(s.deviceId) ? deviceById.get(s.deviceId)!.label || deviceLabel(deviceById.get(s.deviceId)!.userAgent) : null,
        ip: s.ip,
        startedAt: s.startedAt,
        lastHeartbeat: s.lastHeartbeat,
        alive: now.getTime() - Date.parse(s.lastHeartbeat) < ctx.config.heartbeatWindowMs
      })),
      orders: orders.map(adminOrder),
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        productId: l.productId,
        product: l.productId ? products.get(l.productId) ?? null : null,
        ip: l.ip ?? null,
        userAgent: l.userAgent ? l.userAgent.slice(0, 160) : null,
        meta: l.meta ?? {},
        createdAt: l.createdAt
      })),
      anomalies: anomalies.map((a) => publicAnomaly(a, new Map([[user.id, user]]), products))
    });
  }));

  // Beri akses manual (source admin_grant). Batas perangkat & masa berlaku opsional.
  router.post('/api/admin/digital-access/entitlements', admin, asyncRoute(async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const userId = String(body.userId || '');
    const productId = String(body.productId || '');
    assertUserId(userId);
    const product = recordIdOk(ctx, productId) ? await ctx.store.getProduct(productId) : null;
    if (!product) throw httpError(404, 'product_not_found', 'Produk digital tidak ditemukan.');
    const now = ctx.now();
    let endsAt: string | null = null;
    if (body.endsAt !== undefined && body.endsAt !== null && body.endsAt !== '') {
      const parsed = Date.parse(String(body.endsAt));
      if (!Number.isFinite(parsed) || parsed <= now.getTime()) throw httpError(400, 'invalid_ends_at', 'Tanggal berakhir harus di masa depan.');
      endsAt = new Date(parsed).toISOString();
    }
    const maxDevices = body.maxDevices === undefined || body.maxDevices === null ? ctx.config.defaultMaxDevices : Number(body.maxDevices);
    if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10) throw httpError(400, 'invalid_max_devices', 'Batas perangkat harus 1–10.');
    // entitlements.source_ref bertipe UUID: satu UUID acak per pemberian akses (source = admin_grant).
    const sourceRef = crypto.randomUUID();
    await ctx.store.insertEntitlements([{
      userId,
      productId,
      scope: 'product',
      source: 'admin_grant',
      sourceRef,
      startsAt: now.toISOString(),
      endsAt,
      maxDevices,
      statusChangedBy: ADMIN_ACTOR
    }]);
    const [entitlement] = await ctx.store.listEntitlements({ userId, productId, source: 'admin_grant', sourceRef });
    console.log(`[digital] admin memberi akses ${productId} kepada ${userId} (sampai ${endsAt ?? 'selamanya'}).`);
    res.status(201).json({ entitlement });
  }));

  router.patch('/api/admin/digital-access/entitlements/:id', admin, asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const body = (req.body || {}) as Record<string, unknown>;
    const status = String(body.status || '') as EntitlementStatus;
    if (!['active', 'suspended', 'revoked'].includes(status)) throw httpError(400, 'invalid_status', 'Status harus active, suspended, atau revoked.');
    const entitlement = recordIdOk(ctx, id) ? await ctx.store.getEntitlement(id) : null;
    if (!entitlement) throw httpError(404, 'entitlement_not_found', 'Hak akses tidak ditemukan.');
    const reason = status === 'active' ? null : String(body.reason || ADMIN_ACTOR).slice(0, 200);
    await ctx.store.updateEntitlements([id], { status, revokedReason: reason, statusChangedBy: ADMIN_ACTOR });
    // Hak rak (productId null) mengakhiri semua sesi pengguna; hak produk hanya sesi produk itu.
    if (status !== 'active') await ctx.store.endSessions({ userId: entitlement.userId, productId: entitlement.productId ?? undefined }, status === 'revoked' ? 'revoked' : 'admin');
    res.json({ entitlement: await ctx.store.getEntitlement(id) });
  }));

  // Lepas perangkat oleh admin: tanpa jeda 30 hari dan tidak dihitung sebagai pelepasan oleh pengguna.
  router.post('/api/admin/digital-access/devices/:id/release', admin, asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const device = recordIdOk(ctx, id) ? await ctx.store.getDevice(id) : null;
    if (!device) throw httpError(404, 'device_not_found', 'Perangkat tidak ditemukan.');
    if (device.releasedAt) throw httpError(409, 'already_released', 'Perangkat sudah dilepas.');
    await ctx.store.updateDevice(id, { releasedAt: ctx.now().toISOString(), releasedBy: ADMIN_ACTOR });
    const ended = await ctx.store.endSessions({ deviceId: id }, 'device_released');
    res.json({ released: true, sessionsEnded: ended });
  }));

  router.post('/api/admin/digital-access/users/:userId/end-sessions', admin, asyncRoute(async (req, res) => {
    const userId = String(req.params.userId);
    assertUserId(userId);
    res.json({ sessionsEnded: await ctx.store.endSessions({ userId }, 'admin') });
  }));

  return router;
};
