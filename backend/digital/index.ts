import express, { type RequestHandler, type Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDigitalConfig } from './config';
import { createSupabaseTokenVerifier, requireUser, type TokenVerifier } from './auth';
import { digitalErrorHandler } from './errors';
import { MemoryDigitalStore, type Phase1ProductLike } from './memoryStore';
import { SupabaseDigitalStore } from './supabaseStore';
import { createFilesystemAssetStorage, createSupabaseAssetStorage, type AssetStorage } from './storage';
import { createCliTools, createProcessingRouter, ProcessingQueue, type ProcessingTools } from './processing';
import { createCheckoutRouter, createMidtransClient, handleDigitalNotification, isDigitalOrderId, type MidtransClient } from './checkout';
import { createAccessRouter } from './access';
import { createReaderRouter } from './reader';
import { createPlayerRouter } from './player';
import { createAdminDigitalRouter } from './admin';
import { createAnomalyRouter, startAnomalyJob } from './anomalies';
import { createMidtransGateway, type MembershipGateway } from './membership/gateway';
import { createWhatsAppSender, type WhatsAppSender } from './membership/whatsapp';
import { isMembershipNotification, memberPrintPrice, memberUnitPrice, MembershipService } from './membership/service';
import { createMembershipRouter } from './membership/router';
import { createMembershipAdminRouter } from './membership/admin';
import { runMembershipJob, startMembershipJob, type MembershipJobResult } from './membership/jobs';
import type { DigitalStore } from './store';
import type { DigitalContext, DigitalFeature, Mailer, MidtransSettings } from './context';
import type { BookInfo } from './types';

export { isDigitalOrderId, isMembershipNotification, memberPrintPrice, memberUnitPrice };

export interface Phase2Deps {
  supabaseAdmin: SupabaseClient | null;
  supabaseUrl: string;
  requireAdmin: RequestHandler;
  getBook: (bookId: string) => Promise<BookInfo | null>;
  /** Produk fase 1 (dipakai store memori untuk tes/dev lokal). */
  listPhase1Products: () => Promise<Phase1ProductLike[]>;
  mailer: Mailer;
  adminEmails: string[];
  midtrans: MidtransSettings;
  env?: NodeJS.ProcessEnv;
  /** Pengganti untuk tes otomatis. */
  overrides?: Partial<{
    store: DigitalStore;
    storage: AssetStorage;
    verifier: TokenVerifier;
    tools: ProcessingTools;
    now: () => Date;
    fetchImpl: typeof fetch;
    midtransClient: MidtransClient;
    membershipGateway: MembershipGateway;
    /** null = tanpa WhatsApp (tes); tidak diisi = sesuai env WHATSAPP_PROVIDER. */
    whatsappSender: WhatsAppSender | null;
  }>;
}

export interface DigitalPhase2 {
  router: Router;
  enabled: boolean;
  context: DigitalContext | null;
  /** Flag fitur (DIGITAL_ENABLED + DIGITAL_BETA_EMAILS), juga dipakai sitemap server. */
  feature: DigitalFeature;
  /** Antrian pemrosesan aset (dipakai tes dan status admin). */
  queue?: ProcessingQueue;
  /** Menjalankan job latar (antrian pemrosesan, deteksi anomali) — hanya di server yang selalu hidup. */
  startJobs?: () => void;
  /** Notifikasi Midtrans untuk pesanan DIG- (tidak ada bila fitur tidak aktif di instance ini). */
  handleMidtransNotification?: (notification: Record<string, any>) => Promise<{ status: number; body: Record<string, unknown> }>;
  /** Menunggu tugas latar (mis. email) selesai — untuk tes. */
  idle?: () => Promise<void>;
  /** Produk sudah dimiliki pembeli (entitlement status apa pun)? Penjaga hapus produk di admin fase 1. */
  hasEntitlements?: (productId: string) => Promise<boolean>;
  /** Keanggotaan fase 3 (dipakai tes dan admin). */
  membership?: MembershipService;
  /** Notifikasi Midtrans keanggotaan (order_id SUB-... atau tagihan otomatis Midtrans Subscriptions). */
  handleMembershipNotification?: (notification: Record<string, any>) => Promise<{ status: number; body: Record<string, unknown> }>;
  runMembershipJob?: () => Promise<MembershipJobResult>;
  /** Langkah 7: persen harga member buku cetak untuk pemilik token; null bila flag mati atau bukan anggota aktif. */
  memberPrintDiscount?: (authorization: string | undefined) => Promise<{ percent: number; planCode: string } | null>;
}

/** Awalan rute fase 2 — dijawab 503 bila fitur tidak aktif di instance ini. */
export const PHASE2_ROUTE_PREFIXES = [
  '/api/account',
  '/api/access',
  '/api/devices',
  '/api/reader',
  '/api/player',
  '/api/library',
  '/api/digital/checkout',
  '/api/digital/orders',
  '/api/admin/digital-access',
  '/api/admin/digital/processing',
  '/api/membership',
  '/api/admin/membership',
  '/api/internal/cron'
];

/**
 * Membangun modul produk digital fase 2 (entitlement, checkout, reader, player, pemrosesan aset, admin akses).
 * Aktif di server Express utama (Render) bila Supabase terhubung, atau di mode lokal DIGITAL_LOCAL_DEV=1.
 * Di fungsi serverless Vercel semua rute fase 2 menjawab 503 "use_primary_api": frontend memakai API Render.
 *
 * Flag DIGITAL_ENABLED: saat false, endpoint pembeli menjawab 404 "digital_disabled" kecuali untuk email di
 * DIGITAL_BETA_EMAILS. Endpoint admin, webhook Midtrans, dan pengakhiran sesi tetap berjalan.
 */
export const createDigitalPhase2 = (deps: Phase2Deps): DigitalPhase2 => {
  const env = deps.env || process.env;
  const config = loadDigitalConfig(env);
  const router = express.Router();

  const betaEmails = new Set(config.betaEmails);
  const isBeta = (email: string | null | undefined) => Boolean(email && betaEmails.has(email.trim().toLowerCase()));
  const feature: DigitalFeature = {
    enabled: config.featureEnabled,
    isBeta,
    allows: (email) => config.featureEnabled || isBeta(email)
  };

  const verifier = deps.overrides?.verifier ?? createSupabaseTokenVerifier({
    supabaseUrl: deps.supabaseUrl,
    jwtSecret: env.SUPABASE_JWT_SECRET
  });

  // Status fitur untuk frontend (menu & rute digital). Token opsional: email beta tetap mendapat akses saat flag mati.
  router.get('/api/digital/status', async (req, res) => {
    const header = req.headers.authorization || '';
    let email: string | null = null;
    if (header.startsWith('Bearer ')) {
      try {
        email = (await verifier.verify(header.slice(7).trim())).email;
      } catch {
        email = null;
      }
    }
    res.set('Cache-Control', 'private, no-store');
    res.json({ enabled: feature.allows(email), beta: !feature.enabled && feature.isBeta(email) });
  });

  // Respons API fase 2 (token sesi, URL playlist bertoken, data pribadi) tidak boleh disimpan cache browser/proxy.
  router.use(PHASE2_ROUTE_PREFIXES, (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  const unavailable = (code: string, message: string): RequestHandler => (_req, res) => {
    res.status(503).json({ error: message, code });
  };

  if (config.isVercel && !deps.overrides?.store) {
    router.use(PHASE2_ROUTE_PREFIXES, unavailable('use_primary_api', 'Fitur digital dilayani oleh server API utama.'));
    return { router, enabled: false, context: null, feature };
  }

  const store: DigitalStore | null = deps.overrides?.store
    ?? (deps.supabaseAdmin
      ? new SupabaseDigitalStore(deps.supabaseAdmin)
      : config.localDevStorageDir ? new MemoryDigitalStore(deps.listPhase1Products) : null);
  const storage: AssetStorage | null = deps.overrides?.storage
    ?? (deps.supabaseAdmin
      ? createSupabaseAssetStorage(deps.supabaseAdmin, config.assetsBucket)
      : config.localDevStorageDir ? createFilesystemAssetStorage(config.localDevStorageDir) : null);

  if (!store || !storage) {
    router.use(PHASE2_ROUTE_PREFIXES, unavailable('digital_unavailable', 'Fitur digital memerlukan Supabase (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY).'));
    return { router, enabled: false, context: null, feature };
  }

  // Login saja (akun), lalu login + flag fitur (semua endpoint pembeli digital).
  const requireAccount = requireUser(verifier, (user) => store.rememberUser(user));
  const requireMember: RequestHandler = (req, res, next) => {
    void requireAccount(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (!feature.allows(req.digitalUser?.email)) {
        return res.status(404).json({ error: 'Fitur digital belum dibuka.', code: 'digital_disabled' });
      }
      return next();
    });
  };

  // Tugas latar (email konfirmasi) — dilacak agar tes bisa menunggu sampai selesai.
  const pending = new Set<Promise<void>>();
  const defer = (task: () => Promise<void>) => {
    const running: Promise<void> = task()
      .catch((err) => console.warn('[digital] tugas latar gagal:', err?.message || err))
      .finally(() => {
        pending.delete(running);
      });
    pending.add(running);
  };

  const context: DigitalContext = {
    config,
    store,
    storage,
    verifier,
    mailer: deps.mailer,
    midtrans: deps.midtrans,
    adminEmails: deps.adminEmails,
    getBook: deps.getBook,
    now: deps.overrides?.now ?? (() => new Date()),
    requireUser: requireMember,
    requireAdmin: deps.requireAdmin,
    log: (input) => {
      store.insertAccessLog(input).catch((err) => console.warn('[digital] access log gagal:', err?.message || err));
    },
    defer,
    feature
  };

  // Akun: identitas dari JWT Supabase. Tidak terkena flag agar penguji beta bisa masuk saat fitur masih tertutup.
  router.get('/api/account/me', requireAccount, (req, res) => {
    res.json({ user: req.digitalUser, digitalEnabled: feature.allows(req.digitalUser?.email) });
  });

  // Pemrosesan aset (admin): unggah master, antrian job, bab.
  const tools = deps.overrides?.tools ?? createCliTools(config.tools);
  const queue = new ProcessingQueue(context, tools);
  router.use(createProcessingRouter(context, queue));

  // Pembelian satuan (Midtrans Snap). Entitlement hanya dibuat dari webhook.
  const midtransClient = deps.overrides?.midtransClient ?? createMidtransClient(deps.midtrans, deps.overrides?.fetchImpl ?? fetch);
  router.use(createCheckoutRouter(context, midtransClient));

  // Keanggotaan berbayar (fase 3): pendaftaran, penagihan, Digital Reading Shelf, Pick, admin.
  const membershipGateway = deps.overrides?.membershipGateway ?? createMidtransGateway(deps.midtrans, deps.overrides?.fetchImpl ?? fetch);
  const whatsappSender = deps.overrides && 'whatsappSender' in deps.overrides
    ? deps.overrides.whatsappSender ?? null
    : createWhatsAppSender(config.whatsapp, deps.overrides?.fetchImpl ?? fetch);
  const membership = new MembershipService(context, membershipGateway, midtransClient, whatsappSender);
  router.use(createMembershipRouter(context, membership));
  router.use(createMembershipAdminRouter(context, membership));

  // Akses: sesi baca/dengar, perangkat, Pustaka Saya.
  router.use(createAccessRouter(context));

  // Reader e-book: halaman ber-watermark, pencarian, catatan, progres, verified reading.
  router.use(createReaderRouter(context));

  // Player audiobook: HLS AES-128 lewat proxy bertoken, progres, verified listening.
  router.use(createPlayerRouter(context));

  // Admin: ringkasan penjualan digital (tanpa pesanan uji) dan hapus pesanan uji.
  router.use(createAdminDigitalRouter(context));

  // Anomali: tab admin, pemeriksaan manual, dan endpoint cron.
  router.use(createAnomalyRouter(context, { membership: () => runMembershipJob(membership) }));

  router.use(PHASE2_ROUTE_PREFIXES, digitalErrorHandler);
  return {
    router,
    enabled: true,
    context,
    feature,
    queue,
    startJobs: () => {
      if (!config.jobsEnabled) return;
      queue.start();
      startAnomalyJob(context);
      startMembershipJob(membership);
    },
    handleMidtransNotification: (notification) => handleDigitalNotification(context, notification),
    membership,
    handleMembershipNotification: (notification) => membership.handleNotification(notification),
    runMembershipJob: () => runMembershipJob(membership),
    memberPrintDiscount: (authorization) => membership.memberPrintDiscount(authorization),
    idle: async () => {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    hasEntitlements: async (productId) => (await store.listEntitlements({ productId })).length > 0
  };
};
