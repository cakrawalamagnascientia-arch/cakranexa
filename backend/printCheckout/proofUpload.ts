import Busboy from 'busboy';
import type { Request } from 'express';
import { fail } from './errors';

/** Bukti transfer pembeli: foto/screenshot atau PDF, maksimal 10 MB, disimpan di bucket privat. */
export const PROOF_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const PROOF_CONTENT_TYPE: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

/** Isi file harus sesuai tipenya (bukan sekadar header Content-Type dari browser). */
export const matchesMagicBytes = (buffer: Buffer, extension: string): boolean => {
  switch (extension) {
    case 'pdf': return buffer.subarray(0, 4).toString('latin1') === '%PDF';
    case 'png': return buffer.length > 8 && buffer[0] === 0x89 && buffer.subarray(1, 4).toString('latin1') === 'PNG';
    case 'jpg': return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'webp': return buffer.length > 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP';
    default: return false;
  }
};

/** Satu file multipart (field "file") ke memori, dengan batas tipe & ukuran. */
export const receiveProof = (req: Request) =>
  new Promise<{ buffer: Buffer; extension: string }>((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 5, fileSize: PROOF_MAX_BYTES } });
    } catch {
      reject(fail(400, 'invalid_upload', 'Unggahan harus multipart/form-data.'));
      return;
    }
    let failure: Error | null = null;
    let received: { buffer: Buffer; extension: string } | null = null;
    let reading: Promise<void> | null = null;
    parser.on('file', (field, stream, meta) => {
      const extension = PROOF_TYPES[String(meta.mimeType || '').toLowerCase()];
      if (field !== 'file' || reading) {
        stream.resume();
        return;
      }
      if (!extension) {
        failure = fail(415, 'unsupported_type', 'Bukti transfer harus foto (JPG, PNG, WebP) atau PDF.');
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () => {
        failure = fail(413, 'file_too_large', 'Ukuran bukti transfer maksimal 10 MB.');
      });
      reading = new Promise((done) => stream.on('end', () => {
        received = { buffer: Buffer.concat(chunks), extension };
        done();
      }));
    });
    parser.on('error', () => reject(fail(400, 'invalid_upload', 'Unggahan terputus atau rusak.')));
    parser.on('close', async () => {
      if (reading) await reading;
      const file = received as { buffer: Buffer; extension: string } | null;
      if (failure) reject(failure);
      else if (!file || file.buffer.length === 0) reject(fail(400, 'no_file', 'File bukti transfer tidak ditemukan.'));
      else if (!matchesMagicBytes(file.buffer, file.extension)) reject(fail(415, 'unsupported_type', 'Isi file tidak sesuai tipenya. Unggah foto atau PDF bukti transfer.'));
      else resolve(file);
    });
    req.pipe(parser);
  });
