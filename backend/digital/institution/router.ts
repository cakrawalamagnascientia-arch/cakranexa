import express, { type Response, type Router } from 'express';
import { asyncRoute, httpError } from '../errors';
import type { DigitalContext } from '../context';
import type { InstitutionService } from './service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kirim PDF invoice (tidak disimpan cache, tidak diindeks). */
export const sendInvoicePdf = (res: Response, number: string, pdf: Buffer, disposition: 'inline' | 'attachment' = 'attachment') => {
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `${disposition}; filename="${number}.pdf"`);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Robots-Tag', 'noindex');
  res.set('Cache-Control', 'private, no-store');
  res.send(pdf);
};

/**
 * Endpoint publik institusi. Langkah 2: unduh PDF invoice lewat tautan bertanda tangan dari email (kontak institusi
 * belum tentu punya akun). Tautan terikat ke satu invoice dan kedaluwarsa; invoice yang dibatalkan tidak diunduh.
 */
export const createInstitutionRouter = (_ctx: DigitalContext, service: InstitutionService): Router => {
  const router = express.Router();

  router.get('/api/institution/invoices/:id/pdf', asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const token = String(req.query.t || '');
    if (!UUID_RE.test(id) || !service.verifyInvoiceToken(id, token)) {
      throw httpError(403, 'invalid_link', 'Tautan invoice tidak valid atau sudah kedaluwarsa. Minta tautan baru ke CakraNexa.');
    }
    const invoice = await service.store.getInvoice(id);
    if (!invoice || invoice.status === 'draft') throw httpError(404, 'invoice_not_found', 'Invoice tidak ditemukan.');
    if (invoice.status === 'void') throw httpError(410, 'invoice_void', 'Invoice ini sudah dibatalkan.');
    sendInvoicePdf(res, invoice.number, await service.invoicePdf(invoice));
  }));

  return router;
};
