import Busboy from 'busboy';
import type { Request } from 'express';
import { matchesMagicBytes, PROOF_CONTENT_TYPE, PROOF_TYPES } from '../printCheckout/proofUpload';
import { ManuscriptError } from './service';

/** Dokumen kontrak/addendum/bukti bayar/bukti potong pajak: PDF atau foto, maksimal 15 MB, ke bucket privat. */
export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_CONTENT_TYPE = PROOF_CONTENT_TYPE;

const fail = (status: number, code: string, message: string) => new ManuscriptError(status, code, message);

export const receiveDocument = (req: Request) =>
  new Promise<{ buffer: Buffer; extension: string }>((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 5, fileSize: DOCUMENT_MAX_BYTES } });
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
        failure = fail(415, 'unsupported_type', 'Dokumen harus PDF atau foto (JPG, PNG, WebP).');
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () => {
        failure = fail(413, 'file_too_large', 'Ukuran dokumen maksimal 15 MB.');
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
      else if (!file || file.buffer.length === 0) reject(fail(400, 'no_file', 'File dokumen tidak ditemukan.'));
      else if (!matchesMagicBytes(file.buffer, file.extension)) reject(fail(415, 'unsupported_type', 'Isi file tidak sesuai tipenya. Unggah PDF atau foto.'));
      else resolve(file);
    });
    req.pipe(parser);
  });
