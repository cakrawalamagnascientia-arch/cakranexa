import express, { type RequestHandler, type Router } from 'express';
import sharp from 'sharp';
import { asyncRoute, httpError } from './errors';
import { clientInfo, type DigitalContext } from './context';
import { isValidRecordId, requireEntitlement, requireSession } from './access';
import { createUserRateLimiter } from './rateLimits';
import { AssetNotFoundError, assetPaths } from './storage';
import type { AuthUser, NoteColor, NoteRecord, NoteRect, ReadingEventInput } from './types';

/**
 * Reader e-book (langkah 5). Semua endpoint: login + sesi hidup (X-Session-Token) + entitlement yang berlaku.
 *  - Halaman: PNG dari bucket privat -> watermark (nama · email · ID entitlement, 3× diagonal + footer) -> WebP,
 *    `Cache-Control: private, no-store`. File utuh tidak pernah dikirim; nomor telepon tidak pernah dipakai.
 *  - Pencarian teks (cuplikan ±80 karakter, maks. 200), catatan/sorotan, progres, dan reading_events tervalidasi
 *    (hanya halaman yang benar-benar dikirim di sesi ini, total durasi <= waktu yang berlalu).
 */

const NOTE_COLORS: NoteColor[] = ['yellow', 'green', 'blue', 'pink'];
const MAX_NOTES_PER_PRODUCT = 2000;
const MAX_NOTE_TEXT = 2000;
const MAX_SEARCH_RESULTS = 30;
/** Verified reading: dwell < 2 dtk dianggap membalik halaman; > 5 menit dipotong (layar ditinggal). */
const MIN_DWELL_MS = 2000;
const MAX_DWELL_MS = 5 * 60 * 1000;
const EVENT_TOLERANCE_MS = 5000;
const SOURCE_CACHE_BYTES = 96 * 1024 * 1024;
const SERVED_TTL_MS = 6 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Watermark
// ---------------------------------------------------------------------------

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));

export interface WatermarkText {
  mark: string;
  footer: string;
}

/** Identitas lisensi: nama, email, dan ID entitlement (tanpa nomor telepon). */
export const watermarkText = (user: AuthUser, entitlementId: string, now: Date): WatermarkText => {
  const name = (user.name || user.email).slice(0, 60);
  const email = user.email.slice(0, 80);
  const stamp = `${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  return {
    mark: `${name} · ${email} · ${entitlementId}`,
    footer: `Lisensi personal: ${name} · ${email} · ID ${entitlementId} · ${stamp} · Dilarang menggandakan atau menyebarkan`
  };
};

export const buildWatermarkSvg = (width: number, height: number, text: WatermarkText): string => {
  const size = Math.max(14, Math.round(width / 44));
  const footerSize = Math.max(10, Math.round(width / 100));
  const cx = Math.round(width / 2);
  const rows = [0.2, 0.5, 0.8].map((ratio) => {
    const y = Math.round(height * ratio);
    return `<text x="${cx}" y="${y}" text-anchor="middle" transform="rotate(-30 ${cx} ${y})">${escapeXml(text.mark)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<g font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="bold" fill="#334155" fill-opacity="0.14">${rows}</g>`
    + `<text x="${cx}" y="${height - Math.round(footerSize * 0.8)}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"`
    + ` font-size="${footerSize}" fill="#334155" fill-opacity="0.55">${escapeXml(text.footer)}</text>`
    + '</svg>';
};

export const renderWatermarkedPage = async (png: Buffer, text: WatermarkText): Promise<Buffer> => {
  const meta = await sharp(png).metadata();
  const width = meta.width || 1200;
  const height = meta.height || 1700;
  return sharp(png)
    .composite([{ input: Buffer.from(buildWatermarkSvg(width, height, text)), top: 0, left: 0 }])
    .webp({ quality: 82 })
    .toBuffer();
};

// ---------------------------------------------------------------------------
// Pencarian
// ---------------------------------------------------------------------------

/** Cuplikan di sekitar kemunculan pertama kata kunci: ±radius karakter, total maks. `max` karakter. */
export const searchSnippet = (text: string, query: string, radius = 80, max = 200): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length >= 2);
  let index = -1;
  let termLength = 0;
  for (const term of terms) {
    const at = lower.indexOf(term);
    if (at >= 0 && (index < 0 || at < index)) {
      index = at;
      termLength = term.length;
    }
  }
  if (index < 0) return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  const start = Math.max(0, index - radius);
  const end = Math.min(flat.length, index + termLength + radius);
  const body = flat.slice(start, end).slice(0, max - 2);
  return `${start > 0 ? '…' : ''}${body}${end < flat.length ? '…' : ''}`;
};

// ---------------------------------------------------------------------------
// Validasi
// ---------------------------------------------------------------------------

const parsePage = (value: unknown, pageCount: number): number => {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > pageCount) throw httpError(400, 'invalid_page', 'Nomor halaman tidak valid.');
  return page;
};

const invalidNote = () => httpError(400, 'invalid_note', 'Data catatan tidak valid.');
const round4 = (value: number) => Math.round(value * 10000) / 10000;

const parseRects = (value: unknown): NoteRect[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw invalidNote();
  return value.map((raw) => {
    const r = (raw || {}) as Record<string, unknown>;
    const [x, y, w, h] = [r.x, r.y, r.w, r.h].map(Number);
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.0001 || y + h > 1.0001) throw invalidNote();
    return { x: round4(x), y: round4(y), w: round4(w), h: round4(h) };
  });
};

const parseColor = (value: unknown): NoteColor => {
  if (!NOTE_COLORS.includes(value as NoteColor)) throw invalidNote();
  return value as NoteColor;
};

const parseNoteText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > MAX_NOTE_TEXT) throw invalidNote();
  return value.trim() || null;
};

const publicNote = (note: NoteRecord) => ({
  id: note.id,
  page: note.pageNumber,
  rects: note.anchor.rects,
  color: note.color,
  text: note.noteText,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt
});

/** Setelah requireSession: hanya e-book yang asetnya sudah diproses. */
const requireReadyEbook: RequestHandler = (req, _res, next) => {
  const { product } = req.digitalAccess!;
  if (product.format !== 'ebook') return next(httpError(400, 'wrong_format', 'Produk ini bukan e-book.'));
  if (product.processingStatus !== 'ready' || !product.pageCount) return next(httpError(409, 'not_ready', 'E-book ini sedang disiapkan.'));
  return next();
};

/** Cache PNG sumber per proses (LRU berdasarkan ukuran) agar tidak mengunduh ulang halaman yang sama dari bucket. */
class SourcePageCache {
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

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const createReaderRouter = (ctx: DigitalContext): Router => {
  const router = express.Router();
  const limits = {
    meta: createUserRateLimiter(ctx, 'readerMeta'),
    page: createUserRateLimiter(ctx, 'page'),
    search: createUserRateLimiter(ctx, 'search'),
    notes: createUserRateLimiter(ctx, 'notes'),
    progress: createUserRateLimiter(ctx, 'progress'),
    events: createUserRateLimiter(ctx, 'events'),
    legal: createUserRateLimiter(ctx, 'legal')
  };
  const reader = (limiter: RequestHandler): RequestHandler[] => [ctx.requireUser, limiter, requireSession(ctx), requireReadyEbook];
  const sourcePages = new SourcePageCache(SOURCE_CACHE_BYTES);

  // Halaman yang benar-benar dikirim per sesi (dasar validasi reading_events). Per proses: satu instance Render.
  const servedPages = new Map<string, { pages: Set<number>; touchedAt: number }>();
  const markServed = (sessionId: string, page: number) => {
    let entry = servedPages.get(sessionId);
    if (!entry) {
      entry = { pages: new Set(), touchedAt: Date.now() };
      servedPages.set(sessionId, entry);
      if (servedPages.size > 5000) {
        const cutoff = Date.now() - SERVED_TTL_MS;
        for (const [id, value] of servedPages) if (value.touchedAt < cutoff) servedPages.delete(id);
      }
    }
    entry.pages.add(page);
    entry.touchedAt = Date.now();
  };

  router.get('/api/reader/:productId/meta', ...reader(limits.meta), asyncRoute(async (req, res) => {
    const { user, product, entitlement } = req.digitalAccess!;
    const [book, chapters, progress] = await Promise.all([
      ctx.getBook(product.bookId),
      ctx.store.listChapters(product.id),
      ctx.store.getProgress(user.id, product.id)
    ]);
    const pageCount = product.pageCount!;
    res.json({
      product: { id: product.id, bookId: product.bookId, pageCount },
      title: book?.title ?? '',
      author: book?.author ?? '',
      chapters: chapters
        .filter((c) => c.startPage !== null && c.startPage >= 1 && c.startPage <= pageCount)
        .map((c) => ({ number: c.chapterNumber, title: c.title, page: c.startPage })),
      progress: progress && progress.position >= 1
        ? { page: Math.min(Math.round(progress.position), pageCount), percent: progress.percent }
        : null,
      legalNoticeAccepted: Boolean(progress?.legalNoticeAcceptedAt),
      watermark: { name: user.name || user.email, email: user.email, entitlementId: entitlement.id }
    });
  }));

  router.get('/api/reader/:productId/pages/:page', ...reader(limits.page), asyncRoute(async (req, res) => {
    const { user, product, entitlement, session } = req.digitalAccess!;
    const page = parsePage(req.params.page, product.pageCount!);
    let png: Buffer;
    try {
      png = await sourcePages.get(`${product.id}:${product.processedAt}:${page}`, () => ctx.storage.download(assetPaths.ebookPage(product.id, page)));
    } catch (err) {
      if (err instanceof AssetNotFoundError) throw httpError(404, 'page_not_found', 'Halaman tidak ditemukan.');
      throw err;
    }
    const image = await renderWatermarkedPage(png, watermarkText(user, entitlement.id, ctx.now()));
    markServed(session.id, page);
    const { ip, userAgent } = clientInfo(req);
    ctx.log({ userId: user.id, productId: product.id, entitlementId: entitlement.id, sessionId: session.id, action: 'page_view', ip, userAgent, meta: { page } });
    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(image);
  }));

  router.get('/api/reader/:productId/search', ...reader(limits.search), asyncRoute(async (req, res) => {
    const { user, product, entitlement, session } = req.digitalAccess!;
    const query = String(req.query.q ?? '').trim().replace(/\s+/g, ' ');
    if (query.length < 2 || query.length > 100) throw httpError(400, 'invalid_query', 'Kata kunci harus 2–100 karakter.');
    const hits = await ctx.store.searchPages(product.id, query, MAX_SEARCH_RESULTS);
    const { ip, userAgent } = clientInfo(req);
    // Isi kata kunci tidak dicatat (privasi); cukup panjang dan jumlah hasil.
    ctx.log({ userId: user.id, productId: product.id, entitlementId: entitlement.id, sessionId: session.id, action: 'search', ip, userAgent, meta: { query_length: query.length, results: hits.length } });
    res.json({ results: hits.slice(0, MAX_SEARCH_RESULTS).map((hit) => ({ page: hit.pageNumber, snippet: searchSnippet(hit.text, query) })) });
  }));

  router.get('/api/reader/:productId/notes', ...reader(limits.notes), asyncRoute(async (req, res) => {
    const { user, product } = req.digitalAccess!;
    res.json({ notes: (await ctx.store.listNotes(user.id, product.id)).map(publicNote) });
  }));

  router.post('/api/reader/:productId/notes', ...reader(limits.notes), asyncRoute(async (req, res) => {
    const { user, product, entitlement, session } = req.digitalAccess!;
    const body = (req.body || {}) as Record<string, unknown>;
    const page = parsePage(body.page, product.pageCount!);
    const rects = parseRects(body.rects);
    const color = parseColor(body.color ?? 'yellow');
    const noteText = parseNoteText(body.text);
    if (await ctx.store.countNotes(user.id, product.id) >= MAX_NOTES_PER_PRODUCT) {
      throw httpError(409, 'notes_limit', `Maksimal ${MAX_NOTES_PER_PRODUCT} catatan per judul.`);
    }
    const note = await ctx.store.createNote({ userId: user.id, productId: product.id, pageNumber: page, anchor: { rects }, color, noteText });
    const { ip, userAgent } = clientInfo(req);
    ctx.log({ userId: user.id, productId: product.id, entitlementId: entitlement.id, sessionId: session.id, action: 'note', ip, userAgent, meta: { op: 'create', page } });
    res.status(201).json({ note: publicNote(note) });
  }));

  router.patch('/api/reader/:productId/notes/:noteId', ...reader(limits.notes), asyncRoute(async (req, res) => {
    const { user } = req.digitalAccess!;
    const noteId = String(req.params.noteId);
    const body = (req.body || {}) as Record<string, unknown>;
    const patch: Partial<Pick<NoteRecord, 'color' | 'noteText'>> = {};
    if (body.color !== undefined) patch.color = parseColor(body.color);
    if (body.text !== undefined) patch.noteText = parseNoteText(body.text);
    if (Object.keys(patch).length === 0) throw invalidNote();
    const note = isValidRecordId(ctx, noteId) ? await ctx.store.updateNote(noteId, user.id, patch) : null;
    if (!note) throw httpError(404, 'note_not_found', 'Catatan tidak ditemukan.');
    res.json({ note: publicNote(note) });
  }));

  router.delete('/api/reader/:productId/notes/:noteId', ...reader(limits.notes), asyncRoute(async (req, res) => {
    const { user } = req.digitalAccess!;
    const noteId = String(req.params.noteId);
    const deleted = isValidRecordId(ctx, noteId) ? await ctx.store.deleteNote(noteId, user.id) : false;
    if (!deleted) throw httpError(404, 'note_not_found', 'Catatan tidak ditemukan.');
    res.status(204).end();
  }));

  router.put('/api/reader/:productId/progress', ...reader(limits.progress), asyncRoute(async (req, res) => {
    const { user, product } = req.digitalAccess!;
    const pageCount = product.pageCount!;
    const page = parsePage((req.body || {}).page, pageCount);
    // Persentase dihitung server, bukan dipercaya dari browser.
    const percent = Math.round((page / pageCount) * 1000) / 10;
    const progress = await ctx.store.upsertProgress(user.id, product.id, { position: page, percent });
    res.json({ page: Math.round(progress.position), percent: progress.percent });
  }));

  router.post('/api/reader/:productId/events', ...reader(limits.events), asyncRoute(async (req, res) => {
    const { user, product, entitlement, session } = req.digitalAccess!;
    const raw = (req.body || {}).events;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 60) throw httpError(400, 'invalid_events', 'Data aktivitas baca tidak valid.');
    const now = ctx.now();
    // Total durasi tidak boleh melebihi waktu yang benar-benar berlalu sejak batch terakhir (atau awal sesi).
    let budget = Math.max(0, now.getTime() - Date.parse(session.lastEventAt ?? session.startedAt)) + EVENT_TOLERANCE_MS;
    const served = servedPages.get(session.id)?.pages;
    const accepted: ReadingEventInput[] = [];
    for (const item of raw) {
      const event = (item || {}) as Record<string, unknown>;
      const page = Number(event.page);
      const dwell = Math.round(Number(event.dwellMs));
      if (!Number.isInteger(page) || page < 1 || page > product.pageCount! || !Number.isFinite(dwell)) continue;
      if (dwell < MIN_DWELL_MS || !served?.has(page)) continue;
      const dwellMs = Math.min(dwell, MAX_DWELL_MS);
      if (dwellMs > budget) continue;
      budget -= dwellMs;
      accepted.push({ userId: user.id, productId: product.id, sessionId: session.id, entitlementId: entitlement.id, unit: 'page', unitStart: page, unitEnd: page, dwellMs, institutionId: session.institutionId });
    }
    if (accepted.length > 0) {
      await ctx.store.insertReadingEvents(accepted);
      await ctx.store.updateSession(session.id, { lastEventAt: now.toISOString() });
    }
    res.json({ accepted: accepted.length, rejected: raw.length - accepted.length });
  }));

  // Persetujuan ketentuan penggunaan (sekali per produk; dipakai reader dan player). Tidak butuh sesi.
  router.post('/api/access/:productId/legal-notice', ctx.requireUser, limits.legal, requireEntitlement(ctx), asyncRoute(async (req, res) => {
    const user = req.digitalUser!;
    const { product } = req.digitalGrant!;
    const existing = await ctx.store.getProgress(user.id, product.id);
    if (existing?.legalNoticeAcceptedAt) return res.json({ acceptedAt: existing.legalNoticeAcceptedAt });
    const progress = await ctx.store.upsertProgress(user.id, product.id, { legalNoticeAcceptedAt: ctx.now().toISOString() });
    return res.json({ acceptedAt: progress.legalNoticeAcceptedAt });
  }));

  return router;
};
