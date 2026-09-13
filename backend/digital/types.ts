/**
 * Tipe data backend produk digital fase 2 (entitlement, perangkat, sesi, reader/player, pesanan).
 * Nama field camelCase; pemetaan ke kolom snake_case ada di supabaseStore.ts.
 */

export type DigitalFormat = 'ebook' | 'audiobook';
export type ProcessingStatus = 'none' | 'processing' | 'ready' | 'failed';
export type EntitlementSource = 'purchase' | 'membership' | 'institution' | 'admin_grant' | 'author';
export type EntitlementStatus = 'active' | 'suspended' | 'revoked' | 'expired';
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
}

export interface EntitlementRecord {
  id: string;
  userId: string;
  productId: string;
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
  productId: string;
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
