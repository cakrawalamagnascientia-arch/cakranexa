import crypto from 'crypto';
import type { MidtransSettings } from '../context';
import type { MidtransClient } from '../checkout';
import { JAKARTA_OFFSET_MS } from '../time';

/**
 * Midtrans untuk keanggotaan:
 *  - Snap (pembayaran pertama, perpanjangan manual VA/QRIS, selisih upgrade) memakai MidtransClient fase 2.
 *  - Subscriptions API (auto-debit kartu/GoPay, flag ENABLE_AUTODEBIT): POST/GET/PATCH /v1/subscriptions,
 *    /disable, /enable, /cancel. Token kartu = saved_token_id dari Snap (credit_card.save_card); token GoPay dari
 *    GET /snap/v3/users/{user_id}/gopay setelah tokenisasi di Snap. Keduanya perlu aktivasi Midtrans.
 *  - Status transaksi (GET /v2/{order_id|transaction_id}/status) untuk memverifikasi notifikasi dan pencocokan ulang.
 */

export interface RemoteSubscription {
  id: string;
  status: string;
  transactionIds: string[];
  nextExecutionAt: string | null;
  amount: number | null;
}

export interface CreateRemoteSubscription {
  name: string;
  amount: number;
  paymentType: 'credit_card' | 'gopay';
  token: string;
  gopayAccountId?: string | null;
  /** Interval dalam bulan (1 = bulanan, 12 = tahunan). */
  intervalMonths: number;
  maxInterval: number;
  /** Tagihan pertama (akhir periode berjalan). */
  startTime: string;
  retryDays: number;
  customer: { firstName: string; email: string };
  metadata: Record<string, string>;
}

export interface UpdateRemoteSubscription {
  name: string;
  amount: number;
  token: string;
  gopayAccountId?: string | null;
  intervalMonths?: number;
}

export interface MembershipGateway {
  createSubscription(input: CreateRemoteSubscription): Promise<RemoteSubscription>;
  updateSubscription(id: string, input: UpdateRemoteSubscription): Promise<void>;
  disableSubscription(id: string): Promise<void>;
  enableSubscription(id: string): Promise<void>;
  cancelSubscription(id: string): Promise<void>;
  getSubscription(id: string): Promise<RemoteSubscription | null>;
  /** null bila transaksi tidak ditemukan. */
  getTransactionStatus(orderOrTransactionId: string): Promise<Record<string, any> | null>;
  getGopayAccount(userRef: string): Promise<{ accountId: string; token: string } | null>;
}

/** Waktu Midtrans: "YYYY-MM-DD HH:mm:ss +0700". */
export const midtransTime = (iso: string): string => {
  const wall = new Date(Date.parse(iso) + JAKARTA_OFFSET_MS).toISOString();
  return `${wall.slice(0, 10)} ${wall.slice(11, 19)} +0700`;
};

/** "2026-12-31 07:00:00" (WIB, tanpa zona) atau ISO -> ISO UTC; null bila tidak valid. */
export const parseMidtransTime = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const text = String(value).trim();
  const local = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  const ms = local ? Date.parse(`${local[1]}T${local[2]}+07:00`) : Date.parse(text.replace(' +0700', '+07:00').replace(' ', 'T'));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

/** user_id Midtrans: tidak mengekspos ID/email pengguna (hash stabil). */
export const midtransUserRef = (userId: string): string =>
  `cnx_${crypto.createHash('sha256').update(`cakranexa-member:${userId}`).digest('hex').slice(0, 40)}`;

/** Enkripsi token Midtrans (AES-256-GCM): "v1.<iv>.<tag>.<ciphertext>" base64url. */
export const encryptToken = (key: Buffer, plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
};

export const decryptToken = (key: Buffer, stored: string | null): string | null => {
  if (!stored) return null;
  const [version, iv, tag, data] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};

const toRemote = (data: any): RemoteSubscription => ({
  id: String(data?.id || ''),
  status: String(data?.status || ''),
  transactionIds: Array.isArray(data?.transaction_ids) ? data.transaction_ids.map((id: unknown) => String(id)) : [],
  nextExecutionAt: data?.schedule?.next_execution_at ? parseMidtransTime(String(data.schedule.next_execution_at)) : null,
  amount: data?.amount !== undefined && data?.amount !== null ? Number(data.amount) : null
});

/** Mencari account_id + token GoPay dari bentuk respons yang mungkin (dokumentasi Midtrans tidak seragam). */
const parseGopayAccount = (data: any): { accountId: string; token: string } | null => {
  const accountId = data?.account_id || data?.metadata?.account_id || data?.gopay?.account_id;
  const options: any[] = data?.metadata?.payment_options || data?.payment_options || data?.gopay?.payment_options || [];
  const preferred = options.find((o) => o?.name === 'GOPAY_WALLET' && o?.active !== false) || options.find((o) => o?.active !== false && o?.token);
  const token = preferred?.token || data?.token || data?.gopay?.token;
  return accountId && token ? { accountId: String(accountId), token: String(token) } : null;
};

export const createMidtransGateway = (settings: MidtransSettings, fetchImpl: typeof fetch = fetch): MembershipGateway => {
  const apiBase = settings.isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  const appBase = settings.isProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
  const headers = () => ({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Basic ${Buffer.from(`${settings.serverKey}:`).toString('base64')}`
  });
  const call = async (method: string, url: string, body?: unknown, allow404 = false): Promise<any> => {
    const response = await fetchImpl(url, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
    if (allow404 && response.status === 404) return null;
    const text = await response.text();
    if (!response.ok) throw new Error(`Midtrans ${method} ${url.replace(apiBase, '').replace(appBase, '')} HTTP ${response.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  };

  return {
    async createSubscription(input) {
      const data = await call('POST', `${apiBase}/v1/subscriptions`, {
        name: input.name,
        amount: String(Math.round(input.amount)),
        currency: 'IDR',
        payment_type: input.paymentType,
        token: input.token,
        schedule: { interval: input.intervalMonths, interval_unit: 'month', max_interval: input.maxInterval, start_time: midtransTime(input.startTime) },
        retry_schedule: { interval: 1, interval_unit: 'day', max_interval: input.retryDays },
        metadata: input.metadata,
        customer_details: { first_name: input.customer.firstName.slice(0, 50), email: input.customer.email },
        ...(input.paymentType === 'gopay' && input.gopayAccountId ? { gopay: { account_id: input.gopayAccountId } } : {})
      });
      return toRemote(data);
    },
    async updateSubscription(id, input) {
      await call('PATCH', `${apiBase}/v1/subscriptions/${encodeURIComponent(id)}`, {
        name: input.name,
        amount: String(Math.round(input.amount)),
        currency: 'IDR',
        token: input.token,
        ...(input.intervalMonths ? { schedule: { interval: input.intervalMonths } } : {}),
        ...(input.gopayAccountId ? { gopay: { account_id: input.gopayAccountId } } : {})
      });
    },
    async disableSubscription(id) {
      await call('POST', `${apiBase}/v1/subscriptions/${encodeURIComponent(id)}/disable`);
    },
    async enableSubscription(id) {
      await call('POST', `${apiBase}/v1/subscriptions/${encodeURIComponent(id)}/enable`);
    },
    async cancelSubscription(id) {
      await call('POST', `${apiBase}/v1/subscriptions/${encodeURIComponent(id)}/cancel`);
    },
    async getSubscription(id) {
      const data = await call('GET', `${apiBase}/v1/subscriptions/${encodeURIComponent(id)}`, undefined, true);
      return data ? toRemote(data) : null;
    },
    async getTransactionStatus(orderOrTransactionId) {
      const data = await call('GET', `${apiBase}/v2/${encodeURIComponent(orderOrTransactionId)}/status`, undefined, true);
      if (!data || String(data.status_code) === '404') return null;
      return data;
    },
    async getGopayAccount(userRef) {
      const data = await call('GET', `${appBase}/snap/v3/users/${encodeURIComponent(userRef)}/gopay`, undefined, true);
      return data ? parseGopayAccount(data) : null;
    }
  };
};

/** Snap tetap lewat klien fase 2; diekspor ulang agar modul keanggotaan punya satu titik impor. */
export type { MidtransClient };
