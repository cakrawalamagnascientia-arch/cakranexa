import express, { type NextFunction, type Request, type RequestHandler, type Response, type Router } from 'express';
import { ManuscriptImportError, type ManuscriptAdminService } from './adminService';
import { ManuscriptError } from './service';
import { MANUSCRIPT_CONTRACT_STATUSES, type ManuscriptContractStatus } from './types';

/**
 * Rute admin kontrak naskah fase 5R (/api/admin/manuscripts/...). Semua rute wajib login admin; dokumen diambil
 * dari bucket privat lewat server, tidak ada URL penyimpanan yang dikirim ke browser.
 */
export const createManuscriptAdminRouter = (service: ManuscriptAdminService, requireAdmin: RequestHandler): Router => {
  const router = express.Router();
  const base = '/api/admin/manuscripts';
  const route = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
      fn(req, res).catch(next);
    };
  const noStore = (res: Response) => res.set('Cache-Control', 'private, no-store');
  const id = (req: Request) => String(req.params.id);
  const body = (req: Request) => (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const ACTOR = 'admin';

  router.use(base, requireAdmin);

  router.get(`${base}/options`, route(async (_req, res) => {
    noStore(res).json(await service.options());
  }));

  // Kontrak
  router.get(`${base}/contracts`, route(async (req, res) => {
    const status = String(req.query.status || '');
    noStore(res).json({
      contracts: await service.list({
        authorId: req.query.authorId ? String(req.query.authorId) : undefined,
        bookId: req.query.bookId ? String(req.query.bookId) : undefined,
        statuses: MANUSCRIPT_CONTRACT_STATUSES.includes(status as ManuscriptContractStatus) ? [status as ManuscriptContractStatus] : undefined
      })
    });
  }));
  router.post(`${base}/contracts`, route(async (req, res) => {
    res.status(201).json({ contract: await service.contracts.createContract(body(req)) });
  }));
  router.get(`${base}/contracts/:id`, route(async (req, res) => {
    noStore(res).json(await service.detail(id(req)));
  }));
  router.patch(`${base}/contracts/:id`, route(async (req, res) => {
    res.json({ contract: await service.contracts.updateContract(id(req), body(req)) });
  }));
  router.post(`${base}/contracts/:id/sign`, route(async (req, res) => {
    res.json({ contract: await service.schedule.signContract(id(req)) });
  }));
  router.post(`${base}/contracts/:id/terminate`, route(async (req, res) => {
    res.json({ contract: await service.contracts.terminateContract(id(req), body(req).reason) });
  }));
  router.post(`${base}/contracts/:id/file`, route(async (req, res) => {
    res.status(201).json({ contract: await service.uploadContractFile(id(req), req) });
  }));

  // Jadwal honor
  router.post(`${base}/contracts/:id/payments`, route(async (req, res) => {
    res.status(201).json({ payment: await service.schedule.addPayment(id(req), body(req)) });
  }));
  router.patch(`${base}/payments/:id`, route(async (req, res) => {
    res.json({ payment: await service.schedule.updatePayment(id(req), body(req)) });
  }));
  router.post(`${base}/payments/:id/paid`, route(async (req, res) => {
    res.json({ payment: await service.schedule.markPaymentPaid(id(req), body(req)) });
  }));
  router.post(`${base}/payments/:id/files/:kind`, route(async (req, res) => {
    const kind = req.params.kind === 'proof' ? 'proof' : req.params.kind === 'tax_slip' ? 'tax_slip' : null;
    if (!kind) throw new ManuscriptError(404, 'unknown_file', 'Jenis dokumen tidak dikenal.');
    res.status(201).json({ payment: await service.uploadPaymentFile(id(req), kind, req) });
  }));

  // Addendum
  router.post(`${base}/contracts/:id/addenda`, route(async (req, res) => {
    res.status(201).json({ addendum: await service.addAddendum(id(req), body(req)) });
  }));
  router.post(`${base}/addenda/:id/file`, route(async (req, res) => {
    res.status(201).json({ addendum: await service.uploadAddendumFile(id(req), req) });
  }));

  // Unduh dokumen (bucket privat)
  router.get(`${base}/files/:kind/:id`, route(async (req, res) => {
    const kind = String(req.params.kind);
    if (!['contract', 'addendum', 'proof', 'tax_slip'].includes(kind)) throw new ManuscriptError(404, 'unknown_file', 'Jenis dokumen tidak dikenal.');
    const file = await service.download(kind as 'contract' | 'addendum' | 'proof' | 'tax_slip', id(req));
    noStore(res)
      .set('Content-Type', file.contentType)
      .set('X-Content-Type-Options', 'nosniff')
      .set('Content-Disposition', `inline; filename="${file.filename}"`)
      .send(file.buffer);
  }));

  // Pengingat, laporan, ekspor
  router.get(`${base}/reminders`, route(async (_req, res) => {
    noStore(res).json({ reminders: await service.reminders() });
  }));
  router.post(`${base}/jobs/reminders`, route(async (_req, res) => {
    res.json(await service.runReminderJob());
  }));
  router.get(`${base}/report`, route(async (_req, res) => {
    noStore(res).json({ rows: await service.report() });
  }));
  router.get(`${base}/export/:type`, route(async (req, res) => {
    const file = await service.exportCsv(String(req.params.type).replace(/\.csv$/, ''));
    noStore(res)
      .set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${file.filename}"`)
      .send(file.body);
  }));

  // Impor CSV kontrak lama
  router.post(`${base}/import/preview`, route(async (req, res) => {
    noStore(res).json({ preview: await service.importPreview(body(req).csv) });
  }));
  router.post(`${base}/import/commit`, route(async (req, res) => {
    res.status(201).json(await service.importCommit(body(req).csv));
  }));

  // Akun login penulis
  router.get(`${base}/authors`, route(async (_req, res) => {
    noStore(res).json({ authors: await service.authorAccounts() });
  }));
  router.get(`${base}/authors/:id/links`, route(async (req, res) => {
    noStore(res).json({ links: await service.links.links(id(req)) });
  }));
  router.post(`${base}/authors/:id/link`, route(async (req, res) => {
    res.json({ author: await service.links.adminLink(id(req), body(req), ACTOR) });
  }));
  router.post(`${base}/authors/:id/unlink`, route(async (req, res) => {
    res.json({ author: await service.links.adminUnlink(id(req), ACTOR) });
  }));

  router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof ManuscriptImportError) return res.status(err.status).json({ error: err.message, code: err.code, preview: err.preview });
    if (err instanceof ManuscriptError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('[manuscripts] error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server.', code: 'internal' });
  });

  return router;
};
