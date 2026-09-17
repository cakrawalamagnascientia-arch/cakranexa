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
import type { MidtransClient } from '../checkout';
import type { MembershipGateway } from '../membership/gateway';
import type { WhatsAppSender } from '../membership/whatsapp';
import type { MailMessage, Mailer, MidtransSettings } from '../context';
import type { BookInfo } from '../types';
import type { CompanyBankAccount, CompanyProfile, InquiryRef } from '../institution/types';
import { PHASE3_PLANS } from '../membership/plans';
import { DEFAULT_PAYMENT_ROUTING, type RoutingEntry } from '../../../src/data/paymentRouting';

/**
 * Routing untuk tes fase 2–4 yang menguji pembelian satuan dan Snap keanggotaan: semua metode 'digital' dan
 * 'membership' (selain transfer manual) diarahkan ke Midtrans. Bawaan produksi fase 6 = DEFAULT_PAYMENT_ROUTING.
 */
export const MIDTRANS_TEST_ROUTING: RoutingEntry[] = DEFAULT_PAYMENT_ROUTING.map((r) =>
  r.transactionType !== 'print' && r.method !== 'bank_transfer' ? { ...r, provider: 'midtrans' } : r);

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
  'book-3': { id: 'book-3', slug: 'reformulasi-mekanisme-ppn', title: 'Reformulasi Mekanisme PPN', author: 'Bonarsius Sipayung', coverUrl: '/images/books/b3.png', category: 'Perpajakan' },
  'book-24': { id: 'book-24', slug: 'audit-investigatif-kontemporer', title: 'Audit Investigatif Kontemporer', author: 'Yudha Pramana', coverUrl: '/images/books/b24.png', category: 'Audit' },
  'book-25': { id: 'book-25', slug: 'telaah-kritis', title: 'Telaah Kritis Pemidanaan Pajak', author: 'Penulis Uji', coverUrl: '/images/books/b25.png', category: 'Hukum' }
};

/** Rekening uji (bukan rekening asli) untuk invoice institusi. */
export const TEST_BANK_ACCOUNTS: CompanyBankAccount[] = [
  { bankName: 'Bank Uji', accountNumber: '000-00-0000000-0', accountHolder: 'PT UJI CAKRANEXA', branch: 'KC Uji' }
];

export const TEST_COMPANY: CompanyProfile = {
  name: 'PT Cakrawala Magna Scientia',
  address: 'Jl. Uji No. 1, Jakarta',
  phone: '+62 21 0000 0000',
  email: 'info@cakranexa.test',
  npwp: '00.000.000.0-000.000'
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
  /** Snap tiruan (keanggotaan) dan Midtrans Subscriptions/status API tiruan. */
  midtransClient?: MidtransClient;
  membershipGateway?: MembershipGateway;
  /** Gateway WhatsApp tiruan (default: tanpa WhatsApp). */
  whatsappSender?: WhatsAppSender | null;
  /** Institusi fase 4: rekening CMS (default TEST_BANK_ACCOUNTS), identitas penerbit, permintaan penawaran fase 1. */
  bankAccounts?: CompanyBankAccount[];
  companyProfile?: CompanyProfile;
  inquiries?: InquiryRef[];
  /** payment_routing tersimpan (bawaan MIDTRANS_TEST_ROUTING; null = belum pernah disimpan -> bawaan produksi). */
  paymentRouting?: RoutingEntry[] | null;
  /** Aktifkan paket fase 3 dengan angka seed aslinya (tes regresi pelanggan lama). */
  legacyPlans?: boolean;
  /** Fase 6: nominal pesanan cetak yang menunggu transfer. */
  openPrintTransferTotals?: () => Promise<number[]>;
}

export const createTestApp = async (options: TestAppOptions = {}) => {
  const storageDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cnx-digital-test-'));
  const products = options.products ?? TEST_PRODUCTS.map((p) => ({ ...p }));
  const store = new MemoryDigitalStore(async () => products);
  if (options.legacyPlans) {
    for (const seed of PHASE3_PLANS) {
      const plan = store.plans.find((x) => x.id === seed.id)!;
      Object.assign(plan, seed);
    }
  }
  const routing = { value: options.paymentRouting === undefined ? MIDTRANS_TEST_ROUTING : options.paymentRouting };
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
    listBankAccounts: async () => options.bankAccounts ?? TEST_BANK_ACCOUNTS,
    getCompanyProfile: async () => options.companyProfile ?? TEST_COMPANY,
    getInquiry: async (id) => options.inquiries?.find((q) => q.id === id) ?? null,
    getPaymentRouting: async () => routing.value,
    financeWhatsapp: async () => '+6285286146806',
    openPrintTransferTotals: options.openPrintTransferTotals,
    env: {
      NODE_ENV: 'test',
      DIGITAL_ENABLED: 'true',
      ACCESS_TOKEN_SECRET: 'rahasia-token-media-tes',
      CRON_SECRET: 'rahasia-cron-tes',
      SITE_URL: 'https://cakranexa.test',
      PUBLIC_API_URL: 'https://api.cakranexa.test',
      DIGITAL_WORK_DIR: path.join(storageDir, 'work'),
      ...options.env
    },
    overrides: {
      store,
      storage,
      verifier: createSupabaseTokenVerifier({ supabaseUrl: '', jwtSecret: JWT_SECRET }),
      tools: options.tools ?? failingTools,
      now: options.now,
      fetchImpl: options.fetchImpl,
      midtransClient: options.midtransClient,
      membershipGateway: options.membershipGateway,
      whatsappSender: options.whatsappSender ?? null
    }
  });
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(phase2.router);
  return {
    app,
    phase2,
    /** payment_routing tersimpan (dibaca modul digital dengan cache 30 detik; ubah sebelum permintaan pertama). */
    routing,
    store,
    storage,
    products,
    mails,
    cleanup: () => fsp.rm(storageDir, { recursive: true, force: true })
  };
};
