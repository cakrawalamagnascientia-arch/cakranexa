/**
 * Tipe data backend produk digital fase 2 (entitlement, perangkat, sesi, reader/player, pesanan).
 * Nama field camelCase; pemetaan ke kolom snake_case ada di supabaseStore.ts.
 */

export type DigitalFormat = 'ebook' | 'audiobook';
export type ProcessingStatus = 'none' | 'processing' | 'ready' | 'failed';
export type EntitlementSource = 'purchase' | 'membership' | 'institution' | 'admin_grant' | 'author';
export type EntitlementStatus = 'active' | 'suspended' | 'revoked' | 'expired';
/** product = hak atas satu produk; shelf = hak atas seluruh Digital Reading Shelf (fase 3, productId NULL). */
export type EntitlementScope = 'product' | 'shelf';
export type DigitalOrderStatus = 'pending' | 'challenge' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';
export type AccessAction = 'page_view' | 'segment' | 'key' | 'search' | 'note' | 'session_start' | 'session_end' | 'denied';
export type NoteColor = 'yellow' | 'green' | 'blue' | 'pink';
export type AnomalyRule = 'ip_spread' | 'device_limit_denials' | 'page_speed';

/** Pengguna dari JWT Supabase. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  createdAt?: string;
}

/** Produk digital beserta kolom fase 2 (storagePath hanya dipakai server). */
export interface ProductRecord {
  id: string;
  bookId: string;
  format: DigitalFormat;
  price: number;
  isActive: boolean;
  availabilityStatus: 'coming_soon' | 'available';
  /** Tanggal masuk Digital Reading Shelf (YYYY-MM-DD, zona Asia/Jakarta); null = belum ditetapkan. */
  shelfEntryDate: string | null;
  pageCount: number | null;
  durationSeconds: number | null;
  storagePath: string | null;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  processingStartedAt: string | null;
  processedAt: string | null;
  masterContentType: string | null;
  masterSizeBytes: number | null;
  masterUploadedAt: string | null;
}

export type ProductPatch = Partial<Pick<ProductRecord,
  'storagePath' | 'processingStatus' | 'processingError' | 'processingStartedAt' | 'processedAt'
  | 'pageCount' | 'durationSeconds' | 'masterContentType' | 'masterSizeBytes' | 'masterUploadedAt'>>;

/** Ringkasan buku untuk judul, watermark, dan email. */
export interface BookInfo {
  id: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string;
  /** Kategori katalog (pilih semua per kategori pada koleksi custom institusi). */
  category?: string;
}

export interface EntitlementRecord {
  id: string;
  userId: string;
  /** null untuk scope 'shelf'. */
  productId: string | null;
  scope: EntitlementScope;
  source: EntitlementSource;
  sourceRef: string | null;
  status: EntitlementStatus;
  startsAt: string;
  endsAt: string | null;
  maxDevices: number;
  revokedReason: string | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  createdAt: string;
}

export interface NewEntitlement {
  userId: string;
  /** null untuk scope 'shelf'. */
  productId: string | null;
  /** Bawaan 'product'. */
  scope?: EntitlementScope;
  source: EntitlementSource;
  sourceRef: string | null;
  startsAt?: string;
  endsAt?: string | null;
  maxDevices?: number;
  statusChangedBy?: string;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  fingerprintHash: string;
  userAgent: string | null;
  label: string | null;
  firstSeen: string;
  lastSeen: string;
  releasedAt: string | null;
  releasedBy: string | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  productId: string;
  deviceId: string | null;
  entitlementId: string | null;
  tokenHash: string;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  lastHeartbeat: string;
  lastEventAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  /** Sesi yang memakai hak institusi (dasar batas pengguna bersamaan & royalti pool institusi fase 5). */
  institutionId: string | null;
}

export interface AccessLogInput {
  userId: string | null;
  productId: string | null;
  entitlementId?: string | null;
  sessionId?: string | null;
  action: AccessAction;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}

export interface AccessLogRecord extends AccessLogInput {
  id: string;
  createdAt: string;
}

export interface ProgressRecord {
  userId: string;
  productId: string;
  position: number;
  percent: number;
  legalNoticeAcceptedAt: string | null;
  updatedAt: string;
}

export interface ReadingEventInput {
  userId: string;
  productId: string;
  sessionId: string;
  entitlementId: string | null;
  unit: 'page' | 'second';
  unitStart: number;
  unitEnd: number;
  dwellMs: number;
  /** Sesi memakai hak institusi (dasar Author Royalty Pool institusi fase 5). */
  institutionId?: string | null;
  /** Fase 6: langganan yang memberi akses (agregasi kuota audio). */
  subscriptionId?: string | null;
  /** Waktu kejadian menurut jam server (store memori); Supabase memakai created_at database. */
  occurredAt?: string;
}

export interface NoteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NoteRecord {
  id: string;
  userId: string;
  productId: string;
  pageNumber: number;
  anchor: { rects: NoteRect[] };
  color: NoteColor;
  noteText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterRecord {
  chapterNumber: number;
  title: string;
  startSeconds: number | null;
  startPage: number | null;
}

export interface OrderItemRecord {
  productId: string;
  bookId: string;
  format: DigitalFormat;
  title: string;
  unitPrice: number;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  userId: string;
  idempotencyKey: string;
  status: DigitalOrderStatus;
  amount: number;
  customerName: string;
  customerEmail: string;
  language: string;
  licenseAcceptedAt: string;
  licenseVersion: string;
  snapToken: string | null;
  snapRedirectUrl: string | null;
  midtransTransactionId: string | null;
  midtransStatus: string | null;
  paymentType: string | null;
  fraudStatus: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  confirmationSentAt: string | null;
  /** Pembeli ada di DIGITAL_BETA_EMAILS: pesanan uji, dikecualikan dari ringkasan penjualan. */
  isTest: boolean;
  createdAt: string;
  updatedAt: string;
  items: OrderItemRecord[];
}

export type NewOrder = Omit<OrderRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type OrderPatch = Partial<Omit<OrderRecord, 'id' | 'orderNumber' | 'userId' | 'idempotencyKey' | 'items' | 'createdAt' | 'updatedAt'>>;

export interface AnomalyCandidate {
  userId: string;
  productId: string | null;
  rule: AnomalyRule;
  details: Record<string, unknown>;
}

export interface AnomalyRecord extends AnomalyCandidate {
  id: string;
  actionTaken: 'flagged' | 'suspended';
  suspendedEntitlementIds: string[];
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

// ---------------------------------------------------------------------------
// Keanggotaan (fase 3)
// ---------------------------------------------------------------------------
/** Paket fase 6 (skema terkunci) dan paket fase 3 (nonaktif, dibaca untuk pelanggan lama). */
export type PlanCode = 'blue' | 'silver' | 'gold' | 'platinum' | LegacyPlanCode;
export type LegacyPlanCode = 'free' | 'reader' | 'professional' | 'author';
export type ShelfAccess = 'none' | 'pick' | 'full';
export type BillingCycle = 'monthly' | 'yearly';
export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'grace' | 'canceled' | 'expired';
export type MembershipPaymentMethod = 'card' | 'gopay' | 'va' | 'qris' | 'other' | 'bank_transfer';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'failed' | 'void';
/** initial = pembayaran pertama; renewal = periode berikutnya; upgrade = selisih prorata; manual = pembayaran offline oleh admin. */
export type InvoiceKind = 'initial' | 'renewal' | 'upgrade' | 'manual';

export interface PlanRecord {
  id: string;
  code: PlanCode;
  nameId: string;
  nameEn: string;
  priceMonthly: number;
  priceYearly: number;
  foundingPriceYearly: number | null;
  foundingCap: number | null;
  foundingCount: number;
  maxDevices: number;
  /** Nilai di tabel; akses efektif juga bergantung flag (ENABLE_READER_DIGITAL_PICK, ENABLE_AUTHOR_GUILD_SHELF). */
  shelfAccess: ShelfAccess;
  /** Diskon harga member buku cetak (Langkah 7, flag ENABLE_MEMBER_PRINT_DISCOUNT). */
  printDiscountPercent: number;
  sortOrder: number;
  isActive: boolean;
  /** Fase 6: judul e-book per bulan yang dibuka lewat jatah (null = tidak memakai jatah). */
  ebookTitlesPerPeriod: number | null;
  /** Fase 6: jam audio per bulan per akun (null = tanpa batas untuk paket rak penuh lama; audio tidak dibuka bila 'pick' dan null). */
  audioHoursPerPeriod: number | null;
  /** Fase 6: judul terbuka shelf_entry_date + hari ini (null = rak tidak dibuka; paket lama = 0). */
  frontlistDays: number | null;
  offlineTitles: number;
  familyAccounts: number;
  /** Paket lama -> paket baru saat perpanjangan. */
  successorPlanId: string | null;
  updatedAt: string;
}

export type PlanPatch = Partial<Pick<PlanRecord,
  'priceMonthly' | 'priceYearly' | 'foundingPriceYearly' | 'foundingCap' | 'maxDevices' | 'shelfAccess' | 'printDiscountPercent' | 'isActive'
  | 'ebookTitlesPerPeriod' | 'audioHoursPerPeriod' | 'frontlistDays' | 'offlineTitles' | 'familyAccounts'>>;

export interface PlanBenefitRecord {
  planId: string;
  benefitKey: string;
  sortOrder: number;
  /** Nama flag env; awalan "!" = tampil bila flag MATI. null = selalu tampil. */
  featureFlag: string | null;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planId: string;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  isFounding: boolean;
  /** Harga per periode yang disepakati untuk periode berjalan. */
  priceLocked: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  paymentMethod: MembershipPaymentMethod;
  midtransSubscriptionId: string | null;
  /** Token Midtrans (saved_token_id / token GoPay) terenkripsi AES-256-GCM. Tidak pernah nomor kartu. */
  midtransToken: string | null;
  midtransTokenExpiresAt: string | null;
  midtransAccountId: string | null;
  pendingPlanId: string | null;
  pendingBillingCycle: BillingCycle | null;
  /** Akhir tahun pertama (harga Founding berlaku sampai tanggal ini). */
  foundingEndsAt: string | null;
  extraGraceDays: number;
  customerEmail: string;
  customerName: string;
  language: string;
  /** Nomor WhatsApp anggota (628…) untuk pengingat; hanya diisi bila anggota menyetujui (whatsappOptIn). */
  whatsappNumber: string | null;
  whatsappOptIn: boolean;
  whatsappOptInAt: string | null;
  idempotencyKey: string;
  isTest: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NewSubscription = Omit<SubscriptionRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type SubscriptionPatch = Partial<Omit<SubscriptionRecord, 'id' | 'userId' | 'idempotencyKey' | 'createdAt' | 'updatedAt'>>;

export interface InvoiceRecord {
  id: string;
  subscriptionId: string;
  userId: string;
  kind: InvoiceKind;
  /** Paket & siklus yang dibayar invoice ini (renewal dengan downgrade terjadwal, atau upgrade). */
  planId: string;
  billingCycle: BillingCycle;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: InvoiceStatus;
  /** Referensi tetap invoice (SUB-...); order_id Midtrans = `${orderRef}-${attempt}`. */
  orderRef: string;
  midtransOrderId: string | null;
  midtransSnapToken: string | null;
  snapRedirectUrl: string | null;
  snapCreatedAt: string | null;
  midtransTransactionId: string | null;
  paymentType: string | null;
  /** Upgrade/langganan baru yang mengambil satu kursi Founding (dilepas bila tidak dibayar). */
  claimsFounding: boolean;
  isFoundingPrice: boolean;
  issuedAt: string | null;
  paidAt: string | null;
  dueAt: string | null;
  attempt: number;
  failureReason: string | null;
  isTest: boolean;
  /** Fase 6 transfer bank: kode unik 1–999 (null = bukan transfer / tanpa kode) dan potongan (amount = harga - potongan). */
  uniqueCode: number | null;
  uniqueDiscount: number;
  /** Path bukti transfer di bucket privat. */
  paymentProofPath: string | null;
  paymentProofUploadedAt: string | null;
  /** 'admin' (konfirmasi Finance) atau 'midtrans'. */
  paymentConfirmedBy: string | null;
  /** Referensi mutasi bank dari Finance. */
  paymentReference: string | null;
  dueExtendedCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Kolom transfer bank fase 6: opsional saat membuat invoice (bawaan: bukan transfer, tanpa bukti). */
export type InvoiceTransferField = 'uniqueCode' | 'uniqueDiscount' | 'paymentProofPath' | 'paymentProofUploadedAt' | 'paymentConfirmedBy' | 'paymentReference' | 'dueExtendedCount';
export type NewInvoice = Omit<InvoiceRecord, 'id' | 'createdAt' | 'updatedAt' | InvoiceTransferField> & Partial<Pick<InvoiceRecord, InvoiceTransferField>>;
export type InvoicePatch = Partial<Omit<InvoiceRecord, 'id' | 'subscriptionId' | 'userId' | 'orderRef' | 'createdAt' | 'updatedAt'>>;

export type SubscriptionEventType =
  | 'created' | 'activated' | 'renewed' | 'payment_failed' | 'reminder_sent' | 'grace_started' | 'expired' | 'canceled'
  | 'upgraded' | 'downgraded' | 'founding_notice' | 'invoice_issued' | 'cancel_reverted' | 'change_canceled'
  | 'payment_method_changed' | 'pick_selected' | 'reconciled' | 'admin_extended' | 'admin_grace' | 'admin_plan_changed'
  | 'admin_founding' | 'admin_canceled' | 'autodebit_error' | 'refunded' | 'payment_orphan' | 'whatsapp_failed'
  | 'plan_migration_notice' | 'plan_migrated' | 'title_picked' | 'family_added' | 'family_removed'
  | 'transfer_proof' | 'transfer_confirmed';

export interface SubscriptionEventRecord {
  id: string;
  subscriptionId: string;
  type: SubscriptionEventType;
  meta: Record<string, unknown>;
  dedupeKey: string | null;
  createdAt: string;
}

export interface PickRecord {
  id: string;
  subscriptionId: string;
  userId: string;
  productId: string;
  periodStart: string;
  periodEnd: string;
  entitlementId: string | null;
  createdAt: string;
}

/** Fase 6: judul e-book yang dibuka dengan jatah bulanan (period_title_picks). */
export interface TitlePickRecord {
  id: string;
  subscriptionId: string;
  userId: string;
  productId: string;
  periodStart: string;
  periodEnd: string;
  entitlementId: string | null;
  pickedAt: string;
}

export type FamilyMemberStatus = 'active' | 'removed';

/** Fase 6: akun keluarga Platinum (family_members). */
export interface FamilyMemberRecord {
  id: string;
  ownerSubscriptionId: string;
  userId: string;
  status: FamilyMemberStatus;
  addedAt: string;
  removedAt: string | null;
}

/** Konteks akses yang dipasang middleware sesi untuk endpoint reader/player. */
export interface AccessContext {
  user: AuthUser;
  product: ProductRecord;
  entitlement: EntitlementRecord;
  session: SessionRecord;
}

/** Hak akses yang lolos requireEntitlement (sebelum sesi dibuat). */
export interface AccessGrant {
  product: ProductRecord;
  entitlement: EntitlementRecord;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      digitalUser?: AuthUser;
      digitalGrant?: AccessGrant;
      digitalAccess?: AccessContext;
    }
  }
}
