import crypto from 'crypto';
import { ConflictError } from './errors';
import type { DigitalStore, EntitlementFilter, NewAnomaly, NewNote, NewSession, SessionFilter } from './store';
import type {
  AccessLogRecord,
  AnomalyCandidate,
  AnomalyRecord,
  AuthUser,
  ChapterRecord,
  DeviceRecord,
  EntitlementRecord,
  NoteRecord,
  OrderRecord,
  ProductPatch,
  ProductRecord,
  ProgressRecord,
  ReadingEventInput,
  SessionRecord,
  UserProfile
} from './types';

/** Data produk fase 1 (katalog) yang menjadi dasar ProductRecord di mode memori. */
export interface Phase1ProductLike {
  id: string;
  bookId: string;
  format: 'ebook' | 'audiobook';
  price: number;
  isActive: boolean;
  availabilityStatus: 'coming_soon' | 'available';
  pageCount: number | null;
  durationSeconds: number | null;
}

const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * Penyimpanan memori untuk tes otomatis dan dev lokal (DIGITAL_LOCAL_DEV=1). Tidak pernah dipakai di produksi:
 * data hilang saat proses berhenti.
 */
export class MemoryDigitalStore implements DigitalStore {
  readonly kind = 'memory' as const;
  readonly users = new Map<string, UserProfile>();
  readonly productExtras = new Map<string, ProductPatch>();
  readonly pages = new Map<string, Array<{ pageNumber: number; text: string }>>();
  readonly chapters = new Map<string, ChapterRecord[]>();
  readonly orders: OrderRecord[] = [];
  readonly entitlements: EntitlementRecord[] = [];
  readonly devices: DeviceRecord[] = [];
  readonly sessions: SessionRecord[] = [];
  readonly logs: AccessLogRecord[] = [];
  readonly events: Array<ReadingEventInput & { id: string; createdAt: string }> = [];
  readonly progress = new Map<string, ProgressRecord>();
  readonly notes: NoteRecord[] = [];
  readonly anomalies: AnomalyRecord[] = [];

  constructor(private readonly productSource: () => Promise<Phase1ProductLike[]>) {}

  rememberUser(user: AuthUser): void {
    if (!this.users.has(user.id)) this.users.set(user.id, { id: user.id, email: user.email, fullName: user.name, createdAt: nowIso() });
  }

  // ---- produk
  private toProduct(base: Phase1ProductLike): ProductRecord {
    const extra = this.productExtras.get(base.id) || {};
    return {
      id: base.id,
      bookId: base.bookId,
      format: base.format,
      price: base.price,
      isActive: base.isActive,
      availabilityStatus: base.availabilityStatus,
      pageCount: extra.pageCount !== undefined ? extra.pageCount : base.pageCount,
      durationSeconds: extra.durationSeconds !== undefined ? extra.durationSeconds : base.durationSeconds,
      storagePath: extra.storagePath ?? null,
      processingStatus: extra.processingStatus ?? 'none',
      processingError: extra.processingError ?? null,
      processingStartedAt: extra.processingStartedAt ?? null,
      processedAt: extra.processedAt ?? null,
      masterContentType: extra.masterContentType ?? null,
      masterSizeBytes: extra.masterSizeBytes ?? null,
      masterUploadedAt: extra.masterUploadedAt ?? null
    };
  }

  async getProduct(id: string) {
    const base = (await this.productSource()).find((p) => p.id === id);
    return base ? this.toProduct(base) : null;
  }

  async listProductsByStatus(status: ProductRecord['processingStatus']) {
    return (await this.productSource()).map((p) => this.toProduct(p)).filter((p) => p.processingStatus === status);
  }

  async updateProduct(id: string, patch: ProductPatch) {
    this.productExtras.set(id, { ...(this.productExtras.get(id) || {}), ...patch });
  }

  async replacePages(productId: string, pages: Array<{ pageNumber: number; text: string }>) {
    this.pages.set(productId, pages.map((p) => ({ ...p })));
  }

  async searchPages(productId: string, query: string, limit: number) {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (terms.length === 0) return [];
    return (this.pages.get(productId) || [])
      .filter((p) => terms.every((t) => p.text.toLowerCase().includes(t)))
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .slice(0, Math.min(limit, 50))
      .map((p) => ({ ...p }));
  }

  async replaceChapters(productId: string, chapters: ChapterRecord[]) {
    this.chapters.set(productId, chapters.map((c) => ({ ...c })));
  }

  async listChapters(productId: string) {
    return (this.chapters.get(productId) || []).map((c) => ({ ...c }));
  }

  // ---- pengguna
  async findUsers(query: string, limit: number) {
    const q = query.trim().toLowerCase();
    return [...this.users.values()]
      .filter((u) => !q || u.email.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q))
      .slice(0, limit);
  }

  async getUserProfiles(ids: string[]) {
    return ids.map((id) => this.users.get(id)).filter((u): u is UserProfile => Boolean(u));
  }

  // ---- pesanan
  async getOrderByIdempotencyKey(key: string) {
    const order = this.orders.find((o) => o.idempotencyKey === key);
    return order ? clone(order) : null;
  }

  async getOrderByNumber(orderNumber: string) {
    const order = this.orders.find((o) => o.orderNumber === orderNumber);
    return order ? clone(order) : null;
  }

  async createOrder(order: Omit<OrderRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    if (this.orders.some((o) => o.idempotencyKey === order.idempotencyKey || o.orderNumber === order.orderNumber)) {
      throw new ConflictError('order_conflict');
    }
    const record: OrderRecord = { ...clone(order), id: uuid(), createdAt: nowIso(), updatedAt: nowIso() };
    this.orders.push(record);
    return clone(record);
  }

  async updateOrder(id: string, patch: Partial<OrderRecord>) {
    const order = this.orders.find((o) => o.id === id);
    if (!order) throw new Error('order not found');
    Object.assign(order, patch, { updatedAt: nowIso() });
    return clone(order);
  }

  async listOrdersForUser(userId: string) {
    return this.orders.filter((o) => o.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }

  async listOrders(filter: { isTest?: boolean; limit: number }) {
    return this.orders
      .filter((o) => filter.isTest === undefined || o.isTest === filter.isTest)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit)
      .map(clone);
  }

  async deleteOrders(ids: string[]) {
    for (let i = this.orders.length - 1; i >= 0; i--) if (ids.includes(this.orders[i].id)) this.orders.splice(i, 1);
  }

  async deleteEntitlements(ids: string[]) {
    for (let i = this.entitlements.length - 1; i >= 0; i--) if (ids.includes(this.entitlements[i].id)) this.entitlements.splice(i, 1);
  }

  async claimConfirmationEmail(orderId: string, at: string) {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order || order.confirmationSentAt) return false;
    order.confirmationSentAt = at;
    return true;
  }

  // ---- entitlement
  private matchEntitlement(e: EntitlementRecord, f: EntitlementFilter) {
    return (!f.ids || f.ids.includes(e.id))
      && (!f.userId || e.userId === f.userId)
      && (!f.productId || e.productId === f.productId)
      && (!f.source || e.source === f.source)
      && (!f.sourceRef || e.sourceRef === f.sourceRef);
  }

  async listEntitlements(filter: EntitlementFilter) {
    return this.entitlements.filter((e) => this.matchEntitlement(e, filter)).map((e) => ({ ...e }));
  }

  async getEntitlement(id: string) {
    const e = this.entitlements.find((x) => x.id === id);
    return e ? { ...e } : null;
  }

  async insertEntitlements(rows: Parameters<DigitalStore['insertEntitlements']>[0]) {
    let inserted = 0;
    for (const row of rows) {
      const duplicate = row.sourceRef !== null && this.entitlements.some((e) =>
        e.userId === row.userId && e.productId === row.productId && e.source === row.source && e.sourceRef === row.sourceRef);
      if (duplicate) continue;
      this.entitlements.push({
        id: uuid(),
        userId: row.userId,
        productId: row.productId,
        source: row.source,
        sourceRef: row.sourceRef,
        status: 'active',
        startsAt: row.startsAt || nowIso(),
        endsAt: row.endsAt ?? null,
        maxDevices: row.maxDevices ?? 2,
        revokedReason: null,
        statusChangedAt: nowIso(),
        statusChangedBy: row.statusChangedBy || null,
        createdAt: nowIso()
      });
      inserted += 1;
    }
    return inserted;
  }

  async updateEntitlements(ids: string[], patch: { status: EntitlementRecord['status']; revokedReason?: string | null; statusChangedBy: string }) {
    for (const e of this.entitlements) {
      if (!ids.includes(e.id)) continue;
      e.status = patch.status;
      e.revokedReason = patch.revokedReason ?? (patch.status === 'active' ? null : e.revokedReason);
      e.statusChangedBy = patch.statusChangedBy;
      e.statusChangedAt = nowIso();
    }
  }

  // ---- perangkat
  async listDevices(userId: string, includeReleased = false) {
    return this.devices.filter((d) => d.userId === userId && (includeReleased || !d.releasedAt)).map((d) => ({ ...d }));
  }

  async getDevice(id: string) {
    const d = this.devices.find((x) => x.id === id);
    return d ? { ...d } : null;
  }

  async insertDevice(row: { userId: string; fingerprintHash: string; userAgent: string | null; label: string | null }) {
    if (this.devices.some((d) => d.userId === row.userId && d.fingerprintHash === row.fingerprintHash && !d.releasedAt)) {
      throw new ConflictError('device_exists');
    }
    const device: DeviceRecord = { id: uuid(), ...row, firstSeen: nowIso(), lastSeen: nowIso(), releasedAt: null, releasedBy: null };
    this.devices.push(device);
    return { ...device };
  }

  async updateDevice(id: string, patch: Partial<DeviceRecord>) {
    const d = this.devices.find((x) => x.id === id);
    if (d) Object.assign(d, patch);
  }

  // ---- sesi
  async findOpenSession(userId: string, productId: string) {
    const s = this.sessions.find((x) => x.userId === userId && x.productId === productId && !x.endedAt);
    return s ? { ...s } : null;
  }

  async getSession(id: string) {
    const s = this.sessions.find((x) => x.id === id);
    return s ? { ...s } : null;
  }

  async getSessionByTokenHash(tokenHash: string) {
    const s = this.sessions.find((x) => x.tokenHash === tokenHash);
    return s ? { ...s } : null;
  }

  async insertSession(row: NewSession) {
    if (this.sessions.some((s) => s.userId === row.userId && s.productId === row.productId && !s.endedAt)) {
      throw new ConflictError('session_exists');
    }
    const session: SessionRecord = {
      id: uuid(),
      ...row,
      lastEventAt: null,
      endedAt: null,
      endReason: null
    };
    this.sessions.push(session);
    return { ...session };
  }

  async updateSession(id: string, patch: Partial<Pick<SessionRecord, 'lastHeartbeat' | 'lastEventAt'>>) {
    const s = this.sessions.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
  }

  async endSessions(filter: SessionFilter, reason: string) {
    let count = 0;
    for (const s of this.sessions) {
      if (s.endedAt) continue;
      if (filter.ids && !filter.ids.includes(s.id)) continue;
      if (filter.deviceId && s.deviceId !== filter.deviceId) continue;
      if (filter.userId && s.userId !== filter.userId) continue;
      if (filter.productId && s.productId !== filter.productId) continue;
      s.endedAt = nowIso();
      s.endReason = reason;
      count += 1;
    }
    return count;
  }

  async listOpenSessions(filter: { userId?: string }) {
    return this.sessions.filter((s) => !s.endedAt && (!filter.userId || s.userId === filter.userId)).map((s) => ({ ...s }));
  }

  // ---- log & event
  async insertAccessLog(row: Parameters<DigitalStore['insertAccessLog']>[0]) {
    this.logs.push({ ...row, meta: row.meta || {}, id: String(this.logs.length + 1), createdAt: nowIso() });
  }

  async listAccessLogs(userId: string, limit: number) {
    return this.logs.filter((l) => l.userId === userId).slice(-limit).reverse().map((l) => ({ ...l }));
  }

  async insertReadingEvents(rows: ReadingEventInput[]) {
    for (const row of rows) this.events.push({ ...row, id: uuid(), createdAt: nowIso() });
  }

  // ---- progres & catatan
  async getProgress(userId: string, productId: string) {
    const p = this.progress.get(`${userId}:${productId}`);
    return p ? { ...p } : null;
  }

  async listProgress(userId: string) {
    return [...this.progress.values()].filter((p) => p.userId === userId).map((p) => ({ ...p }));
  }

  async upsertProgress(userId: string, productId: string, patch: { position?: number; percent?: number; legalNoticeAcceptedAt?: string }) {
    const key = `${userId}:${productId}`;
    const current = this.progress.get(key) || { userId, productId, position: 0, percent: 0, legalNoticeAcceptedAt: null, updatedAt: nowIso() };
    const next: ProgressRecord = {
      ...current,
      ...(patch.position !== undefined ? { position: patch.position } : {}),
      ...(patch.percent !== undefined ? { percent: patch.percent } : {}),
      ...(patch.legalNoticeAcceptedAt !== undefined ? { legalNoticeAcceptedAt: patch.legalNoticeAcceptedAt } : {}),
      updatedAt: nowIso()
    };
    this.progress.set(key, next);
    return { ...next };
  }

  async listNotes(userId: string, productId: string) {
    return this.notes.filter((n) => n.userId === userId && n.productId === productId)
      .sort((a, b) => a.pageNumber - b.pageNumber || a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }

  async countNotes(userId: string, productId: string) {
    return this.notes.filter((n) => n.userId === userId && n.productId === productId).length;
  }

  async createNote(row: NewNote) {
    const note: NoteRecord = { ...clone(row), id: uuid(), createdAt: nowIso(), updatedAt: nowIso() };
    this.notes.push(note);
    return clone(note);
  }

  async updateNote(id: string, userId: string, patch: Partial<Pick<NoteRecord, 'color' | 'noteText' | 'anchor'>>) {
    const note = this.notes.find((n) => n.id === id && n.userId === userId);
    if (!note) return null;
    Object.assign(note, clone(patch), { updatedAt: nowIso() });
    return clone(note);
  }

  async deleteNote(id: string, userId: string) {
    const index = this.notes.findIndex((n) => n.id === id && n.userId === userId);
    if (index < 0) return false;
    this.notes.splice(index, 1);
    return true;
  }

  // ---- anomali (aturan sama dengan digital_anomaly_candidates di SQL)
  async findAnomalyCandidates(now: Date) {
    const since24h = now.getTime() - 24 * 3600 * 1000;
    const since1h = now.getTime() - 3600 * 1000;
    const candidates: AnomalyCandidate[] = [];
    const recent = this.logs.filter((l) => Date.parse(l.createdAt) > since24h && l.userId);

    const ips = new Map<string, Set<string>>();
    for (const l of recent) {
      if (!l.productId || !l.ip) continue;
      const key = `${l.userId}|${l.productId}`;
      if (!ips.has(key)) ips.set(key, new Set());
      ips.get(key)!.add(l.ip);
    }
    for (const [key, set] of ips) {
      if (set.size > 5) {
        const [userId, productId] = key.split('|');
        candidates.push({ userId, productId, rule: 'ip_spread', details: { distinct_ips: set.size, window_hours: 24 } });
      }
    }

    const denials = new Map<string, number>();
    for (const l of recent) {
      if (l.action === 'denied' && (l.meta as Record<string, unknown> | undefined)?.reason === 'device_limit') {
        denials.set(l.userId!, (denials.get(l.userId!) || 0) + 1);
      }
    }
    for (const [userId, count] of denials) {
      if (count > 3) candidates.push({ userId, productId: null, rule: 'device_limit_denials', details: { denials: count, window_hours: 24 } });
    }

    const windows = new Map<string, Map<number, number>>();
    for (const l of this.logs) {
      if (l.action !== 'page_view' || !l.productId || !l.userId || Date.parse(l.createdAt) <= since1h) continue;
      const key = `${l.userId}|${l.productId}`;
      const bucket = Math.floor(Date.parse(l.createdAt) / 10000);
      if (!windows.has(key)) windows.set(key, new Map());
      const map = windows.get(key)!;
      map.set(bucket, (map.get(bucket) || 0) + 1);
    }
    for (const [key, map] of windows) {
      const fast = [...map.values()].filter((v) => v > 30);
      if (fast.length >= 3) {
        const [userId, productId] = key.split('|');
        candidates.push({ userId, productId, rule: 'page_speed', details: { fast_windows: fast.length, max_pages_per_10s: Math.max(...fast) } });
      }
    }
    return candidates;
  }

  async insertAnomaly(row: NewAnomaly) {
    const open = this.anomalies.some((a) => !a.resolvedAt && a.userId === row.userId && a.productId === row.productId && a.rule === row.rule);
    if (open) return null;
    const record: AnomalyRecord = { ...clone(row), id: uuid(), detectedAt: nowIso(), resolvedAt: null, resolvedBy: null, resolutionNote: null };
    this.anomalies.push(record);
    return clone(record);
  }

  async listAnomalies(filter: { open?: boolean; userId?: string; limit?: number }) {
    return this.anomalies
      .filter((a) => (filter.open === undefined || Boolean(a.resolvedAt) !== filter.open) && (!filter.userId || a.userId === filter.userId))
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
      .slice(0, filter.limit || 200)
      .map(clone);
  }

  async getAnomaly(id: string) {
    const a = this.anomalies.find((x) => x.id === id);
    return a ? clone(a) : null;
  }

  async resolveAnomaly(id: string, resolvedBy: string, note: string | null) {
    const a = this.anomalies.find((x) => x.id === id);
    if (a) Object.assign(a, { resolvedAt: nowIso(), resolvedBy, resolutionNote: note });
  }
}
