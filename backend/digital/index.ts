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
import { createAccessRouter, isValidRecordId } from './access';
import { createReaderRouter } from './reader';
import { createPlayerRouter } from './player';
import { createAdminDigitalRouter } from './admin';
import { createAnomalyRouter, startAnomalyJob } from './anomalies';
import { createMidtransGateway, type MembershipGateway } from './membership/gateway';
import { createWhatsAppSender, type WhatsAppSender } from './membership/whatsapp';
import { isMembershipNotification, isTransferInvoice, memberPrintPrice, memberUnitPrice, MembershipService } from './membership/service';
import { createMembershipRouter } from './membership/router';
import { createMembershipAdminRouter } from './membership/admin';
import { runMembershipJob, startMembershipJob, type MembershipJobResult } from './membership/jobs';
import { MemoryInstitutionStore } from './institution/memoryStore';
import { SupabaseInstitutionStore } from './institution/supabaseStore';
import { DEFAULT_COMPANY_PROFILE, InstitutionService, isInstitutionNotification } from './institution/service';
import { createInstitutionRouter } from './institution/router';
import { createInstitutionAdminRouter } from './institution/admin';
import { InstitutionMembers } from './institution/members';
import { createInstitutionMemberRouter } from './institution/memberRouter';
import { runInstitutionJob, startInstitutionJob, type InstitutionJobResult } from './institution/jobs';
import type { InstitutionStore } from './institution/store';
import type { CompanyBankAccount, CompanyProfile, InquiryRef } from './institution/types';
import type { DigitalStore } from './store';
import { MembershipAccess } from './membership/quota';
import { digitalUnitSalesEnabled, normalizeRouting, type RoutingEntry } from '../../src/data/paymentRouting';
import type { DigitalContext, DigitalFeature, Mailer, MidtransSettings } from './context';
import type { BookInfo } from './types';

export { isDigitalOrderId, isInstitutionNotification, isMembershipNotification, memberPrintPrice, memberUnitPrice };

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
  /** Fase 4: rekening perusahaan aktif dari CMS (tabel admin_bank_accounts) untuk invoice institusi. */
  listBankAccounts?: () => Promise<CompanyBankAccount[]>;
  /** Fase 6: nomor WhatsApp Finance (pengaturan admin Pembayaran; env hanya cadangan). */
  financeWhatsapp?: () => Promise<string>;
  /** Fase 6: nominal pesanan cetak yang menunggu transfer (kode unik keanggotaan tidak bentrok). */
  openPrintTransferTotals?: () => Promise<number[]>;
  /** Fase 4: identitas penerbit di kepala invoice (konten CMS). */
  getCompanyProfile?: () => Promise<CompanyProfile>;
  /** Fase 4: permintaan penawaran fase 1 yang dikonversi menjadi institusi. */
  getInquiry?: (id: string) => Promise<InquiryRef | null>;
  /** Fase 4: penerima email internal institusi (mis. pemberitahuan perpanjangan H-45); bawaan adminEmails. */
  institutionAdminEmails?: string[];
  /** payment_routing tersimpan (tabel yang sama dengan checkout cetak); null/tidak diisi = bawaan. */
  getPaymentRouting?: () => Promise<RoutingEntry[] | null>;
  /** Job lain yang ikut dijalankan POST /api/internal/cron (mis. kedaluwarsa pesanan cetak transfer manual). */
  cronJobs?: Record<string, () => Promise<unknown>>;
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
    institutionStore: InstitutionStore;
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
  /** Fase 6: nominal tagihan transfer keanggotaan yang masih terbuka (kode unik cetak tidak bentrok). */
  openMembershipTransferTotals?: () => Promise<number[]>;
  /** Akses institusi fase 4 (dipakai tes dan admin). */
  institution?: InstitutionService;
  /** Notifikasi Midtrans invoice institusi (order_id INST-...). */
  handleInstitutionNotification?: (notification: Record<string, any>) => Promise<{ status: number; body: Record<string, unknown> }>;
  runInstitutionJob?: () => Promise<InstitutionJobResult>;
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
  '/api/institution',
  '/api/admin/institution',
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

  // payment_routing dibaca ulang paling lama tiap 30 detik; gagal baca = bawaan (checkout satuan off).
  let routingCache: { at: number; value: RoutingEntry[] } | null = null;
  const paymentRouting = async (): Promise<RoutingEntry[]> => {
    if (routingCache && Date.now() - routingCache.at < 30_000) return routingCache.value;
    let value = normalizeRouting([]);
    try {
      value = normalizeRouting((await deps.getPaymentRouting?.()) ?? []);
    } catch (err: any) {
      console.warn('[digital] gagal membaca payment_routing, memakai bawaan:', err?.message || err);
    }
    routingCache = { at: Date.now(), value };
    return value;
  };

  const contextRef: { current: DigitalContext | null } = { current: null };
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
    // unitSales: pembelian satuan e-book/audiobook terbuka lewat payment_routing (fase 6: bawaan tertutup).
    const unitSales = digitalUnitSalesEnabled(await paymentRouting(), { midtransEnabled: deps.midtrans.enabled });
    res.json({ enabled: feature.allows(email), beta: !feature.enabled && feature.isBeta(email), unitSales });
  });

  // Beranda digital: urutan judul terpopuler 30 hari terakhir (hanya id produk, tanpa jumlah atau data pengguna).
  let popularCache: { at: number; ids: string[] } | null = null;
  router.get('/api/digital/popular', async (_req, res) => {
    const store = contextRef.current?.store;
    if (!store) return res.json({ productIds: [] });
    if (!popularCache || Date.now() - popularCache.at > 10 * 60 * 1000) {
      try {
        const since = new Date((contextRef.current!.now()).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        popularCache = { at: Date.now(), ids: (await store.popularProducts(since, 20)).map((p) => p.productId) };
      } catch (err: any) {
        console.warn('[digital] judul populer gagal dimuat:', err?.message || err);
        return res.json({ productIds: popularCache?.ids ?? [] });
      }
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ productIds: popularCache.ids });
  });

  // Halaman buku (fase 6 Langkah 3): daftar isi publik — nomor, judul, dan posisi bab saja, tanpa isi atau aset.
  router.get('/api/digital/chapters/:productId', async (req, res) => {
    const ctx = contextRef.current;
    const productId = String(req.params.productId);
    if (!ctx || !isValidRecordId(ctx, productId)) return res.status(404).json({ error: 'Produk digital tidak ditemukan.', code: 'product_not_found' });
    try {
      const product = await ctx.store.getProduct(productId);
      if (!product || !product.isActive) return res.status(404).json({ error: 'Produk digital tidak ditemukan.', code: 'product_not_found' });
      const chapters = (await ctx.store.listChapters(productId))
        .sort((a, b) => a.chapterNumber - b.chapterNumber)
        .map((c) => ({ number: c.chapterNumber, title: c.title, startSeconds: c.startSeconds, startPage: c.startPage }));
      res.set('Cache-Control', 'public, max-age=600');
      res.json({ chapters });
    } catch (err: any) {
      console.warn('[digital] daftar bab gagal dimuat:', err?.message || err);
      res.json({ chapters: [] });
    }
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
    feature,
    paymentRouting
  };
  // Fase 6: cakupan rak per paket, tanggal buka per paket, kuota audio.
  context.membership = new MembershipAccess(context);
  contextRef.current = context;

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
  const membership = new MembershipService(context, membershipGateway, midtransClient, whatsappSender, {
    listBankAccounts: deps.listBankAccounts,
    financeWhatsapp: deps.financeWhatsapp,
    otherOpenTransferTotals: deps.openPrintTransferTotals
  });
  router.use(createMembershipRouter(context, membership));
  router.use(createMembershipAdminRouter(context, membership));

  // Akses institusi (fase 4): kontrak, invoice PDF, pelunasan, perpanjangan (Langkah 2).
  const institutionStore = deps.overrides?.institutionStore
    ?? (deps.supabaseAdmin && !deps.overrides?.store ? new SupabaseInstitutionStore(deps.supabaseAdmin) : new MemoryInstitutionStore());
  const institution = new InstitutionService(context, {
    store: institutionStore,
    midtransClient,
    listBankAccounts: deps.listBankAccounts ?? (async () => []),
    getCompanyProfile: deps.getCompanyProfile ?? (async () => DEFAULT_COMPANY_PROFILE),
    getInquiry: deps.getInquiry ?? (async () => null),
    adminEmails: deps.institutionAdminEmails ?? deps.adminEmails
  });
  router.use(createInstitutionRouter(context, institution));
  router.use(createInstitutionAdminRouter(context, institution));
  // Anggota institusi (Langkah 3): bergabung, pengelolaan anggota, dan aturan akses (koleksi custom, pengguna bersamaan).
  const institutionMembers = new InstitutionMembers(institution);
  context.institution = institution.accessHooks();
  router.use(createInstitutionMemberRouter(context, institution, institutionMembers));

  // Akses: sesi baca/dengar, perangkat, Pustaka Saya.
  router.use(createAccessRouter(context));

  // Reader e-book: halaman ber-watermark, pencarian, catatan, progres, verified reading.
  router.use(createReaderRouter(context));

  // Player audiobook: HLS AES-128 lewat proxy bertoken, progres, verified listening.
  router.use(createPlayerRouter(context));

  // Admin: ringkasan penjualan digital (tanpa pesanan uji) dan hapus pesanan uji.
  router.use(createAdminDigitalRouter(context));

  // Anomali: tab admin, pemeriksaan manual, dan endpoint cron.
  router.use(createAnomalyRouter(context, {
    membership: () => runMembershipJob(membership),
    institution: () => runInstitutionJob(institution),
    ...deps.cronJobs
  }));

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
      startInstitutionJob(institution);
    },
    handleMidtransNotification: (notification) => handleDigitalNotification(context, notification),
    membership,
    handleMembershipNotification: (notification) => membership.handleNotification(notification),
    runMembershipJob: () => runMembershipJob(membership),
    memberPrintDiscount: (authorization) => membership.memberPrintDiscount(authorization),
    openMembershipTransferTotals: async () => (await store.listInvoices({ statuses: ['issued'], limit: 5000 }))
      .filter((i) => isTransferInvoice(i))
      .map((i) => i.amount),
    institution,
    handleInstitutionNotification: (notification) => institution.handleNotification(notification),
    runInstitutionJob: () => runInstitutionJob(institution),
    idle: async () => {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    hasEntitlements: async (productId) => (await store.listEntitlements({ productId })).length > 0
  };
};
