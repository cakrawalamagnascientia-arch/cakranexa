import crypto from 'crypto';
import express, { type Router } from 'express';
import { asyncRoute, ConflictError, httpError } from './errors';
import { LICENSE_VERSION } from './config';
import { purchaseConfirmationEmail } from './email';
import { resolveEntitlement } from './entitlements';
import type { DigitalContext, MidtransSettings } from './context';
import type { DigitalOrderStatus, OrderPatch, OrderRecord, ProductRecord } from './types';

/**
 * Pembelian satuan e-book/audiobook via Midtrans Snap (mekanisme sama dengan buku cetak).
 *  - POST /api/digital/checkout: wajib login; idempotency_key yang sama mengembalikan pesanan yang sama.
 *  - Entitlement HANYA dibuat dari webhook Midtrans (settlement / capture-accept), tidak pernah dari endpoint
 *    yang dipanggil frontend. Refund/chargeback mencabut entitlement pesanan tersebut.
 */

export const DIGITAL_ORDER_PREFIX = 'DIG-';
export const isDigitalOrderId = (orderId: unknown) => typeof orderId === 'string' && orderId.startsWith(DIGITAL_ORDER_PREFIX);

export interface MidtransClient {
  createTransaction(payload: Record<string, unknown>): Promise<{ token: string; redirectUrl: string | null }>;
}

export const createMidtransClient = (settings: MidtransSettings, fetchImpl: typeof fetch = fetch): MidtransClient => ({
  async createTransaction(payload) {
    const response = await fetchImpl(settings.snapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${settings.serverKey}:`).toString('base64')}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Midtrans Snap HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = (await response.json()) as { token?: string; redirect_url?: string };
    if (!data.token) throw new Error('Midtrans tidak mengembalikan token Snap.');
    return { token: data.token, redirectUrl: data.redirect_url || null };
  }
});

export const verifyMidtransSignature = (serverKey: string, notification: Record<string, unknown>): boolean => {
  if (!serverKey) return false;
  const expected = crypto.createHash('sha512')
    .update(`${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(notification.signature_key || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Status Midtrans -> status pesanan digital. */
export const mapMidtransToOrderStatus = (transactionStatus: string, fraudStatus?: string): DigitalOrderStatus => {
  switch (transactionStatus) {
    case 'capture':
      return fraudStatus === 'challenge' ? 'challenge' : fraudStatus === 'deny' ? 'failed' : 'paid';
    case 'settlement':
      return 'paid';
    case 'pending':
      return 'pending';
    case 'deny':
    case 'failure':
      return 'failed';
    case 'cancel':
      return 'cancelled';
    case 'expire':
      return 'expired';
    case 'refund':
    case 'partial_refund':
    case 'chargeback':
    case 'partial_chargeback':
      return 'refunded';
    default:
      return 'pending';
  }
};

const FORMAT_SUFFIX = { ebook: 'E-Book', audiobook: 'Audiobook' } as const;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,100}$/;

/** Pesanan untuk browser pemiliknya (tanpa data internal Midtrans). */
export const publicOrder = (order: OrderRecord) => ({
  orderNumber: order.orderNumber,
  status: order.status,
  amount: order.amount,
  currency: 'IDR',
  createdAt: order.createdAt,
  paidAt: order.paidAt,
  refundedAt: order.refundedAt,
  items: order.items.map((item) => ({ productId: item.productId, bookId: item.bookId, format: item.format, title: item.title, unitPrice: item.unitPrice })),
  // Token Snap hanya berguna selama pesanan masih menunggu pembayaran.
  snapToken: order.status === 'pending' ? order.snapToken : null,
  redirectUrl: order.status === 'pending' ? order.snapRedirectUrl : null
});

const newOrderNumber = (now: Date) => {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `${DIGITAL_ORDER_PREFIX}${date}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
};

export const createCheckoutRouter = (ctx: DigitalContext, midtrans: MidtransClient): Router => {
  const router = express.Router();

  router.post('/api/digital/checkout', ctx.requireUser, asyncRoute(async (req, res) => {
    const user = req.digitalUser!;
    const body = req.body || {};
    const idempotencyKey = String(body.idempotency_key || '');
    const items: string[] = Array.isArray(body.items) ? [...new Set(body.items.map((id: unknown) => String(id)))] as string[] : [];
    if (!IDEMPOTENCY_RE.test(idempotencyKey)) throw httpError(400, 'invalid_request', 'idempotency_key tidak valid.');
    if (items.length === 0 || items.length > 10) throw httpError(400, 'invalid_request', 'Pilih 1–10 produk.');
    if (body.license_accepted !== true) throw httpError(400, 'license_required', 'Setujui ketentuan lisensi terlebih dahulu.');
    if (!user.email) throw httpError(400, 'email_required', 'Akun tanpa email tidak dapat membeli.');

    // Kunci yang sama -> pesanan yang sama (klik ganda, koneksi putus, muat ulang).
    const existing = await ctx.store.getOrderByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.userId !== user.id) throw httpError(409, 'idempotency_conflict', 'Kunci idempotensi sudah dipakai.');
      return res.json({ order: publicOrder(existing), reused: true });
    }

    if (!ctx.midtrans.enabled) throw httpError(503, 'payment_unavailable', 'Pembayaran online belum dikonfigurasi.');

    const products: ProductRecord[] = [];
    const unavailable: string[] = [];
    for (const id of items) {
      const product = await ctx.store.getProduct(id);
      if (!product || !product.isActive || product.availabilityStatus !== 'available' || product.price <= 0) unavailable.push(id);
      else products.push(product);
    }
    if (unavailable.length > 0) throw httpError(400, 'product_unavailable', 'Sebagian produk belum dapat dibeli.', { productIds: unavailable });

    const owned: string[] = [];
    const suspended: string[] = [];
    for (const product of products) {
      const access = await resolveEntitlement(ctx, user.id, product.id);
      if (access.entitlement) owned.push(product.id);
      else if (access.reason === 'suspended') suspended.push(product.id);
    }
    if (owned.length > 0) throw httpError(409, 'already_owned', 'Anda sudah memiliki produk ini.', { productIds: owned });
    if (suspended.length > 0) throw httpError(409, 'suspended', 'Akses produk ini sedang ditangguhkan. Hubungi kami.', { productIds: suspended });

    const orderItems: OrderRecord['items'] = [];
    for (const product of products) {
      const book = await ctx.getBook(product.bookId);
      orderItems.push({
        productId: product.id,
        bookId: product.bookId,
        format: product.format,
        title: `${book?.title || product.bookId} (${FORMAT_SUFFIX[product.format]})`,
        unitPrice: product.price
      });
    }
    const amount = orderItems.reduce((sum, item) => sum + item.unitPrice, 0);
    const now = ctx.now();
    const language = ['id', 'en', 'zh'].includes(body.language) ? String(body.language) : 'id';

    let order: OrderRecord;
    try {
      order = await ctx.store.createOrder({
        orderNumber: newOrderNumber(now),
        userId: user.id,
        idempotencyKey,
        status: 'pending',
        amount,
        customerName: user.name || user.email,
        customerEmail: user.email,
        language,
        licenseAcceptedAt: now.toISOString(),
        licenseVersion: LICENSE_VERSION,
        snapToken: null,
        snapRedirectUrl: null,
        midtransTransactionId: null,
        midtransStatus: null,
        paymentType: null,
        fraudStatus: null,
        paidAt: null,
        refundedAt: null,
        confirmationSentAt: null,
        isTest: ctx.feature.isBeta(user.email),
        items: orderItems
      });
    } catch (err) {
      if (err instanceof ConflictError) {
        const raced = await ctx.store.getOrderByIdempotencyKey(idempotencyKey);
        if (raced && raced.userId === user.id) return res.json({ order: publicOrder(raced), reused: true });
      }
      throw err;
    }

    try {
      const snap = await midtrans.createTransaction({
        transaction_details: { order_id: order.orderNumber, gross_amount: amount },
        item_details: orderItems.map((item) => ({
          id: item.productId.slice(0, 50),
          price: item.unitPrice,
          quantity: 1,
          name: item.title.slice(0, 50)
        })),
        // Hanya nama & email: nomor telepon pembeli tidak dikumpulkan untuk produk digital.
        customer_details: { first_name: order.customerName.slice(0, 50), email: order.customerEmail },
        // Pembayaran lewat halaman redirect (mis. aplikasi e-wallet di ponsel) kembali ke halaman status pesanan.
        callbacks: {
          finish: `${ctx.config.siteUrl}${order.language === 'id' ? '' : `/${order.language}`}/digital/checkout?order=${encodeURIComponent(order.orderNumber)}`
        }
      });
      order = await ctx.store.updateOrder(order.id, { snapToken: snap.token, snapRedirectUrl: snap.redirectUrl });
    } catch (err: any) {
      console.error('[digital] Midtrans Snap gagal:', err?.message || err);
      await ctx.store.updateOrder(order.id, { status: 'failed', midtransStatus: 'snap_error' });
      throw httpError(502, 'payment_error', 'Gagal memulai pembayaran. Coba lagi.');
    }
    return res.status(201).json({ order: publicOrder(order), reused: false });
  }));

  router.get('/api/digital/orders', ctx.requireUser, asyncRoute(async (req, res) => {
    const orders = await ctx.store.listOrdersForUser(req.digitalUser!.id);
    res.json({ orders: orders.map(publicOrder) });
  }));

  router.get('/api/digital/orders/:orderNumber', ctx.requireUser, asyncRoute(async (req, res) => {
    const order = await ctx.store.getOrderByNumber(req.params.orderNumber);
    if (!order || order.userId !== req.digitalUser!.id) throw httpError(404, 'order_not_found', 'Pesanan tidak ditemukan.');
    res.json({ order: publicOrder(order) });
  }));

  return router;
};

/**
 * Notifikasi Midtrans untuk pesanan DIG-. Idempoten: webhook ganda tidak membuat entitlement ganda
 * (UNIQUE user+produk+source+source_ref) dan email konfirmasi hanya dikirim sekali (klaim atomik).
 * Hanya operasi database yang ditunggu; email dikirim di latar agar Midtrans cepat menerima 200.
 * Error database dilempar -> pemanggil membalas 500 -> Midtrans mengirim ulang notifikasi.
 */
export const handleDigitalNotification = async (
  ctx: DigitalContext,
  notification: Record<string, any>
): Promise<{ status: number; body: Record<string, unknown> }> => {
  if (!verifyMidtransSignature(ctx.midtrans.serverKey, notification)) {
    console.warn('[digital] webhook Midtrans dengan signature tidak valid ditolak:', notification.order_id);
    return { status: 403, body: { error: 'Invalid signature' } };
  }
  const order = await ctx.store.getOrderByNumber(String(notification.order_id));
  if (!order) return { status: 404, body: { error: 'Order not found' } };
  if (Math.round(Number(notification.gross_amount)) !== order.amount) {
    console.error(`[digital] nominal webhook ${notification.gross_amount} tidak sama dengan pesanan ${order.orderNumber} (${order.amount})`);
    return { status: 400, body: { error: 'Amount mismatch' } };
  }

  const nowIso = ctx.now().toISOString();
  const target = mapMidtransToOrderStatus(String(notification.transaction_status), notification.fraud_status);
  const patch: OrderPatch = {
    midtransStatus: String(notification.transaction_status),
    midtransTransactionId: notification.transaction_id ? String(notification.transaction_id) : order.midtransTransactionId,
    paymentType: notification.payment_type ? String(notification.payment_type) : order.paymentType,
    fraudStatus: notification.fraud_status ? String(notification.fraud_status) : order.fraudStatus
  };

  if (target === 'refunded') {
    patch.status = 'refunded';
    patch.refundedAt = order.refundedAt || nowIso;
    await ctx.store.updateOrder(order.id, patch);
    const entitlements = await ctx.store.listEntitlements({ source: 'purchase', sourceRef: order.id });
    const toRevoke = entitlements.filter((e) => e.status !== 'revoked');
    if (toRevoke.length > 0) {
      await ctx.store.updateEntitlements(toRevoke.map((e) => e.id), {
        status: 'revoked',
        revokedReason: String(notification.transaction_status),
        statusChangedBy: 'webhook'
      });
      for (const e of toRevoke) await ctx.store.endSessions({ userId: e.userId, productId: e.productId }, 'revoked');
    }
    return { status: 200, body: { status: 'success', revoked: toRevoke.length } };
  }

  if (target === 'paid') {
    if (order.status !== 'refunded') {
      patch.status = 'paid';
      patch.paidAt = order.paidAt || nowIso;
    }
    const updated = await ctx.store.updateOrder(order.id, patch);
    if (updated.status !== 'paid') return { status: 200, body: { status: 'ignored' } };
    const created = await ctx.store.insertEntitlements(updated.items.map((item) => ({
      userId: updated.userId,
      productId: item.productId,
      source: 'purchase' as const,
      sourceRef: updated.id,
      maxDevices: ctx.config.defaultMaxDevices,
      statusChangedBy: 'webhook'
    })));
    if (!updated.confirmationSentAt && await ctx.store.claimConfirmationEmail(updated.id, ctx.now().toISOString())) {
      ctx.defer(async () => {
        try {
          const email = purchaseConfirmationEmail(updated, ctx.config.siteUrl);
          await ctx.mailer.send({ to: [updated.customerEmail], subject: email.subject, html: email.html });
        } catch (err: any) {
          // Lepas klaim agar notifikasi berikutnya untuk pesanan ini mencoba mengirim lagi.
          console.warn('[digital] email konfirmasi gagal:', err?.message || err);
          await ctx.store.updateOrder(updated.id, { confirmationSentAt: null });
        }
      });
    }
    return { status: 200, body: { status: 'success', entitlementsCreated: created } };
  }

  // Status lain tidak menurunkan pesanan yang sudah dibayar/di-refund.
  if (order.status !== 'paid' && order.status !== 'refunded') patch.status = target;
  await ctx.store.updateOrder(order.id, patch);
  return { status: 200, body: { status: 'success' } };
};
