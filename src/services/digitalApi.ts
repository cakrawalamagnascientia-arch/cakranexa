import { apiUrl, fetchWithTimeout } from './apiClient';
import { getAccessToken } from './memberSession';
import { getDeviceId } from './deviceId';

/**
 * Klien API produk digital fase 2 (akun pembeli). Setiap permintaan membawa access token Supabase;
 * endpoint reader/player juga membawa X-Session-Token dari sesi baca/dengar.
 * Error dikembalikan sebagai `code` agar UI menampilkan teks terjemahan (digital.json).
 */
export class DigitalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly body: Record<string, any> | null
  ) {
    super(message || code);
  }
}

interface MemberRequestInit extends Omit<RequestInit, 'headers'> {
  sessionToken?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const buildHeaders = async (init: MemberRequestInit, json: boolean): Promise<Record<string, string>> => {
  const token = await getAccessToken();
  return {
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.sessionToken ? { 'X-Session-Token': init.sessionToken } : {}),
    ...(init.headers || {})
  };
};

const toError = async (res: Response): Promise<DigitalApiError> => {
  let body: Record<string, any> | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return new DigitalApiError(res.status, String(body?.code || `http_${res.status}`), String(body?.error || ''), body);
};

/** Permintaan JSON ber-login. */
export const memberRequest = async <T>(path: string, init: MemberRequestInit = {}): Promise<T> => {
  const isJsonBody = typeof init.body === 'string';
  let res: Response;
  try {
    res = await fetchWithTimeout(apiUrl(path), { ...init, headers: await buildHeaders(init, isJsonBody) }, init.timeoutMs ?? 30000);
  } catch {
    throw new DigitalApiError(0, 'network', 'network', null);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
};

/** Permintaan biner ber-login (mis. gambar halaman ber-watermark) — dimuat ke memori, tidak ke cache browser. */
export const memberBlob = async (path: string, init: MemberRequestInit = {}): Promise<Blob> => {
  let res: Response;
  try {
    res = await fetchWithTimeout(apiUrl(path), { ...init, cache: 'no-store', headers: await buildHeaders(init, false) }, init.timeoutMs ?? 30000);
  } catch {
    throw new DigitalApiError(0, 'network', 'network', null);
  }
  if (!res.ok) throw await toError(res);
  return res.blob();
};

export const jsonBody = (value: unknown): string => JSON.stringify(value);

// ---------------------------------------------------------------------------
// Checkout & pesanan digital
// ---------------------------------------------------------------------------
export type DigitalOrderStatus = 'pending' | 'challenge' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';

export interface DigitalOrder {
  orderNumber: string;
  status: DigitalOrderStatus;
  amount: number;
  currency: 'IDR';
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  items: Array<{ productId: string; bookId: string; format: 'ebook' | 'audiobook'; title: string; unitPrice: number }>;
  snapToken: string | null;
  redirectUrl: string | null;
}

export const createDigitalCheckout = (input: { items: string[]; idempotencyKey: string; language: string }) =>
  memberRequest<{ order: DigitalOrder; reused: boolean }>('/api/digital/checkout', {
    method: 'POST',
    body: jsonBody({ items: input.items, idempotency_key: input.idempotencyKey, license_accepted: true, language: input.language })
  });

export const getDigitalOrder = (orderNumber: string) =>
  memberRequest<{ order: DigitalOrder }>(`/api/digital/orders/${encodeURIComponent(orderNumber)}`);

export const listDigitalOrders = () => memberRequest<{ orders: DigitalOrder[] }>('/api/digital/orders');

// ---------------------------------------------------------------------------
// Akses: sesi baca/dengar, perangkat, Pustaka Saya
// ---------------------------------------------------------------------------
export type AccessDenialCode = 'no_entitlement' | 'suspended' | 'expired';

export interface AccessDenial {
  code: AccessDenialCode;
  product: { id: string; format: 'ebook' | 'audiobook'; bookId: string; purchasable: boolean } | null;
}

/**
 * 403 dari requireEntitlement. Arah UI: no_entitlement -> checkout (bila purchasable) atau /membership;
 * expired -> perpanjang keanggotaan atau beli; suspended -> hubungi kami.
 */
export const accessDenialOf = (err: unknown): AccessDenial | null =>
  err instanceof DigitalApiError && err.status === 403 && ['no_entitlement', 'suspended', 'expired'].includes(err.code)
    ? { code: err.code as AccessDenialCode, product: err.body?.product ?? null }
    : null;

export interface DeviceInfo {
  id: string;
  label: string;
  firstSeen: string;
  lastSeen: string;
  isCurrent: boolean;
}

/** Juga menjadi body error 403 device_limit. */
export interface DevicesOverview {
  devices: DeviceInfo[];
  maxDevices: number;
  releaseAvailableAt: string | null;
  cooldownDays: number;
}

export interface AccessSession {
  sessionToken: string;
  session: { id: string; startedAt: string; heartbeatIntervalMs: number; expiresInMs: number };
  entitlement: { id: string; source: string; status: string; startsAt: string; endsAt: string | null };
  product: { id: string; format: 'ebook' | 'audiobook'; bookId: string; pageCount: number | null; durationSeconds: number | null; ready: boolean };
  device: { id: string; label: string };
}

const accessPath = (productId: string, action: 'start' | 'heartbeat' | 'end') =>
  `/api/access/${encodeURIComponent(productId)}/session/${action}`;

/** Error: 403 alasan akses / device_limit (body = DevicesOverview), 409 session_conflict ({ takeover, activeSession }). */
export const startAccessSession = (productId: string, options: { takeover?: boolean } = {}) =>
  memberRequest<AccessSession>(accessPath(productId, 'start'), {
    method: 'POST',
    body: jsonBody({ deviceId: getDeviceId(), takeover: options.takeover === true })
  });

export const sendAccessHeartbeat = (productId: string, sessionToken: string) =>
  memberRequest<{ ok: true; heartbeatIntervalMs: number; expiresInMs: number }>(accessPath(productId, 'heartbeat'), { method: 'POST', sessionToken });

/** Mengakhiri sesi saat reader/player ditutup. `beacon` untuk pagehide: tanpa header, token dikirim di body text/plain. */
export const endAccessSession = (productId: string, sessionToken: string, options: { beacon?: boolean } = {}): void => {
  const url = apiUrl(accessPath(productId, 'end'));
  const payload = JSON.stringify({ sessionToken });
  if (options.beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    if (navigator.sendBeacon(url, new Blob([payload], { type: 'text/plain' }))) return;
  }
  void fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: payload, keepalive: true }).catch(() => undefined);
};

export const listMyDevices = () =>
  memberRequest<DevicesOverview>(`/api/devices?current=${encodeURIComponent(getDeviceId())}`);

export const releaseMyDevice = (deviceId: string) =>
  memberRequest<DevicesOverview>(`/api/devices/${encodeURIComponent(deviceId)}/release`, {
    method: 'POST',
    body: jsonBody({ currentDeviceId: getDeviceId() })
  });

export type LibraryAccessStatus = 'active' | AccessDenialCode;

export interface LibraryItem {
  productId: string;
  format: 'ebook' | 'audiobook';
  bookId: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string;
  pageCount: number | null;
  durationSeconds: number | null;
  /** Aset sudah diproses (reader/player siap dibuka). */
  ready: boolean;
  access: {
    status: LibraryAccessStatus;
    entitlement: { id: string; source: string; status: string; startsAt: string; endsAt: string | null } | null;
  };
  progress: { position: number; percent: number; updatedAt: string } | null;
  acquiredAt: string;
}

export const getLibrary = () =>
  memberRequest<{ items: LibraryItem[]; devices: { count: number; max: number } }>('/api/library');
