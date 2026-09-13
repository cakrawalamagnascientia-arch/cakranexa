import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { hashToken, newSessionToken, signMediaToken, verifyMediaToken } from '../tokens';
import { createSupabaseTokenVerifier } from '../auth';

const SECRET = 'tes-rahasia-media';

describe('token media (playlist/segmen/key)', () => {
  const base = { k: 'seg' as const, p: 'prod-1', s: 'sess-1', u: 'user-1', n: 3, exp: Math.floor(Date.now() / 1000) + 300 };

  it('menerima token yang cocok', () => {
    const token = signMediaToken(SECRET, base);
    expect(verifyMediaToken(SECRET, token, { kind: 'seg', productId: 'prod-1', segment: 3 })?.s).toBe('sess-1');
  });

  it('menolak token dengan tanda tangan diubah', () => {
    const token = signMediaToken(SECRET, base);
    const [body] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ ...base, u: 'user-2' })).toString('base64url')}.${token.split('.')[1]}`;
    expect(verifyMediaToken(SECRET, forged, { kind: 'seg', productId: 'prod-1', segment: 3 })).toBeNull();
    expect(verifyMediaToken('rahasia-lain', token, { kind: 'seg', productId: 'prod-1', segment: 3 })).toBeNull();
    expect(body.length).toBeGreaterThan(10);
  });

  it('menolak jenis, produk, atau segmen berbeda dan token kedaluwarsa', () => {
    const token = signMediaToken(SECRET, base);
    expect(verifyMediaToken(SECRET, token, { kind: 'key', productId: 'prod-1' })).toBeNull();
    expect(verifyMediaToken(SECRET, token, { kind: 'seg', productId: 'prod-2', segment: 3 })).toBeNull();
    expect(verifyMediaToken(SECRET, token, { kind: 'seg', productId: 'prod-1', segment: 4 })).toBeNull();
    const expired = signMediaToken(SECRET, { ...base, exp: Math.floor(Date.now() / 1000) - 1 });
    expect(verifyMediaToken(SECRET, expired, { kind: 'seg', productId: 'prod-1', segment: 3 })).toBeNull();
  });

  it('token sesi acak 32 byte dan hash deterministik', () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
  });
});

describe('verifikasi JWT Supabase (HS256)', () => {
  const jwtSecret = 'rahasia-jwt-uji-minimal-32-karakter!!';
  const supabaseUrl = 'https://proyek-uji.supabase.co';
  const verifier = createSupabaseTokenVerifier({ supabaseUrl, jwtSecret });
  const mint = (claims: Record<string, unknown>, options: { secret?: string; exp?: string } = {}) =>
    new SignJWT({ role: 'authenticated', email: 'pembaca@uji.id', user_metadata: { full_name: 'Pembaca Uji' }, ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('11111111-1111-4111-8111-111111111111')
      .setIssuer(`${supabaseUrl}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime(options.exp || '1h')
      .sign(new TextEncoder().encode(options.secret || jwtSecret));

  it('menerima token pengguna terautentikasi dan membaca nama dari user_metadata', async () => {
    const user = await verifier.verify(await mint({}));
    expect(user).toEqual({ id: '11111111-1111-4111-8111-111111111111', email: 'pembaca@uji.id', name: 'Pembaca Uji' });
  });

  it('menolak token anon, rahasia salah, dan kedaluwarsa', async () => {
    await expect(verifier.verify(await mint({ role: 'anon' }))).rejects.toThrow();
    await expect(verifier.verify(await mint({}, { secret: 'rahasia-yang-berbeda-minimal-32-karakter' }))).rejects.toThrow();
    await expect(verifier.verify(await mint({}, { exp: '-1m' }))).rejects.toThrow();
  });
});
