import type {
  AccessLogInput,
  AccessLogRecord,
  AnomalyCandidate,
  AnomalyRecord,
  AuthUser,
  ChapterRecord,
  DeviceRecord,
  EntitlementRecord,
  EntitlementScope,
  EntitlementSource,
  EntitlementStatus,
  InvoiceKind,
  InvoicePatch,
  InvoiceRecord,
  InvoiceStatus,
  NewEntitlement,
  NewInvoice,
  NewOrder,
  NewSubscription,
  NoteRecord,
  OrderPatch,
  OrderRecord,
  PickRecord,
  PlanBenefitRecord,
  PlanPatch,
  PlanRecord,
  ProcessingStatus,
  ProductPatch,
  ProductRecord,
  ProgressRecord,
  ReadingEventInput,
  SessionRecord,
  SubscriptionEventRecord,
  SubscriptionEventType,
  SubscriptionPatch,
  SubscriptionRecord,
  SubscriptionStatus,
  UserProfile
} from './types';

export interface EntitlementFilter {
  ids?: string[];
  userId?: string;
  /** Hanya baris scope 'product' untuk produk ini. */
  productId?: string;
  scope?: EntitlementScope;
  source?: EntitlementSource;
  sourceRef?: string;
}

export interface SubscriptionFilter {
  userId?: string;
  statuses?: SubscriptionStatus[];
  planId?: string;
  isFounding?: boolean;
  midtransSubscriptionId?: string;
  limit?: number;
}

export interface InvoiceFilter {
  subscriptionId?: string;
  userId?: string;
  statuses?: InvoiceStatus[];
  kinds?: InvoiceKind[];
  /** paid_at >= paidFrom dan < paidTo (ISO). */
  paidFrom?: string;
  paidTo?: string;
  isTest?: boolean;
  limit?: number;
}

/** Status langganan yang belum berakhir: maksimal satu per user (indeks unik parsial di SQL). */
export const OPEN_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['pending', 'active', 'past_due', 'grace'];

export interface SessionFilter {
  ids?: string[];
  deviceId?: string;
  userId?: string;
  productId?: string;
}

/** startedAt/lastHeartbeat diisi dari jam server (sama dengan jam yang dipakai pemeriksaan heartbeat). */
export type NewSession = Omit<SessionRecord, 'id' | 'lastEventAt' | 'endedAt' | 'endReason'>;
export type NewNote = Omit<NoteRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type NewAnomaly = Omit<AnomalyRecord, 'id' | 'detectedAt' | 'resolvedAt' | 'resolvedBy' | 'resolutionNote'>;

/**
 * Akses data fase 2. Implementasi: supabaseStore (produksi, service role) dan memoryStore (tes & dev lokal).
 * Semua operasi yang membutuhkan keunikan melempar ConflictError bila bentrok (idempotency key, sesi aktif, dll.).
 */
export interface DigitalStore {
  readonly kind: 'supabase' | 'memory';
  /** Mencatat profil pengguna yang terlihat (memory store; Supabase membaca auth.users). */
  rememberUser(user: AuthUser): void;

  // Produk & aset terproses
  getProduct(id: string): Promise<ProductRecord | null>;
  listProductsByStatus(status: ProcessingStatus): Promise<ProductRecord[]>;
  /** Produk aktif yang sudah punya tanggal masuk rak (untuk rak digital dan "Segera masuk rak"). */
  listProductsWithShelfDate(): Promise<ProductRecord[]>;
  updateProduct(id: string, patch: ProductPatch): Promise<void>;
  replacePages(productId: string, pages: Array<{ pageNumber: number; text: string }>): Promise<void>;
  searchPages(productId: string, query: string, limit: number): Promise<Array<{ pageNumber: number; text: string }>>;
  replaceChapters(productId: string, chapters: ChapterRecord[]): Promise<void>;
  listChapters(productId: string): Promise<ChapterRecord[]>;

  // Pengguna (admin)
  findUsers(query: string, limit: number): Promise<UserProfile[]>;
  getUserProfiles(ids: string[]): Promise<UserProfile[]>;
  /** Email akun dan status verifikasinya (auth.users.email_confirmed_at); null bila user tidak ada. */
  getEmailVerification(userId: string): Promise<{ email: string; verified: boolean } | null>;

  // Pesanan digital
  getOrderByIdempotencyKey(key: string): Promise<OrderRecord | null>;
  getOrderByNumber(orderNumber: string): Promise<OrderRecord | null>;
  createOrder(order: NewOrder): Promise<OrderRecord>;
  updateOrder(id: string, patch: OrderPatch): Promise<OrderRecord>;
  listOrdersForUser(userId: string): Promise<OrderRecord[]>;
  /** Klaim atomik pengiriman email konfirmasi (hanya bila confirmation_sent_at masih NULL); false bila sudah diklaim. */
  claimConfirmationEmail(orderId: string, at: string): Promise<boolean>;
  /** Admin: pesanan terbaru (baru ke lama), bisa difilter pesanan uji. */
  listOrders(filter: { isTest?: boolean; limit: number }): Promise<OrderRecord[]>;
  /** Admin: hapus pesanan beserta item-nya. Hanya dipakai untuk pesanan uji. */
  deleteOrders(ids: string[]): Promise<void>;
  /** Admin: hapus entitlement (hanya entitlement pembelian dari pesanan uji). */
  deleteEntitlements(ids: string[]): Promise<void>;

  // Entitlement
  listEntitlements(filter: EntitlementFilter): Promise<EntitlementRecord[]>;
  getEntitlement(id: string): Promise<EntitlementRecord | null>;
  /**
   * Insert dengan ON CONFLICT DO NOTHING; mengembalikan jumlah baris baru. Scope 'product': unik per
   * (user, produk, source, source_ref); scope 'shelf': unik per (user, source, source_ref, starts_at).
   */
  insertEntitlements(rows: NewEntitlement[]): Promise<number>;
  updateEntitlements(ids: string[], patch: { status: EntitlementStatus; revokedReason?: string | null; statusChangedBy: string }): Promise<void>;
  /** Ubah akhir masa berlaku (pembatalan, masa tenggang tambahan, pergantian paket). */
  updateEntitlementsEndsAt(ids: string[], endsAt: string): Promise<void>;

  // Perangkat
  listDevices(userId: string, includeReleased?: boolean): Promise<DeviceRecord[]>;
  getDevice(id: string): Promise<DeviceRecord | null>;
  insertDevice(row: { userId: string; fingerprintHash: string; userAgent: string | null; label: string | null }): Promise<DeviceRecord>;
  updateDevice(id: string, patch: Partial<Pick<DeviceRecord, 'lastSeen' | 'userAgent' | 'label' | 'releasedAt' | 'releasedBy'>>): Promise<void>;

  // Sesi
  findOpenSession(userId: string, productId: string): Promise<SessionRecord | null>;
  getSession(id: string): Promise<SessionRecord | null>;
  getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  insertSession(row: NewSession): Promise<SessionRecord>;
  updateSession(id: string, patch: Partial<Pick<SessionRecord, 'lastHeartbeat' | 'lastEventAt'>>): Promise<void>;
  /** Mengakhiri sesi terbuka yang cocok; mengembalikan jumlahnya. */
  endSessions(filter: SessionFilter, reason: string): Promise<number>;
  listOpenSessions(filter: { userId?: string; institutionId?: string }): Promise<SessionRecord[]>;

  // Log & verified reading
  insertAccessLog(row: AccessLogInput): Promise<void>;
  listAccessLogs(userId: string, limit: number): Promise<AccessLogRecord[]>;
  insertReadingEvents(rows: ReadingEventInput[]): Promise<void>;

  // Progres & catatan
  getProgress(userId: string, productId: string): Promise<ProgressRecord | null>;
  listProgress(userId: string): Promise<ProgressRecord[]>;
  upsertProgress(userId: string, productId: string, patch: { position?: number; percent?: number; legalNoticeAcceptedAt?: string }): Promise<ProgressRecord>;
  listNotes(userId: string, productId: string): Promise<NoteRecord[]>;
  countNotes(userId: string, productId: string): Promise<number>;
  createNote(row: NewNote): Promise<NoteRecord>;
  updateNote(id: string, userId: string, patch: Partial<Pick<NoteRecord, 'color' | 'noteText' | 'anchor'>>): Promise<NoteRecord | null>;
  deleteNote(id: string, userId: string): Promise<boolean>;

  // Anomali
  findAnomalyCandidates(now: Date): Promise<AnomalyCandidate[]>;
  /** null bila sudah ada anomali terbuka untuk user + produk + aturan yang sama. */
  insertAnomaly(row: NewAnomaly): Promise<AnomalyRecord | null>;
  listAnomalies(filter: { open?: boolean; userId?: string; limit?: number }): Promise<AnomalyRecord[]>;
  getAnomaly(id: string): Promise<AnomalyRecord | null>;
  resolveAnomaly(id: string, resolvedBy: string, note: string | null): Promise<void>;

  // Keanggotaan (fase 3)
  listPlans(): Promise<PlanRecord[]>;
  updatePlan(id: string, patch: PlanPatch): Promise<PlanRecord | null>;
  listPlanBenefits(): Promise<PlanBenefitRecord[]>;
  /** Ambil satu kursi Founding secara atomik (founding_count < founding_cap); false bila kuota habis. */
  claimFoundingSlot(planId: string): Promise<boolean>;
  releaseFoundingSlot(planId: string): Promise<void>;
  /** ConflictError bila user sudah punya langganan terbuka atau idempotency key terpakai. */
  createSubscription(row: NewSubscription): Promise<SubscriptionRecord>;
  getSubscription(id: string): Promise<SubscriptionRecord | null>;
  getSubscriptionByIdempotencyKey(key: string): Promise<SubscriptionRecord | null>;
  listSubscriptions(filter: SubscriptionFilter): Promise<SubscriptionRecord[]>;
  /** Update bersyarat: null bila tidak ada atau status saat ini tidak termasuk `expectStatuses`. */
  updateSubscription(id: string, patch: SubscriptionPatch, expectStatuses?: SubscriptionStatus[]): Promise<SubscriptionRecord | null>;
  /** ConflictError bila order_ref/order_id terpakai atau invoice initial/renewal periode yang sama sudah ada. */
  createInvoice(row: NewInvoice): Promise<InvoiceRecord>;
  getInvoice(id: string): Promise<InvoiceRecord | null>;
  getInvoiceByOrderRef(orderRef: string): Promise<InvoiceRecord | null>;
  listInvoices(filter: InvoiceFilter): Promise<InvoiceRecord[]>;
  /** Update bersyarat (transisi atomik, mis. issued -> paid sekali saja). */
  updateInvoice(id: string, patch: InvoicePatch, expectStatuses?: InvoiceStatus[]): Promise<InvoiceRecord | null>;
  /** false bila dedupeKey sudah pernah dicatat (pengingat/pemberitahuan tidak terkirim dua kali). */
  insertSubscriptionEvent(row: { subscriptionId: string; type: SubscriptionEventType; meta?: Record<string, unknown>; dedupeKey?: string | null }): Promise<boolean>;
  listSubscriptionEvents(filter: { subscriptionId?: string; type?: SubscriptionEventType; limit?: number }): Promise<SubscriptionEventRecord[]>;
  /** ConflictError bila Pick periode yang sama sudah ada. */
  createPick(row: Omit<PickRecord, 'id' | 'createdAt' | 'entitlementId'>): Promise<PickRecord>;
  listPicks(filter: { subscriptionId?: string; userId?: string }): Promise<PickRecord[]>;
  setPickEntitlement(id: string, entitlementId: string): Promise<void>;
}
