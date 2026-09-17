import type { Request, RequestHandler } from 'express';
import type { DigitalConfig } from './config';
import type { DigitalStore, NewSession } from './store';
import type { AssetStorage } from './storage';
import type { TokenVerifier } from './auth';
import type { AccessLogInput, BookInfo, EntitlementRecord, ProductRecord, SessionRecord } from './types';
import type { MembershipAccess } from './membership/quota';
import type { RoutingEntry } from '../../src/data/paymentRouting';

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

/**
 * Aturan akses institusi fase 4 yang dipakai lapisan akses fase 2 (dipasang index.ts setelah modul institusi dibuat).
 * Tanpa hook ini (mis. modul institusi tidak aktif) entitlement institusi diperlakukan seperti sumber lain.
 */
export interface InstitutionAccessHooks {
  /** Entitlement institusi scope 'shelf' berlaku untuk produk ini? Kontrak berkoleksi custom hanya membuka judul terpilih. */
  coversProduct(entitlement: EntitlementRecord, product: ProductRecord): Promise<boolean>;
  /**
   * Buka sesi untuk entitlement institusi dengan batas pengguna bersamaan (atomik). null = bukan sesi yang dibatasi
   * (pakai insert biasa); busy = semua slot institusi sedang dipakai.
   */
  claimSession(entitlement: EntitlementRecord, row: NewSession): Promise<
    { session: SessionRecord } | { busy: { inUse: number; capacity: number; institutionId: string } } | null
  >;
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
  /** Akses institusi fase 4 (koleksi custom, batas pengguna bersamaan). */
  institution?: InstitutionAccessHooks;
  /** Fase 6: cakupan rak per paket, tanggal buka per paket, kuota audio. */
  membership?: MembershipAccess;
  /** payment_routing (tabel yang sama dengan checkout cetak); bawaan DEFAULT_PAYMENT_ROUTING. */
  paymentRouting: () => Promise<RoutingEntry[]>;
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
