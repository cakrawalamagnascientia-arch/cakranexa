import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { jsPDF } from 'jspdf';
import { createCliTools } from '../processing';
import { createTestApp } from './harness';

// Alat nyata opsional (lokal: set FFMPEG_PATH, PDFTOPPM_PATH, PDFTOTEXT_PATH; Docker: tersedia di PATH).
const toolPaths = {
  ffmpeg: process.env.FFMPEG_PATH || '',
  pdftoppm: process.env.PDFTOPPM_PATH || '',
  pdftotext: process.env.PDFTOTEXT_PATH || ''
};
const hasPdfTools = Boolean(toolPaths.pdftoppm && toolPaths.pdftotext && fs.existsSync(toolPaths.pdftoppm) && fs.existsSync(toolPaths.pdftotext));
const hasFfmpeg = Boolean(toolPaths.ffmpeg && fs.existsSync(toolPaths.ffmpeg));

const makePdf = (pages: string[]): Buffer => {
  const doc = new jsPDF({ unit: 'mm', format: [155, 230] });
  pages.forEach((text, index) => {
    if (index > 0) doc.addPage([155, 230]);
    doc.setFontSize(14);
    doc.text(text, 15, 30);
  });
  return Buffer.from(doc.output('arraybuffer'));
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe('unggah master & validasi (tanpa alat eksternal)', () => {
  it('menolak tanpa admin, produk tak dikenal, tipe salah, dan PDF palsu; status tanpa path penyimpanan', async () => {
    const t = await createTestApp();
    cleanups.push(t.cleanup);
    const url = '/api/admin/digital/processing/prod-ebook-1/master';
    expect((await request(t.app).post(url).attach('file', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' })).status).toBe(401);
    expect((await request(t.app).post('/api/admin/digital/processing/tidak-ada/master').set('x-test-admin', '1')
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' })).status).toBe(404);
    const wrongType = await request(t.app).post(url).set('x-test-admin', '1').attach('file', Buffer.from('halo'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(wrongType.status).toBe(415);
    const fakePdf = await request(t.app).post(url).set('x-test-admin', '1').attach('file', Buffer.from('bukan pdf'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(fakePdf.status).toBe(415);
    const reprocess = await request(t.app).post('/api/admin/digital/processing/prod-ebook-1/reprocess').set('x-test-admin', '1');
    expect(reprocess.status).toBe(409);
    const state = await request(t.app).get('/api/admin/digital/processing/prod-ebook-1').set('x-test-admin', '1');
    expect(state.status).toBe(200);
    expect(state.body.hasMaster).toBe(false);
    expect(JSON.stringify(state.body)).not.toMatch(/storagePath|ebooks\/|audiobooks\//);
  });

  it('kegagalan alat menandai produk failed (master tetap tersimpan)', async () => {
    const t = await createTestApp();
    cleanups.push(t.cleanup);
    const res = await request(t.app).post('/api/admin/digital/processing/prod-ebook-1/master').set('x-test-admin', '1')
      .attach('file', makePdf(['Satu']), { filename: 'buku.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(202);
    expect(res.body.processingStatus).toBe('processing');
    await t.phase2.queue!.waitIdle();
    const product = await t.store.getProduct('prod-ebook-1');
    expect(product?.processingStatus).toBe('failed');
    expect(product?.processingError).toMatch(/alat tidak tersedia/);
    expect(await t.storage.list('ebooks/prod-ebook-1')).toContain('source.pdf');
  });

  it('menyimpan daftar bab dari CSV', async () => {
    const t = await createTestApp();
    cleanups.push(t.cleanup);
    const res = await request(t.app).put('/api/admin/digital/processing/prod-audio-1/chapters').set('x-test-admin', '1')
      .send({ text: 'waktu,judul\n0:00,Pembuka\n10:00,Bab 1' });
    expect(res.status).toBe(200);
    expect(await t.store.listChapters('prod-audio-1')).toHaveLength(2);
  });
});

describe.skipIf(!hasPdfTools)('e-book: pdftoppm + pdftotext (alat nyata)', () => {
  it('mengolah PDF menjadi PNG per halaman (lebar maks. 1600 px) dan teks pencarian', async () => {
    const t = await createTestApp({ tools: createCliTools(toolPaths) });
    cleanups.push(t.cleanup);
    const pdf = makePdf(['Halaman satu tentang pajak pertambahan nilai', 'Halaman dua membahas audit investigatif', 'Halaman tiga penutup']);
    const res = await request(t.app).post('/api/admin/digital/processing/prod-ebook-1/master').set('x-test-admin', '1')
      .attach('file', pdf, { filename: 'buku.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(202);
    expect(JSON.stringify(res.body)).not.toMatch(/source\.pdf|ebooks\//);
    await t.phase2.queue!.waitIdle();

    const product = await t.store.getProduct('prod-ebook-1');
    expect(product?.processingError).toBeNull();
    expect(product?.processingStatus).toBe('ready');
    expect(product?.pageCount).toBe(3);
    expect((await t.storage.list('ebooks/prod-ebook-1/pages')).sort()).toEqual(['1.png', '2.png', '3.png']);
    const meta = await sharp(await t.storage.download('ebooks/prod-ebook-1/pages/1.png')).metadata();
    expect(meta.width).toBeGreaterThan(800);
    expect(meta.width).toBeLessThanOrEqual(1600);
    const hits = await t.store.searchPages('prod-ebook-1', 'audit', 50);
    expect(hits.map((h) => h.pageNumber)).toEqual([2]);
  });
});

describe.skipIf(!hasFfmpeg)('audiobook: ffmpeg HLS AES-128 (alat nyata)', () => {
  it('mengolah audio menjadi segmen 10 detik terenkripsi yang bisa didekripsi dengan key produk', async () => {
    const t = await createTestApp({ tools: createCliTools(toolPaths) });
    cleanups.push(t.cleanup);
    const mp3 = path.join(os.tmpdir(), `cnx-nada-${Date.now()}.mp3`);
    execFileSync(toolPaths.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=25', '-c:a', 'libmp3lame', '-b:a', '96k', mp3]);
    cleanups.push(async () => fs.rmSync(mp3, { force: true }));

    const res = await request(t.app).post('/api/admin/digital/processing/prod-audio-1/master').set('x-test-admin', '1')
      .attach('file', mp3, { filename: 'buku.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(202);
    await t.phase2.queue!.waitIdle();

    const product = await t.store.getProduct('prod-audio-1');
    expect(product?.processingError).toBeNull();
    expect(product?.processingStatus).toBe('ready');
    expect(product?.durationSeconds).toBeGreaterThanOrEqual(24);
    expect(product?.durationSeconds).toBeLessThanOrEqual(26);

    const dir = 'audiobooks/prod-audio-1/hls';
    const playlist = (await t.storage.download(`${dir}/index.m3u8`)).toString('utf8');
    expect(playlist).toMatch(/#EXT-X-KEY:METHOD=AES-128,URI="enc\.key"/);
    expect(playlist).toMatch(/#EXT-X-ENDLIST/);
    const segments = (await t.storage.list(dir)).filter((n) => n.endsWith('.ts'));
    expect(segments.length).toBe(3);

    const key = await t.storage.download(`${dir}/enc.key`);
    expect(key).toHaveLength(16);
    const encrypted = await t.storage.download(`${dir}/seg_0.ts`);
    expect(encrypted[0]).not.toBe(0x47); // bukan TS polos
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16)); // IV = nomor segmen 0
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    expect(plain[0]).toBe(0x47); // sync byte MPEG-TS setelah dekripsi
  });
});
