import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';
import type { AuthUser } from './types';

/** Memverifikasi access token (JWT) Supabase Auth. */
export interface TokenVerifier {
  verify(token: string): Promise<AuthUser>;
}

const userFromPayload = (payload: JWTPayload): AuthUser => {
  const meta = (payload as { user_metadata?: Record<string, unknown> }).user_metadata || {};
  const email = typeof payload.email === 'string' ? payload.email : '';
  const name = String(meta.full_name || meta.name || email || '').trim();
  return { id: String(payload.sub), email, name };
};

/**
 * Verifikasi JWT Supabase: kunci asimetris proyek (JWKS, standar proyek baru) atau rahasia HS256 lama
 * (SUPABASE_JWT_SECRET). Hanya token role "authenticated" yang diterima.
 */
export const createSupabaseTokenVerifier = (options: { supabaseUrl: string; jwtSecret?: string }): TokenVerifier => {
  const base = options.supabaseUrl.replace(/\/+$/, '');
  const issuer = base ? `${base}/auth/v1` : undefined;
  const jwks = issuer ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) : null;
  const secret = options.jwtSecret ? new TextEncoder().encode(options.jwtSecret) : null;

  return {
    async verify(token: string): Promise<AuthUser> {
      const header = decodeProtectedHeader(token);
      let payload: JWTPayload;
      if (header.alg === 'HS256') {
        if (!secret) throw new Error('HS256 token tanpa SUPABASE_JWT_SECRET');
        payload = (await jwtVerify(token, secret, { audience: 'authenticated', issuer })).payload;
      } else {
        if (!jwks) throw new Error('SUPABASE_URL belum dikonfigurasi');
        payload = (await jwtVerify(token, jwks, { audience: 'authenticated', issuer })).payload;
      }
      if (payload.role !== 'authenticated' || typeof payload.sub !== 'string') {
        throw new Error('Token bukan milik pengguna terautentikasi');
      }
      return userFromPayload(payload);
    }
  };
};

const bearerToken = (req: Request): string | null => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
};

/** Middleware: wajib login (Authorization: Bearer <access token Supabase>). */
export const requireUser = (verifier: TokenVerifier, onUser?: (user: AuthUser) => void) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'Silakan masuk terlebih dahulu.', code: 'unauthenticated' });
    try {
      req.digitalUser = await verifier.verify(token);
      onUser?.(req.digitalUser);
      return next();
    } catch {
      return res.status(401).json({ error: 'Sesi login tidak valid atau kedaluwarsa.', code: 'invalid_token' });
    }
  };
