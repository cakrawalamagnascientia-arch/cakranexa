import express, { type NextFunction, type Request, type RequestHandler, type Response, type Router } from 'express';
import { PrintCheckoutError } from './errors';
import type { PrintCheckoutService } from './service';

/**
 * Rute pesanan buku cetak.
 * Publik: konfigurasi checkout, cari wilayah & tarif kurir (RajaOngkir), buat pesanan, status (tanpa data pribadi),
 * halaman pesanan & unggah bukti (bertoken).
 * Admin: daftar pesanan, ubah status/resi, konfirmasi pembayaran, isi ongkir (dengan tarif RajaOngkir), perpanjang,
 * bukti, tanda uji, pengaturan ongkir/kode unik, payment_routing, dan job kedaluwarsa.
 */
export const createPrintCheckoutRouter = (service: PrintCheckoutService, requireAdmin: RequestHandler): Router => {
  const router = express.Router();
  const route = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
      fn(req, res).catch(next);
    };
  const noStore = (res: Response) => res.set('Cache-Control', 'private, no-store');
  const id = (req: Request) => String(req.params.id);
  // Batas per IP untuk rute yang memanggil RajaOngkir (kuota API).
  const perIpLimit = (max: number, windowMs: number): RequestHandler => {
    const hits = new Map<string, { count: number; resetAt: number }>();
    return (req, res, next) => {
      const now = Date.now();
      if (hits.size > 5000) for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
      const key = req.ip || 'unknown';
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }
      if (entry.count >= max) {
        return res.status(429).json({ error: 'Terlalu banyak permintaan ongkos kirim. Coba lagi beberapa menit lagi.', code: 'rate_limited' });
      }
      entry.count += 1;
      return next();
    };
  };

  // ---------------------------------------------------------------- publik
  router.get('/api/print-checkout/config', route(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60').json(await service.publicConfig());
  }));

  // Ongkir RajaOngkir: cari kecamatan/kelurahan tujuan, lalu tarif kurir untuk isi keranjang.
  router.get('/api/shipping/destinations', perIpLimit(120, 10 * 60_000), route(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600').json(await service.searchDestinations(req.query.q));
  }));

  router.post('/api/shipping/quote', perIpLimit(90, 10 * 60_000), route(async (req, res) => {
    noStore(res).json(await service.quoteRates(req.body));
  }));

  router.post('/api/orders', route(async (req, res) => {
    res.status(201).json(await service.createOrder(req.body, req.headers.authorization));
  }));

  router.get('/api/orders/:id/status', route(async (req, res) => {
    noStore(res).json(await service.publicStatus(id(req)));
  }));

  router.get('/api/orders/:id/detail', route(async (req, res) => {
    noStore(res).json(await service.orderDetail(id(req), req.query.t));
  }));

  router.post('/api/orders/:id/proof', route(async (req, res) => {
    noStore(res).status(201).json(await service.uploadProof(id(req), req.query.t, req));
  }));

  // ----------------------------------------------------------------- admin
  router.get('/api/orders', requireAdmin, route(async (_req, res) => {
    noStore(res).json(await service.adminList());
  }));

  router.patch('/api/orders/:id', requireAdmin, route(async (req, res) => {
    res.json(await service.adminUpdate(id(req), req.body || {}));
  }));

  router.post('/api/admin/print-orders/:id/confirm-payment', requireAdmin, route(async (req, res) => {
    res.json(await service.confirmPayment(id(req), req.body || {}));
  }));

  router.post('/api/admin/print-orders/:id/shipping-quote', requireAdmin, route(async (req, res) => {
    res.json(await service.setShippingQuote(id(req), req.body || {}));
  }));

  router.get('/api/admin/print-orders/:id/shipping-rates', requireAdmin, route(async (req, res) => {
    noStore(res).json(await service.adminOrderRates(id(req)));
  }));

  router.post('/api/admin/print-orders/:id/extend', requireAdmin, route(async (req, res) => {
    res.json(await service.extendDeadline(id(req), req.body || {}));
  }));

  router.patch('/api/admin/print-orders/:id/test', requireAdmin, route(async (req, res) => {
    res.json(await service.setTest(id(req), req.body || {}));
  }));

  router.get('/api/admin/print-orders/:id/proof', requireAdmin, route(async (req, res) => {
    const proof = await service.adminProof(id(req));
    noStore(res).set('Content-Type', proof.contentType).set('X-Content-Type-Options', 'nosniff').send(proof.buffer);
  }));

  router.get('/api/admin/print-checkout/settings', requireAdmin, route(async (_req, res) => {
    noStore(res).json({ settings: await service.settings(), rajaongkir: { configured: service.rajaOngkirConfigured }, usage: await service.apiUsage() });
  }));

  router.put('/api/admin/print-checkout/settings', requireAdmin, route(async (req, res) => {
    res.json({ settings: await service.saveSettings(req.body?.settings ?? req.body), rajaongkir: { configured: service.rajaOngkirConfigured }, usage: await service.apiUsage() });
  }));

  router.get('/api/admin/payment-routing', requireAdmin, route(async (_req, res) => {
    noStore(res).json({ routing: await service.routing() });
  }));

  router.put('/api/admin/payment-routing', requireAdmin, route(async (req, res) => {
    res.json({ routing: await service.saveRouting(req.body) });
  }));

  router.post('/api/admin/print-orders/jobs/run', requireAdmin, route(async (_req, res) => {
    res.json(await service.runJob());
  }));

  // Error rute pesanan cetak -> JSON { error, code } (checkout menampilkan `error` apa adanya).
  router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof PrintCheckoutError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('[print] error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server.', code: 'internal' });
  });

  return router;
};
