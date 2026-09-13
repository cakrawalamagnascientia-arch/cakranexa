import express from 'express';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { SignJWT } from 'jose';
import { createDigitalPhase2 } from '../index';
import { createSupabaseTokenVerifier } from '../auth';
import { MemoryDigitalStore, type Phase1ProductLike } from '../memoryStore';
import { createFilesystemAssetStorage } from '../storage';
import type { ProcessingTools } from '../processing';
import type { MailMessage, Mailer, MidtransSettings } from '../context';
import type { BookInfo } from '../types';

/** Harness tes backend fase 2: store memori, penyimpanan folder sementara, JWT HS256 nyata. */
export const JWT_SECRET = 'rahasia-jwt-tes-minimal-32-karakter!!!';

export const USER_A = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'pembaca.a@uji.id', name: 'Pembaca A' };
export const USER_B = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'pembaca.b@uji.id', name: 'Pembaca B' };

export const TEST_PRODUCTS: Phase1ProductLike[] = [
  { id: 'prod-ebook-1', bookId: 'book-3', format: 'ebook', price: 99000, isActive: true, availabilityStatus: 'available', pageCount: 300, durationSeconds: null },
  { id: 'prod-audio-1', bookId: 'book-24', format: 'audiobook', price: 129000, isActive: true, availabilityStatus: 'available', pageCount: null, durationSeconds: 19800 },
  { id: 'prod-ebook-2', bookId: 'book-24', format: 'ebook', price: 89000, isActive: true, availabilityStatus: 'available', pageCount: 200, durationSeconds: null },
  { id: 'prod-soon', bookId: 'book-25', format: 'ebook', price: 0, isActive: true, availabilityStatus: 'coming_soon', pageCount: null, durationSeconds: null }
];

export const TEST_BOOKS: Record<string, BookInfo> = {
  'book-3': { id: 'book-3', slug: 'reformulasi-mekanisme-ppn', title: 'Reformulasi Mekanisme PPN', author: 'Bonarsius Sipayung', coverUrl: '/images/books/b3.png' },
  'book-24': { id: 'book-24', slug: 'audit-investigatif-kontemporer', title: 'Audit Investigatif Kontemporer', author: 'Yudha Pramana', coverUrl: '/images/books/b24.png' },
  'book-25': { id: 'book-25', slug: 'telaah-kritis', title: 'Telaah Kritis Pemidanaan Pajak', author: 'Penulis Uji', coverUrl: '/images/books/b25.png' }
};

export const mintUserToken = (user: { id: string; email: string; name: string }, claims: Record<string, unknown> = {}) =>
  new SignJWT({ role: 'authenticated', email: user.email, user_metadata: { full_name: user.name }, ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));

export const failingTools: ProcessingTools = {
  pdfToPngs: async () => { throw new Error('alat tidak tersedia di tes ini'); },
  pdfToTextPages: async () => { throw new Error('alat tidak tersedia di tes ini'); },
  encodeHls: async () => { throw new Error('alat tidak tersedia di tes ini'); }
};

export interface TestAppOptions {
  products?: Phase1ProductLike[];
  tools?: ProcessingTools;
  midtrans?: MidtransSettings;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  env?: Record<string, string>;
  /** Pengganti pengirim email (default: dikumpulkan ke `mails`). */
  mailer?: Mailer;
}

export const createTestApp = async (options: TestAppOptions = {}) => {
  const storageDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cnx-digital-test-'));
  const products = options.products ?? TEST_PRODUCTS.map((p) => ({ ...p }));
  const store = new MemoryDigitalStore(async () => products);
  const storage = createFilesystemAssetStorage(path.join(storageDir, 'assets'));
  const mails: MailMessage[] = [];
  const phase2 = createDigitalPhase2({
    supabaseAdmin: null,
    supabaseUrl: '',
    requireAdmin: (req, res, next) => (req.headers['x-test-admin'] === '1' ? next() : res.status(401).json({ error: 'admin required' })),
    getBook: async (bookId) => TEST_BOOKS[bookId] ?? null,
    listPhase1Products: async () => products,
    mailer: options.mailer ?? { send: async (message) => { mails.push(message); } },
    adminEmails: ['admin@uji.id'],
    midtrans: options.midtrans ?? { enabled: true, serverKey: 'SB-Mid-server-UJI', snapUrl: 'https://midtrans.test/snap/v1/transactions', isProduction: false },
    env: {
      NODE_ENV: 'test',
      DIGITAL_ENABLED: 'true',
      ACCESS_TOKEN_SECRET: 'rahasia-token-media-tes',
      CRON_SECRET: 'rahasia-cron-tes',
      SITE_URL: 'https://cakranexa.test',
      DIGITAL_WORK_DIR: path.join(storageDir, 'work'),
      ...options.env
    },
    overrides: {
      store,
      storage,
      verifier: createSupabaseTokenVerifier({ supabaseUrl: '', jwtSecret: JWT_SECRET }),
      tools: options.tools ?? failingTools,
      now: options.now,
      fetchImpl: options.fetchImpl
    }
  });
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(phase2.router);
  return {
    app,
    phase2,
    store,
    storage,
    products,
    mails,
    cleanup: () => fsp.rm(storageDir, { recursive: true, force: true })
  };
};
