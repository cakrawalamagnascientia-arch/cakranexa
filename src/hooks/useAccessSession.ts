import { useCallback, useEffect, useRef, useState } from 'react';
import {
  accessDenialOf,
  DigitalApiError,
  endAccessSession,
  releaseMyDevice,
  sendAccessHeartbeat,
  startAccessSession,
  type AccessDenial,
  type AccessSession,
  type DevicesOverview
} from '../services/digitalApi';

export type AccessState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'login' }
  | { status: 'active'; session: AccessSession }
  | { status: 'denied'; denial: AccessDenial }
  | { status: 'device_limit'; overview: DevicesOverview }
  | { status: 'conflict'; deviceLabel: string | null }
  | { status: 'ended'; reason: string | null }
  | { status: 'error'; code: string };

const SESSION_CODES = new Set(['session_ended', 'session_invalid', 'session_required']);

/** Memetakan error API ke state akses. `error` = bukan urusan sesi/hak akses (mis. jaringan, rate limit). */
export const classifyAccessError = (err: unknown): AccessState => {
  const denial = accessDenialOf(err);
  if (denial) return { status: 'denied', denial };
  if (err instanceof DigitalApiError) {
    if (err.status === 401 && (err.code === 'unauthenticated' || err.code === 'invalid_token')) return { status: 'login' };
    if (err.status === 401 && SESSION_CODES.has(err.code)) {
      return { status: 'ended', reason: typeof err.body?.endReason === 'string' ? err.body.endReason : null };
    }
    if (err.status === 403 && err.code === 'device_limit' && err.body) return { status: 'device_limit', overview: err.body as unknown as DevicesOverview };
    if (err.status === 409 && err.code === 'session_conflict') {
      return { status: 'conflict', deviceLabel: err.body?.activeSession?.deviceLabel ?? null };
    }
    return { status: 'error', code: err.code };
  }
  return { status: 'error', code: 'unknown' };
};

/**
 * Sesi baca/dengar untuk satu produk: mulai, heartbeat, ambil-alih, lepas perangkat, dan akhiri saat
 * komponen ditutup (atau via sendBeacon saat tab ditutup). Dipakai reader (langkah 5) dan player (langkah 6).
 */
export const useAccessSession = (productId: string, enabled: boolean) => {
  const [state, setState] = useState<AccessState>({ status: 'idle' });
  const tokenRef = useRef<string | null>(null);
  // Menandai permintaan start yang sudah usang (StrictMode, ambil-alih beruntun, komponen ditutup).
  const generation = useRef(0);

  const endCurrent = useCallback((beacon = false) => {
    const token = tokenRef.current;
    tokenRef.current = null;
    if (token) endAccessSession(productId, token, { beacon });
  }, [productId]);

  const start = useCallback(async (takeover = false) => {
    const gen = ++generation.current;
    endCurrent();
    setState({ status: 'starting' });
    try {
      const session = await startAccessSession(productId, { takeover });
      if (gen !== generation.current) {
        endAccessSession(productId, session.sessionToken);
        return;
      }
      tokenRef.current = session.sessionToken;
      setState({ status: 'active', session });
    } catch (err) {
      if (gen === generation.current) setState(classifyAccessError(err));
    }
  }, [productId, endCurrent]);

  const takeover = useCallback(() => start(true), [start]);

  /** Untuk error dari permintaan aset (halaman/segmen): true bila menyangkut sesi/hak akses dan sudah ditangani. */
  const reportError = useCallback((err: unknown): boolean => {
    const next = classifyAccessError(err);
    if (next.status === 'error') return false;
    generation.current += 1;
    tokenRef.current = null;
    setState(next);
    return true;
  }, []);

  const releaseDevice = useCallback(async (deviceId: string): Promise<string | null> => {
    try {
      await releaseMyDevice(deviceId);
      await start();
      return null;
    } catch (err) {
      return err instanceof DigitalApiError ? err.code : 'unknown';
    }
  }, [start]);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return undefined;
    }
    void start();
    return () => {
      generation.current += 1;
      endCurrent();
    };
  }, [enabled, start, endCurrent]);

  const activeSession = state.status === 'active' ? state.session : null;
  useEffect(() => {
    if (!activeSession) return undefined;
    const beat = async () => {
      const token = tokenRef.current;
      if (!token) return;
      try {
        await sendAccessHeartbeat(productId, token);
      } catch (err) {
        if (tokenRef.current === token) reportError(err);
      }
    };
    const timer = window.setInterval(() => void beat(), activeSession.session.heartbeatIntervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void beat();
    };
    const onPageHide = () => endCurrent(true);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void start();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [activeSession, productId, reportError, endCurrent, start]);

  return { state, start, takeover, releaseDevice, reportError };
};
