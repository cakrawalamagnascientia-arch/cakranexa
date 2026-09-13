import type { Request, RequestHandler } from 'express';
import type { DigitalConfig } from './config';
import type { DigitalStore } from './store';
import type { AssetStorage } from './storage';
import type { TokenVerifier } from './auth';
import type { AccessLogInput, BookInfo } from './types';

export interface MailMessage {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface MidtransSettings {
  enabled: boolean;
  serverKey: string;
  snapUrl: string;
  isProduction: boolean;
}

/** Dependensi bersama semua modul fase 2 (dibangun sekali di index.ts). */
export interface DigitalContext {
  config: DigitalConfig;
  store: DigitalStore;
  storage: AssetStorage;
  verifier: TokenVerifier;
  mailer: Mailer;
  midtrans: MidtransSettings;
  adminEmails: string[];
  getBook: (bookId: string) => Promise<BookInfo | null>;
  now: () => Date;
  requireUser: RequestHandler;
  requireAdmin: RequestHandler;
  /** Catat log akses tanpa menunggu (kegagalan log tidak memblokir pembaca). */
  log: (input: AccessLogInput) => void;
  /** Jalankan tugas di latar setelah respons (mis. email); kegagalannya hanya dicatat. */
  defer: (task: () => Promise<void>) => void;
  /** Flag fitur: `allows` = DIGITAL_ENABLED atau email beta; `isBeta` menandai pesanan uji. */
  feature: DigitalFeature;
}

export interface DigitalFeature {
  enabled: boolean;
  isBeta: (email: string | null | undefined) => boolean;
  allows: (email: string | null | undefined) => boolean;
}

export const clientInfo = (req: Request): { ip: string | null; userAgent: string | null } => ({
  ip: req.ip || null,
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 400) : null
});
