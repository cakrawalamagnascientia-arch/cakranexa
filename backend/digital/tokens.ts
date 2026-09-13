import crypto from 'crypto';

/** Token sesi baca/dengar: 32 byte acak; server hanya menyimpan hash SHA-256-nya. */
export const newSessionToken = (): string => crypto.randomBytes(32).toString('base64url');

export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

/** Hash ID perangkat dari browser (disimpan sebagai device_fingerprint). */
export const hashFingerprint = (fingerprint: string): string =>
  crypto.createHash('sha256').update(`device:${fingerprint}`).digest('hex');

export type MediaTokenKind = 'playlist' | 'seg' | 'key';

export interface MediaTokenPayload {
  k: MediaTokenKind;
  /** digital_product_id */
  p: string;
  /** access_sessions.id — setiap permintaan tetap dicek ke sesi yang masih hidup. */
  s: string;
  /** user_id */
  u: string;
  /** nomor segmen (hanya k=seg) */
  n?: number;
  /** kedaluwarsa (detik epoch) */
  exp: number;
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');
const sign = (secret: string, data: string) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

/**
 * Token bertanda tangan HMAC untuk playlist/segmen/key HLS. Dipakai di query string karena pemutar HLS
 * native (Safari) tidak bisa mengirim header kustom. Token terikat ke user + produk + sesi.
 */
export const signMediaToken = (secret: string, payload: MediaTokenPayload): string => {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(secret, body)}`;
};

export const verifyMediaToken = (
  secret: string,
  token: string,
  expected: { kind: MediaTokenKind; productId: string; segment?: number },
  nowMs: number = Date.now()
): MediaTokenPayload | null => {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expectedSig = sign(secret, body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload: MediaTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.k !== expected.kind || payload.p !== expected.productId) return null;
  if (expected.kind === 'seg' && payload.n !== expected.segment) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < nowMs) return null;
  return payload;
};
