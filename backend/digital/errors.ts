import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Error HTTP dengan kode mesin (`code`) yang dipetakan frontend ke teks terjemahan.
 * `message` berbahasa Indonesia untuk log/admin; browser publik menampilkan teks dari digital.json.
 */
export class DigitalHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

/** Pelanggaran keunikan di penyimpanan (mis. idempotency key, sesi aktif ganda). */
export class ConflictError extends Error {}

/** Aturan fase 6 yang dijaga penyimpanan (trigger SQL): jatah judul dan batas akun keluarga. */
export type StoreRule = 'title_quota_full' | 'title_quota_unavailable' | 'family_full' | 'family_owner';

export class StoreRuleError extends Error {
  constructor(readonly rule: StoreRule) {
    super(rule);
  }
}

/**
 * Pesanan/tagihan gagal disimpan: tidak ada transaksi pembayaran yang dibuat dan pembeli mendapat 503
 * (checkout buku cetak, produk digital, dan keanggotaan).
 */
export const ORDER_NOT_SAVED_MESSAGE = 'Pesanan belum dapat diproses, coba lagi.';

export const httpError = (status: number, code: string, message: string, extra?: Record<string, unknown>) =>
  new DigitalHttpError(status, code, message, extra);

/** Bungkus handler async agar error diteruskan ke errorHandler. */
export const asyncRoute = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const digitalErrorHandler = (err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  if (err instanceof DigitalHttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
  }
  console.error('[digital] unhandled error:', err);
  return res.status(500).json({ error: 'Terjadi kesalahan server.', code: 'internal' });
};
