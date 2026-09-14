import type { SupabaseClient } from '@supabase/supabase-js';
import { ConflictError } from './errors';
import type { DigitalStore, EntitlementFilter, InvoiceFilter, NewAnomaly, NewNote, NewSession, SessionFilter, SubscriptionFilter } from './store';
import type {
  AccessLogInput,
  AccessLogRecord,
  AnomalyCandidate,
  AnomalyRecord,
  ChapterRecord,
  DeviceRecord,
  EntitlementRecord,
  InvoicePatch,
  InvoiceRecord,
  InvoiceStatus,
  NewEntitlement,
  NewInvoice,
  NewOrder,
  NewSubscription,
  NoteRecord,
  OrderItemRecord,
  OrderPatch,
  OrderRecord,
  PickRecord,
  PlanBenefitRecord,
  PlanPatch,
  PlanRecord,
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

const nowIso = () => new Date().toISOString();
const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toSnakePatch = (patch: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined).map(([k, v]) => [snake(k), v]));

/** Lempar error Supabase; pelanggaran unik (23505) menjadi ConflictError. */
const check = <T>(result: { data: T; error: { code?: string; message: string } | null }, what: string): T => {
  if (result.error) {
    if (result.error.code === '23505') throw new ConflictError(`${what}: ${result.error.message}`);
    throw new Error(`Supabase ${what}: ${result.error.message}`);
  }
  return result.data;
};

const toProduct = (r: any): ProductRecord => ({
  id: r.id,
  bookId: r.book_id,
  format: r.format,
  price: Number(r.price) || 0,
  isActive: r.is_active !== false,
  availabilityStatus: r.availability_status,
  shelfEntryDate: r.shelf_entry_date ? String(r.shelf_entry_date).slice(0, 10) : null,
  pageCount: num(r.page_count),
  durationSeconds: num(r.duration_seconds),
  storagePath: r.storage_path ?? null,
  processingStatus: r.processing_status || 'none',
  processingError: r.processing_error ?? null,
  processingStartedAt: r.processing_started_at ?? null,
  processedAt: r.processed_at ?? null,
  masterContentType: r.master_content_type ?? null,
  masterSizeBytes: num(r.master_size_bytes),
  masterUploadedAt: r.master_uploaded_at ?? null
});

const toEntitlement = (r: any): EntitlementRecord => ({
  id: r.id,
  userId: r.user_id,
  productId: r.digital_product_id ?? null,
  scope: r.scope === 'shelf' ? 'shelf' : 'product',
  source: r.source,
  sourceRef: r.source_ref ?? null,
  status: r.status,
  startsAt: r.starts_at,
  endsAt: r.ends_at ?? null,
  maxDevices: Number(r.max_devices) || 2,
  revokedReason: r.revoked_reason ?? null,
  statusChangedAt: r.status_changed_at ?? null,
  statusChangedBy: r.status_changed_by ?? null,
  createdAt: r.created_at
});

const toDevice = (r: any): DeviceRecord => ({
  id: r.id,
  userId: r.user_id,
  fingerprintHash: r.device_fingerprint,
  userAgent: r.user_agent ?? null,
  label: r.label ?? null,
  firstSeen: r.first_seen,
  lastSeen: r.last_seen,
  releasedAt: r.released_at ?? null,
  releasedBy: r.released_by ?? null
});

const toSession = (r: any): SessionRecord => ({
  id: r.id,
  userId: r.user_id,
  productId: r.digital_product_id,
  deviceId: r.device_id ?? null,
  entitlementId: r.entitlement_id ?? null,
  tokenHash: r.session_token,
  ip: r.ip ?? null,
  userAgent: r.user_agent ?? null,
  startedAt: r.started_at,
  lastHeartbeat: r.last_heartbeat,
  lastEventAt: r.last_event_at ?? null,
  endedAt: r.ended_at ?? null,
  endReason: r.end_reason ?? null
});

const toProgress = (r: any): ProgressRecord => ({
  userId: r.user_id,
  productId: r.digital_product_id,
  position: Number(r.position) || 0,
  percent: Number(r.percent) || 0,
  legalNoticeAcceptedAt: r.legal_notice_accepted_at ?? null,
  updatedAt: r.updated_at
});

const toNote = (r: any): NoteRecord => ({
  id: r.id,
  userId: r.user_id,
  productId: r.digital_product_id,
  pageNumber: Number(r.page_number),
  anchor: r.anchor && Array.isArray(r.anchor.rects) ? r.anchor : { rects: [] },
  color: r.color,
  noteText: r.note_text ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const toOrderItem = (r: any): OrderItemRecord => ({
  productId: r.digital_product_id,
  bookId: r.book_id,
  format: r.format,
  title: r.title,
  unitPrice: Number(r.unit_price) || 0
});

const toOrder = (r: any): OrderRecord => ({
  id: r.id,
  orderNumber: r.order_number,
  userId: r.user_id,
  idempotencyKey: r.idempotency_key,
  status: r.status,
  amount: Number(r.amount) || 0,
  customerName: r.customer_name,
  customerEmail: r.customer_email,
  language: r.language || 'id',
  licenseAcceptedAt: r.license_accepted_at,
  licenseVersion: r.license_version,
  isTest: r.is_test === true,
  snapToken: r.snap_token ?? null,
  snapRedirectUrl: r.snap_redirect_url ?? null,
  midtransTransactionId: r.midtrans_transaction_id ?? null,
  midtransStatus: r.midtrans_status ?? null,
  paymentType: r.payment_type ?? null,
  fraudStatus: r.fraud_status ?? null,
  paidAt: r.paid_at ?? null,
  refundedAt: r.refunded_at ?? null,
  confirmationSentAt: r.confirmation_sent_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  items: Array.isArray(r.items) ? r.items.map(toOrderItem) : []
});

const toAnomaly = (r: any): AnomalyRecord => ({
  id: r.id,
  userId: r.user_id,
  productId: r.digital_product_id ?? null,
  rule: r.rule,
  details: r.details || {},
  actionTaken: r.action_taken,
  suspendedEntitlementIds: r.suspended_entitlement_ids || [],
  detectedAt: r.detected_at,
  resolvedAt: r.resolved_at ?? null,
  resolvedBy: r.resolved_by ?? null,
  resolutionNote: r.resolution_note ?? null
});

const toProfile = (r: any): UserProfile => ({ id: r.id, email: r.email || '', fullName: r.full_name || '', createdAt: r.created_at });

const toPlan = (r: any): PlanRecord => ({
  id: r.id,
  code: r.code,
  nameId: r.name_id,
  nameEn: r.name_en,
  priceMonthly: Number(r.price_monthly) || 0,
  priceYearly: Number(r.price_yearly) || 0,
  foundingPriceYearly: num(r.founding_price_yearly),
  foundingCap: num(r.founding_cap),
  foundingCount: Number(r.founding_count) || 0,
  maxDevices: Number(r.max_devices) || 1,
  shelfAccess: r.shelf_access,
  printDiscountPercent: Number(r.print_discount_percent) || 0,
  sortOrder: Number(r.sort_order) || 0,
  isActive: r.is_active !== false,
  updatedAt: r.updated_at
});

const toSubscription = (r: any): SubscriptionRecord => ({
  id: r.id,
  userId: r.user_id,
  planId: r.plan_id,
  billingCycle: r.billing_cycle,
  status: r.status,
  isFounding: r.is_founding === true,
  priceLocked: Number(r.price_locked) || 0,
  currentPeriodStart: r.current_period_start ?? null,
  currentPeriodEnd: r.current_period_end ?? null,
  cancelAtPeriodEnd: r.cancel_at_period_end === true,
  canceledAt: r.canceled_at ?? null,
  endedAt: r.ended_at ?? null,
  endedReason: r.ended_reason ?? null,
  paymentMethod: r.payment_method,
  midtransSubscriptionId: r.midtrans_subscription_id ?? null,
  midtransToken: r.midtrans_token ?? null,
  midtransTokenExpiresAt: r.midtrans_token_expires_at ?? null,
  midtransAccountId: r.midtrans_account_id ?? null,
  pendingPlanId: r.pending_plan_id ?? null,
  pendingBillingCycle: r.pending_billing_cycle ?? null,
  foundingEndsAt: r.founding_ends_at ?? null,
  extraGraceDays: Number(r.extra_grace_days) || 0,
  customerEmail: r.customer_email || '',
  customerName: r.customer_name || '',
  language: r.language || 'id',
  whatsappNumber: r.whatsapp_number ?? null,
  whatsappOptIn: r.whatsapp_opt_in === true,
  whatsappOptInAt: r.whatsapp_opt_in_at ?? null,
  idempotencyKey: r.idempotency_key,
  isTest: r.is_test === true,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const toInvoice = (r: any): InvoiceRecord => ({
  id: r.id,
  subscriptionId: r.subscription_id,
  userId: r.user_id,
  kind: r.kind,
  planId: r.plan_id,
  billingCycle: r.billing_cycle,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  amount: Number(r.amount) || 0,
  status: r.status,
  orderRef: r.order_ref,
  midtransOrderId: r.midtrans_order_id ?? null,
  midtransSnapToken: r.midtrans_snap_token ?? null,
  snapRedirectUrl: r.snap_redirect_url ?? null,
  snapCreatedAt: r.snap_created_at ?? null,
  midtransTransactionId: r.midtrans_transaction_id ?? null,
  paymentType: r.payment_type ?? null,
  claimsFounding: r.claims_founding === true,
  isFoundingPrice: r.is_founding_price === true,
  issuedAt: r.issued_at ?? null,
  paidAt: r.paid_at ?? null,
  dueAt: r.due_at ?? null,
  attempt: Number(r.attempt) || 0,
  failureReason: r.failure_reason ?? null,
  isTest: r.is_test === true,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const toSubscriptionEvent = (r: any): SubscriptionEventRecord => ({
  id: String(r.id),
  subscriptionId: r.subscription_id,
  type: r.type,
  meta: r.meta || {},
  dedupeKey: r.dedupe_key ?? null,
  createdAt: r.created_at
});

const toPick = (r: any): PickRecord => ({
  id: r.id,
  subscriptionId: r.subscription_id,
  userId: r.user_id,
  productId: r.digital_product_id,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  entitlementId: r.entitlement_id ?? null,
  createdAt: r.created_at
});

const ORDER_SELECT = '*, items:digital_order_items(*)';

/** Implementasi produksi: tabel fase 2 di Supabase lewat service role (melewati RLS). */
export class SupabaseDigitalStore implements DigitalStore {
  readonly kind = 'supabase' as const;

  constructor(private readonly db: SupabaseClient) {}

  rememberUser(): void {
    // Profil dibaca dari auth.users lewat fungsi admin_user_profiles.
  }

  // ---- produk
  async getProduct(id: string) {
    const data = check(await this.db.from('digital_products').select('*').eq('id', id).maybeSingle(), 'getProduct');
    return data ? toProduct(data) : null;
  }

  async listProductsByStatus(status: ProductRecord['processingStatus']) {
    const data = check(await this.db.from('digital_products').select('*').eq('processing_status', status), 'listProductsByStatus');
    return (data || []).map(toProduct);
  }

  async listProductsWithShelfDate() {
    const data = check(await this.db.from('digital_products').select('*').eq('is_active', true).not('shelf_entry_date', 'is', null), 'listProductsWithShelfDate');
    return (data || []).map(toProduct);
  }

  async updateProduct(id: string, patch: ProductPatch) {
    check(await this.db.from('digital_products').update({ ...toSnakePatch(patch), updated_at: nowIso() }).eq('id', id), 'updateProduct');
  }

  async replacePages(productId: string, pages: Array<{ pageNumber: number; text: string }>) {
    check(await this.db.from('digital_product_pages').delete().eq('digital_product_id', productId), 'deletePages');
    for (let i = 0; i < pages.length; i += 200) {
      const rows = pages.slice(i, i + 200).map((p) => ({ digital_product_id: productId, page_number: p.pageNumber, text_content: p.text }));
      check(await this.db.from('digital_product_pages').insert(rows), 'insertPages');
    }
  }

  async searchPages(productId: string, query: string, limit: number) {
    const data = check(await this.db.rpc('digital_search_pages', { p_product_id: productId, p_query: query, p_limit: limit }), 'searchPages');
    return ((data as any[]) || []).map((r) => ({ pageNumber: Number(r.page_number), text: String(r.text_content || '') }));
  }

  async replaceChapters(productId: string, chapters: ChapterRecord[]) {
    check(await this.db.from('digital_product_chapters').delete().eq('digital_product_id', productId), 'deleteChapters');
    if (chapters.length === 0) return;
    check(await this.db.from('digital_product_chapters').insert(chapters.map((c) => ({
      digital_product_id: productId,
      chapter_number: c.chapterNumber,
      title: c.title,
      start_seconds: c.startSeconds,
      start_page: c.startPage
    }))), 'insertChapters');
  }

  async listChapters(productId: string) {
    const data = check(await this.db.from('digital_product_chapters').select('*').eq('digital_product_id', productId).order('chapter_number'), 'listChapters');
    return (data || []).map((r: any) => ({
      chapterNumber: Number(r.chapter_number),
      title: r.title,
      startSeconds: num(r.start_seconds),
      startPage: num(r.start_page)
    }));
  }

  // ---- pengguna
  async findUsers(query: string, limit: number) {
    const data = check(await this.db.rpc('admin_find_users', { p_query: query, p_limit: limit }), 'findUsers');
    return ((data as any[]) || []).map(toProfile);
  }

  async getUserProfiles(ids: string[]) {
    if (ids.length === 0) return [];
    const data = check(await this.db.rpc('admin_user_profiles', { p_ids: ids }), 'getUserProfiles');
    return ((data as any[]) || []).map(toProfile);
  }

  // ---- pesanan
  async getOrderByIdempotencyKey(key: string) {
    const data = check(await this.db.from('digital_orders').select(ORDER_SELECT).eq('idempotency_key', key).maybeSingle(), 'getOrderByIdempotencyKey');
    return data ? toOrder(data) : null;
  }

  async getOrderByNumber(orderNumber: string) {
    const data = check(await this.db.from('digital_orders').select(ORDER_SELECT).eq('order_number', orderNumber).maybeSingle(), 'getOrderByNumber');
    return data ? toOrder(data) : null;
  }

  async createOrder(order: NewOrder) {
    const { items, ...rest } = order;
    const row = check(await this.db.from('digital_orders').insert(toSnakePatch(rest)).select('id').single(), 'createOrder') as { id: string };
    const itemsResult = await this.db.from('digital_order_items').insert(items.map((it) => ({
      order_id: row.id,
      digital_product_id: it.productId,
      book_id: it.bookId,
      format: it.format,
      title: it.title,
      unit_price: it.unitPrice
    })));
    if (itemsResult.error) {
      await this.db.from('digital_orders').delete().eq('id', row.id);
      throw new Error(`Supabase createOrderItems: ${itemsResult.error.message}`);
    }
    const created = await this.getOrderByNumber(order.orderNumber);
    if (!created) throw new Error('Pesanan tidak ditemukan setelah dibuat');
    return created;
  }

  async updateOrder(id: string, patch: OrderPatch) {
    const data = check(await this.db.from('digital_orders').update(toSnakePatch(patch as Record<string, unknown>)).eq('id', id).select(ORDER_SELECT).single(), 'updateOrder');
    return toOrder(data);
  }

  async listOrders(filter: { isTest?: boolean; limit: number }) {
    // Catatan: PostgREST membatasi maks. 1000 baris per permintaan; ringkasan skala besar dipindah ke SQL (langkah 7).
    let query = this.db.from('digital_orders').select(ORDER_SELECT);
    if (filter.isTest !== undefined) query = query.eq('is_test', filter.isTest);
    const data = check(await query.order('created_at', { ascending: false }).limit(filter.limit), 'listOrders');
    return (data || []).map(toOrder);
  }

  async deleteOrders(ids: string[]) {
    for (let i = 0; i < ids.length; i += 200) {
      check(await this.db.from('digital_orders').delete().in('id', ids.slice(i, i + 200)), 'deleteOrders');
    }
  }

  async deleteEntitlements(ids: string[]) {
    for (let i = 0; i < ids.length; i += 200) {
      check(await this.db.from('entitlements').delete().in('id', ids.slice(i, i + 200)), 'deleteEntitlements');
    }
  }

  async claimConfirmationEmail(orderId: string, at: string) {
    const data = check(await this.db.from('digital_orders').update({ confirmation_sent_at: at })
      .eq('id', orderId).is('confirmation_sent_at', null).select('id'), 'claimConfirmationEmail');
    return (data || []).length > 0;
  }

  async listOrdersForUser(userId: string) {
    const data = check(await this.db.from('digital_orders').select(ORDER_SELECT).eq('user_id', userId).order('created_at', { ascending: false }).limit(100), 'listOrdersForUser');
    return (data || []).map(toOrder);
  }

  // ---- entitlement
  async listEntitlements(filter: EntitlementFilter) {
    let query = this.db.from('entitlements').select('*');
    if (filter.ids) query = query.in('id', filter.ids);
    if (filter.userId) query = query.eq('user_id', filter.userId);
    if (filter.productId) query = query.eq('digital_product_id', filter.productId);
    if (filter.scope) query = query.eq('scope', filter.scope);
    if (filter.source) query = query.eq('source', filter.source);
    if (filter.sourceRef) query = query.eq('source_ref', filter.sourceRef);
    const data = check(await query.order('created_at', { ascending: false }).limit(1000), 'listEntitlements');
    return (data || []).map(toEntitlement);
  }

  async getEntitlement(id: string) {
    const data = check(await this.db.from('entitlements').select('*').eq('id', id).maybeSingle(), 'getEntitlement');
    return data ? toEntitlement(data) : null;
  }

  async insertEntitlements(rows: NewEntitlement[]) {
    if (rows.length === 0) return 0;
    const toRow = (r: NewEntitlement) => ({
      user_id: r.userId,
      digital_product_id: (r.scope ?? 'product') === 'shelf' ? null : r.productId,
      scope: r.scope ?? 'product',
      source: r.source,
      source_ref: r.sourceRef,
      starts_at: r.startsAt || nowIso(),
      ends_at: r.endsAt ?? null,
      max_devices: r.maxDevices ?? 2,
      status: 'active',
      status_changed_at: nowIso(),
      status_changed_by: r.statusChangedBy || null
    });
    let inserted = 0;
    const productRows = rows.filter((r) => (r.scope ?? 'product') === 'product');
    if (productRows.length > 0) {
      const data = check(await this.db.from('entitlements')
        .upsert(productRows.map(toRow), { onConflict: 'user_id,digital_product_id,source,source_ref', ignoreDuplicates: true })
        .select('id'), 'insertEntitlements');
      inserted += (data || []).length;
    }
    // Indeks unik parsial (scope='shelf') tidak bisa dipakai sebagai target ON CONFLICT PostgREST: insert satu per satu,
    // pelanggaran unik (webhook ganda) diabaikan.
    for (const row of rows.filter((r) => r.scope === 'shelf')) {
      const result = await this.db.from('entitlements').insert(toRow(row)).select('id');
      if (result.error?.code === '23505') continue;
      inserted += (check(result, 'insertShelfEntitlement') || []).length;
    }
    return inserted;
  }

  async updateEntitlementsEndsAt(ids: string[], endsAt: string) {
    if (ids.length === 0) return;
    check(await this.db.from('entitlements').update({ ends_at: endsAt }).in('id', ids), 'updateEntitlementsEndsAt');
  }

  async updateEntitlements(ids: string[], patch: { status: EntitlementRecord['status']; revokedReason?: string | null; statusChangedBy: string }) {
    if (ids.length === 0) return;
    check(await this.db.from('entitlements').update({
      status: patch.status,
      ...(patch.revokedReason !== undefined ? { revoked_reason: patch.revokedReason } : {}),
      status_changed_by: patch.statusChangedBy,
      status_changed_at: nowIso()
    }).in('id', ids), 'updateEntitlements');
  }

  // ---- perangkat
  async listDevices(userId: string, includeReleased = false) {
    let query = this.db.from('user_devices').select('*').eq('user_id', userId);
    if (!includeReleased) query = query.is('released_at', null);
    const data = check(await query.order('last_seen', { ascending: false }), 'listDevices');
    return (data || []).map(toDevice);
  }

  async getDevice(id: string) {
    const data = check(await this.db.from('user_devices').select('*').eq('id', id).maybeSingle(), 'getDevice');
    return data ? toDevice(data) : null;
  }

  async insertDevice(row: { userId: string; fingerprintHash: string; userAgent: string | null; label: string | null }) {
    const data = check(await this.db.from('user_devices').insert({
      user_id: row.userId,
      device_fingerprint: row.fingerprintHash,
      user_agent: row.userAgent,
      label: row.label
    }).select('*').single(), 'insertDevice');
    return toDevice(data);
  }

  async updateDevice(id: string, patch: Partial<Pick<DeviceRecord, 'lastSeen' | 'userAgent' | 'label' | 'releasedAt' | 'releasedBy'>>) {
    const row: Record<string, unknown> = {};
    if (patch.lastSeen !== undefined) row.last_seen = patch.lastSeen;
    if (patch.userAgent !== undefined) row.user_agent = patch.userAgent;
    if (patch.label !== undefined) row.label = patch.label;
    if (patch.releasedAt !== undefined) row.released_at = patch.releasedAt;
    if (patch.releasedBy !== undefined) row.released_by = patch.releasedBy;
    check(await this.db.from('user_devices').update(row).eq('id', id), 'updateDevice');
  }

  // ---- sesi
  async findOpenSession(userId: string, productId: string) {
    const data = check(await this.db.from('access_sessions').select('*')
      .eq('user_id', userId).eq('digital_product_id', productId).is('ended_at', null).maybeSingle(), 'findOpenSession');
    return data ? toSession(data) : null;
  }

  async getSession(id: string) {
    const data = check(await this.db.from('access_sessions').select('*').eq('id', id).maybeSingle(), 'getSession');
    return data ? toSession(data) : null;
  }

  async getSessionByTokenHash(tokenHash: string) {
    const data = check(await this.db.from('access_sessions').select('*').eq('session_token', tokenHash).maybeSingle(), 'getSessionByTokenHash');
    return data ? toSession(data) : null;
  }

  async insertSession(row: NewSession) {
    const data = check(await this.db.from('access_sessions').insert({
      user_id: row.userId,
      digital_product_id: row.productId,
      device_id: row.deviceId,
      entitlement_id: row.entitlementId,
      session_token: row.tokenHash,
      ip: row.ip,
      user_agent: row.userAgent,
      started_at: row.startedAt,
      last_heartbeat: row.lastHeartbeat
    }).select('*').single(), 'insertSession');
    return toSession(data);
  }

  async updateSession(id: string, patch: Partial<Pick<SessionRecord, 'lastHeartbeat' | 'lastEventAt'>>) {
    check(await this.db.from('access_sessions').update(toSnakePatch(patch)).eq('id', id), 'updateSession');
  }

  async endSessions(filter: SessionFilter, reason: string) {
    let query = this.db.from('access_sessions').update({ ended_at: nowIso(), end_reason: reason }).is('ended_at', null);
    if (filter.ids) query = query.in('id', filter.ids);
    if (filter.deviceId) query = query.eq('device_id', filter.deviceId);
    if (filter.userId) query = query.eq('user_id', filter.userId);
    if (filter.productId) query = query.eq('digital_product_id', filter.productId);
    const data = check(await query.select('id'), 'endSessions');
    return (data || []).length;
  }

  async listOpenSessions(filter: { userId?: string }) {
    let query = this.db.from('access_sessions').select('*').is('ended_at', null);
    if (filter.userId) query = query.eq('user_id', filter.userId);
    const data = check(await query.order('last_heartbeat', { ascending: false }).limit(500), 'listOpenSessions');
    return (data || []).map(toSession);
  }

  // ---- log & event
  async insertAccessLog(row: AccessLogInput) {
    check(await this.db.from('access_logs').insert({
      user_id: row.userId,
      digital_product_id: row.productId,
      entitlement_id: row.entitlementId ?? null,
      session_id: row.sessionId ?? null,
      action: row.action,
      ip: row.ip ?? null,
      user_agent: row.userAgent ? row.userAgent.slice(0, 400) : null,
      meta: row.meta || {}
    }), 'insertAccessLog');
  }

  async listAccessLogs(userId: string, limit: number) {
    const data = check(await this.db.from('access_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit), 'listAccessLogs');
    return (data || []).map((r: any): AccessLogRecord => ({
      id: String(r.id),
      userId: r.user_id,
      productId: r.digital_product_id,
      entitlementId: r.entitlement_id,
      sessionId: r.session_id,
      action: r.action,
      ip: r.ip,
      userAgent: r.user_agent,
      meta: r.meta || {},
      createdAt: r.created_at
    }));
  }

  async insertReadingEvents(rows: ReadingEventInput[]) {
    if (rows.length === 0) return;
    check(await this.db.from('reading_events').insert(rows.map((r) => ({
      user_id: r.userId,
      digital_product_id: r.productId,
      session_id: r.sessionId,
      entitlement_id: r.entitlementId,
      unit: r.unit,
      unit_start: r.unitStart,
      unit_end: r.unitEnd,
      dwell_ms: r.dwellMs
    }))), 'insertReadingEvents');
  }

  // ---- progres & catatan
  async getProgress(userId: string, productId: string) {
    const data = check(await this.db.from('reading_progress').select('*').eq('user_id', userId).eq('digital_product_id', productId).maybeSingle(), 'getProgress');
    return data ? toProgress(data) : null;
  }

  async listProgress(userId: string) {
    const data = check(await this.db.from('reading_progress').select('*').eq('user_id', userId), 'listProgress');
    return (data || []).map(toProgress);
  }

  async upsertProgress(userId: string, productId: string, patch: { position?: number; percent?: number; legalNoticeAcceptedAt?: string }) {
    const row: Record<string, unknown> = { user_id: userId, digital_product_id: productId, updated_at: nowIso() };
    if (patch.position !== undefined) row.position = patch.position;
    if (patch.percent !== undefined) row.percent = patch.percent;
    if (patch.legalNoticeAcceptedAt !== undefined) row.legal_notice_accepted_at = patch.legalNoticeAcceptedAt;
    const data = check(await this.db.from('reading_progress').upsert(row, { onConflict: 'user_id,digital_product_id' }).select('*').single(), 'upsertProgress');
    return toProgress(data);
  }

  async listNotes(userId: string, productId: string) {
    const data = check(await this.db.from('user_notes').select('*').eq('user_id', userId).eq('digital_product_id', productId)
      .order('page_number').order('created_at'), 'listNotes');
    return (data || []).map(toNote);
  }

  async countNotes(userId: string, productId: string) {
    const { count, error } = await this.db.from('user_notes').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('digital_product_id', productId);
    if (error) throw new Error(`Supabase countNotes: ${error.message}`);
    return count || 0;
  }

  async createNote(row: NewNote) {
    const data = check(await this.db.from('user_notes').insert({
      user_id: row.userId,
      digital_product_id: row.productId,
      page_number: row.pageNumber,
      anchor: row.anchor,
      color: row.color,
      note_text: row.noteText
    }).select('*').single(), 'createNote');
    return toNote(data);
  }

  async updateNote(id: string, userId: string, patch: Partial<Pick<NoteRecord, 'color' | 'noteText' | 'anchor'>>) {
    const row: Record<string, unknown> = {};
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.noteText !== undefined) row.note_text = patch.noteText;
    if (patch.anchor !== undefined) row.anchor = patch.anchor;
    const data = check(await this.db.from('user_notes').update(row).eq('id', id).eq('user_id', userId).select('*').maybeSingle(), 'updateNote');
    return data ? toNote(data) : null;
  }

  async deleteNote(id: string, userId: string) {
    const data = check(await this.db.from('user_notes').delete().eq('id', id).eq('user_id', userId).select('id'), 'deleteNote');
    return (data || []).length > 0;
  }

  // ---- anomali
  async findAnomalyCandidates(now: Date) {
    const data = check(await this.db.rpc('digital_anomaly_candidates', { p_now: now.toISOString() }), 'findAnomalyCandidates');
    return ((data as any[]) || []).map((r): AnomalyCandidate => ({
      userId: r.user_id,
      productId: r.digital_product_id ?? null,
      rule: r.rule,
      details: r.details || {}
    }));
  }

  async insertAnomaly(row: NewAnomaly) {
    const result = await this.db.from('access_anomalies').insert({
      user_id: row.userId,
      digital_product_id: row.productId,
      rule: row.rule,
      details: row.details,
      action_taken: row.actionTaken,
      suspended_entitlement_ids: row.suspendedEntitlementIds
    }).select('*').single();
    if (result.error?.code === '23505') return null; // sudah ada anomali terbuka yang sama
    return toAnomaly(check(result, 'insertAnomaly'));
  }

  async listAnomalies(filter: { open?: boolean; userId?: string; limit?: number }) {
    let query = this.db.from('access_anomalies').select('*');
    if (filter.open === true) query = query.is('resolved_at', null);
    if (filter.open === false) query = query.not('resolved_at', 'is', null);
    if (filter.userId) query = query.eq('user_id', filter.userId);
    const data = check(await query.order('detected_at', { ascending: false }).limit(filter.limit || 200), 'listAnomalies');
    return (data || []).map(toAnomaly);
  }

  async getAnomaly(id: string) {
    const data = check(await this.db.from('access_anomalies').select('*').eq('id', id).maybeSingle(), 'getAnomaly');
    return data ? toAnomaly(data) : null;
  }

  async resolveAnomaly(id: string, resolvedBy: string, note: string | null) {
    check(await this.db.from('access_anomalies').update({ resolved_at: nowIso(), resolved_by: resolvedBy, resolution_note: note }).eq('id', id), 'resolveAnomaly');
  }

  // ---- keanggotaan (tabel fase 3: plans, plan_benefits, subscriptions, subscription_invoices, subscription_events, digital_member_picks)
  async listPlans() {
    const data = check(await this.db.from('plans').select('*').order('sort_order'), 'listPlans');
    return (data || []).map(toPlan);
  }

  async updatePlan(id: string, patch: PlanPatch) {
    const data = check(await this.db.from('plans').update({ ...toSnakePatch(patch), updated_at: nowIso() }).eq('id', id).select('*').maybeSingle(), 'updatePlan');
    return data ? toPlan(data) : null;
  }

  async listPlanBenefits(): Promise<PlanBenefitRecord[]> {
    const data = check(await this.db.from('plan_benefits').select('plan_id, benefit_key, sort_order, feature_flag').order('sort_order'), 'listPlanBenefits');
    return (data || []).map((r: any) => ({ planId: r.plan_id, benefitKey: r.benefit_key, sortOrder: Number(r.sort_order) || 0, featureFlag: r.feature_flag ?? null }));
  }

  async claimFoundingSlot(planId: string) {
    const data = check(await this.db.rpc('membership_claim_founding', { p_plan_id: planId }), 'claimFoundingSlot');
    return data === true;
  }

  async releaseFoundingSlot(planId: string) {
    check(await this.db.rpc('membership_release_founding', { p_plan_id: planId }), 'releaseFoundingSlot');
  }

  async createSubscription(row: NewSubscription) {
    const data = check(await this.db.from('subscriptions').insert(toSnakePatch(row as unknown as Record<string, unknown>)).select('*').single(), 'createSubscription');
    return toSubscription(data);
  }

  async getSubscription(id: string) {
    const data = check(await this.db.from('subscriptions').select('*').eq('id', id).maybeSingle(), 'getSubscription');
    return data ? toSubscription(data) : null;
  }

  async getSubscriptionByIdempotencyKey(key: string) {
    const data = check(await this.db.from('subscriptions').select('*').eq('idempotency_key', key).maybeSingle(), 'getSubscriptionByIdempotencyKey');
    return data ? toSubscription(data) : null;
  }

  async listSubscriptions(filter: SubscriptionFilter) {
    let query = this.db.from('subscriptions').select('*');
    if (filter.userId) query = query.eq('user_id', filter.userId);
    if (filter.statuses) query = query.in('status', filter.statuses);
    if (filter.planId) query = query.eq('plan_id', filter.planId);
    if (filter.isFounding !== undefined) query = query.eq('is_founding', filter.isFounding);
    if (filter.midtransSubscriptionId) query = query.eq('midtrans_subscription_id', filter.midtransSubscriptionId);
    const data = check(await query.order('created_at', { ascending: false }).limit(filter.limit ?? 1000), 'listSubscriptions');
    return (data || []).map(toSubscription);
  }

  async updateSubscription(id: string, patch: SubscriptionPatch, expectStatuses?: SubscriptionStatus[]) {
    let query = this.db.from('subscriptions').update({ ...toSnakePatch(patch as Record<string, unknown>), updated_at: nowIso() }).eq('id', id);
    if (expectStatuses) query = query.in('status', expectStatuses);
    const data = check(await query.select('*').maybeSingle(), 'updateSubscription');
    return data ? toSubscription(data) : null;
  }

  async createInvoice(row: NewInvoice) {
    const data = check(await this.db.from('subscription_invoices').insert(toSnakePatch(row as unknown as Record<string, unknown>)).select('*').single(), 'createInvoice');
    return toInvoice(data);
  }

  async getInvoice(id: string) {
    const data = check(await this.db.from('subscription_invoices').select('*').eq('id', id).maybeSingle(), 'getInvoice');
    return data ? toInvoice(data) : null;
  }

  async getInvoiceByOrderRef(orderRef: string) {
    const data = check(await this.db.from('subscription_invoices').select('*').eq('order_ref', orderRef).maybeSingle(), 'getInvoiceByOrderRef');
    return data ? toInvoice(data) : null;
  }

  async listInvoices(filter: InvoiceFilter) {
    let query = this.db.from('subscription_invoices').select('*');
    if (filter.subscriptionId) query = query.eq('subscription_id', filter.subscriptionId);
    if (filter.userId) query = query.eq('user_id', filter.userId);
    if (filter.statuses) query = query.in('status', filter.statuses);
    if (filter.kinds) query = query.in('kind', filter.kinds);
    if (filter.paidFrom) query = query.gte('paid_at', filter.paidFrom);
    if (filter.paidTo) query = query.lt('paid_at', filter.paidTo);
    if (filter.isTest !== undefined) query = query.eq('is_test', filter.isTest);
    const data = check(await query.order('period_start', { ascending: false }).order('created_at', { ascending: false }).limit(filter.limit ?? 1000), 'listInvoices');
    return (data || []).map(toInvoice);
  }

  async updateInvoice(id: string, patch: InvoicePatch, expectStatuses?: InvoiceStatus[]) {
    let query = this.db.from('subscription_invoices').update({ ...toSnakePatch(patch as Record<string, unknown>), updated_at: nowIso() }).eq('id', id);
    if (expectStatuses) query = query.in('status', expectStatuses);
    const data = check(await query.select('*').maybeSingle(), 'updateInvoice');
    return data ? toInvoice(data) : null;
  }

  async insertSubscriptionEvent(row: { subscriptionId: string; type: SubscriptionEventType; meta?: Record<string, unknown>; dedupeKey?: string | null }) {
    const result = await this.db.from('subscription_events').insert({
      subscription_id: row.subscriptionId,
      type: row.type,
      meta: row.meta || {},
      dedupe_key: row.dedupeKey ?? null
    });
    if (result.error?.code === '23505') return false; // dedupe_key sudah ada: pengingat tidak dikirim dua kali
    check(result, 'insertSubscriptionEvent');
    return true;
  }

  async listSubscriptionEvents(filter: { subscriptionId?: string; type?: SubscriptionEventType; limit?: number }) {
    let query = this.db.from('subscription_events').select('*');
    if (filter.subscriptionId) query = query.eq('subscription_id', filter.subscriptionId);
    if (filter.type) query = query.eq('type', filter.type);
    const data = check(await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(filter.limit ?? 500), 'listSubscriptionEvents');
    return (data || []).map(toSubscriptionEvent);
  }

  async createPick(row: Omit<PickRecord, 'id' | 'createdAt' | 'entitlementId'>) {
    const data = check(await this.db.from('digital_member_picks').insert({
      subscription_id: row.subscriptionId,
      user_id: row.userId,
      digital_product_id: row.productId,
      period_start: row.periodStart,
      period_end: row.periodEnd
    }).select('*').single(), 'createPick');
    return toPick(data);
  }

  async listPicks(filter: { subscriptionId?: string; userId?: string }) {
    let query = this.db.from('digital_member_picks').select('*');
    if (filter.subscriptionId) query = query.eq('subscription_id', filter.subscriptionId);
    if (filter.userId) query = query.eq('user_id', filter.userId);
    const data = check(await query.order('period_start', { ascending: false }).limit(500), 'listPicks');
    return (data || []).map(toPick);
  }

  async setPickEntitlement(id: string, entitlementId: string) {
    check(await this.db.from('digital_member_picks').update({ entitlement_id: entitlementId }).eq('id', id), 'setPickEntitlement');
  }
}
