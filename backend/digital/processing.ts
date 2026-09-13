import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import express, { type Request, type Router } from 'express';
import Busboy from 'busboy';
import sharp from 'sharp';
import { asyncRoute, httpError } from './errors';
import { assetPaths } from './storage';
import { parseChapters } from './chapters';
import type { DigitalConfig } from './config';
import type { DigitalContext } from './context';
import type { DigitalFormat, ProductRecord } from './types';

/**
 * Pemrosesan aset digital (asinkron, satu job pada satu waktu):
 *   E-book   : pdftoppm (~150 dpi, lebar maks. 1600 px) -> PNG per halaman di bucket privat;
 *              pdftotext per halaman -> digital_product_pages (pencarian); page_count diisi.
 *   Audiobook: ffmpeg -> HLS AAC 64 kbps mono, segmen 10 detik, AES-128 (key acak per produk, IV per segmen
 *              = nomor urut segmen), duration_seconds diisi.
 * Status di digital_products.processing_status adalah sumber kebenaran: job yang terputus (restart) diambil
 * lagi oleh pemindaian berkala. File master tidak pernah dihapus.
 */

export const PAGE_DPI = 150;
export const PAGE_MAX_WIDTH = 1600;
export const HLS_SEGMENT_SECONDS = 10;

export interface ProcessingTools {
  pdfToPngs(pdfPath: string, outDir: string, dpi: number): Promise<string[]>;
  pdfToTextPages(pdfPath: string): Promise<string[]>;
  encodeHls(inputPath: string, outDir: string, keyInfoPath: string): Promise<void>;
}

const run = (command: string, args: string[], options: { timeoutMs: number; collectStdout?: boolean }) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const stdoutChunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      if (options.collectStdout) stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-20000);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${path.basename(command)} melebihi batas waktu`));
    }, options.timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`${path.basename(command)} tidak dapat dijalankan: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout: Buffer.concat(stdoutChunks).toString('utf8'), stderr });
    });
  });

/** Alat baris perintah sistem (Docker: ffmpeg + poppler-utils). */
export const createCliTools = (paths: DigitalConfig['tools']): ProcessingTools => ({
  async pdfToPngs(pdfPath, outDir, dpi) {
    await fsp.mkdir(outDir, { recursive: true });
    const result = await run(paths.pdftoppm, ['-r', String(dpi), '-png', pdfPath, path.join(outDir, 'page')], { timeoutMs: 2 * 3600 * 1000 });
    if (result.code !== 0) throw new Error(`pdftoppm gagal: ${result.stderr.trim().slice(-300)}`);
    const pageNumber = (file: string) => Number(file.match(/(\d+)\.png$/)?.[1] || 0);
    return (await fsp.readdir(outDir))
      .filter((file) => /^page-\d+\.png$/.test(file))
      .sort((a, b) => pageNumber(a) - pageNumber(b))
      .map((file) => path.join(outDir, file));
  },
  async pdfToTextPages(pdfPath) {
    const result = await run(paths.pdftotext, ['-layout', '-enc', 'UTF-8', pdfPath, '-'], { timeoutMs: 30 * 60 * 1000, collectStdout: true });
    if (result.code !== 0) throw new Error(`pdftotext gagal: ${result.stderr.trim().slice(-300)}`);
    const pages = result.stdout.split('\f');
    if (pages.length > 0 && pages[pages.length - 1].trim() === '') pages.pop();
    return pages;
  },
  async encodeHls(inputPath, outDir, keyInfoPath) {
    await fsp.mkdir(outDir, { recursive: true });
    const result = await run(paths.ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-vn', '-map', '0:a:0',
      '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-ar', '44100',
      '-f', 'hls',
      '-hls_time', String(HLS_SEGMENT_SECONDS),
      '-hls_playlist_type', 'vod',
      '-hls_key_info_file', keyInfoPath,
      '-hls_segment_filename', path.join(outDir, 'seg_%d.ts'),
      path.join(outDir, 'index.m3u8')
    ], { timeoutMs: 4 * 3600 * 1000 });
    if (result.code !== 0) throw new Error(`ffmpeg gagal: ${result.stderr.trim().slice(-300)}`);
  }
});

const mapLimit = async <T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) => {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
};

/** Teks halaman untuk pencarian: tanpa karakter kontrol, spasi dirapikan. */
const normalizePageText = (text: string) => text
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, 50000);

const readHead = async (filePath: string, bytes: number) => {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    await handle.read(buffer, 0, bytes, 0);
    return buffer;
  } finally {
    await handle.close();
  }
};

const processEbook = async (ctx: DigitalContext, tools: ProcessingTools, product: ProductRecord, workDir: string) => {
  const source = path.join(workDir, 'source.pdf');
  await ctx.storage.downloadToFile(product.storagePath!, source);
  if ((await readHead(source, 5)).toString('latin1') !== '%PDF-') throw new Error('File master bukan PDF yang valid.');

  const pngs = await tools.pdfToPngs(source, path.join(workDir, 'pages'), PAGE_DPI);
  if (pngs.length === 0) throw new Error('PDF tidak memiliki halaman.');
  const texts = await tools.pdfToTextPages(source);

  await mapLimit(pngs, 4, async (file, index) => {
    const image = await sharp(file)
      .resize({ width: PAGE_MAX_WIDTH, withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    await ctx.storage.upload(assetPaths.ebookPage(product.id, index + 1), image, 'image/png');
  });

  // Halaman sisa dari versi sebelumnya yang lebih panjang dihapus (file master tetap).
  const pagesDir = assetPaths.ebookPagesDir(product.id);
  const stale = (await ctx.storage.list(pagesDir))
    .filter((name) => {
      const match = name.match(/^(\d+)\.png$/);
      return !match || Number(match[1]) > pngs.length;
    })
    .map((name) => `${pagesDir}/${name}`);
  if (stale.length > 0) await ctx.storage.remove(stale);

  await ctx.store.replacePages(product.id, pngs.map((_, index) => ({ pageNumber: index + 1, text: normalizePageText(texts[index] || '') })));
  return { pageCount: pngs.length };
};

const processAudiobook = async (ctx: DigitalContext, tools: ProcessingTools, product: ProductRecord, workDir: string) => {
  const extension = path.extname(product.storagePath!) || '.mp3';
  const source = path.join(workDir, `source${extension}`);
  await ctx.storage.downloadToFile(product.storagePath!, source);

  const hlsDir = path.join(workDir, 'hls');
  const key = crypto.randomBytes(16);
  const keyPath = path.join(workDir, 'enc.key');
  const keyInfoPath = path.join(workDir, 'enc.keyinfo');
  await fsp.writeFile(keyPath, key);
  // Baris 1: URI key di playlist (ditulis ulang server saat disajikan); baris 2: file key. Tanpa IV eksplisit,
  // ffmpeg memakai nomor urut segmen sebagai IV (IV berbeda per segmen).
  await fsp.writeFile(keyInfoPath, `enc.key\n${keyPath}\n`);
  await tools.encodeHls(source, hlsDir, keyInfoPath);

  const playlist = await fsp.readFile(path.join(hlsDir, 'index.m3u8'), 'utf8');
  const lines = playlist.split(/\r?\n/);
  const segments = lines.map((l) => l.trim()).filter((l) => /^seg_\d+\.ts$/.test(l));
  if (segments.length === 0) throw new Error('ffmpeg tidak menghasilkan segmen HLS.');
  const durationSeconds = Math.round(lines.filter((l) => l.startsWith('#EXTINF:')).reduce((sum, l) => sum + parseFloat(l.slice(8)), 0));

  const hlsPrefix = assetPaths.audioHlsDir(product.id);
  await ctx.storage.upload(assetPaths.audioKey(product.id), key, 'application/octet-stream');
  await mapLimit(segments, 4, async (name) => {
    await ctx.storage.upload(`${hlsPrefix}/${name}`, await fsp.readFile(path.join(hlsDir, name)), 'video/mp2t');
  });
  await ctx.storage.upload(assetPaths.audioPlaylist(product.id), Buffer.from(playlist, 'utf8'), 'application/vnd.apple.mpegurl');

  const keep = new Set([...segments, 'index.m3u8', 'enc.key']);
  const stale = (await ctx.storage.list(hlsPrefix)).filter((name) => !keep.has(name)).map((name) => `${hlsPrefix}/${name}`);
  if (stale.length > 0) await ctx.storage.remove(stale);
  return { durationSeconds };
};

/** Memproses satu produk yang berstatus 'processing'. */
export const runProcessing = async (ctx: DigitalContext, tools: ProcessingTools, productId: string): Promise<void> => {
  const product = await ctx.store.getProduct(productId);
  if (!product || product.processingStatus !== 'processing') return;
  const workDir = path.join(ctx.config.workDir, `${productId}-${Date.now()}`);
  try {
    if (!product.storagePath) throw new Error('File master belum diunggah.');
    await fsp.mkdir(workDir, { recursive: true });
    const result = product.format === 'ebook'
      ? await processEbook(ctx, tools, product, workDir)
      : await processAudiobook(ctx, tools, product, workDir);
    await ctx.store.updateProduct(productId, {
      ...result,
      processingStatus: 'ready',
      processingError: null,
      processedAt: ctx.now().toISOString()
    });
    console.log(`[digital] ${product.format} ${productId} selesai diproses`, result);
  } catch (err: any) {
    console.error(`[digital] pemrosesan ${productId} gagal:`, err?.message || err);
    await ctx.store.updateProduct(productId, { processingStatus: 'failed', processingError: String(err?.message || err).slice(0, 500) });
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
};

/** Antrian in-process (satu job sekaligus) + pemindaian berkala untuk melanjutkan job setelah restart. */
export class ProcessingQueue {
  private readonly pending: string[] = [];
  private current: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private idle: Promise<void> = Promise.resolve();

  constructor(private readonly ctx: DigitalContext, private readonly tools: ProcessingTools) {}

  enqueue(productId: string): void {
    if (productId === this.current || this.pending.includes(productId)) return;
    this.pending.push(productId);
    if (!this.current) this.idle = this.drain();
  }

  start(intervalMs = 60_000): void {
    void this.resume();
    this.timer = setInterval(() => void this.resume(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Untuk tes: tunggu sampai antrian kosong. */
  async waitIdle(): Promise<void> {
    await this.idle;
    if (this.current || this.pending.length) await this.waitIdle();
  }

  snapshot() {
    return { current: this.current, pending: [...this.pending] };
  }

  private async resume() {
    try {
      const products = await this.ctx.store.listProductsByStatus('processing');
      products.forEach((p) => this.enqueue(p.id));
    } catch (err: any) {
      console.warn('[digital] pemindaian antrian gagal:', err?.message || err);
    }
  }

  private async drain() {
    while (this.pending.length > 0) {
      this.current = this.pending.shift()!;
      try {
        await runProcessing(this.ctx, this.tools, this.current);
      } finally {
        this.current = null;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rute admin: unggah master (multipart, streaming), proses ulang, status, bab.
// Tidak ada respons yang berisi path penyimpanan.
// ---------------------------------------------------------------------------
const MASTER_TYPES: Record<DigitalFormat, Record<string, string>> = {
  ebook: { 'application/pdf': 'pdf' },
  audiobook: {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/flac': 'flac'
  }
};
const MASTER_MAX_BYTES: Record<DigitalFormat, number> = { ebook: 500 * 1024 * 1024, audiobook: 2 * 1024 * 1024 * 1024 };

const processingState = (p: ProductRecord) => ({
  productId: p.id,
  format: p.format,
  processingStatus: p.processingStatus,
  processingError: p.processingError,
  processingStartedAt: p.processingStartedAt,
  processedAt: p.processedAt,
  pageCount: p.pageCount,
  durationSeconds: p.durationSeconds,
  hasMaster: Boolean(p.storagePath),
  masterContentType: p.masterContentType,
  masterSizeBytes: p.masterSizeBytes,
  masterUploadedAt: p.masterUploadedAt
});

/** Menerima satu file multipart (field "file") ke disk sementara dengan batas tipe & ukuran. */
const receiveSingleFile = (req: Request, target: string, allowedTypes: Record<string, string>, maxBytes: number) =>
  new Promise<{ contentType: string; size: number }>((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 5, fileSize: maxBytes } });
    } catch {
      reject(httpError(400, 'invalid_upload', 'Unggahan harus multipart/form-data.'));
      return;
    }
    let failure: Error | null = null;
    let received: { contentType: string; size: number } | null = null;
    let writing: Promise<void> | null = null;

    parser.on('file', (field, stream, meta) => {
      const type = String(meta.mimeType || '').toLowerCase();
      if (field !== 'file' || writing) {
        stream.resume();
        return;
      }
      if (!allowedTypes[type]) {
        failure = httpError(415, 'unsupported_type', `Tipe file ${type || '(kosong)'} tidak didukung untuk format ini.`);
        stream.resume();
        return;
      }
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
      });
      stream.on('limit', () => {
        failure = httpError(413, 'file_too_large', `Ukuran file melebihi batas ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      });
      writing = pipeline(stream, fs.createWriteStream(target)).then(() => {
        received = { contentType: type, size };
      });
    });
    parser.on('error', () => reject(httpError(400, 'invalid_upload', 'Unggahan terputus atau rusak.')));
    parser.on('close', async () => {
      try {
        if (writing) await writing;
      } catch (err) {
        reject(err);
        return;
      }
      if (failure) reject(failure);
      else if (!received) reject(httpError(400, 'no_file', 'File tidak ditemukan pada unggahan.'));
      else resolve(received);
    });
    req.pipe(parser);
  });

export const createProcessingRouter = (ctx: DigitalContext, queue: ProcessingQueue): Router => {
  const router = express.Router();
  const base = '/api/admin/digital/processing';

  const loadProduct = async (productId: string) => {
    const product = await ctx.store.getProduct(productId);
    if (!product) {
      throw httpError(404, 'product_not_found', 'Produk digital tidak ditemukan. Simpan produk di tab Produk Digital terlebih dahulu.');
    }
    return product;
  };

  router.get(base, ctx.requireAdmin, asyncRoute(async (_req, res) => {
    const lists = await Promise.all((['processing', 'ready', 'failed'] as const).map((s) => ctx.store.listProductsByStatus(s)));
    res.json({ products: lists.flat().map(processingState), queue: queue.snapshot() });
  }));

  router.get(`${base}/:productId`, ctx.requireAdmin, asyncRoute(async (req, res) => {
    const product = await loadProduct(req.params.productId);
    res.json({ ...processingState(product), chapters: await ctx.store.listChapters(product.id) });
  }));

  router.post(`${base}/:productId/master`, ctx.requireAdmin, asyncRoute(async (req, res) => {
    const product = await loadProduct(req.params.productId);
    const uploadDir = path.join(ctx.config.workDir, 'uploads');
    await fsp.mkdir(uploadDir, { recursive: true });
    const tempFile = path.join(uploadDir, `${product.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.upload`);
    try {
      const file = await receiveSingleFile(req, tempFile, MASTER_TYPES[product.format], MASTER_MAX_BYTES[product.format]);
      if (product.format === 'ebook' && (await readHead(tempFile, 5)).toString('latin1') !== '%PDF-') {
        throw httpError(415, 'unsupported_type', 'File bukan PDF yang valid.');
      }
      const extension = MASTER_TYPES[product.format][file.contentType];
      const objectPath = product.format === 'ebook' ? assetPaths.ebookSource(product.id) : assetPaths.audioSource(product.id, extension);
      await ctx.storage.upload(objectPath, fs.createReadStream(tempFile), file.contentType);
      const now = ctx.now().toISOString();
      await ctx.store.updateProduct(product.id, {
        storagePath: objectPath,
        masterContentType: file.contentType,
        masterSizeBytes: file.size,
        masterUploadedAt: now,
        processingStatus: 'processing',
        processingError: null,
        processingStartedAt: now
      });
      queue.enqueue(product.id);
      res.status(202).json(processingState((await ctx.store.getProduct(product.id))!));
    } finally {
      await fsp.rm(tempFile, { force: true });
    }
  }));

  router.post(`${base}/:productId/reprocess`, ctx.requireAdmin, asyncRoute(async (req, res) => {
    const product = await loadProduct(req.params.productId);
    if (!product.storagePath) throw httpError(409, 'no_master', 'Unggah file master terlebih dahulu.');
    if (product.processingStatus === 'processing') throw httpError(409, 'already_processing', 'Produk sedang diproses.');
    await ctx.store.updateProduct(product.id, { processingStatus: 'processing', processingError: null, processingStartedAt: ctx.now().toISOString() });
    queue.enqueue(product.id);
    res.status(202).json(processingState((await ctx.store.getProduct(product.id))!));
  }));

  router.put(`${base}/:productId/chapters`, ctx.requireAdmin, asyncRoute(async (req, res) => {
    const product = await loadProduct(req.params.productId);
    const text = String(req.body?.text ?? '');
    if (text.length > 200_000) throw httpError(413, 'too_large', 'Daftar bab terlalu besar.');
    const result = parseChapters(text, product.format, { pageCount: product.pageCount, durationSeconds: product.durationSeconds });
    await ctx.store.replaceChapters(product.id, result.chapters);
    res.json(result);
  }));

  return router;
};
